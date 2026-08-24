import { IsIn, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class UpdateChildrenClipShotDto {
  @IsOptional() @IsString() @MaxLength(120) title?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsNumber() @Min(0) startSeconds?: number;
  @IsOptional() @IsNumber() @Min(0.1) endSeconds?: number;
  @IsOptional() @IsIn(['animation_2d', 'wan', 'hybrid']) renderMode?: 'animation_2d' | 'wan' | 'hybrid';
  @IsOptional() @IsString() @MaxLength(120) framing?: string;
  @IsOptional() @IsString() @MaxLength(120) cameraMovement?: string;
  @IsOptional() @IsString() @MaxLength(1000) characterAction?: string;
  @IsOptional() @IsString() @MaxLength(500) environment?: string;
  @IsOptional() @IsString() @MaxLength(2000) backgroundPrompt?: string;
  @IsOptional() @IsString() @MaxLength(120) transitionIn?: string;
  @IsOptional() @IsString() @MaxLength(120) transitionOut?: string;
  @IsOptional() @IsString() @MaxLength(120) motionPreset?: string;
  @IsOptional() @IsString() @MaxLength(1000) revisionInstruction?: string;
}
