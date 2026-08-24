import { IsArray, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateCharacterVersionDto {
  @IsString()
  @MinLength(10)
  @MaxLength(4000)
  description!: string;

  @IsIn(['generated', 'uploaded', 'hybrid'])
  origin!: 'generated' | 'uploaded' | 'hybrid';

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  invariants?: string[];
}
