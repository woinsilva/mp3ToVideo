import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class GenerateChildrenClipShotAssetDto {
  @IsIn(['background', 'foreground', 'prop', 'storyboard_frame'])
  role!: 'background' | 'foreground' | 'prop' | 'storyboard_frame';

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(4000)
  prompt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;
}
