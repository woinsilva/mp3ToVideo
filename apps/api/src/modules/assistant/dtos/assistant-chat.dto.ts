import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

export class AssistantChatMessageDto {
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @IsString()
  @MaxLength(8_000)
  content!: string;
}

export class AssistantChatContextDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  routeName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  pageTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  projectId?: string;
}

export class AssistantChatDto {
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => AssistantChatMessageDto)
  messages!: AssistantChatMessageDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => AssistantChatContextDto)
  context?: AssistantChatContextDto;
}
