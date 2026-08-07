import {
  ConflictException,
  Injectable,
} from '@nestjs/common';

import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateKnowledgeTemplateDto } from './dto/create-knowledge-template.dto';

@Injectable()
export class KnowledgeService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.knowledgeTemplate.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async create(
    createKnowledgeTemplateDto: CreateKnowledgeTemplateDto,
  ) {
    try {
      return await this.prisma.knowledgeTemplate.create({
        data: {
          name: createKnowledgeTemplateDto.name.trim(),
          category: createKnowledgeTemplateDto.category.trim(),
          description:
            createKnowledgeTemplateDto.description?.trim(),
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Ya existe un conocimiento con ese nombre y categoría',
        );
      }

      throw error;
    }
  }
}