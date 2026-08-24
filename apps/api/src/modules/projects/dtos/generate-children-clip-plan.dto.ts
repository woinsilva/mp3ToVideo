import { IsOptional, IsString, MaxLength } from 'class-validator';

export class GenerateChildrenClipPlanDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  revisionInstruction?: string;
}
