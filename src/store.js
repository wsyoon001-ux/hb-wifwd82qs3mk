import { parseSheet, sumBy } from './sheet.js';
import { SNAPSHOT_CSV, SNAPSHOT_AT } from '../data/snapshot.js';

const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1ITA7TdoTdaeSoRT8BOfFiIAytdAib59MOjg3-2aHZN4/export?format=csv&gid=1278929142';
const DB = 'canada-trip', STORE = 'kv', KEY = 'sheet';

function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function idbGet(key) {
  const db = await idb();
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
    t.onsuccess = () => res(t.result ?? null);
    t.onerror = () => rej(t.error);
  });
}

async function idbSet(key, val) {
  const db = await idb();
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, 'readwrite').objectStore(STORE).put(val, key);
    t.onsuccess = () => res();
    t.onerror = () => rej(t.error);
  });
}

// 내장 스냅샷의 합계. 파싱 결과가 "그 시트"인지 재는 자다.
// 모듈 로드마다 한 번만 계산한다(스냅샷은 빌드 타임 상수라 변하지 않는다).
let SNAP = null;
export function snapshotTotals() {
  if (!SNAP) {
    const rows = parseSheet(SNAPSHOT_CSV);
    SNAP = { rows: rows.length, krw: sumBy(rows, 'krw'), cad: sumBy(rows, 'cadTotal') };
  }
  return SNAP;
}

// 합계가 스냅샷의 몇 배까지 벌어져도 정상으로 볼 것인가.
//
// 이 가드가 잡아야 하는 건 "자릿수가 통째로 바뀐 경우"다. F열 앞에 열 하나가 끼면
// krw 칸이 CAD 합계를 읽어 4,953,126원이 3,550원이 된다 — 1/1400배. 반대로 KRW 칸이
// CAD 칸으로 밀리면 수천 배가 된다. 어느 쪽이든 0.3~3배 밖이다.
//
// 반대로 잡으면 안 되는 건 부부가 여행 중에 늘 하는 편집이다. 행을 몇 개 지우거나
// 항공권(144만원짜리 두 줄)을 빼도 총액은 반토막 언저리까지가 한계고, 옐로나이프에서
// 지출을 두 배로 늘려 잡아도 3배는 안 된다. 0.3~3배는 "정상 편집은 다 통과, 열 밀림은
// 다 차단"이 겹치지 않는 넓은 골짜기 안에 있다.
const LO = 0.3, HI = 3;

function outOfBand(actual, base) {
  if (!(base > 0)) return false;   // 기준이 없으면 잴 수 없다 — 통과시킨다
  return actual < base * LO || actual > base * HI;
}

// 파싱된 행들이 실제 시트 데이터인지 확인한다.
// HTML 서명 페이지, 그리고 열이 밀려 값이 엉뚱한 칸에서 읽힌 결과로부터 캐시를 보호한다.
export function checkRows(rows) {
  const priced = rows.filter(r => r.krw != null || r.cadTotal != null).length;
  const krw = sumBy(rows, 'krw');
  const cad = sumBy(rows, 'cadTotal');
  const snap = snapshotTotals();

  if (rows.length < 10) return { ok: false, reason: `행이 ${rows.length}개뿐` };
  if (priced < 5) return { ok: false, reason: `금액 있는 행이 ${priced}개뿐` };
  if (krw <= 0) return { ok: false, reason: '원화 합계가 0' };
  if (outOfBand(krw, snap.krw))
    return { ok: false, reason: `원화 합계가 내장본과 너무 다름 (${Math.round(krw).toLocaleString('ko-KR')}원 vs ${Math.round(snap.krw).toLocaleString('ko-KR')}원)` };
  if (outOfBand(cad, snap.cad))
    return { ok: false, reason: `CAD 합계가 내장본과 너무 다름 (${cad.toFixed(2)} vs ${snap.cad.toFixed(2)})` };
  return { ok: true, reason: '' };
}

export function looksLikeSheet(rows) {
  return checkRows(rows).ok;
}

// 첫 렌더용. 절대 네트워크를 기다리지 않는다.
export async function loadRows() {
  try {
    const c = await idbGet(KEY);
    if (c?.csv) return { rows: parseSheet(c.csv), updatedAt: c.at, source: 'cache' };
  } catch { /* IndexedDB 접근 실패 시 스냅샷으로 내려간다 */ }
  return { rows: parseSheet(SNAPSHOT_CSV), updatedAt: SNAPSHOT_AT, source: 'snapshot' };
}

// 백그라운드 갱신. 실패는 정상 경로다.
export async function refreshRows() {
  try {
    const res = await fetch(SHEET_URL, { cache: 'no-store' });
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('text/csv')) return { ok: false, reason: `CSV가 아님 (${ct})` };
    const csv = await res.text();
    const rows = parseSheet(csv);
    const check = checkRows(rows);
    // 거부하면 여기서 끝난다 — idbSet을 안 하므로 직전 캐시본과 그 갱신 시각은 그대로다.
    if (!check.ok) return { ok: false, reason: `시트 모양이 이상함 — ${check.reason}` };
    const at = new Date().toISOString();
    await idbSet(KEY, { csv, at });
    return { ok: true, rows, updatedAt: at };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}
