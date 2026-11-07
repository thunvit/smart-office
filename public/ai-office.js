/* SmartOffice — Trợ lý AI cho công việc văn phòng (ADR-010, bổ sung 07/11/2026):
 * 1. Soạn văn bản hành chính (Tài liệu › Soạn văn bản bằng AI; nút trong khung trợ lý).
 * 2. Trợ lý cuộc họp: ghi âm → chép lời → lập biên bản, kết luận → lưu biên bản, giao việc (Lịch họp › chi tiết cuộc họp).
 * Ghi âm:
 *  - Nhà cung cấp OpenAI/Gemini: thu âm thanh tại trình duyệt (WAV 16 kHz, đoạn 60 giây), máy chủ chuyển thành chữ qua nhà cung cấp.
 *  - Anthropic (không nhận âm thanh): dùng nhận dạng giọng nói của trình duyệt (Chrome/Edge; âm thanh do hãng trình duyệt xử lý).
 *  - Âm thanh không được lưu trên máy chủ; chỉ giữ phần chữ. */
(function () {
'use strict';
const S = window.SO;
const { $, esc, GET, POST, toast, showErr, openModal, closeModal, ACTIONS, TODAY, addDays, fmtD } = S;
const B = () => S.B;
const AIS = () => (window.SO_AI && window.SO_AI.status && window.SO_AI.status()) || {};
const DOC_TYPES = { congvan: 'Công văn', totrinh: 'Tờ trình', quyetdinh: 'Quyết định', thongbao: 'Thông báo', kehoach: 'Kế hoạch', baocao: 'Báo cáo', giaymoi: 'Giấy mời', bienban: 'Biên bản', thu: 'Thư điện tử / thư công tác', khac: 'Văn bản khác' };
const TONES = { trangtrong: 'Trang trọng', ngangon: 'Ngắn gọn', chitiet: 'Chi tiết' };
const opts = (o, v) => Object.entries(o).map(([k, l]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${esc(l)}</option>`).join('');
const api = async (path, body) => {
  const r = await fetch(path, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  let j = {}; try { j = await r.json(); } catch (e) {}
  if (!r.ok) { const e = new Error(j.error || ('Lỗi ' + r.status)); e.status = r.status; throw e; }
  return j;
};
const mmss = s => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(Math.floor(s % 60)).padStart(2, '0');

/* ================= Bộ ghi âm dùng chung ================= */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
function engine() {
  if (AIS().audio_server && navigator.mediaDevices && navigator.mediaDevices.getUserMedia && (window.AudioContext || window.webkitAudioContext)) return 'server';
  if (SR) return 'browser';
  return 'none';
}
const ENGINE_NOTE = {
  server: p => `Ghi âm theo đoạn 60 giây; máy chủ chuyển giọng nói thành chữ qua ${p === 'gemini' ? 'Google Gemini' : 'OpenAI'} bằng khóa API đã cấu hình. Âm thanh không được lưu.`,
  browser: () => 'Nhận dạng giọng nói của trình duyệt (tiếng Việt). Âm thanh do hãng trình duyệt (Google/Microsoft) xử lý. Muốn chuyển giọng nói tại máy chủ, cấu hình OpenAI hoặc Gemini tại Tài khoản › Trợ lý AI của tôi.',
  none: () => 'Trình duyệt này không hỗ trợ nhận dạng giọng nói và cấu hình hiện tại không chuyển giọng nói tại máy chủ. Hãy gõ hoặc dán ghi chép.'
};
function wavFrom(chunks, inRate) {
  const len = chunks.reduce((n, c) => n + c.length, 0), all = new Float32Array(len); let o = 0; for (const c of chunks) { all.set(c, o); o += c.length; }
  const ratio = inRate / 16000, n = Math.floor(len / ratio), pcm = new Int16Array(n);
  for (let i = 0; i < n; i++) { const v = Math.max(-1, Math.min(1, all[Math.floor(i * ratio)] || 0)); pcm[i] = v < 0 ? v * 0x8000 : v * 0x7fff; }
  const buf = new ArrayBuffer(44 + pcm.length * 2), d = new DataView(buf), w = (p, s) => { for (let i = 0; i < s.length; i++) d.setUint8(p + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); d.setUint32(4, 36 + pcm.length * 2, true); w(8, 'WAVE'); w(12, 'fmt '); d.setUint32(16, 16, true); d.setUint16(20, 1, true); d.setUint16(22, 1, true);
  d.setUint32(24, 16000, true); d.setUint32(28, 32000, true); d.setUint16(32, 2, true); d.setUint16(34, 16, true); w(36, 'data'); d.setUint32(40, pcm.length * 2, true);
  new Int16Array(buf, 44).set(pcm);
  return { buf, seconds: n / 16000 };
}
const b64 = buf => { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };

/** Ghi âm, trả chữ qua onText(text, at). on: { onText, onInterim, onState, onError } */
function Recorder(on) {
  const kind = engine(); let active = false, started = 0, timer = null, stream = null, ctx = null, node = null, chunks = [], queue = Promise.resolve(), pending = 0, rec = null;
  const state = () => on.onState && on.onState({ active, kind, secs: active ? (Date.now() - started) / 1000 : 0, pending });
  function flush(at) {
    if (!chunks.length || !ctx) return;
    const { buf, seconds } = wavFrom(chunks, ctx.sampleRate); chunks = [];
    if (seconds < 1) return;
    pending++; state();
    queue = queue.then(async () => {
      try { const r = await api('/api/ai/transcribe', { audio: b64(buf), mime: 'audio/wav', seconds }); if (r.text) on.onText(r.text, at); }
      catch (e) { on.onError && on.onError(e); }
      pending--; state();
    });
  }
  async function start() {
    if (active) return;
    if (kind === 'none') throw new Error(ENGINE_NOTE.none());
    if (kind === 'server') {
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } }); }
      catch (e) { throw new Error(e && e.name === 'NotFoundError' ? 'Không tìm thấy micro trên thiết bị.' : e && (e.name === 'NotAllowedError' || e.name === 'SecurityError') ? 'Trình duyệt không cho phép dùng micro. Hãy cho phép quyền micro cho trang này (biểu tượng ổ khóa trên thanh địa chỉ) rồi thử lại.' : 'Không mở được micro: ' + ((e && e.message) || e)); }
    }
    started = Date.now(); active = true; // chỉ đánh dấu đang ghi khi đã mở được micro
    if (kind === 'server') {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      const src = ctx.createMediaStreamSource(stream); node = ctx.createScriptProcessor(4096, 1, 1);
      let segStart = Date.now();
      node.onaudioprocess = e => { if (!active) return; chunks.push(new Float32Array(e.inputBuffer.getChannelData(0))); if (Date.now() - segStart >= 60e3) { flush(mmss((segStart - started) / 1000)); segStart = Date.now(); } };
      src.connect(node); node.connect(ctx.destination);
      node._seg = () => segStart;
    } else {
      rec = new SR(); rec.lang = 'vi-VN'; rec.continuous = true; rec.interimResults = true;
      rec.onresult = e => { let interim = ''; for (let i = e.resultIndex; i < e.results.length; i++) { const r = e.results[i]; if (r.isFinal) on.onText(r[0].transcript.trim(), mmss((Date.now() - started) / 1000)); else interim += r[0].transcript; } on.onInterim && on.onInterim(interim); };
      rec.onerror = e => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { active = false; on.onError && on.onError(new Error('Trình duyệt không cho phép dùng micro.')); state(); } };
      rec.onend = () => { if (active) { try { rec.start(); } catch (e) {} } };
      rec.start();
    }
    timer = setInterval(state, 1000); state();
  }
  async function stop() {
    if (!active) return queue;
    active = false; clearInterval(timer);
    if (kind === 'server') { flush(mmss(((node && node._seg ? node._seg() : Date.now()) - started) / 1000)); try { node.disconnect(); } catch (e) {} stream.getTracks().forEach(t => t.stop()); try { await ctx.close(); } catch (e) {} }
    else if (rec) { try { rec.stop(); } catch (e) {} on.onInterim && on.onInterim(''); }
    state();
    return queue;
  }
  return { start, stop, kind, get active() { return active; } };
}
/* Dừng ghi âm khi hộp thoại bị đóng */
let CURRENT = null;
new MutationObserver(() => { if (CURRENT && !document.getElementById(CURRENT.anchor)) { CURRENT.rec.stop(); CURRENT = null; } }).observe(document.getElementById('modal'), { childList: true });
function bindRecorder(anchor, target, ui) {
  const rec = Recorder({
    onText: (t, at) => { const el = $(target); if (!el) return; el.value += (el.value && !el.value.endsWith('\n') ? '\n' : '') + (ui.stamp ? `[${at}] ` : '') + t; el.scrollTop = el.scrollHeight; },
    onInterim: t => { const el = $(ui.interim); if (el) el.textContent = t ? '… ' + t : ''; },
    onState: st => { const b = $(ui.btn), s = $(ui.stat); if (b) { b.textContent = st.active ? '■ Dừng ghi âm' : '● Ghi âm'; b.classList.toggle('danger', st.active); b.setAttribute('aria-pressed', String(st.active)); } if (s) s.textContent = st.active ? `Đang ghi ${mmss(st.secs)}${st.pending ? ` · đang chuyển ${st.pending} đoạn` : ''}` : st.pending ? `Đang chuyển ${st.pending} đoạn còn lại…` : ''; },
    onError: e => toast(e.message, true)
  });
  CURRENT = { anchor, rec };
  return rec;
}

/* ================= 1. Soạn văn bản ================= */
function draftModal(seed = {}) {
  const st = AIS();
  if (!st.configured) { toast('Bạn chưa cấu hình trợ lý AI (Tài khoản › Trợ lý AI của tôi).', true); return; }
  const kind = engine();
  openModal(`${S.mh('Soạn văn bản bằng AI', 'Bản thảo do AI lập; người soạn chịu trách nhiệm kiểm tra nội dung, thể thức trước khi trình ký')}<div class="modal-b" id="aid-root">
    <div class="form">
      <div class="field"><label for="aid-t">Loại văn bản</label><select id="aid-t">${opts(DOC_TYPES, seed.doc_type || 'congvan')}</select></div>
      <div class="field"><label for="aid-g">Giọng văn</label><select id="aid-g">${opts(TONES, 'trangtrong')}</select></div>
      <div class="field full"><label for="aid-r">Kính gửi / nơi nhận</label><input id="aid-r" maxlength="500" value="${esc(seed.recipient || '')}"></div>
      <div class="field full"><label for="aid-b">Yêu cầu, ý chính cần soạn</label><textarea id="aid-b" rows="5" maxlength="8000" placeholder="Ví dụ: đề nghị Sở TT&TT hỗ trợ đào tạo chuyển đổi số cho 20 cán bộ trong tháng 12; kinh phí do đơn vị tự đảm bảo.">${esc(seed.brief || '')}</textarea>
        <div class="actions" style="margin-top:6px">${kind !== 'none' ? '<button class="btn sm" data-act="aid-mic" id="aid-mic" aria-pressed="false">● Ghi âm</button>' : ''}<span class="hint" id="aid-ms"></span><span class="hint" id="aid-mi"></span></div></div>
      <div class="field full"><label for="aid-c">Căn cứ, tài liệu tham khảo (tùy chọn)</label><textarea id="aid-c" rows="3" maxlength="8000" placeholder="Dán trích đoạn văn bản căn cứ, số liệu… Trợ lý không tự bịa căn cứ pháp lý."></textarea></div>
    </div>
    <div class="actions"><button class="btn primary" data-act="aid-go">✨ Soạn thảo</button><span class="hint" id="aid-st" aria-live="polite"></span></div>
    <div id="aid-out" hidden>
      <div class="field full"><label for="aid-txt">Bản thảo (sửa trực tiếp được)</label><textarea id="aid-txt" rows="16" style="font-family:'Times New Roman',serif;font-size:14px;line-height:1.5"></textarea></div>
      <div class="form"><div class="field full"><label for="aid-rv">Yêu cầu chỉnh sửa</label><input id="aid-rv" maxlength="2000" placeholder="Ví dụ: thêm mục kinh phí, rút gọn còn 1 trang"></div></div>
      <div class="actions"><button class="btn" data-act="aid-rev">Soạn lại theo yêu cầu</button><button class="btn" data-act="aid-copy">Sao chép</button><button class="btn" data-act="aid-doc">Tải tệp Word (.doc)</button><button class="btn" data-act="aid-save">Lưu vào Tài liệu</button></div>
    </div>
    <p class="err" id="aid-err" hidden></p>
    <p class="hint">${esc(ENGINE_NOTE[kind](st.provider))}</p></div>
  <div class="modal-f"><button class="btn" data-act="close">Đóng</button></div>`, {
    'aid-mic': () => { const r = CURRENT && CURRENT.anchor === 'aid-root' ? CURRENT.rec : bindRecorder('aid-root', '#aid-b', { btn: '#aid-mic', stat: '#aid-ms', interim: '#aid-mi' }); (r.active ? r.stop() : r.start()).catch(e => showErr('#aid-err', e)); },
    'aid-go': btn => S.busy(btn, () => draft(false)),
    'aid-rev': btn => S.busy(btn, () => draft(true)),
    'aid-copy': async () => { try { await navigator.clipboard.writeText($('#aid-txt').value); toast('Đã sao chép'); } catch (e) { $('#aid-txt').select(); document.execCommand('copy'); toast('Đã sao chép'); } },
    'aid-doc': () => downloadDoc($('#aid-txt').value, DOC_TYPES[$('#aid-t').value]),
    'aid-save': btn => S.busy(btn, async () => {
      const text = $('#aid-txt').value.trim(); if (!text) return;
      const title = (DOC_TYPES[$('#aid-t').value] + ': ' + ($('#aid-b').value.trim().split('\n')[0] || 'Bản thảo')).slice(0, 300);
      try { const r = await POST('/api/docs', { title, category: 'khac', description: 'Bản thảo soạn bằng trợ lý AI ngày ' + fmtD(TODAY()) + ', chưa ban hành.', body: text }); toast('Đã lưu vào Tài liệu'); $('#aid-st').textContent = 'Đã lưu vào Tài liệu (mã ' + r.id + ').'; }
      catch (e) { showErr('#aid-err', (e.message || String(e)) + ' Bạn có thể tải tệp Word hoặc sao chép bản thảo.'); }
    })
  });
}
async function draft(revise) {
  const body = { doc_type: $('#aid-t').value, tone: $('#aid-g').value, recipient: $('#aid-r').value, brief: $('#aid-b').value, references: $('#aid-c').value };
  if (revise) { body.previous = $('#aid-txt').value; body.revision = $('#aid-rv').value.trim(); if (!body.revision) return showErr('#aid-err', 'Vui lòng nhập yêu cầu chỉnh sửa.'); }
  $('#aid-err').hidden = true; $('#aid-st').textContent = 'Đang soạn… (có thể mất 10–60 giây)';
  try {
    const r = await api('/api/ai/compose', body);
    $('#aid-out').hidden = false; $('#aid-txt').value = r.text; $('#aid-rv').value = '';
    $('#aid-st').textContent = `Đã soạn bằng ${r.provider} · ${r.model}${r.truncated ? ' — văn bản quá dài, đã bị cắt' : ''}.`;
  } catch (e) { $('#aid-st').textContent = ''; showErr('#aid-err', e); }
}
function downloadDoc(text, kind) {
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${esc(kind)}</title>
    <style>@page{size:A4;margin:2cm 2cm 2cm 3cm}body{font-family:"Times New Roman",serif;font-size:14pt;line-height:1.5}p{margin:0 0 6pt}</style></head><body>${String(text).split('\n').map(l => `<p>${esc(l) || '&nbsp;'}</p>`).join('')}</body></html>`;
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + html], { type: 'application/msword' }));
  a.download = `${String(kind || 'van-ban').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^\w]+/g, '-').toLowerCase()}-${TODAY()}.doc`;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}

/* ================= 2. Trợ lý cuộc họp ================= */
async function meetingAssistant(id) {
  const st = AIS();
  if (!st.configured) { toast('Bạn chưa cấu hình trợ lý AI (Tài khoản › Trợ lý AI của tôi).', true); return; }
  const m = await GET('/api/meetings/' + id), kind = engine();
  const memberOpts = sel => `<option value="">— Chọn —</option>` + m.members.map(x => `<option value="${x.user_id}" ${x.user_id === sel ? 'selected' : ''}>${esc(x.full_name)}</option>`).join('');
  const projects = (B().projects || []).filter(p => p.status !== 'closed');
  openModal(`${S.mh('Trợ lý cuộc họp: ' + esc(m.title), `${fmtD(m.start_at)} · ${m.start_at.slice(11)}–${m.end_at.slice(11)} · ${m.members.length} thành phần`)}<div class="modal-b" id="aim-root">
    <h3 class="sec-t">1. Ghi âm, chép lời</h3>
    <div class="actions">${kind !== 'none' ? '<button class="btn" data-act="aim-mic" id="aim-mic" aria-pressed="false">● Ghi âm</button>' : ''}<span class="hint" id="aim-ms" aria-live="polite"></span></div>
    <p class="hint" style="margin:0">${esc(ENGINE_NOTE[kind](st.provider))} Chỉ ghi âm khi các thành phần dự họp đã được thông báo.</p>
    <div class="field full"><label for="aim-tr">Bản chép lời / ghi chép cuộc họp (sửa, bổ sung trực tiếp được)</label><textarea id="aim-tr" rows="9" placeholder="Bản chép lời sẽ hiện ở đây trong lúc ghi âm. Bạn cũng có thể gõ hoặc dán ghi chép."></textarea><span class="hint" id="aim-mi"></span></div>
    <div class="actions"><button class="btn primary" data-act="aim-go">✨ Lập biên bản và kết luận</button><span class="hint" id="aim-st" aria-live="polite"></span></div>
    <div id="aim-out" hidden>
      <h3 class="sec-t">2. Kết quả (kiểm tra trước khi lưu)</h3>
      <p id="aim-sum" class="notice info"></p>
      <div class="field full"><label for="aim-bb">Biên bản, kết luận</label><textarea id="aim-bb" rows="12"></textarea></div>
      <div class="actions"><button class="btn primary" data-act="aim-save" ${m.can_edit ? '' : 'disabled title="Chỉ người chủ trì hoặc người tạo cuộc họp được lưu biên bản"'}>Lưu vào biên bản cuộc họp</button><button class="btn" data-act="aim-doc">Tải tệp Word (.doc)</button></div>
      <h3 class="sec-t">3. Việc cần làm</h3>
      <div id="aim-tasks"></div>
    </div>
    <p class="err" id="aim-err" hidden></p></div>
  <div class="modal-f"><button class="btn" data-act="close">Đóng</button></div>`, {
    'aim-mic': () => { const r = CURRENT && CURRENT.anchor === 'aim-root' ? CURRENT.rec : bindRecorder('aim-root', '#aim-tr', { btn: '#aim-mic', stat: '#aim-ms', interim: '#aim-mi', stamp: true }); (r.active ? r.stop() : r.start()).catch(e => showErr('#aim-err', e)); },
    'aim-go': btn => S.busy(btn, async () => {
      if (CURRENT && CURRENT.anchor === 'aim-root' && CURRENT.rec.active) { $('#aim-st').textContent = 'Đang dừng ghi âm và chuyển nốt đoạn cuối…'; await CURRENT.rec.stop(); }
      $('#aim-err').hidden = true; $('#aim-st').textContent = 'Đang lập biên bản… (có thể mất 20–90 giây)';
      try {
        const r = await api('/api/ai/minutes', { meeting_id: m.id, transcript: $('#aim-tr').value });
        $('#aim-out').hidden = false; $('#aim-st').textContent = `Đã lập bằng ${r.provider} · ${r.model}${r.truncated ? ' — kết quả quá dài, đã bị cắt' : ''}.`;
        $('#aim-sum').textContent = r.tom_tat || (r.ok ? '' : 'Trợ lý không trả về đúng cấu trúc; dưới đây là nội dung nhận được.');
        $('#aim-bb').value = r.bien_ban + (r.ket_luan.length ? `\n\nKẾT LUẬN:\n${r.ket_luan.map((k, i) => `${i + 1}. ${k}`).join('\n')}` : '');
        $('#aim-tasks').innerHTML = r.viec_can_lam.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th><span class="sr-only">Chọn</span></th><th>Nội dung</th><th>Người thực hiện</th><th>Hạn</th></tr></thead><tbody>
          ${r.viec_can_lam.map((v, i) => `<tr><td><input type="checkbox" class="aim-ck" data-i="${i}" ${v.nguoi_thuc_hien_id ? 'checked' : ''} aria-label="Chọn việc ${i + 1}"></td><td><input class="aim-tt" data-i="${i}" value="${esc(v.noi_dung)}" aria-label="Nội dung việc ${i + 1}" style="width:100%"></td><td><select class="aim-ta" data-i="${i}" aria-label="Người thực hiện việc ${i + 1}">${memberOpts(v.nguoi_thuc_hien_id)}</select></td><td><input type="date" class="aim-td" data-i="${i}" value="${v.han || addDays(TODAY(), 7)}" aria-label="Hạn việc ${i + 1}"></td></tr>`).join('')}</tbody></table></div>
          <div class="form" style="margin-top:8px"><div class="field"><label for="aim-p">Dự án/phòng ban nhận việc</label><select id="aim-p">${projects.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></div><div class="field" style="justify-content:flex-end"><button class="btn" data-act="aim-assign" ${projects.length ? '' : 'disabled'}>Giao các việc đã chọn</button></div></div>`
          : '<p class="hint">Không có việc được giao rõ trong cuộc họp.</p>';
      } catch (e) { $('#aim-st').textContent = ''; showErr('#aim-err', e); }
    }),
    'aim-save': btn => S.busy(btn, async () => { try { await POST(`/api/meetings/${m.id}/minutes`, { minutes: $('#aim-bb').value }); toast('Đã lưu biên bản cuộc họp'); S.render(); } catch (e) { showErr('#aim-err', e); } }),
    'aim-doc': () => downloadDoc(`BIÊN BẢN CUỘC HỌP\n${m.title}\n\n${$('#aim-bb').value}`, 'Biên bản cuộc họp'),
    'aim-assign': btn => S.busy(btn, async () => {
      const rows = [...document.querySelectorAll('.aim-ck')].filter(c => c.checked).map(c => c.dataset.i);
      if (!rows.length) return showErr('#aim-err', 'Chưa chọn việc nào.');
      let ok = 0; const errs = [];
      for (const i of rows) {
        const q = s => document.querySelector(`${s}[data-i="${i}"]`), who = q('.aim-ta').value;
        if (!who) { errs.push(`Việc ${Number(i) + 1}: chưa chọn người thực hiện`); continue; }
        try { await POST('/api/tasks', { project_id: $('#aim-p').value, title: q('.aim-tt').value, assignee_id: Number(who), start_date: TODAY(), due_date: q('.aim-td').value, priority: 'tb', description: 'Theo kết luận cuộc họp: ' + m.title + ' (' + fmtD(m.start_at) + ')' }); ok++; q('.aim-ck').checked = false; q('.aim-ck').disabled = true; }
        catch (e) { errs.push(`Việc ${Number(i) + 1}: ${e.message}`); }
      }
      if (ok) { toast(`Đã giao ${ok} việc`); S.refreshBoot(); }
      if (errs.length) showErr('#aim-err', errs.join('; '));
    })
  });
}

Object.assign(ACTIONS, {
  'ai-draft': () => draftModal(),
  'ai-meeting': b => meetingAssistant(Number(b.dataset.id)).catch(e => toast(e.message, true))
});
window.SO_AI_OFFICE = { draftModal, meetingAssistant, Recorder, wavFrom, engine };
})();
