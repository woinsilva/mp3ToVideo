import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';

import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../../auth/types/authenticated-user.type';
import { CreateProjectDto } from '../dtos/create-project.dto';
import { ProjectsService } from '../services/projects.service';
import { TrackUploadPolicyService } from '../services/track-upload-policy.service';

@UseGuards(JwtAuthGuard)
@Controller('projects')
export class ProjectsController {
  constructor(
    @Inject(ProjectsService)
    private readonly projectsService: ProjectsService,
    @Inject(TrackUploadPolicyService)
    private readonly trackUploadPolicyService: TrackUploadPolicyService,
    @Inject(ConfigService)
    private readonly configService: ConfigService
  ) {}

  @Post()
  createProject(@CurrentUser() user: AuthenticatedUser, @Body() input: CreateProjectDto) {
    return this.projectsService.createProject({
      organizationId: user.organizationId,
      createdByUserId: user.userId,
      title: input.title,
      clipDurationSeconds: input.clipDurationSeconds
    });
  }

  @Get()
  listProjects(@CurrentUser() user: AuthenticatedUser) {
    return this.projectsService.listProjects(user.organizationId);
  }

  @Get(':id')
  getProject(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.projectsService.getProjectById(id, user.organizationId);
  }

  @Get(':id/status')
  getProjectStatus(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.projectsService.getProjectStatus(id, user.organizationId);
  }

  @Get(':id/scenes')
  getProjectScenes(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.projectsService.listProjectScenes(id, user.organizationId);
  }

  @Get(':id/render')
  getProjectRender(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.projectsService.getProjectRender(id, user.organizationId);
  }

  @Get(':id/download')
  async downloadProjectRender(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Res() response: Response
  ) {
    const download = await this.projectsService.getProjectDownload(id, user.organizationId);

    response.setHeader('Content-Type', download.mimeType);
    response.setHeader('Content-Disposition', `attachment; filename="${download.fileName}"`);

    return response.sendFile(download.absolutePath);
  }

  @Post(':id/upload-track')
  @UseInterceptors(FileInterceptor('file'))
  uploadTrack(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') projectId: string,
    @UploadedFile() file: Express.Multer.File | undefined
  ) {
    if (!file) {
      throw new BadRequestException('Track file is required');
    }

    const maxUploadBytes =
      this.configService.get<number>('uploads.maxUploadMb', 50) * 1024 * 1024;

    if (file.size > maxUploadBytes) {
      throw new BadRequestException('Uploaded file exceeds the configured size limit');
    }

    if (!this.trackUploadPolicyService.isAllowedMimeType(file.mimetype)) {
      throw new BadRequestException('Only MP3 and WAV uploads are supported in the MVP');
    }

    if (!this.trackUploadPolicyService.isAllowedFileName(file.originalname)) {
      throw new BadRequestException('Only .mp3 and .wav files are supported in the MVP');
    }

    return this.projectsService.uploadTrack({
      organizationId: user.organizationId,
      projectId,
      file
    });
  }
}
