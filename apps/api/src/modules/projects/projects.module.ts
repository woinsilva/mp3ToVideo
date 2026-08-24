import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuthModule } from '../auth/auth.module';
import { JobsModule } from '../jobs/jobs.module';
import { ChildrenClipCharactersController } from './controllers/children-clip-characters.controller';
import { ChildrenClipAudioController } from './controllers/children-clip-audio.controller';
import { ChildrenClipPlanController } from './controllers/children-clip-plan.controller';
import { ProjectsController } from './controllers/projects.controller';
import { ChildrenClipCharactersService } from './services/children-clip-characters.service';
import { ChildrenClipAudioService } from './services/children-clip-audio.service';
import { ChildrenClipPlanService } from './services/children-clip-plan.service';
import { ImageUploadPolicyService } from './services/image-upload-policy.service';
import { LocalStorageService } from './services/local-storage.service';
import { ProjectPresenter } from './services/project.presenter';
import { ProjectsService } from './services/projects.service';
import { TrackUploadPolicyService } from './services/track-upload-policy.service';

@Module({
  imports: [ConfigModule, AuthModule, JobsModule],
  controllers: [ChildrenClipAudioController, ChildrenClipCharactersController, ChildrenClipPlanController, ProjectsController],
  providers: [
    ChildrenClipCharactersService,
    ChildrenClipAudioService,
    ChildrenClipPlanService,
    ProjectsService,
    LocalStorageService,
    ImageUploadPolicyService,
    ProjectPresenter,
    TrackUploadPolicyService
  ]
})
export class ProjectsModule {}
