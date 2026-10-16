import { IsEmail, IsIn, IsOptional } from 'class-validator';

export class AddSiteMemberDto {
  @IsEmail()
  email!: string;

  @IsIn(['admin', 'editor', 'publisher', 'viewer'])
  role!: string;
}

export class UpdateSiteMemberDto {
  @IsOptional()
  @IsIn(['admin', 'editor', 'publisher', 'viewer'])
  role?: string;

  @IsOptional()
  @IsIn(['active', 'inactive'])
  status?: string;
}
