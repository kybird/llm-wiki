// activity.jsonl 이벤트를 프레임별 보드 상태로 재생한다.
// CLI(board video)가 만든 타임라인의 이벤트 순서가 곧 시간축이다.
export type Ev = { ts: string; action: string; title?: string; actor?: string; detail?: string };
export type Card = { title: string; by?: string };
export type State = {
  todo: Card[];
  doing: Card[];
  review: Card[];
  done: number;
  superseded: number;
  abandoned: number;
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
  let s: State = { todo: [], doing: [], review: [], done: 0, superseded: 0, abandoned: 0 };
  for (const e of events) {
    const t = e.title ?? '';
    const next: State = { ...s, todo: [...s.todo], doing: [...s.doing], review: [...s.review], last: e };
    rmAll(next, t);
    switch (e.action) {
      case 'created':
        next.todo.push({ title: t });
        break;
      case 'claimed':
        next.doing.push({ title: t, by: e.actor });
        break;
      case 'handoff':
        next.review.push({ title: t });
        break;
      case 'resumed':
        next.todo.push({ title: t });
        break;
      case 'reverted':
        next.doing.push({ title: t });
        break;
      case 'done':
        next.done += 1;
        break;
      case 'superseded': {
        next.superseded += 1;
        const kids = (e.detail ?? '').replace(/^by\s*/, '').split(',').map(x => x.trim()).filter(Boolean);
        for (const k of kids) {
          rmAll(next, k);
          next.todo.push({ title: k });
        }
        break;
      }
      case 'abandoned':
        next.abandoned += 1;
        break;
      default:
        break;
    }
    states.push(next);
    s = next;
  }
  return states;
}
