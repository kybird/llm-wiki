import React from 'react';
import { Composition } from 'remotion';
import { BoardTimelapse, durationInFrames, TimelineProps } from './BoardTimelapse';

export const RemotionRoot: React.FC = () => (
  <Composition
    id="BoardTimelapse"
    component={BoardTimelapse}
    fps={30}
    width={1280}
    height={720}
    defaultProps={{
      schemaVersion: 1,
      kind: 'board-timeline',
      repo: 'llm-wiki',
      wip: 2,
      generatedAt: '',
      events: [],
    }}
    calculateMetadata={({ props }: { props: TimelineProps }) => ({
      durationInFrames: durationInFrames(props.events.length),
    })}
  />
);
