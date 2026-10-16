import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';

import { PlatformOperatorGuard } from '../auth/platform-operator.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { MobilityPhase2Controller } from './phase2/phase2.controller';
import { MobilityPhase3Controller } from './phase3/phase3.controller';
import { MobilityPhase4Controller } from './phase4/phase4.controller';
import { MobilityPhase5Controller } from './phase5/phase5.controller';
import { MobilityPhase6Controller } from './phase6/phase6.controller';
import { MobilityPhase7Controller } from './phase7/phase7.controller';

/** Acciones que mueven dinero, deciden revisiones o afectan a todos: solo operador. */
const operatorOnly: Array<[string, { prototype: object }, string[]]> = [
  [
    'fase 2',
    MobilityPhase2Controller,
    ['listOpenSafety', 'resolveSafety', 'applyTripReward'],
  ],
  [
    'fase 3',
    MobilityPhase3Controller,
    ['createPricingPolicy', 'creditTrip', 'createBonusCampaign'],
  ],
  [
    'fase 4',
    MobilityPhase4Controller,
    [
      'resolveSupport',
      'reviewDocument',
      'expiringDocuments',
      'queueNotification',
      'pendingNotifications',
      'markNotification',
      'createPrivacyPolicy',
      'cleanupPreview',
      'cleanup',
      'createPayout',
      'settleCancellation',
      'auditTrail',
      'escalateSafety',
    ],
  ],
  [
    'fase 5',
    MobilityPhase5Controller,
    [
      'createReferralCampaign',
      'evaluateReferral',
      'verifyPhone',
      'reviewIdentity',
      'reviewVehicleCompliance',
    ],
  ],
  ['fase 6', MobilityPhase6Controller, ['createPolicy']],
  ['fase 7', MobilityPhase7Controller, ['diagnostics']],
];

function handlerGuards(controller: { prototype: object }, method: string) {
  const handler = Object.getOwnPropertyDescriptor(
    controller.prototype,
    method,
  )?.value;
  expect(handler).toBeDefined();
  return Reflect.getMetadata(GUARDS_METADATA, handler) ?? [];
}

function allGuards(controller: { prototype: object }, method: string) {
  const own = Reflect.getMetadata(GUARDS_METADATA, controller) ?? [];
  return [...own, ...handlerGuards(controller, method)];
}

describe('Movilidad: acciones solo para operador de plataforma', () => {
  it.each(operatorOnly)('%s', (_name, controller, methods) => {
    for (const method of methods) {
      const guards = allGuards(controller, method);
      expect(guards).toContain(SessionAuthGuard);
      expect(guards).toContain(PlatformOperatorGuard);
      // Primero se identifica a la persona, luego se revisa si es operador.
      expect(guards.indexOf(SessionAuthGuard)).toBeLessThan(
        guards.indexOf(PlatformOperatorGuard),
      );
    }
  });

  it('las acciones de pasajero/conductor no exigen ser operador', () => {
    expect(handlerGuards(MobilityPhase7Controller, 'confirm')).not.toContain(
      PlatformOperatorGuard,
    );
    expect(handlerGuards(MobilityPhase7Controller, 'interpret')).not.toContain(
      PlatformOperatorGuard,
    );
    expect(handlerGuards(MobilityPhase3Controller, 'quote')).not.toContain(
      PlatformOperatorGuard,
    );
  });
});
