import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';

import {
  PlatformOperatorGuard,
  platformOperatorIds,
} from './platform-operator.guard';

function contextFor(userId?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        auth: userId ? { user: { id: userId } } : undefined,
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('PlatformOperatorGuard', () => {
  const original = process.env.YALIKA_OPERATOR_USER_IDS;

  afterEach(() => {
    if (original === undefined) delete process.env.YALIKA_OPERATOR_USER_IDS;
    else process.env.YALIKA_OPERATOR_USER_IDS = original;
  });

  it('niega a todos si la variable no existe', () => {
    delete process.env.YALIKA_OPERATOR_USER_IDS;
    expect(() =>
      new PlatformOperatorGuard().canActivate(contextFor('u1')),
    ).toThrow(ForbiddenException);
  });

  it('niega a todos si la variable está vacía', () => {
    process.env.YALIKA_OPERATOR_USER_IDS = '  , ,';
    expect(platformOperatorIds().size).toBe(0);
    expect(() =>
      new PlatformOperatorGuard().canActivate(contextFor('u1')),
    ).toThrow(ForbiddenException);
  });

  it('permite solo a los usuarios listados (con espacios y varias comas)', () => {
    process.env.YALIKA_OPERATOR_USER_IDS = ' u-admin , u-soporte ';
    const guard = new PlatformOperatorGuard();
    expect(guard.canActivate(contextFor('u-admin'))).toBe(true);
    expect(guard.canActivate(contextFor('u-soporte'))).toBe(true);
    expect(() => guard.canActivate(contextFor('u-otro'))).toThrow(
      ForbiddenException,
    );
  });

  it('niega si no hay sesión en la petición', () => {
    process.env.YALIKA_OPERATOR_USER_IDS = 'u-admin';
    expect(() => new PlatformOperatorGuard().canActivate(contextFor())).toThrow(
      ForbiddenException,
    );
  });
});
