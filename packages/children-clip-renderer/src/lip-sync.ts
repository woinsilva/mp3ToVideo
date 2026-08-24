import type { MouthFrame } from './types';

export interface TimedWord {
  text: string;
  startSeconds: number;
  endSeconds: number;
}

const vowelShape = (character: string) => {
  const normalized = character.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if ('a'.includes(normalized)) return 'A';
  if ('ei'.includes(normalized)) return 'E';
  if ('o'.includes(normalized)) return 'O';
  if ('u'.includes(normalized)) return 'U';
  return 'closed';
};

export const buildMouthFrames = (words: TimedWord[], fps: number, shotStartSeconds = 0): MouthFrame[] => {
  const result: MouthFrame[] = [];
  for (const word of words) {
    const vowels = [...word.text].map(vowelShape).filter((shape) => shape !== 'closed');
    const shapes = vowels.length ? vowels : ['closed'];
    const startFrame = Math.max(0, Math.round((word.startSeconds - shotStartSeconds) * fps));
    const endFrame = Math.max(startFrame + 1, Math.round((word.endSeconds - shotStartSeconds) * fps));
    const span = Math.max(1, endFrame - startFrame);
    shapes.forEach((shape, index) => {
      const shapeStart = startFrame + Math.floor((span * index) / shapes.length);
      const shapeEnd = startFrame + Math.floor((span * (index + 1)) / shapes.length);
      result.push({ startFrame: shapeStart, endFrame: Math.max(shapeStart + 1, shapeEnd), shape });
    });
    result.push({ startFrame: endFrame, endFrame: endFrame + Math.max(1, Math.round(fps * 0.05)), shape: 'closed' });
  }
  return result;
};
