// 구글 지도 스크립트를 한 번만 붙인다. 지도 탭과 편집 화면(장소 검색)이 같이 쓴다.
const LOAD_TIMEOUT_MS = 15000;

// 스크립트는 처음 필요할 때만 붙인다. 지도를 안 보는 날까지 구글에 요청할 이유가 없다.
// 시간 초과로 포기해도 스크립트는 남겨 둔다 — 다시 시도할 때 두 번 붙이면 구글이 경고하고 오작동한다.
// 받기 자체가 실패(onerror)한 경우에만 떼어 내서 다음 시도가 새로 붙이게 한다.
let script = null;
export function loadMaps(key) {
  if (window.google?.maps?.importLibrary) return Promise.resolve();
  if (!key) return Promise.reject(new Error('키 없음'));
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('시간 초과')), LOAD_TIMEOUT_MS);
    window.__mapsReady = () => { clearTimeout(t); res(); };
    if (script) return;
    script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async&callback=__mapsReady`;
    script.async = true;
    script.onerror = () => { clearTimeout(t); script.remove(); script = null; rej(new Error('스크립트 못 받음')); };
    document.head.append(script);
  });
}
