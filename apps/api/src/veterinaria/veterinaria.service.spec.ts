import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

import type { AuthContext } from '../auth/auth.types';
import { VeterinariaService } from './veterinaria.service';

const auth = (id: string): AuthContext =>
  ({ sessionId: 's', sessionToken: 't', expiresAt: new Date(), user: { id } }) as any;

const A = auth('user-a');
const B = auth('user-b');
const VET = auth('vet-1');

function matches(row: any, where: any): boolean {
  return Object.entries(where ?? {}).every(([k, v]: [string, any]) => {
    if (v === undefined) return true;
    if (k === 'pet') return Object.entries(v).every(([pk, pv]) => row.pet?.[pk] === pv);
    if (v && typeof v === 'object' && 'in' in v) return v.in.includes(row[k]);
    return row[k] === v;
  });
}

function makeDb() {
  let n = 0;
  const id = (p: string) => `${p}-${++n}`;
  const s = {
    pets: [] as any[],
    guardians: [] as any[],
    consultations: [] as any[],
    prescriptions: [] as any[],
    audit: [] as any[],
    professionals: new Map<string, any>(),
    users: [] as any[],
  };
  const db: any = {
    $transaction: async (fn: any) => fn(db),
    user: { findFirst: async ({ where }: any) => s.users.find((u) => u.email === where.email) ?? null },
    vetPet: {
      create: async ({ data }: any) => {
        const { guardians, ...rest } = data;
        const pet = { id: id('pet'), active: true, ...rest };
        s.pets.push(pet);
        if (guardians?.create) {
          s.guardians.push({ id: id('g'), petId: pet.id, startsAt: null, endsAt: null, pet, ...guardians.create });
        }
        return pet;
      },
      update: async ({ where, data }: any) => Object.assign(s.pets.find((p) => p.id === where.id), data),
    },
    vetPetGuardian: {
      findFirst: async ({ where }: any) => s.guardians.find((g) => matches(g, where)) ?? null,
      findMany: async ({ where }: any) => s.guardians.filter((g) => matches(g, where)),
    },
    vetConsultation: {
      create: async ({ data }: any) => {
        const c = { id: id('c'), pet: s.pets.find((p) => p.id === data.petId), ...data };
        s.consultations.push(c);
        return c;
      },
      findFirst: async ({ where }: any) => s.consultations.find((c) => matches(c, where)) ?? null,
      findMany: async ({ where }: any) => s.consultations.filter((c) => matches(c, where)),
    },
    vetPrescription: {
      create: async ({ data }: any) => {
        const { items, ...rest } = data;
        const p = { id: id('rx'), ...rest, items: items.create.map((i: any) => ({ id: id('i'), ...i })) };
        s.prescriptions.push(p);
        return p;
      },
      findFirst: async ({ where }: any) => s.prescriptions.find((p) => matches(p, where)) ?? null,
      findMany: async ({ where }: any) => s.prescriptions.filter((p) => matches(p, where)),
    },
    vetAuditEvent: { create: async ({ data }: any) => void s.audit.push(data) },
    clinicalProfessionalProfile: {
      findUnique: async ({ where }: any) => s.professionals.get(where.userId) ?? null,
    },
  };
  return { db, s };
}

const NOW = Date.now();
const goodVet = (over: any = {}) => ({
  id: 'prof-1',
  userId: 'vet-1',
  profession: 'Médico Veterinario Zootecnista',
  verificationStatus: 'VERIFIED',
  active: true,
  canPrescribe: true,
  memberships: [
    {
      status: 'ACTIVE',
      startsAt: new Date(NOW - 86400000),
      endsAt: new Date(NOW + 86400000),
      organization: { verificationStatus: 'VERIFIED', active: true },
    },
  ],
  ...over,
});

const petDto = (name: string) => ({ name, species: 'DOG' });
const rxDto = (extra: any = {}) => ({
  issuedAt: new Date().toISOString(),
  items: [{ medicationName: 'Amoxicilina' }],
  ...extra,
});

async function setup() {
  const { db, s } = makeDb();
  const svc = new VeterinariaService({} as any);
  (svc as any).prisma = db;
  return { svc, s };
}

async function withConsultation(svc: VeterinariaService, s: any, petId: string) {
  s.users.push({ id: 'vet-1', email: 'vet@x.mx' });
  return svc.createConsultation(A, petId, {
    mode: 'presential',
    scheduledAt: new Date(Date.now() + 3600000).toISOString(),
    veterinarianEmail: 'vet@x.mx',
  });
}

describe('VeterinariaService - mascotas y aislamiento', () => {
  it('un tutor registra tres mascotas con identidades separadas', async () => {
    const { svc } = await setup();
    const p1 = await svc.createPet(A, petDto('Rex'));
    const p2 = await svc.createPet(A, petDto('Luna'));
    const p3 = await svc.createPet(A, petDto('Nina'));
    expect(new Set([p1.id, p2.id, p3.id]).size).toBe(3);
    const list = await svc.listPets(A);
    expect(list).toHaveLength(3);
    expect(list.every((p: any) => p.guardianRole === 'OWNER')).toBe(true);
  });

  it('otro usuario no puede leer, editar ni operar una mascota ajena', async () => {
    const { svc, s } = await setup();
    const pet = await svc.createPet(A, petDto('Rex'));
    await expect(svc.getPet(B, pet.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.updatePet(B, pet.id, { name: 'X' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      svc.createConsultation(B, pet.id, { mode: 'online', scheduledAt: new Date().toISOString() }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.listPetConsultations(B, pet.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.listPrescriptions(B, pet.id)).rejects.toBeInstanceOf(NotFoundException);
    expect(await svc.listPets(B)).toHaveLength(0);
    expect(s.pets[0].name).toBe('Rex');
  });

  it('un tutor retirado o con vigencia vencida pierde acceso', async () => {
    const { svc, s } = await setup();
    const pet = await svc.createPet(A, petDto('Rex'));
    s.guardians[0].status = 'REVOKED';
    await expect(svc.getPet(A, pet.id)).rejects.toBeInstanceOf(NotFoundException);
    s.guardians[0].status = 'ACTIVE';
    s.guardians[0].endsAt = new Date(Date.now() - 1000);
    await expect(svc.getPet(A, pet.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('un cotutor puede ver pero no editar los datos de la mascota', async () => {
    const { svc, s } = await setup();
    const pet = await svc.createPet(A, petDto('Rex'));
    s.guardians.push({ id: 'g-co', petId: pet.id, userId: 'user-b', role: 'CO_GUARDIAN', status: 'ACTIVE', startsAt: null, endsAt: null, pet: s.pets[0] });
    await expect(svc.getPet(B, pet.id)).resolves.toMatchObject({ guardianRole: 'CO_GUARDIAN' });
    await expect(svc.updatePet(B, pet.id, { name: 'X' })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rechaza fecha de nacimiento futura y cambios vacíos', async () => {
    const { svc } = await setup();
    await expect(
      svc.createPet(A, { ...petDto('Rex'), birthDate: new Date(Date.now() + 86400000 * 5).toISOString() }),
    ).rejects.toBeInstanceOf(BadRequestException);
    const pet = await svc.createPet(A, petDto('Rex'));
    await expect(svc.updatePet(A, pet.id, {})).rejects.toBeInstanceOf(BadRequestException);
  });

  it('no permite asignarse a sí mismo como veterinario', async () => {
    const { svc, s } = await setup();
    const pet = await svc.createPet(A, petDto('Rex'));
    s.users.push({ id: 'user-a', email: 'a@x.mx' });
    await expect(
      svc.createConsultation(A, pet.id, { mode: 'online', scheduledAt: new Date().toISOString(), veterinarianEmail: 'a@x.mx' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('VeterinariaService - recetas', () => {
  it('un veterinario verificado emite la receta y queda auditada', async () => {
    const { svc, s } = await setup();
    const pet = await svc.createPet(A, petDto('Rex'));
    const c = await withConsultation(svc, s, pet.id);
    s.professionals.set('vet-1', goodVet());
    const rx = await svc.issuePrescription(VET, c.id, rxDto());
    expect(rx.petId).toBe(pet.id);
    expect(rx.items).toHaveLength(1);
    expect(s.audit.some((e: any) => e.action === 'vet.prescription.issued')).toBe(true);
  });

  it('deniega sin perfil profesional, no verificado, sin canPrescribe, profesión humana o membresía vencida', async () => {
    const { svc, s } = await setup();
    const pet = await svc.createPet(A, petDto('Rex'));
    const c = await withConsultation(svc, s, pet.id);

    await expect(svc.issuePrescription(VET, c.id, rxDto())).rejects.toBeInstanceOf(ForbiddenException);

    const cases = [
      goodVet({ verificationStatus: 'PENDING' }),
      goodVet({ canPrescribe: false }),
      goodVet({ profession: 'Médico cirujano' }),
      goodVet({ active: false }),
      goodVet({ memberships: [{ status: 'ACTIVE', startsAt: null, endsAt: new Date(NOW - 1000), organization: { verificationStatus: 'VERIFIED', active: true } }] }),
    ];
    for (const profile of cases) {
      s.professionals.set('vet-1', profile);
      await expect(svc.issuePrescription(VET, c.id, rxDto())).rejects.toBeInstanceOf(ForbiddenException);
    }
    expect(s.prescriptions).toHaveLength(0);
    expect(s.audit.filter((e: any) => e.result === 'DENIED').length).toBe(cases.length + 1);
  });

  it('un profesional no asignado o una consulta cancelada no pueden recetar', async () => {
    const { svc, s } = await setup();
    const pet = await svc.createPet(A, petDto('Rex'));
    const c = await withConsultation(svc, s, pet.id);
    s.professionals.set('vet-1', goodVet());
    s.professionals.set('vet-2', goodVet({ id: 'prof-2', userId: 'vet-2' }));
    await expect(svc.issuePrescription(auth('vet-2'), c.id, rxDto())).rejects.toBeInstanceOf(ForbiddenException);
    s.consultations[0].status = 'cancelled';
    await expect(svc.issuePrescription(VET, c.id, rxDto())).rejects.toBeInstanceOf(ForbiddenException);
    expect(s.prescriptions).toHaveLength(0);
  });

  it('la misma clave de idempotencia no duplica la receta', async () => {
    const { svc, s } = await setup();
    const pet = await svc.createPet(A, petDto('Rex'));
    const c = await withConsultation(svc, s, pet.id);
    s.professionals.set('vet-1', goodVet());
    const first = await svc.issuePrescription(VET, c.id, rxDto({ idempotencyKey: 'k1' }));
    const second = await svc.issuePrescription(VET, c.id, rxDto({ idempotencyKey: 'k1' }));
    expect(second.id).toBe(first.id);
    expect(second.idempotentReplay).toBe(true);
    expect(s.prescriptions).toHaveLength(1);
  });

  it('la receta de la mascota A nunca aparece en la mascota B', async () => {
    const { svc, s } = await setup();
    const petA = await svc.createPet(A, petDto('Rex'));
    const petB = await svc.createPet(A, petDto('Luna'));
    const c = await withConsultation(svc, s, petA.id);
    s.professionals.set('vet-1', goodVet());
    await svc.issuePrescription(VET, c.id, rxDto());
    expect(await svc.listPrescriptions(A, petA.id)).toHaveLength(1);
    expect(await svc.listPrescriptions(A, petB.id)).toHaveLength(0);
  });

  it('el veterinario solo ve sus recetas; un extraño no ve nada', async () => {
    const { svc, s } = await setup();
    const pet = await svc.createPet(A, petDto('Rex'));
    const c = await withConsultation(svc, s, pet.id);
    s.professionals.set('vet-1', goodVet());
    await svc.issuePrescription(VET, c.id, rxDto());
    expect(await svc.listPrescriptions(VET, pet.id)).toHaveLength(1);
    await expect(svc.listPrescriptions(auth('vet-9'), pet.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('exige al menos un medicamento', async () => {
    const { svc, s } = await setup();
    const pet = await svc.createPet(A, petDto('Rex'));
    const c = await withConsultation(svc, s, pet.id);
    await expect(svc.issuePrescription(VET, c.id, rxDto({ items: [] }))).rejects.toBeInstanceOf(BadRequestException);
  });
});

const inOneHour = () => new Date(Date.now() + 3600000).toISOString();

describe('VeterinariaService - casos límite y bitácora', () => {
  it('rechaza un correo de veterinario que no existe', async () => {
    const { svc } = await setup();
    const pet = await svc.createPet(A, petDto('Rex'));
    await expect(
      svc.createConsultation(A, pet.id, { mode: 'online', scheduledAt: inOneHour(), veterinarianEmail: 'nadie@x.mx' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('el veterinario solo ve las consultas que le asignaron a él', async () => {
    const { svc, s } = await setup();
    const pet = await svc.createPet(A, petDto('Rex'));
    s.users.push({ id: 'vet-1', email: 'vet@x.mx' }, { id: 'vet-2', email: 'vet2@x.mx' });
    await svc.createConsultation(A, pet.id, { mode: 'online', scheduledAt: inOneHour(), veterinarianEmail: 'vet@x.mx' });
    await svc.createConsultation(A, pet.id, { mode: 'online', scheduledAt: inOneHour(), veterinarianEmail: 'vet2@x.mx' });
    await svc.createConsultation(A, pet.id, { mode: 'online', scheduledAt: inOneHour() });
    expect(await svc.listAssignedConsultations(VET)).toHaveLength(1);
    expect(await svc.listAssignedConsultations(auth('vet-2'))).toHaveLength(1);
    expect(await svc.listAssignedConsultations(A)).toHaveLength(0);
  });

  it('limpia el nombre y normaliza el microchip al registrar', async () => {
    const { svc } = await setup();
    const pet = await svc.createPet(A, { name: '  Rex  ', species: 'DOG', microchip: ' ab-12 ' });
    expect(pet.name).toBe('Rex');
    expect(pet.microchip).toBe('AB-12');
    expect(pet.active).toBe(true);
  });

  it('al editar solo cambia lo enviado y lo deja en la bitácora', async () => {
    const { svc, s } = await setup();
    const pet = await svc.createPet(A, { name: 'Rex', species: 'DOG', breed: 'Mestizo' });
    const updated = await svc.updatePet(A, pet.id, { name: 'Max' });
    expect(updated.name).toBe('Max');
    expect(updated.breed).toBe('Mestizo');
    const edit = s.audit.find((e: any) => e.action === 'vet.pet.updated');
    expect(edit.metadata.fields).toEqual(['name']);
  });

  it('la bitácora registra cada paso con quién lo hizo y sobre qué mascota', async () => {
    const { svc, s } = await setup();
    const pet = await svc.createPet(A, petDto('Rex'));
    const c = await withConsultation(svc, s, pet.id);
    s.professionals.set('vet-1', goodVet({ profession: 'Médico cirujano' }));
    await expect(svc.issuePrescription(VET, c.id, rxDto())).rejects.toBeInstanceOf(ForbiddenException);
    s.professionals.set('vet-1', goodVet());
    await svc.issuePrescription(VET, c.id, rxDto());

    expect(s.audit.map((e: any) => e.action)).toEqual([
      'vet.pet.created',
      'vet.consultation.created',
      'vet.prescription.denied',
      'vet.prescription.issued',
    ]);
    expect(s.audit.map((e: any) => e.actorUserId)).toEqual(['user-a', 'user-a', 'vet-1', 'vet-1']);
    expect(s.audit.every((e: any) => e.petId === pet.id)).toBe(true);
    expect(s.audit[2].result).toBe('DENIED');
    expect(s.audit[2].metadata.reasons).toContain('PROFESSION_NOT_VETERINARY');
  });

  it('rechaza una fecha de receta inválida sin crear nada', async () => {
    const { svc, s } = await setup();
    const pet = await svc.createPet(A, petDto('Rex'));
    const c = await withConsultation(svc, s, pet.id);
    s.professionals.set('vet-1', goodVet());
    await expect(svc.issuePrescription(VET, c.id, rxDto({ issuedAt: 'no-es-fecha' }))).rejects.toBeInstanceOf(BadRequestException);
    expect(s.prescriptions).toHaveLength(0);
  });

  it('un doble envío simultáneo con la misma clave devuelve la receta ya creada', async () => {
    const { db, s } = makeDb();
    const svc = new VeterinariaService({} as any);
    (svc as any).prisma = db;
    const pet = await svc.createPet(A, petDto('Rex'));
    const c = await withConsultation(svc, s, pet.id);
    s.professionals.set('vet-1', goodVet());
    const first = await svc.issuePrescription(VET, c.id, rxDto({ idempotencyKey: 'k' }));

    // La segunda petición no ve la receta al principio y choca con la clave única al crear.
    let reads = 0;
    const realFind = db.vetPrescription.findFirst;
    db.vetPrescription.findFirst = async (args: any) => (reads++ === 0 ? null : realFind(args));
    db.vetPrescription.create = async () => {
      throw Object.assign(new Error('duplicada'), { code: 'P2002' });
    };
    const second = await svc.issuePrescription(VET, c.id, rxDto({ idempotencyKey: 'k' }));
    expect(second.id).toBe(first.id);
    expect(second.idempotentReplay).toBe(true);
    expect(s.prescriptions).toHaveLength(1);
  });

  it('cualquier otro error al guardar la receta no se esconde', async () => {
    const { db, s } = makeDb();
    const svc = new VeterinariaService({} as any);
    (svc as any).prisma = db;
    const pet = await svc.createPet(A, petDto('Rex'));
    const c = await withConsultation(svc, s, pet.id);
    s.professionals.set('vet-1', goodVet());
    db.vetPrescription.create = async () => {
      throw new Error('boom');
    };
    await expect(svc.issuePrescription(VET, c.id, rxDto({ idempotencyKey: 'k2' }))).rejects.toThrow('boom');
  });
});
