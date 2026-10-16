import 'reflect-metadata';
import { ClinicalModule } from '../clinical.module';
import { ClinicalR304Controller } from './clinical-r304.controller';
import { ClinicalR304Service } from './clinical-r304.service';

describe('ClinicalModule R3.0.4 metadata', () => {
  it('registra historia estructurada sin instanciar Prisma', () => {
    const providers = Reflect.getMetadata('providers', ClinicalModule) ?? [];
    const controllers = Reflect.getMetadata('controllers', ClinicalModule) ?? [];
    expect(providers).toContain(ClinicalR304Service);
    expect(controllers).toContain(ClinicalR304Controller);
  });
});
