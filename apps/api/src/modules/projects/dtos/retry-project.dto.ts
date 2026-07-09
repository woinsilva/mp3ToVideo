import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class RetryProjectDto {
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
