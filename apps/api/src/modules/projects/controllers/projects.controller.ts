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
import { RegenerateVisualStoryboardDto } from '../dtos/regenerate-visual-storyboard.dto';
import { UploadTrackDto } from '../dtos/upload-track.dto';
import { ProjectsService } from '../services/projects.service';
import { ImageUploadPolicyService } from '../services/image-upload-policy.service';
import { TrackUploadPolicyService } from '../services/track-upload-policy.service';

@UseGuards(JwtAuthGuard)
@Controller('projects')
export class ProjectsController {
  constructor(
    @Inject(ProjectsService)
    private readonly projectsService: ProjectsService,
    @Inject(TrackUploadPolicyService)
    private readonly trackUploadPolicyService: TrackUploadPolicyService,
    @Inject(ImageUploadPolicyService)
    private readonly imageUploadPolicyService: ImageUploadPolicyService,
    @Inject(ConfigService)
    private readonly configService: ConfigService
  ) {}

  @Post()
  createProject(@CurrentUser() user: AuthenticatedUser, @Body() input: CreateProjectDto) {
    return this.projectsService.createProject({
      organizationId: user.organizationId,
      createdByUserId: user.userId,
      title: input.title,
      generationMode: input.generationMode,
      generationPrompt: input.generationPrompt,
      stabilityTest: input.stabilityTest,
      wanOnly: input.wanOnly,
      generationSeed: input.generationSeed,
      generationCfg: input.generationCfg,
      generationSteps: input.generationSteps,
      generationFps: input.generationFps,
      frameInterpolationMode: input.frameInterpolationMode,
      clipDurationSeconds: input.clipDurationSeconds,
      sceneDurationSeconds: input.sceneDurationSeconds,
      visualCheckpointName: input.visualCheckpointName,
      manualLyricsText: input.manualLyricsText,
      childrenClipConcept: input.childrenClipConcept,
      childrenClipVisualStyle: input.childrenClipVisualStyle,
      audienceAgeMin: input.audienceAgeMin,
      audienceAgeMax: input.audienceAgeMax,
      childrenClipAspectRatio: input.childrenClipAspectRatio
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

  @Get(':id/visual-storyboard')
  getVisualStoryboard(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.projectsService.getVisualStoryboard(id, user.organizationId);
  }

  @Get(':id/visual-storyboard/image')
  async getVisualStoryboardImage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') projectId: string,
    @Res() response: Response
  ) {
    const image = await this.projectsService.getVisualStoryboardImage(
      projectId,
      user.organizationId
    );

    response.setHeader('Content-Type', image.mimeType);
    response.setHeader('Content-Disposition', `inline; filename="${image.fileName}"`);

    return response.sendFile(image.absolutePath);
  }

  @Post(':id/visual-storyboard/regenerate')
  regenerateVisualStoryboard(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') projectId: string,
    @Body() input: RegenerateVisualStoryboardDto
  ) {
    return this.projectsService.regenerateVisualStoryboard(
      projectId,
      user.organizationId,
      input.instruction
    );
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

    this.assertValidImageUpload(file);

    return this.projectsService.uploadSceneReferenceImage(
      projectId,
      sceneId,
      user.organizationId,
      file
    );
  }

  @Post(':id/source-image')
  @UseInterceptors(FileInterceptor('file'))
  uploadProjectSourceImage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') projectId: string,
    @UploadedFile() file: Express.Multer.File | undefined
  ) {
    if (!file) {
      throw new BadRequestException('Source image file is required');
    }

    this.assertValidImageUpload(file);

    return this.projectsService.uploadProjectSourceImage(
      projectId,
      user.organizationId,
      file
    );
  }

  @Get(':id/source-image')
  async getProjectSourceImage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') projectId: string,
    @Res() response: Response
  ) {
    const image = await this.projectsService.getProjectSourceImage(
      projectId,
      user.organizationId
    );

    response.setHeader('Content-Type', image.mimeType);
    response.setHeader('Content-Disposition', `inline; filename="${image.fileName}"`);

    return response.sendFile(image.absolutePath);
  }

  private assertValidImageUpload(file: Express.Multer.File): void {
    const maxUploadBytes =
      this.configService.get<number>('uploads.maxUploadMb', 50) * 1024 * 1024;

    if (file.size > maxUploadBytes) {
      throw new BadRequestException('Uploaded image exceeds the configured size limit');
    }

    if (
      !this.imageUploadPolicyService.isAllowedMimeType(file.mimetype) ||
      !this.imageUploadPolicyService.isAllowedFileName(file.originalname)
    ) {
      throw new BadRequestException('Only JPEG, PNG and WebP reference images are supported');
    }
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

  @Post(':id/interpolation')
  requestFrameInterpolation(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.projectsService.requestFrameInterpolation(id, user.organizationId);
  }

  @Get(':id/interpolation')
  getFrameInterpolation(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.projectsService.getFrameInterpolation(id, user.organizationId);
  }

  @Get(':id/interpolation/download')
  async downloadFrameInterpolation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Res() response: Response
  ) {
    const download = await this.projectsService.getFrameInterpolationDownload(id, user.organizationId);
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
      throw new BadRequestException('Only MP3 and WAV audio files are supported');
    }

    if (!this.trackUploadPolicyService.isAllowedFileName(file.originalname)) {
      throw new BadRequestException('Only .mp3 and .wav files are supported');
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

  @Post(':id/start-render')
  startProjectRender(@CurrentUser() user: AuthenticatedUser, @Param('id') projectId: string) {
    return this.projectsService.startProjectRender(projectId, user.organizationId);
  }
}
