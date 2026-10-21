/** adminOnly: el cajero no ve ni entra a esta pantalla. */
export type ModuleLink = { name: string; href: string; adminOnly?: boolean };
export const moduleNavigation = [
  {
    id: "pos",
    name: "Punto de venta",
    root: "/pos",
    items: [
      { name: "Caja", href: "/pos" },
      { name: "Productos", href: "/pos/productos", adminOnly: true },
      { name: "Inventario", href: "/pos/inventario", adminOnly: true },
      { name: "Apartados", href: "/pos/apartados" },
      { name: "Ventas", href: "/pos/ventas" },
      { name: "Pendientes", href: "/pos/cuentas" },
      { name: "Devoluciones", href: "/pos/devoluciones", adminOnly: true },
      { name: "Equipo", href: "/pos/equipo", adminOnly: true },
    ],
  },
  {
    id: "health",
    name: "Salud",
    root: "/salud",
    items: [
      { name: "Mi salud", href: "/salud" },
      { name: "Historia", href: "/salud/historia" },
      { name: "Consultas", href: "/salud/consultas" },
      { name: "Compartir por QR", href: "/salud/qr" },
      { name: "Emergencia", href: "/salud/emergencia" },
    ],
  },
  {
    id: "sites",
    name: "Mis páginas",
    root: "/sites",
    items: [
      { name: "Mi página y catálogo", href: "/sites" },
      { name: "Diseñar mi página", href: "/sites/studio" },
    ],
  },
  {
    id: "surveys",
    name: "Encuestas",
    root: "/encuestas",
    items: [{ name: "Mis encuestas", href: "/encuestas" }],
  },
  {
    id: "life",
    name: "Mi día",
    root: "/life",
    items: [{ name: "Agenda y pendientes", href: "/life" }],
  },
  {
    id: "studio",
    name: "Estudio",
    root: "/estudio",
    items: [
      { name: "¿Qué quieres hacer?", href: "/estudio" },
      { name: "Escribir un documento", href: "/estudio?tab=documento" },
      { name: "Convertir archivos", href: "/estudio?tab=convertir" },
      { name: "Mis archivos", href: "/estudio?tab=archivos" },
    ],
  },
];
export function moduleForPath(path: string) {
  return moduleNavigation.find(
    (m) => path === m.root || path.startsWith(m.root + "/"),
  );
}
