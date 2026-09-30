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
