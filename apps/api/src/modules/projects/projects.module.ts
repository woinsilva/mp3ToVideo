import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuthModule } from '../auth/auth.module';
import { ProjectsController } from './controllers/projects.controller';
import { LocalStorageService } from './services/local-storage.service';
import { ProjectPresenter } from './services/project.presenter';
import { ProjectsService } from './services/projects.service';
import { TrackUploadPolicyService } from './services/track-upload-policy.service';

@Module({
  imports: [ConfigModule, AuthModule],
  controllers: [ProjectsController],
  providers: [
    ProjectsService,
    LocalStorageService,
    ProjectPresenter,
    TrackUploadPolicyService
  ]
})
export class ProjectsModule {}
