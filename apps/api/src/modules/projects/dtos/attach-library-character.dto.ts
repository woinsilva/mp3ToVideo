import { IsOptional, IsString, MaxLength } from 'class-validator';

export class AttachLibraryCharacterDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  roleName?: string;
}
