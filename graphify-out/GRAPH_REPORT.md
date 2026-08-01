# Graph Report - /Users/antoniogonzalez/Sites/inventory-pos  (2026-08-01)

## Corpus Check
- 10 files · ~120,238 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1109 nodes · 2495 edges · 113 communities (76 shown, 37 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 9 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Cotizaciones (UI + páginas)
- Tienda Pública & Compatibilidad
- Webhook Kapso & Agente WhatsApp
- Dependencias (package.json)
- Configuración, Layout & Push
- Corte de Caja & Tickets
- Importación de Inventario
- Producto & Storefront
- Dev Dependencies & Tooling
- API Routes & Autorización
- TypeScript Config
- Permisos & Etiquetas
- Clientes & Teléfonos
- Conekta & Checkout
- Constructor de Cotizaciones
- Root Layout & Fuentes
- Envíos Skydropx
- page.tsx
- Páginas POS & Inventario
- UI Badges & Vistas
- UI Cards & Adelantos
- Formato de Dinero & Inventario
- Notificaciones de Ventas
- LoansView.tsx
- formatMXN()
- button.tsx
- createInsForgeServerClient()
- pago-actions.ts
- cn()
- RecentSales.tsx
- AsesorView.tsx
- page.tsx
- conekta.ts
- 20260707210933_adelantos.sql
- route.ts
- server.ts
- page.tsx
- 20260620181327_switch-to-clerk-auth.sql
- 20260620180113_create-core-schema.sql
- 20260716165734_ordenes-web.sql
- 20260730182651_customer-multi-phones.sql
- 20260728003450_roles-permisos-flexibles.sql
- seed-product-images.mjs
- 20260620193826_add-loans-fiado.sql
- 20260707231934_fiado-abonos.sql
- 20260728043048_cotizaciones.sql
- 20260623232230_whatsapp-memory-and-config.sql
- 20260625162858_conversation-handoff.sql
- 20260703211040_devoluciones.sql
- 20260713035000_customers.sql
- 20260724145426_entrega-recoger-transferencia.sql
- InsForge backend guidance
- Registered customer required for sales
- Digital return voucher balance
- 20260623164524_inventory-create-with-import.sql
- 20260713043430_mostrador-and-sale-customer.sql
- 20260731145830_cotizacion-whatsapp-viva.sql
- Mobile parts hero image
- Warehouse lead times
- 20260620183226_allow-image-import-source.sql
- 20260620185759_add-category-and-attributes.sql
- 20260623161041_add-multiple-inventories.sql
- 20260630004854_gastos-corte-caja.sql
- 20260703000933_ingresos-extra.sql
- 20260703171118_product-etiqueta.sql
- 20260703174651_etiqueta-enum.sql
- 20260708202558_product-image.sql
- 20260713035435_customer-phone-required-unique.sql
- 20260713181055_push-subscriptions.sql
- 20260713190549_notification-prefs.sql
- 20260714170144_compat-cache.sql
- 20260728163157_user-invites.sql
- 20260728170000_cotizacion-share-token.sql
- 20260730220927_wa-pedido-en-curso.sql
- next.config.ts
- postcss.config.mjs
- proxy.ts
- tailwind.config.ts
- Fiable logo mark
- Conversational WhatsApp quotations
- VOUCHER_HORAS
- Huawei brand logo
- Motorola brand logo
- OPPO brand logo
- realme brand logo
- Xiaomi brand logo
- ZTE brand logo
- Aplazo payment logo
- OXXO payment logo
- SPEI payment logo

## God Nodes (most connected - your core abstractions)
1. `createInsForgeServerClient()` - 78 edges
2. `cn()` - 77 edges
3. `formatMXN()` - 70 edges
4. `attempt()` - 31 edges
5. `Button` - 30 edges
6. `insforgeAdmin` - 29 edges
7. `getProfile()` - 27 edges
8. `getPermisos()` - 21 edges
9. `Input` - 19 edges
10. `searchProducts()` - 19 edges

## Surprising Connections (you probably didn't know these)
- `AdelantosPage()` --calls--> `createInsForgeServerClient()`  [EXTRACTED]
  app/(app)/adelantos/page.tsx → lib/insforge/server.ts
- `AsesorPage()` --calls--> `createInsForgeServerClient()`  [EXTRACTED]
  app/(app)/asesor/page.tsx → lib/insforge/server.ts
- `ClientesPage()` --calls--> `createInsForgeServerClient()`  [EXTRACTED]
  app/(app)/clientes/page.tsx → lib/insforge/server.ts
- `CotizacionesPage()` --calls--> `getPermisos()`  [EXTRACTED]
  app/(app)/cotizaciones/page.tsx → lib/auth/profile.ts
- `PedidosPage()` --calls--> `getProfile()`  [EXTRACTED]
  app/(app)/pedidos/page.tsx → lib/auth/profile.ts

## Import Cycles
- 3-file cycle: `modules/sales/RecentSales.tsx -> modules/sales/ReturnModal.tsx -> modules/sales/actions.ts -> modules/sales/RecentSales.tsx`

## Communities (113 total, 37 thin omitted)

### Community 0 - "Cotizaciones (UI + páginas)"
Cohesion: 0.06
Nodes (65): CotizacionPage(), Row, NuevaCotizacionPage(), metadata, getAsignables(), getPermisos(), ActionResult, attempt() (+57 more)

### Community 1 - "Tienda Pública & Compatibilidad"
Cohesion: 0.06
Nodes (49): Row, TiendaPage(), Compat, FALLO, modelosCompatibles(), openai, parse(), SIN_DATOS (+41 more)

### Community 2 - "Webhook Kapso & Agente WhatsApp"
Cohesion: 0.06
Nodes (43): firmaValida(), KapsoEvent, POST(), textoDeEvento(), CotizacionesPage(), PedidosPage(), UsuariosPage(), tienePermiso() (+35 more)

### Community 3 - "Dependencias (package.json)"
Cohesion: 0.04
Nodes (49): ai, @ai-sdk/openai, @clerk/nextjs, clsx, d3-array, d3-scale, @insforge/sdk, lucide-react (+41 more)

### Community 4 - "Configuración, Layout & Push"
Cohesion: 0.08
Nodes (33): GET(), ConfiguracionPage(), AppLayout(), PushBanner(), PushToggle(), usePush(), VersionWatcher(), allowedSet() (+25 more)

### Community 5 - "Corte de Caja & Tickets"
Cohesion: 0.09
Nodes (31): PrintTicketButtons(), buildCorteHTML(), CorteData, CorteMetodoLinea, esc(), imprimirCorteNavegador(), ascii(), buildEscPos() (+23 more)

### Community 6 - "Importación de Inventario"
Cohesion: 0.10
Nodes (34): addProduct(), attrsToObject(), buildPayload(), commitImport(), CommitResult, CreatedInventory, createInventoryWithImport(), extractFromUpload() (+26 more)

### Community 7 - "Producto & Storefront"
Cohesion: 0.09
Nodes (26): Row, display, metadata, prettyPhone(), TiendaLayout(), waHref(), useIsMobile(), Calidad (+18 more)

### Community 8 - "Dev Dependencies & Tooling"
Cohesion: 0.06
Nodes (35): autoprefixer, eslint, eslint-config-next, devDependencies, autoprefixer, eslint, eslint-config-next, postcss (+27 more)

### Community 9 - "API Routes & Autorización"
Cohesion: 0.12
Nodes (31): authorized(), FECHA, guarded(), handler, PERIODO, AdelantoAgg, adelantosPendientes(), ceroMetodos() (+23 more)

### Community 10 - "TypeScript Config"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules, scripts (+20 more)

### Community 11 - "Permisos & Etiquetas"
Cohesion: 0.12
Nodes (23): assertPermiso(), permisosDe(), esEtiquetaValida(), Etiqueta, ETIQUETAS, decode(), resizeImage(), toCents() (+15 more)

### Community 12 - "Clientes & Teléfonos"
Cohesion: 0.15
Nodes (20): ClientesPage(), agregarTelefono(), archivarCliente(), assertNotSystem(), buscarClientes(), clean(), crearCliente(), Customer (+12 more)

### Community 13 - "Conekta & Checkout"
Cohesion: 0.14
Nodes (15): cargar(), ConektaGlobal, DatosTarjeta, tokenizarTarjeta(), Window, EntregaTile(), ESTADOS, Field() (+7 more)

### Community 14 - "Constructor de Cotizaciones"
Cohesion: 0.20
Nodes (10): CotizacionBuilder(), CotizacionInicial, CustomerPicker(), PickerCustomer, PhoneField(), CatChip(), ProductCard(), ProductRow() (+2 more)

### Community 15 - "Root Layout & Fuentes"
Cohesion: 0.13
Nodes (12): metadata, mono, RootLayout(), sans, viewport, features, AppShell(), GRUPOS (+4 more)

### Community 16 - "Envíos Skydropx"
Cohesion: 0.17
Nodes (16): cotizarEnvio(), Destino, mapRates(), paqueteParaPiezas(), Parcel, RawQuote, RawRate, Tarifa (+8 more)

### Community 17 - "page.tsx"
Cohesion: 0.18
Nodes (14): CajaPage(), cero(), DevolRow, METODOS, VentaRow, CANALES, METODOS, VentasPage() (+6 more)

### Community 18 - "Páginas POS & Inventario"
Cohesion: 0.18
Nodes (12): InventarioPage(), PosPage(), requirePagePermiso(), CartLine, ImportRow, Inventory, Profile, Role (+4 more)

### Community 19 - "UI Badges & Vistas"
Cohesion: 0.17
Nodes (12): Badge(), Tone, tones, EmptyState(), CotizacionesView(), estadoDe(), fechaCorta(), Filtro (+4 more)

### Community 20 - "UI Cards & Adelantos"
Cohesion: 0.21
Nodes (9): Card(), Input, Select, AbonarModal(), AdelantoRow(), AdelantosView(), CrearModal(), METODOS (+1 more)

### Community 21 - "Formato de Dinero & Inventario"
Cohesion: 0.15
Nodes (11): fromCents(), mxn, compareRows(), InventoryView(), InvTab(), Sort, SortableTh(), SortKey (+3 more)

### Community 22 - "Notificaciones de Ventas"
Cohesion: 0.21
Nodes (16): fetchSale(), notifyAbono(), notifyCancelacion(), notifyNuevaVenta(), productos(), quien(), sellerName(), abonarFiado() (+8 more)

### Community 23 - "LoansView.tsx"
Cohesion: 0.18
Nodes (12): Product, AbonarFiadoModal(), ago(), Loan, LoanItem, LoanRow(), LoansView(), PAYMENT_METHODS (+4 more)

### Community 24 - "formatMXN()"
Cohesion: 0.15
Nodes (13): formatMXN(), CajaData, IngresosModal(), InvAgg, InventarioModal(), InvMov, Kpi(), LABEL (+5 more)

### Community 25 - "button.tsx"
Cohesion: 0.17
Nodes (9): Button, ButtonProps, Size, sizes, Variant, variants, Modal(), EMPTY (+1 more)

### Community 26 - "createInsForgeServerClient()"
Cohesion: 0.26
Nodes (11): GET(), EditarCotizacionPage(), FiadosPage(), getProfile(), createInsForgeServerClient(), eliminarGasto(), eliminarIngreso(), registrarGasto() (+3 more)

### Community 27 - "pago-actions.ts"
Cohesion: 0.19
Nodes (11): metadata, validarCarrito(), CheckoutView(), baseUrl(), crearOrden(), crearOrdenTransferencia(), crearOrdenYPagar(), DatosCliente (+3 more)

### Community 28 - "cn()"
Cohesion: 0.26
Nodes (10): Drawer(), DesktopModal(), ModalProps, cn(), ceilTo(), METODOS, PaymentContent(), PaymentSheet() (+2 more)

### Community 29 - "RecentSales.tsx"
Cohesion: 0.21
Nodes (10): PaymentMethod, cambiarVentaItems(), EditModal(), LABEL, PAYMENT, RecentSales(), SaleLine, SaleWithItems (+2 more)

### Community 30 - "AsesorView.tsx"
Cohesion: 0.31
Nodes (7): AsesorPage(), devolverABot(), ago(), AsesorView(), Conversacion, Row(), waLink()

### Community 31 - "page.tsx"
Cohesion: 0.31
Nodes (6): dayKey(), MonthSale, ReportesPage(), BarHorizontal(), BarDatum, BarVertical()

### Community 32 - "conekta.ts"
Cohesion: 0.27
Nodes (9): authHeader(), conekta(), ConektaCharge, ConektaMethod, ConektaOrder, CreateArgs, createConektaOrder(), LineItem (+1 more)

### Community 33 - "20260707210933_adelantos.sql"
Cohesion: 0.33
Nodes (8): adelantos_touch_updated_at, public.adelanto_pagado(), public.adelanto_pagos, public.adelantos, public.cancelar_adelanto(), public.crear_adelanto(), public.entregar_adelanto(), public.inventory_movements

### Community 34 - "route.ts"
Cohesion: 0.36
Nodes (7): buscarOrden(), ConektaEvent, OrdenRow, POST(), secretOk(), OrdenPage(), getConektaOrder()

### Community 35 - "server.ts"
Cohesion: 0.29
Nodes (5): AdelantosPage(), Row, noStoreFetch(), Adelanto, AdelantoProducto

### Community 36 - "page.tsx"
Cohesion: 0.39
Nodes (5): BANK, metadata, Orden, TIENDA, PasePickup()

### Community 37 - "20260620181327_switch-to-clerk-auth.sql"
Cohesion: 0.36
Nodes (6): products_touch_updated_at, profiles_touch_updated_at, public.is_admin(), public.products, public.profiles, public.touch_updated_at()

### Community 38 - "20260620180113_create-core-schema.sql"
Cohesion: 0.43
Nodes (6): products_touch_updated_at, profiles_touch_updated_at, public.is_admin(), public.products, public.profiles, public.touch_updated_at()

### Community 39 - "20260716165734_ordenes-web.sql"
Cohesion: 0.57
Nodes (5): public.cancelar_orden_web(), public.crear_orden_web(), public.orden_web_items, public.ordenes_web, public.sales

### Community 40 - "20260730182651_customer-multi-phones.sql"
Cohesion: 0.48
Nodes (6): customer_phones_collision, customers_phone_collision, public.customer_phones, public.customer_phones_all, public.customer_phones_check_collision(), public.customers_check_phone_collision()

### Community 41 - "20260728003450_roles-permisos-flexibles.sql"
Cohesion: 0.40
Nodes (3): public.profiles, public.role_permissions, public.roles

### Community 42 - "seed-product-images.mjs"
Cohesion: 0.47
Nodes (5): admin, EXT_BY_TYPE, extFor(), main(), resolveId()

### Community 43 - "20260620193826_add-loans-fiado.sql"
Cohesion: 0.60
Nodes (3): public.cancel_loan(), public.sales, public.settle_loan()

### Community 45 - "20260728043048_cotizaciones.sql"
Cohesion: 0.70
Nodes (3): public.convertir_cotizacion(), public.cotizacion_items, public.cotizaciones

### Community 46 - "20260623232230_whatsapp-memory-and-config.sql"
Cohesion: 0.50
Nodes (3): config_negocio_touch_updated_at, public.config_negocio, public.wa_mensajes

### Community 47 - "20260625162858_conversation-handoff.sql"
Cohesion: 0.50
Nodes (3): conversaciones_touch_updated_at, public.config_negocio, public.conversaciones

### Community 48 - "20260703211040_devoluciones.sql"
Cohesion: 1.00
Nodes (3): public.devolucion_items, public.devoluciones, public.devolver_items()

### Community 49 - "20260713035000_customers.sql"
Cohesion: 0.50
Nodes (3): customers_touch_updated_at, public.customers, public.sales

### Community 51 - "InsForge backend guidance"
Cohesion: 0.67
Nodes (3): Array-based database inserts, InsForge backend guidance, Storage URL and key persistence

### Community 52 - "Registered customer required for sales"
Cohesion: 0.67
Nodes (3): Customer identity foundation, Registered customer required for sales, Credit-note cashier payment flow

### Community 53 - "Digital return voucher balance"
Cohesion: 0.67
Nodes (3): Digital return voucher balance, Gated cash-refund exception, Warranty workflow

### Community 57 - "Mobile parts hero image"
Cohesion: 0.67
Nodes (3): Mobile parts hero image, Apple brand logo, Samsung brand logo

## Ambiguous Edges - Review These
- `Mobile parts hero image` → `Apple brand logo`  [AMBIGUOUS]
  public/hero.webp · relation: contextually_relates_to
- `Mobile parts hero image` → `Samsung brand logo`  [AMBIGUOUS]
  public/hero.webp · relation: contextually_relates_to

## Knowledge Gaps
- **283 isolated node(s):** `Row`, `METODOS`, `VentaRow`, `DevolRow`, `Row` (+278 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **37 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Mobile parts hero image` and `Apple brand logo`?**
  _Edge tagged AMBIGUOUS (relation: contextually_relates_to) - confidence is low._
- **What is the exact relationship between `Mobile parts hero image` and `Samsung brand logo`?**
  _Edge tagged AMBIGUOUS (relation: contextually_relates_to) - confidence is low._
- **Why does `cn()` connect `cn()` to `Cotizaciones (UI + páginas)`, `Tienda Pública & Compatibilidad`, `Configuración, Layout & Push`, `Importación de Inventario`, `Producto & Storefront`, `Clientes & Teléfonos`, `Conekta & Checkout`, `Constructor de Cotizaciones`, `Root Layout & Fuentes`, `UI Badges & Vistas`, `UI Cards & Adelantos`, `Formato de Dinero & Inventario`, `LoansView.tsx`, `formatMXN()`, `button.tsx`, `pago-actions.ts`, `RecentSales.tsx`?**
  _High betweenness centrality (0.121) - this node is a cross-community bridge._
- **Why does `dependencies` connect `Dependencias (package.json)` to `Dev Dependencies & Tooling`?**
  _High betweenness centrality (0.091) - this node is a cross-community bridge._
- **Why does `react` connect `Dependencias (package.json)` to `cn()`?**
  _High betweenness centrality (0.083) - this node is a cross-community bridge._
- **What connects `Row`, `METODOS`, `VentaRow` to the rest of the system?**
  _283 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Cotizaciones (UI + páginas)` be split into smaller, more focused modules?**
  _Cohesion score 0.05660945498343872 - nodes in this community are weakly interconnected._