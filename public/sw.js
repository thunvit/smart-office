/* SmartOffice – Service Worker
 * Nguyên tắc:
 *  - Vỏ ứng dụng (HTML, CSS, JS, biểu tượng) được lưu đệm để mở nhanh và mở được khi mất mạng.
 *  - Dữ liệu nghiệp vụ (/api/) KHÔNG lưu đệm: luôn lấy trực tiếp từ máy chủ, tránh lộ dữ liệu
 *    giữa các tài khoản dùng chung thiết bị và tránh hiển thị số liệu cũ.
 *  - Đổi VERSION mỗi lần phát hành để trình duyệt nhận bản mới.
 */
const VERSION = 'so-1.11.0';
const SHELL = `${VERSION}-shell`;
const RUNTIME = `${VERSION}-runtime`;
const PRECACHE = [
  '/', '/index.html', '/offline.html', '/app.css', '/app.js', '/hr.js', '/biz.js', '/ext.js', '/work.js', '/work-formula.js', '/xlsx-lite.js', '/work-report.js', '/ai.js', '/pwa.js',
  '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/maskable-512.png',
  '/icons/apple-touch-icon.png', '/icons/favicon-32.png', '/icons/icon.svg'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(PRECACHE.map(u => new Request(u, { cache: 'reload' })))));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k)));
    if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
    await self.clients.claim();
  })());
});

self.addEventListener('message', e => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Dữ liệu nghiệp vụ và tệp tải về: luôn qua mạng.
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) return;

  // Mở trang: ưu tiên mạng, mất mạng thì dùng vỏ đã lưu.
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const pre = await e.preloadResponse;
        if (pre) return pre;
        return await fetch(req);
      } catch (err) {
        const c = await caches.open(SHELL);
        return (await c.match('/index.html')) || (await c.match('/offline.html'));
      }
    })());
    return;
  }

  // Phông chữ Google: lưu đệm lâu dài.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith((async () => {
      const c = await caches.open(RUNTIME);
      const hit = await c.match(req);
      if (hit) return hit;
      try { const res = await fetch(req); if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; }
      catch (err) { return Response.error(); }
    })());
    return;
  }

  // Tệp tĩnh cùng nguồn: trả bản đã lưu ngay, đồng thời cập nhật ngầm.
  if (url.origin === self.location.origin) {
    e.respondWith((async () => {
      const c = await caches.open(SHELL);
      const hit = await c.match(req, { ignoreSearch: true });
      const net = fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => null);
      if (hit) { e.waitUntil(net); return hit; }
      return (await net) || Response.error();
    })());
  }
});
