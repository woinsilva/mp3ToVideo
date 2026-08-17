import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';

export class CreateProjectDto {
  @IsString()
  @MinLength(2)
  title!: string;

  @IsOptional()
  @IsIn(['music', 'prompt'])
  generationMode?: 'music' | 'prompt';

  @ValidateIf((input: CreateProjectDto) => input.generationMode === 'prompt')
  @IsString()
  @MinLength(10)
  @MaxLength(4000)
  generationPrompt?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(600)
  clipDurationSeconds?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(3)
  @Max(30)
  sceneDurationSeconds?: number;

  @IsOptional()
  @IsString()
  visualCheckpointName?: string;

  @IsOptional()
  @IsString()
  manualLyricsText?: string;
}
