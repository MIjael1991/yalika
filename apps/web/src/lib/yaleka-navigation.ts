export const destinations = [
  {
    id: "home",
    name: "Inicio",
    detail: "Busca, pregunta y encuentra tus servicios",
    href: "/inicio",
    module: "",
    words: "inicio buscar ayuda asistente",
  },
  {
    id: "day",
    name: "Mi día",
    detail: "Tareas, recordatorios y agenda",
    href: "/life",
    module: "",
    words: "agenda tarea tareas pendientes recordatorio calendario hoy",
  },
  {
    id: "studio",
    name: "Estudio",
    detail: "Escribe y organiza tus archivos",
    href: "/estudio",
    module: "",
    words: "estudio escribir documento borrador",
  },
  {
    id: "files",
    name: "Mis archivos",
    detail: "Archivos guardados en este navegador",
    href: "/estudio?tab=archivos",
    module: "",
    words: "archivos documentos pdf imagen foto hoja excel",
  },
  {
    id: "surveys",
    name: "Encuestas",
    detail: "Preguntas, formularios y resultados",
    href: "/encuestas",
    module: "surveys",
    words:
      "encuesta encuestas pregunta preguntas formulario respuestas resultados",
  },
  {
    id: "health",
    name: "Salud",
    detail: "Tu información y atención de salud",
    href: "/salud",
    module: "health",
    words:
      "salud receta recetas alergias medicina medicamentos estudios cita paciente doctor",
  },
  {
    id: "professional",
    name: "Red de Salud",
    detail: "Establecimientos y profesionales",
    href: "/salud/profesional",
    module: "health",
    words:
      "clinica farmacia consultorio profesional cedula establecimiento medico",
  },
  {
    id: "pos",
    name: "Punto de venta",
    detail: "Mi caja y ventas",
    href: "/pos",
    module: "pos",
    words: "caja cobrar punto venta vender negocio",
  },
  {
    id: "products",
    name: "Productos",
    detail: "Consulta y administra tus productos",
    href: "/pos/productos",
    module: "pos",
    words: "producto productos precios precio cambiar codigo",
  },
  {
    id: "stock",
    name: "Inventario",
    detail: "Existencias y movimientos",
    href: "/pos/inventario",
    module: "pos",
    words: "inventario existencias stock entradas almacen",
  },
  {
    id: "sales",
    name: "Ventas",
    detail: "Historial de ventas",
    href: "/pos/ventas",
    module: "pos",
    words: "ventas historial ticket comprobante",
  },
  {
    id: "sites",
    name: "Mis páginas",
    detail: "Tu página y catálogo existentes",
    href: "/sites",
    module: "sites",
    words: "pagina paginas web catalogo sitio tienda internet",
  },
  {
    id: "services",
    name: "Mis servicios",
    detail: "Elige qué mostrar en tu inicio",
    href: "/servicios",
    module: "",
    words:
      "servicios modulos activar ocultar agregar paquetes movilidad transporte educacion",
  },
  {
    id: "account",
    name: "Mi cuenta",
    detail: "Perfil y seguridad",
    href: "/cuenta",
    module: "",
    words: "cuenta perfil contrasena nombre sesion",
  },
] as const;

export function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .trim();
}
const vocabulary: Record<string, string[]> = {
  day: [
    "pendiente",
    "recordar",
    "recordarme",
    "recordatorios",
    "organizar",
    "actividad",
    "actividades",
  ],
  health: [
    "medicamento",
    "medicacion",
    "prescripcion",
    "pastilla",
    "pastillas",
    "tratamiento",
    "historia",
    "expediente",
  ],
  pos: ["cobro", "cobrar", "registradora", "venta", "ticket"],
  products: [
    "precio",
    "precios",
    "articulo",
    "articulos",
    "mercancia",
    "codigo",
    "barcode",
  ],
  stock: [
    "stock",
    "existencia",
    "existencias",
    "agotado",
    "agotados",
    "reponer",
    "reposicion",
    "almacen",
  ],
  sales: ["ingresos", "vendido", "facturacion", "historial"],
  sites: [
    "escaparate",
    "promocion",
    "promociones",
    "descuento",
    "descuentos",
    "raspadito",
    "raspaditos",
    "fidelizacion",
    "catalogo",
  ],
  account: ["clave", "contrasena", "password", "perfil"],
  files: ["pdf", "excel", "foto", "fotos", "documentos", "documento"],
  surveys: [
    "sondeo",
    "cuestionario",
    "cuestionarios",
    "formulario",
    "formularios",
    "respuestas",
  ],
};
const ignored = new Set(
  "mi mis la las el los de del que quiero donde esta estan como un una a para ver por favor necesito puedes puedo ayuda ayudame con y o al en me se lo los le les tengo hacer cambiar cambio buscar busca encontrar consultar abrir ir es esto algo saber cuanto cuanta".split(
    " ",
  ),
);
// Distancia acotada: una omisión, sustitución o transposición; no inventa sinónimos.
function near(a: string, b: string) {
  if (a.length < 5 || b.length < 5 || Math.abs(a.length - b.length) > 1)
    return false;
  if (a === b) return true;
  if (a.length === b.length) {
    const diffs = [];
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diffs.push(i);
    return (
      diffs.length === 1 ||
      (diffs.length === 2 &&
        diffs[1] === diffs[0] + 1 &&
        a[diffs[0]] === b[diffs[1]] &&
        a[diffs[1]] === b[diffs[0]])
    );
  }
  const short = a.length < b.length ? a : b,
    long = a.length < b.length ? b : a;
  let i = 0;
  while (i < short.length && short[i] === long[i]) i++;
  return short.slice(i) === long.slice(i + 1);
}
export function searchDestinations(
  query: string,
  available: readonly string[],
) {
  const words = [
    ...new Set(
      normalizeSearch(query.slice(0, 180))
        .split(/\s+/)
        .filter((w) => w.length > 1 && !ignored.has(w)),
    ),
  ].slice(0, 18);
  if (!words.length) return [];
  const allowed = destinations.filter(
    (d) => !d.module || available.includes(d.module),
  );
  const allTerms = allowed.flatMap((d) =>
    normalizeSearch(
      d.name + " " + d.words + " " + (vocabulary[d.id] ?? []).join(" "),
    ).split(/\s+/),
  );
  return allowed
    .map((d) => {
      const primary = normalizeSearch(d.name + " " + d.words).split(/\s+/);
      const aliases = vocabulary[d.id] ?? [];
      let direct = 0,
        related = 0,
        similar = 0;
      for (const word of words) {
        if (primary.includes(word)) direct++;
        else if (aliases.includes(word)) related++;
        else if (
          !allTerms.includes(word) &&
          [...primary, ...aliases].some((t) => near(word, t))
        )
          similar++;
      }
      const matches = direct + related + similar;
      const inventoryIntent =
        d.id === "stock" &&
        /(?:pocos|faltan|agotados|reponer).*(?:productos|articulos|mercancia)|(?:productos|articulos).*(?:agotados|pocos)/.test(
          normalizeSearch(query),
        );
      const culinary =
        d.id === "health" &&
        words.some((w) =>
          ["pastel", "cocina", "comida", "cocinar", "galletas"].includes(w),
        );
      const matchKind = inventoryIntent
        ? "related"
        : similar > 0
          ? "similar"
          : related > 0 || matches < words.length
            ? "related"
            : "exact";
      const reason =
        matchKind === "similar"
          ? "Puede que hayas querido decir…"
          : matchKind === "related"
            ? "Función relacionada con tu búsqueda"
            : "Coincide con tu búsqueda";
      return {
        ...d,
        score: culinary
          ? 0
          : inventoryIntent
            ? 15
            : matches / words.length >= 0.5
              ? direct * 5 + related * 4 + similar * 2
              : 0,
        matchKind,
        reason,
      };
    })
    .filter((d) => d.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}
