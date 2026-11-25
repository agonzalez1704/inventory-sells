# Requerimientos — conversiones entre marcas y una pieza por tarjeta (audios del 24-nov-2026)

Fuente: 5 notas de voz de WhatsApp (08:12, 08:15, 08:16, 08:23, 08:24) y 2 capturas (08:22, 08:23). Las aclaraciones de las 08:22 en adelante **corrigen** lo anterior donde chocan. Transcritas con whisper; los nombres de marca que el audio no deja claros van marcados con **(?)**.

## Audio 1 (08:12) — ¿Cargó bien Eagle?

El dueño cree que el problema de `10-009` vino de su internet al importar ("la cargué dos veces") y pide revisar si la lista de **Eagle** sí cargó.

**Revisado en la base de producción de Ruli (solo lectura):**

| Archivo | Cuándo (hora MX) | Filas importadas | Productos en CEDIS LEÓN |
|---|---|---|---|
| `EAGLE.xlsx` | 23-nov 21:15 | 5,369 | **5,366** (`brand = EAGLE`; 20 con existencia) |
| `TRACKONE.xlsx` | 23-nov 21:56 y 22:13 (dos veces) | 6,442 cada vez | **6,442** (`brand = TRACKONE`; ninguno con existencia) |

- **Eagle cargó completo.** La diferencia de 3 filas son renglones repetidos o vacíos del archivo; vale la pena confirmarlo contra el Excel.
- La doble carga de Track One no duplicó nada: 6,442 productos, no 12,884.
- **El internet no fue la causa** de que `10-009` no apareciera. Era el tope de la búsqueda, ya corregido y desplegado (commit `1adec1b`). Conviene decírselo para que no vuelva a cargar archivos por eso.

## Audio 2 (08:15) — Cargar la tabla de conversiones

Tiene un Excel casi terminado con **todos los productos de Grob y sus conversiones** a otras marcas:

- **Se venden:** Grob, Yokomitsu, Track One **(?)** ("Ultra One"), Eagle, ACP y Baslo **(?)**.
- **No se vende:** SID **(?)**. Sirve solo como referencia del cliente ("traigo el número SID…").

Pide ayuda para cargarlo. Menciona que "la página" del proveedor da la información de un producto que ya tiene SID, como muestra del formato.

**Lo que ya existe en la app:**
- `products.conversion_grupo`: liga piezas equivalentes que **sí manejamos**. Se edita una por una en Catálogo (`ligarConversion` / `desligarConversion` en `modules/catalogo/actions.ts`).
- `products.numeros_originales`: números de otras marcas que **no manejamos**. Se ven como "Otras marcas" en `ProductoDetalle` y en la ficha del POS.
- Hoy en producción: **97 productos en 24 grupos** y 33 con números originales. Casi vacío.
- **No hay importador masivo de conversiones.** `ImportarPrecios` dice explícitamente que "carros, refacción y conversiones se editan en el Catálogo".

**Requerimiento R-A — Importador de conversiones (Excel):**
1. Pantalla en Catálogo (junto a Importar precios): subir el Excel, **vista previa de lo que cambia** y aplicar. Mismo patrón que `excel-diff.ts`.
2. Cada renglón es una pieza Grob más sus equivalentes, una columna por marca.
   - Clave de una marca que **vendemos** y existe en `products`: entra al mismo `conversion_grupo`. Los grupos que ya existían se unen, igual que `ligarConversion`.
   - Clave de una marca que **no vendemos** (SID): se agrega a `numeros_originales` de las piezas del grupo, con la marca, p. ej. `SID 12345`.
   - Clave de marca vendida que **no existe** en el catálogo: se reporta en la vista previa y no se inventa el producto.
3. Las claves se comparan **compactadas** (sin guiones ni espacios), con la misma regla que la búsqueda (`10-009` = `10009`).
4. El buscador encuentra la pieza por cualquier número de su grupo, incluido SID. Revisar que `numeros_originales` alimente `busqueda`/`tags_texto`; si no, agregarlo.
5. **Necesito del dueño:** el Excel (aunque no esté terminado), qué columnas trae y el ejemplo de "la página" con un producto que tenga SID.

## Audio 3 (08:16) — Una tarjeta por pieza en la tienda, no una por marca

Un amortiguador de Versa existe en 5–7 marcas: Yokomitsu, Grob, Grob línea económica **(?)** ("Drop línea económica"), y luego ACP, Baslo y SID. El cliente que abre "Versa → amortiguadores" vería 15–18 tarjetas entre izquierdo, derecho y trasero, y "se va a desesperar".

**Lo que pide:**
- En el **listado** de la tienda, **una sola tarjeta por pieza equivalente**. Muestra la marca base: **Yokomitsu**; si no hay Yokomitsu, **Grob**.
- Al **entrar** al producto se ven **todas las marcas** en que lo tenemos, y el cliente elige cuál pide.

**Lo que hay hoy:** la tienda de Ruli lista **una tarjeta por SKU** (`tienda_match` en `20261103120000_tienda-una-pieza-por-sku.sql`, a propósito: el dueño pidió no agrupar por descripción, porque eso mezclaba piezas de carros distintos). La página de producto ya muestra "Conversiones" y "Otras marcas".

## Aclaraciones (08:22–08:24): 2 capturas y 2 audios

**Captura 1 — listado de la tienda en el teléfono** (Amortiguador + Nissan Versa, 4 filtros): una tarjeta por SKU. Salen `6709053` GROB "AMORT DEL. IZQ." ($1,299), `6709053-S` GROB "AMORT DEL. IZQ. C/TOPE" ($415), `6709054-S` "AMORT TRAS C/TOPE"…, cada una con su botón "Agregar".

**Captura 2 — página del producto `6709053`:** elige almacén (Mostrador / CEDIS LEÓN), "Le queda a" (March 2011–2026, Versa V-Drive 2012–2025) y **"Conversiones"** con `SANN0902` Yokomitsu ($404.03) y `6709053-S` Grob Línea S ($415). En la base, los tres ya están en el mismo `conversion_grupo`.

**Audio 08:23:** el Versa V-Drive lleva 4 amortiguadores, pero son **3 piezas distintas**: delantero izquierdo, delantero derecho y trasero (igual para los dos lados). Manejan **Grob normal, Grob línea económica, Yokomitsu, ACP y pronto Baslo**: 5 marcas × 3 piezas = 15 tarjetas. Además cada marca describe distinto; Grob ni siquiera usa la misma descripción en su línea económica. Quiere que el cliente vea **solo 3 productos**: amortiguador delantero izquierdo, delantero derecho y trasero.

**Audio 08:24:** al entrar al delantero izquierdo, el cliente ya ve abajo, en **Conversiones**, el de Yoko y el de Línea S; cuando se carguen, también el de Baslo y el de ACP. Reconoce que contradice lo que pidieron al principio (comprar directo desde el listado), pero el mecánico se revuelve con 15 opciones. **"Tú no tendrías que cambiar nada de formato"**: él termina las equivalencias y las manda.

**Lo que esto resuelve:**
- "Drop" / "Grove" = **GROB**. La "línea económica" es la **Línea S de Grob**: misma marca `GROB`, SKU con sufijo `-S` (1,695 productos), sin `calidad`. No es otra marca.
- Marcas que se venden: Grob, Grob Línea S, Yokomitsu, ACP y Baslo (próximamente). En estos audios ya no menciona SID, Track One ni Eagle.
- **La página de producto se queda como está**: la sección Conversiones ya muestra las otras marcas. Desaparece el "selector de marca" que propuse antes (R-B.4).
- El trabajo real es: **cargar las equivalencias (R-A)** y **que el listado muestre una sola tarjeta por grupo (R-B)**.

**Requerimiento R-B (ajustado) — Una tarjeta por grupo de conversión en el listado:**
1. En la tienda de Ruli, el listado agrupa por `conversion_grupo` cuando existe; si no, por SKU como hoy. Es una liga **explícita**, no por descripción, así que respeta la regla de `20261103120000_tienda-una-pieza-por-sku.sql`.
2. **Qué pieza representa la tarjeta** (nombre, clave, foto, precio y botón Agregar): ver la pregunta 1 abajo. Propuesta: orden de marca configurable y, dentro de ese orden, primero la que tiene existencia o es dropship.
3. La página de producto **no cambia**: se abre la del representante y sus equivalentes salen en Conversiones.
4. Filtros por vehículo y categoría: el grupo aparece si **alguna** de sus piezas cumple. Filtro por marca: el representante pasa a ser la pieza de esa marca.
5. Buscar por la clave de cualquier miembro (p. ej. `SANN0902`) lleva a la tarjeta del grupo.
6. Solo en Ruli; Fiable no cambia.
7. Depende de R-A: hoy hay 24 grupos.

**Requerimiento R-A (ajustado):** él terminará y **mandará** las equivalencias. Para la primera carga basta un script con vista previa que yo corro. El importador en Catálogo (para que él suba cambios después) puede venir en un segundo paso. Ver la pregunta 3.

**Preguntas para el dueño:**
1. **¿Qué marca representa a la pieza en el listado?** En el audio de 08:16 dijo "la base Yokomitsu; si no hay, Grob". En la captura y el audio de 08:24, la tarjeta es Grob normal y Yoko aparece en Conversiones. ¿Yokomitsu > Grob > Línea S > ACP > Baslo? ¿Y si la preferida no tiene existencia?
2. **¿Qué nombre lleva la tarjeta?** ¿El del representante (p. ej. "Amort Del. Izq.")? ¿O uno limpio y común ("Amortiguador delantero izquierdo"), que habría que capturar o derivar?
3. ¿Me manda el Excel y lo cargo yo, o quiere subirlo él desde la app?
4. ¿Qué columnas trae el Excel? ¿Sigue habiendo números SID u otras marcas que no vendemos?
5. ¿Agrupar aplica solo a la tienda, o también al POS y a cotizaciones?

## Orden sugerido
1. Contestar el audio 1: Eagle sí cargó, el internet no fue la causa.
2. Hacerle las preguntas 1–4 y pedir el Excel.
3. R-B: agrupar el listado. Se puede construir y probar desde ya con los 24 grupos existentes; el Versa ya está ligado.
4. R-A: cargar las equivalencias cuando llegue el Excel.

## Tabla de equivalencias (25-nov-2026)

El dueño mandó `CNV.xlsx`, con columnas GROB, SYD y VAZLO (Baslo). La columna YOKOMITSU se llenó con el recuadro EQUIV de los catálogos Optimo `cat02`/`cat03`/`cat04`: 1,828 renglones. Pide:

1. **Buscar por SYD** (o cualquier número de la tabla) devuelve todas las piezas equivalentes que sí tenemos, aunque SYD no se venda.
2. **Ligado automático:** al crear un producto o importar un archivo, de cualquier proveedor, el producto se liga solo si su número ya está en la tabla.
3. **Una sola tabla:** Grob, Línea S, Baslo, Yokomitsu: cualquier número del renglón lleva a las mismas compatibilidades.
4. **Carga del Excel en lote.**

**Cómo quedó (migración `20261125120000_equivalencias.sql`):**
- `equivalencias (grupo, marca, clave)` es la fuente. Los renglones que comparten un número de la misma marca son una sola pieza. El mismo número bajo dos marcas no lo es: Grob `1025001` no es SYD `1025001`.
- `products.conversion_grupo` ahora se deriva solo. Un trigger busca el SKU al insertar o al cambiar SKU o marca.
  - Una marca con columna propia (GROB, YOKOMITSU) liga solo contra su columna.
  - TrackOne, Eagle y productos sin marca ligan contra cualquier columna: los números VAZLO son SKUs de TrackOne y Eagle. Verificado: K-8695 = TrackOne 10-367 = SUNF0400, la misma rótula Ranger.
- `tags_texto` lleva todos los números del grupo, así que búsqueda, POS, tienda y compras los encuentran.
- **Catálogo → "Cargar equivalencias"**: vista previa, reemplaza la tabla completa y conserva las ligas hechas a mano.
- Ligar y desligar en el panel de la pieza escriben en la tabla.

Simulación local con los SKUs de producción: 22,703 de 48,643 filas de producto quedan con conversiones.
