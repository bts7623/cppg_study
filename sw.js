// CPPG 스터디 service worker — 앱 셸은 미리 캐시, 폰트는 런타임 캐시
const VERSION = 'cppg-v15';
const SHELL = ['/', '/index.html', '/map', '/map.html', '/law', '/law.html', '/quiz', '/quiz.html', '/memo', '/memo.html', '/guide', '/guide.html',
  '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/maskable-512.png', '/icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => Promise.allSettled(SHELL.map(u => c.add(u)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.pathname.startsWith('/api/')) return; // 동기화 API는 캐시 안 함
  // 같은 출처 페이지·정적 파일: 네트워크 우선, 실패 시 캐시 (항상 최신본 보되 오프라인에서도 열림)
  if (url.origin === location.origin) {
    e.respondWith(fetch(req).then(res => { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); return res; })
      .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('/index.html'))));
    return;
  }
  // Google Fonts: 캐시 우선
  if (url.hostname.endsWith('googleapis.com') || url.hostname.endsWith('gstatic.com')) {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => { const copy = res.clone(); caches.open(VERSION + '-fonts').then(c => c.put(req, copy)); return res; }).catch(() => r)));
  }
});
