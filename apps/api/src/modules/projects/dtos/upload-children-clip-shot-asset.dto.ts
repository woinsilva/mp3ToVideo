import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UploadChildrenClipShotAssetDto {
  @IsIn(['background', 'foreground', 'prop', 'character_pose', 'storyboard_frame'])
  role!: 'background' | 'foreground' | 'prop' | 'character_pose' | 'storyboard_frame';

  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;

  @IsOptional()
  @IsString()
  characterVersionId?: string;
}
