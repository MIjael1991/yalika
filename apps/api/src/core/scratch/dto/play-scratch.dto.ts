import { IsString, IsUUID, Length } from 'class-validator';

export class PlayScratchDto {
  @IsUUID('4')
  customerId: string;

  @IsString()
  @Length(64, 64)
  memberToken: string;
}
