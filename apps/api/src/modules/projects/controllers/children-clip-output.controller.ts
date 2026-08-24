import { Controller, Get, Inject, Param, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../../auth/types/authenticated-user.type';
import { ChildrenClipOutputService } from '../services/children-clip-output.service';

@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/children-clip/output')
export class ChildrenClipOutputController {
  constructor(@Inject(ChildrenClipOutputService) private readonly output: ChildrenClipOutputService) {}
  @Get() get(@CurrentUser() user: AuthenticatedUser, @Param('projectId') projectId: string) { return this.output.get(projectId, user.organizationId); }
  @Post('shots/:shotId/wan') hero(@CurrentUser() user: AuthenticatedUser, @Param('projectId') projectId: string, @Param('shotId') shotId: string) { return this.output.generateHero(projectId, shotId, user.organizationId, user.userId); }
  @Post('hero-attempts/:attemptId/retry') retryHero(@CurrentUser() user: AuthenticatedUser, @Param('projectId') projectId: string, @Param('attemptId') attemptId: string) { return this.output.retryHero(projectId, attemptId, user.organizationId, user.userId); }
  @Post('hero-attempts/:attemptId/approve') approveHero(@CurrentUser() user: AuthenticatedUser, @Param('projectId') projectId: string, @Param('attemptId') attemptId: string) { return this.output.approveHero(projectId, attemptId, user.organizationId); }
  @Post('hero-attempts/:attemptId/reject') rejectHero(@CurrentUser() user: AuthenticatedUser, @Param('projectId') projectId: string, @Param('attemptId') attemptId: string) { return this.output.rejectHero(projectId, attemptId, user.organizationId); }
  @Post('final') final(@CurrentUser() user: AuthenticatedUser, @Param('projectId') projectId: string) { return this.output.renderFinal(projectId, user.organizationId, user.userId); }
  @Post('final/:finalRenderId/retry') retryFinal(@CurrentUser() user: AuthenticatedUser, @Param('projectId') projectId: string, @Param('finalRenderId') finalRenderId: string) { return this.output.retryFinal(projectId, finalRenderId, user.organizationId, user.userId); }
  @Get('hero-attempts/:id/file') async heroFile(@CurrentUser() user: AuthenticatedUser, @Param('projectId') projectId: string, @Param('id') id: string, @Res() response: Response) { const file = await this.output.getFile(projectId, id, 'hero', user.organizationId); response.setHeader('Content-Type', file.mimeType); return response.sendFile(file.absolutePath); }
  @Get('final/:id/file') async finalFile(@CurrentUser() user: AuthenticatedUser, @Param('projectId') projectId: string, @Param('id') id: string, @Res() response: Response) { const file = await this.output.getFile(projectId, id, 'final', user.organizationId); response.setHeader('Content-Type', file.mimeType); response.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`); return response.sendFile(file.absolutePath); }
}
