import { publicBaseUrl } from './public-url';

describe('dirección pública de Yalika', () => {
  const previous = process.env.YALIKA_PUBLIC_URL;

  afterEach(() => {
    if (previous === undefined) delete process.env.YALIKA_PUBLIC_URL;
    else process.env.YALIKA_PUBLIC_URL = previous;
  });

  it('quita espacios y diagonales finales', () => {
    process.env.YALIKA_PUBLIC_URL = '  https://app.ejemplo.com//  ';
    expect(publicBaseUrl()).toBe('https://app.ejemplo.com');
  });

  it('si falta o no es una dirección web, queda vacía', () => {
    delete process.env.YALIKA_PUBLIC_URL;
    expect(publicBaseUrl()).toBe('');
    process.env.YALIKA_PUBLIC_URL = 'app.ejemplo.com';
    expect(publicBaseUrl()).toBe('');
  });
});
