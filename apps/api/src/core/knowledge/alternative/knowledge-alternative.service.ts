import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateKnowledgeAlternativeDto } from './dto/create-knowledge-alternative.dto';

@Injectable()
export class KnowledgeAlternativeService {
  constructor(private readonly prisma: PrismaService) {}

  async findByKnowledge(knowledgeTemplateId: string) {
    return this.prisma.knowledgeAlternativeTemplate.findMany({
      where: {
        knowledgeTemplateId,
      },
      orderBy: {
        order: 'asc',
      },
    });
  }

  async create(
    createKnowledgeAlternativeDto: CreateKnowledgeAlternativeDto,
  ) {
    const knowledge = await this.prisma.knowledgeTemplate.findUnique({
      where: {
        id: createKnowledgeAlternativeDto.knowledgeTemplateId,
      },
    });

    if (!knowledge) {
      throw new NotFoundException(
        'La plantilla de conocimiento no existe',
      );
    }

    try {
      return await this.prisma.knowledgeAlternativeTemplate.create({
        data: {
          title: createKnowledgeAlternativeDto.title.trim(),
          description:
            createKnowledgeAlternativeDto.description?.trim(),
          defaultPriority:
            createKnowledgeAlternativeDto.defaultPriority ?? 'normal',
          order: createKnowledgeAlternativeDto.order ?? 0,
          knowledgeTemplateId:
            createKnowledgeAlternativeDto.knowledgeTemplateId,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Esa alternativa ya existe para este conocimiento',
        );
      }

      throw error;
    }
  }
}