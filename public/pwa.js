/* SmartOffice — lớp ứng dụng web cài đặt được (PWA)
 *  1. Đăng ký Service Worker, báo khi có bản mới.
 *  2. Nút "Cài ứng dụng lên thiết bị" (Android, Windows, macOS: lời nhắc của trình duyệt; iPhone/iPad: hướng dẫn).
 *  3. Thanh báo mất kết nối mạng, tự tải lại dữ liệu khi có mạng trở lại.
 */
(function () {
'use strict';
const SO = window.SO;
if (!SO) return;
const { $, toast, openModal, closeModal, ACTIONS } = SO;

const standalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
let deferred = null;

/* ---------- 1. Service Worker ---------- */
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      const offer = w => {
        if (!w || !navigator.serviceWorker.controller) return;
        showBar('update', 'Đã có phiên bản SmartOffice mới.', 'Cập nhật', () => w.postMessage('SKIP_WAITING'));
      };
      if (reg.waiting) offer(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w && w.addEventListener('statechange', () => { if (w.state === 'installed') offer(w); });
      });
      let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloading) return; reloading = true; location.reload(); });
      setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
    } catch (e) { console.warn('Không đăng ký được Service Worker:', e); }
  });
}

/* ---------- Thanh thông báo dưới màn hình ---------- */
function showBar(id, text, label, fn) {
  let bar = document.getElementById('pwa-bar-' + id);
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'pwa-bar-' + id;
    bar.className = 'pwa-bar' + (id === 'offline' ? ' warn' : '');
    bar.setAttribute('role', 'status');
    document.body.appendChild(bar);
  }
  bar.innerHTML = `<span>${SO.esc(text)}</span>` + (label ? `<button type="button" class="btn sm primary">${SO.esc(label)}</button>` : '') + `<button type="button" class="pwa-x" aria-label="Đóng">×</button>`;
  if (label) bar.querySelector('.btn').onclick = () => { fn(); bar.remove(); };
  bar.querySelector('.pwa-x').onclick = () => bar.remove();
}
const hideBar = id => { const b = document.getElementById('pwa-bar-' + id); if (b) b.remove(); };

/* ---------- 2. Cài đặt ứng dụng ---------- */
function syncInstallItem() {
  const can = !standalone() && (deferred || isIOS);
  document.querySelectorAll('.install-item').forEach(b => { b.hidden = !can; });
}
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferred = e;
  syncInstallItem();
  // Gợi ý một lần trên điện thoại, không làm phiền lại trong 30 ngày nếu đã đóng.
  let last = 0; try { last = Number(localStorage.getItem('so-install-dismiss') || 0); } catch (x) {}
  if (window.matchMedia('(max-width: 760px)').matches && Date.now() - last > 30 * 864e5 && SO.B) {
    showBar('install', 'Cài SmartOffice lên màn hình chính để mở nhanh như ứng dụng.', 'Cài đặt', () => ACTIONS['install-app']());
    const x = document.querySelector('#pwa-bar-install .pwa-x');
    if (x) x.addEventListener('click', () => { try { localStorage.setItem('so-install-dismiss', String(Date.now())); } catch (y) {} });
  }
});
window.addEventListener('appinstalled', () => { deferred = null; syncInstallItem(); hideBar('install'); toast('Đã cài SmartOffice lên thiết bị.'); });

ACTIONS['install-app'] = async () => {
  document.querySelectorAll('.dd.open').forEach(d => d.classList.remove('open'));
  if (deferred) {
    deferred.prompt();
    const r = await deferred.userChoice.catch(() => ({}));
    if (r && r.outcome === 'accepted') hideBar('install');
    deferred = null; syncInstallItem();
    return;
  }
  if (isIOS) {
    openModal(`<div class="modal-h"><h2>Cài SmartOffice trên iPhone, iPad</h2><button class="x" data-act="close" aria-label="Đóng">×</button></div>
      <div class="modal-b"><ol class="pwa-steps">
        <li>Mở SmartOffice bằng trình duyệt <b>Safari</b>.</li>
        <li>Chạm nút <b>Chia sẻ</b> (hình vuông có mũi tên lên) ở thanh công cụ.</li>
        <li>Chọn <b>Thêm vào MH chính</b>, sau đó chạm <b>Thêm</b>.</li>
        <li>Mở SmartOffice từ biểu tượng mới trên màn hình chính.</li>
      </ol></div>
      <div class="modal-f"><button class="btn primary" data-act="close">Đã hiểu</button></div>`);
  }
};
new MutationObserver(syncInstallItem).observe(document.getElementById('root'), { childList: true });

/* ---------- 3. Trạng thái mạng ---------- */
window.addEventListener('offline', () => showBar('offline', 'Mất kết nối mạng. Các thao tác lưu sẽ không thực hiện được cho tới khi có mạng trở lại.'));
window.addEventListener('online', () => {
  hideBar('offline');
  if (document.querySelector('.offline-screen')) SO.boot();
  else if (SO.B) { SO.refreshBoot(); toast('Đã kết nối mạng trở lại.'); }
});
if (navigator.onLine === false) window.addEventListener('DOMContentLoaded', () => showBar('offline', 'Mất kết nối mạng. Các thao tác lưu sẽ không thực hiện được cho tới khi có mạng trở lại.'));
})();
