/**
 * Permisos extra de un cajero (los da el administrador, persona por persona).
 * Se suman a lo que el cajero ya puede hacer en `cashier-policy.ts`; sin
 * permisos, esta lista no abre nada.
 */
type Grant = {
  permission: string;
  method: string;
  root: string;
  path: RegExp;
};

const any = '[^/]+';

const grants: Grant[] = [
  // Devoluciones y cambios (el cambio es una devolución de tipo "exchange").
  { permission: 'returns', method: 'POST', root: 'return', path: /^$/ },
  {
    permission: 'returns',
    method: 'POST',
    root: 'return',
    path: new RegExp(`^${any}/(confirm|cancel)$`),
  },

  // Devolver o cambiar solo un producto autorizado (el servicio revisa que todo lo
  // devuelto sea de esos productos y que solo confirme lo que esa persona creó).
  { permission: 'returns_item', method: 'POST', root: 'return', path: /^$/ },
  {
    permission: 'returns_item',
    method: 'POST',
    root: 'return',
    path: new RegExp(`^${any}/(confirm|cancel)$`),
  },

  // Agregar productos nuevos (no editar ni borrar los que ya existen).
  { permission: 'catalog', method: 'POST', root: 'catalog', path: /^product$/ },
  { permission: 'catalog', method: 'POST', root: 'catalog', path: /^category$/ },
  {
    permission: 'catalog',
    method: 'POST',
    root: 'catalog',
    path: new RegExp(`^product/${any}/(image|variant|barcodes|barcodes/generate)$`),
  },

  // Subir la foto de un producto nuevo.
  { permission: 'catalog', method: 'POST', root: 'media', path: /^image$/ },

  // Devolver dinero: es un permiso aparte de la devolución.
  {
    permission: 'refunds',
    method: 'POST',
    root: 'return',
    path: new RegExp(`^${any}/refund$`),
  },

  // Descuento escrito a mano (anularlo sigue siendo del administrador).
  {
    permission: 'discounts',
    method: 'POST',
    root: 'discount',
    path: new RegExp(`^order/${any}$`),
  },

  // Reportes de ventas y alertas de inventario.
  {
    permission: 'reports',
    method: 'GET',
    root: 'order',
    path: new RegExp(`^company/${any}/report$`),
  },
  {
    permission: 'reports',
    method: 'GET',
    root: 'catalog',
    path: new RegExp(`^product/company/${any}/stock-alerts$`),
  },
];

function hasGrant(permissions: readonly string[], permission: string) {
  return permission === 'returns_item'
    ? permissions.some((value) => value.startsWith('returns_item:'))
    : permissions.includes(permission);
}

export function grantedMayCall(
  permissions: readonly string[] | undefined,
  method: string,
  parts: string[],
): boolean {
  if (!permissions?.length) return false;
  const [root, ...rest] = parts;
  const path = rest.join('/');
  const verb = method.toUpperCase();

  return grants.some(
    (grant) =>
      hasGrant(permissions, grant.permission) &&
      grant.root === root &&
      grant.method === verb &&
      grant.path.test(path),
  );
}
