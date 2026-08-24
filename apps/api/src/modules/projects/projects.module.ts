import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuthModule } from '../auth/auth.module';
import { JobsModule } from '../jobs/jobs.module';
import { ChildrenClipCharactersController } from './controllers/children-clip-characters.controller';
import { ChildrenClipAudioController } from './controllers/children-clip-audio.controller';
import { ChildrenClipPlanController } from './controllers/children-clip-plan.controller';
import { ChildrenClipAssetsController } from './controllers/children-clip-assets.controller';
import { ChildrenClipAnimationController } from './controllers/children-clip-animation.controller';
import { ChildrenClipOutputController } from './controllers/children-clip-output.controller';
import { ProjectsController } from './controllers/projects.controller';
import { ChildrenClipCharactersService } from './services/children-clip-characters.service';
import { ChildrenClipAudioService } from './services/children-clip-audio.service';
import { ChildrenClipPlanService } from './services/children-clip-plan.service';
import { ChildrenClipAssetsService } from './services/children-clip-assets.service';
import { ChildrenClipAnimationService } from './services/children-clip-animation.service';
import { ChildrenClipOutputService } from './services/children-clip-output.service';
import { ImageUploadPolicyService } from './services/image-upload-policy.service';
import { LocalStorageService } from './services/local-storage.service';
import { ProjectPresenter } from './services/project.presenter';
import { ProjectsService } from './services/projects.service';
import { TrackUploadPolicyService } from './services/track-upload-policy.service';

@Module({
  imports: [ConfigModule, AuthModule, JobsModule],
  controllers: [ChildrenClipAudioController, ChildrenClipCharactersController, ChildrenClipPlanController, ChildrenClipAssetsController, ChildrenClipAnimationController, ChildrenClipOutputController, ProjectsController],
  providers: [
    ChildrenClipCharactersService,
    ChildrenClipAudioService,
    ChildrenClipPlanService,
    ChildrenClipAssetsService,
    ChildrenClipAnimationService,
    ChildrenClipOutputService,
    ProjectsService,
    LocalStorageService,
    ImageUploadPolicyService,
    ProjectPresenter,
    TrackUploadPolicyService
  ]
})
export class ProjectsModule {}
