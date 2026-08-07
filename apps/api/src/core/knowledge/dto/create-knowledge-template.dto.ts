import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateKnowledgeTemplateDto {
  @IsString()
  @IsNotEmpty({
    message: 'El nombre del conocimiento es obligatorio',
  })
  @MaxLength(150)
  name: string;

  @IsString()
  @IsNotEmpty({
    message: 'La categoría es obligatoria',
  })
  @MaxLength(80)
  category: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}