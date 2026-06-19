import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { configuration } from './config/configuration';
import { envValidationSchema } from './config/env.validation';
import { PrismaModule } from './database/prisma.module';
import { ProjectProcessor } from './processors/project.processor';
import { ProjectProcessingPipelineService } from './services/project-processing-pipeline.service';
import { ProjectProcessingWorkerService } from './workers/project-processing-worker.service';
import { RedisConnectionService } from './workers/redis-connection.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      expandVariables: true,
      load: [configuration],
      validationSchema: envValidationSchema
    }),
    PrismaModule
  ],
  providers: [
    RedisConnectionService,
    ProjectProcessor,
    ProjectProcessingPipelineService,
    ProjectProcessingWorkerService
  ]
})
export class WorkerModule {}
