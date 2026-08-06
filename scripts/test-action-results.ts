// Every action that returns ActionResult must be unwrapped at its call sites.
// node --experimental-strip-types scripts/test-action-results.ts
//
// This exists because the compiler cannot catch the mistake. An action that
// throws is caught by the caller's try/catch; the same action converted to
// return { ok: false } type-checks identically when the caller ignores the
// result — and then the catch never runs, so a failed save reports success.
// That is worse than the redacted error the conversion set out to fix.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function archivos(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === ".next" || e.startsWith(".")) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) archivos(p, out);
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

const todos = [...archivos("modules"), ...archivos("app"), ...archivos("lib")];

// Actions declared as returning ActionResult<…>.
const acciones = new Set<string>();
for (const f of todos) {
  const src = readFileSync(f, "utf8");
  for (const m of src.matchAll(
    /export async function (\w+)\s*\([^)]*\)\s*:\s*Promise<ActionResult/gs,
  )) {
    acciones.add(m[1]);
  }
  // Multi-line signatures: the regex above misses those with newlines in args.
  for (const m of src.matchAll(
    /export async function (\w+)\s*\(([\s\S]{0,400}?)\)\s*:\s*Promise<ActionResult/g,
  )) {
    acciones.add(m[1]);
  }
}

console.log(`acciones que devuelven ActionResult: ${acciones.size}`);

const fallos: string[] = [];
for (const f of todos) {
  if (f.endsWith("actions.ts") || f.includes("errors.ts")) continue; // definitions
  const src = readFileSync(f, "utf8");
  // Split into statements rather than lines: a call is routinely spread across
  // several lines (a ternary, a long argument list), and the `const r =` that
  // consumes it sits on a different one. Judging line by line reported those as
  // ignored — the first run flagged two that were perfectly fine.
  let linea = 1;
  for (const stmt of src.split(";")) {
    const inicio = linea;
    linea += (stmt.match(/\n/g) ?? []).length;
    const plano = stmt.replace(/\s+/g, " ").trim();
    if (/^\s*(import|export type)/.test(plano)) continue;
    if (!plano.includes("await")) continue;

    for (const a of acciones) {
      // Only a DIRECT await counts. Passing the action as a thunk —
      // run(() => borrarGarantia(id)) — is a legitimate pattern where the
      // helper unwraps, and flagging it produced false positives.
      const llamada = new RegExp(`await\\s+${a}\\s*\\(`);
      if (!llamada.test(plano)) continue;
      // Consumed = unwrapped, assigned, or returned to someone who will.
      const consumido =
        plano.includes("unwrap(") || /=\s*(await|rol\s*\?|\w+\s*\?)/.test(plano) || /^return /.test(plano);
      if (!consumido) fallos.push(`${f}:${inicio}  ${plano.slice(0, 110)}`);
    }
  }
}

if (fallos.length) {
  console.error(`\n✗ ${fallos.length} llamada(s) que ignoran el resultado:\n`);
  for (const f of fallos) console.error("  " + f);
  console.error(
    "\nEnvuélvelas en unwrap(...) o revisa r.ok — si no, un fallo se reporta como éxito.",
  );
  process.exit(1);
}

console.log("✓ toda llamada a una acción con ActionResult consume el resultado");
