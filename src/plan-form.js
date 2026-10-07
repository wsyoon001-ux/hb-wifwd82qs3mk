// 편집 화면의 입력값과 변경 기록 사이를 오간다. 화면(DOM)은 모른다.
import { localToUtc, neighborBefore, tzFor, VIAS } from './plan-merge.js';
import { tripDays } from './map-plan.js';
import { localDateKey } from './schedule.js';
import { fmtTime } from './format.js';

export function linesText(lines) {
  return (lines ?? []).map(l => (l.sub ? `${l.text} — ${l.sub}` : l.text)).join('\n');
}

const norm = s => String(s ?? '').split('\n').map(x => x.trim()).filter(Boolean).join('\n');
const toLines = s => (s ? s.split('\n').map(text => ({ mark: '✎', text })) : []);
const randomId = () => 'u-' + Math.random().toString(36).slice(2, 10);

export function formFromEvent(e) {
  return {
    date: localDateKey(e.startUtc, e.tz),
    time: fmtTime(e.startUtc, e.tz),
    title: e.title,
    linesText: linesText(e.lines),
    dest: e.dest ?? null,
    via: e.dest?.via ?? 'walk',
  };
}

// 원본 일정은 "원본과 다른 칸"을 전부 담는다(직전 기록과의 차이가 아니다) —
// 같은 id는 마지막 기록 하나만 살아남기 때문에, 앞선 수정도 매번 다시 실어야 한다.
export function recordFromForm(form, { base, current, events, now = new Date(), newId = randomId }) {
  const title = String(form.title ?? '').trim();
  if (!title) return { error: '제목을 넣으세요' };
  if (!tripDays().includes(form.date)) return { error: '날짜를 고르세요' };
  if (!/^\d{2}:\d{2}$/.test(form.time ?? '')) return { error: '시각을 넣으세요' };

  const at = now.toISOString();
  // 같은 날 안에서 시각만 바꾸면 원래 시간대. 다른 날로 옮기면 그 날 그 시각 직전 일정을 따른다 —
  // 밴쿠버 일정을 옐로나이프 날로 옮겼는데 밴쿠버 시각으로 저장되면 1시간 어긋난다.
  const others = events.filter(e => e.id !== current?.id);
  const sameDay = !!current && form.date === localDateKey(current.startUtc, current.tz);
  const tz = sameDay ? current.tz : tzFor(others, form.date, form.time);
  const startUtc = localToUtc(form.date, form.time, tz);
  const place = sameDay ? current.place : (neighborBefore(others, startUtc)?.place ?? current?.place ?? '');
  const dest = form.dest ? { ...form.dest, via: VIAS.includes(form.via) ? form.via : 'walk' } : null;
  const text = norm(form.linesText);

  if (base) {
    const fields = {};
    if (startUtc !== base.startUtc) fields.startUtc = startUtc;
    if (tz !== base.tz) fields.tz = tz;
    if (place !== base.place) fields.place = place;
    if (title !== base.title) fields.title = title;
    if (text !== norm(linesText(base.lines))) fields.lines = toLines(text);
    if (JSON.stringify(dest) !== JSON.stringify(base.dest ?? null)) fields.dest = dest;
    const record = Object.keys(fields).length
      ? { id: base.id, op: 'edit', at, fields }
      : { id: base.id, op: 'reset', at };
    // 캘린더(.ics)에 들어간 건 원본 일정뿐이다. 새 일정은 알람과 무관하다.
    return { record, timeChanged: startUtc !== current.startUtc };
  }

  const event = { startUtc, tz, title, place, lines: toLines(text), ...(dest ? { dest } : {}) };
  return { record: { id: current?.id ?? newId(), op: 'add', at, event }, timeChanged: false };
}

function eventOnly(e) {
  const { startUtc, tz, title, place, lines, dest } = e;
  return { startUtc, tz, title, place, lines, ...(dest ? { dest } : {}) };
}

// 새 일정은 지울 때도 내용을 들고 간다. 원본이 없으니 그래야 되살릴 수 있다.
export function deleteRecord(e, isBase, now = new Date()) {
  const at = now.toISOString();
  return isBase ? { id: e.id, op: 'delete', at } : { id: e.id, op: 'delete', at, event: eventOnly(e) };
}

// 원본을 되살리면 원본 상태로 돌아간다(지우기 전 수정은 버린다).
export function restoreRecord(e, isBase, now = new Date()) {
  const at = now.toISOString();
  return isBase ? { id: e.id, op: 'reset', at } : { id: e.id, op: 'add', at, event: eventOnly(e) };
}
