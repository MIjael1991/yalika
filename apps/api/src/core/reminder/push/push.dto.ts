import { IsString, Matches, MaxLength } from 'class-validator';

export class SubscribePushDto {
  @IsString()
  @MaxLength(2048)
  @Matches(/^https:\/\//, { message: 'El destino del aviso no es válido' })
  endpoint: string;

  @IsString()
  @MaxLength(256)
  p256dh: string;

  @IsString()
  @MaxLength(256)
  auth: string;
}

export class UnsubscribePushDto {
  @IsString()
  @MaxLength(2048)
  endpoint: string;
}
