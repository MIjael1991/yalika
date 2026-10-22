import { NotFoundException } from '@nestjs/common';

import { VeterinariaFeatureGuard } from './veterinaria-feature.guard';
import { hasVeterinariaAccess } from './veterinaria.domain';

const ctx = (modules?: string[] | null, withAuth = true) =>
  ({
    switchToHttp: () => ({
      getRequest: () => (withAuth ? { auth: { user: { modules } } } : {}),
    }),
  }) as any;

describe('hasVeterinariaAccess', () => {
  it('acepta all y veterinaria; rechaza el resto', () => {
    expect(hasVeterinariaAccess(['all'])).toBe(true);
    expect(hasVeterinariaAccess(['veterinaria'])).toBe(true);
    expect(hasVeterinariaAccess(['surveys'])).toBe(false);
    expect(hasVeterinariaAccess([])).toBe(false);
    expect(hasVeterinariaAccess(null)).toBe(false);
    expect(hasVeterinariaAccess(undefined)).toBe(false);
  });
});

describe('VeterinariaFeatureGuard', () => {
  const guard = new VeterinariaFeatureGuard();
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  it('en desarrollo deja pasar a una cuenta con módulo activo', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.YALIKA_VETERINARIA_ENABLED;
    expect(guard.canActivate(ctx(['all']))).toBe(true);
    expect(guard.canActivate(ctx(['veterinaria']))).toBe(true);
  });

  it('no responde a una cuenta sin el módulo (solo encuestas) ni sin sesión', () => {
    process.env.NODE_ENV = 'development';
    expect(() => guard.canActivate(ctx(['surveys']))).toThrow(NotFoundException);
    expect(() => guard.canActivate(ctx([], true))).toThrow(NotFoundException);
    expect(() => guard.canActivate(ctx(undefined, false))).toThrow(NotFoundException);
  });

  it('el interruptor en false lo apaga en desarrollo', () => {
    process.env.NODE_ENV = 'development';
    process.env.YALIKA_VETERINARIA_ENABLED = 'false';
    expect(() => guard.canActivate(ctx(['all']))).toThrow(NotFoundException);
  });

  it('en producción está apagado salvo YALIKA_VETERINARIA_ENABLED=true', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.YALIKA_VETERINARIA_ENABLED;
    expect(() => guard.canActivate(ctx(['all']))).toThrow(NotFoundException);
    process.env.YALIKA_VETERINARIA_ENABLED = 'true';
    expect(guard.canActivate(ctx(['all']))).toBe(true);
    expect(() => guard.canActivate(ctx(['surveys']))).toThrow(NotFoundException);
  });
});
