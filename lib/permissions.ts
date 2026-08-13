// Permission catalog — client-safe (pure data, no server imports), so the role
// editor UI and server guards share one source of truth.
//
// Permission KEYS are code-defined: each one gates a real capability the app
// checks. An admin composes roles out of these; they can't invent a key the code
// doesn't honor. Adding a capability means adding a key here AND the check that
// reads it.

export const PERMISOS = [
  "admin_total",
  "pos_vender",
  "cotizar",
  "cotizaciones_ver_todas",
  "cotizaciones_reasignar",
  "autorizar",
  "cotizaciones_convertir",
  "surtir",
  "inventario_ver",
  "inventario_gestionar",
  "precios_gestionar",
  "costos_ver",
  "ventas_ver",
  "corte_ver",
  "facturar",
  "devoluciones",
  "garantias_aprobar",
  "usuarios_gestionar",
] as const;

export type Permiso = (typeof PERMISOS)[number];

// Grouped, labelled catalog for the role editor.
export const CATALOGO_PERMISOS: {
  grupo: string;
  permisos: { key: Permiso; label: string; desc: string }[];
}[] = [
  {
    grupo: "Ventas y cotización",
    permisos: [
      { key: "pos_vender", label: "Vender en el POS", desc: "Registrar ventas y cobrar en mostrador." },
      { key: "cotizar", label: "Cotizar", desc: "Crear cotizaciones." },
      { key: "cotizaciones_ver_todas", label: "Ver todas las cotizaciones", desc: "No solo las asignadas a él." },
      { key: "cotizaciones_reasignar", label: "Reasignar cotizaciones", desc: "Pasar una cotización a otro vendedor." },
      { key: "autorizar", label: "Autorizar cotización", desc: "Marcar una cotización como aceptada por el cliente." },
      { key: "cotizaciones_convertir", label: "Marcar la venta", desc: "Convertir una cotización autorizada en venta. Requiere un rol de mayor nivel." },
    ],
  },
  {
    grupo: "Surtido e inventario",
    permisos: [
      { key: "surtir", label: "Surtir", desc: "Preparar y marcar pedidos surtidos, incluido parcial." },
      { key: "inventario_ver", label: "Ver inventario", desc: "Consultar existencias." },
      { key: "inventario_gestionar", label: "Gestionar inventario", desc: "Importar, ajustar y editar el catálogo." },
    ],
  },
  {
    grupo: "Precios y finanzas",
    permisos: [
      { key: "precios_gestionar", label: "Gestionar precios", desc: "Listas de precio y precios base." },
      { key: "costos_ver", label: "Ver costos y márgenes", desc: "Información sensible de rentabilidad." },
      { key: "ventas_ver", label: "Ver ventas anuales", desc: "Columna de rotación en Inventario: cuántas piezas se vendieron en el año." },
      { key: "corte_ver", label: "Ver corte y reportes", desc: "Corte de caja y reportes financieros." },
      { key: "facturar", label: "Facturar", desc: "Emitir CFDI." },
      { key: "devoluciones", label: "Devoluciones y anulaciones", desc: "Devolver productos y anular ventas." },
      { key: "garantias_aprobar", label: "Aprobar garantías", desc: "Decidir qué se le da al cliente. Quien reporta la garantía no la aprueba." },
    ],
  },
  {
    grupo: "Administración",
    permisos: [
      { key: "usuarios_gestionar", label: "Gestionar usuarios y roles", desc: "Crear roles, asignar permisos, administrar usuarios." },
      { key: "admin_total", label: "Control total (admin)", desc: "Acceso completo. Equivale a administrador." },
    ],
  },
];

export const LABEL_PERMISO: Record<Permiso, string> = Object.fromEntries(
  CATALOGO_PERMISOS.flatMap((g) => g.permisos.map((p) => [p.key, p.label])),
) as Record<Permiso, string>;
