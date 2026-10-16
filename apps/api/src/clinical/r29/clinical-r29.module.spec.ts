import 'reflect-metadata';

import { ClinicalModule } from '../clinical.module';
import { ClinicalR29Controller } from './clinical-r29.controller';
import { ClinicalR29Service } from './clinical-r29.service';

describe('ClinicalModule R2.9 metadata', () => {
  it('registers R2.9 controller and service without instantiating Prisma', () => {
    const providers = Reflect.getMetadata('providers', ClinicalModule) ?? [];
    const controllers = Reflect.getMetadata('controllers', ClinicalModule) ?? [];
    expect(providers).toContain(ClinicalR29Service);
    expect(controllers).toContain(ClinicalR29Controller);
  });
});
