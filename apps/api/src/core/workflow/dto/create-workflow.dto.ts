import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateWorkflowDto {
  @IsString()
  @IsNotEmpty({
    message: 'El nombre del workflow es obligatorio',
  })
  @MaxLength(150)
  name: string;

  @IsString()
  @IsNotEmpty({
    message: 'El tipo del workflow es obligatorio',
  })
  @MaxLength(120)
  type: string;

  @IsOptional()
  @IsString()
  entityType?: string;

  @IsOptional()
  @IsString()
  entityId?: string;

  @IsUUID('4', {
    message: 'El identificador de la empresa no es válido',
  })
  companyId: string;
}
