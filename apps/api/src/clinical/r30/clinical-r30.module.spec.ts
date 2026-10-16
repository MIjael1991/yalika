import 'reflect-metadata';

import { ClinicalModule } from '../clinical.module';
import { ClinicalR30Controller } from './clinical-r30.controller';
import { ClinicalR30TrustService } from './clinical-r30-trust.service';

describe('ClinicalModule R3.0 trust metadata', () => {
  it('registers professional trust controller and service', () => {
    const providers = Reflect.getMetadata('providers', ClinicalModule) ?? [];
    const controllers = Reflect.getMetadata('controllers', ClinicalModule) ?? [];
    expect(providers).toContain(ClinicalR30TrustService);
    expect(controllers).toContain(ClinicalR30Controller);
  });
});
