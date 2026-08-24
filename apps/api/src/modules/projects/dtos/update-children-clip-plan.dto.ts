import { IsObject, IsOptional } from 'class-validator';

export class UpdateChildrenClipPlanDto {
  @IsOptional()
  @IsObject()
  visualBible?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  narrative?: Record<string, unknown>;
}
