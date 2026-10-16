import { GUARDS_METADATA } from '@nestjs/common/constants';

import { SessionAuthGuard } from '../auth/session-auth.guard';
import { ClinicalController } from './clinical.controller';
import { ClinicalFeatureGuard } from './clinical-feature.guard';

describe('Yalika Salud - controller', () => {
  it('requiere sesión y feature flag', () => {
    const guards =
      Reflect.getMetadata(GUARDS_METADATA, ClinicalController) ?? [];
    expect(guards).toContain(SessionAuthGuard);
    expect(guards).toContain(ClinicalFeatureGuard);
  });
});
