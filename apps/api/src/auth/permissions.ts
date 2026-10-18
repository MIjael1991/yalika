/**
 * Permisos extra que el administrador puede dar a un cajero, persona por
 * persona. Sin ninguno, el cajero solo vende y cobra. El administrador y los
 * demás roles no los necesitan: ya pueden todo.
 */
export const cashierGrantablePermissions = [
  'returns',
  'refunds',
  'discounts',
  'reports',
] as const;

export type CashierPermission = (typeof cashierGrantablePermissions)[number];

export const cashierPermissionLabels: Record<CashierPermission, string> = {
  returns: 'Devoluciones y cambios',
  refunds: 'Reembolsos (devolver dinero)',
  discounts: 'Descuentos escritos a mano',
  reports: 'Reportes de ventas y alertas de inventario',
};

/** Deja solo permisos válidos, sin repetir y en orden estable. */
export function cleanPermissions(input: unknown): CashierPermission[] {
  if (!Array.isArray(input)) return [];
  return cashierGrantablePermissions.filter((permission) =>
    input.includes(permission),
  );
}
