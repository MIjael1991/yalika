import {
  cleanPermissions,
  isValidGrantedPermission,
  itemReturnPermission,
  itemReturnProductIds,
  MAX_ITEM_PERMISSIONS,
} from './permissions';

const id = '8f0a2e0c-0000-4000-8000-000000000001';

describe('Permisos del cajero', () => {
  it('deja solo permisos válidos, sin repetir y en orden estable', () => {
    expect(cleanPermissions(['reports', 'nada', 'catalog', 'reports', 'returns'])).toEqual([
      'returns',
      'reports',
      'catalog',
    ]);
    expect(cleanPermissions('returns')).toEqual([]);
  });

  it('acepta el permiso por artículo con un id de producto válido', () => {
    expect(cleanPermissions([`returns_item:${id.toUpperCase()}`, 'returns_item:no-es-id'])).toEqual([
      `returns_item:${id}`,
    ]);
    expect(isValidGrantedPermission(itemReturnPermission(id))).toBe(true);
    expect(isValidGrantedPermission('returns_item:123')).toBe(false);
    expect(isValidGrantedPermission('admin')).toBe(false);
  });

  it('limita cuántos artículos se pueden autorizar', () => {
    const many = Array.from({ length: 40 }, (_, i) => `returns_item:8f0a2e0c-0000-4000-8000-${String(i).padStart(12, '0')}`);
    expect(itemReturnProductIds(cleanPermissions(many))).toHaveLength(MAX_ITEM_PERMISSIONS);
  });

  it('itemReturnProductIds ignora lo que no es permiso por artículo', () => {
    expect(itemReturnProductIds(['returns', `returns_item:${id}`])).toEqual([id]);
  });
});
