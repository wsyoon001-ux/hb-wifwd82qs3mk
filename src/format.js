const KO_DOW = ['일', '월', '화', '수', '목', '금', '토'];

export function fmtTime(utcIso, tz) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(utcIso));
}

export function fmtDateKo(utcIso, tz) {
  const d = new Date(utcIso);
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  }).formatToParts(d);
  const get = t => p.find(x => x.type === t).value;
  const dowIdx = new Date(`${get('year')}-${get('month')}-${get('day')}T12:00:00Z`).getUTCDay();
  return `${get('month')}/${get('day')} (${KO_DOW[dowIdx]})`;
}

export function fmtCad(n) {
  return 'CA$' + Number(n).toLocaleString('en-CA', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}

export function fmtKrw(n) {
  return Math.round(Number(n)).toLocaleString('ko-KR') + '원';
}
