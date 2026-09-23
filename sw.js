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

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // 시트는 캐시하지 않는다. store.js가 IndexedDB로 따로 관리한다.
  if (url.hostname === 'docs.google.com') return;
  if (e.request.method !== 'GET') return;

  // stale-while-revalidate: 캐시가 있으면 즉시 그걸 주고, 네트워크 응답은
  // 백그라운드에서 받아 캐시를 갱신한다. 그러면 sw.js 자체를 안 건드리고
  // app.js나 data/guide.js만 바뀌어도 다음 오픈 때 새 버전이 반영된다.
  e.respondWith((async () => {
    const cached = await caches.match(e.request);
    const fetching = fetch(e.request).then(async res => {
      if (res.ok && url.origin === location.origin) {
        const copy = res.clone();
        const c = await caches.open(CACHE);
        await c.put(e.request, copy);
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
