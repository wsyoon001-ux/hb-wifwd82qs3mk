const CACHE = 'canada-2026-v1';
const SHELL = [
  './', './index.html', './app.js',
  './src/sheet.js', './src/schedule.js', './src/render.js',
  './src/format.js', './src/store.js', './src/ics.js', './src/guide-schema.js',
  './data/guide.js', './data/snapshot.js',
  './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      // .ics는 껍데기가 아니라 덤이다. 없거나 못 받아도 앱은 떠야 하므로 따로, 실패해도 그만.
      .then(c => c.addAll(SHELL).then(() => c.add('./canada-2026.ics').catch(() => {})))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// SHELL 목록을 절대 URL로 미리 펼쳐둔다. 껍데기 파일이 실제로 바뀐 경우에만
// "새 버전 도착"을 알려야 한다 — 시트(docs.google.com)나 그 외 요청은 대상이 아니다.
const SHELL_URLS = new Set(SHELL.map(p => new URL(p, self.registration.scope).href));

// 새 버전이 감지됐다는 사실을 남겨 두는 자리. 실제 네트워크 요청은 절대 안 가는
// 가짜 URL이라 fetch 핸들러와 충돌하지 않는다. index.html이 이 값을 읽고 지운다.
const UPDATE_FLAG = './__update-flag__';

function buffersEqual(a, b) {
  if (a.byteLength !== b.byteLength) return false;
  const va = new Uint8Array(a), vb = new Uint8Array(b);
  for (let i = 0; i < va.length; i++) if (va[i] !== vb[i]) return false;
  return true;
}

// postMessage는 "지금 열려 있는 페이지"에게만 통한다. 그런데 이 페이지 자신의
// 모듈 그래프 로딩(= data/guide.js를 import하는 그 fetch)이 이미 백그라운드
// 갱신을 진행 중이라, 그 알림이 이 문서의 어떤 스크립트보다도 먼저 도착할 수
// 있다(브라우저 프리로드 스캐너는 문서 순서와 무관하게 모듈과 그 import를
// 미리 fetch한다). 그래서 캐시에 플래그를 남겨 둔다 — 이건 "누가 지금 듣고
// 있냐"와 무관하게, 다음에 확인하는 쪽이 언제든 집어갈 수 있다.
async function notifyUpdate(cache) {
  await cache.put(UPDATE_FLAG, new Response('1'));
  const clients = await self.clients.matchAll({ type: 'window' });
  for (const c of clients) c.postMessage({ type: 'sw-update' });
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // 시트는 캐시하지 않는다. store.js가 IndexedDB로 따로 관리한다.
  if (url.hostname === 'docs.google.com') return;
  if (e.request.method !== 'GET') return;

  const isShell = SHELL_URLS.has(url.href);

  // stale-while-revalidate: 캐시가 있으면 즉시 그걸 주고, 네트워크 응답은
  // 백그라운드에서 받아 캐시를 갱신한다. 그러면 sw.js 자체를 안 건드리고
  // app.js나 data/guide.js만 바뀌어도 다음 오픈 때 새 버전이 반영된다.
  e.respondWith((async () => {
    const cached = await caches.match(e.request);
    // 브라우저가 cached 응답 스트림을 곧장 읽어가므로(아래에서 그대로 return),
    // 나중에 .then() 안에서 clone()하면 "body already used"로 실패할 수 있다.
    // 비교용 복제는 반드시 여기, 아직 아무도 안 읽었을 때 떠 둔다.
    const cachedForDiff = (cached && isShell) ? cached.clone() : null;
    const fetching = fetch(e.request).then(async res => {
      if (res.ok && url.origin === location.origin) {
        const copy = res.clone();
        // 비교용 복제는 c.put() 전에 떠 둔다. Cache.put()은 넘겨받은 응답의
        // body 스트림을 직접 읽어 소비하므로, put 뒤에 copy.clone()을 하면
        // "body already used"로 조용히 실패한다(마찬가지로 cachedForDiff도
        // 위에서 cached를 그대로 반환하기 전에 미리 복제해 뒀다).
        const copyForDiff = cachedForDiff ? copy.clone() : null;
        const c = await caches.open(CACHE);
        await c.put(e.request, copy);
        // 껍데기 파일이고 예전 캐시가 있었으면, 바이트를 비교해서
        // 진짜로 내용이 바뀐 경우에만 페이지에 알린다. 바이트가 같으면
        // 매 오픈마다 배너가 뜨는 "양치기 소년"이 된다.
        if (cachedForDiff) {
          try {
            const [oldBuf, newBuf] = await Promise.all([
              cachedForDiff.arrayBuffer(),
              copyForDiff.arrayBuffer(),
            ]);
            if (!buffersEqual(oldBuf, newBuf)) await notifyUpdate(c);
          } catch { /* 비교 실패해도 캐시 갱신 자체는 이미 끝났다 */ }
        }
      }
      return res;
    }).catch(() => null);

    if (cached) {
      // 응답은 캐시로 즉시 끝내지만, 백그라운드 갱신이 끝나기 전에
      // 워커가 종료되지 않도록 fetch 이벤트 수명을 붙잡아 둔다.
      e.waitUntil(fetching);
      return cached;
    }
    const fresh = await fetching;
    if (fresh) return fresh;
    return e.request.mode === 'navigate'
      ? (await caches.match('./index.html')) ?? Response.error()
      : Response.error();
  })());
});
