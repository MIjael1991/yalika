jest.mock('../../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));
jest.mock('../clinical-storage.service', () => ({
  ClinicalStorageService: class ClinicalStorageService {},
}));
jest.mock('../r28/clinical-r28.service', () => ({
  ClinicalR28Service: class ClinicalR28Service {},
}));

import type { AuthContext } from '../../auth/auth.types';
import { ClinicalR29Service } from './clinical-r29.service';

const auth: AuthContext = {
  sessionId: 's1',
  sessionToken: 'dummy',
  expiresAt: new Date('2030-01-01'),
  user: {
    id: 'u1',
    name: 'Prueba',
    email: 'u1@example.test',
    companyId: 'company-1',
    role: { id: 'r1', name: 'Administrador' },
    modules: ['all'],
    homePath: '/',
  },
};

describe('ClinicalR29Service safety', () => {
  it('creates capture as PENDING confirmation', async () => {
    const prisma: any = {
      clinicalProfile: { upsert: jest.fn().mockResolvedValue({ id: 'p1' }) },
      clinicalVisitCapture: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockImplementation(({ data }) => ({ id: 'c1', ...data })),
      },
      clinicalAuditEvent: { create: jest.fn() },
      clinicalOperationReceipt: { upsert: jest.fn() },
    };
    const service = new ClinicalR29Service(prisma, {} as any, {} as any);
    const result: any = await service.createCapture(auth, {
      sourceType: 'VOICE',
      sourceText: 'Médico: Dra. Prueba',
    });
    expect(result.confirmationStatus).toBe('PENDING');
    expect(result.proposedData.fields.doctor).toBe('Dra. Prueba');
  });

  it('requires explicit medication interval rather than inferring it', async () => {
    const prisma: any = {
      clinicalProfile: { upsert: jest.fn().mockResolvedValue({ id: 'p1' }) },
      clinicalMedicationSchedule: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      clinicalMedicationRegimen: {
        findFirst: jest
          .fn()
          .mockResolvedValue({
            id: 'r1',
            clinicalProfileId: 'p1',
            durationDays: 7,
            timezone: 'America/Mexico_City',
          }),
      },
    };
    const service = new ClinicalR29Service(prisma, {} as any, {} as any);
    await expect(
      service.createMedicationSchedule(auth, {
        regimenId: 'r1',
        firstDoseAt: '2026-10-04T08:30:00-06:00',
        intervalHours: 0,
      }),
    ).rejects.toThrow();
  });

  it('health QR stores categories rather than PHI in the token', async () => {
    const prisma: any = {
      clinicalProfile: { upsert: jest.fn().mockResolvedValue({ id: 'p1' }) },
      clinicalShareLink: {
        create: jest
          .fn()
          .mockImplementation(({ data }) => ({ id: 'link1', ...data })),
      },
      clinicalAuditEvent: { create: jest.fn() },
    };
    const service = new ClinicalR29Service(prisma, {} as any, {} as any);
    const result: any = await service.createHealthQr(auth, {
      categories: ['ALLERGIES'],
      expiresInMinutes: 15,
    });
    expect(result.token).toBeTruthy();
    expect(result.link.resources).toEqual(['ALLERGIES']);
    expect(result.token).not.toContain('ALLERGIES');
  });
});

describe('PRUEBA aislamiento de operaciones clínicas', () => {
  it.each([
    ['createCapture', 'clinicalVisitCapture'],
    ['createAllergy', 'clinicalAllergy'],
    ['createRestriction', 'clinicalRestriction'],
    ['createMedicationSchedule', 'clinicalMedicationSchedule'],
    ['createProcedure', 'clinicalProcedure'],
  ])('%s rechaza operaciones de otro perfil', async (method, model) => {
    const prisma: any = {
      clinicalProfile: {
        upsert: jest.fn().mockResolvedValue({ id: 'propio' }),
      },
      [model]: {
        findUnique: jest.fn().mockResolvedValue({ clinicalProfileId: 'ajeno' }),
      },
    };
    const service: any = new ClinicalR29Service(prisma, {} as any, {} as any);
    await expect(
      service[method](auth, { operationId: 'PRUEBA' }),
    ).rejects.toThrow('Operación no disponible');
  });
  it('no revela el recurso de un recibo ajeno', async () => {
    const prisma: any = {
      clinicalOperationReceipt: {
        findUnique: jest
          .fn()
          .mockResolvedValue({
            actorUserId: 'otro',
            operationType: 'CAPTURE_CREATE',
            resourceId: 'privado',
          }),
      },
    };
    const result = await new ClinicalR29Service(
      prisma,
      {} as any,
      {} as any,
    ).sync(auth, {
      operations: [
        { operationId: 'PRUEBA', kind: 'CAPTURE_CREATE', payload: {} },
      ],
    } as any);
    expect(result.results[0].status).toBe('failed');
    expect(JSON.stringify(result)).not.toContain('privado');
  });
  it('reconoce un recibo propio sin repetir la operación', async () => {
    const prisma: any = {
      clinicalOperationReceipt: {
        findUnique: jest
          .fn()
          .mockResolvedValue({
            actorUserId: auth.user.id,
            operationType: 'CAPTURE_CREATE',
            resourceId: 'propio',
          }),
      },
    };
    const result = await new ClinicalR29Service(
      prisma,
      {} as any,
      {} as any,
    ).sync(auth, {
      operations: [
        { operationId: 'PRUEBA', kind: 'CAPTURE_CREATE', payload: {} },
      ],
    } as any);
    expect(result.results[0]).toEqual({
      operationId: 'PRUEBA',
      status: 'already_applied',
      resourceId: 'propio',
    });
  });
  it('rechaza una dosis registrada por otra persona', async () => {
    const prisma: any = {
      clinicalProfile: {
        upsert: jest.fn().mockResolvedValue({ id: 'propio' }),
      },
      clinicalMedicationAdministration: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ createdById: 'otro', scheduleId: 'horario' }),
      },
    };
    await expect(
      new ClinicalR29Service(prisma, {} as any, {} as any).recordMedicationDose(
        auth,
        'horario',
        { operationId: 'PRUEBA' } as any,
      ),
    ).rejects.toThrow('Operación no disponible');
  });
});
