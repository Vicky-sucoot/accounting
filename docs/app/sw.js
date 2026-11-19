/* 離線快取：App 本身（HTML/CSS/JS/圖示）先存到裝置；匯率 API 不快取 */
const VERSION = 'pocketledger-web-v11';
const SHELL = ['./', './index.html', './app.css', './logic.js', './db.js',
  './js/core.js', './js/ui.js', './js/home.js', './js/reports.js', './js/form.js', './js/detail.js', './js/travel.js', './js/recurring.js', './js/settings.js', './js/backup.js', './js/lock.js', './js/main.js', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  // 先用網路取得最新版（有網路時自動更新），離線時改用快取
  event.respondWith(
    fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('./index.html')))
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type: 'window' }).then(list => list.length ? list[0].focus() : self.clients.openWindow('./')));
});
