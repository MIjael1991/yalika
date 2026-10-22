/**
 * Permisos extra que el administrador puede dar a un cajero, persona por
 * persona. Sin ninguno, el cajero solo vende y cobra. El administrador y los
 * demás roles no los necesitan: ya pueden todo.
 *
 * Además de la lista fija hay un permiso por artículo, `returns_item:<id del
 * producto>`: deja devolver o cambiar solo ese producto (para cuando el
 * administrador no está). No requiere el permiso general de devoluciones.
 */
export const cashierGrantablePermissions = [
  'returns',
  'refunds',
  'discounts',
  'reports',
  'catalog',
] as const;

export type CashierPermission = (typeof cashierGrantablePermissions)[number];

export const cashierPermissionLabels: Record<CashierPermission, string> = {
  returns: 'Devoluciones y cambios',
  refunds: 'Reembolsos (devolver dinero)',
  discounts: 'Descuentos escritos a mano',
  reports: 'Reportes de ventas y alertas de inventario',
  catalog: 'Agregar productos nuevos',
};

export const ITEM_RETURN_PREFIX = 'returns_item:';
export const MAX_ITEM_PERMISSIONS = 20;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Permiso para devolver o cambiar un solo producto. */
export function itemReturnPermission(productId: string) {
  return `${ITEM_RETURN_PREFIX}${productId.toLowerCase()}`;
}

/** Ids de producto autorizados con `returns_item:`. */
export function itemReturnProductIds(
  permissions: readonly string[] | undefined,
): string[] {
  return (permissions ?? [])
    .filter((permission) => permission.startsWith(ITEM_RETURN_PREFIX))
    .map((permission) => permission.slice(ITEM_RETURN_PREFIX.length))
    .filter((id) => uuid.test(id));
}

export function isValidGrantedPermission(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  if ((cashierGrantablePermissions as readonly string[]).includes(value)) {
    return true;
  }
  return (
    value.startsWith(ITEM_RETURN_PREFIX) &&
    uuid.test(value.slice(ITEM_RETURN_PREFIX.length))
  );
}

/** Deja solo permisos válidos, sin repetir y en orden estable. */
export function cleanPermissions(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const fixed = cashierGrantablePermissions.filter((permission) =>
    input.includes(permission),
  );
  const items = [
    ...new Set(
      input
        .filter(
          (value): value is string =>
            typeof value === 'string' &&
            value.startsWith(ITEM_RETURN_PREFIX) &&
            uuid.test(value.slice(ITEM_RETURN_PREFIX.length)),
        )
        .map((value) => value.toLowerCase()),
    ),
  ]
    .sort()
    .slice(0, MAX_ITEM_PERMISSIONS);
  return [...fixed, ...items];
}
