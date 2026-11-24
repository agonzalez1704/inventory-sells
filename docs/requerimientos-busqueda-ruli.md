# Requerimientos — búsqueda por clave en Ruli (videos del 23-nov-2026)

Fuente: 3 videos de WhatsApp (22:23, 22:25, 22:26), pantalla `/inventario` y tienda pública de Refaccionaria Ruli.

## Lo que se ve en los videos

| # | Clave | Filtro | Resultado |
|---|---|---|---|
| 1 | `10-009` (BRAZO COMPENSAD…, 0 pzas, Agotado) | Inventario **CEDIS LEÓN** | Aparece ✅ |
| 2 | `10-009` | Inventario **Todos** | Aparece un instante con etiqueta "CEDIS LEÓN" y luego cambia solo a **"Sin resultados"** ❌ |
| 3 | `10-009` | Tienda pública (sin sesión), PC y teléfono | "No encontramos la pieza" ❌ |
| 4 | `21-037` (BRAZO DE CONTROL TRAS. SUP. IZ. BUICK, 0 pzas) | CEDIS LEÓN, Todos y tienda | Aparece en todos ✅ |

El usuario sospecha de la carga del archivo ("lo cargué dos veces") o de la existencia en cero. **No es ninguna de las dos**: la pieza existe y está activa (sale en CEDIS LEÓN), y `21-037` también tiene 0 piezas y sí sale.

## Causa (análisis de código; falta confirmarlo con datos)

1. `normalize("10-009")` produce **dos tokens**: `10` y `009`. `buscar_productos_candidatos` filtra con `busqueda LIKE '%10%' AND busqueda LIKE '%009%'`. Con ~70 mil productos, eso coincide con miles de filas: años como 2009 o 2010, otras claves, medidas.
2. El RPC ordena por *puntos en el nombre* → `quantity > 0` → `name` y **corta en 1000** (`CANDIDATOS` en `modules/inventory/buscar.ts`, `p_limit: 1000` en `modules/tienda/busqueda.ts`).
3. `10-009` no tiene "10" ni "009" en el nombre y tiene 0 piezas, así que queda al fondo y **se pierde en el corte**. El ranking JS (`searchProducts`) nunca la ve.
4. En CEDIS LEÓN hay menos candidatos (~31 mil productos), así que no se llega al tope y sí aparece. `21-037` sí aparece porque `037` es mucho más raro que `009`.
5. El "aparece y luego desaparece" no es otro bug. Al cambiar el filtro, la tabla sigue mostrando las filas viejas mientras corre la nueva consulta (`InventoryView.tsx`, efecto de `listaInventario`: debounce de 180 ms, sin limpiar `paged`).

## Requerimientos

### R1 — Una clave exacta siempre aparece (crítico)
- Buscar una clave de parte (`10-009`, `10009`, `10 009`) debe devolver ese producto **en primer lugar** en `/inventario` (cualquier filtro), POS, cotizaciones, compras y tienda pública. Tenga o no existencia.
- La coincidencia de SKU (exacta o compacta, sin guiones ni espacios) debe ganar **antes** del corte de candidatos. Opciones:
  - en el SQL: un término en `ORDER BY` para `sku` exacto o compacto, antes de `quantity`;
  - o una consulta aparte por SKU que se une a los candidatos.
- Mismo comportamiento en los 4 llamadores del RPC: `modules/inventory/buscar.ts`, `modules/tienda/busqueda.ts`, `modules/compras/factura-actions.ts`, `modules/analytics/queries.ts`.
- **Aceptación:** `10-009` aparece en "Todos" y en la tienda. Agregar un test en `lib/search` y un caso de regresión con >1000 candidatos.

### R2 — Sin resultados "fantasma" al cambiar de inventario
- Al cambiar el filtro de inventario o la búsqueda, no mostrar filas del filtro anterior como si fueran del nuevo. Mostrar estado de carga (skeleton o atenuado) hasta que llegue la respuesta.
- **Aceptación:** pasar de CEDIS LEÓN a Todos no muestra la fila con etiqueta CEDIS LEÓN antes de la respuesta.

### R3 — Texto de "modelos compatibles" según la marca
- `modules/tienda/CompatibleBox.tsx` dice "Muchas **pantallas** son iguales entre modelos… le queda a **tu equipo**". Es texto de Fiable (celulares) y se ve en la tienda de Ruli (autopartes).
- Usar `MARCA.id` (`lib/marca.ts`) para el texto. Para Ruli, algo como: "Muchas refacciones son iguales entre modelos. Podemos revisar si alguna que sí tenemos le queda a tu vehículo."
- Revisar el mismo texto en `modules/compat/CompatPanel.tsx` (panel interno).

### R4 — (Menor, por confirmar) Enter en el buscador de inventario
- En el video 2, al presionar Enter con `21-037` el resultado cambia ("me quita lo de CEDIS LEÓN"). Revisar qué hace Enter en `InventoryView.tsx` (¿escáner o "ir a producto"?). Definir si debe abrir el producto cuando hay un solo resultado.

## Pendiente de verificar
- Confirmar con datos de producción (Supabase de Ruli) cuántos candidatos devuelve `10` + `009` en "Todos" y en qué posición queda `10-009`. No se ejecutó: la consulta de solo lectura a producción quedó bloqueada por permisos.
