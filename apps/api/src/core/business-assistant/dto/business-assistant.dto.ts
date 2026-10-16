import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class InterpretBusinessAssistantDto {
  @IsString()
  @MaxLength(4000)
  text!: string;

  @IsOptional()
  @IsObject()
  context?: Record<string, unknown>;
}

export class SaveBusinessMemoryDto {
  @IsString()
  @MaxLength(40)
  scope!: string;

  @IsString()
  @MaxLength(80)
  key!: string;

  @IsObject()
  value!: Record<string, unknown>;
}
