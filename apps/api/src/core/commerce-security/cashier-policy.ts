/**
 * Qué puede hacer una persona con el rol Cajero dentro del comercio.
 *
 * Es una lista de permitidos: todo lo que no aparezca aquí queda reservado
 * al administrador (catálogo, inventario, sitios, promociones, programas de
 * lealtad, configuración de raspaditos, devoluciones, descuentos manuales,
 * reportes y asistente). Del descuento solo puede aplicar una promoción
 * vigente de la empresa: el servidor toma de ella el tipo y el valor, el
 * cajero no puede escribirlos. El resto de roles no pasa por esta lista.
 */
type Body = Record<string, unknown> | undefined;
type Rule = {
  method: string;
  root: string;
  path: RegExp;
  /** Condición extra sobre el cuerpo de la solicitud. */
  body?: (body: Body) => boolean;
};

const any = '[^/]+';

/** Consultar es seguro para la caja: catálogo, clientes, ventas, etc. */
const readableRoots = [
  'catalog',
  'customer',
  'order',
  'payment',
  'order-split',
  'discount',
  'return',
  'promotion',
  'loyalty-program',
  'scratch',
  'dining-table',
  'recipe',
];

const rules: Rule[] = [
  ...readableRoots.map((root) => ({ method: 'GET', root, path: /^.*$/ })),

  // Vender: crear la cuenta, confirmarla, cancelarla y cobrar.
  { method: 'POST', root: 'order', path: /^$/ },
  {
    method: 'POST',
    root: 'order',
    path: new RegExp(`^${any}/(confirm|cancel)$`),
  },
  {
    method: 'POST',
    root: 'order',
    path: new RegExp(`^company/${any}/expire-abandoned$`),
  },
  { method: 'POST', root: 'payment', path: new RegExp(`^order/${any}$`) },
  {
    method: 'POST',
    root: 'discount',
    path: new RegExp(`^order/${any}$`),
    body: (body) =>
      body?.source === 'promotion' &&
      typeof body.promotionId === 'string' &&
      body.promotionId.length > 0,
  },
  { method: '*', root: 'order-split', path: /^.*$/ },

  // Atender: clientes, mesas, identificación en caja, premios y recetas.
  { method: 'POST', root: 'customer', path: /^$/ },
  { method: '*', root: 'dining-table', path: /^.*$/ },
  {
    method: 'POST',
    root: 'engagement',
    path: new RegExp(`^company/${any}/identify$`),
  },
  {
    method: 'POST',
    root: 'scratch',
    path: new RegExp(`^company/${any}/redeem$`),
  },
  {
    method: 'POST',
    root: 'recipe',
    path: new RegExp(`^product/${any}/consume$`),
  },
];

export function cashierMayCall(
  method: string,
  parts: string[],
  body?: Body,
): boolean {
  const [root, ...rest] = parts;
  const path = rest.join('/');
  const verb = method.toUpperCase();

  return rules.some(
    (rule) =>
      rule.root === root &&
      (rule.method === '*' || rule.method === verb) &&
      rule.path.test(path) &&
      (!rule.body || rule.body(body)),
  );
}
