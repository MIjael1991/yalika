import { IsNotEmpty, IsString, IsUUID, Length } from 'class-validator';

import { JoinClubDto } from './join-club.dto';

export class ClaimTicketDto extends JoinClubDto {
  @IsUUID('4')
  orderId: string;

  @IsString()
  @IsNotEmpty()
  @Length(64, 64)
  token: string;
}
