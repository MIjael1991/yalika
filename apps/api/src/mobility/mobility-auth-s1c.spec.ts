import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { MobilityPhase2Controller } from './phase2/phase2.controller';
import { MobilityPhase3Controller } from './phase3/phase3.controller';
import { MobilityPhase4Controller } from './phase4/phase4.controller';

describe('Movilidad S1C: puerta de autenticación', () => {
  it.each([
    ['fase 2', MobilityPhase2Controller],
    ['fase 4', MobilityPhase4Controller],
  ])('%s exige sesión para todos sus endpoints', (_name, controller) => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, controller) ?? [];
    expect(guards).toContain(SessionAuthGuard);
  });

  it('fase 3 protege todos los métodos salvo el enlace compartido', () => {
    const prototype = MobilityPhase3Controller.prototype;
    const methods = Object.getOwnPropertyNames(prototype).filter(
      (name) => name !== 'constructor',
    );
    expect(methods).toHaveLength(14);
    for (const method of methods) {
      const guards =
        Reflect.getMetadata(
          GUARDS_METADATA,
          Object.getOwnPropertyDescriptor(prototype, method)?.value,
        ) ?? [];
      if (method === 'sharedTrip') {
        expect(guards).not.toContain(SessionAuthGuard);
      } else {
        expect(guards).toContain(SessionAuthGuard);
      }
    }
  });
});
