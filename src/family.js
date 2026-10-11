// 가족 공유 링크: index.html#family=<사진 암호>. 열면 '가족 보기'로 바뀐다 —
// 돈 탭, 사진 올리기·지우기, 일정 수정이 숨는다. 암호는 코드가 아니라 링크에만 있다
// (배포 저장소가 공개라서). 귀국 후 사진 암호를 바꾸면 나간 링크는 전부 막힌다.
export const FAMILY_KEY = 'family-mode';

export function familyPassFromHash(hash) {
  const m = /(?:^#|&)family=([^&]+)/.exec(hash ?? '');
  if (!m) return null;
  try { return decodeURIComponent(m[1]).trim() || null; } catch { return null; }
}

export function familyLink(base, pass) {
  return `${String(base).split('#')[0]}#family=${encodeURIComponent(pass)}`;
}

// 돈 탭은 우리 둘 폰에서만: 가족 보기가 아니고, 사진 암호가 이 폰에 들어 있을 때.
// 암호 조건이 있는 이유 — 가족이 링크 없이 홈 화면 앱으로 열면 가족 표시가 없는 새 저장소로 뜬다.
export function showMoney({ family, pass }) {
  return !family && !!pass;
}
