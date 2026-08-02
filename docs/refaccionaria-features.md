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
| **R1** | **Cárdex SKU por producto** — fecha de venta + bitácora de compra por unidad. | L | P2 | ✅ **Hecho** (2026-08-02): `/inventario/[id]` lee el ledger como historia — entrada de compra (con folio, proveedor y costo pagado), venta, devolución, ajuste — con saldo corrido calculado hacia atrás desde el stock actual. Costos gated por `costos_ver`. | Historial por SKU/unidad. Apoya en el ledger `inventory_movements` (ya existe); falta granularidad por unidad + origen de compra. Liga a R5. |
| **R2** | ✅ **Hecho**. **Detección del cliente por WhatsApp.** | S–M | P1 | Machear número entrante con cliente. El agente ya opera por número; clientes ya tienen teléfono. Mejora con R4. |
| **R3** | ✅ **Hecho**. **Dar de alta números de cliente por medio del Agente.** | M | P2 | Tool del agente para registrar cliente/teléfono. Depende de clientes + agente (existen). |
| **R4** | ✅ **Hecho**. **Múltiples teléfonos por cliente.** | M | P1 | Cambio de esquema (tabla `customer_phones`) + UI. Habilita R2/R3. |
| **R5** | **Proveedores.** *(Cuidado: logística de inventarios ↔ proveedores.)* | L | P1 | ✅ **Fase 1 hecha** (2026-08-01): tabla `proveedores` + `lead_time_dias`, `products.proveedor_id`, `/proveedores`, selector en el editor de producto. El proveedor cuelga del PRODUCTO (un almacén tiene varios proveedores; misma pieza de otro proveedor = otro SKU) → **E5 resuelto de paso**. Falta Fase 2 = compras/facturas (R6). |
| **R6** | ✅ **Hecho** (2026-08-01). **Compras a proveedor: facturas y cuentas por pagar.** Captura de la factura completa, contado vs crédito (días), forma de pago (transferencia/cheque/efectivo), fecha de ingreso, flag de pronto pago con su descuento, y notas de crédito/devoluciones que descuentan del documento. Total a pagar = documento − devoluciones. | L | P2 | Ampliado el 2026-08-01 con la nota de voz del negocio: no es solo "a quién le debemos". La factura se captura COMPLETA para cuadrar contra el papel; lo que no llegó se baja con nota de crédito y actúa como descuento de esa nota. Pronto pago solo se MARCA (no se calcula). Depende de R5. Base de R1 (cárdex). |
| **R9** | ✅ **Hecho** (2026-08-02). **Garantías y devoluciones a proveedor.** Piezas que le regresamos a un proveedor por garantía, acumuladas como **adeudo del proveedor hacia nosotros** hasta que nos lo rebajen. Llevan monto en pesos. | M | P2 | Requerimiento NUEVO (nota de voz 2026-08-01), no estaba en el backlog original. Clave que lo abarata: *"no necesitamos saber de qué nota viene"* — solo saldo acumulado por proveedor, sin trazabilidad al documento de compra. Depende de R5. |
| **R10** | **Costeo por capas (utilidad real por venta).** El mismo SKU comprado a distintos costos forma capas; al vender, el sistema consume una capa y el costo de esa venta sale de ahí, no del costo único del catálogo. | L | P3 | Surgido el 2026-08-01: *"si me quedan 2 piezas a un costo menor mi utilidad es más alta y debo dar prioridad a sacar esas"*. Es una decisión CONTABLE, no física (las piezas son indistinguibles), así que es automática y no da trabajo al vendedor. **R6 deja las capas listas gratis** (`compra_items` ya guarda costo por entrada); esto solo agrega el consumo al vender. Cambia el cálculo de utilidad en reportes y corte, que hoy usa `products.cost_cents`. Método de consumo (FIFO vs menor-costo-primero) **pendiente de decidir**. |
| **R7** | **Surtir notas por proveedor** — cuando una nota tiene productos de **diferentes almacenes** con **diferentes tiempos de entrega**. | L | P2 | ✅ **Hecho** (2026-08-02): plan de entrega en la cotización (qué va hoy, qué espera a quién, cuándo está completo) + `/surtido` con lo que hay que pedir por proveedor, sumando demanda entre cotizaciones. | Fulfillment dividido por proveedor/almacén + lead time. Depende de R5 + E5. |
| **R8** | ✅ **Hecho**. **Cotizaciones por WhatsApp conversacionales.** No crear la cotización de inmediato; dar seguimiento ("¿Sería algo más?", "¿Le cotizo otra cosa?") y crearla **hasta que el cliente confirme** que es todo. | M | P0 | Extiende el flujo WA de cotización (`crear-cotizacion-whatsapp` ya existe) a multi-turno acumulando ítems hasta confirmación. |

---

## Clusters (para ordenar)

Los features no son independientes; conviene atacar por cimientos:

1. **Identidad de cliente:** R4 → R2 → R3; E1 se apoya en clientes (hecho).
2. **Proveedores / logística de inventario:** **R5** → R6, R7, R9, E5, R1. (R5 es la raíz; Fase 1 hecha.)
3. **Crédito / saldo:** E2 (core) · E3 → E4, E7.
4. **WhatsApp:** R8 (quick win sobre lo existente) · R2/R3 (identidad).

## Plan de ejecución — 2 fases

**Estrategia (2026-07-30): primero TODOS los compartidos en Fiable, luego el fork.**
Los Re-utilizables se construyen y estabilizan en la base (Fiable); el fork de
refaccionaria arranca después sobre esa base ya probada.

### Fase A — Compartidos (en Fiable, antes del fork) — ✅ COMPLETA (2026-08-02)

Orden por cimiento × dificultad:

1. **R4 — Múltiples teléfonos por cliente** (M) — cimiento de identidad, habilita R2/R3
2. **R2 — Detección del cliente por WhatsApp** (S–M)
3. **R8 — Cotizaciones por WhatsApp conversacionales** (M) — quick win sobre el agente actual
4. **R3 — Dar de alta números de cliente por medio del Agente** (M)
5. **R5 — Proveedores** (L) — ✅ Fase 1 hecha; cimiento de R6 / R7 / R9 / R1
6. **R6 — Compras a proveedor: facturas y cuentas por pagar** (L)
6b. **R9 — Garantías y devoluciones a proveedor** (M) — saldo por proveedor, sin trazar la nota origen
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

---

## R6 / R9 — Definición cerrada (2026-08-01)

Sale de la nota de voz del negocio. Escala real: **~5 proveedores** — nada aquí
necesita optimizarse para volumen.

### R6 — Compras a proveedor (facturas + cuentas por pagar)

Cuatro tablas colgando de `proveedores`:

**`compras`** — la factura de papel
- `proveedor_id`, `folio_factura`, `fecha_ingreso`
- `condicion`: `contado` | `credito`; `dias_credito` → `vence_el` (derivada)
- `pronto_pago` bool + `pronto_pago_pct` + `pronto_pago_dias` — **solo se marca,
  no se calcula** ("no es tan necesario cuadrar eso de pronto pago, pero sí hay
  algo que nos pudiera marcar de que este sí tiene y te da este descuento")
- `total_factura_cents` — lo que dice el papel, para cuadrar contra lo capturado
- `estado`: `pendiente` | `pagada` | `cancelada`

**`compra_items`** — `product_id`, `qty`, `costo_unitario_cents`. Al confirmar la
compra generan movimientos `purchase` (+qty) en `inventory_movements`, que es el
ledger que ya mantiene `products.quantity`. *Cada item ES una capa de costo — la
base de R10, gratis.*

**`compra_notas_credito`** — lo que no llegó o se devolvió. **Llevan items
(producto + qty) y BAJAN stock**: la factura se captura completa, así que el
sistema ya sumó esa pieza y hay que descontarla para que el inventario refleje lo
que físicamente entró. También admite nota puramente monetaria (descuento
comercial) sin items.

**`compra_pagos`** — `monto_cents`, `metodo` (`transferencia` | `cheque` |
`efectivo`), `fecha`, `referencia`. Pagos parciales permitidos.

**La cuenta:** `saldo = total_factura − notas_crédito − pagos`.
Cuentas por pagar = suma de saldos por proveedor. Literal del negocio: *"el
documento vale a tanto, tiene una devolución de tanto, y total a pagar tanto"*.

**Cuadre:** al capturar se compara `sum(compra_items)` contra
`total_factura_cents` y se avisa si no coincide — para eso se captura completa.

### R9 — Garantías y devoluciones a proveedor

Una sola tabla, deliberadamente simple:

**`garantias_proveedor`** — `proveedor_id`, descripción de la pieza, `qty`,
`monto_cents`, `fecha`, `estado`: `pendiente` | `aplicada` | `rechazada`.

**Sin FK a la compra**, por decisión explícita del negocio: *"no necesitamos
nosotros saber de qué nota viene ni nada"*. Solo importa el saldo acumulado por
proveedor ("Distribuidora X nos debe $3,400 en garantías") hasta que lo rebajen.
Al rebajarlo se marca `aplicada`, opcionalmente ligada a la nota de crédito donde
se aplicó.

### Decisiones tomadas

- **La pieza que no llegó SÍ baja stock** (la nota de crédito lleva items).
- **Las garantías SÍ llevan monto** en pesos.
- **El costo del catálogo NO se actualiza solo** con la compra: queda manual.
  De ahí salió R10 — el costo real de cada venta debe venir de su capa, no del
  costo único del producto.


---

## Fase A cerrada — 2026-08-02

Los 8 compartidos están en producción. Lo que quedó construido, en orden de
cimiento:

1. **R4** teléfonos múltiples → **R2** detección por WhatsApp → **R3** alta por
   el agente. La identidad del cliente ya no depende de que alguien la teclee.
2. **R8** cotización conversacional: el pedido se acumula y la cotización vive
   y se edita durante toda la charla, con un enlace permanente.
3. **R5** proveedores (con `lead_time_dias`, que resolvió **E5** de paso) →
   **R6** compras, facturas y cuentas por pagar → **R9** garantías → **R7**
   surtido por proveedor.
4. **R1** cárdex: el ledger se lee como la historia de una pieza.

Queda **R10** (costeo por capas) agendado en P3 — `compra_items` ya guarda el
costo de cada entrada, así que las capas están puestas; falta consumirlas al
vender. Método (FIFO vs menor-costo-primero) sin decidir, y conviene revisarlo
con el contador.

**Siguiente: Fase B — el fork de la refaccionaria** (E1, E2, E3, E4, E6, E7).
