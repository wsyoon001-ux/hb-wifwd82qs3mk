// 앱 내장 일정(원본) 위에 사용자가 고친 기록을 겹친다. 순수 함수만 둔다 —
// 서버에서 뭐가 오든 여기서 걸러서, 화면은 늘 멀쩡한 일정 목록만 받는다.
import { localDateKey, TRIP_TZ } from './schedule.js';

export const VIAS = ['walk', 'transit', 'drive', 'flight'];
const EDITABLE = ['startUtc', 'tz', 'title', 'place', 'lines', 'dest'];
const OPS = ['edit', 'delete', 'add', 'reset'];
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

const byStart = (a, b) => (a.startUtc < b.startUtc ? -1 : a.startUtc > b.startUtc ? 1 : 0);

// 같은 id는 at이 늦은 것 하나만. 같으면 뒤에 온 것 — 서버는 받은 것을 뒤에 붙여 합치므로
// 시계가 같을 때는 방금 올린 쪽이 이긴다.
function latestById(records) {
  const m = new Map();
  for (const r of Array.isArray(records) ? records : []) {
    if (!r || typeof r !== 'object' || typeof r.id !== 'string' || !r.id) continue;
    if (typeof r.at !== 'string' || !OPS.includes(r.op)) continue;
    const prev = m.get(r.id);
    if (!prev || prev.at <= r.at) m.set(r.id, r);
  }
  return m;
}

function cleanDest(d) {
  if (!d || typeof d !== 'object') return null;
  if (typeof d.name !== 'string' || !Number.isFinite(d.lat) || !Number.isFinite(d.lng)) return null;
  const address = typeof d.address === 'string' ? d.address : '';
  return {
    name: d.name, address,
    mapQuery: typeof d.mapQuery === 'string' && d.mapQuery ? d.mapQuery : `${d.name} ${address}`.trim(),
    lat: d.lat, lng: d.lng,
    via: VIAS.includes(d.via) ? d.via : 'walk',
  };
}

const cleanLine = l => ({
  text: l.text,
  ...(typeof l.mark === 'string' ? { mark: l.mark } : {}),
  ...(typeof l.sub === 'string' ? { sub: l.sub } : {}),
});

// 화면이 믿고 그릴 수 있는 일정만 통과시킨다. 못 쓰면 null.
// 서버에서 온 것은 아는 칸만 골라 새로 만든다 — refs: 5 같은 칸 하나가 카드 그리기를 죽이면
// 폰에 저장된 기록 때문에 앱이 오프라인에서도 계속 안 열린다.
function sanitize(e) {
  if (!e || typeof e.id !== 'string') return null;
  if (typeof e.startUtc !== 'string' || !ISO.test(e.startUtc) || Number.isNaN(Date.parse(e.startUtc))) return null;
  if (typeof e.title !== 'string' || !e.title.trim() || typeof e.tz !== 'string') return null;
  try { localDateKey(e.startUtc, e.tz); } catch { return null; }   // 없는 시간대
  const out = {
    id: e.id, startUtc: e.startUtc, tz: e.tz, title: e.title,
    place: typeof e.place === 'string' ? e.place : '',
    lines: Array.isArray(e.lines) ? e.lines.filter(l => l && typeof l.text === 'string').map(cleanLine) : [],
  };
  const dest = cleanDest(e.dest);
  if (dest) out.dest = dest;
  return out;
}

export function mergePlan(base, records) {
  const latest = latestById(records);
  const events = [], deleted = [];
  const baseIds = new Set();

  for (const e of base) {
    baseIds.add(e.id);
    const r = latest.get(e.id);
    if (!r || r.op === 'reset' || r.op === 'add') { events.push(e); continue; }
    if (r.op === 'delete') { deleted.push(e); continue; }
    // edit
    const f = r.fields && typeof r.fields === 'object' ? r.fields : {};
    const merged = { ...e };
    for (const k of EDITABLE) if (k in f) merged[k] = f[k];
    if ('dest' in f && f.dest == null) delete merged.dest;
    const clean = sanitize(merged);
    if (!clean) { events.push(e); continue; }
    // 원본의 나머지 칸(refs·alarm 등)은 앱에 내장된 믿을 수 있는 값이라 그대로 둔다.
    const out = { ...e, ...clean, edited: true };
    if (!clean.dest) delete out.dest;
    // 사용자가 시각을 정했으면 원본의 "미확정(?)" 경고는 더 이상 맞지 않다.
    if ('startUtc' in f) out.timeMark = '✎';
    events.push(out);
  }

  for (const r of latest.values()) {
    if (baseIds.has(r.id)) continue;
    if (r.op !== 'add' && r.op !== 'delete') continue;
    const clean = sanitize({ ...(r.event ?? {}), id: r.id });
    if (!clean) continue;
    (r.op === 'add' ? events : deleted).push({ ...clean, edited: true, added: true });
  }

  events.sort(byStart);
  deleted.sort(byStart);
  return { events, deleted };
}

// 그 시간대의 벽시계 시각을 UTC로. 오프셋을 두 번 맞춰 서머타임 경계도 따라간다.
export function localToUtc(dateKey, hhmm, tz) {
  const wall = Date.parse(`${dateKey}T${hhmm}:00Z`);
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
  const offset = t => {
    const p = fmt.formatToParts(new Date(t));
    const g = k => Number(p.find(x => x.type === k).value);
    return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute')) - t;
  };
  let t = wall - offset(wall);
  t = wall - offset(t);
  return new Date(t).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function neighborBefore(events, utcIso) {
  const sorted = [...events].sort(byStart);
  let prev = null;
  for (const e of sorted) {
    if (e.startUtc <= utcIso) prev = e;
    else break;
  }
  return prev ?? sorted[0] ?? null;
}

// 새 일정의 시간대. 사용자에게 묻지 않고 "그 시각 직전에 어디 있었나"를 따른다.
// 밴쿠버 기준으로 먼저 어림한다 — 두 도시 차이는 1시간이라 직전 일정이 바뀌는 경우는 경계 1시간뿐이다.
export function tzFor(events, dateKey, hhmm) {
  return neighborBefore(events, localToUtc(dateKey, hhmm, TRIP_TZ))?.tz ?? TRIP_TZ;
}
