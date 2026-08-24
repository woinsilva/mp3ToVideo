export interface MouthFrame {
  startFrame: number;
  endFrame: number;
  shape: string;
  src?: string | null;
}

export interface CharacterLayer {
  id: string;
  name: string;
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
  mouthX: number;
  mouthY: number;
  mouthWidth: number;
  mouthFrames: MouthFrame[];
}

export interface ChildrenClipShotProps {
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
  backgroundSrc: string;
  foregroundSrc?: string | null;
  characters: CharacterLayer[];
  lyricText?: string | null;
  motionPreset?: string | null;
  transitionIn?: string | null;
  transitionOut?: string | null;
  beatFrames: number[];
}
