import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsString,
} from 'class-validator';

export class UpdateVisibleModulesDto {
  @IsArray()
  @ArrayMaxSize(7)
  @ArrayUnique()
  @IsString({ each: true })
  @IsIn(
    ['surveys', 'life', 'pos', 'sites', 'health', 'veterinaria', 'presente'],
    {
      each: true,
    },
  )
  visibleModules!: string[];
}
