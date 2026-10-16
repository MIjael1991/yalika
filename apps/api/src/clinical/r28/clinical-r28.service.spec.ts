jest.mock('../../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));
jest.mock('../../core/task/task.service', () => ({
  TaskService: class TaskService {},
}));
jest.mock('../clinical.service', () => ({
  ClinicalService: class ClinicalService {},
}));

import { BadRequestException, ForbiddenException } from '@nestjs/common';

import type { AuthContext } from '../../auth/auth.types';
import { ClinicalR28Service } from './clinical-r28.service';

function auth(userId = 'patient-1'): AuthContext {
  return {
    sessionId: 's1',
    sessionToken: 'dummy',
    expiresAt: new Date('2030-01-01'),
    user: {
      id: userId,
      name: 'Prueba',
      email: `${userId}@example.test`,
      companyId: 'company-1',
      role: { id: 'role-1', name: 'Administrador' },
      modules: ['all'],
      homePath: '/',
    },
  };
}

describe('ClinicalR28Service security and integration', () => {
  it('creates consultations only on the owner profile', async () => {
    const create = jest.fn().mockResolvedValue({
      id: 'consult-1',
      priceCents: 500,
    });
    const tx = {
      clinicalConsultation: { create },
      clinicalTimelineEvent: { create: jest.fn() },
      clinicalIntegrationEvent: { create: jest.fn() },
      clinicalAuditEvent: { create: jest.fn() },
    };
    const prisma = {
      clinicalProfile: {
        upsert: jest.fn().mockResolvedValue({ id: 'profile-1' }),
      },
      $transaction: jest.fn((callback: any) => callback(tx)),
    };
    const service = new ClinicalR28Service(
      prisma as any,
      { assistant: jest.fn() } as any,
    );

    await service.createConsultation(auth(), {
      subjectType: 'HUMAN',
      mode: 'online',
      scheduledAt: '2026-10-01T18:00:00-06:00',
    });

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clinicalProfileId: 'profile-1',
          patientUserId: 'patient-1',
        }),
      }),
    );
  });

  it('does not allow an unassigned user to issue a professional prescription', async () => {
    const prisma = {
      clinicalConsultation: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const service = new ClinicalR28Service(
      prisma as any,
      { assistant: jest.fn() } as any,
    );

    await expect(
      service.issueConsultationPrescription(auth('other-user'), 'c1', {
        issuedAt: '2026-10-01',
        items: [{ medicationName: 'Medicamento de prueba' }],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects partially structured dosing instead of guessing missing values', async () => {
    const prisma = {
      clinicalConsultation: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'c1',
          clinicalProfileId: 'p1',
          clinicianUserId: 'doctor-1',
          patientUserId: 'patient-1',
          status: 'active',
        }),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({ name: 'Doctor Prueba' }),
      },
      $transaction: jest.fn(async (callback: any) =>
        callback({
          clinicalPrescription: {
            create: jest.fn().mockResolvedValue({
              id: 'rx1',
              items: [{ id: 'item1' }],
            }),
          },
          clinicalTimelineEvent: { create: jest.fn() },
          clinicalMedicationRegimen: { create: jest.fn() },
          clinicalIntegrationEvent: { upsert: jest.fn() },
          clinicalAuditEvent: { create: jest.fn() },
        }),
      ),
    };
    const service = new ClinicalR28Service(
      prisma as any,
      { assistant: jest.fn() } as any,
    );

    await expect(
      service.issueConsultationPrescription(auth('doctor-1'), 'c1', {
        issuedAt: '2026-10-01',
        items: [
          {
            medicationName: 'Medicamento de prueba',
            doseAmount: 1,
            doseUnit: 'tableta',
            // administrationsPerDay/durationDays intentionally missing.
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
