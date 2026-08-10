# Whitelabel + deploy de dos negocios

**Decisión (2026-08-03): un repo, dos bases de datos, dos deploys.**
Cada negocio tiene su base InsForge limpia (sin `tenant_id`, sin filtros por
inquilino, sin migrar lo existente) y comparte el código, que es donde vive casi
todo el trabajo: proveedores, compras, FIFO, corte de caja, agente de WhatsApp.

---

## Punto de partida: qué está atado a la marca hoy

`Fiable` aparece en 12 archivos. No todos pesan lo mismo:

| Archivo | Qué es | Momento |
|---|---|---|
| `components/logo.tsx` | wordmark SVG inline con gradiente propio | build |
| `app/globals.css` | `--brand*` (oro → ámbar) | build |
| `app/manifest.ts` | PWA: name, short_name, description | build |
| `app/layout.tsx` | `<title>`, descripción, `appleWebApp.title` | build |
| `public/sw.js` | título por defecto de las notificaciones push | build (estático) |
| `modules/agent/inventory-agent.ts` | el prompt dice "tienda … (Fiable)" | runtime |
| `modules/notifications/actions.ts`, `InventoryPdf.tsx`, `BarVertical.tsx`, `sin-acceso/page.tsx`, `api/[transport]/route.ts` | textos sueltos | mixto |
| `lib/tienda-info.ts` | dirección, horario, garantía — **datos del negocio**, no marca | build hoy |
| ~~`app/tienda/layout.tsx`, `app/cotizacion/page.tsx`~~ | ~~ya usan **otra** marca: "Lead Displays"~~ → resuelto: `MARCA.tienda` | build |

Dos cosas que esto revela:

1. **Ya hay dos marcas conviviendo**: el back-office es "Fiable" y el storefront
   público es "Lead Displays". El whitelabel no parte de cero. Eso ya está
   modelado: `MARCA.nombre` es el nombre interno y `MARCA.tienda.nombre` el
   público, porque el cliente nunca ha oído el primero. Cualquier texto que lea
   un cliente toma el segundo.
2. **`config_negocio` ya existe en la BD** (el agente lee de ahí la info del
   negocio). Como cada negocio tendrá su propia base, esa tabla es el lugar
   natural para todo lo que no necesite estar en el build.

---

## Diseño: tres clases de personalización

No todo va al mismo lugar. La regla es **cuándo se necesita el dato**.

### A. Build-time → variables de entorno

Lo que Next necesita antes de que exista una sesión o una consulta: el
`manifest.ts`, la `metadata` del layout y el CSS se generan sin BD. Meterles una
query los volvería dinámicos y más lentos, a cambio de nada.

```
NEXT_PUBLIC_MARCA=fiable | ruli
```

Un único módulo `lib/marca.ts` lee esa variable y expone todo lo demás:

```ts
export const MARCA = {
  nombre: "Fiable",
  descripcion: "Inventario, ventas y notas de crédito",
  // HSL, se inyectan como CSS vars --brand*
  brand: { base: "36 95% 62%", strong: "49 100% 50%", soft: "45 100% 95%", fg: "30 65% 24%" },
  logo: "fiable",          // qué componente de logo montar
} as const;
```

Todo lo hardcodeado pasa a leer de ahí. Los colores se inyectan como un bloque
`<style>` en el layout raíz (junto al script anti-FOUC que ya existe), de modo
que `globals.css` conserva los valores por defecto y la marca los pisa.

**`public/sw.js` es el caso especial**: es un archivo estático, no pasa por el
build de Next, así que no puede leer env. Dos salidas, ambas baratas:
convertirlo en route handler (`app/sw.js/route.ts`) que lo sirva con el nombre
inyectado, o —más simple— dejar el título por defecto neutro ("Notificación") ya
que en la práctica el título real siempre viene en el payload del push.

### B. Runtime desde la BD → `config_negocio`

Lo que cambia sin redeploy y ya vive en la base separada de cada negocio:

- Info del negocio para el agente (horarios, envíos, pagos) — **ya funciona así**
- Teléfonos de asesores — **ya funciona así**
- Nombre comercial para el prompt del agente — *falta*, hoy dice "Fiable" fijo
- `lib/tienda-info.ts` (dirección, horario, garantía) — *hoy es código*; mover a
  esta tabla lo vuelve editable sin deploy, que es donde debe estar: son
  promesas al cliente y cambian sin avisar

### C. Comportamiento por negocio → flag

```
NEGOCIO=fiable | refaccionaria
```

Enciende lo que ya definimos como distinto, nada más:

- **E1** cliente obligatorio en toda nota
- **E2** todas las notas salen a crédito; solo el cajero cobra

Son condicionales puntuales en el POS, no una arquitectura. Si la lista crece
mucho, es la señal de que los negocios divergieron y toca reconsiderar el repo
aparte.

---

## Plan de ejecución

### Fase 1 — Whitelabel (sin tocar deploy, todo verificable en local)

1. `lib/marca.ts` con las dos marcas y el default `fiable`.
2. `components/logo.tsx` → `Logo` elige entre `LogoFiable` y `LogoRefaccionaria`
   según `MARCA.logo`. El SVG actual se conserva tal cual para Fiable.
3. Inyectar `--brand*` desde `MARCA` en el layout raíz.
4. `manifest.ts` y la `metadata` del layout leen de `MARCA`.
5. Barrer los textos sueltos (notificaciones, PDF de inventario, gráficas,
   sin-acceso, MCP) para que usen `MARCA.nombre`.
6. `sw.js`: título por defecto neutro.
7. Nombre comercial del agente → `config_negocio`.

**Verificación:** levantar con `NEXT_PUBLIC_MARCA=ruli` y comprobar
título, manifest, logo y colores; después con `fiable` y comprobar que **nada**
cambió respecto de hoy.

### Fase 2 — Segunda base

1. Crear el proyecto InsForge de la refaccionaria **desde el dashboard** (el CLI
   tiene `projects list/get/update/delete`, pero **no** `create`).
2. Script `pnpm migrate --negocio=<x>`: apunta `.insforge/project.json` a la base
   elegida, corre `db migrations up --all` y lo deja como estaba.
   Debe **verificar que ambas bases quedaron en la misma migración** — dos bases
   divergiendo en silencio es el riesgo real de este esquema.
3. Aplicar todas las migraciones a la base nueva y sembrar lo mínimo:
   inventario inicial, roles/permisos, el cliente "Mostrador".

### Fase 3 — Deploy

1. Segundo proyecto en Vercel, **mismo repo, misma rama**.
2. Variables por deploy:

   | Variable | fiable | refaccionaria |
   |---|---|---|
   | `NEXT_PUBLIC_MARCA` | `fiable` | `ruli` (`refaccionaria` sigue funcionando como alias) |
   | `NEGOCIO` | fiable | refaccionaria |
   | `NEXT_PUBLIC_INSFORGE_URL` | base A | base B |
   | `INSFORGE_API_KEY` / `ANON_KEY` | A | B |
   | Clerk (pk/sk) | instancia A | **instancia B** |
   | `NEXT_PUBLIC_APP_URL` | dominio A | dominio B |
   | Kapso (número/webhook secret) | A | B |
   | `OPENAI_API_KEY` | puede compartirse | |

3. **Clerk necesita instancia propia**: los usuarios de un negocio no deben
   existir en el otro, y los permisos viven ligados al `userId`.
4. **WhatsApp**: número y webhook por negocio; cada deploy recibe el suyo.
5. Dominio por negocio.

---

## Riesgos, con su mitigación

| Riesgo | Por qué duele | Mitigación |
|---|---|---|
| Las bases divergen en migraciones | un fix aplica en una y en la otra no; se descubre con un error en producción | el script compara y avisa; revisar antes de cada deploy |
| Secretos duplicados mal copiados | apuntar el deploy nuevo a la base vieja = mezclar dinero de dos negocios | verificar con `/api/health` que reporte a qué base apunta |
| El flag se ramifica sin control | señal de que ya son dos productos | si `NEGOCIO` aparece en más de ~10 lugares, reconsiderar |
| El seed de la base nueva queda incompleto | POS no arranca sin Mostrador/roles | checklist de siembra en Fase 2 |

---

## Esfuerzo estimado

- **Fase 1 (whitelabel):** medio día — es sobre todo mover cadenas a un módulo.
- **Fase 2 (segunda base):** unas horas, la mayoría en el script de migraciones.
- **Fase 3 (deploy):** unas horas, casi todo configuración externa (Clerk, Kapso,
  dominio) que requiere accesos que el equipo tiene, no yo.

Después de esto, **E1 y E2 se escriben una sola vez**.

---

## Entorno desechable (sandbox de Kapso, demos)

`.insforge/negocios.json` ya tiene una entrada `sandbox` con los campos en
`REEMPLAZAR`. Pega ahí el `project.json` del proyecto InsForge que crees en el
dashboard y corre:

```bash
node scripts/migrate.mjs --negocio=sandbox
```

Mientras queden `REEMPLAZAR`, el script se detiene y lo dice en vez de fallar
con un error de autenticación.

La entrada lleva `"check": false`, así que `--check` la ignora. Eso es a
propósito: `--check` es la reja antes de desplegar, y exigir que una base
desechable esté al día con producción la haría fallar por algo que nadie
publica.

**El sandbox necesita su propia base.** Apuntarlo a la de producción no es
"solo leer": el agente de WhatsApp **escribe** — crea cotizaciones
(`agregar_a_cotizacion_whatsapp`) y da de alta clientes en `customers` — y cada
mensaje de prueba entra a la bandeja que ven los vendedores.

Además de las variables de Kapso (`KAPSO_API_KEY`, `KAPSO_PHONE_NUMBER_ID`,
`KAPSO_WEBHOOK_SECRET`, y `KAPSO_API_BASE_URL` si el sandbox tiene otro host):

- `NEXT_PUBLIC_APP_URL` al dominio del sandbox, o los links de cotización que
  manda el bot apuntan a producción.
- `NEXT_PUBLIC_MARCA` con un valor válido (`fiable` | `ruli`); uno desconocido
  ahora truena el build.
- El webhook se registra **del lado de Kapso**, apuntando a
  `<sandbox>/api/webhooks/kapso`. El `secret_key` lo genera quien llama a
  `crearWebhookMensajes()` y tiene que ser idéntico a `KAPSO_WEBHOOK_SECRET`, o
  todo entra con 403.
- Cargarle catálogo, o el agente contesta que no tiene nada.
