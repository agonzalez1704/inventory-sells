# Terminales de pago con tarjeta — plan para replicar

Construido en inventory-pos (Fiable y Refaccionaria Ruli) el 2026-10-10,
commit `6b1f296`. Este documento es el plan para llevarlo a otro proyecto
(iFound) adaptado a su stack y a su diseño.

Maqueta aprobada: https://claude.ai/artifact/DHFHZU2Fxr4RkCQC4EuXoQ
(3 pantallas: Configuración, Cobro en el POS, Corte).

## El problema

El corte sabía cuánto entró con tarjeta, pero no qué terminal lo cobró,
cuánto se queda cada una de comisión ni cuánto debe llegar a cada cuenta
bancaria — el número para cotejar contra el banco.

## Modelo de datos

```sql
CREATE TABLE terminales_pago (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre       text NOT NULL,              -- "Clip mostrador", "Point Panorama"
  procesador   text NOT NULL DEFAULT 'otro', -- clip | mercadopago | bbva | banorte | santander | getnet | otro (solo para el ícono)
  comision_pct numeric(6,3) NOT NULL DEFAULT 0,  -- 3.6
  iva_comision boolean NOT NULL DEFAULT true,    -- en México los procesadores cobran IVA sobre la comisión
  cuenta_id    uuid REFERENCES cuentas_negocio(id), -- la cuenta del negocio a la que deposita
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- En la venta (y en el apartado/adelanto, si el proyecto los tiene):
ALTER TABLE sales ADD COLUMN terminal_id uuid REFERENCES terminales_pago(id) ON DELETE SET NULL;
ALTER TABLE sales ADD COLUMN terminal_comision_pct numeric(7,4); -- comisión EFECTIVA congelada (3.6 + IVA = 4.176)
```

Decisiones que importan:

1. **La terminal se registra DESPUÉS del cobro**, con una acción aparte
   (`asignarTerminalVenta(saleId, terminalId)`), igual que la cuenta de una
   transferencia viaja en su comprobante. No se toca la función que registra
   la venta, y si falla guardar la terminal la venta NO se deshace (solo un
   aviso).
2. **La comisión se congela en la venta** (`terminal_comision_pct`, IVA
   incluido). Si mañana cambias la tarifa, el corte del mes pasado no cambia.
3. **"Sin terminal"**: todo cobro con tarjeta sin terminal registrada cae en
   ese renglón, así los renglones siempre suman la línea "Tarjeta" del corte.
4. Requiere tener **cuentas del negocio** (banco + alias). Si el proyecto no
   las tiene, hacerlas primero: la terminal deposita en una de ellas.

## Cálculo (puro, con prueba)

```ts
comisionEfectiva = comision_pct * (iva_comision ? 1.16 : 1)   // redondeo a 4 decimales
comisionCents    = round(montoCents * comisionEfectiva / 100)
// 3.6% + IVA sobre $1,250.00 = $52.20 · 2.4% + IVA sobre $1,000.00 = $27.84
```

Referencia: `lib/terminales.ts` y la prueba en `scripts/check-descuento.ts`.

## Pantallas

1. **Configuración → "Terminales de pago con tarjeta"** (solo admin):
   lista (ícono del procesador, nombre, "3.6% + IVA · deposita en BBVA ••4821",
   editar, quitar) y formulario: nombre, procesador en mosaicos, comisión %,
   casilla "Cobra IVA sobre la comisión", cuenta a la que deposita, y un
   ejemplo vivo: "un cobro de $1,000.00 deja $972.16 en BBVA ••4821".
   Quitar = archivar (`is_active = false`); los cobros pasados conservan su
   terminal.
   Referencia: `modules/config/TerminalesConfig.tsx`, `modules/config/terminales.ts`.
2. **Cobro en el POS**: al elegir Tarjeta (o Dividir con una parte en
   tarjeta) aparece "¿En qué terminal se pasó?" con las terminales en
   tarjetas. Viene preseleccionada la última que usó ese equipo
   (localStorage) o la única que exista. Sin terminal elegida (habiendo
   varias) no deja cobrar. Quien ve costos ve "Comisión −$52.20 · Llega a
   BBVA ••4821 $1,197.80".
   Referencia: `modules/sales/PaymentSheet.tsx` (bloque `pideTerminal`) y
   `modules/sales/SalesScreen.tsx` (`asignarTerminalVenta` tras el cobro).
3. **Corte**:
   - "Tarjeta por terminal": por terminal, cobros · cobrado · comisión ·
     neto, más "Sin terminal" (resaltado) y el total de comisiones.
   - "Debe llegar a cada cuenta": por cuenta, tarjeta neta + transferencias
     del periodo, con el desglose ("Clip $4,072.52 · transferencias
     $1,860.00").
   Referencia: `app/(app)/caja/page.tsx` (bloque "Card money per terminal")
   y `modules/caja/CajaView.tsx` (secciones con esos títulos).

## Orden recomendado para otro proyecto

1. Leer cómo ese proyecto registra ventas con tarjeta y si ya tiene cuentas
   del negocio y corte de caja.
2. Maquetar las 3 pantallas con el diseño de ESE proyecto (sus colores,
   tipografía y componentes) y aprobar antes de construir.
3. Migración → cálculo con prueba → Configuración → POS → Corte.
