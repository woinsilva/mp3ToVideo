import { Controller, Get, Inject, Param, Post, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../../auth/types/authenticated-user.type';
import { ChildrenClipAudioService } from '../services/children-clip-audio.service';

@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/children-clip/audio-analysis')
export class ChildrenClipAudioController {
  constructor(@Inject(ChildrenClipAudioService) private readonly audio: ChildrenClipAudioService) {}

  @Get()
  get(@CurrentUser() user: AuthenticatedUser, @Param('projectId') projectId: string) {
    return this.audio.get(projectId, user.organizationId);
  }

  @Post()
  analyze(@CurrentUser() user: AuthenticatedUser, @Param('projectId') projectId: string) {
    return this.audio.enqueue(projectId, user.organizationId, user.userId);
  }
}
