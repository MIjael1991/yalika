import 'reflect-metadata';
import { ClinicalModule } from '../clinical.module';
import { ClinicalR302Controller } from './clinical-r302.controller';
import { ClinicalR302NetworkService } from './clinical-r302-network.service';

describe('ClinicalModule R3.0.2 metadata', () => {
  it('registers network controller and service without instantiating Prisma', () => {
    const providers = Reflect.getMetadata('providers', ClinicalModule) ?? [];
    const controllers = Reflect.getMetadata('controllers', ClinicalModule) ?? [];
    expect(providers).toContain(ClinicalR302NetworkService);
    expect(controllers).toContain(ClinicalR302Controller);
  });
});
