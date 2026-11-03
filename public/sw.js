// 앱 설치와 오프라인 대비용 서비스 워커
// 항상 인터넷에서 최신 파일을 먼저 받고, 인터넷이 끊겼을 때만 저장해 둔 파일을 보여줍니다.
// (그래서 새 버전을 배포하면 학생들에게 바로 반영돼요)
const CACHE = 'planner-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Firebase 등 다른 주소로 가는 요청은 건드리지 않음
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    } catch {
      const cached = await caches.match(req);
      if (cached) return cached;
      if (req.mode === 'navigate') return (await caches.match(self.registration.scope)) || Response.error();
      return Response.error();
    }
  })());
});

// 알림을 누르면 열려 있는 플래너 창으로 이동
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (all.length) return all[0].focus();
    return self.clients.openWindow(self.registration.scope);
  })());
});
