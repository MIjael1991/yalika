import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';

@Injectable()
export class CustomerService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: string) {
    return this.prisma.customer.findMany({
      where: { companyId },
      include: {
        company: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findByCompany(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: {
        id: companyId,
      },
    });

    if (!company) {
      throw new NotFoundException('La empresa no existe');
    }

    return this.prisma.customer.findMany({
      where: {
        companyId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async create(createCustomerDto: CreateCustomerDto) {
    const company = await this.prisma.company.findUnique({
      where: {
        id: createCustomerDto.companyId,
      },
    });

    if (!company) {
      throw new NotFoundException('La empresa no existe');
    }

    const phone = createCustomerDto.phone.trim();

    const existingCustomer = await this.prisma.customer.findFirst({
      where: {
        companyId: createCustomerDto.companyId,
        phone,
      },
    });

    if (existingCustomer) {
      throw new ConflictException(
        'Este teléfono ya está registrado en este negocio',
      );
    }

    return this.prisma.customer.create({
      data: {
        name: createCustomerDto.name.trim(),
        phone,
        email: createCustomerDto.email?.trim().toLowerCase(),
        companyId: createCustomerDto.companyId,
      },
    });
  }
}
