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
import { RetryProjectDto } from '../dtos/retry-project.dto';
import { UploadTrackDto } from '../dtos/upload-track.dto';
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
      clipDurationSeconds: input.clipDurationSeconds,
      sceneDurationSeconds: input.sceneDurationSeconds,
      visualCheckpointName: input.visualCheckpointName,
      manualLyricsText: input.manualLyricsText
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

  @Post(':id/scenes/:sceneId/retry-render')
  retrySceneRender(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') projectId: string,
    @Param('sceneId') sceneId: string
  ) {
    return this.projectsService.retrySceneRender(projectId, sceneId, user.organizationId);
  }

  @Post(':id/scenes/:sceneId/reference-image')
  @UseInterceptors(FileInterceptor('file'))
  uploadSceneReferenceImage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') projectId: string,
    @Param('sceneId') sceneId: string,
    @UploadedFile() file: Express.Multer.File | undefined
  ) {
    if (!file) {
      throw new BadRequestException('Reference image file is required');
    }

    const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
    const allowedExtension = /\.(jpe?g|png|webp)$/i.test(file.originalname);

    if (!allowedMimeTypes.has(file.mimetype) || !allowedExtension) {
      throw new BadRequestException('Only JPEG, PNG and WebP reference images are supported');
    }

    return this.projectsService.uploadSceneReferenceImage(
      projectId,
      sceneId,
      user.organizationId,
      file
    );
  }

  @Get(':id/scenes/:sceneId/reference-image')
  async getSceneReferenceImage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') projectId: string,
    @Param('sceneId') sceneId: string,
    @Res() response: Response
  ) {
    const image = await this.projectsService.getSceneReferenceImage(
      projectId,
      sceneId,
      user.organizationId
    );

    response.setHeader('Content-Type', image.mimeType);
    response.setHeader('Content-Disposition', `inline; filename="${image.fileName}"`);

    return response.sendFile(image.absolutePath);
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
    @Body() input: UploadTrackDto,
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
      clipDurationSeconds: input.clipDurationSeconds,
      sceneDurationSeconds: input.sceneDurationSeconds,
      visualCheckpointName: input.visualCheckpointName,
      manualLyricsText: input.manualLyricsText,
      file
    });
  }

  @Post(':id/retry')
  retryProject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') projectId: string,
    @Body() input: RetryProjectDto
  ) {
    return this.projectsService.retryProject(projectId, user.organizationId, input);
  }
}
