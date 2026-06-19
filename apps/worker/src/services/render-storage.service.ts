import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RenderStorageService {
  constructor(
    @Inject(ConfigService)
    private readonly configService: ConfigService
  ) {}

  getAbsolutePath(relativePath: string): string {
    return resolve(relativePath);
  }

  buildSceneClipPath(organizationId: string, projectId: string, sceneIndex: number): string {
    const root = this.configService.get<string>('storage.root', './storage');

    return join(
      root,
      'generated-scenes',
      organizationId,
      projectId,
      `scene-${String(sceneIndex + 1).padStart(3, '0')}.mp4`
    ).replace(/\\/g, '/');
  }

  buildConcatListPath(projectId: string): string {
    const root = this.configService.get<string>('storage.root', './storage');

    return join(root, 'temp', projectId, 'concat-list.txt').replace(/\\/g, '/');
  }

  buildIntermediateVideoPath(projectId: string): string {
    const root = this.configService.get<string>('storage.root', './storage');

    return join(root, 'temp', projectId, 'video-track.mp4').replace(/\\/g, '/');
  }

  buildFinalRenderPath(organizationId: string, projectId: string): string {
    const root = this.configService.get<string>('storage.root', './storage');

    return join(root, 'renders', organizationId, projectId, 'final.mp4').replace(/\\/g, '/');
  }

  async ensureParentDirectory(relativePath: string): Promise<string> {
    const absolutePath = this.getAbsolutePath(relativePath);

    await mkdir(dirname(absolutePath), { recursive: true });

    return absolutePath;
  }

  async writeConcatList(relativePath: string, clipPaths: string[]): Promise<string> {
    const absolutePath = await this.ensureParentDirectory(relativePath);
    const content = clipPaths
      .map((clipPath) => `file '${this.getAbsolutePath(clipPath).replace(/'/g, "'\\''")}'`)
      .join('\n');

    await writeFile(absolutePath, content, 'utf8');

    return absolutePath;
  }
}
