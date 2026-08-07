import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateKnowledgeAlternativeDto {
  @IsString()
  @IsNotEmpty({
    message: 'El título de la alternativa es obligatorio',
  })
  @MaxLength(150)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  defaultPriority?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;

  @IsUUID('4', {
    message: 'El identificador del conocimiento no es válido',
  })
  knowledgeTemplateId: string;
}