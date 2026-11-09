#!/usr/bin/env node
// Apply migrations to one business's database, or check that both are level.
//
// One repo serves two businesses from two SEPARATE databases. Ruli is on Supabase
// and is reached with psql through SUPABASE_DB_URL in .env.local. Fiable is on
// InsForge, whose CLI only ever talks to whichever project `.insforge/project.json` names. So
// this swaps that file for the duration of a command and always puts it back —
// including when the command fails.
//
// The real risk of this setup is the two databases drifting apart: a migration
// lands on one and not the other, and nobody finds out until production throws.
// Hence `--check`, which is the command to run before any deploy.
//
//   node scripts/migrate.mjs --negocio=fiable      apply pending migrations
//   node scripts/migrate.mjs --negocio=ruli --dry  list them without applying
//   node scripts/migrate.mjs --check               compare production databases
//
// An entry may carry "check": false to stay out of --check. That is for
// throwaway environments (a Kapso sandbox, a demo): they get migrated on
// demand, but holding a scratch database level with production would fail the
// pre-deploy gate over something nobody ships.
//
// Credentials live in .insforge/negocios.json, which is gitignored along with
// the rest of .insforge:
//   { "fiable": { …project.json… }, "ruli": { …project.json… } }

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, copyFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";

const RAIZ = resolve(import.meta.dirname, "..");
const ACTIVO = resolve(RAIZ, ".insforge/project.json");
const RESPALDO = resolve(RAIZ, ".insforge/project.json.bak");
const NEGOCIOS = resolve(RAIZ, ".insforge/negocios.json");

// Ruli moved to Supabase on 2026-11-09. Its entry in negocios.json still points
// at the old InsForge project, which is why this has to be decided first.
const EN_SUPABASE = new Set(["ruli"]);

const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}`));
const valor = (n) => arg(n)?.split("=")[1];

function negocios() {
  if (!existsSync(NEGOCIOS)) {
    console.error(
      `Falta ${NEGOCIOS}\n` +
        `Debe verse así (las credenciales salen del project.json de cada proyecto):\n` +
        `  { "fiable": { … }, "ruli": { … } }`,
    );
    process.exit(1);
  }
  return JSON.parse(readFileSync(NEGOCIOS, "utf8"));
}

/** Point the CLI at one business, run fn, and restore the original link. */
function apuntandoA(cfg, fn) {
  const habia = existsSync(ACTIVO);
  if (habia) copyFileSync(ACTIVO, RESPALDO);
  writeFileSync(ACTIVO, JSON.stringify(cfg, null, 2) + "\n");
  try {
    return fn();
  } finally {
    // Restoring in `finally` is the point: a failed migration must never leave
    // the repo pointing at the wrong database.
    if (habia) {
      copyFileSync(RESPALDO, ACTIVO);
      unlinkSync(RESPALDO);
    } else {
      unlinkSync(ACTIVO);
    }
  }
}

const cli = (args) =>
  execFileSync("npx", ["@insforge/cli", ...args], {
    cwd: RAIZ,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

function urlSupabase() {
  const linea = readFileSync(resolve(RAIZ, ".env.local"), "utf8")
    .split("\n")
    .find((l) => l.startsWith("SUPABASE_DB_URL="));
  if (!linea) {
    console.error("Falta SUPABASE_DB_URL en .env.local");
    process.exit(1);
  }
  return linea.slice(linea.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
}

function psql(args) {
  try {
    return execFileSync("psql", [urlSupabase(), "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", ...args], {
      cwd: RAIZ,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (e) {
    // Only stderr: the thrown message carries the command line, password included.
    console.error(String(e.stderr));
    process.exit(1);
  }
}

const aplicadasSupabase = () =>
  new Set(psql(["-c", "select version || '_' || name from system.custom_migrations"]).split("\n").filter(Boolean));

function migrarSupabase(seco) {
  const remoto = aplicadasSupabase();
  const pendientes = locales().filter((m) => !remoto.has(m));
  if (!pendientes.length) return console.log("Sin migraciones pendientes.");
  for (const m of pendientes) {
    if (seco) {
      console.log(`pendiente: ${m}`);
      continue;
    }
    const [, version, nombre] = m.match(/^(\d{14})_([a-z0-9-]+)$/);
    psql([
      "--single-transaction",
      "-f", `migrations/${m}.sql`,
      "-c", `insert into system.custom_migrations (version, name) values ('${version}', '${nombre}')`,
    ]);
    console.log(`✓ ${m}`);
  }
}

/** Migrations the remote database reports as applied. */
function aplicadas(nombre, cfg) {
  if (EN_SUPABASE.has(nombre)) return aplicadasSupabase();
  const salida = apuntandoA(cfg, () => cli(["db", "migrations", "list"]));
  return new Set(salida.match(/\d{14}[_a-z0-9-]*/g) ?? []);
}

function locales() {
  const salida = execFileSync("ls", ["migrations"], { cwd: RAIZ, encoding: "utf8" });
  return salida.split("\n").filter((f) => f.endsWith(".sql")).map((f) => f.replace(/\.sql$/, ""));
}

function check(cfgs) {
  const local = locales();
  const produccion = Object.entries(cfgs).filter(([, cfg]) => cfg.check !== false);
  const fuera = Object.entries(cfgs).filter(([, cfg]) => cfg.check === false);
  const estado = produccion.map(([nombre, cfg]) => {
    const remoto = aplicadas(nombre, cfg);
    const faltan = local.filter((m) => ![...remoto].some((r) => m.startsWith(r.slice(0, 14))));
    return { nombre, aplicadas: remoto.size, faltan };
  });

  console.log(`Migraciones locales: ${local.length}\n`);
  for (const [nombre] of fuera) {
    console.log(`·  ${nombre}: fuera del check ("check": false)`);
  }
  for (const e of estado) {
    const ok = e.faltan.length === 0;
    console.log(`${ok ? "✓" : "✗"} ${e.nombre}: ${e.aplicadas} aplicadas${ok ? "" : `, faltan ${e.faltan.length}`}`);
    for (const m of e.faltan.slice(0, 5)) console.log(`    pendiente: ${m}`);
    if (e.faltan.length > 5) console.log(`    … y ${e.faltan.length - 5} más`);
  }

  const desnivel = new Set(estado.map((e) => e.aplicadas)).size > 1;
  if (desnivel) {
    console.log(
      `\n⚠  Las bases NO están parejas. Un fix aplicado en una y no en la otra` +
        ` se descubre como un error en producción — nivélalas antes de desplegar.`,
    );
    process.exit(1);
  }
  console.log("\nAmbas bases están parejas.");
}

const cfgs = negocios();

if (arg("check")) {
  check(cfgs);
} else {
  const negocio = valor("negocio");
  const cfg = cfgs[negocio];
  if (cfg && JSON.stringify(cfg).includes("REEMPLAZAR")) {
    console.error(
      `"${negocio}" en .insforge/negocios.json todavía tiene valores REEMPLAZAR.\n` +
        `Crea el proyecto en el dashboard de InsForge y pega su project.json ahí.`,
    );
    process.exit(1);
  }
  if (!cfg) {
    console.error(`Usa --negocio=<${Object.keys(cfgs).join("|")}> o --check`);
    process.exit(1);
  }
  const seco = !!arg("dry");
  if (EN_SUPABASE.has(negocio)) {
    console.log(`${seco ? "Revisando" : "Aplicando a"} ${negocio} (Supabase)…\n`);
    migrarSupabase(seco);
  } else {
    console.log(`${seco ? "Revisando" : "Aplicando a"} ${negocio} (${cfg.project_name})…\n`);
    const salida = apuntandoA(cfg, () =>
      cli(["db", "migrations", seco ? "list" : "up", ...(seco ? [] : ["--all"])]),
    );
    console.log(salida.trim());
  }
}
