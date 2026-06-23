import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';

@Injectable()
export class LocalStorageService {
  constructor(
    @Inject(ConfigService)
    private readonly configService: ConfigService
  ) {}

  getAbsolutePath(relativePath: string): string {
    const root = this.configService.get<string>('storage.root');
    const normalizedPath = relativePath.replace(/\\/g, '/');

    if (root && normalizedPath.startsWith(root.replace(/\\/g, '/'))) {
      return normalizedPath.replace(/\//g, '\\');
    }

    if (root && normalizedPath.startsWith(`${basename(root)}/`)) {
      return join(dirname(root), normalizedPath);
    }

    return join(root ?? '', normalizedPath);
  }

  async saveProjectTrack(
    organizationId: string,
    projectId: string,
    originalFileName: string,
    buffer: Buffer
  ): Promise<string> {
    const root = this.configService.get<string>('storage.root', './storage');
    const extension = extname(originalFileName).toLowerCase() || '.mp3';
    const relativePath = join(root, 'uploads', organizationId, projectId, `original${extension}`);
    const absolutePath = this.getAbsolutePath(relativePath);

    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, buffer);

    return relativePath.replace(/\\/g, '/');
  }

  buildProjectUploadDirectory(organizationId: string, projectId: string): string {
    const root = this.configService.get<string>('storage.root', './storage');
    return join(root, 'uploads', organizationId, projectId).replace(/\\/g, '/');
  }

  buildProjectGeneratedScenesDirectory(organizationId: string, projectId: string): string {
    const root = this.configService.get<string>('storage.root', './storage');
    return join(root, 'generated-scenes', organizationId, projectId).replace(/\\/g, '/');
  }

  buildProjectGeneratedImagesDirectory(organizationId: string, projectId: string): string {
    const root = this.configService.get<string>('storage.root', './storage');
    return join(root, 'generated-images', organizationId, projectId).replace(/\\/g, '/');
  }

  buildProjectRendersDirectory(organizationId: string, projectId: string): string {
    const root = this.configService.get<string>('storage.root', './storage');
    return join(root, 'renders', organizationId, projectId).replace(/\\/g, '/');
  }

  buildProjectTempDirectory(projectId: string): string {
    const root = this.configService.get<string>('storage.root', './storage');
    return join(root, 'temp', projectId).replace(/\\/g, '/');
  }

  async removePath(relativePath: string): Promise<void> {
    await rm(this.getAbsolutePath(relativePath), {
      recursive: true,
      force: true
    });
  }
}
