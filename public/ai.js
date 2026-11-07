/* SmartOffice — Trợ lý AI hội thoại đa nhiệm (ADR-010).
 * - Nút "Trợ lý" chỉ hiện khi quản trị viên đã bật (GET /api/ai/status).
 * - Hội thoại giữ trong bộ nhớ trang (không lưu trình duyệt, không lưu máy chủ); tải lại trang là bắt đầu lại.
 * - Thao tác ghi do trợ lý đề nghị hiện thẻ xác nhận; chỉ khi người dùng bấm "Xác nhận" máy chủ mới thực hiện.
 * - Phím tắt: Ctrl + / (hoặc ⌘ + /) mở/đóng; Esc đóng. */
(function () {
'use strict';
const S = window.SO;
const { $, esc, GET, POST, PUT, toast, showErr, render, ACTIONS } = S;
const SUGGEST = ['Hôm nay tôi cần làm gì?', 'Đề xuất nào đang chờ tôi duyệt?', 'Lịch họp tuần này của tôi', 'Tìm quy chế chi tiêu nội bộ'];
let enabled = false, open = false, busy = false, hist = [], items = [];

/* Văn bản trả lời: chỉ thoát HTML, giữ xuống dòng, đậm **...**, mã #123 → mở công việc */
const fmt = t => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[\s(])#(\d{1,7})\b/g, '$1<button type="button" class="ai-link" data-task="$2">#$2</button>').replace(/\n/g, '<br>');

function ensurePanel() {
  if ($('#ai-panel')) return;
  document.body.insertAdjacentHTML('beforeend', `
  <button class="ai-fab" id="ai-fab" data-act="ai-toggle" aria-controls="ai-panel" aria-expanded="false" title="Trợ lý AI (Ctrl + /)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z"/><path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/></svg><span>Trợ lý</span></button>
  <aside class="ai-panel" id="ai-panel" role="dialog" aria-modal="false" aria-labelledby="ai-title" hidden>
    <header class="ai-head"><h2 id="ai-title">Trợ lý AI</h2><span class="spacer"></span>
      <button class="btn sm" data-act="ai-new" title="Bắt đầu cuộc trò chuyện mới">Cuộc trò chuyện mới</button>
      <button class="btn sm ai-x" data-act="ai-toggle" aria-label="Đóng trợ lý">✕</button></header>
    <div class="ai-log" id="ai-log" aria-live="polite"></div>
    <form class="ai-form" id="ai-form"><label for="ai-in" class="sr-only">Nhập yêu cầu cho trợ lý</label>
      <textarea id="ai-in" rows="2" maxlength="4000" placeholder="Ví dụ: Giao Lan báo cáo tuần, hạn thứ Sáu…"></textarea>
      <button class="btn primary" type="submit" id="ai-send">Gửi</button></form>
    <p class="ai-note">Trợ lý có thể sai; hãy kiểm tra trước khi xác nhận. Nội dung bạn nhập và dữ liệu tra cứu (đã ẩn thông tin cá nhân theo cấu hình) được gửi tới nhà cung cấp AI.</p>
  </aside>`);
  $('#ai-form').addEventListener('submit', e => { e.preventDefault(); send($('#ai-in').value); });
  $('#ai-in').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send($('#ai-in').value); } });
  draw();
}

function draw() {
  const log = $('#ai-log'); if (!log) return;
  log.innerHTML = items.length ? items.map(it => {
    if (it.k === 'user') return `<div class="ai-msg me"><div class="ai-bub">${esc(it.text).replace(/\n/g, '<br>')}</div></div>`;
    if (it.k === 'bot') return `<div class="ai-msg"><div class="ai-bub">${fmt(it.text)}</div></div>`;
    if (it.k === 'err') return `<div class="ai-msg"><p class="err" role="alert">${esc(it.text)}</p></div>`;
    if (it.k === 'act') return `<div class="ai-act ${it.st}" data-aid="${it.id}"><div class="ai-act-h">Đề nghị: ${esc(it.label)}</div><p>${esc(it.summary)}</p>
      ${it.st === 'pending' ? `<div class="actions"><button class="btn primary sm" data-act="ai-ok" data-id="${it.id}">Xác nhận</button><button class="btn sm" data-act="ai-no" data-id="${it.id}">Bỏ qua</button></div>`
        : `<p class="ai-act-st">${it.st === 'done' ? '✓ Đã thực hiện.' : it.st === 'cancelled' ? 'Đã bỏ qua.' : '✗ ' + esc(it.msg || 'Không thực hiện được.')}</p>`}</div>`;
    return '';
  }).join('') + (busy ? `<div class="ai-msg"><div class="ai-bub ai-wait"><span class="ai-dots" aria-hidden="true"></span> ${esc(busy === true ? 'Đang xử lý…' : busy)}</div></div>` : '')
    : `<div class="ai-empty"><p>Tôi có thể tra cứu công việc, đề xuất, lịch họp, tài liệu và lập đề nghị giao việc, gửi đề xuất, đặt lịch họp để bạn xác nhận.</p><div class="ai-sug">${SUGGEST.map(s => `<button class="chip" data-act="ai-sug">${esc(s)}</button>`).join('')}</div></div>`;
  log.scrollTop = log.scrollHeight;
  const b = $('#ai-send'); if (b) b.disabled = !!busy;
}

async function send(text) {
  text = String(text || '').trim(); if (!text || busy) return;
  $('#ai-in').value = '';
  hist.push({ role: 'user', text }); items.push({ k: 'user', text }); busy = true; draw();
  let answered = false;
  try {
    const res = await fetch('/api/ai/chat', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: hist.slice(-20) }) });
    if (!res.ok || !res.body) { let m = 'Lỗi ' + res.status; try { m = (await res.json()).error || m; } catch (e) {} throw new Error(m); }
    const rd = res.body.getReader(), dec = new TextDecoder(); let buf = '';
    for (;;) {
      const { value, done } = await rd.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      let i; while ((i = buf.indexOf('\n\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 2); if (line.startsWith('data: ')) { try { onEvent(JSON.parse(line.slice(6))); } catch (e) {} } }
    }
    answered = true;
  } catch (e) { items.push({ k: 'err', text: e.offline || /fetch/i.test(e.message) ? 'Mất kết nối máy chủ. Vui lòng thử lại.' : e.message }); }
  busy = false; draw();
  if (!answered) hist.pop();
  function onEvent(ev) {
    if (ev.type === 'status') { busy = ev.text + '…'; draw(); }
    else if (ev.type === 'action') { items.push({ k: 'act', id: ev.id, label: ev.label, summary: ev.summary, st: 'pending' }); draw(); }
    else if (ev.type === 'text') { items.push({ k: 'bot', text: ev.text }); hist.push({ role: 'assistant', text: ev.text }); draw(); }
    else if (ev.type === 'error') { items.push({ k: 'err', text: ev.message }); if (ev.status === 403 || ev.status === 401) check(); draw(); }
  }
}

async function decide(id, ok) {
  const it = items.find(x => x.k === 'act' && x.id === id); if (!it || it.st !== 'pending') return;
  try {
    const r = await POST(`/api/ai/pending/${id}/${ok ? 'confirm' : 'cancel'}`);
    it.st = r.status; it.msg = r.message;
    hist.push({ role: 'assistant', text: `[Hệ thống] Người dùng đã ${ok ? 'xác nhận' : 'bỏ qua'} đề nghị số ${id} (${it.summary}). Kết quả: ${ok ? (r.ok ? 'đã thực hiện' : 'không thực hiện được – ' + r.message) : 'không thực hiện'}.` });
    if (ok && r.ok) { toast('Đã thực hiện: ' + it.label); S.refreshBoot && S.refreshBoot(); render(); }
  } catch (e) { it.st = 'failed'; it.msg = e.message; }
  draw();
}

function toggle(force) {
  if (!enabled && force !== false) return;
  open = force === undefined ? !open : force;
  ensurePanel();
  $('#ai-panel').hidden = !open; $('#ai-fab').setAttribute('aria-expanded', String(open)); document.body.classList.toggle('ai-open', open);
  if (open) setTimeout(() => $('#ai-in') && $('#ai-in').focus(), 30); else if (!$('#ai-fab').hidden) $('#ai-fab').focus();
}

async function check() {
  try { enabled = !!(await GET('/api/ai/status')).enabled; } catch (e) { enabled = false; }
  if (enabled) ensurePanel();
  const fab = $('#ai-fab'); if (fab) fab.hidden = !enabled;
  if (!enabled && open) { open = false; const p = $('#ai-panel'); if (p) p.hidden = true; document.body.classList.remove('ai-open'); }
}

Object.assign(ACTIONS, {
  'ai-toggle': () => toggle(),
  'ai-new': () => { if (busy) return; hist = []; items = []; draw(); $('#ai-in').focus(); },
  'ai-sug': b => send(b.textContent),
  'ai-ok': b => decide(Number(b.dataset.id), true),
  'ai-no': b => decide(Number(b.dataset.id), false),
  'ai-save': btn => S.busy(btn, async () => {
    try {
      const r = await PUT('/api/admin/ai-settings', { enabled: $('#ai-en').checked, allow_pii: $('#ai-pii').checked, daily_tokens: Number(String($('#ai-q').value).replace(/\D/g, '')) });
      toast('Đã lưu cấu hình trợ lý AI'); enabled = r.enabled; check(); render();
    } catch (e) { showErr('#ai-err', e); }
  })
});
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === '/') { e.preventDefault(); toggle(); }
  else if (e.key === 'Escape' && open && $('#overlay').hidden) toggle(false);
});

/* Màn hình Quản trị › Trợ lý AI */
async function adminHtml() {
  const s = await GET('/api/admin/ai-settings');
  const n = v => (Number(v) || 0).toLocaleString('vi-VN');
  return `<section class="card"><div class="card-b stack" style="gap:12px">
    <label class="check"><input type="checkbox" id="ai-en" ${s.enabled ? 'checked' : ''}> Bật trợ lý AI cho toàn đơn vị</label>
    <label class="check"><input type="checkbox" id="ai-pii" ${s.allow_pii ? 'checked' : ''}> Cho phép gửi thông tin cá nhân (thư điện tử, số điện thoại, ngày sinh, số giấy tờ, tài khoản ngân hàng, lương) tới nhà cung cấp AI</label>
    <div class="field" style="max-width:320px"><label for="ai-q">Hạn mức token mỗi người mỗi ngày</label><input id="ai-q" inputmode="numeric" value="${n(s.daily_tokens)}"></div>
    <p class="err" id="ai-err" hidden></p></div><div class="modal-f"><button class="btn primary" data-act="ai-save">Lưu cấu hình</button></div></section>
  <p class="notice warn" style="margin-top:14px" role="note">Câu hỏi của người dùng và dữ liệu tra cứu được gửi tới nhà cung cấp AI ở nước ngoài. Chỉ bật khi đơn vị đã hoàn tất thủ tục theo quy định về bảo vệ dữ liệu cá nhân. Chỉ cho phép gửi thông tin cá nhân khi có văn bản đồng ý. Nhà cung cấp và khóa API do quản trị hệ thống khai báo tại máy chủ (biến môi trường <span class="mono">AI_PROVIDER</span>, <span class="mono">AI_API_KEY</span>, <span class="mono">AI_MODEL</span>).</p>
  <section class="card" style="margin-top:14px"><div class="card-h"><h2>Sử dụng 30 ngày gần nhất</h2></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Người dùng</th><th class="r">Số lượt</th><th class="r">Token vào</th><th class="r">Token ra</th></tr></thead><tbody>
    ${s.usage_30d.length ? s.usage_30d.map(u => `<tr><td>${esc(u.full_name || '#' + u.user_id)}</td><td class="r num">${n(u.turns)}</td><td class="r num">${n(u.tokens_in)}</td><td class="r num">${n(u.tokens_out)}</td></tr>`).join('') : '<tr><td colspan="4" class="hint">Chưa có lượt sử dụng.</td></tr>'}</tbody></table></div></section>`;
}
window.SO_AI = { adminHtml, check };

/* Khởi động khi giao diện chính xuất hiện (sau đăng nhập), ẩn khi trở về màn hình đăng nhập; không gọi máy chủ định kỳ */
let shown = false;
const sync = () => { const has = !!document.querySelector('#root .app'); if (has && !shown) { shown = true; check(); } else if (!has && shown) { shown = false; enabled = false; hist = []; items = []; const fab = $('#ai-fab'); if (fab) fab.hidden = true; if (open) toggle(false); } };
new MutationObserver(sync).observe(document.getElementById('root'), { childList: true });
sync();
})();
