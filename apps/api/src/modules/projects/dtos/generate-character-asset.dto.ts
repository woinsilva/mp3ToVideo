import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class GenerateCharacterAssetDto {
  @IsIn(['front_view', 'side_view', 'back_view', 'portrait', 'expression', 'pose', 'mouth_shape', 'eye_state'])
  role!: 'front_view' | 'side_view' | 'back_view' | 'portrait' | 'expression' | 'pose' | 'mouth_shape' | 'eye_state';

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  label!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  prompt?: string;
}
