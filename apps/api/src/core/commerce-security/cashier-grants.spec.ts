import { cashierMayCall } from './cashier-policy';
import { grantedMayCall } from './cashier-grants';

const id = '8f0a2e0c-0000-4000-8000-000000000001';

describe('Permisos extra del cajero', () => {
  it('sin permisos no abre nada', () => {
    expect(grantedMayCall([], 'POST', ['return'])).toBe(false);
    expect(grantedMayCall(undefined, 'POST', ['return', id, 'refund'])).toBe(
      false,
    );
  });

  it('devoluciones y cambios: crear, confirmar y cancelar, pero no devolver dinero', () => {
    const permissions = ['returns'];
    expect(grantedMayCall(permissions, 'POST', ['return'])).toBe(true);
    expect(grantedMayCall(permissions, 'POST', ['return', id, 'confirm'])).toBe(
      true,
    );
    expect(grantedMayCall(permissions, 'POST', ['return', id, 'cancel'])).toBe(
      true,
    );
    expect(grantedMayCall(permissions, 'POST', ['return', id, 'refund'])).toBe(
      false,
    );
  });

  it('reembolsos: solo devolver dinero sobre una devolución', () => {
    const permissions = ['refunds'];
    expect(grantedMayCall(permissions, 'POST', ['return', id, 'refund'])).toBe(
      true,
    );
    expect(grantedMayCall(permissions, 'POST', ['return'])).toBe(false);
    expect(grantedMayCall(permissions, 'POST', ['return', id, 'confirm'])).toBe(
      false,
    );
  });

  it('descuentos a mano: aplicar sí, anular no', () => {
    const permissions = ['discounts'];
    expect(grantedMayCall(permissions, 'POST', ['discount', 'order', id])).toBe(
      true,
    );
    expect(grantedMayCall(permissions, 'POST', ['discount', id, 'void'])).toBe(
      false,
    );
  });

  it('reportes: solo lectura de reporte y alertas', () => {
    const permissions = ['reports'];
    expect(
      grantedMayCall(permissions, 'GET', ['order', 'company', id, 'report']),
    ).toBe(true);
    expect(
      grantedMayCall(permissions, 'GET', [
        'catalog',
        'product',
        'company',
        id,
        'stock-alerts',
      ]),
    ).toBe(true);
    expect(
      grantedMayCall(permissions, 'POST', ['order', 'company', id, 'report']),
    ).toBe(false);
  });

  it('un permiso no abre lo de otro ni lo reservado al administrador', () => {
    const all = ['returns', 'refunds', 'discounts', 'reports'];
    expect(grantedMayCall(all, 'POST', ['catalog', 'product'])).toBe(false);
    expect(grantedMayCall(all, 'POST', ['inventory', 'receive'])).toBe(false);
    expect(grantedMayCall(all, 'POST', ['promotion'])).toBe(false);
    expect(grantedMayCall(all, 'PUT', ['reservation', 'company', id])).toBe(
      false,
    );
  });

  it('los permisos extra no cambian lo que el cajero ya podía', () => {
    expect(cashierMayCall('POST', ['order'])).toBe(true);
    expect(cashierMayCall('POST', ['return'])).toBe(false);
    expect(cashierMayCall('POST', ['return', id, 'refund'])).toBe(false);
  });
});
