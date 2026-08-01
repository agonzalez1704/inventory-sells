---
source_file: "migrations/20260716165734_ordenes-web.sql"
type: "code"
community: "20260716165734_ordenes-web.sql"
location: "L55"
tags:
  - graphify/code
  - graphify/EXTRACTED
  - community/20260716165734_ordenes-websql
---

# public.orden_web_items

## Connections
- [[20260716165734_ordenes-web.sql]] - `contains` [EXTRACTED]
- [[public.cancelar_orden_web()]] - `reads_from` [EXTRACTED]
- [[public.crear_orden_web()]] - `reads_from` [EXTRACTED]
- [[public.ordenes_web]] - `references` [EXTRACTED]

#graphify/code #graphify/EXTRACTED #community/20260716165734_ordenes-websql