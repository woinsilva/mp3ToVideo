import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuthModule } from '../auth/auth.module';
import { JobsModule } from '../jobs/jobs.module';
import { ProjectsController } from './controllers/projects.controller';
import { LocalStorageService } from './services/local-storage.service';
import { ImageUploadPolicyService } from './services/image-upload-policy.service';
import { ProjectPresenter } from './services/project.presenter';
import { ProjectsService } from './services/projects.service';
import { TrackUploadPolicyService } from './services/track-upload-policy.service';

@Module({
  imports: [ConfigModule, AuthModule, JobsModule],
  controllers: [ProjectsController],
  providers: [
    ProjectsService,
    LocalStorageService,
    ImageUploadPolicyService,
    ProjectPresenter,
    TrackUploadPolicyService
  ]
})
export class ProjectsModule {}
