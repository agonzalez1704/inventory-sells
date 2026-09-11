#!/usr/bin/env node
// Run one SQL statement against one business's database, through the CLI.
//
// The old path — POSTing to /api/database/advance/rawsql/unrestricted with the
// api_key — died on 2026-09-11 when InsForge disabled that endpoint platform-
// wide. The CLI's `db query` is the supported route, and like migrate.mjs it
// only talks to whatever .insforge/project.json names, so this borrows the
// same swap-and-restore trick.
//
//   node scripts/sql.mjs --negocio=fiable "SELECT count(*) FROM sales"
//   node scripts/sql.mjs --negocio=ruli --file=fix.sql

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, copyFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";

const RAIZ = resolve(import.meta.dirname, "..");
const ACTIVO = resolve(RAIZ, ".insforge/project.json");
const RESPALDO = resolve(RAIZ, ".insforge/project.json.bak");

const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}`));
const valor = (n) => arg(n)?.split("=").slice(1).join("=");

const negocio = valor("negocio");
const cfgs = JSON.parse(readFileSync(resolve(RAIZ, ".insforge/negocios.json"), "utf8"));
const cfg = cfgs[negocio];
if (!cfg || JSON.stringify(cfg).includes("REEMPLAZAR")) {
  console.error(`Usa --negocio=<${Object.keys(cfgs).join("|")}> [--file=x.sql] ["SQL"]`);
  process.exit(1);
}
const sql = valor("file")
  ? readFileSync(resolve(valor("file")), "utf8")
  : process.argv.filter((a) => !a.startsWith("--")).slice(2).join(" ");
if (!sql.trim()) {
  console.error("Falta el SQL (inline o --file=)");
  process.exit(1);
}

const habia = existsSync(ACTIVO);
if (habia) copyFileSync(ACTIVO, RESPALDO);
writeFileSync(ACTIVO, JSON.stringify(cfg, null, 2) + "\n");
try {
  const salida = execFileSync("npx", ["-y", "@insforge/cli", "db", "query", sql, "--json"], {
    cwd: RAIZ,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
  console.log(salida.trim());
} finally {
  if (habia) {
    copyFileSync(RESPALDO, ACTIVO);
    unlinkSync(RESPALDO);
  } else {
    unlinkSync(ACTIVO);
  }
}
