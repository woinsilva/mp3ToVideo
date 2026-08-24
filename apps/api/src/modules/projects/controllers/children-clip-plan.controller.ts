import { Body, Controller, Get, Inject, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';

import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../../auth/types/authenticated-user.type';
import { GenerateChildrenClipPlanDto } from '../dtos/generate-children-clip-plan.dto';
import { UpdateChildrenClipPlanDto } from '../dtos/update-children-clip-plan.dto';
import { UpdateChildrenClipShotDto } from '../dtos/update-children-clip-shot.dto';
import { ChildrenClipPlanService } from '../services/children-clip-plan.service';

@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/children-clip/production-plan')
export class ChildrenClipPlanController {
  constructor(@Inject(ChildrenClipPlanService) private readonly plans: ChildrenClipPlanService) {}

  @Get()
  get(@CurrentUser() user: AuthenticatedUser, @Param('projectId') projectId: string) {
    return this.plans.get(projectId, user.organizationId);
  }

  @Post('generate')
  generate(@CurrentUser() user: AuthenticatedUser, @Param('projectId') projectId: string, @Body() input: GenerateChildrenClipPlanDto) {
    return this.plans.enqueue(projectId, user.organizationId, user.userId, input);
  }

  @Put()
  update(@CurrentUser() user: AuthenticatedUser, @Param('projectId') projectId: string, @Body() input: UpdateChildrenClipPlanDto) {
    return this.plans.updatePlan(projectId, user.organizationId, input);
  }

  @Patch('shots/:shotId')
  updateShot(@CurrentUser() user: AuthenticatedUser, @Param('projectId') projectId: string, @Param('shotId') shotId: string, @Body() input: UpdateChildrenClipShotDto) {
    return this.plans.updateShot(projectId, shotId, user.organizationId, input);
  }

  @Post('approve')
  approve(@CurrentUser() user: AuthenticatedUser, @Param('projectId') projectId: string) {
    return this.plans.approve(projectId, user.organizationId);
  }
}
