import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

export class RedeemScratchDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  claimCode: string;

  @IsUUID('4')
  authorizedById: string;
}
