import { GUIDE_BUILT } from '../data/guide.js';

const enc = new TextEncoder();

export function escapeIcsText(s) {
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

// RFC 5545: 한 줄 75옥텟. 이어지는 줄은 공백 한 칸으로 시작.
export function foldLine(line) {
  const out = [];
  let cur = '', bytes = 0;
  for (const ch of line) {                 // 코드포인트 단위 — 한글 안 깨짐
    const b = enc.encode(ch).length;
    const limit = out.length === 0 ? 75 : 74; // 이어지는 줄은 선행 공백 1바이트
    if (bytes + b > limit) { out.push(cur); cur = ''; bytes = 0; }
    cur += ch; bytes += b;
  }
  out.push(cur);
  return out.map((l, i) => (i === 0 ? l : ' ' + l)).join('\r\n');
}

function stamp(d) {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function description(e, built) {
  const parts = [];
  // 첫 줄은 이 파일이 몇 판인지, 그리고 둘이 갈릴 때 뭘 믿어야 하는지 말한다.
  // 캘린더는 한 번 넣으면 손이 안 가지만 앱은 시트를 따라 갱신되기 때문이다.
  parts.push(`[안내문 ${built}판] 시각·금액이 앱과 다르면 앱이 맞습니다`);
  if (e.timeMark === '?') parts.push('※ 이 시각은 미확정입니다 — 업체 확인 후 다시 받으세요');
  parts.push('');
  for (const l of e.lines) {
    parts.push((l.mark ? l.mark + ' ' : '') + l.text);
    if (l.sub) parts.push('   ' + l.sub);
  }
  if (e.dest) {
    parts.push('');
    parts.push('▸ ' + e.dest.name);
    parts.push('  ' + e.dest.address);
  }
  if (e.refs?.length) {
    parts.push('');
    for (const r of e.refs) parts.push('▸ ' + r.label + ': ' + r.value);
  }
  return parts.join('\n');
}

// 같은 UID로 다시 만든 파일이 먼저 넣은 일정을 덮어쓰려면 SEQUENCE가 커져야 한다.
// 일정 내용이 바뀌면 그 이벤트의 rev를 올린다(기본 0).
export function buildIcs(events, opts = {}) {
  const prodId = opts.prodId ?? '-//canada-2026//travel companion//KO';
  const built = opts.built ?? GUIDE_BUILT;                 // YYYY-MM-DD
  const lastMod = built.replace(/-/g, '') + 'T000000Z';    // 판이 바뀔 때만 움직인다
  // DTSTAMP도 판 날짜로 고정한다. 빌드 시각을 넣으면 내용이 같아도 파일이 매번 달라져
  // 커밋에 잡음이 끼고, 폰이 받은 파일이 정말 바뀐 건지 구분할 수 없다.
  const now = opts.dtstamp ?? lastMod;
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:${prodId}`,
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(`캐나다 2026 (안내문 ${built}판)`)}`,
  ];
  for (const e of events.filter(x => x.alarm)) {
    const startMs = new Date(e.startUtc).getTime();
    const start = stamp(new Date(startMs));
    const end = stamp(new Date(startMs + (e.durationMinutes ?? 30) * 60000));
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.id}@canada-2026`,
      `DTSTAMP:${now}`,
      `SEQUENCE:${e.rev ?? 0}`,
      `LAST-MODIFIED:${lastMod}`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
      `SUMMARY:${escapeIcsText(e.timeMark === '?' ? `${e.title} (시각 미정)` : e.title)}`,
      `LOCATION:${escapeIcsText(e.dest ? `${e.dest.name}, ${e.dest.address}` : e.place)}`,
      `DESCRIPTION:${escapeIcsText(description(e, built))}`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeIcsText(e.title)}`,
      `TRIGGER:-PT${e.alarmMinutesBefore}M`,
      'END:VALARM',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
