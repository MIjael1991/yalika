import {
  clampExpiry,
  createOpaqueToken,
  detectAllowedMime,
  normalizeText,
  safeDownloadName,
  sha256,
  stringArray,
  tokenPrefix,
} from './clinical.utils';

describe('Yalika Salud - utilidades de seguridad', () => {
  it('crea tokens opacos de alta entropia', () => {
    const a = createOpaqueToken();
    const b = createOpaqueToken();
    expect(a).not.toEqual(b);
    expect(a.length).toBeGreaterThan(30);
  });

  it('hash no expone token', () => {
    const token = createOpaqueToken();
    const digest = sha256(token);
    expect(digest).not.toContain(token);
    expect(digest).toHaveLength(64);
  });

  it('prefijo no contiene todo el token', () => {
    const token = createOpaqueToken();
    expect(tokenPrefix(token)).toHaveLength(8);
    expect(tokenPrefix(token)).not.toEqual(token);
  });

  it('filtra JSON a string[]', () => {
    expect(stringArray(['VIEW', 7, null, 'DOWNLOAD'])).toEqual([
      'VIEW',
      'DOWNLOAD',
    ]);
  });

  it('limpia nombre de descarga', () => {
    expect(safeDownloadName('receta"\r\n.pdf')).toBe('receta.pdf');
  });

  it('normaliza texto para busqueda', () => {
    expect(normalizeText('  Última RECETA  ')).toBe('ultima receta');
  });

  it('detecta MIME por firma y no por nombre', () => {
    expect(detectAllowedMime(Buffer.from('%PDF-1.7\n'))).toBe('application/pdf');
    expect(detectAllowedMime(Buffer.from('no-es-un-pdf'))).toBeNull();
  });

  it('no crea sesion mas alla del grant', () => {
    const ceiling = new Date(Date.now() + 2 * 60_000);
    expect(clampExpiry(45, ceiling).getTime()).toBe(ceiling.getTime());
  });
});
