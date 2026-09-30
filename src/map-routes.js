// 구간 경로를 저장본 → 구글 요청 → 점선 직선 순으로 해결한다.
// 기존 시트·사진 DB와 섞지 않으려고 DB를 따로 쓴다 (photos-store.js와 같은 이유).
const DB = 'canada-trip-map', STORE = 'routes';

export function straight(seg) {
  return [[seg.from.lat, seg.from.lng], [seg.to.lat, seg.to.lng]];
}

// 실패는 저장하지 않는다. 인터넷이 약해서 한 번 실패한 구간이 여행 내내 점선으로 남으면 안 된다.
// 저장소가 깨져도(사생활 모드) 지도는 그려야 하므로 저장소 오류는 삼킨다.
export async function resolveRoute(seg, { cache, fetchRoute }) {
  if (seg.via === 'flight') return { path: straight(seg), exact: false };
  try {
    const hit = await cache.get(seg.key);
    if (hit) return { path: hit, exact: true };
  } catch { /* 저장소 없음 — 받으러 간다 */ }
  try {
    const path = await fetchRoute(seg.from, seg.to, seg.via);
    if (Array.isArray(path) && path.length >= 2) {
      cache.put(seg.key, path).catch(() => {});
      return { path, exact: true };
    }
  } catch (err) {
    // 경로 없음·네트워크 — 아래 점선. API 이름·설정 실수도 여기로 오므로 흔적을 남긴다.
    console.warn('경로 못 받음', seg.key, err);
  }
  return { path: straight(seg), exact: false };
}

function open() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'key' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function tx(mode, fn) {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => res(req?.result);
    t.onerror = () => rej(t.error);
  });
}

export const idbRoutes = {
  get: key => tx('readonly', s => s.get(key)).then(r => r?.path ?? null),
  put: (key, path) => tx('readwrite', s => s.put({ key, path })).then(() => {}),
};
