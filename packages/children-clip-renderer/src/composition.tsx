import React from 'react';
import { AbsoluteFill, Img, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import type { CharacterLayer, ChildrenClipShotProps } from './types';

const Character: React.FC<{ layer: CharacterLayer; beatFrames: number[] }> = ({ layer, beatFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const isBeat = beatFrames.some((beat) => Math.abs(beat - frame) <= 1);
  const activeMouth = layer.mouthFrames.find((mouth) => frame >= mouth.startFrame && frame < mouth.endFrame);
  const idle = Math.sin((frame / fps) * Math.PI * 2) * 0.7;
  return <div style={{ position: 'absolute', left: `${layer.x}%`, top: `${layer.y}%`, width: `${layer.width}%`, height: `${layer.height}%`, transform: `translateY(${idle + (isBeat ? -2 : 0)}%) scale(${isBeat ? 1.015 : 1})`, transformOrigin: 'bottom center' }}>
    <Img src={layer.src} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
    {activeMouth?.src ? <Img src={activeMouth.src} style={{ position: 'absolute', left: `${layer.mouthX}%`, top: `${layer.mouthY}%`, width: `${layer.mouthWidth}%`, objectFit: 'contain' }} /> : null}
  </div>;
};

export const ChildrenClipShot: React.FC<ChildrenClipShotProps> = (props) => {
  const frame = useCurrentFrame();
  const progress = frame / Math.max(1, props.durationInFrames - 1);
  const fadeFrames = Math.max(2, Math.round(props.fps * 0.25));
  const opacity = Math.min(
    interpolate(frame, [0, fadeFrames], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
    interpolate(frame, [props.durationInFrames - fadeFrames, props.durationInFrames - 1], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  );
  const preset = (props.motionPreset || '').toLowerCase();
  const scale = preset.includes('zoom') ? 1.04 + progress * 0.08 : 1.06;
  const direction = preset.includes('right') ? -1 : 1;
  const translateX = preset.includes('pan') ? direction * (progress - 0.5) * 5 : 0;
  return <AbsoluteFill style={{ backgroundColor: '#d9f1ff', overflow: 'hidden', opacity }}>
    <Img src={props.backgroundSrc} style={{ position: 'absolute', width: '100%', height: '100%', objectFit: 'cover', transform: `translateX(${translateX}%) scale(${scale})`, transformOrigin: 'center' }} />
    {props.characters.map((character) => <Character key={character.id} layer={character} beatFrames={props.beatFrames} />)}
    {props.foregroundSrc ? <Img src={props.foregroundSrc} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: `translateX(${-translateX * 1.5}%) scale(1.04)` }} /> : null}
    {props.lyricText ? <div style={{ position: 'absolute', left: '8%', right: '8%', bottom: '5%', padding: '14px 22px', borderRadius: 24, color: '#fff', background: 'rgba(22,42,66,.68)', fontFamily: 'Arial, sans-serif', fontSize: Math.round(props.height * 0.048), fontWeight: 800, textAlign: 'center', textShadow: '0 2px 4px rgba(0,0,0,.45)' }}>{props.lyricText}</div> : null}
  </AbsoluteFill>;
};
