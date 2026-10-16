import 'reflect-metadata';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';

import { PlatformOperatorGuard } from '../../auth/platform-operator.guard';
import { SessionAuthGuard } from '../../auth/session-auth.guard';
import { ExperienceController } from '../experience/experience.controller';
import { ExperienceService } from '../experience/experience.service';
import { KnowledgeAlternativeController } from '../knowledge/alternative/knowledge-alternative.controller';
import { KnowledgeController } from '../knowledge/knowledge.controller';
import { WorkflowController } from '../workflow/workflow.controller';
import { WorkflowService } from '../workflow/workflow.service';
import { AlternativeController } from './alternative/alternative.controller';
import { AlternativeService } from './alternative/alternative.service';
import { IncidentController } from './incident.controller';
import { IncidentService } from './incident.service';

const MINE = 'empresa-propia';
const OTHER = 'empresa-ajena';

function methodGuards(controller: { prototype: object }, method: string) {
  const handler = Object.getOwnPropertyDescriptor(
    controller.prototype,
    method,
  )?.value;
  return Reflect.getMetadata(GUARDS_METADATA, handler) ?? [];
}

describe('Aislamiento por empresa: incidentes, workflow, experiencia y conocimiento', () => {
  describe('puertas', () => {
    it.each([
      ['incident', IncidentController],
      ['incident-alternative', AlternativeController],
      ['experience', ExperienceController],
      ['workflow', WorkflowController],
      ['knowledge', KnowledgeController],
      ['knowledge-alternative', KnowledgeAlternativeController],
    ])('%s exige sesión en todos sus endpoints', (_name, controller) => {
      const guards = Reflect.getMetadata(GUARDS_METADATA, controller) ?? [];
      expect(guards).toContain(SessionAuthGuard);
    });

    it('escribir conocimiento compartido exige operador; leerlo no', () => {
      expect(methodGuards(KnowledgeController, 'create')).toContain(
        PlatformOperatorGuard,
      );
      expect(methodGuards(KnowledgeController, 'findAll')).not.toContain(
        PlatformOperatorGuard,
      );
      expect(methodGuards(KnowledgeAlternativeController, 'create')).toContain(
        PlatformOperatorGuard,
      );
      expect(
        methodGuards(KnowledgeAlternativeController, 'findByKnowledge'),
      ).not.toContain(PlatformOperatorGuard);
    });
  });

  describe('controladores pasan la empresa de la sesión', () => {
    const auth = { user: { companyId: MINE } } as never;

    it('incident', () => {
      const service = {
        findAll: jest.fn(),
        create: jest.fn(),
        generateAlternativesFromKnowledge: jest.fn(),
      };
      const controller = new IncidentController(service as never);
      controller.findAll(auth);
      controller.generateAlternatives(auth, 'i1');
      expect(service.findAll).toHaveBeenCalledWith(MINE);
      expect(service.generateAlternativesFromKnowledge).toHaveBeenCalledWith(
        'i1',
        MINE,
      );
    });

    it('workflow', () => {
      const service = {
        findAll: jest.fn(),
        advance: jest.fn(),
        runUntilHumanDecision: jest.fn(),
        approveAlternative: jest.fn(),
        verifyResult: jest.fn(),
      };
      const controller = new WorkflowController(service as never);
      controller.findAll(auth);
      controller.advance(auth, 'w1');
      controller.runUntilHumanDecision(auth, 'w1');
      controller.approveAlternative(auth, 'w1', 'a1');
      expect(service.findAll).toHaveBeenCalledWith(MINE);
      expect(service.advance).toHaveBeenCalledWith('w1', MINE);
      expect(service.runUntilHumanDecision).toHaveBeenCalledWith('w1', MINE);
      expect(service.approveAlternative).toHaveBeenCalledWith('w1', 'a1', MINE);
    });
  });

  describe('IncidentService', () => {
    it('lista solo incidentes de la empresa de la sesión', async () => {
      const findMany = jest.fn().mockResolvedValue([]);
      const service = new IncidentService({ incident: { findMany } } as never);
      await service.findAll(MINE);
      expect(findMany.mock.calls[0][0].where).toEqual({ companyId: MINE });
    });

    it('no crea incidentes en otra empresa', async () => {
      const create = jest.fn();
      const service = new IncidentService({
        company: { findUnique: jest.fn() },
        incident: { create },
      } as never);
      await expect(
        service.create({ title: 'x', companyId: OTHER } as never, MINE),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(create).not.toHaveBeenCalled();
    });

    it('no genera alternativas para incidentes ajenos', async () => {
      const createMany = jest.fn();
      const service = new IncidentService({
        incident: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'i1',
            companyId: OTHER,
            alternatives: [],
          }),
        },
        incidentAlternative: { createMany },
      } as never);
      await expect(
        service.generateAlternativesFromKnowledge('i1', MINE),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(createMany).not.toHaveBeenCalled();
    });
  });

  describe('AlternativeService', () => {
    it('lista alternativas solo si el incidente es de la empresa', async () => {
      const findMany = jest.fn().mockResolvedValue([]);
      const service = new AlternativeService({
        incidentAlternative: { findMany },
      } as never);
      await service.findByIncident('i1', MINE);
      expect(findMany.mock.calls[0][0].where).toEqual({
        incidentId: 'i1',
        incident: { companyId: MINE },
      });
    });

    it('no crea, analiza ni selecciona alternativas de incidentes ajenos', async () => {
      const create = jest.fn();
      const transaction = jest.fn();
      const service = new AlternativeService({
        incident: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'i1',
            companyId: OTHER,
            alternatives: [],
          }),
        },
        incidentAlternative: {
          create,
          findUnique: jest.fn().mockResolvedValue({
            id: 'a1',
            status: 'pending',
            incident: { companyId: OTHER, status: 'open' },
          }),
        },
        $transaction: transaction,
      } as never);

      await expect(
        service.create({ incidentId: 'i1', title: 'x' } as never, MINE),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.analyze('i1', MINE)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(service.select('a1', MINE)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(create).not.toHaveBeenCalled();
      expect(transaction).not.toHaveBeenCalled();
    });
  });

  describe('ExperienceService', () => {
    it('lista solo experiencias de la empresa', async () => {
      const findMany = jest.fn().mockResolvedValue([]);
      const service = new ExperienceService({
        experience: { findMany },
      } as never);
      await service.findAll(MINE);
      expect(findMany.mock.calls[0][0].where).toEqual({ companyId: MINE });
    });
  });

  describe('WorkflowService', () => {
    const foreignWorkflow = {
      id: 'w1',
      companyId: OTHER,
      status: 'pending',
      entityType: 'incident',
      entityId: 'i1',
      steps: [],
    };

    function serviceWith(prisma: Record<string, unknown>) {
      return new WorkflowService(prisma as never);
    }

    it('lista solo workflows de la empresa', async () => {
      const findMany = jest.fn().mockResolvedValue([]);
      await serviceWith({ workflow: { findMany } }).findAll(MINE);
      expect(findMany.mock.calls[0][0].where).toEqual({ companyId: MINE });
    });

    it('no crea workflows para otra empresa', async () => {
      const create = jest.fn();
      await expect(
        serviceWith({ workflow: { create } }).create(
          { name: 'x', type: 'y', companyId: OTHER } as never,
          MINE,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(create).not.toHaveBeenCalled();
    });

    it('no asocia un workflow a un incidente de otra empresa', async () => {
      const create = jest.fn();
      await expect(
        serviceWith({
          company: { findUnique: jest.fn().mockResolvedValue({ id: MINE }) },
          incident: { findFirst: jest.fn().mockResolvedValue(null) },
          workflow: { create },
        }).create(
          {
            name: 'x',
            type: 'y',
            companyId: MINE,
            entityType: 'incident',
            entityId: 'i-ajeno',
          } as never,
          MINE,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(create).not.toHaveBeenCalled();
    });

    it('advance, run, approve y verify ignoran workflows ajenos', async () => {
      const update = jest.fn();
      const service = serviceWith({
        workflow: {
          findUnique: jest.fn().mockResolvedValue(foreignWorkflow),
          update,
        },
        workflowStep: { update },
        incident: { findUnique: jest.fn() },
      });

      await expect(service.advance('w1', MINE)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(
        service.runUntilHumanDecision('w1', MINE),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        service.approveAlternative('w1', 'a1', MINE),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        service.verifyResult('w1', { taskId: 't1' } as never, MINE),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(update).not.toHaveBeenCalled();
    });

    it('approve y verify no tocan un incidente de otra empresa', async () => {
      const own = { ...foreignWorkflow, companyId: MINE };
      const alternativeLookup = jest.fn();
      const service = serviceWith({
        workflow: { findUnique: jest.fn().mockResolvedValue(own) },
        incident: {
          findUnique: jest
            .fn()
            .mockResolvedValue({ id: 'i1', companyId: OTHER }),
        },
        incidentAlternative: { findUnique: alternativeLookup },
        task: { findUnique: jest.fn() },
      });

      await expect(
        service.approveAlternative('w1', 'a1', MINE),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        service.verifyResult('w1', { taskId: 't1' } as never, MINE),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(alternativeLookup).not.toHaveBeenCalled();
    });

    it('un workflow sin incidente sigue dando el error de siempre', async () => {
      const own = { ...foreignWorkflow, companyId: MINE, entityType: null };
      const service = serviceWith({
        workflow: { findUnique: jest.fn().mockResolvedValue(own) },
      });
      await expect(
        service.approveAlternative('w1', 'a1', MINE),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
