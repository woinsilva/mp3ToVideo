import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { RenderStorageService } from './render-storage.service';

const execFileAsync = promisify(execFile);
const ANALYSIS_SAMPLE_RATE = 11_025;
const HOP_SAMPLES = 512;

interface ProbePayload {
  format?: { duration?: string; bit_rate?: string };
  streams?: Array<{ codec_type?: string; sample_rate?: string; channels?: number }>;
}

export interface AudioEnergyPoint {
  time: number;
  energy: number;
}

export interface ChildrenClipAudioAnalysisResult {
  durationSeconds: number;
  sampleRate: number;
  channels: number;
  bitrate: number | null;
  bpm: number;
  beatConfidence: number;
  timeSignature: number;
  loudnessDb: number;
  peakDb: number;
  beats: number[];
  energyCurve: AudioEnergyPoint[];
  waveform: Array<{ time: number; min: number; max: number }>;
}

@Injectable()
export class ChildrenClipAudioAnalysisService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(RenderStorageService) private readonly storage: RenderStorageService
  ) {}

  async analyze(storagePath: string): Promise<ChildrenClipAudioAnalysisResult> {
    const absolutePath = this.storage.getAbsolutePath(storagePath);
    const metadata = await this.probe(absolutePath);
    if (metadata.durationSeconds > 240.05) {
      throw new Error(`A musica possui ${metadata.durationSeconds.toFixed(1)}s e excede o limite de 240s`);
    }

    const pcm = await this.decodeMonoPcm(absolutePath);
    if (pcm.length < ANALYSIS_SAMPLE_RATE) throw new Error('O audio e curto demais para analise');
    const signal = this.toFloatSignal(pcm);
    const frameEnergy = this.calculateFrameEnergy(signal);
    const normalizedEnergy = this.normalize(frameEnergy);
    const onset = normalizedEnergy.map((value, index) => Math.max(0, value - (normalizedEnergy[index - 1] ?? value)));
    const tempo = this.estimateTempo(onset);
    const beats = this.buildBeatGrid(onset, tempo.bpm, metadata.durationSeconds);

    return {
      ...metadata,
      bpm: tempo.bpm,
      beatConfidence: tempo.confidence,
      timeSignature: 4,
      loudnessDb: this.calculateLoudness(signal),
      peakDb: this.calculatePeak(signal),
      beats,
      energyCurve: this.downsampleEnergy(normalizedEnergy, metadata.durationSeconds),
      waveform: this.buildWaveform(signal, metadata.durationSeconds)
    };
  }

  private async probe(absolutePath: string) {
    const ffprobe = this.config.get<string>('audio.ffprobePath', 'ffprobe');
    const { stdout } = await execFileAsync(ffprobe, [
      '-v', 'error', '-show_entries', 'format=duration,bit_rate:stream=codec_type,sample_rate,channels',
      '-of', 'json', absolutePath
    ], { windowsHide: true, timeout: 30_000, maxBuffer: 1024 * 1024 });
    const payload = JSON.parse(stdout) as ProbePayload;
    const stream = payload.streams?.find((item) => item.codec_type === 'audio');
    const durationSeconds = Number(payload.format?.duration);
    if (!stream || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      throw new Error('FFprobe nao encontrou uma faixa de audio valida');
    }
    return {
      durationSeconds: Number(durationSeconds.toFixed(3)),
      sampleRate: Number(stream.sample_rate) || ANALYSIS_SAMPLE_RATE,
      channels: stream.channels ?? 1,
      bitrate: Number(payload.format?.bit_rate) || null
    };
  }

  private decodeMonoPcm(absolutePath: string): Promise<Buffer> {
    const ffmpeg = this.config.get<string>('rendering.ffmpegPath', 'ffmpeg');
    return new Promise((resolve, reject) => {
      const process = spawn(ffmpeg, [
        '-v', 'error', '-i', absolutePath, '-vn', '-ac', '1', '-ar', String(ANALYSIS_SAMPLE_RATE),
        '-f', 's16le', '-acodec', 'pcm_s16le', 'pipe:1'
      ], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      const output: Buffer[] = [];
      const errors: Buffer[] = [];
      process.stdout.on('data', (chunk: Buffer) => output.push(chunk));
      process.stderr.on('data', (chunk: Buffer) => errors.push(chunk));
      process.once('error', reject);
      process.once('close', (code) => {
        if (code === 0) resolve(Buffer.concat(output));
        else reject(new Error(`FFmpeg nao conseguiu decodificar o audio: ${Buffer.concat(errors).toString('utf8').trim()}`));
      });
    });
  }

  private toFloatSignal(buffer: Buffer): Float32Array {
    const samples = new Float32Array(Math.floor(buffer.length / 2));
    for (let index = 0; index < samples.length; index += 1) {
      samples[index] = buffer.readInt16LE(index * 2) / 32_768;
    }
    return samples;
  }

  private calculateFrameEnergy(signal: Float32Array): number[] {
    const values: number[] = [];
    for (let offset = 0; offset < signal.length; offset += HOP_SAMPLES) {
      const end = Math.min(signal.length, offset + HOP_SAMPLES * 2);
      let sum = 0;
      for (let index = offset; index < end; index += 1) sum += signal[index] * signal[index];
      values.push(Math.sqrt(sum / Math.max(1, end - offset)));
    }
    return values;
  }

  private normalize(values: number[]): number[] {
    const sorted = [...values].sort((a, b) => a - b);
    const floor = sorted[Math.floor(sorted.length * 0.05)] ?? 0;
    const ceiling = sorted[Math.floor(sorted.length * 0.95)] ?? 1;
    const range = Math.max(0.000001, ceiling - floor);
    return values.map((value) => Number(Math.min(1, Math.max(0, (value - floor) / range)).toFixed(4)));
  }

  private estimateTempo(onset: number[]): { bpm: number; confidence: number } {
    const framesPerSecond = ANALYSIS_SAMPLE_RATE / HOP_SAMPLES;
    let bestLag = Math.round((framesPerSecond * 60) / 120);
    let bestScore = -Infinity;
    let totalScore = 0;
    let candidates = 0;
    for (let bpm = 70; bpm <= 180; bpm += 0.5) {
      const lag = Math.round((framesPerSecond * 60) / bpm);
      let score = 0;
      for (let index = lag; index < onset.length; index += 1) score += onset[index] * onset[index - lag];
      const normalizedScore = score / Math.max(1, onset.length - lag);
      totalScore += normalizedScore;
      candidates += 1;
      if (normalizedScore > bestScore) {
        bestScore = normalizedScore;
        bestLag = lag;
      }
    }
    let bpm = (framesPerSecond * 60) / bestLag;
    const average = totalScore / Math.max(1, candidates);
    let confidence = bestScore <= 0 ? 0 : Math.min(1, Math.max(0, (bestScore - average) / bestScore));
    const peakTempo = this.estimateTempoFromPeaks(onset, framesPerSecond);
    if (peakTempo && Math.abs(peakTempo.bpm - bpm) <= 8) {
      bpm = peakTempo.bpm;
      confidence = Math.max(confidence, peakTempo.confidence);
    }
    return { bpm: Number(bpm.toFixed(2)), confidence: Number(confidence.toFixed(3)) };
  }

  private estimateTempoFromPeaks(onset: number[], framesPerSecond: number) {
    const maximum = Math.max(...onset);
    if (maximum <= 0) return null;
    const threshold = maximum * 0.35;
    const minimumDistance = Math.max(2, Math.floor(framesPerSecond * 0.25));
    const peaks: number[] = [];
    for (let index = 1; index < onset.length - 1; index += 1) {
      if (onset[index] < threshold || onset[index] < onset[index - 1] || onset[index] < onset[index + 1]) continue;
      const previous = peaks[peaks.length - 1];
      if (previous !== undefined && index - previous < minimumDistance) {
        if (onset[index] > onset[previous]) peaks[peaks.length - 1] = index;
      } else {
        peaks.push(index);
      }
    }
    const intervals = peaks.slice(1).map((peak, index) => (peak - peaks[index]) / framesPerSecond)
      .filter((interval) => interval >= 0.3 && interval <= 0.9);
    if (intervals.length < 6) return null;
    const mean = intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
    const deviation = Math.sqrt(intervals.reduce((sum, value) => sum + (value - mean) ** 2, 0) / intervals.length);
    if (deviation / mean > 0.22) return null;
    let bpm = 60 / mean;
    while (bpm < 70) bpm *= 2;
    while (bpm > 180) bpm /= 2;
    return { bpm, confidence: Math.max(0, Math.min(1, 1 - deviation / mean)) };
  }

  private buildBeatGrid(onset: number[], bpm: number, duration: number): number[] {
    const framesPerSecond = ANALYSIS_SAMPLE_RATE / HOP_SAMPLES;
    const intervalFrames = Math.max(1, Math.round((framesPerSecond * 60) / bpm));
    let bestPhase = 0;
    let bestScore = -Infinity;
    for (let phase = 0; phase < intervalFrames; phase += 1) {
      let score = 0;
      for (let index = phase; index < onset.length; index += intervalFrames) score += onset[index];
      if (score > bestScore) { bestScore = score; bestPhase = phase; }
    }
    const beats: number[] = [];
    const first = bestPhase / framesPerSecond;
    const interval = 60 / bpm;
    for (let time = first; time <= duration + 0.001; time += interval) beats.push(Number(time.toFixed(3)));
    return beats;
  }

  private downsampleEnergy(values: number[], duration: number): AudioEnergyPoint[] {
    const points = Math.min(480, Math.max(60, Math.ceil(duration * 2)));
    return Array.from({ length: points }, (_, index) => {
      const start = Math.floor((index * values.length) / points);
      const end = Math.max(start + 1, Math.floor(((index + 1) * values.length) / points));
      const slice = values.slice(start, end);
      return {
        time: Number(((index / points) * duration).toFixed(3)),
        energy: Number((slice.reduce((sum, value) => sum + value, 0) / Math.max(1, slice.length)).toFixed(4))
      };
    });
  }

  private buildWaveform(signal: Float32Array, duration: number) {
    const points = 600;
    return Array.from({ length: points }, (_, index) => {
      const start = Math.floor((index * signal.length) / points);
      const end = Math.max(start + 1, Math.floor(((index + 1) * signal.length) / points));
      let min = 1;
      let max = -1;
      for (let cursor = start; cursor < end; cursor += 1) {
        min = Math.min(min, signal[cursor]);
        max = Math.max(max, signal[cursor]);
      }
      return { time: Number(((index / points) * duration).toFixed(3)), min: Number(min.toFixed(4)), max: Number(max.toFixed(4)) };
    });
  }

  private calculateLoudness(signal: Float32Array): number {
    let sum = 0;
    for (const value of signal) sum += value * value;
    return Number((20 * Math.log10(Math.max(0.000001, Math.sqrt(sum / signal.length)))).toFixed(2));
  }

  private calculatePeak(signal: Float32Array): number {
    let peak = 0;
    for (const value of signal) peak = Math.max(peak, Math.abs(value));
    return Number((20 * Math.log10(Math.max(0.000001, peak))).toFixed(2));
  }
}
