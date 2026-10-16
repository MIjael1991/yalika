import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { VerifyWorkflowResultDto } from './dto/verify-workflow-result.dto';

@Injectable()
export class WorkflowService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.workflow.findMany({
      include: {
        steps: {
          orderBy: {
            stepOrder: 'asc',
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async create(createWorkflowDto: CreateWorkflowDto) {
    const company = await this.prisma.company.findUnique({
      where: {
        id: createWorkflowDto.companyId,
      },
    });

    if (!company) {
      throw new NotFoundException('La empresa no existe');
    }

    return this.prisma.workflow.create({
      data: {
        name: createWorkflowDto.name.trim(),
        type: createWorkflowDto.type.trim().toLowerCase(),
        entityType: createWorkflowDto.entityType?.trim(),
        entityId: createWorkflowDto.entityId?.trim(),
        companyId: createWorkflowDto.companyId,

        steps: {
          create: [
            {
              name: 'Detectar contexto',
              stepOrder: 1,
              actionType: 'context.detect',
            },
            {
              name: 'Buscar conocimiento',
              stepOrder: 2,
              actionType: 'knowledge.search',
            },
            {
              name: 'Generar alternativas',
              stepOrder: 3,
              actionType: 'alternatives.generate',
            },
            {
              name: 'Esperar decisión humana',
              stepOrder: 4,
              actionType: 'human.approval',
            },
            {
              name: 'Crear plan de acción',
              stepOrder: 5,
              actionType: 'tasks.generate',
            },
            {
              name: 'Dar seguimiento',
              stepOrder: 6,
              actionType: 'followup.monitor',
            },
            {
              name: 'Cerrar proceso',
              stepOrder: 7,
              actionType: 'workflow.close',
            },
          ],
        },
      },
      include: {
        steps: {
          orderBy: {
            stepOrder: 'asc',
          },
        },
      },
    });
  }

  async advance(workflowId: string) {
    const workflow = await this.prisma.workflow.findUnique({
      where: {
        id: workflowId,
      },
      include: {
        steps: {
          orderBy: {
            stepOrder: 'asc',
          },
        },
      },
    });

    if (!workflow) {
      throw new NotFoundException('El workflow no existe');
    }

    const currentStep = workflow.steps.find(
      (step) => step.status === 'pending' || step.status === 'in_progress',
    );

    if (!currentStep) {
      return {
        message: 'El workflow ya no tiene pasos pendientes',
        workflowId,
        status: workflow.status,
      };
    }

    const now = new Date();

    if (currentStep.status === 'pending') {
      const startedStep = await this.prisma.workflowStep.update({
        where: {
          id: currentStep.id,
        },
        data: {
          status: 'in_progress',
          startedAt: now,
        },
      });

      return {
        message: 'Paso iniciado',
        workflowId,
        step: startedStep,
      };
    }

    const completedStep = await this.prisma.workflowStep.update({
      where: {
        id: currentStep.id,
      },
      data: {
        status: 'completed',
        completedAt: now,
      },
    });

    const nextStep = workflow.steps.find(
      (step) =>
        step.stepOrder > currentStep.stepOrder && step.status === 'pending',
    );

    if (!nextStep) {
      await this.prisma.workflow.update({
        where: {
          id: workflowId,
        },
        data: {
          status: 'completed',
        },
      });

      return {
        message: 'Workflow completado',
        workflowId,
        completedStep,
        status: 'completed',
      };
    }

    return {
      message: 'Paso completado',
      workflowId,
      completedStep,
      nextStep: {
        id: nextStep.id,
        name: nextStep.name,
        stepOrder: nextStep.stepOrder,
        actionType: nextStep.actionType,
      },
    };
  }

  async runUntilHumanDecision(workflowId: string) {
    const workflow = await this.prisma.workflow.findUnique({
      where: {
        id: workflowId,
      },
      include: {
        steps: {
          orderBy: {
            stepOrder: 'asc',
          },
        },
      },
    });

    if (!workflow) {
      throw new NotFoundException('El workflow no existe');
    }

    const executionLog: Array<{
      stepOrder: number;
      name: string;
      actionType: string | null;
      result: string;
    }> = [];

    for (const step of workflow.steps) {
      if (step.status === 'completed') {
        continue;
      }

      if (step.actionType === 'human.approval') {
        if (step.status === 'pending') {
          await this.prisma.workflowStep.update({
            where: {
              id: step.id,
            },
            data: {
              status: 'waiting',
              startedAt: new Date(),
            },
          });
        }

        await this.prisma.workflow.update({
          where: {
            id: workflowId,
          },
          data: {
            status: 'waiting_human_decision',
          },
        });

        return {
          message: 'ORION está esperando una decisión humana',
          workflowId,
          status: 'waiting_human_decision',
          executionLog,
          waitingStep: {
            id: step.id,
            name: step.name,
            stepOrder: step.stepOrder,
            actionType: step.actionType,
          },
        };
      }

      await this.prisma.workflowStep.update({
        where: {
          id: step.id,
        },
        data: {
          status: 'in_progress',
          startedAt: step.startedAt ?? new Date(),
        },
      });

      let result = 'Paso procesado automáticamente';

      if (step.actionType === 'context.detect') {
        result = 'Contexto identificado';
      }

      if (step.actionType === 'knowledge.search') {
        if (!workflow.entityId) {
          result = 'El workflow no tiene una entidad asociada';
        } else {
          const incident = await this.prisma.incident.findUnique({
            where: {
              id: workflow.entityId,
            },
          });

          if (!incident) {
            result = 'No se encontró el incidente asociado';
          } else if (!incident.category) {
            result = 'El incidente no tiene categoría';
          } else {
            const knowledge = await this.prisma.knowledgeTemplate.findFirst({
              where: {
                category: incident.category,
                status: 'active',
              },
            });

            if (!knowledge) {
              result =
                'ORION todavía no tiene conocimiento para esta categoría';
            } else {
              result = `Conocimiento encontrado: ${knowledge.name}`;

              await this.prisma.workflowStep.update({
                where: {
                  id: step.id,
                },
                data: {
                  data: {
                    knowledgeTemplateId: knowledge.id,
                    knowledgeName: knowledge.name,
                    category: knowledge.category,
                  },
                },
              });
            }
          }
        }
      }

      if (step.actionType === 'alternatives.generate') {
        if (!workflow.entityId) {
          result = 'El workflow no tiene incidente asociado';
        } else {
          const incident = await this.prisma.incident.findUnique({
            where: {
              id: workflow.entityId,
            },
            include: {
              alternatives: true,
            },
          });

          if (!incident) {
            result = 'No se encontró el incidente asociado';
          } else if (!incident.category) {
            result = 'El incidente no tiene categoría';
          } else {
            const knowledge = await this.prisma.knowledgeTemplate.findFirst({
              where: {
                category: incident.category,
                status: 'active',
              },
              include: {
                alternatives: {
                  where: {
                    status: 'active',
                  },
                  orderBy: {
                    order: 'asc',
                  },
                },
              },
            });

            if (!knowledge) {
              result = 'No existe conocimiento para generar alternativas';
            } else {
              const existingTitles = new Set(
                incident.alternatives.map((alternative) =>
                  alternative.title.toLowerCase(),
                ),
              );

              const templatesToCreate = knowledge.alternatives.filter(
                (template) => !existingTitles.has(template.title.toLowerCase()),
              );

              if (templatesToCreate.length > 0) {
                await this.prisma.incidentAlternative.createMany({
                  data: templatesToCreate.map((template) => ({
                    title: template.title,
                    description: template.description,
                    impact: `Generada automáticamente desde Knowledge Engine: ${knowledge.name}`,
                    incidentId: incident.id,
                  })),
                });
              }

              result = `${templatesToCreate.length} alternativas generadas automáticamente`;
            }
          }
        }
      }

      await this.prisma.workflowStep.update({
        where: {
          id: step.id,
        },
        data: {
          status: 'completed',
          completedAt: new Date(),
        },
      });

      executionLog.push({
        stepOrder: step.stepOrder,
        name: step.name,
        actionType: step.actionType,
        result,
      });
    }

    await this.prisma.workflow.update({
      where: {
        id: workflowId,
      },
      data: {
        status: 'completed',
      },
    });

    return {
      message: 'Workflow completado automáticamente',
      workflowId,
      status: 'completed',
      executionLog,
    };
  }

  async approveAlternative(workflowId: string, alternativeId: string) {
    const workflow = await this.prisma.workflow.findUnique({
      where: {
        id: workflowId,
      },
      include: {
        steps: {
          orderBy: {
            stepOrder: 'asc',
          },
        },
      },
    });

    if (!workflow) {
      throw new NotFoundException('El workflow no existe');
    }

    if (workflow.entityType !== 'incident' || !workflow.entityId) {
      throw new BadRequestException(
        'Este workflow no está asociado a un incidente',
      );
    }

    const incident = await this.prisma.incident.findUnique({
      where: {
        id: workflow.entityId,
      },
    });

    if (!incident) {
      throw new NotFoundException('El incidente asociado no existe');
    }

    const alternative = await this.prisma.incidentAlternative.findUnique({
      where: {
        id: alternativeId,
      },
    });

    if (!alternative) {
      throw new NotFoundException('La alternativa seleccionada no existe');
    }

    if (alternative.incidentId !== incident.id) {
      throw new BadRequestException(
        'La alternativa no pertenece a este incidente',
      );
    }

    const humanStep = workflow.steps.find(
      (step) => step.actionType === 'human.approval',
    );

    if (!humanStep) {
      throw new BadRequestException(
        'El workflow no tiene un paso de decisión humana',
      );
    }

    if (humanStep.status === 'completed') {
      throw new BadRequestException('La decisión humana ya fue registrada');
    }

    const taskStep = workflow.steps.find(
      (step) => step.actionType === 'tasks.generate',
    );

    const followUpStep = workflow.steps.find(
      (step) => step.actionType === 'followup.monitor',
    );

    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.incidentAlternative.updateMany({
        where: {
          incidentId: incident.id,
        },
        data: {
          status: 'rejected',
        },
      }),

      this.prisma.incidentAlternative.update({
        where: {
          id: alternative.id,
        },
        data: {
          status: 'selected',
        },
      }),

      this.prisma.incident.update({
        where: {
          id: incident.id,
        },
        data: {
          status: 'in_progress',
        },
      }),

      this.prisma.workflowStep.update({
        where: {
          id: humanStep.id,
        },
        data: {
          status: 'completed',
          startedAt: humanStep.startedAt ?? now,
          completedAt: now,
          data: {
            alternativeId: alternative.id,
            alternativeTitle: alternative.title,
            decision: 'approved',
          },
        },
      }),

      this.prisma.workflow.update({
        where: {
          id: workflow.id,
        },
        data: {
          status: 'waiting_followup',
        },
      }),
    ]);

    const generatedTasks: Array<{
      id: string;
      title: string;
      priority: string;
      status: string;
    }> = [];

    if (taskStep) {
      await this.prisma.workflowStep.update({
        where: {
          id: taskStep.id,
        },
        data: {
          status: 'in_progress',
          startedAt: now,
        },
      });

      const executionTask = await this.prisma.task.create({
        data: {
          title: `Ejecutar solución: ${alternative.title}`,
          description:
            alternative.description ??
            `Ejecutar solución seleccionada para: ${incident.title}`,
          category: 'contingencia',
          priority: 'urgente',
          status: 'pending',
          dueAt: now,
          companyId: incident.companyId,
        },
      });

      const followUpTask = await this.prisma.task.create({
        data: {
          title: `Verificar resultado: ${incident.title}`,
          description:
            'Comprobar que la solución seleccionada haya resuelto el incidente.',
          category: 'contingencia',
          priority: 'alta',
          status: 'pending',
          dueAt: now,
          companyId: incident.companyId,
        },
      });

      generatedTasks.push(
        {
          id: executionTask.id,
          title: executionTask.title,
          priority: executionTask.priority,
          status: executionTask.status,
        },
        {
          id: followUpTask.id,
          title: followUpTask.title,
          priority: followUpTask.priority,
          status: followUpTask.status,
        },
      );

      await this.prisma.workflowStep.update({
        where: {
          id: taskStep.id,
        },
        data: {
          status: 'completed',
          completedAt: new Date(),
        },
      });
    }

    if (followUpStep) {
      await this.prisma.workflowStep.update({
        where: {
          id: followUpStep.id,
        },
        data: {
          status: 'waiting',
          startedAt: new Date(),
        },
      });
    }

    return {
      message: 'Decisión registrada y plan de acción generado',
      workflowId: workflow.id,

      incident: {
        id: incident.id,
        title: incident.title,
        status: 'in_progress',
      },

      selectedAlternative: {
        id: alternative.id,
        title: alternative.title,
      },

      generatedTasks,

      workflowStatus: 'waiting_followup',
      humanDecisionConfirmed: true,
    };
  }
  async verifyResult(workflowId: string, verifyDto: VerifyWorkflowResultDto) {
    const workflow = await this.prisma.workflow.findUnique({
      where: {
        id: workflowId,
      },
      include: {
        steps: {
          orderBy: {
            stepOrder: 'asc',
          },
        },
      },
    });

    if (!workflow) {
      throw new NotFoundException('El workflow no existe');
    }

    if (workflow.entityType !== 'incident' || !workflow.entityId) {
      throw new BadRequestException(
        'Este workflow no está asociado a un incidente',
      );
    }

    const incident = await this.prisma.incident.findUnique({
      where: {
        id: workflow.entityId,
      },
    });

    if (!incident) {
      throw new NotFoundException('El incidente asociado no existe');
    }

    const task = await this.prisma.task.findUnique({
      where: {
        id: verifyDto.taskId,
      },
    });

    if (!task) {
      throw new NotFoundException('La tarea de verificación no existe');
    }

    if (task.companyId !== incident.companyId) {
      throw new BadRequestException(
        'La tarea no pertenece a la empresa del incidente',
      );
    }

    const expectedTitle = `Verificar resultado: ${incident.title}`;

    if (task.title !== expectedTitle) {
      throw new BadRequestException(
        'La tarea indicada no corresponde a la verificación de este incidente',
      );
    }

    if (task.status === 'completed') {
      throw new BadRequestException('La verificación ya fue registrada');
    }

    const humanStep = workflow.steps.find(
      (step) => step.actionType === 'human.approval',
    );

    const followUpStep = workflow.steps.find(
      (step) => step.actionType === 'followup.monitor',
    );

    const closeStep = workflow.steps.find(
      (step) => step.actionType === 'workflow.close',
    );

    if (!followUpStep) {
      throw new BadRequestException('El workflow no tiene paso de seguimiento');
    }

    if (!closeStep) {
      throw new BadRequestException('El workflow no tiene paso de cierre');
    }

    const now = new Date();

    const selectedAlternative = await this.prisma.incidentAlternative.findFirst(
      {
        where: {
          incidentId: incident.id,
          status: 'selected',
        },
      },
    );

    const resultData = {
      success: verifyDto.success,
      delayMinutes: verifyDto.delayMinutes ?? null,
      extraCost: verifyDto.extraCost ?? null,
      estimatedLoss: verifyDto.estimatedLoss ?? null,
      customersAffected: verifyDto.customersAffected ?? null,
      notes: verifyDto.notes?.trim() ?? null,
      verifiedAt: now.toISOString(),
    };

    await this.prisma.task.update({
      where: {
        id: task.id,
      },
      data: {
        status: 'completed',
      },
    });
    const experience = await this.prisma.experience.create({
      data: {
        type: 'incident_resolution',
        category: incident.category ?? 'sin_categoria',

        success: verifyDto.success,

        delayMinutes: verifyDto.delayMinutes,
        extraCost: verifyDto.extraCost,
        estimatedLoss: verifyDto.estimatedLoss,
        customersAffected: verifyDto.customersAffected,

        notes: verifyDto.notes?.trim(),

        selectedAlternativeTitle: selectedAlternative?.title,

        verifiedAt: now,

        companyId: incident.companyId,
        incidentId: incident.id,
        workflowId: workflow.id,

        selectedAlternativeId: selectedAlternative?.id,
      },
    });

    await this.prisma.workflowStep.update({
      where: {
        id: followUpStep.id,
      },
      data: {
        status: 'completed',
        completedAt: now,
        data: resultData,
      },
    });

    if (!verifyDto.success) {
      if (humanStep) {
        await this.prisma.workflowStep.update({
          where: {
            id: humanStep.id,
          },
          data: {
            status: 'waiting',
            completedAt: null,
          },
        });
      }

      await this.prisma.workflow.update({
        where: {
          id: workflow.id,
        },
        data: {
          status: 'waiting_human_decision',
        },
      });

      return {
        message:
          'La solución no resolvió el incidente. ORION requiere una nueva decisión humana.',
        workflowId: workflow.id,
        incidentId: incident.id,
        success: false,
        result: resultData,
        experienceId: experience.id,
        nextAction: 'select_another_alternative',
      };
    }

    await this.prisma.incident.update({
      where: {
        id: incident.id,
      },
      data: {
        status: 'resolved',
        resolvedAt: now,
      },
    });

    await this.prisma.workflowStep.update({
      where: {
        id: closeStep.id,
      },
      data: {
        status: 'completed',
        startedAt: closeStep.startedAt ?? now,
        completedAt: now,
        data: {
          reason: 'incident_resolved',
        },
      },
    });

    await this.prisma.workflow.update({
      where: {
        id: workflow.id,
      },
      data: {
        status: 'completed',
      },
    });

    return {
      message:
        'Resultado verificado. Incidente y workflow cerrados correctamente.',
      workflowId: workflow.id,
      incidentId: incident.id,
      success: true,
      result: resultData,
      experienceId: experience.id,
      incidentStatus: 'resolved',
      workflowStatus: 'completed',
    };
  }
}
