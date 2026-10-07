// 지도 탭이 그릴 것을 일정에서 뽑는다. 구글 지도를 모르는 순수 함수만 둔다 —
// 오프라인 장소 목록도 같은 핀을 쓰므로, 지도가 안 떠도 이 파일은 돌아야 한다.
import { localDateKey, TRIP_TZ, TRIP_FIRST_DAY, TRIP_LAST_DAY } from './schedule.js';

export function tripDays(first = TRIP_FIRST_DAY, last = TRIP_LAST_DAY) {
  const out = [];
  // 정오로 잡아 날짜 더하기가 서머타임 경계에 걸리지 않게 한다.
  for (let d = new Date(first + 'T12:00:00Z'); ; d.setUTCDate(d.getUTCDate() + 1)) {
    const k = d.toISOString().slice(0, 10);
    if (k > last) break;
    out.push(k);
  }
  return out;
}

export function defaultDay(nowUtc, days = tripDays()) {
  const k = localDateKey(nowUtc, TRIP_TZ);
  if (k < days[0]) return days[0];
  if (k > days[days.length - 1]) return days[days.length - 1];
  return k;
}

// 날짜는 일정마다 자기 시간대로 판다. 10/15처럼 옐로나이프 일정과 밴쿠버 도착이
// 섞인 날도 각자 현지 날짜로는 같은 날이다.
export function dayPins(events, dayKey) {
  const list = events
    .filter(e => e.dest && localDateKey(e.startUtc, e.tz) === dayKey)
    .sort((a, b) => (a.startUtc < b.startUtc ? -1 : a.startUtc > b.startUtc ? 1 : 0));
  const pins = [];
  for (const e of list) {
    const item = { title: e.title, startUtc: e.startUtc, tz: e.tz };
    const last = pins[pins.length - 1];
    // 도착 → 체크인처럼 같은 자리에서 이어지는 일정은 핀 하나. 번호가 늘면 동선이 헷갈린다.
    if (last && last.lat === e.dest.lat && last.lng === e.dest.lng) {
      last.events.push(item);
      continue;
    }
    pins.push({
      n: pins.length + 1, name: e.dest.name, mapQuery: e.dest.mapQuery,
      lat: e.dest.lat, lng: e.dest.lng, via: e.dest.via, events: [item],
    });
  }
  return pins;
}

// 숙소는 모든 이동의 거점이다. 그날 핀 앞뒤로 숙소를 붙이고 숙소 핀은 번호 대신 🏠로 표시한다.
// - 아침: 전날 밤 묵은 숙소(checkIn < 오늘 <= checkOut)에서 출발. 첫 핀이 이미 그 숙소면 그대로.
// - 밤: 오늘 밤 묵을 숙소(checkIn <= 오늘 < checkOut)로 돌아온다. 마지막 핀이 이미 그 숙소면 그대로.
//   돌아오는 길은 걸어서로 둔다 — 시내 숙소라 대개 맞고, 아니어도 구글이 길을 바꿔 준다.
// - 같은 좌표의 일정 핀(체크인·체크아웃)도 숙소로 표시한다. 번호는 숙소를 뺀 핀에만 다시 매긴다.
export const LODGING_MARK = '🏠';
const same = (a, b) => a && b && a.lat === b.lat && a.lng === b.lng;

export function withLodging(pins, dayKey, lodgings = []) {
  const morning = lodgings.find(l => l.checkIn < dayKey && dayKey <= l.checkOut);
  const night = lodgings.find(l => l.checkIn <= dayKey && dayKey < l.checkOut);
  // 붙인 숙소 핀은 일정이 없어서 시간대를 옆 핀에서 빌린다(도시 이름 표시에 쓴다).
  const stay = (l, via, label, nb) => ({
    name: l.name, mapQuery: l.mapQuery, lat: l.lat, lng: l.lng, via,
    events: [], note: label, lodging: true, tz: nb.events[0]?.tz ?? nb.tz,
  });
  const out = pins.map(p => ({ ...p, lodging: lodgings.some(l => same(l, p)) }));
  if (out.length && morning && !same(morning, out[0])) out.unshift(stay(morning, undefined, '아침 출발 · 숙소', out[0]));
  if (out.length && night && !same(night, out[out.length - 1])) out.push(stay(night, 'walk', '밤 · 숙소로 돌아오기', out[out.length - 1]));
  let n = 0;
  for (const p of out) p.n = p.lodging ? LODGING_MARK : ++n;
  return out;
}

export function routeKey(a, b, via) {
  return `${a.lat},${a.lng}|${b.lat},${b.lng}|${via}`;
}

// 구간은 같은 날 안에서만 잇는다. 수단은 "이 장소까지 어떻게 왔나"라서 도착 핀 것을 쓴다.
export function daySegments(pins) {
  const segs = [];
  for (let i = 1; i < pins.length; i++) {
    const from = pins[i - 1], to = pins[i];
    segs.push({ from, to, via: to.via, key: routeKey(from, to, to.via) });
  }
  return segs;
}

// 그날 경로를 구글 지도에서 한 번에 연다. 규칙:
// - 핀 순서(시각순) 그대로 잇는다. 같은 자리 연속 일정은 dayPins가 이미 하나로 합쳤다.
// - 비행기 구간에서 끊는다. 밴쿠버→옐로나이프를 한 경로로 넣으면 구글이 수천 km 운전길을 그린다.
//   끊긴 조각마다 링크 하나. 핀이 하나뿐인 조각은 버린다 — 핀 말풍선의 길찾기로 충분하다.
// - 폰 구글 지도 앱은 경유지 9곳까지다. 넘으면 끝점을 이어받아 링크를 나눈다.
//   (모바일 브라우저로 열리면 3곳까지만 받는다는 안내도 있다 — 앱이 깔려 있으면 앱으로 열린다.)
// - 좌표로 넘긴다. mapQuery는 구글이 엉뚱한 곳으로 찾을 수 있어 핀과 어긋난다.
// - 수단: 구간 수단이 모두 같으면 그 수단, 섞이면 비워서 구글 기본값에 맡긴다.
//   대중교통은 경유지를 못 받으므로 두 점짜리일 때만 transit을 넣는다.
export const MAX_WAYPOINTS = 9;
const MODE = { walk: 'walking', transit: 'transit', drive: 'driving' };
const CITY = { 'America/Vancouver': '밴쿠버', 'America/Yellowknife': '옐로나이프' };
const ll = p => `${p.lat},${p.lng}`;

export function routeUrl(points) {
  const legs = [...new Set(points.slice(1).map(p => p.via))];
  let mode = legs.length === 1 ? MODE[legs[0]] : undefined;
  if (mode === 'transit' && points.length > 2) mode = undefined;
  const q = [
    'api=1',
    'origin=' + encodeURIComponent(ll(points[0])),
    'destination=' + encodeURIComponent(ll(points[points.length - 1])),
  ];
  if (points.length > 2) q.push('waypoints=' + encodeURIComponent(points.slice(1, -1).map(ll).join('|')));
  if (mode) q.push('travelmode=' + mode);
  return 'https://www.google.com/maps/dir/?' + q.join('&');
}

export function dayRouteLinks(pins, max = MAX_WAYPOINTS) {
  const groups = [];
  for (const p of pins) {
    if (!groups.length || p.via === 'flight') groups.push([]);
    groups[groups.length - 1].push(p);
  }
  const chunks = [];
  for (const g of groups) {
    for (let i = 0; i < g.length - 1;) {
      const end = Math.min(i + max + 1, g.length - 1);
      chunks.push(g.slice(i, end + 1));
      i = end;
    }
  }
  const tzOf = p => p.events[0]?.tz ?? p.tz;
  const cities = new Set(chunks.map(c => tzOf(c[0])));
  return chunks.map(c => {
    const tags = [];
    if (cities.size > 1) tags.push(CITY[tzOf(c[0])] ?? '');
    if (chunks.length > cities.size) tags.push(`${c[0].n}→${c[c.length - 1].n}번`);
    const tail = tags.filter(Boolean).join(' ');
    return {
      label: '이 날 경로 구글 지도로 열기' + (tail ? ` · ${tail}` : ''),
      url: routeUrl(c), from: c[0].n, to: c[c.length - 1].n,
    };
  });
}
