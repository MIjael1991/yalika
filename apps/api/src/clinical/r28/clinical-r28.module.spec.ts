import 'reflect-metadata';

import { ClinicalModule } from '../clinical.module';
import { TaskModule } from '../../core/task/task.module';
import { ClinicalR28Controller } from './clinical-r28.controller';
import { ClinicalLifeMaterializerService } from './clinical-r28-life-materializer.service';
import { ClinicalR28Service } from './clinical-r28.service';

describe('ClinicalModule R2.8C dependency metadata', () => {
  it('registers the R2.8C providers/controller/import without instantiating Prisma', () => {
    const providers = Reflect.getMetadata('providers', ClinicalModule) ?? [];
    const controllers = Reflect.getMetadata('controllers', ClinicalModule) ?? [];
    const imports = Reflect.getMetadata('imports', ClinicalModule) ?? [];

    expect(providers).toContain(ClinicalR28Service);
    expect(providers).toContain(ClinicalLifeMaterializerService);
    expect(controllers).toContain(ClinicalR28Controller);
    expect(imports).toContain(TaskModule);
  });
});
