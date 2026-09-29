// 폰에 저장한 사진과 서버 목록을 맞춘다. 기존 시트 캐시(canada-trip)와 섞지 않으려고
// DB를 따로 쓴다 — 같은 DB에 저장소를 추가하려면 버전을 올려야 하고, 그러면 시트 캐시 코드까지 건드린다.
const DB = 'canada-trip-photos', STORE = 'photos';

export function diffPhotos(localIds, remote) {
  const have = new Set(localIds);
  const want = new Set(remote.map(p => p.id));
  return {
    fetch: remote.filter(p => !have.has(p.id)),
    drop: localIds.filter(id => !want.has(id)),
  };
}

export function sortNewest(photos) {
  return [...photos].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}

export function b64ToBlob(data, mime) {
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function open() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
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

export const idbLocal = {
  all: () => tx('readonly', s => s.getAll()).then(r => r ?? []),
  put: photo => tx('readwrite', s => s.put(photo)).then(() => {}),
  del: id => tx('readwrite', s => s.delete(id)).then(() => {}),
};

// list가 실패하면 그대로 던진다 — 이때 폰 사진을 지우면 오프라인에서 사진첩이 텅 빈다.
// 받기는 한 장씩: 폰 메모리와 Apps Script 동시 실행 한도 때문이다. 중간에 끊겨도 이미 받은 건 남는다.
// 폰 목록은 서버 목록보다 먼저 읽는다. 반대로 하면 list를 기다리는 사이 이 폰에서 올린 사진이
// "폰에만 있음 = 서버에서 지워짐"으로 보여 지워진다.
export async function syncPhotos(api, local, onChange = () => {}) {
  const mine = await local.all();
  const remote = await api.list();
  const { fetch, drop } = diffPhotos(mine.map(p => p.id), remote);
  for (const id of drop) await local.del(id);
  if (drop.length) onChange();
  for (const m of fetch) {
    let got;
    try {
      got = await api.get(m.id);
    } catch (e) {
      if (e?.code === 'notfound') continue;   // 목록 받은 뒤 상대가 지운 사진
      throw e;
    }
    await local.put({ id: m.id, name: m.name, createdAt: m.createdAt, blob: b64ToBlob(got.data, got.mime) });
    onChange();
  }
}
