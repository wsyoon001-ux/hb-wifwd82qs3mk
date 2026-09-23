const TZS = new Set(['America/Vancouver', 'America/Yellowknife']);

// 설계서 6-1: 확신 표시는 문장마다 단다. 빈 마크는 허용하지 않는다 —
// "추수감사절이라 휴무" 같은 사실 문장이 표시 없이 섞여 들어가는 걸 막는 유일한 방법이
// '모든 줄에 마크'다. 순수 지시문("입국심사 → 수하물 찾기")도 확실하면 ✓를 단다.
export const MARKS = new Set(['✓', '?']);

// 시각 자체가 미확정인 일정(예: Cameron Falls 픽업)을 표시하는 마크.
export const TIME_MARKS = new Set(['✓', '?']);

export function validateLines(lines, at) {
  const errs = [];
  if (!Array.isArray(lines) || lines.length === 0) {
    errs.push(`${at}: lines 비어 있음`);
    return errs;
  }
  lines.forEach((l, j) => {
    if (!MARKS.has(l.mark))
      errs.push(`${at} line ${j}: mark는 ✓ 또는 ?여야 함 (받은 값: ${JSON.stringify(l.mark)}) — ${l.text ?? ''}`);
    if (!l.text) errs.push(`${at} line ${j}: text 없음`);
    if (l.sub !== undefined && (typeof l.sub !== 'string' || !l.sub))
      errs.push(`${at} line ${j}: sub 오류`);
  });
  return errs;
}

// guide.js의 이벤트 밖 상수(BEFORE_TRIP_LINE 같은 것)도 같은 규칙으로 검사한다.
export function validateStandaloneLines(named) {
  const errs = [];
  for (const [label, line] of Object.entries(named)) {
    errs.push(...validateLines([line], label));
  }
  return errs;
}

export function validateEvents(events) {
  const errs = [];
  const seen = new Set();
  events.forEach((e, i) => {
    const at = `[${i}] ${e.id ?? '(id 없음)'}`;
    if (!e.id) errs.push(`${at}: id 없음`);
    else if (seen.has(e.id)) errs.push(`${at}: id 중복`);
    else seen.add(e.id);

    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(e.startUtc ?? ''))
      errs.push(`${at}: startUtc 형식 오류 (${e.startUtc})`);
    if (!TZS.has(e.tz)) errs.push(`${at}: tz 값 오류 (${e.tz})`);
    if (e.timeMark !== undefined && !TIME_MARKS.has(e.timeMark))
      errs.push(`${at}: timeMark는 ✓ 또는 ?여야 함 (${e.timeMark})`);
    if (e.durationMinutes !== undefined &&
        (!Number.isInteger(e.durationMinutes) || e.durationMinutes <= 0))
      errs.push(`${at}: durationMinutes는 양의 정수여야 함 (${e.durationMinutes})`);
    if (e.rev !== undefined && (!Number.isInteger(e.rev) || e.rev < 0))
      errs.push(`${at}: rev는 0 이상의 정수여야 함 (${e.rev})`);
    if (!e.title) errs.push(`${at}: title 없음`);
    if (typeof e.place !== 'string' || !e.place) errs.push(`${at}: place 없음`);
    if (e.dest === null) {
      // dest가 null이면 OK
    } else if (typeof e.dest !== 'object' || e.dest === null) {
      errs.push(`${at}: dest는 객체거나 null이어야 함`);
    } else {
      if (typeof e.dest.name !== 'string' || !e.dest.name) errs.push(`${at}: dest.name 없음`);
      if (typeof e.dest.address !== 'string' || !e.dest.address) errs.push(`${at}: dest.address 없음`);
      if (typeof e.dest.mapQuery !== 'string' || !e.dest.mapQuery) errs.push(`${at}: dest.mapQuery 없음`);
    }
    if (!Array.isArray(e.refs)) errs.push(`${at}: refs 배열 아님`);
    else e.refs.forEach((r, j) => {
      if (typeof r.label !== 'string' || !r.label) errs.push(`${at} ref ${j}: label 없음`);
      if (typeof r.value !== 'string' || !r.value) errs.push(`${at} ref ${j}: value 없음`);
      if (r.tel !== undefined && (typeof r.tel !== 'string' || !r.tel)) errs.push(`${at} ref ${j}: tel 오류`);
    });
    if (typeof e.alarm !== 'boolean') errs.push(`${at}: alarm 불리언 아님`);
    if (e.alarm && !Number.isInteger(e.alarmMinutesBefore))
      errs.push(`${at}: alarmMinutesBefore 정수 아님`);
    errs.push(...validateLines(e.lines, at));
  });
  return errs;
}
