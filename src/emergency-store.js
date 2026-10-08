// 비상 정보 중 이 폰에만 두는 칸. localStorage 한 키에 JSON으로 둔다.
// 서버(일정·사진)로는 절대 보내지 않는다.
export const EMERGENCY_KEY = 'canada-2026-emergency';

export const FIELDS = [
  { key: 'passA', label: '윤웅상 여권번호' },
  { key: 'etaA', label: '윤웅상 eTA' },
  { key: 'passB', label: '이채민 여권번호' },
  { key: 'etaB', label: '이채민 eTA' },
  { key: 'home', label: '집 주소 (영문)', multi: true },
  { key: 'pnr', label: '에어캐나다 예약번호 (PNR)' },
  { key: 'airbnb', label: '에어비앤비 확인 코드' },
  { key: 'radisson', label: 'Radisson 아고다 예약번호' },
];

// 아는 칸만, 문자열만, 앞뒤 공백 뺀 채로. 모르는 키·이상한 값은 버린다.
export function cleanFields(obj) {
  const out = {};
  if (!obj || typeof obj !== 'object') return out;
  for (const { key } of FIELDS) {
    const v = obj[key];
    if (typeof v === 'string' && v.trim()) out[key] = v.trim();
  }
  return out;
}

// 입력값으로 덮되, 빈 칸으로 보낸 것은 지운 것으로 본다.
export function mergeFields(saved, input) {
  const next = { ...cleanFields(saved) };
  for (const { key } of FIELDS) {
    if (!(key in (input ?? {}))) continue;
    const v = typeof input[key] === 'string' ? input[key].trim() : '';
    if (v) next[key] = v; else delete next[key];
  }
  return next;
}

export function loadFields(storage) {
  try { return cleanFields(JSON.parse(storage.getItem(EMERGENCY_KEY) ?? 'null')); } catch { return {}; }
}

// 저장 실패(사생활 모드·꽉 참)는 false. 화면이 그 사실을 말해야 한다.
export function saveFields(storage, fields) {
  try { storage.setItem(EMERGENCY_KEY, JSON.stringify(cleanFields(fields))); return true; } catch { return false; }
}

export const hasAny = fields => FIELDS.some(f => fields[f.key]);
