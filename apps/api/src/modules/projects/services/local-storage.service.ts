import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

@Injectable()
export class LocalStorageService {
  constructor(
    @Inject(ConfigService)
    private readonly configService: ConfigService
  ) {}

  getAbsolutePath(relativePath: string): string {
    return resolve(relativePath);
  }

  async saveProjectTrack(
    organizationId: string,
    projectId: string,
    buffer: Buffer
  ): Promise<string> {
    const root = this.configService.get<string>('storage.root', './storage');
    const relativePath = join(root, 'uploads', organizationId, projectId, 'original.mp3');
    const absolutePath = this.getAbsolutePath(relativePath);

    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, buffer);

    return relativePath.replace(/\\/g, '/');
  }
}
