import { IsString, MaxLength, MinLength } from 'class-validator';

export class RequestClinicalAccessDto {
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  token!: string;
}
