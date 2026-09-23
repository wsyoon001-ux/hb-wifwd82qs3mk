const LEAD_MS = 60 * 60 * 1000; // 시작 60분 전부터 '지금'으로 본다

// 마지막 일정이 끝난 뒤 이 시간이 지나면 그 카드를 내린다.
// 여행이 끝났다는 뜻이 아니라 "이 일정은 지났다"는 뜻이다.
// 실제 데이터의 최장 일정은 오로라 투어 4시간(22:00~02:00)이라 살아 있는 일정을 자르지 않는다.
const STALE_MS = 6 * 60 * 60 * 1000;

// 여행 기간은 일정 데이터가 아니라 명시된 창으로 판단한다.
// 안내문에 일정이 3건뿐이어도 10/14에 "여행 끝"이 뜨면 안 되기 때문이다.
// 밴쿠버 현지 날짜 기준, 10/16 하루가 다 지나야 여행이 끝난다.
export const TRIP_TZ = 'America/Vancouver';
export const TRIP_FIRST_DAY = '2026-10-09';
export const TRIP_LAST_DAY = '2026-10-16';

export function localDateKey(utcIso, tz) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  return fmt.format(new Date(utcIso)); // en-CA는 YYYY-MM-DD
}

// 날짜 문자열 비교로 끝낸다 — 서머타임 오프셋 계산이 끼어들 자리가 없다.
export function tripPhase(nowUtc, tz = TRIP_TZ) {
  const k = localDateKey(nowUtc, tz);
  if (k < TRIP_FIRST_DAY) return 'before';
  if (k > TRIP_LAST_DAY) return 'after';
  return 'during';
}

export function daysUntil(nowUtc, firstUtc) {
  const ms = new Date(firstUtc).getTime() - nowUtc.getTime();
  // floor를 쓰는 것이 의도적이다. "D-N"은 온전한 남은 날을 뜻하므로 출발일은 D-0으로 읽어야 한다
  return Math.floor(ms / 86400000);
}

export function pickNow(events, nowUtc) {
  const phase = tripPhase(nowUtc);
  const sorted = [...events].sort((a, b) => a.startUtc < b.startUtc ? -1 : 1);
  const now = nowUtc.getTime();
  const empty = { phase, current: null, next: null, todayRest: [] };

  if (sorted.length === 0) return empty;
  if (phase === 'before') return { ...empty, next: sorted[0] };
  if (phase === 'after') return empty;

  let current = null, next = null;
  for (let i = 0; i < sorted.length; i++) {
    const start = new Date(sorted[i].startUtc).getTime();
    if (now >= start - LEAD_MS) current = sorted[i];
    else { next = sorted[i]; break; }
  }

  // 여행 중이지만 마지막 일정도 한참 지난 경우. 지난 카드를 계속 띄우면
  // 이틀 전 오로라 픽업이 '지금'인 것처럼 보인다 — 차라리 비운다.
  if (current && !next && now > new Date(current.startUtc).getTime() + STALE_MS) current = null;
  if (!current && !next) return empty;

  const anchor = current ?? next;
  const dayKey = localDateKey(anchor.startUtc, anchor.tz);
  const todayRest = sorted.filter(e =>
    localDateKey(e.startUtc, e.tz) === dayKey &&
    new Date(e.startUtc).getTime() > now
  );

  return { phase, current, next, todayRest };
}
