import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate, type ValidationError } from 'class-validator';

import {
  CreateVetConsultationDto,
  CreateVetPetDto,
  IssueVetPrescriptionDto,
  UpdateVetPetDto,
} from './dto/veterinaria.dto';

// Mismas opciones que el ValidationPipe global de main.ts.
function paths(errors: ValidationError[], prefix = ''): string[] {
  return errors.flatMap((e) => {
    const here = prefix ? `${prefix}.${e.property}` : e.property;
    return e.children?.length ? paths(e.children, here) : [here];
  });
}
async function errorsOf<T extends object>(cls: new () => T, plain: object) {
  const errors = await validate(plainToInstance(cls, plain), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return paths(errors);
}

const validPet = { name: 'Rex', species: 'DOG' };
const validConsult = { mode: 'presential', scheduledAt: '2026-11-01T16:00:00.000Z' };
const validRx = {
  issuedAt: '2026-10-16T12:00:00.000Z',
  items: [{ medicationName: 'Amoxicilina' }],
};

describe('CreateVetPetDto', () => {
  it('acepta lo mínimo y un registro completo', async () => {
    expect(await errorsOf(CreateVetPetDto, validPet)).toEqual([]);
    expect(
      await errorsOf(CreateVetPetDto, {
        ...validPet,
        breed: 'Labrador',
        sex: 'MALE',
        birthDate: '2024-03-01',
        birthDateApprox: true,
        microchip: 'AB-1234567890',
      }),
    ).toEqual([]);
  });
  it('rechaza nombre vacío o demasiado largo', async () => {
    expect(await errorsOf(CreateVetPetDto, { ...validPet, name: '' })).toContain('name');
    expect(await errorsOf(CreateVetPetDto, { ...validPet, name: 'x'.repeat(81) })).toContain('name');
  });
  it('rechaza especie o sexo fuera de la lista', async () => {
    expect(await errorsOf(CreateVetPetDto, { ...validPet, species: 'DRAGON' })).toContain('species');
    expect(await errorsOf(CreateVetPetDto, { ...validPet, sex: 'X' })).toContain('sex');
  });
  it('rechaza fecha que no es ISO y microchip con caracteres raros', async () => {
    expect(await errorsOf(CreateVetPetDto, { ...validPet, birthDate: 'ayer' })).toContain('birthDate');
    expect(await errorsOf(CreateVetPetDto, { ...validPet, microchip: 'AB 12;--' })).toContain('microchip');
  });
  it('rechaza campos que no existen (no se puede colar el dueño ni el id)', async () => {
    const errs = await errorsOf(CreateVetPetDto, { ...validPet, createdByUserId: 'otro', id: 'x', active: false });
    expect(errs).toEqual(expect.arrayContaining(['createdByUserId', 'id', 'active']));
  });
});

describe('UpdateVetPetDto', () => {
  it('todos los campos son opcionales, pero siguen validándose', async () => {
    expect(await errorsOf(UpdateVetPetDto, {})).toEqual([]);
    expect(await errorsOf(UpdateVetPetDto, { name: 'Luna' })).toEqual([]);
    expect(await errorsOf(UpdateVetPetDto, { species: 'DRAGON' })).toContain('species');
    expect(await errorsOf(UpdateVetPetDto, { active: false })).toContain('active');
  });
});

describe('CreateVetConsultationDto', () => {
  it('acepta lo mínimo y con veterinario', async () => {
    expect(await errorsOf(CreateVetConsultationDto, validConsult)).toEqual([]);
    expect(
      await errorsOf(CreateVetConsultationDto, {
        ...validConsult,
        reason: 'Revisión',
        veterinarianEmail: 'vet@clinica.mx',
      }),
    ).toEqual([]);
  });
  it('rechaza tipo de consulta, fecha o correo inválidos', async () => {
    expect(await errorsOf(CreateVetConsultationDto, { ...validConsult, mode: 'telepatia' })).toContain('mode');
    expect(await errorsOf(CreateVetConsultationDto, { ...validConsult, scheduledAt: 'mañana' })).toContain('scheduledAt');
    expect(await errorsOf(CreateVetConsultationDto, { ...validConsult, veterinarianEmail: 'no-es-correo' })).toContain('veterinarianEmail');
  });
  it('no deja elegir estado, mascota ni veterinario por id', async () => {
    const errs = await errorsOf(CreateVetConsultationDto, {
      ...validConsult,
      status: 'completed',
      petId: 'x',
      veterinarianUserId: 'y',
    });
    expect(errs).toEqual(expect.arrayContaining(['status', 'petId', 'veterinarianUserId']));
  });
});

describe('IssueVetPrescriptionDto', () => {
  it('acepta una receta mínima y una completa', async () => {
    expect(await errorsOf(IssueVetPrescriptionDto, validRx)).toEqual([]);
    expect(
      await errorsOf(IssueVetPrescriptionDto, {
        ...validRx,
        idempotencyKey: 'abc-123',
        items: [
          {
            medicationName: 'Amoxicilina',
            strength: '250 mg',
            dosageText: '1 tableta',
            frequencyText: 'cada 12 horas',
            durationText: '7 días',
            instructions: 'Con alimento',
          },
        ],
      }),
    ).toEqual([]);
  });
  it('exige al menos un medicamento y como máximo 30', async () => {
    expect(await errorsOf(IssueVetPrescriptionDto, { ...validRx, items: [] })).toContain('items');
    const many = Array.from({ length: 31 }, () => ({ medicationName: 'X' }));
    expect(await errorsOf(IssueVetPrescriptionDto, { ...validRx, items: many })).toContain('items');
  });
  it('valida cada medicamento por dentro', async () => {
    expect(
      await errorsOf(IssueVetPrescriptionDto, { ...validRx, items: [{ medicationName: '' }] }),
    ).toContain('items.0.medicationName');
    expect(
      await errorsOf(IssueVetPrescriptionDto, { ...validRx, items: [{ dosageText: 'solo dosis' }] }),
    ).toContain('items.0.medicationName');
  });
  it('rechaza fecha inválida y campos que no existen (estado, veterinario)', async () => {
    expect(await errorsOf(IssueVetPrescriptionDto, { ...validRx, issuedAt: 'hoy' })).toContain('issuedAt');
    const errs = await errorsOf(IssueVetPrescriptionDto, {
      ...validRx,
      status: 'ACTIVE',
      veterinarianUserId: 'otro',
      professionalProfileId: 'otro',
    });
    expect(errs).toEqual(expect.arrayContaining(['status', 'veterinarianUserId', 'professionalProfileId']));
  });
});
