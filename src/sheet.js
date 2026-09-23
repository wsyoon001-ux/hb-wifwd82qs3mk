// 시트 열 인덱스. 헤더 텍스트는 사용자가 자주 바꾸므로 믿지 않는다.
const COL = {
  category: 0, detail: 1, date: 2, weekday: 3, region: 4,
  cadBase: 5, cadExtra: 6, cadTotal: 7, krw: 8,
  payment: 9, cashCad: 10, note: 11,
};
const FIRST_DATA_ROW = 2; // 0-indexed. 0행=합계, 1행=헤더

export function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', inQuotes = false;
  const s = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { cell += '"'; i++; }
        else inQuotes = false;
      } else cell += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(cell); cell = '';
    } else if (c === '\n') {
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

function num(v) {
  const t = String(v ?? '').replace(/,/g, '').trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function str(v) {
  return String(v ?? '').trim();
}

export function parseSheet(text) {
  const grid = parseCsv(text);
  const out = [];
  for (let i = FIRST_DATA_ROW; i < grid.length; i++) {
    const r = grid[i];
    if (!r) continue;
    const category = str(r[COL.category]);
    const detail = str(r[COL.detail]);
    if (!category && !detail) continue; // 빈 행
    out.push({
      category,
      detail,
      date: str(r[COL.date]),
      weekday: str(r[COL.weekday]),
      region: str(r[COL.region]),
      cadBase: num(r[COL.cadBase]),
      cadExtra: num(r[COL.cadExtra]),
      cadTotal: num(r[COL.cadTotal]),
      krw: num(r[COL.krw]),
      payment: str(r[COL.payment]),
      cashCad: num(r[COL.cashCad]),
      note: str(r[COL.note]),
    });
  }
  return out;
}

export function sumBy(rows, key) {
  return rows.reduce((a, r) => a + (r[key] ?? 0), 0);
}
