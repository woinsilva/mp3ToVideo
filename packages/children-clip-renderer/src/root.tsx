import React from 'react';
import { Composition } from 'remotion';
import { ChildrenClipShot } from './composition';
import type { ChildrenClipShotProps } from './types';

const defaults: ChildrenClipShotProps = {
  width: 1280, height: 720, fps: 24, durationInFrames: 120, backgroundSrc: '',
  characters: [], beatFrames: []
};

const ParameterizedShot: React.FC<ChildrenClipShotProps & Record<string, unknown>> = (props) => <ChildrenClipShot {...props} />;

export const RemotionRoot: React.FC = () => <Composition<any, ChildrenClipShotProps & Record<string, unknown>>
  id="ChildrenClipShot"
  component={ParameterizedShot}
  width={1280}
  height={720}
  fps={24}
  durationInFrames={120}
  defaultProps={defaults as ChildrenClipShotProps & Record<string, unknown>}
  calculateMetadata={({ props }) => ({
    width: props.width,
    height: props.height,
    fps: props.fps,
    durationInFrames: props.durationInFrames
  })}
/>;
