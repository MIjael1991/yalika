import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { SessionAuthGuard } from '../auth/session-auth.guard';
import type { AuthContext } from '../auth/auth.types';
import { VeterinariaFeatureGuard } from './veterinaria-feature.guard';
import { VeterinariaController } from './veterinaria.controller';

const METHOD = { 0: 'GET', 1: 'POST', 2: 'PUT', 3: 'DELETE', 4: 'PATCH' } as Record<number, string>;

describe('VeterinariaController: rutas y protecciones', () => {
  it('cuelga de /veterinaria y exige sesión antes del interruptor/módulo', () => {
    expect(Reflect.getMetadata('path', VeterinariaController)).toBe('veterinaria');
    const guards = Reflect.getMetadata('__guards__', VeterinariaController) as unknown[];
    expect(guards).toEqual([SessionAuthGuard, VeterinariaFeatureGuard]);
  });

  it('expone exactamente las 9 rutas previstas', () => {
    const proto = VeterinariaController.prototype as unknown as Record<string, unknown>;
    const routes = Object.getOwnPropertyNames(proto)
      .filter((n) => n !== 'constructor' && typeof proto[n] === 'function')
      .map((n) => {
        const fn = proto[n] as object;
        return `${METHOD[Reflect.getMetadata('method', fn)]} ${Reflect.getMetadata('path', fn)}`;
      })
      .sort();
    expect(routes).toEqual(
      [
        'POST pets',
        'GET pets',
        'GET pets/:petId',
        'PATCH pets/:petId',
        'POST pets/:petId/consultations',
        'GET pets/:petId/consultations',
        'GET pets/:petId/prescriptions',
        'GET vet/consultations',
        'POST vet/consultations/:id/prescriptions',
      ].sort(),
    );
  });

  it('ninguna ruta recibe el usuario ni la empresa del cliente: solo la sesión', () => {
    const src = readFileSync(join(__dirname, 'veterinaria.controller.ts'), 'utf8').replace(/\r/g, '');
    expect(src).not.toMatch(/@Query\(/);
    expect(src).not.toMatch(/userId|companyId/);
  });
});

describe('VeterinariaController: pasa la sesión y los datos al servicio', () => {
  const auth = { user: { id: 'u1' } } as unknown as AuthContext;
  const calls: Array<[string, unknown[]]> = [];
  const stub = new Proxy(
    {},
    {
      get: (_t, name: string) => (...args: unknown[]) => {
        calls.push([name, args]);
        return Promise.resolve({ ok: name });
      },
    },
  );
  const controller = new VeterinariaController(stub as never);

  it('cada ruta llama al método correcto con la sesión primero', async () => {
    const dto = { a: 1 } as never;
    await controller.createPet(auth, dto);
    await controller.listPets(auth);
    await controller.getPet(auth, 'p1');
    await controller.updatePet(auth, 'p1', dto);
    await controller.createConsultation(auth, 'p1', dto);
    await controller.listPetConsultations(auth, 'p1');
    await controller.listPrescriptions(auth, 'p1');
    await controller.listAssignedConsultations(auth);
    await controller.issuePrescription(auth, 'c1', dto);
    expect(calls).toEqual([
      ['createPet', [auth, dto]],
      ['listPets', [auth]],
      ['getPet', [auth, 'p1']],
      ['updatePet', [auth, 'p1', dto]],
      ['createConsultation', [auth, 'p1', dto]],
      ['listPetConsultations', [auth, 'p1']],
      ['listPrescriptions', [auth, 'p1']],
      ['listAssignedConsultations', [auth]],
      ['issuePrescription', [auth, 'c1', dto]],
    ]);
  });
});

describe('registro del módulo', () => {
  it('app.module.ts importa y registra VeterinariaModule', () => {
    const src = readFileSync(join(__dirname, '..', 'app.module.ts'), 'utf8');
    expect(src).toContain("import { VeterinariaModule } from './veterinaria/veterinaria.module';");
    expect(src).toMatch(/imports:\s*\[[\s\S]*VeterinariaModule[\s\S]*\]/);
  });
});
