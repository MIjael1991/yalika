import { ServiceUnavailableException } from '@nestjs/common';

import {
  curpFingerprint,
  decryptBuffer,
  decryptText,
  encryptBuffer,
  encryptText,
  presenteKey,
} from './presente-crypto';

describe('cifrado de Presente', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  it('cifra y descifra texto y archivos; el texto cifrado no contiene el original', () => {
    const curp = 'HEGG560427MVZRRL04';
    const sealed = encryptText(curp);
    expect(sealed).not.toContain(curp);
    expect(decryptText(sealed)).toBe(curp);
    const file = Buffer.from('foto de prueba');
    expect(decryptBuffer(encryptBuffer(file)).equals(file)).toBe(true);
  });

  it('un archivo alterado no se descifra', () => {
    const sealed = encryptBuffer(Buffer.from('foto de prueba'));
    sealed[sealed.length - 1] ^= 0xff;
    expect(() => decryptBuffer(sealed)).toThrow();
  });

  it('la huella de la CURP es estable y depende de la clave', () => {
    const a = Buffer.alloc(32, 1);
    const b = Buffer.alloc(32, 2);
    expect(curpFingerprint('X', a)).toBe(curpFingerprint('X', a));
    expect(curpFingerprint('X', a)).not.toBe(curpFingerprint('X', b));
  });

  it('en producción exige la clave', () => {
    expect(() => presenteKey({ NODE_ENV: 'production' })).toThrow(
      ServiceUnavailableException,
    );
    expect(
      presenteKey({
        NODE_ENV: 'production',
        YALIKA_PRESENTE_KEY: 'ab'.repeat(32),
      }).length,
    ).toBe(32);
  });
});
