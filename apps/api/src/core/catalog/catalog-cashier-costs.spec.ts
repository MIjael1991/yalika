import { CatalogController } from './catalog.controller';
import { forRole, stripCosts } from './strip-costs';

/**
 * El cajero no ve costos. Se prueba la función y también las tres rutas del
 * catálogo por las que antes salían (lista, producto y lectura de código).
 */

const product = () => ({
  id: 'p1',
  name: 'Collar',
  price: 149,
  unitCost: 60,
  stock: 4,
  createdAt: new Date('2026-10-01T00:00:00Z'),
  variants: [{ id: 'v1', name: 'M', price: 150, unitCost: 62, stock: 2 }],
  barcodes: [{ id: 'b1', value: '7501' }],
});

describe('Costos fuera del alcance del cajero', () => {
  it('quita costo del producto y de cada talla, y no toca nada más', () => {
    const clean: any = stripCosts([product()])[0];
    expect(clean.unitCost).toBeUndefined();
    expect(clean.variants[0].unitCost).toBeUndefined();
    expect(clean).toMatchObject({ id: 'p1', name: 'Collar', price: 149, stock: 4 });
    expect(clean.variants[0]).toMatchObject({ id: 'v1', price: 150, stock: 2 });
    expect(clean.createdAt).toBeInstanceOf(Date);
    expect(clean.barcodes).toEqual([{ id: 'b1', value: '7501' }]);
  });

  it('no modifica el original', () => {
    const original = product();
    stripCosts(original);
    expect(original.unitCost).toBe(60);
    expect(original.variants[0].unitCost).toBe(62);
  });

  it('quita también costo promedio y costo por caja, en cualquier nivel', () => {
    const clean: any = stripCosts({ product: { averageCost: 3, costPerPack: 9, nested: [{ unitCost: 1, ok: true }] } });
    expect(clean).toEqual({ product: { nested: [{ ok: true }] } });
  });

  it('el administrador recibe todo', () => {
    const data = [product()];
    expect(forRole(data, false)).toBe(data);
    expect((forRole(data, false)[0] as any).unitCost).toBe(60);
  });

  it('valores sueltos pasan igual', () => {
    expect(stripCosts(null)).toBeNull();
    expect(stripCosts(7)).toBe(7);
    expect(stripCosts('x')).toBe('x');
  });

  describe('rutas del catálogo', () => {
    const cashier = { user: { companyId: 'c1', role: { name: 'Cajero' } } } as any;
    const admin = { user: { companyId: 'c1', role: { name: 'Administrador' } } } as any;

    function setup() {
      const service = {
        findProductsByCompany: jest.fn().mockResolvedValue([product()]),
        findProduct: jest.fn().mockResolvedValue(product()),
        resolveBarcode: jest.fn().mockResolvedValue({ value: '7501', product: product(), variant: product().variants[0] }),
      };
      return { controller: new CatalogController(service as never, {} as never), service };
    }

    it('lista de productos', async () => {
      const { controller } = setup();
      const forCashier: any = await controller.findProductsByCompany('c1', cashier);
      const forAdmin: any = await controller.findProductsByCompany('c1', admin);
      expect(forCashier[0].unitCost).toBeUndefined();
      expect(forCashier[0].variants[0].unitCost).toBeUndefined();
      expect(forCashier[0].price).toBe(149);
      expect(forAdmin[0].unitCost).toBe(60);
    });

    it('un producto', async () => {
      const { controller } = setup();
      expect(((await controller.findProduct('p1', cashier)) as any).unitCost).toBeUndefined();
      expect(((await controller.findProduct('p1', admin)) as any).unitCost).toBe(60);
    });

    it('lectura de código de barras', async () => {
      const { controller } = setup();
      const forCashier: any = await controller.resolveBarcode('c1', '7501', cashier);
      const forAdmin: any = await controller.resolveBarcode('c1', '7501', admin);
      expect(forCashier.product.unitCost).toBeUndefined();
      expect(forCashier.variant.unitCost).toBeUndefined();
      expect(forCashier.product.price).toBe(149);
      expect(forAdmin.product.unitCost).toBe(60);
    });
  });
});
