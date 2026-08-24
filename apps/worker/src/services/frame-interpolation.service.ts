import { spawn } from 'node:child_process';
import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AssetType, type Prisma } from '@prisma/client';

import { PrismaService } from '../database/prisma.service';
import { RenderStorageService } from './render-storage.service';
import { VideoMetadataProbeService, type ProbedVideoMetadata } from './video-metadata-probe.service';

@Injectable()
export class FrameInterpolationService {
  private readonly logger = new Logger(FrameInterpolationService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(RenderStorageService) private readonly storage: RenderStorageService,
    @Inject(VideoMetadataProbeService) private readonly probeService: VideoMetadataProbeService
  ) {}

  async interpolate(input: {
    jobId: string;
    projectId: string;
    organizationId: string;
    sourceAssetId: string;
    onProgress?: (stage: string, progress: number, message: string) => Promise<void>;
  }) {
    const source = await this.prisma.asset.findFirst({
      where: {
        id: input.sourceAssetId,
        projectId: input.projectId,
        organizationId: input.organizationId,
        type: AssetType.render
      }
    });
    if (!source) throw new Error('Original render asset not found');

    const sourcePath = this.storage.getAbsolutePath(source.storagePath);
    const original = await this.probeService.probe(sourcePath);
    this.assertUsableOriginal(original);

    const tempRelative = this.storage.buildInterpolationTempDirectory(input.jobId);
    const tempRoot = this.storage.getAbsolutePath(tempRelative);
    const inputFrames = join(tempRoot, 'input');
    const outputFrames = join(tempRoot, 'output');
    const outputRelative = this.storage.buildInterpolatedRenderPath(
      input.organizationId,
      input.projectId,
      input.jobId
    );
    const outputPath = await this.storage.ensureParentDirectory(outputRelative);
    const startedAt = Date.now();

    await rm(tempRoot, { recursive: true, force: true });
    await mkdir(inputFrames, { recursive: true });
    await mkdir(outputFrames, { recursive: true });

    try {
      await input.onProgress?.('EXTRACTING_FRAMES', 15, 'Extraindo os frames originais sem alterar o video fonte.');
      await this.run(input.jobId, 'EXTRACTING_FRAMES', this.config.get<string>('rendering.ffmpegPath', 'ffmpeg'), [
        '-y', '-i', sourcePath, '-map', '0:v:0', '-vsync', '0', '-start_number', '0',
        join(inputFrames, '%08d.png')
      ]);

      const expectedFrames = original.frameCount! * 2 - 1;
      await input.onProgress?.(
        'LOADING_RIFE',
        30,
        `Carregando RIFE v4.6 na GPU Vulkan ${this.config.get<number>('interpolation.gpuId', 0)}.`
      );
      await this.run(
        input.jobId,
        'INTERPOLATING',
        this.config.get<string>('interpolation.rifeExecutablePath', ''),
        this.buildRifeArguments(inputFrames, outputFrames, original.frameCount!),
        async () => {
          const generatedFrames = await this.countPngFiles(outputFrames);
          if (generatedFrames === 0) return;
          const progress = Math.min(74, 35 + Math.floor((generatedFrames / expectedFrames) * 39));
          await input.onProgress?.(
            'INTERPOLATING',
            progress,
            `RIFE interpolando ${generatedFrames}/${expectedFrames} frames na GPU Vulkan.`
          );
        }
      );
      await input.onProgress?.(
        'INTERPOLATING',
        74,
        `RIFE interpolou ${expectedFrames}/${expectedFrames} frames na GPU Vulkan.`
      );

      await input.onProgress?.('ENCODING', 75, 'Codificando o MP4 interpolado e preservando o audio original.');
      const targetFps = original.fps! * 2;
      await this.run(
        input.jobId,
        'ENCODING',
        this.config.get<string>('rendering.ffmpegPath', 'ffmpeg'),
        this.buildEncodeArguments(outputFrames, sourcePath, outputPath, targetFps)
      );

      await input.onProgress?.('VALIDATING', 90, 'Validando FPS, frames, duracao, resolucao e audio com FFprobe.');
      const result = await this.probeService.probe(outputPath);
      this.assertValidResult(original, result);
      const file = await stat(outputPath);
      const metadata = {
        provider: 'rife-ncnn-vulkan',
        mode: 'rife_2x',
        multiplier: 2,
        sourceAssetId: source.id,
        device: `Vulkan GPU ${this.config.get<number>('interpolation.gpuId', 0)}`,
        modelPath: this.config.get<string>('interpolation.rifeModelPath', ''),
        processingMs: Date.now() - startedAt,
        original,
        result,
        validation: { status: 'passed' }
      } as unknown as Prisma.InputJsonValue;

      return this.prisma.asset.create({
        data: {
          organizationId: input.organizationId,
          projectId: input.projectId,
          type: AssetType.interpolated_render,
          mimeType: 'video/mp4',
          storagePath: outputRelative,
          sizeBytes: file.size,
          width: result.width,
          height: result.height,
          metadata
        }
      });
    } catch (error) {
      await rm(outputPath, { force: true });
      throw error;
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }

  private async run(
    jobId: string,
    stage: string,
    executable: string,
    args: string[],
    onTick?: () => Promise<void>
  ): Promise<void> {
    if (!executable) throw new Error('RIFE executable is not configured');
    await new Promise<void>((resolve, reject) => {
      const child = spawn(executable, args, { windowsHide: true });
      let stderr = '';
      let stdout = '';
      let tickRunning = false;
      let lastTickError: Error | null = null;
      this.logger.log(`[${jobId}] ${stage} process started pid=${child.pid ?? 'unknown'} executable=${executable}`);

      child.stdout.on('data', (chunk: Buffer) => {
        stdout = this.appendOutput(stdout, chunk.toString());
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr = this.appendOutput(stderr, chunk.toString());
      });
      child.on('error', reject);

      const timer = onTick
        ? setInterval(() => {
            if (tickRunning) return;
            tickRunning = true;
            void onTick()
              .catch((error: unknown) => {
                lastTickError = error instanceof Error ? error : new Error(String(error));
              })
              .finally(() => { tickRunning = false; });
          }, 1000)
        : null;

      child.on('close', (code, signal) => {
        if (timer) clearInterval(timer);
        if (lastTickError) {
          reject(lastTickError);
          return;
        }
        if (code !== 0) {
          reject(new Error(
            `${stage} process failed with code ${String(code)} signal ${signal ?? 'none'}: ${stderr || stdout || 'no process output'}`
          ));
          return;
        }
        this.logger.log(`[${jobId}] ${stage} process completed pid=${child.pid ?? 'unknown'}`);
        resolve();
      });
    });
  }

  private async countPngFiles(directory: string): Promise<number> {
    const entries = await readdir(directory, { withFileTypes: true });
    return entries.filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.png')).length;
  }

  private appendOutput(current: string, next: string): string {
    return `${current}${next}`.slice(-20_000);
  }

  buildRifeArguments(inputFrames: string, outputFrames: string, sourceFrameCount: number): string[] {
    return [
      '-i', inputFrames,
      '-o', outputFrames,
      '-m', this.config.get<string>('interpolation.rifeModelPath', ''),
      '-g', String(this.config.get<number>('interpolation.gpuId', 0)),
      '-n', String(sourceFrameCount * 2 - 1),
      '-j', '2:2:2'
    ];
  }

  buildEncodeArguments(outputFrames: string, sourcePath: string, outputPath: string, targetFps: number): string[] {
    return [
      '-y', '-framerate', String(targetFps), '-start_number', '1',
      '-i', join(outputFrames, '%08d.png'), '-i', sourcePath,
      '-map', '0:v:0', '-map', '1:a?',
      '-c:v', 'libx264', '-preset', this.config.get<string>('interpolation.preset', 'slow'),
      '-crf', String(this.config.get<number>('interpolation.crf', 17)),
      '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-movflags', '+faststart', outputPath
    ];
  }

  private assertUsableOriginal(value: ProbedVideoMetadata): void {
    if (!value.frameCount || !value.fps || !value.durationSeconds || !value.width || !value.height) {
      throw new Error('FFprobe could not read complete metadata from the original render');
    }
  }

  private assertValidResult(original: ProbedVideoMetadata, result: ProbedVideoMetadata): void {
    const expectedFrames = original.frameCount! * 2 - 1;
    const expectedFps = original.fps! * 2;
    const durationTolerance = Math.max(0.12, 2 / original.fps!);
    const problems: string[] = [];
    if (result.frameCount !== expectedFrames) problems.push(`frames ${result.frameCount}/${expectedFrames}`);
    if (result.fps === null || Math.abs(result.fps - expectedFps) > 0.01) problems.push(`fps ${result.fps}/${expectedFps}`);
    if (result.durationSeconds === null || Math.abs(result.durationSeconds - original.durationSeconds!) > durationTolerance) problems.push('duration changed');
    if (result.width !== original.width || result.height !== original.height) problems.push('resolution changed');
    if (result.hasAudio !== original.hasAudio) problems.push('audio stream changed');
    if (problems.length) throw new Error(`RIFE output validation failed: ${problems.join(', ')}`);
  }
}
