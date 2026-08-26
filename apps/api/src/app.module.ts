import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { configuration } from './config/configuration';
import { envValidationSchema } from './config/env.validation';
import { PrismaModule } from './database/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { HealthController } from './modules/health/health.controller';
import { JobsModule } from './modules/jobs/jobs.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { AssistantModule } from './modules/assistant/assistant.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      expandVariables: true,
      load: [configuration],
      validationSchema: envValidationSchema
    }),
    PrismaModule,
    AuthModule,
    JobsModule,
    ProjectsModule,
    AssistantModule
  ],
  controllers: [HealthController]
})
export class AppModule {}
