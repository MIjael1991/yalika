/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- dobles de prueba */
import { NotFoundException } from '@nestjs/common';

import { PresenteFeatureGuard } from './presente-feature.guard';

const ctx = (modules?: string[] | null) =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ auth: { user: { modules } } }),
    }),
  }) as any;

describe('PresenteFeatureGuard', () => {
  const guard = new PresenteFeatureGuard();
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  it('en desarrollo deja pasar a una cuenta con el módulo', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.YALIKA_PRESENTE_ENABLED;
    expect(guard.canActivate(ctx(['all']))).toBe(true);
    expect(guard.canActivate(ctx(['presente']))).toBe(true);
  });

  it('no responde a cuentas sin el módulo', () => {
    process.env.NODE_ENV = 'development';
    expect(() => guard.canActivate(ctx(['surveys']))).toThrow(
      NotFoundException,
    );
    expect(() => guard.canActivate(ctx(null))).toThrow(NotFoundException);
  });

  it('en producción está apagado hasta poner YALIKA_PRESENTE_ENABLED=true', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.YALIKA_PRESENTE_ENABLED;
    expect(() => guard.canActivate(ctx(['all']))).toThrow(NotFoundException);
    process.env.YALIKA_PRESENTE_ENABLED = 'true';
    expect(guard.canActivate(ctx(['all']))).toBe(true);
  });

  it('se puede apagar en desarrollo', () => {
    process.env.NODE_ENV = 'development';
    process.env.YALIKA_PRESENTE_ENABLED = 'false';
    expect(() => guard.canActivate(ctx(['all']))).toThrow(NotFoundException);
  });
});
