import { IsArray, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateCharacterDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(4000)
  description!: string;

  @IsIn(['generated', 'uploaded'])
  sourceMode!: 'generated' | 'uploaded';

  @IsOptional()
  @IsIn(['project', 'organization'])
  scope?: 'project' | 'organization';

  @IsOptional()
  @IsString()
  @MaxLength(120)
  roleName?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  invariants?: string[];
}
