import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';

export class CreateProjectDto {
  @IsString()
  @MinLength(2)
  title!: string;

  @IsOptional()
  @IsIn(['music', 'prompt', 'image'])
  generationMode?: 'music' | 'prompt' | 'image';

  @ValidateIf((input: CreateProjectDto) =>
    input.generationMode === 'prompt' || input.generationMode === 'image'
  )
  @IsString()
  @MinLength(10)
  @MaxLength(4000)
  generationPrompt?: string;

  @IsOptional()
  @IsBoolean()
  stabilityTest?: boolean;

  @IsOptional()
  @IsBoolean()
  wanOnly?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(2147483646)
  generationSeed?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(20)
  generationCfg?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  generationSteps?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([16, 24])
  generationFps?: number;

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
