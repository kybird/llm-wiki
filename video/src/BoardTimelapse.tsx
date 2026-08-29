import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { replay, Ev, State } from './replay';

export type TimelineProps = {
  schemaVersion: number;
  kind: string;
  repo: string;
  wip: number | null;
  generatedAt: string;
  events: Ev[];
};

const FPS = 30;
const INTRO = 55;          // 타이틀 카드
const PER_EVENT = 26;      // 이벤트 1건당 머무는 프레임
const OUTRO = 90;          // 최종 상태 + 요약

export const durationInFrames = (events: number) => INTRO + events * PER_EVENT + OUTRO;

const ACTION_LABEL: Record<string, string> = {
  created: '카드 생성',
  claimed: '집기 (doing)',
  handoff: 'park (review)',
  done: '완료',
  superseded: '대체',
  abandoned: '폐기',
  reverted: 'QA 되돌림',
  resumed: '대기 복귀',
};

const ACTION_COLOR: Record<string, string> = {
  created: '#8fd694',
  claimed: '#8ab8ff',
  handoff: '#ffd479',
  done: '#6ee7a0',
  superseded: '#c9a6ff',
  abandoned: '#ff8f8f',
  reverted: '#ffb26b',
  resumed: '#8ab8ff',
};

const Card = ({ title, by, highlight }: { title: string; by?: string; highlight: boolean }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 200 } });
  return (
    <div
      style={{
        background: highlight ? '#33465c' : '#243040',
        border: highlight ? '1px solid #8ab8ff' : '1px solid #2e3b4a',
        borderRadius: 8,
        padding: '8px 10px',
        marginBottom: 6,
        transform: `scale(${interpolate(pop, [0, 1], [0.96, 1])})`,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, color: '#e8edf2', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {title}
      </div>
      {by ? <div style={{ fontSize: 11, color: '#8fa3b5', marginTop: 2 }}>by {by}</div> : null}
    </div>
  );
};

const Column = ({ label, note, children }: { label: string; note?: string; children: React.ReactNode }) => (
  <div style={{ flex: 1, background: '#1a222b', border: '1px solid #26313d', borderRadius: 12, padding: 12, minWidth: 0 }}>
    <div style={{ fontSize: 12, letterSpacing: '0.08em', color: '#7d90a2', marginBottom: 4 }}>
      {label} {note ? <span style={{ color: '#5b6c7d' }}>· {note}</span> : null}
    </div>
    {children}
  </div>
);

export const BoardTimelapse: React.FC<TimelineProps> = ({ repo, wip, events }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const states: State[] = replay(events);
  const n = states.length;

  const segIdx = Math.max(0, Math.min(Math.floor((frame - INTRO) / PER_EVENT), n - 1));
  const inIntro = frame < INTRO;
  const inOutro = frame >= INTRO + n * PER_EVENT;
  const state = n > 0 ? states[segIdx] : { todo: [], doing: [], review: [], done: 0, superseded: 0, abandoned: 0 };
  const last = state.last;
  const segFrame = frame - (INTRO + segIdx * PER_EVENT);
  const fade = interpolate(segFrame, [0, 8], [0.35, 1], { extrapolateRight: 'clamp' });
  const titleIn = spring({ frame: inIntro ? frame : 0, fps, config: { damping: 200 } });

  const lastAction = last?.action ?? '';
  const bannerColor = ACTION_COLOR[lastAction] ?? '#8ab8ff';
  const lastTitle = last?.title ?? '';

  return (
    <AbsoluteFill style={{ background: '#0f141a', fontFamily: "'Segoe UI', 'Malgun Gothic', sans-serif", opacity: fade }}>
      <div style={{ padding: '22px 28px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <span style={{ fontSize: 20, fontWeight: 700, color: '#e8edf2' }}>{repo} kanban</span>
          <span style={{ fontSize: 12, color: '#5b6c7d', marginLeft: 10 }}>work-loop timelapse</span>
        </div>
        <div style={{ fontSize: 13, color: '#7d90a2' }}>
          {n > 0 ? `${segIdx + 1} / ${n}` : '0 events'}
        </div>
      </div>

      {last && !inIntro ? (
        <div style={{ margin: '0 28px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ background: bannerColor, color: '#10151b', fontWeight: 700, fontSize: 12, borderRadius: 999, padding: '3px 10px' }}>
            {ACTION_LABEL[lastAction] ?? lastAction}
          </span>
          <span style={{ fontSize: 14, color: '#e8edf2' }}>{lastTitle}</span>
          <span style={{ fontSize: 12, color: '#5b6c7d' }}>{last?.ts?.replace('T', ' ').slice(0, 16)}</span>
        </div>
      ) : null}

      {inIntro ? (
        <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', flexDirection: 'column', transform: `scale(${interpolate(titleIn, [0, 1], [0.92, 1])})` }}>
          <div style={{ fontSize: 44, fontWeight: 700, color: '#e8edf2' }}>{repo} — board timelapse</div>
          <div style={{ fontSize: 16, color: '#7d90a2', marginTop: 10 }}>
            doc/kanban/activity.jsonl 재생 · {n} events
          </div>
        </AbsoluteFill>
      ) : (
        <div style={{ display: 'flex', gap: 14, padding: '0 28px' }}>
          <Column label="DOING" note={wip !== null ? `${state.doing.length}/${wip}` : undefined}>
            {state.doing.map(c => (
              <Card key={c.title} title={c.title} by={c.by} highlight={lastTitle === c.title && ['claimed', 'reverted'].includes(lastAction)} />
            ))}
            {state.doing.length === 0 ? <div style={{ color: '#46586a', fontSize: 12 }}>(비어 있음)</div> : null}
          </Column>
          <Column label="REVIEW">
            {state.review.map(c => (
              <Card key={c.title} title={c.title} highlight={lastTitle === c.title && lastAction === 'handoff'} />
            ))}
            {state.review.length === 0 ? <div style={{ color: '#46586a', fontSize: 12 }}>(비어 있음)</div> : null}
          </Column>
          <Column label="TODO">
            {state.todo.map(c => (
              <Card key={c.title} title={c.title} highlight={lastTitle === c.title && ['created', 'resumed'].includes(lastAction)} />
            ))}
            {state.todo.length === 0 ? <div style={{ color: '#46586a', fontSize: 12 }}>(비어 있음)</div> : null}
          </Column>
        </div>
      )}

      <div style={{ position: 'absolute', bottom: 18, left: 28, right: 28, display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#7d90a2' }}>
        <span>
          done <b style={{ color: '#6ee7a0' }}>{state.done}</b> · superseded <b style={{ color: '#c9a6ff' }}>{state.superseded}</b> · abandoned <b style={{ color: '#ff8f8f' }}>{state.abandoned}</b>
        </span>
        <span>정본은 doc/kanban/ 카드 파일들 — 이 영상은 유도물</span>
      </div>

      {inOutro ? (
        <AbsoluteFill style={{ background: '#0f141aee', justifyContent: 'center', alignItems: 'center', flexDirection: 'column' }}>
          <div style={{ fontSize: 34, fontWeight: 700, color: '#e8edf2' }}>세션 종료</div>
          <div style={{ fontSize: 16, color: '#7d90a2', marginTop: 8 }}>
            {n} events · done {state.done} · superseded {state.superseded} · abandoned {state.abandoned}
          </div>
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};
