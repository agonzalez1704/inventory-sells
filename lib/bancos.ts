// Pure bank data + CLABE math — no React, importable from server actions and
// client components alike.

export const BANCOS: Record<string, { nombre: string; marca: string; bg: string; fg: string }> = {
  bbva:        { nombre: "BBVA",         marca: "BBVA", bg: "#072146", fg: "#ffffff" },
  banorte:     { nombre: "Banorte",      marca: "Bnte", bg: "#eb0029", fg: "#ffffff" },
  santander:   { nombre: "Santander",    marca: "San",  bg: "#ec0000", fg: "#ffffff" },
  banamex:     { nombre: "Banamex",      marca: "Bmx",  bg: "#056dae", fg: "#ffffff" },
  hsbc:        { nombre: "HSBC",         marca: "HSBC", bg: "#db0011", fg: "#ffffff" },
  scotiabank:  { nombre: "Scotiabank",   marca: "Scot", bg: "#ec111a", fg: "#ffffff" },
  banregio:    { nombre: "Banregio",     marca: "Breg", bg: "#f47920", fg: "#ffffff" },
  azteca:      { nombre: "Banco Azteca", marca: "Azt",  bg: "#00693c", fg: "#ffffff" },
  bancoppel:   { nombre: "BanCoppel",    marca: "Cop",  bg: "#0055b8", fg: "#ffd500" },
  nu:          { nombre: "Nu",           marca: "Nu",   bg: "#820ad1", fg: "#ffffff" },
  klar:        { nombre: "Klar",         marca: "Klar", bg: "#101010", fg: "#ffffff" },
  hey:         { nombre: "Hey Banco",    marca: "Hey",  bg: "#0e1e2e", fg: "#3ddc97" },
  spin:        { nombre: "Spin by OXXO", marca: "Spin", bg: "#e10a17", fg: "#ffffff" },
  mercadopago: { nombre: "Mercado Pago", marca: "MP",   bg: "#009ee3", fg: "#ffffff" },
  stp:         { nombre: "STP",          marca: "STP",  bg: "#20315f", fg: "#ffffff" },
  otro:        { nombre: "Otro",         marca: "$",    bg: "#6b7280", fg: "#ffffff" },
};

export type Cuenta = { id: string; banco: string; alias: string };

// ABM institution codes — the first 3 digits of a CLABE name the bank. An
// unknown code still registers (banco "otro"); the alias carries the name.
export const CLABE_CODIGOS: Record<string, { banco: string; nombre: string }> = {
  "002": { banco: "banamex", nombre: "Banamex" },
  "012": { banco: "bbva", nombre: "BBVA" },
  "014": { banco: "santander", nombre: "Santander" },
  "021": { banco: "hsbc", nombre: "HSBC" },
  "030": { banco: "otro", nombre: "Banco del Bajío" },
  "036": { banco: "otro", nombre: "Inbursa" },
  "044": { banco: "scotiabank", nombre: "Scotiabank" },
  "058": { banco: "banregio", nombre: "Banregio / Hey" },
  "072": { banco: "banorte", nombre: "Banorte" },
  "127": { banco: "azteca", nombre: "Banco Azteca" },
  "137": { banco: "bancoppel", nombre: "BanCoppel" },
  "166": { banco: "otro", nombre: "Banco del Bienestar" },
  "638": { banco: "nu", nombre: "Nu" },
  "646": { banco: "stp", nombre: "STP" },
  "661": { banco: "klar", nombre: "Klar" },
  "722": { banco: "mercadopago", nombre: "Mercado Pago" },
  "728": { banco: "spin", nombre: "Spin by OXXO" },
};

/** 18 digits + the ABM check digit (weights 3,7,1 over the first 17). */
export function validarClabe(clabe: string): boolean {
  if (!/^\d{18}$/.test(clabe)) return false;
  const pesos = [3, 7, 1];
  let suma = 0;
  for (let i = 0; i < 17; i++) suma += (Number(clabe[i]) * pesos[i % 3]) % 10;
  return (10 - (suma % 10)) % 10 === Number(clabe[17]);
}

export function bancoDeClabe(clabe: string): { banco: string; nombre: string } | null {
  const digitos = clabe.replace(/\D/g, "");
  if (digitos.length < 3) return null;
  return CLABE_CODIGOS[digitos.slice(0, 3)] ?? { banco: "otro", nombre: "Banco" };
}

