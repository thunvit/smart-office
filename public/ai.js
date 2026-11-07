/* SmartOffice — Trợ lý AI hội thoại đa nhiệm (ADR-010).
 * - Nút "Trợ lý" chỉ hiện khi quản trị viên đã bật (GET /api/ai/status).
 * - Mỗi người tự cấu hình trợ lý của mình tại Tài khoản › Trợ lý AI của tôi: nhà cung cấp, mô hình, khóa API, tên, cách trả lời.
 * - Hội thoại giữ trong bộ nhớ trang (không lưu trình duyệt, không lưu máy chủ); tải lại trang là bắt đầu lại.
 * - Thao tác ghi do trợ lý đề nghị hiện thẻ xác nhận; chỉ khi người dùng bấm "Xác nhận" máy chủ mới thực hiện.
 * - Phím tắt: Ctrl + / (hoặc ⌘ + /) mở/đóng; Esc đóng. */
(function () {
'use strict';
const S = window.SO;
const { $, esc, GET, POST, PUT, toast, showErr, render, ACTIONS } = S;
const SUGGEST = ['Hôm nay tôi cần làm gì?', 'Đề xuất nào đang chờ tôi duyệt?', 'Lịch họp tuần này của tôi', 'Tìm quy chế chi tiêu nội bộ'];
let enabled = false, open = false, busy = false, hist = [], items = [], status = {};
/* Lịch sử trò chuyện lưu trên máy chủ (chỉ chủ sở hữu xem được); trình duyệt chỉ nhớ mã cuộc trò chuyện đang mở để mở lại khi tải trang */
let curThread = null, histMode = false, threads = null, resumeTried = false;
const TKEY = () => 'so-ai-thread-' + ((typeof B !== 'undefined' && B && B.me && B.me.id) || '');
const setThread = id => { curThread = id || null; try { if (curThread) localStorage.setItem(TKEY(), String(curThread)); else localStorage.removeItem(TKEY()); } catch (e) {} };
const fmtAt = v => { const x = String(v || ''); return x.length >= 16 ? x.slice(8, 10) + '/' + x.slice(5, 7) + '/' + x.slice(0, 4) + ' ' + x.slice(11, 16) : x; };
const MODELS = { anthropic: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'], openai: [], gemini: [] };
const MODEL_PH = { anthropic: 'Để trống = claude-opus-5-5', openai: 'Bắt buộc, theo tài liệu của OpenAI', gemini: 'Bắt buộc, theo tài liệu của Google' };
const goConfig = () => { toggle(false); if (location.hash !== '#tai-khoan') location.hash = 'tai-khoan'; else render(); setTimeout(() => { const el = document.getElementById('ai-me'); if (el) el.scrollIntoView({ block: 'start' }); }, 300); };

/* Văn bản trả lời: chỉ thoát HTML, giữ xuống dòng, đậm **...**, mã #123 → mở công việc */
const fmt = t => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[\s(])#(\d{1,7})\b/g, '$1<button type="button" class="ai-link" data-task="$2">#$2</button>').replace(/\n/g, '<br>');

/* Nguồn tham khảo từ Internet: chỉ liên kết http(s), mở tab mới, không gửi Referer */
const safeUrl = u => /^https?:\/\//i.test(String(u || '')) ? String(u) : '';
const hostOf = u => { try { return new URL(u).hostname; } catch (e) { return ''; } };
const srcHtml = list => `<div class="ai-msg"><div class="ai-src"><h3>Nguồn tham khảo trên Internet</h3><ol>${list.filter(x => safeUrl(x.url)).map(x => `<li><a href="${esc(safeUrl(x.url))}" target="_blank" rel="noopener noreferrer">${esc(x.title || x.url)}</a> <span class="hint">(${esc(hostOf(x.url))})</span></li>`).join('')}</ol><p class="hint">Thông tin từ Internet chỉ để tham khảo. Kiểm tra hiệu lực văn bản tại nguồn trước khi sử dụng.</p></div></div>`;

function ensurePanel() {
  if ($('#ai-panel')) return;
  document.body.insertAdjacentHTML('beforeend', `
  <button class="ai-fab" id="ai-fab" data-act="ai-toggle" aria-controls="ai-panel" aria-expanded="false" title="Trợ lý AI (Ctrl + /)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z"/><path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/></svg><span>Trợ lý</span></button>
  <aside class="ai-panel" id="ai-panel" role="dialog" aria-modal="false" aria-labelledby="ai-title" hidden>
    <header class="ai-head"><h2 id="ai-title">Trợ lý AI</h2><span class="spacer"></span>
      <button class="btn sm ai-x" id="ai-voice" data-act="ai-voice" aria-pressed="false" aria-label="Đọc to câu trả lời" title="Đọc to câu trả lời">🔈</button>
      <button class="btn sm ai-x" data-act="ai-hist" aria-label="Lịch sử trò chuyện" title="Lịch sử trò chuyện">🕘</button>
      <button class="btn sm ai-x" data-act="ai-config" aria-label="Cấu hình trợ lý của tôi" title="Cấu hình trợ lý của tôi">⚙</button>
      <button class="btn sm" data-act="ai-new" title="Bắt đầu cuộc trò chuyện mới">Cuộc trò chuyện mới</button>
      <button class="btn sm ai-x" data-act="ai-toggle" aria-label="Đóng trợ lý">✕</button></header>
    <div class="ai-log" id="ai-log" aria-live="polite"></div>
    <form class="ai-form" id="ai-form"><label for="ai-in" class="sr-only">Nhập yêu cầu cho trợ lý</label>
      <textarea id="ai-in" rows="2" maxlength="4000" placeholder="Hỏi hoặc bấm micro để nói. Ví dụ: Tình hình hôm nay thế nào?"></textarea>
      <button class="btn ai-mic" type="button" id="ai-mic" data-act="ai-mic" aria-pressed="false" aria-label="Nói với trợ lý" title="Nói với trợ lý"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg></button>
      <button class="btn primary" type="submit" id="ai-send">Gửi</button></form>
    <p class="ai-heard" id="ai-heard" aria-live="polite" hidden></p>
    <p class="ai-note">Trợ lý có thể sai; hãy kiểm tra trước khi xác nhận. Nội dung bạn nhập và dữ liệu tra cứu (đã ẩn thông tin cá nhân theo cấu hình) được gửi tới nhà cung cấp AI.</p>
  </aside>`);
  $('#ai-form').addEventListener('submit', e => { e.preventDefault(); send($('#ai-in').value); });
  voiceBtn();
  $('#ai-in').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send($('#ai-in').value); } });
  draw();
}

function histHtml() {
  if (!threads) return '<p class="hint" style="padding:12px">Đang tải lịch sử…</p>';
  return `<div class="ai-hist"><div class="ai-hist-h"><b>Lịch sử trò chuyện</b><span class="spacer"></span><button class="btn sm" data-act="ai-new">+ Cuộc trò chuyện mới</button><button class="btn sm" data-act="ai-hist-back">Quay lại</button></div>
    ${threads.length ? '<ul class="ai-hist-l">' + threads.map(t => `<li class="${t.id === curThread ? 'cur' : ''}"><button type="button" class="ai-hist-it" data-act="ai-thread" data-id="${t.id}"><span class="ai-hist-t">${esc(t.title || 'Cuộc trò chuyện')}</span><span class="hint">${fmtAt(t.updated_at)} · ${t.n} tin</span></button><button type="button" class="btn sm ai-x" data-act="ai-thread-del" data-id="${t.id}" aria-label="Xóa cuộc trò chuyện ${esc(t.title || '')}" title="Xóa">✕</button></li>`).join('') + '</ul>' : '<p class="hint">Chưa có cuộc trò chuyện nào được lưu.</p>'}
    <p class="hint" style="margin-top:8px">Chỉ bạn xem được lịch sử của mình. Cuộc trò chuyện được lưu ${status.keep_days || 180} ngày kể từ lần dùng cuối rồi tự xóa.</p></div>`;
}

function draw() {
  const log = $('#ai-log'); if (!log) return;
  const f = $('#ai-form'); if (f) f.hidden = histMode;
  if (histMode) { log.innerHTML = histHtml(); return; }
  log.innerHTML = items.length ? items.map(it => {
    if (it.k === 'user') return `<div class="ai-msg me"><div class="ai-bub">${esc(it.text).replace(/\n/g, '<br>')}</div></div>`;
    if (it.k === 'ui') return `<div class="ai-msg"><p class="hint ai-ui">↗ ${esc(it.text)}</p></div>`;
    if (it.k === 'bot') return `<div class="ai-msg"><div class="ai-bub">${fmt(it.text)}</div></div>` + (it.src && it.src.length ? srcHtml(it.src) : '');
    if (it.k === 'err') return `<div class="ai-msg"><div><p class="err" role="alert">${esc(it.text)}</p>${it.cfg ? '<button class="btn sm" data-act="ai-config" style="margin-top:6px">Cấu hình trợ lý của tôi</button>' : ''}</div></div>`;
    if (it.k === 'act') return `<div class="ai-act ${it.st}" data-aid="${it.id}"><div class="ai-act-h">Đề nghị: ${esc(it.label)}</div><p>${esc(it.summary)}</p>
      ${it.st === 'pending' ? `<div class="actions"><button class="btn primary sm" data-act="ai-ok" data-id="${it.id}">Xác nhận</button><button class="btn sm" data-act="ai-no" data-id="${it.id}">Bỏ qua</button></div>`
        : `<p class="ai-act-st">${it.st === 'done' ? '✓ Đã thực hiện.' : it.st === 'cancelled' ? 'Đã bỏ qua.' : '✗ ' + esc(it.msg || 'Không thực hiện được.')}</p>`}</div>`;
    return '';
  }).join('') + (busy ? `<div class="ai-msg"><div class="ai-bub ai-wait"><span class="ai-dots" aria-hidden="true"></span> ${esc(busy === true ? 'Đang xử lý…' : busy)}</div></div>` : '')
    : !status.configured ? `<div class="ai-empty"><p class="notice info">Bạn chưa cấu hình trợ lý AI. Mỗi người dùng một trợ lý riêng: chọn nhà cung cấp (Anthropic, OpenAI hoặc Google Gemini), mô hình và nhập khóa API của bạn.</p><div class="actions" style="margin-top:10px"><button class="btn primary sm" data-act="ai-config">Cấu hình trợ lý của tôi</button></div></div>`
    : `<div class="ai-empty"><p>${status.assistant_name ? '<b>' + esc(status.assistant_name) + '</b> sẵn sàng. ' : ''}Tôi tổng hợp được tình hình công việc, đề xuất, quy trình, nhân sự, lịch họp, khách hàng, thu chi… theo quyền của bạn; mở màn hình, chi tiết cho bạn; lập đề nghị giao việc, gửi đề xuất, đặt lịch họp để bạn xác nhận. Bấm micro để nói.</p><div class="ai-sug"><button class="chip" data-act="ai-sug">Tình hình hôm nay</button>${SUGGEST.map(s => `<button class="chip" data-act="ai-sug">${esc(s)}</button>`).join('')}<button class="chip" data-act="ai-draft">✍ Soạn văn bản…</button></div><p class="hint" style="margin-top:10px">Ghi âm, lập biên bản và kết luận: mở cuộc họp tại Lịch họp › Trợ lý cuộc họp.</p>${status.web_search ? `<p class="hint" style="margin-top:6px">Tra cứu được văn bản, thông tin đấu thầu trên: ${esc((status.web_domains || []).join(', '))}. Câu trả lời có dẫn nguồn.</p>` : ''}</div>`;
  log.scrollTop = log.scrollHeight;
  const b = $('#ai-send'); if (b) b.disabled = !!busy;
}

async function send(text, viaVoice) {
  text = String(text || '').trim(); if (!text || busy) return;
  spoken = !!viaVoice; if ('speechSynthesis' in window) speechSynthesis.cancel();
  $('#ai-in').value = '';
  hist.push({ role: 'user', text }); items.push({ k: 'user', text }); busy = true; draw();
  let answered = false;
  try {
    const res = await fetch('/api/ai/chat', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: hist.slice(-20), thread_id: curThread }) });
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
    else if (ev.type === 'thread') { setThread(ev.id); threads = null; }
    else if (ev.type === 'text') { items.push({ k: 'bot', text: ev.text }); hist.push({ role: 'assistant', text: ev.text }); draw(); if (voice || spoken) speak(ev.text); }
    else if (ev.type === 'ui') { items.push({ k: 'ui', text: 'Đã mở ' + ev.label }); draw(); uiDo(ev).catch(e => toast(e.message, true)); }
    else if (ev.type === 'sources') { const last = [...items].reverse().find(x => x.k === 'bot'); if (last && Array.isArray(ev.items)) { last.src = ev.items.slice(0, 20); draw(); } }
    else if (ev.type === 'error') { items.push({ k: 'err', text: ev.message, cfg: ev.status === 412 || /Khóa API/.test(ev.message) }); if (ev.status === 403 || ev.status === 401 || ev.status === 412) check(); draw(); }
  }
}

/* ---------- Điều khiển giao diện theo lệnh của trợ lý: chỉ chuyển màn hình, mở chi tiết; quyền vẫn do máy chủ kiểm tra khi tải dữ liệu ---------- */
const DETAIL_ATTR = { cong_viec: ['data-task', null], de_xuat: ['data-req', 'phe-duyet'], quy_trinh: ['data-run', 'quy-trinh'], nhan_su: ['data-emp', 'nhan-su'], cuoc_hop: ['data-meeting', 'lich-hop'], tai_lieu: ['data-doc', 'tai-lieu'], ban_tin: ['data-post', 'bang-tin'], khach_hang: ['data-cus', 'khach-hang'], tai_san: ['data-asset', 'tai-san'], ung_vien: ['data-cand', 'tuyen-dung'], khoa_hoc: ['data-course', 'dao-tao'] };
const pause = ms => new Promise(r => setTimeout(r, ms));
async function uiDo(ev) {
  const id = Number(ev.id || ev.project) || 0;
  if (ev.op === 'navigate' || ev.kind === 'du_an') {
    const route = ev.kind === 'du_an' ? 'cong-viec' : String(ev.route || '');
    if (!routeOk(route)) throw new Error('Bạn không có quyền mở màn hình này.');
    if (!$('#overlay').hidden) closeModal();
    const h = route + (route === 'cong-viec' && id ? '?p=' + id : '');
    if (location.hash.slice(1) === h) render(); else location.hash = h;
  } else if (ev.op === 'open') {
    const [attr, route] = DETAIL_ATTR[ev.kind] || []; if (!attr || !(id > 0)) return;
    if (route && routeOk(route) && current() !== route) { location.hash = route; await pause(500); }
    if (!$('#overlay').hidden) closeModal();
    const el = document.createElement('span'); el.setAttribute(attr, String(id)); el.hidden = true; document.body.appendChild(el); el.click(); el.remove();
  }
  if (window.innerWidth <= 600 && open) toggle(false); // điện thoại: khung trợ lý che toàn màn hình, đóng lại để người dùng xem
}

/* ---------- Nghe và nói ---------- */
let voice = (() => { try { return localStorage.getItem('so-ai-voice') === '1'; } catch (e) { return false; } })(), spoken = false, mic = null, micTimer = null, warnedVoice = false;
function voiceBtn() { const b = $('#ai-voice'); if (!b) return; b.setAttribute('aria-pressed', String(voice)); b.textContent = voice ? '🔊' : '🔈'; b.title = voice ? 'Đang đọc to câu trả lời (bấm để tắt)' : 'Đọc to câu trả lời'; }
function speak(text) {
  if (!('speechSynthesis' in window)) return;
  const t = String(text || '').replace(/\*\*/g, '').replace(/https?:\/\/\S+/g, '').replace(/(^|\s)#(\d+)/g, '$1số $2').replace(/^[\s•*-]+/gm, '').replace(/₫/g, ' đồng').slice(0, 3000);
  speechSynthesis.cancel();
  const vs = speechSynthesis.getVoices(), v = vs.find(x => /^vi(-|_|$)/i.test(x.lang));
  if (!v && vs.length && !warnedVoice) { warnedVoice = true; toast('Thiết bị chưa có giọng đọc tiếng Việt. Hãy cài giọng nói tiếng Việt cho hệ điều hành, hoặc dùng trình duyệt Edge.', true); }
  /* Chia câu ngắn: một số trình duyệt dừng đọc với đoạn dài */
  const parts = []; let cur = '';
  for (const seg of t.split(/(?<=[.!?;:])\s+|\n+/)) { if ((cur + ' ' + seg).length > 220 && cur) { parts.push(cur); cur = seg; } else cur = cur ? cur + ' ' + seg : seg; }
  if (cur.trim()) parts.push(cur);
  for (const p of parts) { const u = new SpeechSynthesisUtterance(p); u.lang = 'vi-VN'; if (v) u.voice = v; u.rate = 1.05; speechSynthesis.speak(u); }
}
function micUi(st) {
  const b = $('#ai-mic'), h = $('#ai-heard'); if (!b) return;
  const on = !!(st && st.active);
  b.setAttribute('aria-pressed', String(on)); b.classList.toggle('on', on);
  b.title = on ? 'Đang nghe… bấm để dừng và gửi' : 'Nói với trợ lý';
  if (h) { h.hidden = !on && !(st && st.pending); h.textContent = on ? (st.kind === 'browser' ? 'Đang nghe… nói xong sẽ tự gửi.' : 'Đang ghi âm… bấm micro lần nữa để gửi.') : st && st.pending ? 'Đang chuyển giọng nói thành chữ…' : ''; }
}
async function micStop(sendIt) {
  if (!mic) return; clearTimeout(micTimer);
  const r = mic; mic = null; await r.stop();
  micUi(null);
  if (sendIt && $('#ai-in').value.trim()) send($('#ai-in').value, true);
}
async function micToggle() {
  if (busy) return;
  if (mic) return micStop(true);
  const O = window.SO_AI_OFFICE; if (!O) return;
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  const inp = $('#ai-in');
  const r = O.Recorder({
    onText: t => { inp.value += (inp.value && !/\s$/.test(inp.value) ? ' ' : '') + t; if (r.kind === 'browser') { clearTimeout(micTimer); micTimer = setTimeout(() => micStop(true), 1600); } },
    onInterim: t => { const h = $('#ai-heard'); if (h && t) { h.hidden = false; h.textContent = '… ' + t; } if (t) clearTimeout(micTimer); },
    onState: st => { if (mic === r) micUi(st); },
    onError: e => { toast(e.message, true); micStop(false); }
  });
  mic = r;
  try { await r.start(); } catch (e) { mic = null; micUi(null); toast(e.message, true); }
}

/* Mở lại một cuộc trò chuyện đã lưu: dựng lại khung trò chuyện và lịch sử gửi mô hình (trạng thái thẻ đề nghị lấy từ máy chủ) */
async function loadThread(id, quiet) {
  let t; try { t = await GET('/api/ai/threads/' + Number(id)); } catch (e) { if (!quiet) toast(e.message, true); if (Number(id) === curThread) setThread(null); return false; }
  items = []; hist = [];
  for (const it of t.items) {
    const d = it.data || {};
    if (it.kind === 'user') { items.push({ k: 'user', text: d.text }); hist.push({ role: 'user', text: d.text }); }
    else if (it.kind === 'bot') { items.push({ k: 'bot', text: d.text, src: d.src }); hist.push({ role: 'assistant', text: d.text }); }
    else if (it.kind === 'act') { items.push({ k: 'act', id: d.id, label: d.label, summary: d.summary, st: d.st || 'expired', msg: d.st === 'expired' ? 'Đề nghị đã hết hạn.' : d.msg }); if (['done', 'cancelled', 'failed'].includes(d.st)) hist.push({ role: 'assistant', text: `[Hệ thống] Đề nghị số ${d.id} (${d.summary}): ${d.st === 'done' ? 'đã thực hiện' : d.st === 'cancelled' ? 'người dùng bỏ qua' : 'không thực hiện được'}.` }); }
    else if (it.kind === 'ui') items.push({ k: 'ui', text: d.text });
    else if (it.kind === 'err') items.push({ k: 'err', text: d.text });
  }
  setThread(t.id); histMode = false; draw(); return true;
}
async function showHistory() {
  histMode = true; threads = null; draw();
  try { threads = await GET('/api/ai/threads'); } catch (e) { threads = []; toast(e.message, true); }
  if (histMode) draw();
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
  /* Lần mở đầu tiên sau khi tải trang: mở lại cuộc trò chuyện đang dở (nếu còn) */
  if (open && !resumeTried && !items.length && !busy) { resumeTried = true; let id = null; try { id = Number(localStorage.getItem(TKEY())) || null; } catch (e) {} if (id) loadThread(id, true); }
  $('#ai-panel').hidden = !open; $('#ai-fab').setAttribute('aria-expanded', String(open)); document.body.classList.toggle('ai-open', open);
  if (open) setTimeout(() => $('#ai-in') && $('#ai-in').focus(), 30); else if (!$('#ai-fab').hidden) $('#ai-fab').focus();
}

/* Lãnh đạo bật "Tự động báo cáo tình hình": lần đầu vào hệ thống mỗi ngày, trợ lý tự mở và báo cáo, không cần thao tác */
function autoBrief() {
  if (!enabled || !status.configured || !status.auto_brief || busy || items.length) return;
  let last = ''; try { last = localStorage.getItem('so-ai-brief') || ''; } catch (e) {}
  if (last === TODAY()) return;
  try { localStorage.setItem('so-ai-brief', TODAY()); } catch (e) {}
  resumeTried = true; setThread(null); // báo cáo đầu ngày là một cuộc trò chuyện mới
  toggle(true); send('Báo cáo tình hình hôm nay cho tôi: điểm nóng, việc cần chỉ đạo.');
}

async function check() {
  const before = enabled;
  try { status = await GET('/api/ai/status'); enabled = !!status.enabled; } catch (e) { enabled = false; status = {}; }
  /* Trang có nút AI (Tài liệu, Lịch họp) có thể đã vẽ trước khi biết trạng thái: vẽ lại một lần khi trạng thái bật/tắt thay đổi */
  if (before !== enabled && $('#overlay').hidden) render();
  if (enabled) ensurePanel();
  const t = $('#ai-title'); if (t) t.textContent = status.assistant_name || 'Trợ lý AI';
  draw();
  const fab = $('#ai-fab'); if (fab) fab.hidden = !enabled;
  autoBrief();
  if (!enabled && open) { open = false; const p = $('#ai-panel'); if (p) p.hidden = true; document.body.classList.remove('ai-open'); }
}

Object.assign(ACTIONS, {
  'ai-toggle': () => toggle(),
  'ai-mic': () => micToggle(),
  'ai-voice': () => { voice = !voice; try { localStorage.setItem('so-ai-voice', voice ? '1' : '0'); } catch (e) {} voiceBtn(); if (!voice && 'speechSynthesis' in window) speechSynthesis.cancel(); else if (voice) speak('Đã bật đọc câu trả lời.'); },
  'ai-config': () => goConfig(),
  'ai-me-save': btn => S.busy(btn, async () => { try { await saveMe(false); toast('Đã lưu cấu hình trợ lý của bạn'); } catch (e) { showErr('#aime-err', e); } }),
  'ai-me-clear': btn => { if (!S.armed(btn, 'Bấm lần nữa để xóa khóa')) return; S.busy(btn, async () => { try { await saveMe(true); toast('Đã xóa khóa API'); } catch (e) { showErr('#aime-err', e); } }); },
  'ai-me-test': btn => S.busy(btn, async () => {
    const out = $('#aime-test'); out.className = 'hint'; out.textContent = 'Đang kiểm tra kết nối…';
    try {
      const res = await fetch('/api/ai/test', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const r = await res.json();
      out.className = r.ok ? 'notice ok' : 'err'; out.textContent = r.ok ? `Kết nối thành công: ${r.provider} · ${r.model}${r.source === 'org' ? ' (đang dùng khóa chung của đơn vị)' : ''}. Trả lời thử: “${r.reply}”` : (r.error || 'Kết nối không thành công.');
    } catch (e) { out.className = 'err'; out.textContent = e.message; }
  }),
  'ai-me-full': btn => S.busy(btn, async () => {
    const out = $('#aime-test'); out.className = 'hint'; out.textContent = 'Đang chạy kiểm tra toàn diện (khoảng 30–90 giây)…';
    try {
      const res = await fetch('/api/ai/test', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ full: true }) });
      const r = await res.json();
      out.className = r.ok ? 'notice ok' : 'notice warn';
      out.innerHTML = `<b>${r.ok ? 'Tất cả các bước đạt' : 'Có bước không đạt'}</b>${r.provider ? ' · ' + esc(r.provider) + ' · ' + esc(r.model || '') : ''}${r.error ? '<br>' + esc(r.error) : ''}<ul class="ai-chk">${(r.steps || []).map(s => `<li class="${s.ok ? 'ok' : 'bad'}">${s.ok ? '✓' : '✗'} ${esc(s.name)} <span class="hint">(${(s.ms / 1000).toFixed(1)} giây)</span><br><span class="hint">${esc(s.ok ? s.detail || '' : s.error || '')}</span></li>`).join('')}</ul>`;
    } catch (e) { out.className = 'err'; out.textContent = e.message; }
  }),
  'ai-new': () => { if (busy) return; hist = []; items = []; histMode = false; setThread(null); if ('speechSynthesis' in window) speechSynthesis.cancel(); draw(); $('#ai-in').focus(); },
  'ai-hist': () => { if (busy) return; if (histMode) { histMode = false; draw(); } else showHistory(); },
  'ai-hist-back': () => { histMode = false; draw(); },
  'ai-thread': b => { if (!busy) loadThread(Number(b.dataset.id)); },
  'ai-thread-del': b => { if (!S.armed(b, 'Bấm lần nữa để xóa')) return; S.busy(b, async () => { try { await DEL('/api/ai/threads/' + Number(b.dataset.id)); if (Number(b.dataset.id) === curThread) { setThread(null); items = []; hist = []; } threads = (threads || []).filter(t => t.id !== Number(b.dataset.id)); draw(); toast('Đã xóa cuộc trò chuyện'); } catch (e) { toast(e.message, true); } }); },
  'ai-sug': b => send(b.textContent),
  'ai-ok': b => decide(Number(b.dataset.id), true),
  'ai-no': b => decide(Number(b.dataset.id), false),
  'ai-save': btn => S.busy(btn, async () => {
    try {
      const r = await PUT('/api/admin/ai-settings', { enabled: $('#ai-en').checked, allow_pii: $('#ai-pii').checked, daily_tokens: Number(String($('#ai-q').value).replace(/\D/g, '')), web_search: $('#ai-web').checked, web_domains: $('#ai-dom').value, keep_days: Number(String($('#ai-keep').value).replace(/D/g, '')) });
      toast('Đã lưu cấu hình trợ lý AI'); enabled = r.enabled; check(); render();
    } catch (e) { showErr('#ai-err', e); }
  })
});
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === '/') { e.preventDefault(); toggle(); }
  else if (e.key === 'Escape' && open && $('#overlay').hidden) toggle(false);
});

/* Tài khoản › Trợ lý AI của tôi: mỗi người một cấu hình riêng */
let ME = null;
async function mountAccount(el) {
  if (!el) return;
  try { ME = await GET('/api/ai/me'); } catch (e) { el.innerHTML = `<p class="err">${esc(e.message)}</p>`; return; }
  const m = ME, opt = (o, v) => Object.entries(o).map(([k, l]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${esc(l)}</option>`).join('');
  el.innerHTML = `<section class="card"><div class="card-h"><h2>Trợ lý AI của tôi</h2></div><div class="card-b stack" style="gap:12px">
    ${m.enabled ? '' : '<p class="notice warn">Quản trị viên chưa bật trợ lý AI cho đơn vị. Bạn vẫn có thể lưu cấu hình trước.</p>'}
    <p class="hint" style="margin:0">Mỗi người dùng một trợ lý riêng, dùng khóa API của chính bạn. Khóa được mã hóa khi lưu và không hiển thị lại.${m.org_key ? ' Nếu không nhập khóa, trợ lý dùng khóa chung của đơn vị.' : ''}</p>
    <div class="form">
      <div class="field"><label for="aime-p">Nhà cung cấp</label><select id="aime-p">${opt(m.providers, m.provider)}</select></div>
      <div class="field"><label for="aime-m">Mô hình</label><input id="aime-m" list="aime-ml" autocomplete="off" value="${esc(m.model)}"><datalist id="aime-ml"></datalist></div>
      <div class="field full"><label for="aime-k">Khóa API</label><input id="aime-k" type="password" autocomplete="off" spellcheck="false" placeholder="${m.has_key ? 'Đã lưu khóa ' + esc(m.key_hint) + ' — để trống nếu giữ nguyên' : 'Dán khóa API lấy từ trang quản lý khóa của nhà cung cấp'}">
        <span class="hint">${m.can_store_key ? 'Không chia sẻ khóa cho người khác. Chi phí sử dụng tính vào tài khoản của khóa này.' : 'Máy chủ chưa khai báo AI_KEY_SECRET nên chưa lưu được khóa. Liên hệ quản trị hệ thống.'}</span></div>
      <div class="field" id="aime-ef"><label for="aime-e">Mức suy luận (Anthropic)</label><select id="aime-e">${opt({ '': 'Mặc định (vừa)', low: 'Thấp – nhanh, rẻ', medium: 'Vừa', high: 'Cao – kỹ hơn, chậm hơn' }, m.effort)}</select></div>
      <div class="field"><label for="aime-n">Tên trợ lý</label><input id="aime-n" maxlength="40" value="${esc(m.assistant_name)}" placeholder="Ví dụ: Trợ lý của Long"></div>
      <div class="field full"><label class="check"><input type="checkbox" id="aime-ab" ${m.auto_brief ? 'checked' : ''}> Tự động báo cáo tình hình khi tôi vào hệ thống lần đầu mỗi ngày (dành cho lãnh đạo; mỗi lần báo cáo tốn token)</label></div>
      <div class="field full"><label for="aime-i">Cách trả lời mong muốn</label><textarea id="aime-i" maxlength="1000" rows="3" placeholder="Ví dụ: trả lời ngắn gọn, gạch đầu dòng; luôn nêu hạn hoàn thành.">${esc(m.instructions)}</textarea></div>
    </div>
    <p class="err" id="aime-err" hidden></p><div id="aime-test" aria-live="polite"></div></div>
    <div class="modal-f">${m.has_key ? '<button class="btn danger" data-act="ai-me-clear" style="margin-right:auto">Xóa khóa</button>' : ''}<button class="btn" data-act="ai-me-test">Kiểm tra kết nối</button><button class="btn" data-act="ai-me-full" title="Chạy thử các luồng chính với khóa của bạn: hội thoại, gọi công cụ nhiều bước, tìm Internet, soạn văn bản (tốn một ít token)">Kiểm tra toàn diện</button><button class="btn primary" data-act="ai-me-save">Lưu cấu hình</button></div></section>`;
  $('#aime-p').addEventListener('change', provChanged);
  provChanged();
  el.insertAdjacentHTML('beforeend', '<section class="card" id="aime-use" style="margin-top:14px"><div class="card-h"><h2>Token AI tôi đã dùng</h2></div><div class="card-b"><p class="hint">Đang tải…</p></div></section>');
  mountUsage();
}
async function mountUsage() {
  const box = document.querySelector('#aime-use .card-b'); if (!box) return;
  let u; try { u = await GET('/api/ai/me/usage'); } catch (e) { box.innerHTML = `<p class="err">${esc(e.message)}</p>`; return; }
  const n = v => (Number(v) || 0).toLocaleString('vi-VN'), d = x => String(x).split('-').reverse().join('/');
  const pct = u.quota ? Math.min(100, Math.round(u.used_today * 100 / u.quota)) : 0;
  box.innerHTML = `<div class="stack" style="gap:10px">
    <div><div class="ai-use-h"><b>Hôm nay: ${n(u.used_today)} / ${n(u.quota)} token</b><span class="hint">Còn lại ${n(u.quota_left)} token</span></div>
      <div class="ai-meter" role="meter" aria-label="Token đã dùng hôm nay" aria-valuemin="0" aria-valuemax="${u.quota}" aria-valuenow="${u.used_today}"><span style="width:${pct}%" class="${pct >= 90 ? 'hi' : ''}"></span></div>
      <p class="hint" style="margin:4px 0 0">${n(u.today.turns)} lượt · vào ${n(u.today.tokens_in)} · ra ${n(u.today.tokens_out)}${u.today.tokens_cached ? ' · đọc bộ đệm ' + n(u.today.tokens_cached) + ' (tính 10%)' : ''}${u.today.web_requests ? ' · ' + n(u.today.web_requests) + ' lượt tìm Internet' : ''}. Hạn mức tính lại lúc 0 giờ (giờ Việt Nam).</p></div>
    <div class="tbl-wrap"><table class="tbl"><caption class="sr-only">Token đã dùng 30 ngày gần nhất</caption><thead><tr><th>Ngày</th><th class="r">Số lượt</th><th class="r">Token vào</th><th class="r">Token ra</th><th class="r">Đọc bộ đệm</th><th class="r">Tính hạn mức</th><th class="r">Tìm Internet</th></tr></thead><tbody>
      ${u.days.length ? u.days.map(x => `<tr><td>${d(x.day)}</td><td class="r num">${n(x.turns)}</td><td class="r num">${n(x.tokens_in)}</td><td class="r num">${n(x.tokens_out)}</td><td class="r num">${n(x.tokens_cached)}</td><td class="r num">${n(x.billed)}</td><td class="r num">${n(x.web_requests)}</td></tr>`).join('') : '<tr><td colspan="7" class="hint">Chưa sử dụng trong 30 ngày gần nhất.</td></tr>'}</tbody>
      ${u.days.length ? `<tfoot><tr><th>Cộng 30 ngày</th><th class="r num">${n(u.total_30d.turns)}</th><th class="r num">${n(u.total_30d.tokens_in)}</th><th class="r num">${n(u.total_30d.tokens_out)}</th><th class="r num">${n(u.total_30d.tokens_cached)}</th><th class="r num">${n(u.total_30d.billed)}</th><th class="r num">${n(u.total_30d.web_requests)}</th></tr></tfoot>` : ''}</table></div>
    <p class="hint" style="margin:0">Số token do nhà cung cấp AI báo về sau mỗi lượt. Token đọc từ bộ đệm (phần mô tả công cụ, lời nhắc lặp lại ở mỗi bước) được nhà cung cấp tính giá thấp nên chỉ tính 10% vào hạn mức; chi phí thực tế xem tại trang quản lý tài khoản của nhà cung cấp.</p></div>`;
}
function provChanged() {
  const p = $('#aime-p') && $('#aime-p').value; if (!p) return;
  $('#aime-ml').innerHTML = (MODELS[p] || []).map(x => `<option value="${x}">`).join('');
  $('#aime-m').placeholder = MODEL_PH[p] || '';
  $('#aime-ef').hidden = p !== 'anthropic';
  if (ME && ME.has_key && p !== ME.provider) $('#aime-k').placeholder = 'Đổi nhà cung cấp: nhập khóa API của nhà cung cấp mới';
}
async function saveMe(clear) {
  const body = { provider: $('#aime-p').value, model: $('#aime-m').value.trim(), effort: $('#aime-e').value, assistant_name: $('#aime-n').value, instructions: $('#aime-i').value, auto_brief: $('#aime-ab').checked };
  if (clear) body.clear_key = true; else if ($('#aime-k').value.trim()) body.api_key = $('#aime-k').value.trim();
  await PUT('/api/ai/me', body);
  $('#aime-k').value = '';
  await mountAccount(document.getElementById('ai-me')); check();
}

/* Màn hình Quản trị › Trợ lý AI */
async function adminHtml() {
  const s = await GET('/api/admin/ai-settings');
  const n = v => (Number(v) || 0).toLocaleString('vi-VN');
  return `<section class="card"><div class="card-b stack" style="gap:12px">
    <label class="check"><input type="checkbox" id="ai-en" ${s.enabled ? 'checked' : ''}> Bật trợ lý AI cho toàn đơn vị</label>
    <label class="check"><input type="checkbox" id="ai-pii" ${s.allow_pii ? 'checked' : ''}> Cho phép gửi thông tin cá nhân (thư điện tử, số điện thoại, ngày sinh, số giấy tờ, tài khoản ngân hàng, lương) tới nhà cung cấp AI</label>
    <div class="field" style="max-width:320px"><label for="ai-q">Hạn mức token mỗi người mỗi ngày</label><input id="ai-q" inputmode="numeric" value="${n(s.daily_tokens)}"></div>
    <div class="field" style="max-width:320px"><label for="ai-keep">Lưu lịch sử trò chuyện (ngày)</label><input id="ai-keep" inputmode="numeric" value="${s.keep_days || 180}"><span class="hint">Mỗi người chỉ xem được lịch sử của mình. Quá hạn kể từ lần dùng cuối thì tự xóa.</span></div>
    <label class="check"><input type="checkbox" id="ai-web" ${s.web_search ? 'checked' : ''}> Cho phép trợ lý tìm kiếm trên Internet, chỉ trong các trang dưới đây (hiện chỉ dùng được với Anthropic)</label>
    <div class="field" style="max-width:480px"><label for="ai-dom">Tên miền được phép (mỗi dòng một tên miền; tự gồm tên miền con)</label><textarea id="ai-dom" rows="5" spellcheck="false" autocomplete="off">${esc((s.web_domains || []).join('\n'))}</textarea>
      <span class="hint">Chỉ nhập tên miền, ví dụ chinhphu.vn. Không nhập http://, đường dẫn hay ký tự *. dauthau.asia là trang của doanh nghiệp, không phải cổng thông tin nhà nước.</span></div>
    <p class="err" id="ai-err" hidden></p></div><div class="modal-f"><button class="btn primary" data-act="ai-save">Lưu cấu hình</button></div></section>
  <p class="notice warn" style="margin-top:14px" role="note">Câu hỏi của người dùng và dữ liệu tra cứu được gửi tới nhà cung cấp AI ở nước ngoài. Khi bật tìm kiếm Internet, câu truy vấn do AI tự đặt được gửi tới công cụ tìm kiếm của nhà cung cấp; mỗi lượt tìm, đọc trang được tính phí riêng ngoài token. Chỉ bật khi đơn vị đã hoàn tất thủ tục theo quy định về bảo vệ dữ liệu cá nhân. Chỉ cho phép gửi thông tin cá nhân khi có văn bản đồng ý. Mỗi người dùng tự cấu hình nhà cung cấp, mô hình và khóa API của mình tại <b>Tài khoản › Trợ lý AI của tôi</b>; khóa được mã hóa bằng bí mật <span class="mono">AI_KEY_SECRET</span> của máy chủ. Khóa chung của đơn vị (tùy chọn) khai báo tại máy chủ: <span class="mono">AI_PROVIDER</span>, <span class="mono">AI_API_KEY</span>, <span class="mono">AI_MODEL</span>.</p>
  <section class="card" style="margin-top:14px"><div class="card-h"><h2>Sử dụng 30 ngày gần nhất</h2></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Người dùng</th><th class="r">Số lượt</th><th class="r">Token vào</th><th class="r">Token ra</th><th class="r">Đọc bộ đệm</th><th class="r">Tính hạn mức</th><th class="r">Lượt tìm Internet</th></tr></thead><tbody>
    ${s.usage_30d.length ? s.usage_30d.map(u => `<tr><td>${esc(u.full_name || '#' + u.user_id)}</td><td class="r num">${n(u.turns)}</td><td class="r num">${n(u.tokens_in)}</td><td class="r num">${n(u.tokens_out)}</td><td class="r num">${n(u.tokens_cached)}</td><td class="r num">${n(u.billed)}</td><td class="r num">${n(u.web_requests)}</td></tr>`).join('') : '<tr><td colspan="7" class="hint">Chưa có lượt sử dụng.</td></tr>'}</tbody></table></div></section>`;
}
window.SO_AI = { adminHtml, check, mountAccount, status: () => status };

/* Khởi động khi giao diện chính xuất hiện (sau đăng nhập), ẩn khi trở về màn hình đăng nhập; không gọi máy chủ định kỳ */
let shown = false;
const sync = () => { const has = !!document.querySelector('#root .app'); if (has && !shown) { shown = true; check(); } else if (!has && shown) { shown = false; enabled = false; hist = []; items = []; const fab = $('#ai-fab'); if (fab) fab.hidden = true; if (open) toggle(false); } };
new MutationObserver(sync).observe(document.getElementById('root'), { childList: true });
sync();
})();
