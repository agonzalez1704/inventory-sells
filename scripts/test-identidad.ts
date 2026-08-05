// Replay the three phases of Meta's BSUID rollout through the payload reader.
// node --experimental-strip-types scripts/test-identidad.ts
//
// Phase two is the one that matters: the same customer, with `wa_id` and `from`
// deleted from the payload. That's the scenario that silently drops messages,
// and it needs nobody's permission to test — just this file.
import assert from "node:assert/strict";
import { identificadores, type EventoIdentidad } from "../lib/wa-identidad.ts";

const BSUID = "MX.1035735295580653";

// Before April 2026: one identifier, in one place.
const faseCero: EventoIdentidad = {
  conversation: { phone_number: "524777552427" },
};

// Since April 2026: BSUID alongside the phone number. Purely additive.
const faseUno: EventoIdentidad = {
  contact: { id: "f5e8994b-8ad0-420c-b239-8913cf76ca3f" },
  conversation: { phone_number: "524777552427", business_scoped_user_id: BSUID },
};

// They adopt a username and fall outside the 30-day window: the phone number is
// ABSENT, not null or empty.
const faseDos: EventoIdentidad = {
  contact: { id: "f5e8994b-8ad0-420c-b239-8913cf76ca3f" },
  conversation: { business_scoped_user_id: BSUID, username: "realsheenanelson" },
};

const casos: [string, EventoIdentidad[], ReturnType<typeof identificadores>][] = [
  [
    "fase cero: solo teléfono",
    [faseCero],
    { contactId: "", bsuid: "", username: "", telefono: "524777552427" },
  ],
  [
    "fase uno: ambos identificadores",
    [faseUno],
    {
      contactId: "f5e8994b-8ad0-420c-b239-8913cf76ca3f",
      bsuid: BSUID,
      username: "",
      telefono: "524777552427",
    },
  ],
  [
    "fase dos: sin wa_id ni from",
    [faseDos],
    {
      contactId: "f5e8994b-8ad0-420c-b239-8913cf76ca3f",
      bsuid: BSUID,
      username: "realsheenanelson",
      telefono: "",
    },
  ],
  [
    // Kapso buffers rapid messages; one sender, and not every event repeats
    // every field. The reader must not lose an identifier to batching.
    "batch: identificadores repartidos entre eventos",
    [{ conversation: { business_scoped_user_id: BSUID } }, faseCero],
    { contactId: "", bsuid: BSUID, username: "", telefono: "524777552427" },
  ],
  [
    // A parent BSUID stands in when only it arrives — same format, extra ENT.
    "BSUID padre (ENT)",
    [{ conversation: { parent_business_scoped_user_id: "MX.ENT.118157992128868" } }],
    { contactId: "", bsuid: "MX.ENT.118157992128868", username: "", telefono: "" },
  ],
  [
    // Garbage in the BSUID slot must be dropped, never keyed on: it would
    // attach this conversation to a key nobody else will ever produce.
    "BSUID malformado se descarta",
    [{ conversation: { business_scoped_user_id: "sin-punto", phone_number: "524777552427" } }],
    { contactId: "", bsuid: "", username: "", telefono: "524777552427" },
  ],
  [
    "payload vacío no identifica a nadie",
    [{}],
    { contactId: "", bsuid: "", username: "", telefono: "" },
  ],
];

let fallos = 0;
for (const [nombre, eventos, esperado] of casos) {
  try {
    assert.deepEqual(identificadores(eventos), esperado);
    console.log(`✓ ${nombre}`);
  } catch (err) {
    fallos++;
    console.error(`✗ ${nombre}\n  ${(err as Error).message}`);
  }
}

// Phase one and phase two are the same person. If the reader can't see that,
// their history splits the day they adopt a username.
const uno = identificadores([faseUno]);
const dos = identificadores([faseDos]);
try {
  assert.equal(uno.bsuid, dos.bsuid);
  assert.equal(uno.contactId, dos.contactId);
  assert.notEqual(dos.bsuid, "");
  console.log("✓ fase uno y fase dos son la misma persona");
} catch (err) {
  fallos++;
  console.error(`✗ fase uno y fase dos son la misma persona\n  ${(err as Error).message}`);
}

console.log(fallos === 0 ? "\nTodo en orden." : `\n${fallos} fallo(s).`);
process.exit(fallos === 0 ? 0 : 1);
