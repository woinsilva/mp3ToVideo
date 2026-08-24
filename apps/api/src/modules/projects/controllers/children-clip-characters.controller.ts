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
import { CreateCharacterDto } from '../dtos/create-character.dto';
import { AttachLibraryCharacterDto } from '../dtos/attach-library-character.dto';
import { GenerateCharacterAssetDto } from '../dtos/generate-character-asset.dto';
import { CreateCharacterVersionDto } from '../dtos/create-character-version.dto';
import { UploadCharacterAssetDto } from '../dtos/upload-character-asset.dto';
import { ChildrenClipCharactersService } from '../services/children-clip-characters.service';
import { ImageUploadPolicyService } from '../services/image-upload-policy.service';

@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/children-clip/characters')
export class ChildrenClipCharactersController {
  constructor(
    @Inject(ChildrenClipCharactersService) private readonly characters: ChildrenClipCharactersService,
    @Inject(ImageUploadPolicyService) private readonly imagePolicy: ImageUploadPolicyService,
    @Inject(ConfigService) private readonly config: ConfigService
  ) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Param('projectId') projectId: string) {
    return this.characters.list(projectId, user.organizationId);
  }

  @Get('library')
  listLibrary(@CurrentUser() user: AuthenticatedUser, @Param('projectId') projectId: string) {
    return this.characters.listLibrary(projectId, user.organizationId);
  }

  @Post('library/:libraryCharacterId/attach')
  attachLibrary(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('libraryCharacterId') characterId: string,
    @Body() input: AttachLibraryCharacterDto
  ) {
    return this.characters.attachLibrary(projectId, characterId, user.organizationId, input);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Body() input: CreateCharacterDto
  ) {
    return this.characters.create(projectId, user.organizationId, user.userId, input);
  }

  @Post(':characterId/versions')
  createVersion(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('characterId') characterId: string,
    @Body() input: CreateCharacterVersionDto
  ) {
    return this.characters.createVersion(
      projectId,
      characterId,
      user.organizationId,
      user.userId,
      input
    );
  }

  @Post(':characterId/versions/:versionId/generate')
  retryGeneration(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('characterId') characterId: string,
    @Param('versionId') versionId: string
  ) {
    return this.characters.retryGeneration(
      projectId,
      characterId,
      versionId,
      user.organizationId,
      user.userId
    );
  }

  @Post(':characterId/versions/:versionId/assets')
  @UseInterceptors(FileInterceptor('file'))
  uploadAsset(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('characterId') characterId: string,
    @Param('versionId') versionId: string,
    @Body() input: UploadCharacterAssetDto,
    @UploadedFile() file: Express.Multer.File | undefined
  ) {
    if (!file) throw new BadRequestException('Character image is required');
    const maxBytes = this.config.get<number>('uploads.maxUploadMb', 50) * 1024 * 1024;
    if (file.size > maxBytes) throw new BadRequestException('Character image exceeds the upload limit');
    if (!this.imagePolicy.isAllowedMimeType(file.mimetype) || !this.imagePolicy.isAllowedFileName(file.originalname)) {
      throw new BadRequestException('Only JPEG, PNG and WebP character images are supported');
    }
    return this.characters.uploadAsset(
      projectId,
      characterId,
      versionId,
      user.organizationId,
      input,
      file
    );
  }

  @Post(':characterId/versions/:versionId/assets/generate')
  generateAsset(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('characterId') characterId: string,
    @Param('versionId') versionId: string,
    @Body() input: GenerateCharacterAssetDto
  ) {
    return this.characters.generateAsset(projectId, characterId, versionId, user.organizationId, user.userId, input);
  }

  @Post(':characterId/versions/:versionId/assets/:characterAssetId/retry')
  retryAsset(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('characterId') characterId: string,
    @Param('versionId') versionId: string,
    @Param('characterAssetId') characterAssetId: string
  ) {
    return this.characters.retryAssetGeneration(projectId, characterId, versionId, characterAssetId, user.organizationId, user.userId);
  }

  @Post(':characterId/versions/:versionId/assets/:characterAssetId/approve')
  approveAsset(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('characterId') characterId: string,
    @Param('versionId') versionId: string,
    @Param('characterAssetId') characterAssetId: string
  ) {
    return this.characters.approveAsset(projectId, characterId, versionId, characterAssetId, user.organizationId);
  }

  @Post(':characterId/versions/:versionId/approve')
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('characterId') characterId: string,
    @Param('versionId') versionId: string
  ) {
    return this.characters.approve(projectId, characterId, versionId, user.organizationId);
  }

  @Get(':characterId/versions/:versionId/assets/:assetId')
  async downloadAsset(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Param('characterId') characterId: string,
    @Param('versionId') versionId: string,
    @Param('assetId') assetId: string,
    @Res() response: Response
  ) {
    const asset = await this.characters.getAssetDownload(
      projectId,
      characterId,
      versionId,
      assetId,
      user.organizationId
    );
    response.setHeader('Content-Type', asset.mimeType);
    response.setHeader('Content-Disposition', `inline; filename="${asset.fileName}"`);
    return response.sendFile(asset.absolutePath);
  }
}
