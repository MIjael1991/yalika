import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateRoleDto } from './dto/create-role.dto';

@Injectable()
export class RoleService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: string) {
    return this.prisma.role.findMany({
      where: { companyId },
      include: {
        company: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async create(createRoleDto: CreateRoleDto) {
    const company = await this.prisma.company.findUnique({
      where: {
        id: createRoleDto.companyId,
      },
    });

    if (!company) {
      throw new NotFoundException('La empresa no existe');
    }

    try {
      return await this.prisma.role.create({
        data: {
          name: createRoleDto.name.trim(),
          description: createRoleDto.description?.trim(),
          companyId: createRoleDto.companyId,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Ya existe un rol con ese nombre dentro de la empresa',
        );
      }

      throw error;
    }
  }
}
