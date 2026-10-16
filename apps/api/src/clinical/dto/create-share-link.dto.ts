import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateShareLinkDto {
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  resourceIds!: string[];

  @IsArray()
  @ArrayMaxSize(4)
  @IsString({ each: true })
  permissions!: string[];

  @IsInt()
  @Min(5)
  @Max(1440)
  expiresInMinutes!: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  purpose?: string;
}
