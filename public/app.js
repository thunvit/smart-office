/* SmartOffice — ứng dụng web phía người dùng */
(function () {
'use strict';

/* ================= Tiện ích ================= */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const TODAY = () => iso(new Date());
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return iso(d); };
const dayNum = s => Math.round(Date.parse(String(s).slice(0, 10) + 'T00:00:00Z') / 864e5);
const fmtD = s => s ? String(s).slice(0, 10).split('-').reverse().join('/') : '—';
const fmtDT = s => { if (!s) return ''; const [d, t] = String(s).split(' '); return (t ? t.slice(0, 5) + ' · ' : '') + fmtD(d); };
const vnd = n => (Number(n) || 0).toLocaleString('vi-VN') + ' ₫';
const numFmt = n => (Number(n) || 0).toLocaleString('vi-VN', { maximumFractionDigits: 2 });
const WD = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

const TSTATUS = { todo: 'Cần làm', doing: 'Đang làm', review: 'Chờ kiểm tra', done: 'Hoàn thành' };
const PRIO = { cao: 'Cao', tb: 'Trung bình', thap: 'Thấp' };
const RTYPE = { thanhtoan: 'Đề nghị thanh toán', mua: 'Đề xuất mua sắm', tamung: 'Đề nghị tạm ứng', nghiphep: 'Đơn xin nghỉ phép', tangca: 'Đăng ký làm thêm giờ', congtac: 'Đề nghị đi công tác', giaitrinh: 'Giải trình chấm công', khac: 'Tờ trình khác' };
const RANGE_T = ['nghiphep', 'congtac'], DAY_T = ['tangca', 'giaitrinh'], MONEY_T = ['thanhtoan', 'mua', 'tamung'];
const RSTATUS = { pending: 'Đang chờ duyệt', approved: 'Đã duyệt', rejected: 'Từ chối', withdrawn: 'Đã thu hồi' };
const WSTATUS = { running: 'Đang xử lý', done: 'Hoàn thành', cancelled: 'Đã hủy' };
const LEVEL = { company: 'Đơn vị', dept: 'Phòng', user: 'Cá nhân' };

/* Lưu tùy chọn hiển thị trên trình duyệt */
const PREF_KEY = 'smartoffice-ui';
let pref = { view: 'list', project: 'all', mine: false, dept: '', reqBox: 'inbox', wfBox: 'mine' };
try { Object.assign(pref, JSON.parse(localStorage.getItem(PREF_KEY) || '{}')); } catch (e) {}
const savePref = () => { try { localStorage.setItem(PREF_KEY, JSON.stringify(pref)); } catch (e) {} };

/* ================= Gọi máy chủ ================= */
let B = null; // dữ liệu dùng chung
async function api(method, url, body) {
  const opt = { method, headers: {}, credentials: 'same-origin' };
  if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  let res;
  try { res = await fetch(url, opt); } catch (e) { const er = new Error(navigator.onLine === false ? 'Thiết bị đang mất kết nối mạng. Vui lòng kiểm tra Wi‑Fi hoặc dữ liệu di động.' : 'Không kết nối được máy chủ. Vui lòng thử lại sau ít phút.'); er.offline = true; throw er; }
  let data = null; try { data = await res.json(); } catch (e) {}
  if (res.status === 401 && !url.endsWith('/login')) { B = null; closeModal(); renderLogin(); throw new Error((data && data.error) || 'Phiên đăng nhập đã hết hạn.'); }
  if (!res.ok) throw new Error((data && data.error) || 'Có lỗi xảy ra (mã ' + res.status + ').');
  return data;
}
const GET = u => api('GET', u), POST = (u, b) => api('POST', u, b || {}), PUT = (u, b) => api('PUT', u, b || {}), DEL = u => api('DELETE', u);

const U = id => (B.users.find(u => u.id === id)) || { full_name: '—', color: '#8a95a1', title: '' };
const Dp = id => (B.departments.find(d => d.id === id)) || { name: '—' };
const Pj = id => (B.projects.find(p => p.id === id)) || { name: '—', color: '#8a95a1' };
const initials = n => { const p = String(n || '?').trim().split(/\s+/); return ((p.length > 1 ? p[p.length - 2][0] : '') + p[p.length - 1][0]).toUpperCase(); };
const av = (uid, cls = '') => { const u = U(uid); return `<span class="av ${cls}" style="background:${esc(u.color)}" title="${esc(u.full_name)}">${esc(initials(u.full_name))}</span>`; };
const who = uid => `<span class="who">${av(uid)}<span>${esc(U(uid).full_name)}</span></span>`;
const userOpts = (sel, filter) => B.users.filter(u => u.active && (!filter || filter(u))).map(u => `<option value="${u.id}" ${u.id === sel ? 'selected' : ''}>${esc(u.full_name)} — ${esc(u.title || Dp(u.dept_id).name)}</option>`).join('');
const deptOpts = (sel, blank) => (blank ? `<option value="">${blank}</option>` : '') + B.departments.map(d => `<option value="${d.id}" ${d.id === sel ? 'selected' : ''}>${esc(d.name)}</option>`).join('');
const isLate = t => t.status !== 'done' && t.due_date < TODAY();
const progClass = p => p >= 70 ? 'ok' : p >= 40 ? 'warn' : 'bad';

/* ================= Hộp thoại & thông báo ================= */
let MH = {}; // các xử lý của hộp thoại đang mở
function openModal(html, handlers = {}) {
  $('#modal').innerHTML = html; $('#modal').dataset.force = ''; $('#overlay').hidden = false; MH = handlers;
  const f = $('#modal .modal-b input:not([type=checkbox]):not(:disabled), #modal .modal-b textarea:not(:disabled)');
  if (f) setTimeout(() => f.focus(), 30);
}
function closeModal() { $('#overlay').hidden = true; $('#modal').innerHTML = ''; $('#modal').dataset.force = ''; MH = {}; }
let tt;
function toast(m, err) { const t = $('#toast'); t.textContent = m; t.className = 'toast' + (err ? ' error' : ''); t.hidden = false; clearTimeout(tt); tt = setTimeout(() => t.hidden = true, err ? 4500 : 2600); }
const showErr = (sel, e) => { const el = $(sel); if (el) { el.textContent = e.message || e; el.hidden = false; } else toast(e.message || e, true); };
const mh = (title, sub) => `<div class="modal-h"><div>${sub ? `<span class="mono muted" style="font-size:12px">${sub}</span>` : ''}<h2>${title}</h2></div><button class="x" data-act="close" aria-label="Đóng">×</button></div>`;
async function busy(btn, fn) { if (btn) btn.disabled = true; try { return await fn(); } finally { if (btn && document.body.contains(btn)) btn.disabled = false; } }
function armed(btn, label) { if (btn.classList.contains('armed')) return true; btn.classList.add('armed'); btn.dataset.orig = btn.textContent; btn.textContent = label || 'Bấm lần nữa để xác nhận'; setTimeout(() => { if (document.body.contains(btn)) { btn.classList.remove('armed'); btn.textContent = btn.dataset.orig; } }, 3500); return false; }

/* ================= Đăng nhập ================= */
function renderLogin() {
  $('#root').innerHTML = `<div class="login">
    <aside class="login-side"><div class="brand"><div class="brand-mark">SO</div><div><b>SmartOffice</b><small>Văn phòng số nội bộ</small></div></div>
      <div><h1>Điều hành công việc tập trung, minh bạch</h1>
      <ul><li>Giao việc, theo dõi tiến độ theo dự án và phòng ban</li><li>Phê duyệt đề xuất nhiều cấp theo quy chế tài chính</li><li>Quy trình liên phòng ban có hạn xử lý từng bước</li><li>Hồ sơ nhân sự, hợp đồng lao động, ngày phép</li><li>Mục tiêu – KPI theo chu kỳ, tự tổng hợp tiến độ</li></ul></div>
      <small style="opacity:.6">Dữ liệu lưu trên máy chủ nội bộ của đơn vị.</small></aside>
    <main class="login-main"><form class="login-box" id="loginf" novalidate>
      <h2>Đăng nhập</h2>
      <div class="field"><label for="lg-u">Tên đăng nhập</label><input id="lg-u" autocomplete="username" autofocus></div>
      <div class="field"><label for="lg-p">Mật khẩu</label><input id="lg-p" type="password" autocomplete="current-password"></div>
      <p class="err" id="lg-err" hidden></p>
      <button class="btn primary block" id="lg-btn">Đăng nhập</button>
      <p class="hint">Quên mật khẩu: liên hệ quản trị viên hệ thống để được cấp lại.</p>
    </form></main></div>`;
  $('#loginf').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = $('#lg-btn');
    await busy(btn, async () => {
      try { await POST('/api/login', { username: $('#lg-u').value.trim(), password: $('#lg-p').value }); await boot(); }
      catch (err) { showErr('#lg-err', err); }
    });
  });
}

/* ================= Khung ứng dụng ================= */
const ICON = {
  'tong-quan': '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  'cong-viec': '<path d="M9 6h11M9 12h11M9 18h11"/><path d="m3 6 1.5 1.5L7 5M3 12l1.5 1.5L7 11M3 18l1.5 1.5L7 17"/>',
  'phe-duyet': '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M9 15l2 2 4-4"/>',
  'quy-trinh': '<circle cx="5" cy="6" r="2.5"/><circle cx="19" cy="6" r="2.5"/><circle cx="12" cy="18" r="2.5"/><path d="M7.5 6h9M6.3 8.2l4.4 7.6M17.7 8.2l-4.4 7.6"/>',
  'nhan-su': '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/>',
  'muc-tieu': '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
  'quan-tri': '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  'tai-khoan': '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  'bang-tin': '<path d="M4 5h13v14H6a2 2 0 0 1-2-2z"/><path d="M17 8h3v9a2 2 0 0 1-2 2M8 9h5M8 13h5"/>',
  'lich-hop': '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  'tai-lieu': '<path d="M4 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/>',
  'khach-hang': '<path d="M3 21v-1a6 6 0 0 1 12 0v1"/><circle cx="9" cy="8" r="4"/><path d="M17 11l2 2 4-4"/>',
  'thu-chi': '<path d="M12 3v18M17 7H9.5a3 3 0 0 0 0 6h5a3 3 0 0 1 0 6H6"/>',
  'tai-san': '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
  'nhan-tin': '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
  'khach-den': '<rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M8 17a4 4 0 0 1 8 0"/>',
  'tuyen-dung': '<circle cx="10" cy="8" r="4"/><path d="M3 21a7 7 0 0 1 11-5.7"/><path d="M18 14v6M15 17h6"/>',
  'dao-tao': '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2 9 2 12 0v-5"/>',
  'danh-gia': '<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.5 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/>',
  'khen-thuong': '<circle cx="12" cy="9" r="6"/><path d="M8.5 14 7 22l5-3 5 3-1.5-8"/>',
  'cham-cong': '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/>',
  'tien-luong': '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 9.5v5M18 9.5v5"/>'
};
const ROUTES = [['tong-quan', 'Tổng quan'], ['cong-viec', 'Công việc – Dự án'], ['phe-duyet', 'Phê duyệt'], ['quy-trinh', 'Quy trình'], ['nhan-su', 'Hồ sơ nhân sự'], ['cham-cong', 'Chấm công – Bảng công'], ['tien-luong', 'Tiền lương'], ['muc-tieu', 'Mục tiêu – KPI'], ['bang-tin', 'Bảng tin'], ['lich-hop', 'Lịch họp'], ['tai-lieu', 'Tài liệu'], ['khach-hang', 'Khách hàng'], ['thu-chi', 'Thu chi – Ngân sách', 'finance'], ['tai-san', 'Tài sản'], ['nhan-tin', 'Nhắn tin'], ['khach-den', 'Đăng ký khách đến'], ['tuyen-dung', 'Tuyển dụng', 'recruit'], ['dao-tao', 'Đào tạo'], ['danh-gia', 'Đánh giá năng lực'], ['khen-thuong', 'Khen thưởng – Kỷ luật'], ['quan-tri', 'Quản trị', 'admin'], ['tai-khoan', 'Tài khoản']];
const NAV = [
  { k: 'tong-quan', l: 'Tổng quan' },
  { l: 'Công việc', items: ['cong-viec', 'quy-trinh', 'muc-tieu'] },
  { k: 'phe-duyet', l: 'Phê duyệt' },
  { l: 'Thông tin', items: ['bang-tin', 'nhan-tin', 'lich-hop', 'tai-lieu', 'khach-den'] },
  { l: 'Nhân sự', items: ['nhan-su', 'cham-cong', 'tien-luong', 'tuyen-dung', 'dao-tao', 'danh-gia', 'khen-thuong'] },
  { l: 'Kinh doanh', items: ['khach-hang', 'thu-chi', 'tai-san'] },
  { k: 'quan-tri', l: 'Quản trị', admin: true }
];
const RLABEL = k => (ROUTES.find(r => r[0] === k) || [])[1];
const allowed = x => !x[2] || (x[2] === 'admin' ? B.me.role === 'admin' : x[2] === 'finance' ? B.me.is_finance : x[2] === 'recruit' ? B.me.can_recruit : true);
const routeOk = r => ROUTES.some(x => x[0] === r && allowed(x));
const current = () => { const h = location.hash.slice(1); return routeOk(h) ? h : 'tong-quan'; };

async function boot() {
  try { B = await GET('/api/bootstrap'); } catch (e) {
    if (e.offline && !B) return renderOffline(e.message);
    if (!B) return renderLogin();
  }
  $('#root').innerHTML = `<div class="app"><header class="topbar"><div class="topbar-in">
    <a class="brand" href="#tong-quan"><div class="brand-mark">SO</div><div><b>SmartOffice</b><small>${esc(B.settings.org_name)}</small></div></a>
    <button class="menu-btn" data-act="toggle-nav" aria-label="Mở menu" aria-expanded="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>
    <nav class="hnav" id="nav" aria-label="Menu chính"></nav>
    <div class="top-right">
      <button class="clock-btn" id="clock-btn" data-act="quick-check" title="Chấm công">Chấm công</button>
      <div class="dd user-dd"><button class="dd-btn user-btn" data-act="dd" aria-haspopup="true" aria-expanded="false">${av(B.me.id)}<span class="u-name">${esc(B.me.full_name)}</span><svg class="caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg></button>
        <div class="dd-menu right"><div class="dd-head"><b>${esc(B.me.full_name)}</b><small>${esc(B.me.title || '')} · ${esc(Dp(B.me.dept_id).name)}</small></div><a href="#tai-khoan">Tài khoản của tôi</a><a href="#tien-luong">Phiếu lương của tôi</a><button data-act="install-app" class="install-item" hidden>Cài ứng dụng lên thiết bị</button><button data-act="logout">Đăng xuất</button></div></div>
    </div></div></header><main id="main"></main></div>`;
  render();
  refreshClock();
  if (B.me.must_change_pw) passwordModal(true);
}
function renderOffline(msg) {
  $('#root').innerHTML = `<div class="offline-screen"><div class="brand-mark big">SO</div><h1>Chưa kết nối được SmartOffice</h1><p>${esc(msg)}</p><button class="btn primary" data-act="retry-boot">Thử lại</button></div>`;
}
async function refreshBoot() { try { B = await GET('/api/bootstrap'); renderNav(); } catch (e) {} }
function renderNav() {
  const cur = current(), c = B.counts;
  const badge = { 'phe-duyet': c.inbox, 'quy-trinh': c.wf, 'cong-viec': c.tasks, 'bang-tin': c.posts, 'lich-hop': c.meetings, 'nhan-tin': c.chat, 'danh-gia': c.reviews, 'khach-den': c.visitors };
  const ic = k => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON[k] || ICON['tong-quan']}</svg>`;
  const cnt = n => n ? `<span class="count">${n}</span>` : '';
  $('#nav').innerHTML = NAV.filter(g => !g.admin || B.me.role === 'admin').map(g => {
    if (!g.items) return `<a class="top-link" href="#${g.k}" ${g.k === cur ? 'aria-current="page"' : ''}>${g.l}${cnt(badge[g.k])}</a>`;
    const items = g.items.filter(k => routeOk(k)); if (!items.length) return '';
    const on = items.includes(cur), sum = items.reduce((s, k) => s + (badge[k] || 0), 0);
    return `<div class="dd"><button class="dd-btn top-link ${on ? 'on' : ''}" data-act="dd" aria-haspopup="true" aria-expanded="false">${g.l}${cnt(sum)}<svg class="caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg></button>
      <div class="dd-menu">${items.map(k => `<a href="#${k}" ${k === cur ? 'aria-current="page"' : ''}>${ic(k)}<span>${RLABEL(k)}</span>${cnt(badge[k])}</a>`).join('')}</div></div>`;
  }).join('');
}
function closeMenus() { $$('.dd.open').forEach(d => { d.classList.remove('open'); const b = $('.dd-btn', d); if (b) b.setAttribute('aria-expanded', 'false'); }); }
let clockRec = null;
async function refreshClock() {
  try { const d = await GET('/api/attendance/today'); clockRec = d; const b = $('#clock-btn'); if (!b) return;
    const r = d.record;
    b.textContent = !r ? 'Vào ca' : r.check_out ? `Ra ca lúc ${r.check_out}` : `Đã vào ${r.check_in} · Ra ca`;
    b.classList.toggle('in', !!r && !r.check_out); b.classList.toggle('done', !!(r && r.check_out));
  } catch (e) {}
}
async function render() {
  if (!B) return;
  renderNav(); closeMenus(); document.body.classList.remove('nav-open');
  const r = current(), main = $('#main');
  main.innerHTML = '<div class="loading">Đang tải dữ liệu…</div>';
  try { await VIEWS[r](main); }
  catch (e) { main.innerHTML = `<div class="card empty">${esc(e.message)}<br><br><button class="btn" data-act="reload">Tải lại</button></div>`; }
}
const VIEWS = {};

/* ================= TỔNG QUAN ================= */
VIEWS['tong-quan'] = async main => {
  const d = await GET('/api/dashboard'); B.counts = d.counts; renderNav();
  const t = d.totals, now = new Date(), mx = Math.max(1, ...d.loads.map(x => x.open));
  const pct = Math.round((t.done || 0) / Math.max(1, t.n) * 100);
  main.innerHTML = `
  <div class="page-head"><div><h1>Chào ${esc(B.me.full_name.split(' ').pop())},</h1><p>${WD[now.getDay()]}, ngày ${pad(now.getDate())} tháng ${pad(now.getMonth() + 1)} năm ${now.getFullYear()} · ${esc(B.me.title)}, ${esc(Dp(B.me.dept_id).name)}</p></div>
  <div class="actions"><button class="btn" data-act="new-task">+ Công việc</button><button class="btn" data-act="new-run">+ Quy trình</button><button class="btn primary" data-act="new-req">+ Đề xuất</button></div></div>
  <div class="stats">
    <div class="card stat"><span class="k">Việc của tôi đang mở</span><span class="v num">${d.counts.tasks}</span><span class="s">${d.mine.filter(isLate).length} việc quá hạn</span></div>
    <div class="card stat ${d.counts.inbox ? 'alert' : ''}"><span class="k">Đề xuất chờ tôi duyệt</span><span class="v num">${d.counts.inbox}</span><span class="s">${d.counts.wf} bước quy trình chờ xử lý</span></div>
    <div class="card stat ${t.late ? 'alert' : ''}"><span class="k">Công việc quá hạn (toàn đơn vị)</span><span class="v num">${t.late || 0}</span><span class="s">trên ${t.open || 0} việc đang mở</span></div>
    <div class="card stat"><span class="k">Tỷ lệ hoàn thành</span><span class="v num">${pct}%</span><span class="s">${t.done || 0}/${t.n} công việc</span></div>
  </div>
  <div class="grid2"><div class="stack">
    <section class="card"><div class="card-h"><h2>Khối lượng công việc ${d.scope === 'all' ? 'toàn đơn vị' : 'trong phòng'}</h2><div class="legend"><span><i style="background:var(--accent)"></i>Đúng hạn</span><span><i style="background:var(--bad)"></i>Quá hạn</span></div></div>
    <div class="card-b">${d.loads.map(x => `<div class="load">${who(x.id)}<div class="bar" title="${x.open} việc, ${x.late} quá hạn"><i class="b-open" style="width:${(x.open - x.late) / mx * 100}%"></i><i class="b-late" style="width:${x.late / mx * 100}%"></i></div><span class="num muted" style="text-align:right">${x.open} việc</span></div>`).join('') || '<p class="muted">Chưa có công việc đang mở.</p>'}</div></section>
    <section class="card"><div class="card-h"><h2>Việc của tôi</h2><a class="btn sm" href="#cong-viec">Xem tất cả</a></div>
    ${d.mine.length ? `<div class="tbl-wrap"><table class="tbl" style="min-width:520px"><tbody>${d.mine.map(rowTask).join('')}</tbody></table></div>` : '<div class="empty">Bạn không có công việc đang mở.</div>'}</section>
    ${d.contracts.length ? `<section class="card"><div class="card-h"><h2>Hợp đồng lao động sắp hết hạn (60 ngày)</h2></div><div class="tbl-wrap"><table class="tbl" style="min-width:480px"><tbody>${d.contracts.map(c => `<tr class="click" data-emp="${c.user_id}"><td>${who(c.user_id)}</td><td>${esc(c.number)}</td><td class="num late">${fmtD(c.end_date)}</td><td class="num muted">còn ${dayNum(c.end_date) - dayNum(TODAY())} ngày</td></tr>`).join('')}</tbody></table></div></section>` : ''}
  </div><div class="stack">
    <section class="card"><div class="card-h"><h2>Đề xuất chờ tôi duyệt</h2><a class="btn sm" href="#phe-duyet">Mở hộp duyệt</a></div>
    <div class="list">${d.inbox.length ? d.inbox.map(reqItem).join('') : '<div class="empty">Không có đề xuất nào đang chờ bạn.</div>'}</div></section>
    <section class="card"><div class="card-h"><h2>Hồ sơ quy trình chờ tôi xử lý</h2><a class="btn sm" href="#quy-trinh">Xem</a></div>
    <div class="list">${d.wf.length ? d.wf.map(w => `<div class="item" data-run="${w.id}"><div style="min-width:0;display:flex;flex-direction:column;gap:4px"><span class="mono muted" style="font-size:12px">${esc(w.code)}</span><h3>${esc(w.title)}</h3><div class="meta">Bước: ${esc(w.step_name)}</div></div><div class="right"><span class="num ${w.due_date < TODAY() ? 'late' : 'muted'}">Hạn ${fmtD(w.due_date)}</span></div></div>`).join('') : '<div class="empty">Không có hồ sơ nào đang chờ bạn.</div>'}</div></section>
    <section class="card"><div class="card-h"><h2>Hoạt động gần đây</h2></div><div class="card-b"><ul class="feed">${d.activity.map(a => `<li>${av(a.user_id)}<div><b>${esc(a.full_name)}</b> ${a.text}<time>${fmtDT(a.created_at)}</time></div></li>`).join('') || '<li class="muted">Chưa có hoạt động.</li>'}</ul></div></section>
  </div></div>`;
};

/* ================= CÔNG VIỆC ================= */
function rowTask(t) {
  return `<tr class="click" data-task="${t.id}"><td><div class="t-title">${esc(t.title)}</div><div class="t-sub">${esc(t.project_name || Pj(t.project_id).name)}${t.cl_total ? ` · ${t.cl_done}/${t.cl_total} đầu việc` : ''}${t.cm_count ? ` · ${t.cm_count} trao đổi` : ''}</div></td>
  <td>${who(t.assignee_id)}</td><td class="num ${isLate(t) ? 'late' : ''}">${fmtD(t.due_date)}${isLate(t) ? `<div class="t-sub late">Quá ${dayNum(TODAY()) - dayNum(t.due_date)} ngày</div>` : ''}</td>
  <td><span class="prio p-${t.priority}">${PRIO[t.priority]}</span></td><td><span class="pill s-${t.status}">${TSTATUS[t.status]}</span></td></tr>`;
}
let taskQ = '';
VIEWS['cong-viec'] = async main => {
  const qs = new URLSearchParams({ project: pref.project, mine: pref.mine ? '1' : '', dept: pref.dept || '', q: taskQ });
  const ts = await GET('/api/tasks?' + qs), v = pref.view;
  if (pref.project !== 'all' && !B.projects.some(p => String(p.id) === String(pref.project))) { pref.project = 'all'; savePref(); }
  let body;
  if (!ts.length) body = '<section class="card"><div class="empty">Không có công việc phù hợp bộ lọc.</div></section>';
  else if (v === 'list') body = `<section class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Công việc</th><th>Người thực hiện</th><th>Hạn hoàn thành</th><th>Ưu tiên</th><th>Trạng thái</th></tr></thead><tbody>${ts.map(rowTask).join('')}</tbody></table></div></section>`;
  else if (v === 'kanban') body = `<div class="board">${Object.keys(TSTATUS).map(s => { const col = ts.filter(t => t.status === s); return `<div class="col" data-col="${s}"><div class="col-h"><span class="pill s-${s}">${TSTATUS[s]}</span><span class="muted num">${col.length}</span></div>${col.map(kcard).join('')}</div>`; }).join('')}</div><p class="hint" style="margin-top:8px">Kéo thả thẻ giữa các cột để cập nhật trạng thái.</p>`;
  else body = gantt(ts);
  const proj = B.projects.filter(p => !p.archived);
  main.innerHTML = `
  <div class="page-head"><div><h1>Công việc &amp; dự án</h1><p>${ts.length} công việc · ${ts.filter(isLate).length} quá hạn</p></div>
  <div class="actions"><a class="btn" href="/api/export/tasks.csv">Xuất Excel (CSV)</a><button class="btn" data-act="new-project">+ Dự án</button><button class="btn primary" data-act="new-task">+ Thêm công việc</button></div></div>
  <div class="toolbar"><div class="chips">${[['all', 'Tất cả dự án']].concat(proj.map(p => [String(p.id), p.name, p.color])).map(([id, n, c]) => `<button class="chip" data-proj="${id}" aria-pressed="${String(pref.project) === id}">${c ? `<i style="background:${esc(c)}"></i>` : ''}${esc(n)}</button>`).join('')}
    ${pref.project !== 'all' ? `<button class="chip" data-act="edit-project" title="Sửa dự án đang chọn">Sửa dự án</button>` : ''}</div></div>
  <div class="toolbar"><input class="search" id="tq" type="search" placeholder="Tìm công việc…" value="${esc(taskQ)}" aria-label="Tìm công việc">
    <select class="sel" id="tdept" aria-label="Lọc theo phòng ban">${deptOpts(Number(pref.dept) || null, 'Tất cả phòng ban')}</select>
    <label class="check"><input type="checkbox" id="tmine" ${pref.mine ? 'checked' : ''}> Chỉ việc của tôi</label><span class="spacer"></span>
    <div class="seg">${[['list', 'Danh sách'], ['kanban', 'Kanban'], ['gantt', 'Tiến độ (Gantt)']].map(([k, l]) => `<button data-view="${k}" aria-pressed="${v === k}">${l}</button>`).join('')}</div></div>
  ${body}`;
  $('#tq').addEventListener('input', debounce(e => { taskQ = e.target.value; render(); setTimeout(() => { const q = $('#tq'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }, 60); }, 350));
  $('#tdept').addEventListener('change', e => { pref.dept = e.target.value; savePref(); render(); });
  $('#tmine').addEventListener('change', e => { pref.mine = e.target.checked; savePref(); render(); });
  if (v === 'kanban') wireDnD(ts);
};
function kcard(t) {
  const p = Pj(t.project_id);
  return `<div class="kcard" draggable="true" data-task="${t.id}"><span class="tag" style="align-self:flex-start;border-color:${esc(p.color)};color:${esc(p.color)}">${esc(p.name)}</span><div class="t-title">${esc(t.title)}</div>
  ${t.cl_total ? `<div class="prog"><i style="width:${t.cl_done / t.cl_total * 100}%"></i></div>` : ''}
  <div class="row">${who(t.assignee_id)}<span class="num ${isLate(t) ? 'late' : 'muted'}">${fmtD(t.due_date).slice(0, 5)}</span></div></div>`;
}
function wireDnD(ts) {
  let dragId = null;
  $$('.kcard').forEach(c => { c.addEventListener('dragstart', e => { dragId = c.dataset.task; c.classList.add('dragging'); try { e.dataTransfer.setData('text/plain', dragId); } catch (_) {} }); c.addEventListener('dragend', () => c.classList.remove('dragging')); });
  $$('.col').forEach(col => {
    col.addEventListener('dragover', e => { e.preventDefault(); col.classList.add('over'); });
    col.addEventListener('dragleave', () => col.classList.remove('over'));
    col.addEventListener('drop', async e => {
      e.preventDefault(); col.classList.remove('over');
      const t = ts.find(x => String(x.id) === String(dragId)), s = col.dataset.col;
      if (!t || t.status === s) return;
      try { await PUT('/api/tasks/' + t.id, { status: s }); toast('Đã chuyển sang “' + TSTATUS[s] + '”'); refreshBoot(); render(); } catch (err) { toast(err.message, true); }
    });
  });
}
function gantt(ts) {
  const T = TODAY();
  const lo = Math.min(...ts.map(t => dayNum(t.start_date)), dayNum(T)) - 1, hi = Math.max(...ts.map(t => dayNum(t.due_date)), dayNum(T)) + 2;
  const W = 34, days = Math.min(hi - lo + 1, 240), LW = 260;
  let head = '<div class="g-head-l">Công việc</div>';
  for (let i = 0; i < days; i++) { const dd = new Date((lo + i) * 864e5), s = dd.toISOString().slice(0, 10), w = dd.getUTCDay();
    head += `<div class="g-day ${w === 0 || w === 6 ? 'we' : ''} ${s === T ? 'today' : ''}"><span>${['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][w]}</span><b class="num">${pad(dd.getUTCDate())}/${pad(dd.getUTCMonth() + 1)}</b></div>`; }
  const rows = ts.slice().sort((a, b) => a.start_date < b.start_date ? -1 : 1).map(t => {
    const l = Math.max(0, dayNum(t.start_date) - lo) * W, w = Math.max(1, Math.min(dayNum(t.due_date), lo + days - 1) - Math.max(dayNum(t.start_date), lo) + 1) * W - 4;
    const col = t.status === 'done' ? 'var(--ok)' : isLate(t) ? 'var(--bad)' : (t.project_color || Pj(t.project_id).color);
    return `<div class="g-label" data-task="${t.id}">${av(t.assignee_id)}<span>${esc(t.title)}</span></div><div class="g-cell" style="grid-column:2/span ${days}"><div class="g-bar" data-task="${t.id}" style="left:${l + 2}px;width:${w}px;background:${esc(col)}" title="${esc(t.title)}: ${fmtD(t.start_date)} → ${fmtD(t.due_date)}">${esc(TSTATUS[t.status])}</div></div>`;
  }).join('');
  return `<section class="card gantt"><div class="g-grid" style="grid-template-columns:${LW}px repeat(${days},${W}px)">${head}${rows}<div class="g-today" style="left:${LW + (dayNum(T) - lo) * W + W / 2}px;top:38px"></div></div></section>
  <div class="legend" style="margin-top:8px"><span><i style="background:var(--ok)"></i>Hoàn thành</span><span><i style="background:var(--bad)"></i>Quá hạn</span><span><i style="background:var(--accent)"></i>Đường mốc hôm nay</span></div>`;
}
function projectModal(p) {
  const colors = ['#0e6f68', '#3a5bb0', '#a8501f', '#7a4fb0', '#2b8547', '#b03a6c', '#5b6774', '#a86a10'];
  openModal(`${mh(p ? 'Sửa dự án' : 'Tạo dự án mới')}<div class="modal-b"><div class="form">
    <div class="field full"><label for="pj-n">Tên dự án / nhóm công việc</label><input id="pj-n" value="${esc(p ? p.name : '')}" placeholder="Ví dụ: Chuẩn bị Hội nghị tổng kết năm"></div>
    <div class="field"><label for="pj-c">Màu nhận diện</label><select id="pj-c">${colors.map((c, i) => `<option value="${c}" ${p && p.color === c ? 'selected' : ''}>Màu ${i + 1}</option>`).join('')}</select></div>
    ${p ? `<div class="field"><label for="pj-a">Tình trạng</label><select id="pj-a"><option value="0">Đang thực hiện</option><option value="1" ${p.archived ? 'selected' : ''}>Lưu trữ (ẩn khỏi danh sách)</option></select></div>` : ''}
  </div><p class="err" id="pj-err" hidden></p></div>
  <div class="modal-f">${p ? '<button class="btn danger" data-act="m-del" style="margin-right:auto">Xóa dự án</button>' : ''}<button class="btn" data-act="close">Hủy</button><button class="btn primary" data-act="m-save">${p ? 'Lưu' : 'Tạo dự án'}</button></div>`, {
    'm-save': async btn => busy(btn, async () => {
      try {
        const body = { name: $('#pj-n').value, color: $('#pj-c').value, archived: p ? $('#pj-a').value === '1' : false };
        const r = p ? await PUT('/api/projects/' + p.id, body) : await POST('/api/projects', body);
        await refreshBoot(); if (!p) { pref.project = String(r.id); savePref(); } closeModal(); render(); toast(p ? 'Đã lưu dự án' : 'Đã tạo dự án');
      } catch (e) { showErr('#pj-err', e); }
    }),
    'm-del': async btn => { if (!armed(btn, 'Xóa cả công việc trong dự án?')) return; try { await DEL('/api/projects/' + p.id); pref.project = 'all'; savePref(); await refreshBoot(); closeModal(); render(); toast('Đã xóa dự án'); } catch (e) { showErr('#pj-err', e); } }
  });
}
async function taskModal(id) {
  let t = id ? await GET('/api/tasks/' + id) : null;
  const isNew = !t;
  const proj = B.projects.filter(p => !p.archived);
  if (isNew) {
    if (!proj.length) { toast('Vui lòng tạo dự án trước khi thêm công việc.', true); return projectModal(null); }
    t = { project_id: pref.project !== 'all' ? Number(pref.project) : proj[0].id, title: '', assignee_id: B.me.id, status: 'todo', start_date: TODAY(), due_date: addDays(TODAY(), 3), priority: 'tb', description: '', checklist: [], comments: [], can_edit: true };
  }
  const dis = t.can_edit ? '' : 'disabled';
  const draw = () => openModal(`
  ${mh(isNew ? 'Thêm công việc mới' : esc(t.title), isNew ? '' : 'Giao bởi ' + esc(U(t.creator_id).full_name) + ' · ' + fmtDT(t.created_at))}
  <div class="modal-b">
    ${!t.can_edit ? '<p class="notice info">Bạn chỉ có quyền xem và trao đổi trong công việc này.</p>' : ''}
    <div class="form">
      <div class="field full"><label for="f-title">Tên công việc</label><input id="f-title" value="${esc(t.title)}" placeholder="Ví dụ: Lập báo cáo doanh thu tháng 11" ${dis}></div>
      <div class="field"><label for="f-proj">Dự án</label><select id="f-proj" ${dis}>${B.projects.map(p => `<option value="${p.id}" ${p.id === t.project_id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>
      <div class="field"><label for="f-as">Người thực hiện</label><select id="f-as" ${dis}>${userOpts(t.assignee_id)}</select></div>
      <div class="field"><label for="f-start">Ngày bắt đầu</label><input type="date" id="f-start" value="${t.start_date}" ${dis}></div>
      <div class="field"><label for="f-due">Hạn hoàn thành</label><input type="date" id="f-due" value="${t.due_date}" ${dis}></div>
      <div class="field"><label for="f-prio">Mức ưu tiên</label><select id="f-prio" ${dis}>${Object.entries(PRIO).map(([k, l]) => `<option value="${k}" ${k === t.priority ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="field"><label for="f-st">Trạng thái</label><select id="f-st" ${dis}>${Object.entries(TSTATUS).map(([k, l]) => `<option value="${k}" ${k === t.status ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="field full"><label for="f-desc">Nội dung, yêu cầu</label><textarea id="f-desc" placeholder="Nội dung, căn cứ thực hiện, kết quả cần đạt" ${dis}>${esc(t.description)}</textarea></div>
    </div>
    <p class="err" id="f-err" hidden></p>
    ${isNew ? '' : `
    <h3 class="sec-t">Danh mục đầu việc (${t.checklist.filter(c => c.done).length}/${t.checklist.length})</h3>
    <div class="cl">${t.checklist.map(c => `<div class="cl-row ${c.done ? 'done' : ''}"><label><input type="checkbox" data-cl="${c.id}" ${c.done ? 'checked' : ''} ${dis}><span>${esc(c.text)}</span></label>${t.can_edit ? `<button class="btn ghost sm" data-act="cl-del" data-id="${c.id}" aria-label="Xóa đầu việc">×</button>` : ''}</div>`).join('') || '<span class="hint">Chưa có đầu việc con.</span>'}</div>
    ${t.can_edit ? '<div class="inline-add"><input id="cl-new" placeholder="Thêm đầu việc con" aria-label="Thêm đầu việc con"><button type="button" class="btn sm" data-act="cl-add">Thêm</button></div>' : ''}
    <h3 class="sec-t">Trao đổi (${t.comments.length})</h3>
    <div class="cmts">${t.comments.map(c => `<div class="cmt">${av(c.user_id)}<div><b>${esc(c.full_name)}</b><time>${fmtDT(c.created_at)}</time><p>${esc(c.body)}</p></div></div>`).join('') || '<span class="hint">Chưa có trao đổi.</span>'}</div>
    <div class="inline-add"><input id="cm-new" placeholder="Viết ý kiến, báo cáo tiến độ…" aria-label="Viết bình luận"><button type="button" class="btn sm" data-act="cm-add">Gửi</button></div>`}
  </div>
  <div class="modal-f">${!isNew && t.can_edit ? '<button class="btn danger" data-act="t-del" style="margin-right:auto">Xóa</button>' : ''}<button class="btn" data-act="close">Đóng</button>${t.can_edit ? `<button class="btn primary" data-act="t-save">${isNew ? 'Giao việc' : 'Lưu thay đổi'}</button>` : ''}</div>`, H);
  const reload = async nt => { t = nt; draw(); render(); };
  const H = {
    't-save': btn => busy(btn, async () => {
      const body = { title: $('#f-title').value, project_id: $('#f-proj').value, assignee_id: $('#f-as').value, start_date: $('#f-start').value, due_date: $('#f-due').value, priority: $('#f-prio').value, status: $('#f-st').value, description: $('#f-desc').value };
      try { isNew ? await POST('/api/tasks', body) : await PUT('/api/tasks/' + t.id, body); closeModal(); refreshBoot(); render(); toast(isNew ? 'Đã giao việc' : 'Đã lưu công việc'); }
      catch (e) { showErr('#f-err', e); }
    }),
    't-del': async btn => { if (!armed(btn, 'Bấm lần nữa để xóa')) return; try { await DEL('/api/tasks/' + t.id); closeModal(); refreshBoot(); render(); toast('Đã xóa công việc'); } catch (e) { showErr('#f-err', e); } },
    'cl-add': async () => { const v = $('#cl-new').value.trim(); if (!v) return $('#cl-new').focus(); try { reload(await POST(`/api/tasks/${t.id}/checklist`, { text: v })); setTimeout(() => $('#cl-new') && $('#cl-new').focus(), 40); } catch (e) { showErr('#f-err', e); } },
    'cl-del': async btn => { try { reload(await DEL('/api/checklist/' + btn.dataset.id)); } catch (e) { showErr('#f-err', e); } },
    'cm-add': async () => { const v = $('#cm-new').value.trim(); if (!v) return $('#cm-new').focus(); try { reload(await POST(`/api/tasks/${t.id}/comments`, { body: v })); } catch (e) { showErr('#f-err', e); } },
    'cl-toggle': async el => { try { reload(await PUT('/api/checklist/' + el.dataset.cl, { done: el.checked })); } catch (e) { showErr('#f-err', e); } }
  };
  draw();
}

/* ================= PHÊ DUYỆT ================= */
function reqItem(r) {
  return `<div class="item" data-req="${r.id}"><div style="min-width:0;display:flex;flex-direction:column;gap:5px">
    <div class="top"><span class="code mono">${esc(r.code)}</span><span class="tag">${RTYPE[r.type]}</span></div>
    <h3>${esc(r.title)}</h3>
    <div class="meta">${who(r.creator_id)}<span class="num">Gửi ${fmtDT(r.created_at)}</span>${r.status === 'pending' && r.cur_approver ? `<span>Đang chờ: <b>${esc(U(r.cur_approver).full_name)}</b> (${esc(r.cur_label)})</span>` : ''}</div></div>
    <div class="right">${RANGE_T.includes(r.type) ? `<span class="amt num">${fmtD(r.date_from).slice(0, 5)} – ${fmtD(r.date_to).slice(0, 5)} · ${numFmt(r.days)} ngày</span>` : r.type === 'tangca' ? `<span class="amt num">${fmtD(r.date_from)} · ${numFmt(r.hours)} giờ</span>` : r.type === 'giaitrinh' ? `<span class="amt num">Ngày ${fmtD(r.date_from)}</span>` : r.amount ? `<span class="amt mono">${vnd(r.amount)}</span>` : ''}<span class="pill s-${r.status}">${RSTATUS[r.status]}</span></div></div>`;
}
let reqFilter = { type: '', status: '' };
VIEWS['phe-duyet'] = async main => {
  const box = pref.reqBox;
  const list = await GET('/api/requests?' + new URLSearchParams({ box, type: reqFilter.type, status: reqFilter.status }));
  main.innerHTML = `
  <div class="page-head"><div><h1>Phê duyệt đề xuất</h1><p>Luồng duyệt tự động theo loại đề xuất và giá trị, căn cứ quy chế tài chính của đơn vị</p></div>
  <div class="actions"><a class="btn" href="/api/export/requests.csv">Xuất sổ theo dõi (CSV)</a><button class="btn primary" data-act="new-req">+ Tạo đề xuất</button></div></div>
  <div class="toolbar"><div class="seg">${[['inbox', `Chờ tôi duyệt (${B.counts.inbox})`], ['sent', 'Tôi đã gửi'], ['done', 'Tôi đã xử lý'], ['all', 'Tất cả']].map(([k, l]) => `<button data-rbox="${k}" aria-pressed="${box === k}">${l}</button>`).join('')}</div>
    <span class="spacer"></span>
    <select class="sel" id="rf-type" aria-label="Loại đề xuất"><option value="">Tất cả loại</option>${Object.entries(RTYPE).map(([k, l]) => `<option value="${k}" ${reqFilter.type === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
    <select class="sel" id="rf-st" aria-label="Tình trạng"><option value="">Mọi tình trạng</option>${Object.entries(RSTATUS).map(([k, l]) => `<option value="${k}" ${reqFilter.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
  <section class="card"><div class="list">${list.length ? list.map(reqItem).join('') : `<div class="empty">${box === 'inbox' ? 'Không có đề xuất nào đang chờ bạn duyệt.' : 'Không có đề xuất phù hợp.'}</div>`}</div></section>
  <p class="notice" style="margin-top:14px">Quy tắc duyệt hiện hành: Lãnh đạo phòng duyệt mọi đề xuất; đề xuất trên ${vnd(B.settings.threshold1)} chuyển Kế toán trưởng; trên ${vnd(B.settings.threshold2)} chuyển tiếp Giám đốc; đơn nghỉ phép chuyển Phòng HC–NS.${B.me.role === 'admin' ? ' Điều chỉnh tại mục Quản trị › Cấu hình duyệt.' : ''}</p>`;
  $('#rf-type').addEventListener('change', e => { reqFilter.type = e.target.value; render(); });
  $('#rf-st').addEventListener('change', e => { reqFilter.status = e.target.value; render(); });
};
function reqForm(preset) {
  openModal(`${mh('Tạo đề xuất mới')}
  <div class="modal-b"><div class="form">
    <div class="field"><label for="r-type">Loại đề xuất</label><select id="r-type">${Object.entries(RTYPE).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div>
    <div class="field" id="w-amt"><label for="r-amt">Số tiền đề nghị (đồng)</label><input id="r-amt" inputmode="numeric" placeholder="Ví dụ: 12.500.000"></div>
    <div class="field" id="w-from" hidden><label for="r-from">Từ ngày</label><input type="date" id="r-from" value="${addDays(TODAY(), 1)}"></div>
    <div class="field" id="w-to" hidden><label for="r-to">Đến hết ngày</label><input type="date" id="r-to" value="${addDays(TODAY(), 1)}"></div>
    <div class="field" id="w-hours" hidden><label for="r-hours">Số giờ làm thêm</label><input type="number" id="r-hours" min="0.5" max="12" step="0.5" value="2"></div>
    <div class="field full" id="w-half" hidden><label class="check"><input type="checkbox" id="r-half"> Nghỉ nửa ngày</label></div>
    <div class="field full"><label for="r-title">Trích yếu nội dung</label><input id="r-title" placeholder="Ví dụ: Thanh toán tiền in ấn tài liệu hội nghị"></div>
    <div class="field full"><label for="r-reason">Lý do, căn cứ đề xuất</label><textarea id="r-reason" placeholder="Nêu rõ căn cứ: hợp đồng, hóa đơn, kế hoạch đã được phê duyệt…"></textarea></div>
  </div>
  <div id="r-leave" hidden></div>
  <div><h3 class="sec-t" style="margin-bottom:6px">Luồng duyệt dự kiến</h3><div class="route" id="r-route">Đang xác định…</div></div>
  <p class="err" id="r-err" hidden></p></div>
  <div class="modal-f"><button class="btn" data-act="close">Hủy</button><button class="btn primary" data-act="m-send">Gửi đề xuất</button></div>`, {
    'm-send': btn => busy(btn, async () => {
      const ty = $('#r-type').value;
      try {
        const r = await POST('/api/requests', { type: ty, title: $('#r-title').value, reason: $('#r-reason').value, amount: $('#r-amt').value, date_from: $('#r-from').value, date_to: $('#r-to').value, half_day: $('#r-half').checked, hours: $('#r-hours').value });
        closeModal(); pref.reqBox = 'sent'; savePref(); await refreshBoot();
        if (current() !== 'phe-duyet') location.hash = 'phe-duyet'; else render();
        toast(r.status === 'approved' ? `Đề xuất ${r.code} được tự động phê duyệt` : `Đã gửi đề xuất ${r.code} tới ${r.steps[0].full_name}`);
      } catch (e) { showErr('#r-err', e); }
    })
  });
  const upd = debounce(async () => {
    const ty = $('#r-type') && $('#r-type').value; if (!ty) return;
    const leave = ty === 'nghiphep', range = RANGE_T.includes(ty), oneDay = DAY_T.includes(ty);
    $('#w-amt').hidden = !(MONEY_T.includes(ty) || ty === 'khac'); $('#w-from').hidden = !(range || oneDay); $('#w-to').hidden = !range; $('#w-half').hidden = !leave; $('#w-hours').hidden = ty !== 'tangca';
    $('#r-from').previousElementSibling.textContent = oneDay ? (ty === 'tangca' ? 'Ngày làm thêm' : 'Ngày cần giải trình') : 'Từ ngày';
    $('#r-amt').previousElementSibling.textContent = ty === 'khac' ? 'Số tiền (nếu có)' : 'Số tiền đề nghị (đồng)';
    const amt = parseInt(($('#r-amt').value || '').replace(/\D/g, '')) || 0;
    try {
      const d = await GET('/api/requests/route?' + new URLSearchParams({ type: ty, amount: amt, from: $('#r-from').value, to: range ? $('#r-to').value : $('#r-from').value }));
      if (!$('#r-route')) return;
      $('#r-route').innerHTML = d.steps.length ? d.steps.map((s, i) => (i ? '<span class="arr">→</span>' : '') + `<span class="who">${av(s.approver_id)}<span><b>${esc(s.full_name)}</b> · ${esc(s.label)}</span></span>`).join('') : 'Không cần duyệt — đề xuất được tự động phê duyệt.';
      const lv = $('#r-leave'); lv.hidden = !leave;
      if (leave) lv.innerHTML = `<div class="balance"><div><b class="num">${numFmt(d.leave.quota)}</b><span>Phép năm được hưởng</span></div><div><b class="num">${numFmt(d.leave.used)}</b><span>Đã nghỉ${d.leave.pending ? ` · ${numFmt(d.leave.pending)} đang chờ` : ''}</span></div><div><b class="num">${numFmt(d.leave.remaining)}</b><span>Còn lại</span></div></div><p class="hint" style="margin:6px 0 0">Số ngày nghỉ tính theo ngày làm việc (thứ Hai – thứ Sáu).</p>`;
    } catch (e) {}
  }, 250);
  $('#r-type').addEventListener('change', upd);
  ['#r-from', '#r-to'].forEach(x => $(x).addEventListener('change', upd));
  if (preset) { Object.entries(preset).forEach(([k, v]) => { const el = $('#r-' + k); if (el) el.value = v; }); }
  $('#r-amt').addEventListener('input', e => { const n = e.target.value.replace(/\D/g, ''); e.target.value = n ? Number(n).toLocaleString('vi-VN') : ''; upd(); });
  upd();
}
async function reqDetail(id) {
  const r = await GET('/api/requests/' + id);
  openModal(`${mh(esc(r.title), esc(r.code) + ' · ' + RTYPE[r.type])}
  <div class="modal-b">
    <dl class="kv">
      <dt>Người đề xuất</dt><dd>${who(r.creator_id)} <span class="muted">· ${esc(Dp(r.creator_dept).name)}</span></dd>
      <dt>Thời gian gửi</dt><dd class="num">${fmtDT(r.created_at)}</dd>
      ${r.type === 'nghiphep' ? `<dt>Thời gian nghỉ</dt><dd class="num">${fmtD(r.date_from)} – ${fmtD(r.date_to)} (${numFmt(r.days)} ngày làm việc)</dd><dt>Phép năm còn lại</dt><dd class="num">${numFmt(r.leave.remaining)} / ${numFmt(r.leave.quota)} ngày</dd>` : r.type === 'congtac' ? `<dt>Thời gian công tác</dt><dd class="num">${fmtD(r.date_from)} – ${fmtD(r.date_to)} (${numFmt(r.days)} ngày làm việc)</dd>` : r.type === 'tangca' ? `<dt>Làm thêm giờ</dt><dd class="num">${fmtD(r.date_from)} · ${numFmt(r.hours)} giờ</dd>` : r.type === 'giaitrinh' ? `<dt>Ngày giải trình</dt><dd class="num">${fmtD(r.date_from)}</dd>` : r.amount ? `<dt>Số tiền</dt><dd class="mono" style="font-weight:600">${vnd(r.amount)}</dd>` : ''}
      <dt>Lý do, căn cứ</dt><dd>${esc(r.reason)}</dd>
      <dt>Tình trạng</dt><dd><span class="pill s-${r.status}">${RSTATUS[r.status]}</span></dd>
    </dl>
    <h3 class="sec-t">Quá trình xử lý</h3>
    <ol class="steps">${r.steps.map((s, i) => `<li><span class="dot ${s.status}">${s.status === 'approved' ? '✓' : s.status === 'rejected' ? '✕' : i + 1}</span><div><b>${esc(s.full_name)}</b> <span class="muted">· ${esc(s.label)}</span>
      <div class="t-sub">${{ approved: 'Đã duyệt lúc ' + fmtDT(s.acted_at), rejected: 'Từ chối lúc ' + fmtDT(s.acted_at), pending: 'Đang xử lý', skipped: 'Không cần xử lý', waiting: 'Chờ bước trước' }[s.status]}</div>
      ${s.note ? `<div class="note">${esc(s.note)}</div>` : ''}</div></li>`).join('') || '<li class="muted">Đề xuất được tự động phê duyệt.</li>'}</ol>
    ${r.can_act ? `<div class="field"><label for="r-note">Ý kiến của bạn</label><textarea id="r-note" placeholder="Ý kiến chỉ đạo, điều kiện kèm theo (bắt buộc khi từ chối)"></textarea></div>` : ''}
    <p class="err" id="a-err" hidden></p>
  </div>
  <div class="modal-f">${r.can_withdraw ? '<button class="btn danger" data-act="m-withdraw" style="margin-right:auto">Thu hồi</button>' : ''}<button class="btn" data-act="close">Đóng</button>${r.can_act ? '<button class="btn danger" data-act="m-reject">Từ chối</button><button class="btn ok" data-act="m-approve">Phê duyệt</button>' : ''}</div>`, {
    'm-approve': btn => act(btn, 'approve'), 'm-reject': btn => act(btn, 'reject'),
    'm-withdraw': btn => { if (armed(btn, 'Bấm lần nữa để thu hồi')) act(btn, 'withdraw'); }
  });
  async function act(btn, a) {
    await busy(btn, async () => {
      try {
        const nr = await POST(`/api/requests/${r.id}/${a}`, { note: ($('#r-note') || {}).value || '' });
        closeModal(); await refreshBoot(); render();
        const nx = nr.steps.find(s => s.status === 'pending');
        toast(a === 'approve' ? (nx ? 'Đã duyệt, chuyển tiếp tới ' + nx.full_name : 'Đã duyệt, đề xuất hoàn tất') : a === 'reject' ? 'Đã từ chối đề xuất' : 'Đã thu hồi đề xuất');
      } catch (e) { showErr('#a-err', e); }
    });
  }
}

/* ================= QUY TRÌNH ================= */
VIEWS['quy-trinh'] = async main => {
  const box = pref.wfBox;
  const head = `<div class="page-head"><div><h1>Quy trình liên phòng ban</h1><p>Mỗi bước có người phụ trách và hạn xử lý; mọi lượt chuyển được ghi nhật ký</p></div>
  <div class="actions">${B.me.role === 'admin' ? '<button class="btn" data-act="new-tpl">+ Mẫu quy trình</button>' : ''}<button class="btn primary" data-act="new-run">+ Khởi tạo hồ sơ</button></div></div>
  <div class="toolbar"><div class="seg">${[['mine', `Chờ tôi xử lý (${B.counts.wf})`], ['involved', 'Tôi tham gia'], ['all', 'Tất cả hồ sơ'], ['tpl', 'Mẫu quy trình']].map(([k, l]) => `<button data-wbox="${k}" aria-pressed="${box === k}">${l}</button>`).join('')}</div></div>`;
  if (box === 'tpl') {
    const tpls = await GET('/api/wf/templates');
    main.innerHTML = head + `<div class="stack">${tpls.map(t => `<section class="card"><div class="card-h"><div><h2>${esc(t.name)} ${t.active ? '' : '<span class="pill s-cancelled">Ngừng sử dụng</span>'}</h2><span class="muted" style="font-size:12.5px">${esc(t.description)}</span></div>
      <div class="actions">${t.active ? `<button class="btn sm primary" data-act="start-tpl" data-id="${t.id}">Khởi tạo hồ sơ</button>` : ''}${B.me.role === 'admin' ? `<button class="btn sm" data-act="edit-tpl" data-id="${t.id}">Sửa</button>` : ''}</div></div>
      <div class="card-b"><div class="route">${t.steps.map((s, i) => (i ? '<span class="arr">→</span>' : '') + `<span><b>${i + 1}.</b> ${esc(s.name)} <span class="muted">(${esc(s.full_name || '—')}, ${s.duration_days} ngày)</span></span>`).join('')}</div></div></section>`).join('') || '<section class="card"><div class="empty">Chưa có mẫu quy trình.</div></section>'}</div>`;
    main._tpls = tpls;
    return;
  }
  const runs = await GET('/api/wf/runs?box=' + box);
  main.innerHTML = head + `<section class="card"><div class="list">${runs.length ? runs.map(r => `<div class="item" data-run="${r.id}"><div style="min-width:0;display:flex;flex-direction:column;gap:5px">
    <div class="top"><span class="code mono">${esc(r.code)}</span><span class="tag">${esc(r.template_name)}</span></div><h3>${esc(r.title)}</h3>
    <div class="meta">${who(r.creator_id)}<span class="num">Khởi tạo ${fmtDT(r.created_at)}</span>${r.cur_step ? `<span>Bước ${r.done_steps + 1}/${r.total_steps}: <b>${esc(r.cur_step)}</b> — ${esc(U(r.cur_assignee).full_name)}</span>` : ''}</div>
    <div class="prog" style="max-width:320px"><i style="width:${r.done_steps / Math.max(1, r.total_steps) * 100}%"></i></div></div>
    <div class="right">${r.status === 'running' && r.cur_due ? `<span class="num ${r.cur_due < TODAY() ? 'late' : 'muted'}">Hạn bước ${fmtD(r.cur_due)}</span>` : ''}<span class="pill s-${r.status}">${WSTATUS[r.status]}</span></div></div>`).join('')
    : `<div class="empty">${box === 'mine' ? 'Không có hồ sơ nào đang chờ bạn xử lý.' : 'Chưa có hồ sơ quy trình.'}</div>`}</div></section>`;
};
async function runForm(tplId) {
  const tpls = (await GET('/api/wf/templates')).filter(t => t.active);
  if (!tpls.length) return toast('Chưa có mẫu quy trình đang sử dụng.', true);
  let t = tpls.find(x => x.id === tplId) || tpls[0];
  openModal(`${mh('Khởi tạo hồ sơ quy trình')}
  <div class="modal-b"><div class="form">
    <div class="field full"><label for="w-tpl">Mẫu quy trình</label><select id="w-tpl">${tpls.map(x => `<option value="${x.id}" ${x.id === t.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
    <div class="field full"><label for="w-title">Trích yếu / tên hồ sơ</label><input id="w-title" placeholder="Ví dụ: Công văn số 125/UBND-VP ngày 01/11 về …"></div>
    <div class="field full"><label for="w-note">Ghi chú, yêu cầu</label><textarea id="w-note" placeholder="Thông tin cần lưu ý cho người xử lý"></textarea></div>
  </div><h3 class="sec-t">Phân công từng bước</h3><div id="w-steps" class="stack" style="gap:8px"></div><p class="err" id="w-err" hidden></p></div>
  <div class="modal-f"><button class="btn" data-act="close">Hủy</button><button class="btn primary" data-act="m-start">Khởi tạo</button></div>`, {
    'm-start': btn => busy(btn, async () => {
      const assignees = {}; $$('#w-steps select').forEach(s => assignees[s.dataset.seq] = s.value);
      try { const r = await POST('/api/wf/runs', { template_id: t.id, title: $('#w-title').value, note: $('#w-note').value, assignees }); closeModal(); pref.wfBox = 'involved'; savePref(); await refreshBoot(); if (current() !== 'quy-trinh') location.hash = 'quy-trinh'; else render(); toast('Đã khởi tạo hồ sơ ' + r.code); }
      catch (e) { showErr('#w-err', e); }
    })
  });
  const drawSteps = () => { $('#w-steps').innerHTML = t.steps.map(s => `<div class="step-edit" style="grid-template-columns:28px minmax(0,1fr) minmax(0,1fr) 70px"><span class="n">${s.seq}</span><span>${esc(s.name)}</span><select data-seq="${s.seq}" aria-label="Người phụ trách bước ${s.seq}">${userOpts(s.assignee_id)}</select><span class="muted num">${s.duration_days} ngày</span></div>`).join(''); };
  $('#w-tpl').addEventListener('change', e => { t = tpls.find(x => x.id === Number(e.target.value)); drawSteps(); });
  drawSteps();
}
async function runDetail(id) {
  const r = await GET('/api/wf/runs/' + id);
  const ACT = { start: 'khởi tạo', complete: 'hoàn thành', return: 'trả lại', cancel: 'hủy hồ sơ' };
  openModal(`${mh(esc(r.title), esc(r.code) + ' · ' + esc(r.template_name))}
  <div class="modal-b">
    <dl class="kv"><dt>Người khởi tạo</dt><dd>${who(r.creator_id)}</dd><dt>Thời gian</dt><dd class="num">${fmtDT(r.created_at)}</dd>${r.note ? `<dt>Ghi chú</dt><dd>${esc(r.note)}</dd>` : ''}<dt>Tình trạng</dt><dd><span class="pill s-${r.status}">${WSTATUS[r.status]}</span></dd></dl>
    <h3 class="sec-t">Các bước xử lý</h3>
    <ol class="steps">${r.steps.map(s => `<li><span class="dot ${s.status}">${s.status === 'done' ? '✓' : s.seq}</span><div><b>${esc(s.name)}</b><div class="meta muted" style="font-size:12.5px;display:flex;gap:10px;flex-wrap:wrap">${who(s.assignee_id)}<span>${s.duration_days} ngày</span>
      ${s.status === 'done' ? `<span>Xong ${fmtDT(s.done_at)}</span>` : s.status === 'active' ? `<span class="${s.due_date < TODAY() ? 'late' : ''}">Đang xử lý · hạn ${fmtD(s.due_date)}</span>` : ''}</div></div></li>`).join('')}</ol>
    <h3 class="sec-t">Nhật ký xử lý</h3>
    <ul class="feed">${r.logs.map(l => `<li>${av(l.user_id)}<div><b>${esc(l.full_name)}</b> ${ACT[l.action] || l.action}${l.step_name ? ` bước <b>${esc(l.step_name)}</b>` : ''}${l.note && l.action !== 'start' ? `<div class="note">${esc(l.note)}</div>` : ''}<time>${fmtDT(l.created_at)}</time></div></li>`).join('')}</ul>
    ${r.can_act || r.can_cancel ? `<div class="field"><label for="w-anote">Ý kiến, kết quả xử lý</label><textarea id="w-anote" placeholder="Kết quả xử lý bước này; bắt buộc ghi lý do khi trả lại hoặc hủy"></textarea></div>` : ''}
    <p class="err" id="wa-err" hidden></p>
  </div>
  <div class="modal-f">${r.can_cancel ? '<button class="btn danger" data-act="m-cancel" style="margin-right:auto">Hủy hồ sơ</button>' : ''}<button class="btn" data-act="close">Đóng</button>
    ${r.can_act && r.current.seq > 1 ? '<button class="btn" data-act="m-return">Trả lại bước trước</button>' : ''}${r.can_act ? `<button class="btn ok" data-act="m-complete">Hoàn thành bước ${r.current.seq}</button>` : ''}</div>`, {
    'm-complete': btn => act(btn, 'complete'), 'm-return': btn => act(btn, 'return'),
    'm-cancel': btn => { if (armed(btn, 'Bấm lần nữa để hủy')) act(btn, 'cancel'); }
  });
  async function act(btn, a) {
    await busy(btn, async () => {
      try { const nr = await POST(`/api/wf/runs/${r.id}/${a}`, { note: ($('#w-anote') || {}).value || '' }); closeModal(); await refreshBoot(); render();
        toast(a === 'complete' ? (nr.status === 'done' ? 'Hồ sơ đã hoàn thành' : 'Đã chuyển tới ' + nr.current.full_name) : a === 'return' ? 'Đã trả lại bước trước' : 'Đã hủy hồ sơ'); }
      catch (e) { showErr('#wa-err', e); }
    });
  }
}
function tplForm(t) {
  let steps = t ? t.steps.map(s => ({ name: s.name, assignee_id: s.assignee_id, duration_days: s.duration_days })) : [{ name: '', assignee_id: B.me.id, duration_days: 1 }, { name: '', assignee_id: B.me.id, duration_days: 1 }];
  const collect = () => { steps = $$('#tp-steps .step-edit').map(r => ({ name: $('input[data-k=name]', r).value, assignee_id: Number($('select', r).value), duration_days: Number($('input[data-k=days]', r).value) || 1 })); };
  const drawSteps = () => { $('#tp-steps').innerHTML = steps.map((s, i) => `<div class="step-edit"><span class="n">${i + 1}</span><input data-k="name" value="${esc(s.name)}" placeholder="Tên bước, ví dụ: Kế toán kiểm tra chứng từ" aria-label="Tên bước ${i + 1}"><select aria-label="Người phụ trách bước ${i + 1}">${userOpts(s.assignee_id)}</select><input data-k="days" type="number" min="1" max="365" value="${s.duration_days}" aria-label="Số ngày xử lý" title="Số ngày xử lý"><span style="display:flex;gap:2px"><button class="btn ghost sm" data-act="s-up" data-i="${i}" aria-label="Chuyển lên">↑</button><button class="btn ghost sm" data-act="s-del" data-i="${i}" aria-label="Xóa bước">×</button></span></div>`).join(''); };
  openModal(`${mh(t ? 'Sửa mẫu quy trình' : 'Tạo mẫu quy trình')}
  <div class="modal-b"><div class="form">
    <div class="field full"><label for="tp-n">Tên quy trình</label><input id="tp-n" value="${esc(t ? t.name : '')}" placeholder="Ví dụ: Thanh toán hợp đồng dịch vụ"></div>
    <div class="field full"><label for="tp-d">Phạm vi áp dụng</label><input id="tp-d" value="${esc(t ? t.description : '')}" placeholder="Áp dụng cho…"></div>
    ${t ? `<div class="field"><label for="tp-a">Tình trạng</label><select id="tp-a"><option value="1">Đang sử dụng</option><option value="0" ${t.active ? '' : 'selected'}>Ngừng sử dụng</option></select></div>` : ''}
  </div><h3 class="sec-t">Các bước (tên bước · người phụ trách mặc định · số ngày xử lý)</h3><div id="tp-steps" class="stack" style="gap:8px"></div>
  <button class="btn sm" data-act="s-add" style="align-self:flex-start">+ Thêm bước</button><p class="err" id="tp-err" hidden></p></div>
  <div class="modal-f"><button class="btn" data-act="close">Hủy</button><button class="btn primary" data-act="m-save">Lưu mẫu quy trình</button></div>`, {
    's-add': () => { collect(); steps.push({ name: '', assignee_id: B.me.id, duration_days: 1 }); drawSteps(); },
    's-del': btn => { collect(); steps.splice(Number(btn.dataset.i), 1); drawSteps(); },
    's-up': btn => { collect(); const i = Number(btn.dataset.i); if (i > 0) { [steps[i - 1], steps[i]] = [steps[i], steps[i - 1]]; drawSteps(); } },
    'm-save': btn => busy(btn, async () => { collect(); const body = { name: $('#tp-n').value, description: $('#tp-d').value, steps, active: t ? $('#tp-a').value === '1' : true };
      try { t ? await PUT('/api/wf/templates/' + t.id, body) : await POST('/api/wf/templates', body); closeModal(); pref.wfBox = 'tpl'; savePref(); render(); toast('Đã lưu mẫu quy trình'); } catch (e) { showErr('#tp-err', e); } })
  });
  drawSteps();
}

/* ================= NHÂN SỰ ================= */
let hrQ = '', hrDept = '';
VIEWS['nhan-su'] = async main => {
  const rows = await GET('/api/hr/employees?' + new URLSearchParams({ q: hrQ, dept: hrDept }));
  const hr = B.me.is_hr;
  main.innerHTML = `
  <div class="page-head"><div><h1>Nhân sự</h1><p>${rows.length} nhân sự đang làm việc${hr ? ' · Bạn có quyền quản lý hồ sơ' : ''}</p></div>${B.me.role === 'admin' ? '<div class="actions"><a class="btn" href="#quan-tri">Thêm tài khoản nhân sự</a></div>' : ''}</div>
  <div class="toolbar"><input class="search" id="hq" type="search" placeholder="Tìm theo tên, email, điện thoại…" value="${esc(hrQ)}" aria-label="Tìm nhân sự"><select class="sel" id="hd" aria-label="Phòng ban">${deptOpts(Number(hrDept) || null, 'Tất cả phòng ban')}</select></div>
  ${B.departments.filter(d => !hrDept || String(d.id) === String(hrDept)).map(d => { const mem = rows.filter(u => u.dept_id === d.id); if (!mem.length) return ''; return `<section class="card" style="margin-bottom:16px"><div class="card-h"><h2>${esc(d.name)} <span class="muted" style="font-weight:400">(${mem.length})</span></h2><span class="muted" style="font-size:12.5px">Phụ trách: ${esc(U(d.head_id).full_name)}</span></div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Họ và tên</th><th>Chức danh</th><th>Liên hệ</th>${hr ? '<th>Hợp đồng hiện hành</th>' : ''}<th class="r">Việc đang mở</th></tr></thead><tbody>
    ${mem.map(u => `<tr class="click" data-emp="${u.id}"><td>${who(u.id)}</td><td>${esc(u.title)}</td><td><div class="num">${esc(u.phone)}</div><div class="t-sub">${esc(u.email)}</div></td>
      ${hr ? `<td>${u.contract_type ? `<div>${esc(u.contract_type)}</div><div class="t-sub ${u.contract_end && dayNum(u.contract_end) - dayNum(TODAY()) <= 60 ? 'late' : ''}">${u.contract_end ? 'Hết hạn ' + fmtD(u.contract_end) : 'Không thời hạn'}</div>` : '<span class="faint">Chưa cập nhật</span>'}</td>` : ''}
      <td class="r num">${u.open_tasks}${u.late_tasks ? ` <span class="late">(${u.late_tasks} trễ)</span>` : ''}</td></tr>`).join('')}</tbody></table></div></section>`; }).join('') || '<section class="card"><div class="empty">Không tìm thấy nhân sự phù hợp.</div></section>'}`;
  $('#hq').addEventListener('input', debounce(e => { hrQ = e.target.value; render(); setTimeout(() => { const q = $('#hq'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }, 60); }, 350));
  $('#hd').addEventListener('change', e => { hrDept = e.target.value; render(); });
};
async function empModal(id) {
  const d = await GET('/api/hr/employees/' + id), p = d.profile, ed = d.can_edit ? '' : 'disabled';
  if (!d.full) {
    return openModal(`${mh(esc(p.full_name))}<div class="modal-b"><div class="profile-head">${av(p.id, 'lg')}<div><b>${esc(p.title)}</b><div class="muted">${esc(Dp(p.dept_id).name)}</div></div></div>
    <dl class="kv"><dt>Điện thoại</dt><dd class="num">${esc(p.phone) || '—'}</dd><dt>Email</dt><dd>${esc(p.email) || '—'}</dd></dl>
    <p class="notice info">Thông tin cá nhân chi tiết chỉ hiển thị với chính nhân sự và Phòng Hành chính – Nhân sự, theo quy định về bảo vệ dữ liệu cá nhân.</p></div><div class="modal-f"><button class="btn" data-act="close">Đóng</button></div>`);
  }
  openModal(`${mh('Hồ sơ nhân sự')}
  <div class="modal-b">
    <div class="profile-head">${av(p.id, 'lg')}<div><h2>${esc(p.full_name)}</h2><div class="muted">${esc(p.title)} · ${esc(Dp(p.dept_id).name)}</div></div></div>
    <div class="form">
      <div class="field"><label for="e-name">Họ và tên</label><input id="e-name" value="${esc(p.full_name)}" ${ed}></div>
      <div class="field"><label for="e-title">Chức danh</label><input id="e-title" value="${esc(p.title)}" ${ed}></div>
      <div class="field"><label for="e-dept">Phòng ban</label><select id="e-dept" ${ed}>${deptOpts(p.dept_id)}</select></div>
      <div class="field"><label for="e-join">Ngày vào làm</label><input type="date" id="e-join" value="${p.join_date || ''}" ${ed}></div>
      <div class="field"><label for="e-dob">Ngày sinh</label><input type="date" id="e-dob" value="${p.dob || ''}" ${ed}></div>
      <div class="field"><label for="e-gender">Giới tính</label><select id="e-gender" ${ed}>${['', 'Nam', 'Nữ', 'Khác'].map(g => `<option ${g === p.gender ? 'selected' : ''} value="${g}">${g || '—'}</option>`).join('')}</select></div>
      <div class="field"><label for="e-phone">Điện thoại</label><input id="e-phone" value="${esc(p.phone)}" ${ed}></div>
      <div class="field"><label for="e-email">Email</label><input id="e-email" value="${esc(p.email)}" ${ed}></div>
      <div class="field full"><label for="e-addr">Địa chỉ liên hệ</label><input id="e-addr" value="${esc(p.address)}" ${ed}></div>
      <div class="field"><label for="e-quota">Số ngày phép năm</label><input type="number" min="0" max="60" id="e-quota" value="${p.leave_quota}" ${ed}><span class="hint">Tối thiểu 12 ngày với điều kiện làm việc bình thường (Điều 113 Bộ luật Lao động 2019).</span></div>
    </div>
    <h3 class="sec-t">Ngày phép năm ${TODAY().slice(0, 4)}</h3>
    <div class="balance"><div><b class="num">${numFmt(d.leave.quota)}</b><span>Được hưởng</span></div><div><b class="num">${numFmt(d.leave.used)}</b><span>Đã nghỉ${d.leave.pending ? ` · ${numFmt(d.leave.pending)} đang chờ` : ''}</span></div><div><b class="num">${numFmt(d.leave.remaining)}</b><span>Còn lại</span></div></div>
    ${d.leaves.length ? `<div class="tbl-wrap"><table class="tbl" style="min-width:420px"><tbody>${d.leaves.map(l => `<tr class="click" data-req="${l.id}"><td class="mono">${esc(l.code)}</td><td class="num">${fmtD(l.date_from)} – ${fmtD(l.date_to)}</td><td class="num">${numFmt(l.days)} ngày</td><td><span class="pill s-${l.status}">${RSTATUS[l.status]}</span></td></tr>`).join('')}</tbody></table></div>` : ''}
    <h3 class="sec-t">Hợp đồng lao động</h3>
    ${d.contracts.length ? `<div class="tbl-wrap"><table class="tbl" style="min-width:520px"><thead><tr><th>Số hợp đồng</th><th>Loại</th><th>Hiệu lực</th><th>Hết hạn</th>${d.can_edit ? '<th></th>' : ''}</tr></thead><tbody>${d.contracts.map(c => `<tr><td class="mono">${esc(c.number)}</td><td>${esc(c.type)}</td><td class="num">${fmtD(c.start_date)}</td><td class="num">${c.end_date ? fmtD(c.end_date) : '—'}</td>${d.can_edit ? `<td class="r"><button class="btn ghost sm" data-act="c-del" data-id="${c.id}">Xóa</button></td>` : ''}</tr>`).join('')}</tbody></table></div>` : '<span class="hint">Chưa có hợp đồng.</span>'}
    ${d.can_edit ? `<div class="form three" style="background:var(--sunken);padding:12px;border-radius:8px">
      <div class="field"><label for="c-num">Số hợp đồng</label><input id="c-num" placeholder="15/2026/HĐLĐ"></div>
      <div class="field"><label for="c-type">Loại hợp đồng</label><select id="c-type"><option>Không xác định thời hạn</option><option>Xác định thời hạn 12 tháng</option><option>Xác định thời hạn 24 tháng</option><option>Xác định thời hạn 36 tháng</option><option>Thử việc</option></select></div>
      <div class="field"><label for="c-start">Ngày hiệu lực</label><input type="date" id="c-start"></div>
      <div class="field"><label for="c-end">Ngày hết hạn</label><input type="date" id="c-end"></div>
      <div class="field" style="justify-content:flex-end"><button class="btn sm" data-act="c-add">+ Thêm hợp đồng</button></div></div>` : ''}
    <p class="err" id="e-err" hidden></p>
  </div>
  <div class="modal-f"><button class="btn" data-act="close">Đóng</button>${d.can_edit ? '<button class="btn primary" data-act="m-save">Lưu hồ sơ</button>' : ''}</div>`, {
    'm-save': btn => busy(btn, async () => {
      try { await PUT('/api/hr/employees/' + p.id, { full_name: $('#e-name').value, title: $('#e-title').value, dept_id: $('#e-dept').value, join_date: $('#e-join').value, dob: $('#e-dob').value, gender: $('#e-gender').value, phone: $('#e-phone').value, email: $('#e-email').value, address: $('#e-addr').value, leave_quota: $('#e-quota').value });
        await refreshBoot(); closeModal(); render(); toast('Đã lưu hồ sơ nhân sự'); } catch (e) { showErr('#e-err', e); }
    }),
    'c-add': btn => busy(btn, async () => { try { await POST('/api/hr/contracts', { user_id: p.id, number: $('#c-num').value, type: $('#c-type').value, start_date: $('#c-start').value, end_date: $('#c-end').value }); empModal(p.id); toast('Đã thêm hợp đồng'); } catch (e) { showErr('#e-err', e); } }),
    'c-del': async btn => { if (!armed(btn, 'Xóa?')) return; try { await DEL('/api/hr/contracts/' + btn.dataset.id); empModal(p.id); } catch (e) { showErr('#e-err', e); } }
  });
}

/* ================= MỤC TIÊU – KPI ================= */
let goalCycle = '';
VIEWS['muc-tieu'] = async main => {
  const [cycles, data] = await Promise.all([GET('/api/goals/cycles'), GET('/api/goals?cycle=' + goalCycle)]);
  const cyc = data.cycle;
  const flat = []; const walk = (g, depth) => { flat.push([g, depth]); g.children.forEach(c => walk(c, depth + 1)); }; data.goals.forEach(g => walk(g, 0));
  const canCompany = B.me.role === 'admin' || B.me.is_director;
  const days = cyc ? [dayNum(cyc.start_date), dayNum(cyc.end_date)] : null;
  const timePct = days ? Math.max(0, Math.min(100, (dayNum(TODAY()) - days[0]) / Math.max(1, days[1] - days[0]) * 100)) : 0;
  main.innerHTML = `
  <div class="page-head"><div><h1>Mục tiêu – KPI</h1><p>${cyc ? `Chu kỳ ${esc(cyc.name)}: ${fmtD(cyc.start_date)} – ${fmtD(cyc.end_date)} · đã qua ${Math.round(timePct)}% thời gian` : 'Chưa có chu kỳ mục tiêu'}</p></div>
  <div class="actions">${cycles.length ? `<select class="sel" id="gcyc" aria-label="Chu kỳ">${cycles.map(c => `<option value="${c.id}" ${cyc && c.id === cyc.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>` : ''}
    ${B.me.role === 'admin' ? '<button class="btn" data-act="new-cycle">+ Chu kỳ</button>' : ''}${cyc ? '<button class="btn primary" data-act="new-goal">+ Mục tiêu</button>' : ''}</div></div>
  ${cyc ? `<section class="card">${flat.length ? flat.map(([g, dp]) => `<div class="goal child-${Math.min(dp, 3)}">
    <div class="g-t"><span class="lvl lvl-${g.level}">${LEVEL[g.level]}</span><div><b>${esc(g.title)}</b><div class="t-sub">${esc(g.owner_name)}${g.dept_name && g.level !== 'company' ? ' · ' + esc(g.dept_name) : ''}${g.children.length ? ` · tổng hợp từ ${g.children.length} mục tiêu con` : ''}${dp ? ` · trọng số ${numFmt(g.weight)}` : ''}</div></div></div>
    <div class="g-p"><span><b class="num">${numFmt(g.progress)}%</b>${g.children.length ? '' : `<span class="num">${numFmt(g.current)} / ${numFmt(g.target)} ${esc(g.unit)}</span>`}</span><div class="prog ${progClass(g.progress - (timePct - 50) * 0)}" title="Tiến độ ${numFmt(g.progress)}%"><i style="width:${g.progress}%"></i></div></div>
    <div class="g-a">${g.can_edit && !g.children.length ? `<button class="btn sm" data-act="goal-upd" data-id="${g.id}">Cập nhật</button>` : ''}<button class="btn ghost sm" data-act="goal-sub" data-id="${g.id}" title="Thêm mục tiêu con">+ Con</button>${g.can_edit ? `<button class="btn ghost sm" data-act="goal-edit" data-id="${g.id}">Sửa</button>` : ''}</div></div>`).join('')
    : '<div class="empty">Chưa có mục tiêu trong chu kỳ này.</div>'}</section>
    <p class="notice info" style="margin-top:14px">Tiến độ mục tiêu có mục tiêu con được tự động tính bằng trung bình có trọng số của các mục tiêu con. Màu thanh tiến độ: xanh ≥ 70%, vàng 40–70%, đỏ dưới 40%.</p>`
    : `<section class="card"><div class="empty">${B.me.role === 'admin' ? 'Tạo chu kỳ đầu tiên (ví dụ: Quý I/2027) để bắt đầu giao mục tiêu.' : 'Quản trị viên chưa tạo chu kỳ mục tiêu.'}</div></section>`}`;
  main._goals = flat.map(x => x[0]); main._cycle = cyc; main._canCompany = canCompany;
  const sel = $('#gcyc'); if (sel) sel.addEventListener('change', e => { goalCycle = e.target.value; render(); });
};
function goalForm(g, parent) {
  const main = $('#main'), cyc = main._cycle, canCompany = main._canCompany;
  const lvl = g ? g.level : parent ? (parent.level === 'company' ? 'dept' : 'user') : (canCompany ? 'company' : 'user');
  const all = main._goals.filter(x => !g || x.id !== g.id);
  openModal(`${mh(g ? 'Sửa mục tiêu' : parent ? 'Thêm mục tiêu con' : 'Thêm mục tiêu')}
  <div class="modal-b"><div class="form">
    <div class="field full"><label for="g-t">Nội dung mục tiêu</label><input id="g-t" value="${esc(g ? g.title : '')}" placeholder="Ví dụ: Doanh số bán hàng khu vực Ninh Bình"></div>
    <div class="field"><label for="g-l">Cấp mục tiêu</label><select id="g-l">${Object.entries(LEVEL).filter(([k]) => k !== 'company' || canCompany).map(([k, l]) => `<option value="${k}" ${k === lvl ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <div class="field"><label for="g-o">Người phụ trách</label><select id="g-o">${userOpts(g ? g.owner_id : B.me.id)}</select></div>
    <div class="field"><label for="g-tg">Chỉ tiêu</label><input id="g-tg" type="number" min="0" step="any" value="${g ? g.target : ''}" placeholder="Ví dụ: 5000"></div>
    <div class="field"><label for="g-u">Đơn vị tính</label><input id="g-u" value="${esc(g ? g.unit : '')}" placeholder="triệu đồng, %, hợp đồng…"></div>
    <div class="field"><label for="g-p">Thuộc mục tiêu cấp trên</label><select id="g-p"><option value="">— Không —</option>${all.map(x => `<option value="${x.id}" ${(g ? g.parent_id : parent && parent.id) === x.id ? 'selected' : ''}>${esc(LEVEL[x.level] + ': ' + x.title)}</option>`).join('')}</select></div>
    <div class="field"><label for="g-w">Trọng số</label><input id="g-w" type="number" min="0.1" step="0.1" value="${g ? g.weight : 1}"></div>
  </div><p class="err" id="g-err" hidden></p></div>
  <div class="modal-f">${g ? '<button class="btn danger" data-act="m-del" style="margin-right:auto">Xóa</button>' : ''}<button class="btn" data-act="close">Hủy</button><button class="btn primary" data-act="m-save">Lưu</button></div>`, {
    'm-save': btn => busy(btn, async () => {
      const body = { cycle_id: cyc.id, title: $('#g-t').value, level: $('#g-l').value, owner_id: $('#g-o').value, target: $('#g-tg').value, unit: $('#g-u').value, parent_id: $('#g-p').value, weight: $('#g-w').value };
      try { g ? await PUT('/api/goals/' + g.id, body) : await POST('/api/goals', body); closeModal(); render(); toast('Đã lưu mục tiêu'); } catch (e) { showErr('#g-err', e); }
    }),
    'm-del': async btn => { if (!armed(btn, 'Bấm lần nữa để xóa')) return; try { await DEL('/api/goals/' + g.id); closeModal(); render(); toast('Đã xóa mục tiêu'); } catch (e) { showErr('#g-err', e); } }
  });
}
async function goalUpdate(g) {
  const hist = await GET(`/api/goals/${g.id}/updates`);
  openModal(`${mh('Cập nhật kết quả thực hiện', esc(g.title))}
  <div class="modal-b"><div class="form">
    <div class="field"><label for="gu-v">Kết quả lũy kế đến nay (${esc(g.unit)})</label><input id="gu-v" type="number" min="0" step="any" value="${g.current}"><span class="hint">Chỉ tiêu: ${numFmt(g.target)} ${esc(g.unit)}</span></div>
    <div class="field full"><label for="gu-n">Diễn giải, minh chứng</label><textarea id="gu-n" placeholder="Nguồn số liệu, kết quả đạt được trong kỳ"></textarea></div>
  </div>
  ${hist.length ? `<h3 class="sec-t">Lịch sử cập nhật</h3><ul class="feed">${hist.map(h => `<li>${av(h.user_id)}<div><b>${esc(h.full_name)}</b> cập nhật <b class="num">${numFmt(h.value)} ${esc(g.unit)}</b>${h.note ? `<div class="note">${esc(h.note)}</div>` : ''}<time>${fmtDT(h.created_at)}</time></div></li>`).join('')}</ul>` : ''}
  <p class="err" id="gu-err" hidden></p></div>
  <div class="modal-f"><button class="btn" data-act="close">Hủy</button><button class="btn primary" data-act="m-save">Cập nhật</button></div>`, {
    'm-save': btn => busy(btn, async () => { try { await POST(`/api/goals/${g.id}/updates`, { value: $('#gu-v').value, note: $('#gu-n').value }); closeModal(); render(); toast('Đã cập nhật kết quả'); } catch (e) { showErr('#gu-err', e); } })
  });
}
function cycleForm() {
  const y = new Date().getFullYear(), q = Math.floor(new Date().getMonth() / 3) + 1, nq = q === 4 ? 1 : q + 1, ny = q === 4 ? y + 1 : y;
  const st = `${ny}-${pad((nq - 1) * 3 + 1)}-01`, en = iso(new Date(ny, nq * 3, 0));
  openModal(`${mh('Tạo chu kỳ mục tiêu')}<div class="modal-b"><div class="form three">
    <div class="field"><label for="cy-n">Tên chu kỳ</label><input id="cy-n" value="Quý ${['I', 'II', 'III', 'IV'][nq - 1]}/${ny}"></div>
    <div class="field"><label for="cy-s">Từ ngày</label><input type="date" id="cy-s" value="${st}"></div>
    <div class="field"><label for="cy-e">Đến ngày</label><input type="date" id="cy-e" value="${en}"></div></div><p class="err" id="cy-err" hidden></p></div>
  <div class="modal-f"><button class="btn" data-act="close">Hủy</button><button class="btn primary" data-act="m-save">Tạo chu kỳ</button></div>`, {
    'm-save': btn => busy(btn, async () => { try { const r = await POST('/api/goals/cycles', { name: $('#cy-n').value, start_date: $('#cy-s').value, end_date: $('#cy-e').value }); goalCycle = String(r.id); closeModal(); render(); toast('Đã tạo chu kỳ'); } catch (e) { showErr('#cy-err', e); } })
  });
}

/* ================= QUẢN TRỊ ================= */
let adminTab = 'users';
VIEWS['quan-tri'] = async main => {
  const tabs = `<div class="toolbar"><div class="seg">${[['users', 'Người dùng'], ['depts', 'Phòng ban'], ['settings', 'Cấu hình duyệt'], ['hrset', 'Chấm công & tiền lương'], ['backup', 'Sao lưu dữ liệu']].map(([k, l]) => `<button data-atab="${k}" aria-pressed="${adminTab === k}">${l}</button>`).join('')}</div></div>`;
  const head = `<div class="page-head"><div><h1>Quản trị hệ thống</h1><p>${esc(B.settings.org_name)}</p></div></div>` + tabs;
  if (adminTab === 'users') {
    const users = await GET('/api/admin/users');
    main.innerHTML = head + `<div class="toolbar"><span class="muted">${users.filter(u => u.active).length} tài khoản hoạt động · ${users.filter(u => !u.active).length} đã khóa</span><span class="spacer"></span><button class="btn" data-act="import-users">Nhập từ Excel (CSV)</button><button class="btn primary" data-act="new-user">+ Thêm người dùng</button></div>
    <section class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Họ và tên</th><th>Tên đăng nhập</th><th>Phòng ban</th><th>Quyền</th><th>Tình trạng</th></tr></thead><tbody>
    ${users.map(u => `<tr class="click" data-uadm="${u.id}"><td>${who(u.id)}<div class="t-sub">${esc(u.title)}</div></td><td class="mono">${esc(u.username)}</td><td>${esc(Dp(u.dept_id).name)}</td><td>${u.role === 'admin' ? '<span class="pill s-review">Quản trị</span>' : 'Người dùng'}</td><td>${u.active ? (u.must_change_pw ? '<span class="pill s-pending">Chưa đổi mật khẩu</span>' : '<span class="pill s-done">Hoạt động</span>') : '<span class="pill s-cancelled">Đã khóa</span>'}</td></tr>`).join('')}</tbody></table></div></section>`;
    main._users = users;
  } else if (adminTab === 'depts') {
    main.innerHTML = head + `<div class="toolbar"><span class="spacer"></span><button class="btn primary" data-act="new-dept">+ Thêm phòng ban</button></div>
    <section class="card"><div class="tbl-wrap"><table class="tbl" style="min-width:520px"><thead><tr><th>Phòng ban</th><th>Lãnh đạo phòng (duyệt cấp 1)</th><th class="r">Số nhân sự</th></tr></thead><tbody>
    ${B.departments.map(d => `<tr class="click" data-dept="${d.id}"><td class="t-title">${esc(d.name)}</td><td>${d.head_id ? who(d.head_id) : '<span class="late">Chưa chỉ định</span>'}</td><td class="r num">${B.users.filter(u => u.dept_id === d.id && u.active).length}</td></tr>`).join('')}</tbody></table></div></section>
    <p class="notice" style="margin-top:14px">Lãnh đạo phòng là người duyệt bước đầu tiên đối với mọi đề xuất của nhân sự trong phòng.</p>`;
  } else if (adminTab === 'settings') {
    const s = B.settings;
    main.innerHTML = head + `<section class="card"><div class="card-b"><div class="form">
      <div class="field full"><label for="st-org">Tên đơn vị</label><input id="st-org" value="${esc(s.org_name)}"></div>
      <div class="field"><label for="st-t1">Ngưỡng 1 — trên mức này chuyển Kế toán trưởng (đồng)</label><input id="st-t1" inputmode="numeric" value="${s.threshold1.toLocaleString('vi-VN')}"></div>
      <div class="field"><label for="st-t2">Ngưỡng 2 — trên mức này chuyển Giám đốc (đồng)</label><input id="st-t2" inputmode="numeric" value="${s.threshold2.toLocaleString('vi-VN')}"></div>
      <div class="field"><label for="st-acc">Kế toán trưởng</label><select id="st-acc">${userOpts(s.accountant_id)}</select></div>
      <div class="field"><label for="st-dir">Giám đốc / Thủ trưởng đơn vị</label><select id="st-dir">${userOpts(s.director_id)}</select></div>
      <div class="field"><label for="st-hra">Người duyệt nghỉ phép (Phòng HC–NS)</label><select id="st-hra">${userOpts(s.hr_approver_id)}</select></div>
      <div class="field"><label for="st-hrd">Phòng phụ trách nhân sự (được xem, sửa hồ sơ)</label><select id="st-hrd">${deptOpts(s.hr_dept_id, '— Chưa chọn —')}</select></div>
    </div><p class="err" id="st-err" hidden></p></div><div class="modal-f"><button class="btn primary" data-act="save-settings">Lưu cấu hình</button></div></section>
    <p class="notice" style="margin-top:14px">Thay đổi chỉ áp dụng cho đề xuất tạo mới; đề xuất đang xử lý giữ nguyên luồng duyệt đã xác định khi gửi.</p>`;
    $$('#st-t1,#st-t2').forEach(i => i.addEventListener('input', e => { const n = e.target.value.replace(/\D/g, ''); e.target.value = n ? Number(n).toLocaleString('vi-VN') : ''; }));
  } else if (adminTab === 'hrset') {
    main.innerHTML = head + window.SO_HR.hrSettingsHtml(B.settings);
  } else {
    main.innerHTML = head + `<section class="card"><div class="card-b stack" style="gap:12px">
      <p style="margin:0">Tải về bản sao toàn bộ cơ sở dữ liệu tại thời điểm hiện tại (tệp <span class="mono">.db</span>). Đề nghị sao lưu định kỳ hằng tuần và lưu bản sao ở thiết bị khác.</p>
      <div><a class="btn primary" href="/api/admin/backup">Tải bản sao lưu</a></div>
      <p class="hint" style="margin:0">Khôi phục: dừng máy chủ, đổi tên tệp sao lưu thành <span class="mono">smartoffice.db</span> và chép đè vào thư mục <span class="mono">data</span> của ứng dụng, sau đó khởi động lại.</p></div></section>`;
  }
};
function userForm(u) {
  openModal(`${mh(u ? 'Sửa tài khoản' : 'Thêm người dùng')}<div class="modal-b"><div class="form">
    <div class="field"><label for="u-name">Họ và tên</label><input id="u-name" value="${esc(u ? u.full_name : '')}"></div>
    <div class="field"><label for="u-user">Tên đăng nhập</label><input id="u-user" value="${esc(u ? u.username : '')}" ${u ? 'disabled' : ''} placeholder="vd: nam.nv"></div>
    <div class="field"><label for="u-title">Chức danh</label><input id="u-title" value="${esc(u ? u.title : '')}"></div>
    <div class="field"><label for="u-dept">Phòng ban</label><select id="u-dept">${deptOpts(u ? u.dept_id : null)}</select></div>
    <div class="field"><label for="u-email">Email</label><input id="u-email" value="${esc(u ? u.email : '')}"></div>
    <div class="field"><label for="u-phone">Điện thoại</label><input id="u-phone" value="${esc(u ? u.phone : '')}"></div>
    <div class="field"><label for="u-role">Quyền</label><select id="u-role"><option value="user">Người dùng</option><option value="admin" ${u && u.role === 'admin' ? 'selected' : ''}>Quản trị viên</option></select></div>
    ${u ? `<div class="field"><label for="u-active">Tình trạng</label><select id="u-active"><option value="1">Hoạt động</option><option value="0" ${u.active ? '' : 'selected'}>Khóa tài khoản (nghỉ việc)</option></select></div>` : ''}
    <div class="field full"><label for="u-pw">${u ? 'Cấp lại mật khẩu (để trống nếu không đổi)' : 'Mật khẩu khởi tạo'}</label><input id="u-pw" type="text" autocomplete="new-password" placeholder="Tối thiểu 8 ký tự"><span class="hint">Người dùng bắt buộc đổi mật khẩu ở lần đăng nhập tiếp theo.</span></div>
  </div><p class="err" id="u-err" hidden></p></div>
  <div class="modal-f"><button class="btn" data-act="close">Hủy</button><button class="btn primary" data-act="m-save">Lưu</button></div>`, {
    'm-save': btn => busy(btn, async () => {
      const body = { full_name: $('#u-name').value, title: $('#u-title').value, dept_id: $('#u-dept').value, email: $('#u-email').value, phone: $('#u-phone').value, role: $('#u-role').value };
      try {
        if (u) { body.active = $('#u-active').value === '1'; if ($('#u-pw').value) body.password = $('#u-pw').value; await PUT('/api/admin/users/' + u.id, body); }
        else { body.username = $('#u-user').value; body.password = $('#u-pw').value; await POST('/api/admin/users', body); }
        await refreshBoot(); closeModal(); render(); toast('Đã lưu tài khoản');
      } catch (e) { showErr('#u-err', e); }
    })
  });
}
function importForm() {
  openModal(`${mh('Nhập danh sách người dùng')}<div class="modal-b">
    <p class="notice info">Trong Excel, lập bảng với 6 cột theo đúng thứ tự: <b>Tên đăng nhập, Họ và tên, Chức danh, Phòng ban, Email, Điện thoại</b> (dòng đầu là tiêu đề). Chọn <i>Lưu thành › CSV UTF-8</i>, rồi chọn tệp bên dưới. Phòng ban chưa có sẽ được tạo mới.</p>
    <div class="field"><label for="im-file">Tệp CSV</label><input type="file" id="im-file" accept=".csv,text/csv"></div>
    <div class="field"><label for="im-pw">Mật khẩu khởi tạo chung</label><input id="im-pw" type="text" placeholder="Tối thiểu 8 ký tự"><span class="hint">Mọi tài khoản phải đổi mật khẩu khi đăng nhập lần đầu.</span></div>
    <div id="im-prev" class="hint"></div><p class="err" id="im-err" hidden></p></div>
  <div class="modal-f"><button class="btn" data-act="close">Hủy</button><button class="btn primary" data-act="m-imp">Nhập dữ liệu</button></div>`, {
    'm-imp': btn => busy(btn, async () => {
      try {
        if (!rows.length) throw new Error('Vui lòng chọn tệp CSV có dữ liệu.');
        const r = await POST('/api/admin/users/import', { rows, password: $('#im-pw').value });
        await refreshBoot(); render();
        $('#im-prev').innerHTML = `<b>Đã nhập ${r.ok} tài khoản.</b>${r.errors.length ? '<br>' + r.errors.slice(0, 30).map(esc).join('<br>') : ''}`;
        toast(`Đã nhập ${r.ok} tài khoản`);
      } catch (e) { showErr('#im-err', e); }
    })
  });
  let rows = [];
  $('#im-file').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    const text = (await f.text()).replace(/^﻿/, '');
    const delim = (text.split('\n')[0].match(/;/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
    const parse = line => { const out = []; let cur = '', q = false; for (let i = 0; i < line.length; i++) { const c = line[i]; if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; } else if (c === '"') q = true; else if (c === delim) { out.push(cur); cur = ''; } else cur += c; } out.push(cur); return out.map(s => s.trim()); };
    rows = text.split(/\r?\n/).slice(1).filter(l => l.trim()).map(parse).map(c => ({ username: c[0], full_name: c[1], title: c[2], department: c[3], email: c[4], phone: c[5] }));
    $('#im-prev').innerHTML = `Đọc được <b>${rows.length}</b> dòng. Ví dụ: ${rows.slice(0, 3).map(r => esc(r.full_name + ' (' + r.username + ')')).join(', ')}`;
  });
}
function deptForm(d) {
  openModal(`${mh(d ? 'Sửa phòng ban' : 'Thêm phòng ban')}<div class="modal-b"><div class="form">
    <div class="field full"><label for="d-n">Tên phòng ban</label><input id="d-n" value="${esc(d ? d.name : '')}" placeholder="Ví dụ: Phòng Kế hoạch – Đầu tư"></div>
    <div class="field full"><label for="d-h">Lãnh đạo phòng</label><select id="d-h"><option value="">— Chưa chỉ định —</option>${userOpts(d ? d.head_id : null)}</select></div>
  </div><p class="err" id="d-err" hidden></p></div>
  <div class="modal-f">${d ? '<button class="btn danger" data-act="m-del" style="margin-right:auto">Xóa</button>' : ''}<button class="btn" data-act="close">Hủy</button><button class="btn primary" data-act="m-save">Lưu</button></div>`, {
    'm-save': btn => busy(btn, async () => { const body = { name: $('#d-n').value, head_id: $('#d-h').value }; try { d ? await PUT('/api/admin/departments/' + d.id, body) : await POST('/api/admin/departments', body); await refreshBoot(); closeModal(); render(); toast('Đã lưu phòng ban'); } catch (e) { showErr('#d-err', e); } }),
    'm-del': async btn => { if (!armed(btn, 'Bấm lần nữa để xóa')) return; try { await DEL('/api/admin/departments/' + d.id); await refreshBoot(); closeModal(); render(); toast('Đã xóa phòng ban'); } catch (e) { showErr('#d-err', e); } }
  });
}

/* ================= TÀI KHOẢN ================= */
VIEWS['tai-khoan'] = async main => {
  main.innerHTML = `<div class="page-head"><div><h1>Tài khoản của tôi</h1><p>${esc(B.me.username)}</p></div></div>
  <div class="grid2"><section class="card"><div class="card-b"><div class="profile-head">${av(B.me.id, 'lg')}<div><h2 style="font-size:18px">${esc(B.me.full_name)}</h2><div class="muted">${esc(B.me.title)} · ${esc(Dp(B.me.dept_id).name)}</div></div></div>
  <dl class="kv" style="margin-top:14px"><dt>Email</dt><dd>${esc(B.me.email) || '—'}</dd><dt>Điện thoại</dt><dd>${esc(B.me.phone) || '—'}</dd><dt>Quyền</dt><dd>${B.me.role === 'admin' ? 'Quản trị viên' : 'Người dùng'}${B.me.is_hr ? ' · Quản lý nhân sự' : ''}</dd></dl>
  <div class="actions" style="margin-top:14px"><button class="btn" data-emp="${B.me.id}">Xem hồ sơ & ngày phép</button><button class="btn primary" data-act="change-pw">Đổi mật khẩu</button></div></div></section></div>`;
};
function passwordModal(force) {
  openModal(`${force ? '<div class="modal-h"><div><h2>Đổi mật khẩu lần đầu</h2></div></div>' : mh('Đổi mật khẩu')}<div class="modal-b">
    ${force ? '<p class="notice">Vì lý do bảo mật, bạn cần đổi mật khẩu được cấp trước khi sử dụng hệ thống.</p>' : ''}
    <div class="field"><label for="pw-o">Mật khẩu hiện tại</label><input id="pw-o" type="password" autocomplete="current-password"></div>
    <div class="field"><label for="pw-n">Mật khẩu mới</label><input id="pw-n" type="password" autocomplete="new-password"><span class="hint">Tối thiểu 8 ký tự, gồm cả chữ và số.</span></div>
    <div class="field"><label for="pw-c">Nhập lại mật khẩu mới</label><input id="pw-c" type="password" autocomplete="new-password"></div>
    <p class="err" id="pw-err" hidden></p></div>
  <div class="modal-f">${force ? '<button class="btn" data-act="logout">Đăng xuất</button>' : '<button class="btn" data-act="close">Hủy</button>'}<button class="btn primary" data-act="m-save">Đổi mật khẩu</button></div>`, {
    'm-save': btn => busy(btn, async () => {
      if ($('#pw-n').value !== $('#pw-c').value) return showErr('#pw-err', 'Mật khẩu nhập lại không khớp.');
      try { await PUT('/api/me/password', { old_password: $('#pw-o').value, new_password: $('#pw-n').value }); B.me.must_change_pw = false; closeModal(); toast('Đã đổi mật khẩu'); } catch (e) { showErr('#pw-err', e); }
    })
  });
  $('#modal').dataset.force = force ? '1' : '';
}

/* ================= Sự kiện chung ================= */
const ACTIONS = {
  dd: btn => { const d = btn.closest('.dd'), was = d.classList.contains('open'); closeMenus(); if (!was) { d.classList.add('open'); btn.setAttribute('aria-expanded', 'true'); } },
  'toggle-nav': btn => { const o = document.body.classList.toggle('nav-open'); btn.setAttribute('aria-expanded', String(o)); },
  'quick-check': btn => busy(btn, async () => {
    try { const x = await POST('/api/attendance/check'); toast(x.action === 'in' ? `Đã chấm công vào ca lúc ${x.time}` : `Đã chấm công ra ca lúc ${x.time}`); await refreshClock(); if (current() === 'cham-cong') render(); } catch (e) { toast(e.message, true); }
  }),
  close: () => { if ($('#modal').dataset.force !== '1') closeModal(); },
  reload: () => render(),
  'retry-boot': () => boot(),
  logout: async () => { try { await POST('/api/logout'); } catch (e) {} B = null; closeModal(); $('#modal').dataset.force = ''; renderLogin(); },
  'new-task': () => taskModal(null).catch(e => toast(e.message, true)),
  'new-req': () => reqForm(),
  'new-run': () => runForm().catch(e => toast(e.message, true)),
  'start-tpl': btn => runForm(Number(btn.dataset.id)).catch(e => toast(e.message, true)),
  'new-tpl': () => tplForm(null),
  'edit-tpl': btn => tplForm(($('#main')._tpls || []).find(t => t.id === Number(btn.dataset.id))),
  'new-project': () => projectModal(null),
  'edit-project': () => projectModal(B.projects.find(p => String(p.id) === String(pref.project))),
  'new-goal': () => goalForm(null, null),
  'goal-sub': btn => goalForm(null, $('#main')._goals.find(g => g.id === Number(btn.dataset.id))),
  'goal-edit': btn => goalForm($('#main')._goals.find(g => g.id === Number(btn.dataset.id))),
  'goal-upd': btn => goalUpdate($('#main')._goals.find(g => g.id === Number(btn.dataset.id))).catch(e => toast(e.message, true)),
  'new-cycle': () => cycleForm(),
  'new-user': () => userForm(null),
  'import-users': () => importForm(),
  'new-dept': () => deptForm(null),
  'change-pw': () => passwordModal(false),
  'save-settings': btn => busy(btn, async () => {
    const n = id => $(id).value.replace(/\D/g, '');
    try { B.settings = await PUT('/api/admin/settings', { org_name: $('#st-org').value, threshold1: n('#st-t1'), threshold2: n('#st-t2'), accountant_id: $('#st-acc').value, director_id: $('#st-dir').value, hr_approver_id: $('#st-hra').value, hr_dept_id: $('#st-hrd').value }); await refreshBoot(); toast('Đã lưu cấu hình'); }
    catch (e) { showErr('#st-err', e); }
  })
};
document.addEventListener('click', e => {
  if (!e.target.closest('.dd')) closeMenus();
  const a = e.target.closest('[data-act]');
  if (a) {
    const k = a.dataset.act;
    if (a.tagName !== 'A') e.preventDefault();
    if (MH[k] && a.closest('#modal')) return MH[k](a, e);
    if (ACTIONS[k]) return ACTIONS[k](a, e);
    return;
  }
  if (e.target === $('#overlay')) { if ($('#modal').dataset.force !== '1') closeModal(); return; }
  const inModal = !!e.target.closest('#modal');
  const pick = (attr, fn) => { const el = e.target.closest('[' + attr + ']'); if (el) { fn(el.getAttribute(attr)); return true; } return false; };
  if (pick('data-req', id => reqDetail(id).catch(er => toast(er.message, true)))) return;
  if (pick('data-emp', id => empModal(id).catch(er => toast(er.message, true)))) return;
  if (inModal) return;
  if (pick('data-task', id => taskModal(id).catch(er => toast(er.message, true)))) return;
  if (pick('data-run', id => runDetail(id).catch(er => toast(er.message, true)))) return;
  if (pick('data-uadm', id => userForm(($('#main')._users || []).find(u => u.id === Number(id))))) return;
  if (pick('data-dept', id => deptForm(B.departments.find(d => d.id === Number(id))))) return;
  if (pick('data-proj', id => { pref.project = id; savePref(); render(); })) return;
  if (pick('data-view', v => { pref.view = v; savePref(); render(); })) return;
  if (pick('data-rbox', v => { pref.reqBox = v; savePref(); render(); })) return;
  if (pick('data-wbox', v => { pref.wfBox = v; savePref(); render(); })) return;
  if (pick('data-atab', v => { adminTab = v; render(); })) return;
});
document.addEventListener('change', e => { if (e.target.dataset.cl && MH['cl-toggle']) MH['cl-toggle'](e.target); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('#overlay').hidden && $('#modal').dataset.force !== '1') closeModal();
  if (e.key === 'Enter' && (e.target.id === 'cl-new' || e.target.id === 'cm-new')) { e.preventDefault(); const b = $(`[data-act="${e.target.id === 'cl-new' ? 'cl-add' : 'cm-add'}"]`); if (b) b.click(); }
});
window.addEventListener('hashchange', () => { if (B) render(); });

window.SO = { $, $$, esc, pad, iso, TODAY, addDays, dayNum, fmtD, fmtDT, vnd, numFmt, WD, debounce, GET, POST, PUT, DEL, U, Dp, av, who, userOpts, deptOpts, openModal, closeModal, toast, showErr, mh, busy, armed, VIEWS, ACTIONS, render, refreshBoot, reqForm, boot, get B() { return B; } };
window.addEventListener('DOMContentLoaded', boot);
setInterval(() => { if (B && document.visibilityState === 'visible') refreshBoot(); }, 30000);
})();
