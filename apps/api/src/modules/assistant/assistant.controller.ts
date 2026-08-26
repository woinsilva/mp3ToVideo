import { Body, Controller, Inject, Post, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { AssistantService } from './assistant.service';
import { AssistantChatDto } from './dtos/assistant-chat.dto';

@UseGuards(JwtAuthGuard)
@Controller('assistant')
export class AssistantController {
  constructor(@Inject(AssistantService) private readonly assistant: AssistantService) {}

  @Post('chat')
  chat(@CurrentUser() user: AuthenticatedUser, @Body() input: AssistantChatDto) {
    return this.assistant.chat(input, user);
  }
}
