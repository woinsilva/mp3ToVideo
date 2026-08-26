import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class GenerateChildrenClipVideoDto {
  @IsIn(['local', 'snapgen'])
  provider!: 'local' | 'snapgen';

  @IsOptional() @IsIn(['veo-3.1-fast'])
  model?: 'veo-3.1-fast';

  @IsOptional() @IsIn(['720p', '1080p'])
  resolution?: '720p' | '1080p';

  @IsOptional() @IsIn(['frame', 'ingredient'])
  referenceMode?: 'frame' | 'ingredient';

  @IsOptional() @IsString() @MaxLength(6000)
  prompt?: string;

  @IsOptional() @IsString()
  firstImageAssetId?: string;

  @IsOptional() @IsString()
  lastImageAssetId?: string;

  @IsOptional() @IsArray() @ArrayMaxSize(3) @IsString({ each: true })
  ingredientAssetIds?: string[];
}
