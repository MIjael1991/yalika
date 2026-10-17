import { lookupOpenFoodFacts } from './barcode-lookup';

const ok = (payload: unknown) => jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(payload) });

describe('Sugerencia de nombre por código de barras', () => {
  it('un código que no son 8 a 14 dígitos nunca sale a internet', async () => {
    const fetchMock = ok({});
    for (const code of ['', 'abc', '1234567', '123456789012345', '7501031311309; DROP', '../etc/passwd']) {
      await expect(lookupOpenFoodFacts(code, fetchMock)).resolves.toEqual({ found: false });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('arma el nombre con marca y contenido sin repetir lo que ya trae', async () => {
    const fetchMock = ok({
      status: 1,
      product: { product_name: 'Papas Originales', brands: 'Sabritas, PepsiCo', quantity: '45 g' },
    });

    await expect(lookupOpenFoodFacts('7501011111111', fetchMock)).resolves.toEqual({
      found: true,
      name: 'Sabritas Papas Originales 45 g',
      source: 'openfoodfacts',
    });
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://world.openfoodfacts.org/api/v2/product/7501011111111.json?fields=product_name,product_name_es,brands,quantity',
    );
  });

  it('prefiere el nombre en español y no duplica la marca ni el contenido', async () => {
    const fetchMock = ok({
      status: 1,
      product: { product_name: 'Bread', product_name_es: 'Pan Blanco Bimbo 680 g', brands: 'Bimbo', quantity: '680 g' },
    });

    expect((await lookupOpenFoodFacts('7501030400001', fetchMock)).name).toBe('Pan Blanco Bimbo 680 g');
  });

  it('producto inexistente o sin nombre no sugiere nada', async () => {
    await expect(lookupOpenFoodFacts('7501011111111', ok({ status: 0 }))).resolves.toEqual({ found: false });
    await expect(
      lookupOpenFoodFacts('7501011111111', ok({ status: 1, product: { product_name: '  ' } })),
    ).resolves.toEqual({ found: false });
  });

  it('sin internet, con error del servicio o respuesta rota no falla: solo no sugiere', async () => {
    await expect(
      lookupOpenFoodFacts('7501011111111', jest.fn().mockRejectedValue(new Error('offline'))),
    ).resolves.toEqual({ found: false });
    await expect(
      lookupOpenFoodFacts('7501011111111', jest.fn().mockResolvedValue({ ok: false, json: () => Promise.resolve({}) })),
    ).resolves.toEqual({ found: false });
    await expect(
      lookupOpenFoodFacts('7501011111111', jest.fn().mockResolvedValue({ ok: true, json: () => Promise.reject(new Error('x')) })),
    ).resolves.toEqual({ found: false });
  });

  it('si tarda más del límite se corta', async () => {
    const slow = jest.fn(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(new Error('abortado')));
        }),
    );

    await expect(
      lookupOpenFoodFacts('7501011111111', slow as never, 20),
    ).resolves.toEqual({ found: false });
  });

  it('recorta nombres larguísimos', async () => {
    const fetchMock = ok({ status: 1, product: { product_name: 'x'.repeat(400) } });
    expect((await lookupOpenFoodFacts('7501011111111', fetchMock)).name).toHaveLength(160);
  });
});
