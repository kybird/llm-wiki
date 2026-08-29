// activity.jsonl 이벤트를 프레임별 보드 상태로 재생한다.
// CLI(board video)가 만든 타임라인의 이벤트 순서가 곧 시간축이다.
// since = 카드가 현재 컬럼에 들어온 이벤트 인덱스 — 입장 애니메이션의 기준점.
export type Ev = { ts: string; action: string; title?: string; actor?: string; detail?: string };
export type Card = { title: string; by?: string; since: number; q?: string };
export type Term = { title: string; kind: 'done' | 'superseded' | 'abandoned'; since: number };
export type State = {
  todo: Card[];
  doing: Card[];
  review: Card[];
  done: number;
  superseded: number;
  abandoned: number;
  terminal: Term[];
  last?: Ev;
};

const rmAll = (s: State, t: string) => {
  s.todo = s.todo.filter(c => c.title !== t);
  s.doing = s.doing.filter(c => c.title !== t);
  s.review = s.review.filter(c => c.title !== t);
};

// 각 이벤트 적용 "후"의 상태 배열을 돌려준다 (states[i] = events[i] 직후).
// 알 수 없는 액션은 상태를 바꾸지 않는다 — 미래 포맷에 관대해야 한다.
export function replay(events: Ev[]): State[] {
  const states: State[] = [];
  let s: State = { todo: [], doing: [], review: [], done: 0, superseded: 0, abandoned: 0, terminal: [] };
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    const t = e.title ?? '';
    const next: State = { ...s, todo: [...s.todo], doing: [...s.doing], review: [...s.review], terminal: [...s.terminal], last: e };
    rmAll(next, t);
    switch (e.action) {
      case 'created':
        next.todo.push({ title: t, since: i });
        break;
      case 'claimed':
        next.doing.push({ title: t, by: e.actor, since: i });
        break;
      case 'handoff':
        next.review.push({ title: t, since: i, q: e.detail }); // detail = 사람에게 던지는 질문
        break;
      case 'resumed':
        next.todo.push({ title: t, since: i });
        break;
      case 'reverted':
        next.doing.push({ title: t, since: i });
        break;
      case 'done':
        next.done += 1;
        next.terminal.push({ title: t, kind: 'done', since: i });
        break;
      case 'superseded': {
        next.superseded += 1;
        next.terminal.push({ title: t, kind: 'superseded', since: i });
        const kids = (e.detail ?? '').replace(/^by\s*/, '').split(',').map(x => x.trim()).filter(Boolean);
        for (const k of kids) {
          rmAll(next, k);
          next.todo.push({ title: k, since: i });
        }
        break;
      }
      case 'abandoned':
        next.abandoned += 1;
        next.terminal.push({ title: t, kind: 'abandoned', since: i });
        break;
      default:
        break;
    }
    states.push(next);
    s = next;
  }
  return states;
}
