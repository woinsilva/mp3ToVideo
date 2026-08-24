import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UploadCharacterAssetDto {
  @IsIn([
    'primary_reference',
    'front_view',
    'side_view',
    'back_view',
    'portrait',
    'expression',
    'pose',
    'mouth_shape',
    'eye_state',
    'source_reference'
  ])
  role!: 'primary_reference' | 'front_view' | 'side_view' | 'back_view' | 'portrait' | 'expression' | 'pose' | 'mouth_shape' | 'eye_state' | 'source_reference';

  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;
}
