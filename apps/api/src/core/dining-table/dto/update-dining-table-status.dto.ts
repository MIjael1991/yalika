import {
  IsIn,
} from 'class-validator';

export class UpdateDiningTableStatusDto {
  @IsIn([
    'available',
    'occupied',
    'reserved',
    'disabled',
  ])
  status: string;
}