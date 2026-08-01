# Graph Report - .  (2026-07-31)

## Corpus Check
- 221 files · ~118,096 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1098 nodes · 2500 edges · 110 communities (74 shown, 36 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 9 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- App App Caja Page
- App Cotizaciones Id Page
- App Tienda Id Page
- Ai
- Api Webhooks Kapso Route
- Api Inventario Export Route
- Lib Types Inventory
- Lib Compat
- App Api Transport Route
- Autoprefixer
- Lib Auth Profile
- Components Ui Badge
- Ref Dom
- App App Ventas Page
- Id Editar Page Editarcotizacionpage
- App Error
- Lib Conekta Client
- App Layout
- Lib Skydropx
- Cotizaciones Id Editar Page
- App Cotizacion Page
- Components Ui Card
- App App Clientes Page
- Lib Push
- App App Fiados Page
- App Tienda Checkout Page
- Lib Money
- Api Asesor Pendientes Route
- App App Asesor Page
- App App Cotizaciones Page
- App App Reportes Page
- Lib Conekta
- Migrations Adelantos
- Api Webhooks Conekta Route
- Tienda Orden Id Page
- Switch To Clerk Auth
- Migrations Create Core Schema
- Migrations Ordenes Web
- Migrations Customer Multi Phones
- Migrations Roles Permisos Flexibles
- Scripts Seed Product Images
- App App Adelantos Page
- Migrations Add Loans Fiado
- Migrations Fiado Abonos
- Migrations Cotizaciones
- Whatsapp Memory And Config
- Migrations Conversation Handoff
- Migrations Devoluciones
- Migrations Customers
- Migrations Entrega Recoger Transferencia
- Md Database Insert Pattern
- Refaccionaria Features Customer Identity
- E3 Digital Return Voucher
- Inventory Create With Import
- Mostrador And Sale Customer
- Webp Mobile Parts Hero
- E5 Warehouse Lead Times
- Allow Image Import Source
- Add Category And Attributes
- Migrations Add Multiple Inventories
- Migrations Gastos Corte Caja
- Migrations Ingresos Extra
- Migrations Product Etiqueta
- Migrations Etiqueta Enum
- Migrations Product Image
- Customer Phone Required Unique
- Migrations Push Subscriptions
- Migrations Notification Prefs
- Migrations Compat Cache
- Migrations User Invites
- Migrations Cotizacion Share Token
- Wa Pedido En Curso
- Next Config
- Postcss Config
- Proxy
- Tailwind Config
- Icon Svg Fiable Mark
- R8 Conversational Whatsapp Quotes
- Lib Conekta Voucher Horas
- Huawei Svg Huawei Brand
- Motorola Svg Motorola Brand
- Oppo Svg Oppo Brand
- Realme Svg Realme Brand
- Xiaomi Svg Xiaomi Brand
- Zte Svg Zte Brand
- Aplazo Png Aplazo Payment
- Oxxo Svg Oxxo Payment
- Spei Svg Spei Payment

## God Nodes (most connected - your core abstractions)
1. `createInsForgeServerClient()` - 77 edges
2. `cn()` - 77 edges
3. `formatMXN()` - 70 edges
4. `attempt()` - 31 edges
5. `Button` - 30 edges
6. `insforgeAdmin` - 29 edges
7. `getProfile()` - 27 edges
8. `getPermisos()` - 21 edges
9. `Input` - 19 edges
10. `Card()` - 17 edges

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

## Communities (110 total, 36 thin omitted)

### Community 0 - "App App Caja Page"
Cohesion: 0.06
Nodes (50): CajaPage(), cero(), DevolRow, METODOS, VentaRow, PrintTicketButtons(), mxHoy(), buildCorteHTML() (+42 more)

### Community 1 - "App Cotizaciones Id Page"
Cohesion: 0.08
Nodes (53): CotizacionPage(), Row, NuevaCotizacionPage(), UsuariosPage(), getAsignables(), getPermisos(), tienePermiso(), ActionResult (+45 more)

### Community 2 - "App Tienda Id Page"
Cohesion: 0.06
Nodes (37): Row, display, metadata, prettyPhone(), TiendaLayout(), waHref(), Row, TiendaPage() (+29 more)

### Community 3 - "Ai"
Cohesion: 0.04
Nodes (49): ai, @ai-sdk/openai, @clerk/nextjs, clsx, d3-array, d3-scale, @insforge/sdk, lucide-react (+41 more)

### Community 4 - "Api Webhooks Kapso Route"
Cohesion: 0.10
Nodes (33): firmaValida(), KapsoEvent, POST(), textoDeEvento(), PedidosPage(), insforgeAdmin, base(), descargarMedia() (+25 more)

### Community 5 - "Api Inventario Export Route"
Cohesion: 0.08
Nodes (33): GET(), ConfiguracionPage(), AppLayout(), PushBanner(), PushToggle(), usePush(), VersionWatcher(), allowedSet() (+25 more)

### Community 6 - "Lib Types Inventory"
Cohesion: 0.09
Nodes (36): Inventory, addProduct(), attrsToObject(), buildPayload(), commitImport(), CommitResult, CreatedInventory, createInventoryWithImport() (+28 more)

### Community 7 - "Lib Compat"
Cohesion: 0.09
Nodes (34): Compat, FALLO, modelosCompatibles(), openai, parse(), SIN_DATOS, ALIAS_GROUPS, ALIASES (+26 more)

### Community 8 - "App Api Transport Route"
Cohesion: 0.11
Nodes (35): authorized(), FECHA, guarded(), handler, PERIODO, rangoUTC(), AdelantoAgg, adelantosPendientes() (+27 more)

### Community 9 - "Autoprefixer"
Cohesion: 0.06
Nodes (35): autoprefixer, eslint, eslint-config-next, devDependencies, autoprefixer, eslint, eslint-config-next, postcss (+27 more)

### Community 10 - "Lib Auth Profile"
Cohesion: 0.11
Nodes (26): assertPermiso(), permisosDe(), esEtiquetaValida(), Etiqueta, ETIQUETAS, decode(), resizeImage(), fromCents() (+18 more)

### Community 11 - "Components Ui Badge"
Cohesion: 0.14
Nodes (19): Badge(), Tone, tones, Drawer(), EmptyState(), DesktopModal(), ModalProps, cn() (+11 more)

### Community 12 - "Ref Dom"
Cohesion: 0.07
Nodes (28): dom, dom.iterable, esnext, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules, scripts (+20 more)

### Community 13 - "App App Ventas Page"
Cohesion: 0.12
Nodes (20): CANALES, METODOS, CartLine, ImportRow, PaymentMethod, Product, Profile, Role (+12 more)

### Community 14 - "Id Editar Page Editarcotizacionpage"
Cohesion: 0.19
Nodes (19): EditarCotizacionPage(), FiadosPage(), getProfile(), createInsForgeServerClient(), eliminarGasto(), eliminarIngreso(), registrarGasto(), registrarIngreso() (+11 more)

### Community 15 - "App Error"
Cohesion: 0.13
Nodes (14): Button, ButtonProps, Size, sizes, Variant, variants, Modal(), EMPTY (+6 more)

### Community 16 - "Lib Conekta Client"
Cohesion: 0.14
Nodes (15): cargar(), ConektaGlobal, DatosTarjeta, tokenizarTarjeta(), Window, EntregaTile(), ESTADOS, Field() (+7 more)

### Community 17 - "App Layout"
Cohesion: 0.13
Nodes (12): metadata, mono, RootLayout(), sans, viewport, features, AppShell(), GRUPOS (+4 more)

### Community 18 - "Lib Skydropx"
Cohesion: 0.17
Nodes (16): cotizarEnvio(), Destino, mapRates(), paqueteParaPiezas(), Parcel, RawQuote, RawRate, Tarifa (+8 more)

### Community 19 - "Cotizaciones Id Editar Page"
Cohesion: 0.26
Nodes (8): searchProducts(), CotizacionBuilder(), CotizacionInicial, CustomerPicker(), PickerCustomer, PhoneField(), SalesProduct, SalesScreen()

### Community 20 - "App Cotizacion Page"
Cohesion: 0.18
Nodes (10): metadata, notifyCotizacionAutorizada(), CotizacionPublica(), fecha(), aceptarCotizacionPublica(), cargarCotizacionPublica(), CotPublica, CotPublicaData (+2 more)

### Community 21 - "Components Ui Card"
Cohesion: 0.21
Nodes (10): Card(), Input, Select, ClienteModal(), ClienteRow(), pct(), TIPO_LABEL, TIPO_TONE (+2 more)

### Community 22 - "App App Clientes Page"
Cohesion: 0.17
Nodes (14): ClientesPage(), agregarTelefono(), archivarCliente(), assertNotSystem(), buscarClientes(), clean(), crearCliente(), Customer (+6 more)

### Community 23 - "Lib Push"
Cohesion: 0.27
Nodes (15): adminsForKind(), configure(), fetchSale(), METODO_LABEL, notifyAbono(), notifyAdmins(), notifyCancelacion(), notifyCotizacionTomada() (+7 more)

### Community 24 - "App App Fiados Page"
Cohesion: 0.22
Nodes (10): ago(), Loan, LoanItem, LoanRow(), LoansView(), PAYMENT_METHODS, cambiarFiado(), ItemSwapModal() (+2 more)

### Community 25 - "App Tienda Checkout Page"
Cohesion: 0.19
Nodes (11): metadata, validarCarrito(), CheckoutView(), baseUrl(), crearOrden(), crearOrdenTransferencia(), crearOrdenYPagar(), DatosCliente (+3 more)

### Community 26 - "Lib Money"
Cohesion: 0.19
Nodes (12): formatMXN(), mxn, AbonarModal(), AdelantoRow(), AdelantosView(), CrearModal(), METODOS, MovRow() (+4 more)

### Community 27 - "Api Asesor Pendientes Route"
Cohesion: 0.27
Nodes (6): GET(), InventarioPage(), PosPage(), VentasPage(), requirePagePermiso(), InventoryRow

### Community 28 - "App App Asesor Page"
Cohesion: 0.31
Nodes (7): AsesorPage(), devolverABot(), ago(), AsesorView(), Conversacion, Row(), waLink()

### Community 29 - "App App Cotizaciones Page"
Cohesion: 0.29
Nodes (8): CotizacionesPage(), CotizacionesView(), CotizacionRow, estadoDe(), fechaCorta(), Filtro, FILTROS, Tone

### Community 30 - "App App Reportes Page"
Cohesion: 0.31
Nodes (6): dayKey(), MonthSale, ReportesPage(), BarHorizontal(), BarDatum, BarVertical()

### Community 31 - "Lib Conekta"
Cohesion: 0.27
Nodes (9): authHeader(), conekta(), ConektaCharge, ConektaMethod, ConektaOrder, CreateArgs, createConektaOrder(), LineItem (+1 more)

### Community 32 - "Migrations Adelantos"
Cohesion: 0.33
Nodes (8): adelantos_touch_updated_at, public.adelanto_pagado(), public.adelanto_pagos, public.adelantos, public.cancelar_adelanto(), public.crear_adelanto(), public.entregar_adelanto(), public.inventory_movements

### Community 33 - "Api Webhooks Conekta Route"
Cohesion: 0.36
Nodes (7): buscarOrden(), ConektaEvent, OrdenRow, POST(), secretOk(), OrdenPage(), getConektaOrder()

### Community 34 - "Tienda Orden Id Page"
Cohesion: 0.39
Nodes (5): BANK, metadata, Orden, TIENDA, PasePickup()

### Community 35 - "Switch To Clerk Auth"
Cohesion: 0.36
Nodes (6): products_touch_updated_at, profiles_touch_updated_at, public.is_admin(), public.products, public.profiles, public.touch_updated_at()

### Community 36 - "Migrations Create Core Schema"
Cohesion: 0.43
Nodes (6): products_touch_updated_at, profiles_touch_updated_at, public.is_admin(), public.products, public.profiles, public.touch_updated_at()

### Community 37 - "Migrations Ordenes Web"
Cohesion: 0.57
Nodes (5): public.cancelar_orden_web(), public.crear_orden_web(), public.orden_web_items, public.ordenes_web, public.sales

### Community 38 - "Migrations Customer Multi Phones"
Cohesion: 0.48
Nodes (6): customer_phones_collision, customers_phone_collision, public.customer_phones, public.customer_phones_all, public.customer_phones_check_collision(), public.customers_check_phone_collision()

### Community 39 - "Migrations Roles Permisos Flexibles"
Cohesion: 0.40
Nodes (3): public.profiles, public.role_permissions, public.roles

### Community 40 - "Scripts Seed Product Images"
Cohesion: 0.47
Nodes (5): admin, EXT_BY_TYPE, extFor(), main(), resolveId()

### Community 41 - "App App Adelantos Page"
Cohesion: 0.40
Nodes (4): AdelantosPage(), Row, Adelanto, AdelantoProducto

### Community 42 - "Migrations Add Loans Fiado"
Cohesion: 0.60
Nodes (3): public.cancel_loan(), public.sales, public.settle_loan()

### Community 44 - "Migrations Cotizaciones"
Cohesion: 0.70
Nodes (3): public.convertir_cotizacion(), public.cotizacion_items, public.cotizaciones

### Community 45 - "Whatsapp Memory And Config"
Cohesion: 0.50
Nodes (3): config_negocio_touch_updated_at, public.config_negocio, public.wa_mensajes

### Community 46 - "Migrations Conversation Handoff"
Cohesion: 0.50
Nodes (3): conversaciones_touch_updated_at, public.config_negocio, public.conversaciones

### Community 47 - "Migrations Devoluciones"
Cohesion: 1.00
Nodes (3): public.devolucion_items, public.devoluciones, public.devolver_items()

### Community 48 - "Migrations Customers"
Cohesion: 0.50
Nodes (3): customers_touch_updated_at, public.customers, public.sales

### Community 50 - "Md Database Insert Pattern"
Cohesion: 0.67
Nodes (3): Array-based database inserts, InsForge backend guidance, Storage URL and key persistence

### Community 51 - "Refaccionaria Features Customer Identity"
Cohesion: 0.67
Nodes (3): Customer identity foundation, Registered customer required for sales, Credit-note cashier payment flow

### Community 52 - "E3 Digital Return Voucher"
Cohesion: 0.67
Nodes (3): Digital return voucher balance, Gated cash-refund exception, Warranty workflow

### Community 55 - "Webp Mobile Parts Hero"
Cohesion: 0.67
Nodes (3): Mobile parts hero image, Apple brand logo, Samsung brand logo

## Ambiguous Edges - Review These
- `Mobile parts hero image` → `Apple brand logo`  [AMBIGUOUS]
  public/hero.webp · relation: contextually_relates_to
- `Mobile parts hero image` → `Samsung brand logo`  [AMBIGUOUS]
  public/hero.webp · relation: contextually_relates_to

## Knowledge Gaps
- **278 isolated node(s):** `Row`, `METODOS`, `VentaRow`, `DevolRow`, `Row` (+273 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **36 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Mobile parts hero image` and `Apple brand logo`?**
  _Edge tagged AMBIGUOUS (relation: contextually_relates_to) - confidence is low._
- **What is the exact relationship between `Mobile parts hero image` and `Samsung brand logo`?**
  _Edge tagged AMBIGUOUS (relation: contextually_relates_to) - confidence is low._
- **Why does `cn()` connect `Components Ui Badge` to `App App Caja Page`, `App Cotizaciones Id Page`, `App Tienda Id Page`, `Api Inventario Export Route`, `Lib Types Inventory`, `App App Ventas Page`, `App Error`, `Lib Conekta Client`, `App Layout`, `Cotizaciones Id Editar Page`, `Components Ui Card`, `App App Fiados Page`, `App Tienda Checkout Page`, `Lib Money`, `App App Cotizaciones Page`?**
  _High betweenness centrality (0.130) - this node is a cross-community bridge._
- **Why does `dependencies` connect `Ai` to `Autoprefixer`?**
  _High betweenness centrality (0.093) - this node is a cross-community bridge._
- **Why does `DesktopModal()` connect `Components Ui Badge` to `Ai`?**
  _High betweenness centrality (0.079) - this node is a cross-community bridge._
- **What connects `Row`, `METODOS`, `VentaRow` to the rest of the system?**
  _278 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `App App Caja Page` be split into smaller, more focused modules?**
  _Cohesion score 0.05575065847234416 - nodes in this community are weakly interconnected._