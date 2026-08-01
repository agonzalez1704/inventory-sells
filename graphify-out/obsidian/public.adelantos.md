---
source_file: "migrations/20260707210933_adelantos.sql"
type: "code"
community: "20260707210933_adelantos.sql"
location: "L11"
tags:
  - graphify/code
  - graphify/EXTRACTED
  - community/20260707210933_adelantossql
---

# public.adelantos

## Connections
- [[20260707210933_adelantos.sql]] - `contains` [EXTRACTED]
- [[public.adelanto_pagos]] - `references` [EXTRACTED]
- [[public.cancelar_adelanto()]] - `reads_from` [EXTRACTED]
- [[public.crear_adelanto()]] - `reads_from` [EXTRACTED]
- [[public.entregar_adelanto()]] - `reads_from` [EXTRACTED]

#graphify/code #graphify/EXTRACTED #community/20260707210933_adelantossql