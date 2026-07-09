import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, resolve } from 'node:path';
import { promisify } from 'node:util';

import dotenv from 'dotenv';

const execFileAsync = promisify(execFile);

interface WhisperTranscriptPayload {
  text?: string;
  language?: string | null;
  device?: string | null;
  computeType?: string | null;
}

function buildProcessPath(extraPaths: string): string {
  const segments = extraPaths
    .split(';')
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length === 0) {
    return process.env.PATH ?? '';
  }

  return [...segments, process.env.PATH ?? ''].filter(Boolean).join(delimiter);
}

function getArgument(flag: string): string | null {
  const index = process.argv.indexOf(flag);

  if (index === -1) {
    return null;
  }

  const value = process.argv[index + 1];
  return value ? value.trim() : null;
}

async function main(): Promise<void> {
  const envPath = resolve('.env');

  if (existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }

  const audioPathInput = getArgument('--audio-path');

  if (!audioPathInput) {
    throw new Error('Missing required argument --audio-path');
  }

  const audioPath = resolve(audioPathInput);

  if (!existsSync(audioPath)) {
    throw new Error(`Audio file not found: ${audioPath}`);
  }

  const pythonPath = process.env.WHISPER_PYTHON_PATH ?? 'python';
  const model = process.env.WHISPER_MODEL ?? 'distil-large-v3';
  const device = process.env.WHISPER_DEVICE ?? 'cpu';
  const computeType = process.env.WHISPER_COMPUTE_TYPE ?? 'int8';
  const fallbackDevice = process.env.WHISPER_FALLBACK_DEVICE ?? 'cpu';
  const fallbackComputeType = process.env.WHISPER_FALLBACK_COMPUTE_TYPE ?? 'int8';
  const language = process.env.WHISPER_LANGUAGE ?? '';
  const extraPaths = process.env.WHISPER_EXTRA_PATHS ?? '';
  const helperPath = resolve('apps/worker/scripts/transcribe_with_faster_whisper.py');

  const args = [
    helperPath,
    '--audio-path',
    audioPath,
    '--model',
    model,
    '--device',
    device,
    '--compute-type',
    computeType,
    '--fallback-device',
    fallbackDevice,
    '--fallback-compute-type',
    fallbackComputeType
  ];

  if (language.trim()) {
    args.push('--language', language.trim());
  }

  const { stdout } = await execFileAsync(pythonPath, args, {
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
    env: {
      ...process.env,
      PATH: buildProcessPath(extraPaths),
      HF_HUB_DISABLE_SYMLINKS_WARNING: '1'
    }
  });

  const payload = JSON.parse(stdout.trim()) as WhisperTranscriptPayload;
  const rawText = payload.text?.trim() ?? '';
  const normalizedText = rawText.replace(/\s+/g, ' ').trim().toLowerCase();

  console.log(
    JSON.stringify(
      {
        audioPath,
        model,
        requestedDevice: device,
        requestedComputeType: computeType,
        effectiveDevice: payload.device ?? null,
        effectiveComputeType: payload.computeType ?? null,
        language: payload.language ?? null,
        rawText,
        normalizedText
      },
      null,
      2
    )
  );
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
