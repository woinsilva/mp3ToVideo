import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { bundle } from '@remotion/bundler';
import { ensureBrowser, renderMedia, selectComposition } from '@remotion/renderer';
import type { ChildrenClipShotProps } from '@video/children-clip-renderer';

@Injectable()
export class ChildrenClip2dRendererService {
  private readonly logger = new Logger(ChildrenClip2dRendererService.name);
  private bundlePromise: Promise<string> | null = null;

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  async render(
    props: ChildrenClipShotProps,
    outputLocation: string,
    onProgress: (progress: number, stage: string, message: string) => Promise<void>
  ) {
    await onProgress(8, 'PREPARING_BROWSER', 'Preparando o Chromium do renderizador 2D.');
    await ensureBrowser();
    await onProgress(14, 'BUNDLING_TEMPLATE', 'Carregando o template de animacao 2D.');
    const serveUrl = await this.getBundle();
    const inputProps = props as unknown as Record<string, unknown>;
    const composition = await selectComposition({
      serveUrl,
      id: 'ChildrenClipShot',
      inputProps,
    });
    await onProgress(20, 'RENDERING_FRAMES', `Renderizando ${props.durationInFrames} frames a ${props.fps} FPS.`);
    let progressChain = Promise.resolve();
    let lastReported = 20;
    await renderMedia({
      composition,
      serveUrl,
      codec: 'h264',
      outputLocation,
      inputProps,
      overwrite: true,
      concurrency: this.config.get<number>('childrenClip.renderConcurrency', 2),
      chromiumOptions: { disableWebSecurity: false },
      onProgress: ({ progress, stitchStage }) => {
        const percent = Math.min(94, 20 + Math.floor(progress * 74));
        if (percent < lastReported + 2 && percent < 94) return;
        lastReported = percent;
        const stage = stitchStage === 'encoding' || stitchStage === 'muxing' ? 'ENCODING_SHOT' : 'RENDERING_FRAMES';
        progressChain = progressChain.then(() => onProgress(percent, stage, `${stage === 'RENDERING_FRAMES' ? 'Renderizando frames' : 'Codificando tomada'} (${percent}%).`));
      }
    });
    await progressChain;
    this.logger.log(`Rendered children clip shot to ${outputLocation}`);
  }

  private getBundle() {
    if (!this.bundlePromise) {
      const entryPoint = require.resolve('@video/children-clip-renderer/entry');
      this.bundlePromise = bundle({ entryPoint, enableCaching: true }).catch((error) => {
        this.bundlePromise = null;
        throw error;
      });
    }
    return this.bundlePromise;
  }
}
