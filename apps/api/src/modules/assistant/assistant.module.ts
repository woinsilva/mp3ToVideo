import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ProjectsModule } from '../projects/projects.module';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';

@Module({
  imports: [AuthModule, ProjectsModule],
  controllers: [AssistantController],
  providers: [AssistantService]
})
export class AssistantModule {}
