import { Controller, Get, Inject, Param, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';

import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../../auth/types/authenticated-user.type';
import { ChildrenClipAnimationService } from '../services/children-clip-animation.service';

@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/children-clip/animation')
export class ChildrenClipAnimationController {
  constructor(@Inject(ChildrenClipAnimationService) private readonly animation: ChildrenClipAnimationService) {}

  @Get()
  get(@CurrentUser() user: AuthenticatedUser, @Param('projectId') projectId: string) {
    return this.animation.get(projectId, user.organizationId);
  }

  @Post('render-missing')
  renderMissing(@CurrentUser() user: AuthenticatedUser, @Param('projectId') projectId: string) {
    return this.animation.renderMissing(projectId, user.organizationId, user.userId);
  }

  @Post('shots/:shotId/render')
  renderShot(@CurrentUser() user: AuthenticatedUser, @Param('projectId') projectId: string, @Param('shotId') shotId: string) {
    return this.animation.renderShot(projectId, shotId, user.organizationId, user.userId);
  }

  @Post('attempts/:attemptId/retry')
  retry(@CurrentUser() user: AuthenticatedUser, @Param('projectId') projectId: string, @Param('attemptId') attemptId: string) {
    return this.animation.retry(projectId, attemptId, user.organizationId, user.userId);
  }

  @Get('attempts/:attemptId/file')
  async file(@CurrentUser() user: AuthenticatedUser, @Param('projectId') projectId: string, @Param('attemptId') attemptId: string, @Res() response: Response) {
    const file = await this.animation.getDownload(projectId, attemptId, user.organizationId);
    response.setHeader('Content-Type', file.mimeType);
    response.setHeader('Content-Disposition', `inline; filename="${file.fileName}"`);
    return response.sendFile(file.absolutePath);
  }
}
