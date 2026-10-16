import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsString,
} from 'class-validator';

export class UpdateVisibleModulesDto {
  @IsArray()
  @ArrayMaxSize(5)
  @ArrayUnique()
  @IsString({ each: true })
  @IsIn(['surveys', 'life', 'pos', 'sites', 'health'], { each: true })
  visibleModules!: string[];
}
