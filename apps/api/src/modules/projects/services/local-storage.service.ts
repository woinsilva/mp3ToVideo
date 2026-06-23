import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, writeFile } from 'node:fs/promises';
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
}
