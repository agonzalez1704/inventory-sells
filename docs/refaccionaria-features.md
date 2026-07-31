# Refaccionaria — Backlog de features (pre-fork)

Features a construir/considerar **antes de arrancar el fork** de la refaccionaria
(auto-partes). Capturados tal cual los pasó el negocio, agrupados en:

- **Específicas Refaccionaria** — propias del fork.
- **Re-utilizables** — sirven también a la base (calzado/Fiable) o son
  transversales.

> Prioridad y dificultad abajo son **propuesta inicial** para ordenar juntos.
> Nada está comprometido hasta que confirmemos el orden.

**Dificultad:** S (chico) · M (medio) · L (grande) · XL (muy grande / máquina de estados)
**Prioridad:** P0 (primero, modelo operativo core) · P1 (alto valor / cimiento) · P2 (depende de P1) · P3 (pesado / nice-to-have)

---

## Específicas Refaccionaria

| ID | Feature | Dif. | Prio. | Notas / dependencias |
|----|---------|------|-------|----------------------|
| **E1** | **Todo va por cliente registrado.** Sin ventas anónimas — toda nota liga a un cliente. | M | P0 | Ya existe registro de clientes (customers ph1). Falta forzar cliente obligatorio en POS/nota. |
| **E2** | **Todas las notas salen a crédito, inclusive en mostrador** *(solo refaccionaria, Fiable no)*. El vendedor genera la nota y el cliente pasa **directo a caja a pagar**; la nota-crédito es un **puente de segundos/minutos** para que el vendedor no toque efectivo. **Solo el cajero** cobra dinero físico. | M | P0 | Convertir nota→pagada al instante en caja; rol vendedor no puede cobrar. Depende de E1. Más simple que fiado real (no hay deuda que perseguir). |
| **E3** | **Saldo para clientes = vale digital.** Se identifica por el **# de devolución**; con ese número se consulta el saldo y se puede pagar otra refacción. **Acumulable** entre varias devoluciones. | L | P1 | Ledger de vales anclado a la nota de devolución + consulta de saldo por # + redención en checkout. El saldo vive en la nota, no como cash. Habilita E7 (garantía→saldo). |
| **E4** | **Devolución en efectivo — prohibida por política**; solo excepción extrema cuando no haya otra opción. | S | P2 | Ruta de reembolso en efectivo **gated a gerente/admin**, auditada. Escape hatch raro. La devolución normal va a saldo (E3), no a efectivo. |
| **E5** | **Tiempos de entrega por almacén** *(Importante)*. Almacenes de proveedores tardan hasta 2–3 días en llegar. | M | P1 | Campo lead-time por almacén; mostrarlo en venta/cotización. Apoya en multi-inventarios (ya existe). ↔ R7. |
| **E6** | **Mesa de trabajo con elementos configurables por usuario.** | L | P3 | Dashboard/workspace configurable por usuario. UI-heavy + persistencia. Apoya en roles/permisos flexibles (ya existe). |
| **E7** | **Procesos de garantías.** Vendedor crea orden de garantía, revisa que se cumplan las políticas, anexa imágenes → se **escala** hasta que un encargado/gerente autoriza → cambio de mercancía o devolución en saldo a la orden de garantía. | XL | P3 | Máquina de estados multi-rol (crear → revisar+imágenes → escalar → autorizar → cambio/saldo). Depende de E3 (saldo) e imágenes. |

## Re-utilizables

| ID | Feature | Dif. | Prio. | Notas / dependencias |
|----|---------|------|-------|----------------------|
| **R1** | **Cárdex SKU por producto** — fecha de venta + bitácora de compra por unidad. | L | P2 | Historial por SKU/unidad. Apoya en el ledger `inventory_movements` (ya existe); falta granularidad por unidad + origen de compra. Liga a R5. |
| **R2** | **Detección del cliente por WhatsApp.** | S–M | P1 | Machear número entrante con cliente. El agente ya opera por número; clientes ya tienen teléfono. Mejora con R4. |
| **R3** | **Dar de alta números de cliente por medio del Agente.** | M | P2 | Tool del agente para registrar cliente/teléfono. Depende de clientes + agente (existen). |
| **R4** | **Múltiples teléfonos por cliente.** | M | P1 | Cambio de esquema (tabla `customer_phones`) + UI. Habilita R2/R3. |
| **R5** | **Proveedores.** *(Cuidado: logística de inventarios ↔ proveedores.)* | L | P1 | Entidad proveedor + liga a productos/inventario. **Cimiento** de R6, R7, E5, R1. |
| **R6** | **Notas de crédito DE proveedores** — ver a qué proveedor le debemos. | M | P2 | Cuentas por pagar / notas de crédito del proveedor. Depende de R5. |
| **R7** | **Surtir notas por proveedor** — cuando una nota tiene productos de **diferentes almacenes** con **diferentes tiempos de entrega**. | L | P2 | Fulfillment dividido por proveedor/almacén + lead time. Depende de R5 + E5. |
| **R8** | **Cotizaciones por WhatsApp conversacionales.** No crear la cotización de inmediato; dar seguimiento ("¿Sería algo más?", "¿Le cotizo otra cosa?") y crearla **hasta que el cliente confirme** que es todo. | M | P0 | Extiende el flujo WA de cotización (`crear-cotizacion-whatsapp` ya existe) a multi-turno acumulando ítems hasta confirmación. |

---

## Clusters (para ordenar)

Los features no son independientes; conviene atacar por cimientos:

1. **Identidad de cliente:** R4 → R2 → R3; E1 se apoya en clientes (hecho).
2. **Proveedores / logística de inventario:** **R5** → R6, R7, E5, R1. (R5 es la raíz.)
3. **Crédito / saldo:** E2 (core) · E3 → E4, E7.
4. **WhatsApp:** R8 (quick win sobre lo existente) · R2/R3 (identidad).

## Plan de ejecución — 2 fases

**Estrategia (2026-07-30): primero TODOS los compartidos en Fiable, luego el fork.**
Los Re-utilizables se construyen y estabilizan en la base (Fiable); el fork de
refaccionaria arranca después sobre esa base ya probada.

### Fase A — Compartidos (en Fiable, antes del fork)

Orden por cimiento × dificultad:

1. **R4 — Múltiples teléfonos por cliente** (M) — cimiento de identidad, habilita R2/R3
2. **R2 — Detección del cliente por WhatsApp** (S–M)
3. **R8 — Cotizaciones por WhatsApp conversacionales** (M) — quick win sobre el agente actual
4. **R3 — Dar de alta números de cliente por medio del Agente** (M)
5. **R5 — Proveedores** (L) — cimiento de R6 / R7 / R1
6. **R6 — Notas de crédito de proveedores** (M)
7. **R1 — Cárdex SKU por producto** (L)
8. **R7 — Surtir notas por proveedor** (L) — ⚠ necesita el modelo de *tiempos por almacén* (E5); jalar ese subset aquí o diferir R7 al fork

### Fase B — Fork Refaccionaria (después)

Orden por cimiento × dificultad:

1. **E1 — Todo va por cliente registrado** (M)
2. **E2 — Todas las notas salen a crédito, inclusive en mostrador** (M)
3. **E5 — Tiempos de entrega por almacén** (M) — si no se adelantó en Fase A por R7
4. **E3 — Saldo para clientes (vale digital)** (L)
5. **E4 — Devolución en efectivo (excepción)** (S)
6. **E7 — Procesos de garantías** (XL) — depende de E3
7. **E6 — Mesa de trabajo con elementos configurables por usuario** (L)

## Decisiones (2026-07-30)

- **E2** — solo refaccionaria (Fiable no). Nota-crédito = **puente de segundos**:
  vendedor genera → cliente paga en caja al instante. Objetivo: que el vendedor
  no toque efectivo, solo el cajero.
- **E3** — el saldo es un **vale digital** anclado al # de devolución, redimible
  contra compras y **acumulable** entre devoluciones. Confirma que E7
  (garantía → saldo) depende de E3.
- **E4** — efectivo **prohibido por política**; permitir solo como excepción
  extrema, gated a gerente/admin, auditado.
