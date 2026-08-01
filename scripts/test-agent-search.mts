import assert from "node:assert/strict";
import { searchProducts } from "../lib/search.ts";

const catalogo = [
  {
    sku: "MOT-E22I-ORG",
    name: "E22 / E22 I",
    brand: "MOTOROLA",
    category: "Pantallas",
  },
];

const resultados = searchProducts(
  catalogo,
  "buenas tardes, tienes display de moto e22i",
);

assert.deepEqual(
  resultados.map((producto) => producto.sku),
  ["MOT-E22I-ORG"],
  "una pregunta natural por display Moto E22i debe encontrar 'E22 / E22 I' de Motorola",
);

console.log("✓ búsqueda del agente: display Moto E22i");
