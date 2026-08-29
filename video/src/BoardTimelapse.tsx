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

// 카드는 보드가 사라지지 않는 한 화면에 계속 있다. 입장(since 세그먼트)에만
// 스프링으로 "새로 들어온다" — 보드 전체는 매 프레임 연속이다.
const Card = ({ title, by, since, highlight }: { title: string; by?: string; since: number; highlight: boolean }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const local = Math.max(0, frame - (INTRO + since * PER_EVENT));
  const pop = spring({ frame: local, fps, config: { damping: 14, stiffness: 160, mass: 0.7 } });
  return (
    <div
      style={{
        background: highlight ? '#33465c' : '#243040',
        border: highlight ? '1px solid #8ab8ff' : '1px solid #2e3b4a',
        borderRadius: 8,
        padding: '8px 10px',
        marginBottom: 6,
        transform: `scale(${interpolate(pop, [0, 1], [0.9, 1])})`,
        opacity: interpolate(pop, [0, 1], [0, 1]),
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
  const { fps, durationInFrames: total } = useVideoConfig();
  const states: State[] = replay(events);
  const n = states.length;

  const segIdx = Math.max(0, Math.min(Math.floor((frame - INTRO) / PER_EVENT), n - 1));
  const inIntro = frame < INTRO;
  const outroStart = INTRO + n * PER_EVENT;
  const inOutro = frame >= outroStart;
  const state = n > 0 ? states[segIdx] : { todo: [], doing: [], review: [], done: 0, superseded: 0, abandoned: 0, terminal: [] };
  const last = state.last;
  const segFrame = frame - (INTRO + segIdx * PER_EVENT);

  // 보드는 intro 끝에서 한 번만 페이드 인된다 — 세션 경계마다 깜빡이지 않는다.
  const boardOpacity = interpolate(frame, [INTRO - 8, INTRO], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const titleOpacity = interpolate(frame, [INTRO - 10, INTRO - 2], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const outroOpacity = interpolate(frame, [outroStart, outroStart + 12], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const progress = interpolate(frame, [0, total], [0, 100], { extrapolateRight: 'clamp' });

  const lastAction = last?.action ?? '';
  const bannerColor = ACTION_COLOR[lastAction] ?? '#8ab8ff';
  const lastTitle = last?.title ?? '';
  const bannerIn = spring({ frame: segFrame, fps, config: { damping: 200 } });

  return (
    <AbsoluteFill style={{ background: '#0f141a', fontFamily: "'Segoe UI', 'Malgun Gothic', sans-serif" }}>
      {/* 세션 진행 바 — 경계마다 리셋되지 않는 연속 신호 */}
      <div style={{ height: 3, background: '#1a222b' }}>
        <div style={{ height: 3, width: `${progress}%`, background: '#8ab8ff' }} />
      </div>

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
        <div
          style={{
            margin: '0 28px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            opacity: interpolate(bannerIn, [0, 1], [0.25, 1]),
            transform: `translateY(${interpolate(bannerIn, [0, 1], [-6, 0])}px)`,
          }}
        >
          <span style={{ background: bannerColor, color: '#10151b', fontWeight: 700, fontSize: 12, borderRadius: 999, padding: '3px 10px' }}>
            {ACTION_LABEL[lastAction] ?? lastAction}
          </span>
          <span style={{ fontSize: 14, color: '#e8edf2' }}>{lastTitle}</span>
          <span style={{ fontSize: 12, color: '#5b6c7d' }}>{last?.ts?.replace('T', ' ').slice(0, 16)}</span>
        </div>
      ) : null}

      {inIntro ? (
        <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', flexDirection: 'column', opacity: titleOpacity }}>
          <div style={{ fontSize: 44, fontWeight: 700, color: '#e8edf2' }}>{repo} — board timelapse</div>
          <div style={{ fontSize: 16, color: '#7d90a2', marginTop: 10 }}>
            doc/kanban/activity.jsonl 재생 · {n} events
          </div>
        </AbsoluteFill>
      ) : (
        <div style={{ display: 'flex', gap: 12, padding: '0 28px' }}>
          <Column label="DOING" note={wip !== null ? `${state.doing.length}/${wip}` : undefined}>
            {state.doing.map(c => (
              <Card key={c.title} title={c.title} by={c.by} since={c.since} highlight={lastTitle === c.title && ['claimed', 'reverted'].includes(lastAction)} />
            ))}
            {state.doing.length === 0 ? <div style={{ color: '#46586a', fontSize: 12 }}>(비어 있음)</div> : null}
          </Column>
          <Column label="REVIEW">
            {state.review.map(c => (
              <Card key={c.title} title={c.title} since={c.since} highlight={lastTitle === c.title && lastAction === 'handoff'} />
            ))}
            {state.review.length === 0 ? <div style={{ color: '#46586a', fontSize: 12 }}>(비어 있음)</div> : null}
          </Column>
          <Column label="TODO">
            {state.todo.map(c => (
              <Card key={c.title} title={c.title} since={c.since} highlight={lastTitle === c.title && ['created', 'resumed'].includes(lastAction)} />
            ))}
            {state.todo.length === 0 ? <div style={{ color: '#46586a', fontSize: 12 }}>(비어 있음)</div> : null}
          </Column>
          <Column label="종결 적체">
            {state.terminal.slice(-7).reverse().map(t => (
              <div key={t.kind + t.title + t.since} style={{ background: '#243040', border: '1px solid #2e3b4a', borderRadius: 8, padding: '8px 10px', marginBottom: 6 }}>
                <span
                  style={{
                    display: 'inline-block',
                    fontSize: 10,
                    fontWeight: 700,
                    color: '#10151b',
                    background: ACTION_COLOR[t.kind === 'done' ? 'done' : t.kind === 'superseded' ? 'superseded' : 'abandoned'],
                    borderRadius: 999,
                    padding: '1px 7px',
                    marginRight: 6,
                  }}
                >
                  {t.kind === 'done' ? '완료' : t.kind === 'superseded' ? '대체' : '폐기'}
                </span>
                <span style={{ fontSize: 12, color: '#c6d2dd' }}>{t.title}</span>
              </div>
            ))}
            {state.terminal.length === 0 ? <div style={{ color: '#46586a', fontSize: 12 }}>(비어 있음)</div> : null}
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
        <AbsoluteFill style={{ background: '#0f141a', opacity: outroOpacity, justifyContent: 'center', alignItems: 'center', flexDirection: 'column' }}>
          <div style={{ fontSize: 34, fontWeight: 700, color: '#e8edf2' }}>세션 종료</div>
          <div style={{ fontSize: 16, color: '#7d90a2', marginTop: 8 }}>
            {n} events · done {state.done} · superseded {state.superseded} · abandoned {state.abandoned}
          </div>
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};
