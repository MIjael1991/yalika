import 'reflect-metadata';

import { ClinicalModule } from '../clinical.module';
import { ClinicalR303Controller } from './clinical-r303.controller';
import { ClinicalR303Service } from './clinical-r303.service';

describe('ClinicalModule R3.0.3 metadata', () => {
  it('registra la portada simple del paciente sin instanciar Prisma', () => {
    const providers = Reflect.getMetadata('providers', ClinicalModule) ?? [];
    const controllers = Reflect.getMetadata('controllers', ClinicalModule) ?? [];
    expect(providers).toContain(ClinicalR303Service);
    expect(controllers).toContain(ClinicalR303Controller);
  });
});
