jest.mock('../../prisma/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));
jest.mock('../../core/task/task.service', () => ({
  TaskService: class TaskService {},
}));

import type { AuthContext } from '../../auth/auth.types';
import { ClinicalLifeMaterializerService } from './clinical-r28-life-materializer.service';

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

describe('ClinicalLifeMaterializerService', () => {
  it('sends only generic consultation detail to Life', async () => {
    const createTask = jest.fn().mockResolvedValue({ id: 'task-1' });
    const update = jest.fn().mockResolvedValue({});
    const service = new ClinicalLifeMaterializerService(
      {
        clinicalIntegrationEvent: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'event-1',
              eventType: 'clinical.consultation.scheduled',
              sourceId: 'consultation-1234',
              dueAt: new Date('2026-10-01T18:00:00Z'),
              metadata: {},
              createdAt: new Date(),
            },
          ]),
          update,
        },
        space: { findFirst: jest.fn().mockResolvedValue({ id: 'space-1' }) },
      } as any,
      { create: createTask } as any,
    );

    await service.materializeForUser(auth);

    expect(createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining('Consulta de salud'),
        category: 'health_consultation',
      }),
      'u1',
      'company-1',
    );
    expect(JSON.stringify(createTask.mock.calls)).not.toContain('diagnosis');
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'delivered' }),
      }),
    );
  });

  it('does not invent medication reminder time', async () => {
    const service = new ClinicalLifeMaterializerService(
      {
        clinicalIntegrationEvent: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'event-1',
              eventType: 'clinical.medication.reminder.requested',
              sourceId: 'item-1',
              dueAt: null,
              metadata: {},
              createdAt: new Date(),
            },
          ]),
          update: jest.fn(),
        },
        space: { findFirst: jest.fn().mockResolvedValue(null) },
      } as any,
      { create: jest.fn() } as any,
    );

    const result = await service.materializeForUser(auth);
    expect(result.failed).toBe(1);
  });
});
