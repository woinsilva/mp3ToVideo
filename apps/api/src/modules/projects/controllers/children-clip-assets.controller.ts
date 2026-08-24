import { BadRequestException, Body, Controller, Get, Inject, Param, Post, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';

import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../../auth/types/authenticated-user.type';
import { GenerateChildrenClipShotAssetDto } from '../dtos/generate-children-clip-shot-asset.dto';
import { UploadChildrenClipShotAssetDto } from '../dtos/upload-children-clip-shot-asset.dto';
import { ChildrenClipAssetsService } from '../services/children-clip-assets.service';
import { ImageUploadPolicyService } from '../services/image-upload-policy.service';

@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/children-clip/production-assets')
export class ChildrenClipAssetsController {
  constructor(
    @Inject(ChildrenClipAssetsService) private readonly assets: ChildrenClipAssetsService,
    @Inject(ImageUploadPolicyService) private readonly imagePolicy: ImageUploadPolicyService,
    @Inject(ConfigService) private readonly config: ConfigService
  ) {}

  @Get()
  get(@CurrentUser() user: AuthenticatedUser, @Param('projectId') projectId: string) {
    return this.assets.get(projectId, user.organizationId);
  }

  @Post('generate-missing-backgrounds')
  generateMissing(@CurrentUser() user: AuthenticatedUser, @Param('projectId') projectId: string) {
    return this.assets.generateMissingBackgrounds(projectId, user.organizationId, user.userId);
  }

  @Post('shots/:shotId/generate')
  generate(@CurrentUser() user: AuthenticatedUser, @Param('projectId') projectId: string, @Param('shotId') shotId: string, @Body() input: GenerateChildrenClipShotAssetDto) {
    return this.assets.generate(projectId, shotId, user.organizationId, user.userId, input);
  }

  @Post('shots/:shotId/upload')
  @UseInterceptors(FileInterceptor('file'))
  upload(@CurrentUser() user: AuthenticatedUser, @Param('projectId') projectId: string, @Param('shotId') shotId: string, @Body() input: UploadChildrenClipShotAssetDto, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('A imagem do asset e obrigatoria');
    const maxBytes = this.config.get<number>('uploads.maxUploadMb', 50) * 1024 * 1024;
    if (file.size > maxBytes) throw new BadRequestException('A imagem excede o limite de upload');
    if (!this.imagePolicy.isAllowedMimeType(file.mimetype) || !this.imagePolicy.isAllowedFileName(file.originalname)) {
      throw new BadRequestException('Use uma imagem JPEG, PNG ou WebP');
    }
    return this.assets.upload(projectId, shotId, user.organizationId, input, file);
  }

  @Post(':shotAssetId/approve')
  approve(@CurrentUser() user: AuthenticatedUser, @Param('projectId') projectId: string, @Param('shotAssetId') shotAssetId: string) {
    return this.assets.approve(projectId, shotAssetId, user.organizationId);
  }

  @Post(':shotAssetId/retry')
  retry(@CurrentUser() user: AuthenticatedUser, @Param('projectId') projectId: string, @Param('shotAssetId') shotAssetId: string) {
    return this.assets.retry(projectId, shotAssetId, user.organizationId, user.userId);
  }

  @Get(':shotAssetId/file')
  async file(@CurrentUser() user: AuthenticatedUser, @Param('projectId') projectId: string, @Param('shotAssetId') shotAssetId: string, @Res() response: Response) {
    const file = await this.assets.getDownload(projectId, shotAssetId, user.organizationId);
    response.setHeader('Content-Type', file.mimeType);
    response.setHeader('Content-Disposition', `inline; filename="${file.fileName}"`);
    return response.sendFile(file.absolutePath);
  }
}
