---
source_file: "migrations/20260707210933_adelantos.sql"
type: "code"
community: "20260707210933_adelantos.sql"
location: "L36"
tags:
  - graphify/code
  - graphify/EXTRACTED
  - community/20260707210933_adelantossql
---

# public.adelanto_pagos

## Connections
- [[20260707210933_adelantos.sql]] - `contains` [EXTRACTED]
- [[public.adelanto_pagado()]] - `reads_from` [EXTRACTED]
- [[public.adelantos]] - `references` [EXTRACTED]
- [[public.cancelar_adelanto()]] - `reads_from` [EXTRACTED]

#graphify/code #graphify/EXTRACTED #community/20260707210933_adelantossql