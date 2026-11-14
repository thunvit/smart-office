/* SmartOffice — Trợ lý AI cho công việc văn phòng (ADR-010, bổ sung 07/11/2026):
 * 1. Soạn văn bản hành chính (Tài liệu › Soạn văn bản bằng AI; nút trong khung trợ lý).
 * 2. Trợ lý cuộc họp: ghi âm → chép lời theo từng người phát biểu (gợi ý người nói bằng mẫu giọng, ADR-011) → biên bản và thông báo kết luận
 *    theo thể thức Nghị định 30/2020/NĐ-CP → bóc tách đầu việc, đề xuất người chủ trì/phối hợp → giao việc (Lịch họp › chi tiết cuộc họp).
 * 3. Mẫu giọng nói của tôi (Tài khoản): tự đăng ký, có đồng ý; chỉ lưu đặc trưng, không lưu âm thanh; cập nhật thêm từ đoạn phát biểu đã xác nhận;
 *    tự xóa khi tài khoản ngừng hoạt động.
 * Ghi âm:
 *  - Nhà cung cấp OpenAI/Gemini: thu âm thanh tại trình duyệt (WAV 16 kHz, đoạn 60 giây), máy chủ chuyển thành chữ qua nhà cung cấp.
 *  - Anthropic (không nhận âm thanh): dùng nhận dạng giọng nói của trình duyệt (Chrome/Edge; âm thanh do hãng trình duyệt xử lý).
 *  - Bản ghi âm cuộc họp (chủ trì/người tạo cuộc họp chọn lưu): nén Opus tại trình duyệt, gửi từng phần, máy chủ giữ 24 giờ để tải về rồi tự xóa
 *    (quyết định của chủ sở hữu khi duyệt ADR-011). Âm thanh lấy mẫu giọng không được lưu. */
(function () {
'use strict';
const S = window.SO;
const { $, esc, GET, POST, PUT, DEL, toast, showErr, openModal, closeModal, ACTIONS, TODAY, addDays, fmtD } = S;
const B = () => S.B;
const AIS = () => (window.SO_AI && window.SO_AI.status && window.SO_AI.status()) || {};
const DOC_TYPES = { thu: 'Thư điện tử / thư công tác', khac: 'Văn bản khác' }; // văn bản tự do; các loại có thể thức soạn ở draftModal
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
const VX = () => window.SO_VOICE; // public/voice-id.js: đặc trưng giọng tính tại trình duyệt
const hasMic = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && (window.AudioContext || window.webkitAudioContext));
function engine() {
  if (AIS().audio_server && hasMic()) return 'server';
  if (SR) return 'browser';
  return 'none';
}
const ENGINE_NOTE = {
  server: p => `Ghi âm theo đoạn 60 giây; máy chủ chuyển giọng nói thành chữ qua ${p === 'gemini' ? 'Google Gemini' : 'OpenAI'} bằng khóa API đã cấu hình. Âm thanh không được lưu.`,
  browser: () => 'Nhận dạng giọng nói của trình duyệt (tiếng Việt). Âm thanh do hãng trình duyệt (Google/Microsoft) xử lý. Muốn chuyển giọng nói tại máy chủ, cấu hình OpenAI hoặc Gemini tại Tài khoản › Trợ lý AI của tôi.',
  none: () => 'Trình duyệt này không hỗ trợ nhận dạng giọng nói và cấu hình hiện tại không chuyển giọng nói tại máy chủ. Hãy gõ hoặc dán ghi chép.'
};
const micError = e => new Error(e && e.name === 'NotFoundError' ? 'Không tìm thấy micro trên thiết bị.' : e && (e.name === 'NotAllowedError' || e.name === 'SecurityError') ? 'Trình duyệt không cho phép dùng micro. Hãy cho phép quyền micro cho trang này (biểu tượng ổ khóa trên thanh địa chỉ) rồi thử lại.' : 'Không mở được micro: ' + ((e && e.message) || e));
/** Mở micro và thu mẫu âm thanh thô (Float32, tần số của thiết bị). onData(chunk) gọi liên tục; trả hàm dừng. */
async function openMic(onData) {
  let stream; try { stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } }); } catch (e) { throw micError(e); }
  const ctx = new (window.AudioContext || window.webkitAudioContext)(), src = ctx.createMediaStreamSource(stream), node = ctx.createScriptProcessor(4096, 1, 1);
  node.onaudioprocess = e => onData(new Float32Array(e.inputBuffer.getChannelData(0)));
  src.connect(node); node.connect(ctx.destination);
  return { rate: ctx.sampleRate, async close() { try { node.disconnect(); } catch (e) {} stream.getTracks().forEach(t => t.stop()); try { await ctx.close(); } catch (e) {} } };
}
/** Thu âm trong `secs` giây, trả âm thanh 16 kHz (dùng để lấy mẫu giọng). onTick(giây đã thu). */
async function captureSeconds(secs, onTick) {
  const chunks = []; let n = 0, mic = null;
  mic = await openMic(c => { chunks.push(c); n += c.length; });
  const t0 = Date.now();
  await new Promise(res => { const iv = setInterval(() => { const s = (Date.now() - t0) / 1000; onTick && onTick(Math.min(secs, s)); if (s >= secs) { clearInterval(iv); res(); } }, 250); });
  await mic.close();
  return VX().to16k(chunks, mic.rate);
}
function wav16(pcm) {
  const buf = new ArrayBuffer(44 + pcm.length * 2), d = new DataView(buf), w = (p, s) => { for (let i = 0; i < s.length; i++) d.setUint8(p + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); d.setUint32(4, 36 + pcm.length * 2, true); w(8, 'WAVE'); w(12, 'fmt '); d.setUint32(16, 16, true); d.setUint16(20, 1, true); d.setUint16(22, 1, true);
  d.setUint32(24, 16000, true); d.setUint32(28, 32000, true); d.setUint16(32, 2, true); d.setUint16(34, 16, true); w(36, 'data'); d.setUint32(40, pcm.length * 2, true);
  const out = new Int16Array(buf, 44); for (let i = 0; i < pcm.length; i++) { const v = Math.max(-1, Math.min(1, pcm[i] || 0)); out[i] = v < 0 ? v * 0x8000 : v * 0x7fff; }
  return buf;
}
const wavFrom = (chunks, inRate) => { const pcm = VX().to16k(chunks, inRate); return { buf: wav16(pcm), seconds: pcm.length / 16000, pcm }; };
const b64 = buf => { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
const slice16 = (pcm, a, b) => pcm.subarray(Math.max(0, Math.floor(a * 16000)), Math.min(pcm.length, Math.ceil(b * 16000)));
const joinPcm = list => { const n = list.reduce((s, x) => s + x.length, 0), o = new Float32Array(n); let p = 0; for (const x of list) { o.set(x, p); p += x.length; } return o; };

/** Ghi âm, chép lời.
 * on.onText(text, 'mm:ss')  – chỉ cần chữ (soạn văn bản);
 * on.onSeg({ t, text, emb, spk }) – trợ lý cuộc họp: t = giây từ lúc bắt đầu, emb = dấu giọng của đoạn (null nếu không tính được), spk = nhãn người nói của nhà cung cấp (nếu có);
 * on.onInterim, on.onState, on.onError. */
function Recorder(on) {
  const kind = engine(), wantSeg = !!on.onSeg;
  let active = false, started = 0, timer = null, mic = null, chunks = [], queue = Promise.resolve(), pending = 0, rec = null, segStart = 0, chunkNo = 0;
  let side = null, sideChunks = [], sideCut = 0; // trình duyệt chép lời: thu âm song song chỉ để tính dấu giọng từng câu
  const secsNow = () => (Date.now() - started) / 1000;
  const emit = (text, t, emb, spk) => { if (!text) return; if (wantSeg) on.onSeg({ t, text, emb: emb || null, spk: spk || null }); else on.onText(text, mmss(t)); };
  const state = () => on.onState && on.onState({ active, kind, secs: active ? secsNow() : 0, pending });
  const emb = pcm => { try { return VX() ? VX().embed(pcm) : null; } catch (e) { return null; } };
  function flush() {
    if (!chunks.length || !mic) return;
    const { buf, seconds, pcm } = wavFrom(chunks, mic.rate), t0 = segStart, no = ++chunkNo; chunks = []; segStart = secsNow();
    if (seconds < 1) return;
    pending++; state();
    queue = queue.then(async () => {
      try {
        const r = await api('/api/ai/transcribe', { audio: b64(buf), mime: 'audio/wav', seconds, segments: wantSeg });
        if (wantSeg && Array.isArray(r.segments) && r.segments.length) {
          /* Nhà cung cấp gắn nhãn người nói (diarize): gộp âm thanh cùng nhãn trong đoạn 60 giây để dấu giọng ổn định hơn */
          const pooled = new Map();
          for (const s of r.segments) if (s.speaker) { const k = s.speaker; pooled.set(k, (pooled.get(k) || []).concat([slice16(pcm, s.start, s.end)])); }
          const pe = new Map([...pooled].map(([k, l]) => [k, emb(joinPcm(l))]));
          for (const s of r.segments) emit(s.text, t0 + s.start, s.speaker ? pe.get(s.speaker) : emb(slice16(pcm, s.start, s.end)), s.speaker ? no + ':' + s.speaker : null);
        } else if (r.text) emit(r.text, t0, wantSeg ? emb(pcm) : null);
      } catch (e) { on.onError && on.onError(e); }
      pending--; state();
    });
  }
  async function start() {
    if (active) return;
    if (kind === 'none') throw new Error(ENGINE_NOTE.none());
    if (kind === 'server') mic = await openMic(c => { if (!active) return; chunks.push(c); if (secsNow() - segStart >= 60) flush(); });
    else if (wantSeg && hasMic() && VX()) { try { side = await openMic(c => { if (active) sideChunks.push(c); }); } catch (e) { side = null; } } // không mở được thì vẫn chép lời, chỉ không gợi ý người nói
    started = Date.now(); active = true; segStart = 0; sideCut = 0; sideChunks = []; // chỉ đánh dấu đang ghi khi đã mở được micro
    if (kind === 'browser') {
      rec = new SR(); rec.lang = 'vi-VN'; rec.continuous = true; rec.interimResults = true;
      rec.onresult = e => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (!r.isFinal) { interim += r[0].transcript; continue; }
          let v = null; if (side && sideChunks.length) { v = emb(VX().to16k(sideChunks, side.rate)); sideChunks = []; }
          emit(r[0].transcript.trim(), sideCut, v); sideCut = secsNow();
        }
        on.onInterim && on.onInterim(interim);
      };
      rec.onerror = e => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { active = false; on.onError && on.onError(new Error('Trình duyệt không cho phép dùng micro.')); state(); } };
      rec.onend = () => { if (active) { try { rec.start(); } catch (e) {} } };
      rec.start();
    }
    timer = setInterval(state, 1000); state();
  }
  async function stop() {
    if (!active) return queue;
    active = false; clearInterval(timer);
    if (kind === 'server') { flush(); if (mic) await mic.close(); mic = null; }
    else { if (rec) { try { rec.stop(); } catch (e) {} on.onInterim && on.onInterim(''); } if (side) { await side.close(); side = null; } }
    state();
    return queue;
  }
  return { start, stop, kind, get active() { return active; } };
}
/** Lưu bản ghi âm cuộc họp lên máy chủ 24 giờ để tải về (ADR-011).
 * MediaRecorder nén Opus khoảng 24 kbit/s (khoảng 11 MB/giờ), cứ 30 giây gửi một phần theo thứ tự.
 * Gửi lỗi thì giữ phần đó và thử lại ở lần sau; toàn bộ âm thanh vẫn giữ tại trình duyệt để tải trực tiếp nếu không gửi được. */
const ARCH_MIME = () => { const MR = window.MediaRecorder; if (!MR || !MR.isTypeSupported || !hasMic()) return ''; return ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm'].find(t => MR.isTypeSupported(t)) || ''; };
function AudioArchive(meetingId, onChange) {
  const mime = ARCH_MIME(), PART = 900 * 1024;
  let stream = null, mr = null, info = null, seq = 0, started = 0, ended = 0, waiting = [], local = [], sending = false, lastErr = null;
  const secs = () => ((ended || Date.now()) - started) / 1000; // thời lượng tính đến lúc bấm dừng, không tính thời gian gửi nốt
  const changed = () => onChange && onChange({ uploading: waiting.length, error: lastErr, info });
  async function pump() {
    if (sending || !info) return; sending = true;
    try {
      while (waiting.length) {
        const blob = waiting[0];
        try { info = await PUT(`/api/meetings/${meetingId}/audio/${info.id}/parts/${seq}`, { data: b64(await blob.arrayBuffer()), seconds: Math.round(secs()) }); seq++; waiting.shift(); lastErr = null; }
        catch (e) { lastErr = e; break; }
      }
    } finally { sending = false; changed(); }
  }
  const push = blob => { if (!blob || !blob.size) return; local.push(blob); for (let i = 0; i < blob.size; i += PART) waiting.push(blob.slice(i, i + PART)); pump(); };
  return {
    mime,
    async start() {
      if (!mime) throw new Error('Trình duyệt không hỗ trợ nén âm thanh để lưu.');
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } }); } catch (e) { throw micError(e); }
      try { info = await POST(`/api/meetings/${meetingId}/audio/start`, { mime }); mr = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 24000 }); }
      catch (e) { stream.getTracks().forEach(t => t.stop()); stream = null; throw e; }
      mr.ondataavailable = e => push(e.data);
      started = Date.now(); mr.start(30000); changed();
    },
    async stop() {
      if (!ended) ended = Date.now();
      if (mr && mr.state !== 'inactive') await new Promise(r => { mr.onstop = r; try { mr.stop(); } catch (e) { r(); } });
      if (stream) stream.getTracks().forEach(t => t.stop());
      mr = null; stream = null;
      for (let i = 0; i < 3 && waiting.length; i++) { await pump(); if (waiting.length) await new Promise(r => setTimeout(r, 2000)); }
      if (!waiting.length && info) { try { info = await POST(`/api/meetings/${meetingId}/audio/${info.id}/finish`, { seconds: Math.round(secs()) }); } catch (e) { lastErr = e; } }
      changed();
      return { ok: !waiting.length && !lastErr, error: lastErr };
    },
    /* Âm thanh giữ tại trình duyệt: dùng khi không gửi được lên máy chủ */
    localBlob: () => local.length ? new Blob(local, { type: mime.split(';')[0] }) : null,
    get uploading() { return waiting.length; }
  };
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

/* ================= 1. Soạn văn bản theo thể thức Nghị định 30/2020/NĐ-CP (ADR-013) ================= */
const slug = t => String(t || 'van-ban').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
function saveFile(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); }
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const SAVE_KEYS = ['org_parent', 'org_name', 'abbr', 'dv', 'place', 'dia_chi', 'soan']; // thông tin thể thức nhớ tại trình duyệt này
const QUYEN = { '': 'Ký trực tiếp (không ghi quyền hạn)', 'TM.': 'TM. – thay mặt tập thể', 'Q.': 'Q. – quyền cấp trưởng', 'KT.': 'KT. – ký thay người đứng đầu', 'TL.': 'TL. – thừa lệnh', 'TUQ.': 'TUQ. – thừa ủy quyền' };
const KHAN = { '': 'Không', khan: 'KHẨN', thuong_khan: 'THƯỢNG KHẨN', hoa_toc: 'HỎA TỐC' };
const PHAMVI = { '': 'Không', 'XEM XONG TRẢ LẠI': 'XEM XONG TRẢ LẠI', 'LƯU HÀNH NỘI BỘ': 'LƯU HÀNH NỘI BỘ' };
const CONTENT_KEYS = ['trich_yeu', 'kinh_gui', 'tham_quyen', 'can_cu', 'mo_dau', 'noi_dung', 'noi_nhan', 'gm', 'cd', 'bb', 'phu_luc'];

let NDFIT = null; window.addEventListener('resize', () => { if (NDFIT) NDFIT(); });
function draftModal(seed = {}) {
  const N = ND(); if (!N) { toast('Chưa tải được mô-đun thể thức văn bản.', true); return; }
  const st = AIS(), kind = engine(), me = B().me, saved = loadHdr();
  let loai = N.TYPES[seed.doc_type] ? seed.doc_type : 'congvan', MODEL = null, Q = { k: '', d: '' };
  const R = Object.assign({ org_parent: '', org_name: (B().settings && B().settings.org_name) || '', abbr: '', dv: '', place: '', so: '', date: TODAY(), soan: '', so_ban: '', dia_chi: '', khan: '', pham_vi: '',
    trich_yeu: '', kinh_gui: '', tham_quyen: '', can_cu: '', mo_dau: '', noi_dung: '', noi_nhan: '', ky: { quyen: '', chuc_vu: me.title || '', name: me.full_name || '' },
    gm: {}, ggt: {}, gnp: {}, bb: {}, cd: { nguoi_dien: '', gui: '' }, phu_luc: [] }, Object.fromEntries(Object.entries(saved).filter(([, v]) => v)), seed.fields || {});
  const val = k => { const v = k.split('.').reduce((o, x) => (o == null ? '' : o[x]), R); return Array.isArray(v) ? v.join('\n') : v == null ? '' : v; };
  const setv = (k, v) => { const ps = k.split('.'); let o = R; for (let i = 0; i < ps.length - 1; i++) { if (o[ps[i]] == null || typeof o[ps[i]] !== 'object') o[ps[i]] = {}; o = o[ps[i]]; } o[ps[ps.length - 1]] = v; };
  const T = () => N.TYPES[loai], K = () => T().k;
  const f = (k, label, o = {}) => {
    const id = 'nd-' + k.replace(/\W/g, '_'), v = esc(val(k));
    const ctl = o.sel ? `<select id="${id}" data-k="${k}">${Object.entries(o.sel).map(([a, l]) => `<option value="${esc(a)}" ${String(val(k)) === a ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`
      : o.area ? `<textarea id="${id}" data-k="${k}" rows="${o.rows || 3}" maxlength="${o.max || 8000}" placeholder="${esc(o.ph || '')}">${v}</textarea>`
      : `<input id="${id}" data-k="${k}" type="${o.type || 'text'}" value="${v}" maxlength="${o.max || 300}" placeholder="${esc(o.ph || '')}">`;
    return `<div class="field ${o.full || o.area ? 'full' : ''}"><label for="${id}">${label}</label>${ctl}${o.hint ? `<span class="hint">${o.hint}</span>` : ''}</div>`;
  };
  const typeOpts = () => N.GROUPS.map(([g, keys]) => `<optgroup label="${esc(g)}">${keys.map(k => `<option value="${k}" ${k === loai ? 'selected' : ''}>${esc(N.TYPES[k].ten)} — Mẫu ${N.TYPES[k].mau}</option>`).join('')}</optgroup>`).join('') + '<optgroup label="Không theo thể thức"><option value="__free">Thư, ghi chú, văn bản tự do…</option></optgroup>';
  const plHtml = () => R.phu_luc.map((p, i) => `<div class="nd-pl"><div class="nd-pl-h"><b>Phụ lục ${R.phu_luc.length > 1 ? ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][i] : ''}</b><button class="btn sm" data-act="nd-pdel" data-i="${i}" type="button">Xóa</button></div>${f(`phu_luc.${i}.ten`, 'Tên phụ lục', { max: 200 })}${f(`phu_luc.${i}.noi_dung`, 'Nội dung phụ lục', { area: true, rows: 4, max: 40000 })}</div>`).join('');
  function formHtml() {
    const k = K(), t = T(), bb = k === 'bb', free = ['gm', 'ggt', 'gnp'].includes(k);
    const aiOk = t.ai && st.configured;
    const ai = t.ai ? `<fieldset><legend>Soạn nội dung bằng trợ lý AI</legend>${aiOk ? `<div class="form">
      <div class="field"><label for="nd-tone">Giọng văn</label><select id="nd-tone">${opts(TONES, 'trangtrong')}</select></div><div></div>
      <div class="field full"><label for="nd-brief">Yêu cầu, ý chính cần soạn</label><textarea id="nd-brief" rows="4" maxlength="8000" placeholder="Ví dụ: đề nghị Sở TT&TT hỗ trợ đào tạo chuyển đổi số cho 20 cán bộ trong tháng 12; kinh phí do đơn vị tự đảm bảo."></textarea>
        <div class="actions" style="margin-top:6px">${kind !== 'none' ? '<button class="btn sm" data-act="nd-mic" id="nd-mic" aria-pressed="false" type="button">● Ghi âm</button>' : ''}<span class="hint" id="nd-ms"></span><span class="hint" id="nd-mi"></span></div></div>
      <div class="field full"><label for="nd-ref">Căn cứ, tài liệu tham khảo (tùy chọn)</label><textarea id="nd-ref" rows="3" maxlength="8000" placeholder="Dán trích đoạn văn bản căn cứ, số liệu… Trợ lý không tự bịa căn cứ pháp lý."></textarea></div></div>
      <div class="actions"><button class="btn primary" data-act="nd-ai" type="button">✨ Soạn nội dung</button><span class="hint" id="nd-st" aria-live="polite"></span></div>
      <p class="hint">Trợ lý chỉ viết <b>nội dung</b> (trích yếu, căn cứ, nội dung, nơi nhận). Thể thức do hệ thống dựng theo Nghị định 30/2020/NĐ-CP; bạn kiểm tra và sửa các ô bên dưới.</p>`
      : `<p class="hint">Chưa cấu hình trợ lý AI (Tài khoản › Trợ lý AI của tôi). Vẫn nhập tay các ô bên dưới được; thể thức do hệ thống dựng.</p>`}</fieldset>` : `<p class="hint">Loại văn bản này nhập trực tiếp các ô bên dưới.</p>`;
    const the = `<fieldset><legend>Thể thức ban hành</legend><div class="form">
      ${f('org_parent', 'Cơ quan, tổ chức chủ quản trực tiếp (nếu có)', { max: 200, ph: 'Ví dụ: UBND tỉnh Ninh Bình' })}${f('org_name', 'Tên cơ quan, tổ chức ban hành', { max: 200 })}
      ${f('abbr', 'Chữ viết tắt tên cơ quan (ký hiệu)', { max: 40, ph: 'Ví dụ: SNV' })}${f('dv', k === 'cv' ? 'Chữ viết tắt đơn vị soạn thảo, lĩnh vực (ký hiệu công văn)' : 'Đơn vị soạn thảo (viết tắt, ghi ở dòng Lưu)', { max: 40, ph: 'Ví dụ: VP' })}
      ${bb ? '' : f('place', 'Địa danh', { max: 60, ph: 'Ví dụ: Ninh Bình' }) + f('date', 'Ngày ban hành', { type: 'date' })}
      ${f('so', 'Số văn bản', { max: 6, ph: 'Để trống nếu Văn thư cấp số', hint: 'Số nhỏ hơn 10 tự thêm số 0 phía trước.' })}${f('soan', 'Ký hiệu người soạn, số lượng bản phát hành', { max: 40, ph: 'Ví dụ: NVT (3)' })}
      ${f('khan', 'Mức độ khẩn', { sel: KHAN })}${f('pham_vi', 'Chỉ dẫn phạm vi lưu hành', { sel: PHAMVI })}
      ${f('dia_chi', 'Địa chỉ cơ quan, thư điện tử, điện thoại (chân trang đầu)', { area: true, rows: 2, max: 900, ph: 'Mỗi dòng một thông tin' })}</div></fieldset>
      <fieldset><legend>${bb ? 'Chủ tọa ký' : 'Người ký'}</legend><div class="form">
      <div class="field"><label for="nd-qk">Quyền hạn người ký</label><select id="nd-qk" data-k="_qk">${Object.entries(QUYEN).map(([a, l]) => `<option value="${esc(a)}" ${Q.k === a ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
      <div class="field"><label for="nd-qd">Chức vụ người đứng đầu hoặc tên tập thể</label><input id="nd-qd" data-k="_qd" value="${esc(Q.d)}" maxlength="90" placeholder="Ví dụ: Giám đốc (khi ký thay)"></div>
      ${f('ky.chuc_vu', 'Chức vụ của người ký', { max: 100 })}${f('ky.name', 'Họ và tên người ký', { max: 100, hint: 'Không ghi học hàm, học vị.' })}</div></fieldset>`;
    const body = `<fieldset><legend>Nội dung</legend><div class="form">
      ${bb || free ? (bb ? f('trich_yeu', 'Tên cuộc họp, hội nghị', { full: true, max: 500 }) : k === 'gm' ? f('trich_yeu', 'Trích yếu (nội dung cuộc họp)', { full: true, max: 500 }) : '') : f('trich_yeu', k === 'cv' ? 'Trích yếu (sau chữ “V/v”)' : k === 'qd' ? 'Trích yếu (sau chữ “Về việc”)' : 'Trích yếu nội dung', { full: true, max: 500, area: true, rows: 2 })}
      ${['cv', 'tl'].includes(k) ? f('kinh_gui', 'Kính gửi (mỗi dòng một nơi)', { area: true, rows: 2, max: 3000, hint: ['totrinh', 'baocao'].includes(loai) ? 'Tờ trình, báo cáo gửi cấp trên bắt buộc có “Kính gửi”.' : '' }) : ''}
      ${['nq', 'qd', 'qdbh'].includes(k) ? f('tham_quyen', 'Thẩm quyền ban hành', { full: true, max: 200, ph: 'Ví dụ: GIÁM ĐỐC SỞ NỘI VỤ' }) : ''}
      ${['nq', 'qd', 'qdbh', 'tl'].includes(k) ? f('can_cu', 'Căn cứ ban hành (mỗi dòng một căn cứ)', { area: true, rows: 3, max: 12000, ph: 'Căn cứ Luật …;\nTheo đề nghị của …' }) : ''}
      ${(N.FIELDS[k] || []).map(([p, lab, ph, area, ty]) => f(p, lab, { area: !!area, rows: 2, ph, type: ty === 'date' ? 'date' : ty === 'time' ? 'time' : ty === 'datetime' ? 'datetime-local' : 'text', max: 2000, full: !!area })).join('')}
      ${free ? '' : f('noi_dung', bb ? 'Diễn biến, kết luận cuộc họp' : 'Nội dung văn bản', { area: true, rows: 12, max: 60000, hint: 'Mỗi dòng một đoạn. <code>Điều 1. Tiêu đề</code> · <code>1.</code> khoản · <code>a)</code> điểm · <code>-</code> gạch đầu dòng · <code>I.</code> mục lớn. Chỗ thiếu ghi <code>[cần bổ sung: …]</code>.' })}
      ${bb ? '' : f('noi_nhan', 'Nơi nhận (mỗi dòng một nơi; “Như trên” và “Lưu: VT” tự thêm)', { area: true, rows: 2, max: 6000 })}</div></fieldset>
      <fieldset><legend>Phụ lục</legend><div id="nd-pl">${plHtml()}</div><div class="actions"><button class="btn sm" data-act="nd-padd" type="button" ${R.phu_luc.length >= 10 ? 'disabled' : ''}>+ Thêm phụ lục</button><span class="hint">Mỗi phụ lục bắt đầu ở trang mới, đánh số trang riêng.</span></div></fieldset>`;
    return ai + the + body;
  }
  openModal(`${S.mh('Soạn văn bản theo thể thức Nghị định 30/2020/NĐ-CP', 'Bản thảo; người soạn chịu trách nhiệm kiểm tra nội dung, thể thức trước khi trình ký (Điều 10, 12)')}<div class="modal-b" id="nd-root">
    <div class="field full"><label for="nd-type">Loại văn bản</label><select id="nd-type" data-k="loai">${typeOpts()}</select><span class="hint" id="nd-tn"></span></div>
    <div class="nd-grid"><div class="nd-form" id="nd-form">${formHtml()}</div>
      <div class="nd-prev"><div class="seg" role="group" aria-label="Chế độ xem"><button aria-pressed="true" data-act="nd-tab" data-t="prev" type="button">Xem trước</button><button aria-pressed="false" data-act="nd-tab" data-t="chk" type="button" id="nd-chk-b">Kiểm tra thể thức</button></div>
        <div class="nd-fit" id="nd-fit"><div class="nd-sheet" id="nd-sheet" aria-live="polite"></div></div>
        <div id="nd-chk" hidden></div>
        <div class="actions"><button class="btn primary" data-act="nd-docx" type="button">Tải Word (.docx)</button><button class="btn" data-act="nd-copy" type="button">Sao chép văn bản</button><button class="btn" data-act="nd-save" type="button">Lưu vào Tài liệu</button></div>
        <div class="field full" id="nd-revw"><label for="nd-rv">Yêu cầu chỉnh sửa bằng trợ lý AI</label><div class="actions"><input id="nd-rv" maxlength="2000" placeholder="Ví dụ: thêm mục kinh phí, rút gọn còn 1 trang" style="flex:1;min-width:180px"><button class="btn" data-act="nd-rev" type="button">Soạn lại</button></div></div>
        <p class="hint">${esc(ENGINE_NOTE[kind](st.provider))}</p></div></div>
    <p class="err" id="nd-err" hidden></p></div>
  <div class="modal-f"><button class="btn" data-act="close">Đóng</button></div>`, {
    'nd-tab': b => { document.querySelectorAll('#nd-root [data-act=nd-tab]').forEach(t => t.setAttribute('aria-pressed', String(t === b))); $('#nd-fit').hidden = b.dataset.t !== 'prev'; $('#nd-chk').hidden = b.dataset.t !== 'chk'; if (b.dataset.t === 'prev') fit(); },
    'nd-padd': () => { R.phu_luc.push({ ten: '', noi_dung: '' }); $('#nd-pl').innerHTML = plHtml(); refresh(); },
    'nd-pdel': b => { R.phu_luc.splice(Number(b.dataset.i), 1); $('#nd-pl').innerHTML = plHtml(); refresh(); },
    'nd-mic': () => { const r = CURRENT && CURRENT.anchor === 'nd-root' ? CURRENT.rec : bindRecorder('nd-root', '#nd-brief', { btn: '#nd-mic', stat: '#nd-ms', interim: '#nd-mi' }); (r.active ? r.stop() : r.start()).catch(e => showErr('#nd-err', e)); },
    'nd-ai': btn => S.busy(btn, () => ai(false)),
    'nd-rev': btn => S.busy(btn, () => ai(true)),
    'nd-docx': () => { const m = refresh(), n = N.check(Object.assign({}, R, { loai }), TODAY()).filter(x => x.level === 'loi').length; saveFile(new Blob([N.docx(m, m.title)], { type: DOCX_MIME }), `${slug(T().ten)}-${TODAY()}.docx`); toast(n ? `Đã tải tệp Word. Còn ${n} mục thể thức cần sửa (xem tab Kiểm tra thể thức).` : 'Đã tải tệp Word', !!n); },
    'nd-copy': async () => { const m = refresh(); try { await navigator.clipboard.writeText(m.text); } catch (e) { const ta = document.createElement('textarea'); ta.value = m.text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); } toast('Đã sao chép'); },
    'nd-save': btn => S.busy(btn, async () => {
      const m = refresh(); $('#nd-err').hidden = true;
      try { const r = await POST('/api/docs', { title: m.title.slice(0, 300), category: 'khac', description: `Bản thảo ${T().ten} theo thể thức Nghị định 30/2020/NĐ-CP, soạn ngày ${fmtD(TODAY())}, chưa ban hành.`, body: m.text }); toast('Đã lưu vào Tài liệu (mã ' + r.id + ')'); }
      catch (e) { showErr('#nd-err', (e.message || String(e)) + ' Bạn có thể tải tệp Word hoặc sao chép bản thảo.'); }
    })
  });
  const root = $('#nd-root');
  function rerender() { // dựng lại các ô theo loại văn bản hoặc kết quả AI, giữ nguyên chữ đang nhập ở khung trợ lý
    const keep = ['nd-brief', 'nd-ref', 'nd-tone'].map(id => [id, ($('#' + id) || {}).value]);
    $('#nd-form').innerHTML = formHtml(); keep.forEach(([id, v]) => { const e = $('#' + id); if (e && v != null) e.value = v; });
  }
  function mark() { $('#nd-tn').textContent = `Mẫu ${T().mau} Phụ lục III${T().ab ? '; chữ viết tắt trong ký hiệu: ' + T().ab : '; ký hiệu gồm chữ viết tắt cơ quan và đơn vị soạn thảo'}.`; $('#nd-revw').hidden = !(T().ai && st.configured); }
  function fit() { const box = $('#nd-fit'), sh = $('#nd-sheet'); if (!box || !sh || box.hidden) return; sh.style.zoom = String(Math.min(1, Math.max(0.3, (box.clientWidth - 18) / 794))); }
  function refresh() {
    const doc = Object.assign({}, R, { loai });
    try { MODEL = N.compose(doc); } catch (e) { $('#nd-sheet').textContent = 'Không dựng được văn bản: ' + e.message; return MODEL; }
    $('#nd-sheet').innerHTML = N.toHtml(MODEL); fit();
    const ck = N.check(doc, TODAY()), nl = ck.filter(x => x.level === 'loi').length;
    $('#nd-chk-b').textContent = `Kiểm tra thể thức (${ck.length ? nl + ' lỗi, ' + (ck.length - nl) + ' lưu ý' : 'đạt'})`;
    $('#nd-chk').innerHTML = ck.length ? `<ul class="nd-ck">${ck.map(x => `<li class="${x.level}"><b>${x.level === 'loi' ? 'Cần sửa' : 'Lưu ý'}:</b> ${esc(x.msg)}<small>${esc(x.ref)}</small></li>`).join('')}</ul>` : '<p class="notice ok">Các thành phần thể thức bắt buộc đã đủ. Người trình ký vẫn kiểm tra nội dung trước khi ký.</p>';
    return MODEL;
  }
  let tmr = null; const later = () => { clearTimeout(tmr); tmr = setTimeout(refresh, 250); };
  const quyen = () => { R.ky.quyen = Q.k ? (Q.k + (Q.d.trim() ? ' ' + Q.d.trim() : '')) : ''; };
  const onEdit = e => {
    const t = e.target, k = t.dataset && t.dataset.k; if (!k) return;
    if (k === 'loai') {
      if (t.value === '__free') { closeModal(); draftFreeModal({ brief: (($('#nd-brief') || {}).value) || '' }); return; }
      loai = t.value; rerender(); mark(); refresh(); return;
    }
    if (k === '_qk') { Q.k = t.value; quyen(); later(); return; }
    if (k === '_qd') { Q.d = t.value; quyen(); later(); return; }
    setv(k, t.value);
    if (SAVE_KEYS.includes(k)) saveHdr(Object.assign(loadHdr(), { [k]: t.value }));
    later();
  };
  root.addEventListener('input', onEdit); root.addEventListener('change', onEdit);
  NDFIT = fit;
  async function ai(revise) {
    const t = T(); $('#nd-err').hidden = true; const st_ = $('#nd-st');
    const brief = (($('#nd-brief') || {}).value || '').trim(), rv = ($('#nd-rv').value || '').trim();
    if (revise && !rv) return showErr('#nd-err', 'Vui lòng nhập yêu cầu chỉnh sửa.');
    if (!revise && !brief) return showErr('#nd-err', 'Vui lòng nhập yêu cầu, ý chính của văn bản.');
    const content = {}; CONTENT_KEYS.forEach(k => { content[k] = R[k]; });
    const body = { doc_type: loai, format: 'nd30', tone: ($('#nd-tone') || {}).value, brief: brief || rv, references: (($('#nd-ref') || {}).value) || '', org_name: R.org_name, org_parent: R.org_parent,
      recipient: String(val('kinh_gui') || val('noi_nhan') || '').slice(0, 800) };
    if (revise) { body.previous = JSON.stringify(N.normDoc(Object.assign({}, R, { loai }))).slice(0, 40000); body.revision = rv; }
    if (st_) st_.textContent = 'Đang soạn… (có thể mất 10–60 giây)';
    try {
      const r = await api('/api/ai/compose', body);
      if (r.structured) {
        const d = r.doc || {};
        ['trich_yeu', 'tham_quyen', 'mo_dau', 'noi_dung'].forEach(k => { if (d[k]) R[k] = d[k]; });
        ['kinh_gui', 'can_cu', 'noi_nhan'].forEach(k => { if (d[k] && d[k].length) R[k] = d[k].join('\n'); });
        ['gm', 'bb'].forEach(g => { if (d[g]) R[g] = Object.assign(R[g] || {}, Object.fromEntries(Object.entries(d[g]).filter(([, v]) => v))); });
        if (d.cd) { if (d.cd.nguoi_dien) R.cd.nguoi_dien = d.cd.nguoi_dien; if (d.cd.gui && d.cd.gui.length) R.cd.gui = d.cd.gui.join('\n'); }
        if (d.phu_luc && d.phu_luc.length) R.phu_luc = d.phu_luc;
        rerender(); refresh();
        $('#nd-st') && ($('#nd-st').textContent = `Đã soạn bằng ${r.provider} · ${r.model}${r.truncated ? ' — nội dung quá dài, có thể bị cắt' : ''}. Hãy đọc và sửa các ô bên dưới.`);
      } else {
        R.noi_dung = r.text || ''; rerender(); refresh();
        $('#nd-st') && ($('#nd-st').textContent = 'Trợ lý không trả đúng cấu trúc; toàn bộ chữ nhận được đã đưa vào ô Nội dung để bạn tự phân chia.');
      }
      $('#nd-rv').value = '';
    } catch (e) { if (st_) st_.textContent = ''; showErr('#nd-err', e); }
  }
  mark(); refresh();
}

/* ================= 1b. Soạn văn bản tự do (thư, ghi chú; không theo thể thức) ================= */
function draftFreeModal(seed = {}) {
  const st = AIS();
  if (!st.configured) { toast('Bạn chưa cấu hình trợ lý AI (Tài khoản › Trợ lý AI của tôi).', true); return; }
  const kind = engine();
  openModal(`${S.mh('Soạn văn bản bằng AI', 'Bản thảo do AI lập; người soạn chịu trách nhiệm kiểm tra nội dung, thể thức trước khi trình ký')}<div class="modal-b" id="aid-root">
    <div class="form">
      <div class="field"><label for="aid-t">Loại văn bản</label><select id="aid-t">${opts(DOC_TYPES, seed.doc_type || 'thu')}</select></div>
      <div class="field"><label for="aid-g">Giọng văn</label><select id="aid-g">${opts(TONES, 'trangtrong')}</select></div>
      <div class="field full"><label for="aid-r">Kính gửi / nơi nhận</label><input id="aid-r" maxlength="500" value="${esc(seed.recipient || '')}"></div>
      <div class="field full"><label for="aid-b">Yêu cầu, ý chính cần soạn</label><textarea id="aid-b" rows="5" maxlength="8000" placeholder="Ví dụ: đề nghị Sở TT&TT hỗ trợ đào tạo chuyển đổi số cho 20 cán bộ trong tháng 12; kinh phí do đơn vị tự đảm bảo.">${esc(seed.brief || '')}</textarea>
        <div class="actions" style="margin-top:6px">${kind !== 'none' ? '<button class="btn sm" data-act="aid-mic" id="aid-mic" aria-pressed="false">● Ghi âm</button>' : ''}<span class="hint" id="aid-ms"></span><span class="hint" id="aid-mi"></span></div></div>
      <div class="field full"><label for="aid-c">Căn cứ, tài liệu tham khảo (tùy chọn)</label><textarea id="aid-c" rows="3" maxlength="8000" placeholder="Dán trích đoạn văn bản căn cứ, số liệu… Trợ lý không tự bịa căn cứ pháp lý."></textarea></div>
    </div>
    <div class="actions"><button class="btn primary" data-act="aid-go">✨ Soạn thảo</button><button class="btn" data-act="aid-nd">Soạn theo thể thức Nghị định 30/2020</button><span class="hint" id="aid-st" aria-live="polite"></span></div>
    <div id="aid-out" hidden>
      <div class="field full"><label for="aid-txt">Bản thảo (sửa trực tiếp được)</label><textarea id="aid-txt" rows="16" style="font-family:'Times New Roman',serif;font-size:14px;line-height:1.5"></textarea></div>
      <div class="form"><div class="field full"><label for="aid-rv">Yêu cầu chỉnh sửa</label><input id="aid-rv" maxlength="2000" placeholder="Ví dụ: thêm mục kinh phí, rút gọn còn 1 trang"></div></div>
      <div class="actions"><button class="btn" data-act="aid-rev">Soạn lại theo yêu cầu</button><button class="btn" data-act="aid-copy">Sao chép</button><button class="btn" data-act="aid-doc">Tải tệp Word (.doc)</button><button class="btn" data-act="aid-save">Lưu vào Tài liệu</button></div>
    </div>
    <p class="err" id="aid-err" hidden></p>
    <p class="hint">${esc(ENGINE_NOTE[kind](st.provider))}</p></div>
  <div class="modal-f"><button class="btn" data-act="close">Đóng</button></div>`, {
    'aid-mic': () => { const r = CURRENT && CURRENT.anchor === 'aid-root' ? CURRENT.rec : bindRecorder('aid-root', '#aid-b', { btn: '#aid-mic', stat: '#aid-ms', interim: '#aid-mi' }); (r.active ? r.stop() : r.start()).catch(e => showErr('#aid-err', e)); },
    'aid-nd': () => draftModal({ doc_type: 'congvan' }),
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
const ND = () => window.SO_ND30; // public/nd30.js: thể thức Nghị định 30/2020/NĐ-CP
const HDR_KEY = 'so-nd30-header'; // thông tin thể thức (cơ quan chủ quản, viết tắt, địa danh) nhớ tại trình duyệt
const loadHdr = () => { try { return JSON.parse(localStorage.getItem(HDR_KEY) || '{}') || {}; } catch (e) { return {}; } };
const saveHdr = h => { try { localStorage.setItem(HDR_KEY, JSON.stringify(h)); } catch (e) {} };
const ddmmyyyy = iso => String(iso || '').slice(0, 10).split('-').reverse().join('/');

async function meetingAssistant(id) {
  const st0 = AIS();
  if (!st0.configured) { toast('Bạn chưa cấu hình trợ lý AI (Tài khoản › Trợ lý AI của tôi).', true); return; }
  const m = await GET('/api/meetings/' + id), kind = engine();
  const inMeeting = m.can_edit || m.members.some(x => x.user_id === B().me.id);
  const [voices, saved, cand] = inMeeting ? await Promise.all([
    GET(`/api/meetings/${id}/voices`).catch(() => []), GET(`/api/meetings/${id}/transcript`).catch(() => null), GET(`/api/meetings/${id}/assign-context`).catch(() => null)
  ]) : [[], null, null];
  const names = new Map(m.members.map(x => [x.user_id, x.full_name]));
  const people = new Map(((cand && cand.candidates) || []).map(c => [c.id, c]));
  const titleOf = uid => (people.get(uid) || {}).title || '';
  const V = VX(), model = V ? V.Model(voices.map(v => ({ key: v.user_id, vec: v.vec, n: 8 }))) : null;
  const enrolled = new Set(voices.map(v => v.user_id)), sampled = new Set();
  const S0 = { segs: (saved && saved.segments || []).map(s => ({ t: s.t, uid: s.uid, text: s.text, emb: null, spk: null, sure: true, manual: true })), res: null, dirty: false };
  const spkOpts = sel => `<option value="">— Chưa rõ —</option>` + m.members.map(x => `<option value="${x.user_id}" ${x.user_id === sel ? 'selected' : ''}>${esc(x.full_name)}</option>`).join('');
  const projects = (B().projects || []).filter(p => p.status !== 'closed');
  const H = Object.assign({ org_parent: '', org_name: B().settings && B().settings.org_name || '', abbr: '', place: '' }, loadHdr());

  openModal(`${S.mh('Trợ lý cuộc họp: ' + esc(m.title), `${fmtD(m.start_at)} · ${m.start_at.slice(11)}–${m.end_at.slice(11)} · ${m.members.length} thành phần`)}<div class="modal-b" id="aim-root">
    <h3 class="sec-t">1. Ghi âm, nhận dạng người phát biểu</h3>
    <div class="actions">${kind !== 'none' && inMeeting ? '<button class="btn" data-act="aim-mic" id="aim-mic" aria-pressed="false">● Ghi âm</button>' : ''}<span class="hint" id="aim-ms" aria-live="polite"></span></div>
    <p class="hint" style="margin:0">${esc(ENGINE_NOTE[kind](st0.provider))} Chỉ ghi âm khi các thành phần dự họp đã được thông báo.</p>
    ${m.can_edit && kind !== 'none' && ARCH_MIME() ? '<div class="field full"><label class="check"><input type="checkbox" id="aim-keep" checked> Lưu bản ghi âm trên máy chủ 24 giờ để thành phần cuộc họp tải về (sau 24 giờ tự xóa)</label></div>' : ''}
    ${inMeeting ? '<div id="aim-audio" class="aim-audio"></div>' : ''}
    ${inMeeting ? `<p class="hint" style="margin:0">Người nói được <b>gợi ý</b> theo mẫu giọng (tính tại trình duyệt, không gửi đi). Thư ký chọn lại người nói ở đoạn sai; trợ lý học thêm từ các đoạn đã chọn. Khi lưu bản ghi phát biểu, mẫu giọng của người đã đăng ký được cập nhật từ các đoạn đã xác nhận, để cuộc họp sau nhận ra ngay. Thành viên chưa có mẫu giọng: bấm “Lấy mẫu” khi người đó đang nói (6 giây, chỉ dùng trong phiên này) hoặc tự đăng ký tại Tài khoản › Mẫu giọng nói của tôi.</p>
    <div class="aim-people" id="aim-people"></div><div class="hint" id="aim-stat" aria-live="polite"></div>` : '<p class="notice warn">Bạn không trong thành phần cuộc họp: không ghi âm, không xem bản ghi phát biểu. Có thể gõ ghi chép bên dưới để lập biên bản.</p>'}
    <div class="aim-segs" id="aim-segs" role="list" aria-label="Bản ghi phát biểu"></div><span class="hint" id="aim-mi"></span>
    ${inMeeting ? `<div class="actions"><button class="btn sm" data-act="aim-add">+ Thêm đoạn</button>${m.can_edit ? '<button class="btn sm" data-act="aim-savetr">Lưu bản ghi phát biểu</button>' : ''}<span class="hint" id="aim-trs">${saved && saved.updated_at ? 'Đã lưu lúc ' + esc(fmtD(saved.updated_at)) + ' ' + esc(String(saved.updated_at).slice(11, 16)) : ''}</span></div>` : ''}
    <div class="field full"><label for="aim-notes">Ghi chép bổ sung (tùy chọn)</label><textarea id="aim-notes" rows="3" placeholder="Ý kiến không ghi âm được, tài liệu trình bày, kết quả biểu quyết…"></textarea></div>
    <div class="actions"><button class="btn primary" data-act="aim-go">✨ Lập biên bản, kết luận và đề xuất phân công</button><span class="hint" id="aim-st" aria-live="polite"></span></div>
    <div id="aim-out" hidden>
      <p id="aim-sum" class="notice info"></p>
      <h3 class="sec-t">2. Thể thức văn bản (Nghị định 30/2020/NĐ-CP)</h3>
      <div class="form">
        <div class="field"><label for="aih-p">Cơ quan chủ quản (nếu có)</label><input id="aih-p" maxlength="200" value="${esc(H.org_parent)}"></div>
        <div class="field"><label for="aih-o">Cơ quan ban hành</label><input id="aih-o" maxlength="200" value="${esc(H.org_name)}"></div>
        <div class="field"><label for="aih-a">Chữ viết tắt tên cơ quan (ký hiệu)</label><input id="aih-a" maxlength="30" value="${esc(H.abbr)}" placeholder="Ví dụ: VP"></div>
        <div class="field"><label for="aih-d">Địa danh</label><input id="aih-d" maxlength="60" value="${esc(H.place)}" placeholder="Ví dụ: Hà Nội"></div>
        <div class="field"><label for="aih-tk">Thư ký (người ghi biên bản)</label><select id="aih-tk">${spkOpts(B().me.id)}</select></div>
        <div class="field"><label for="aih-e">Kết thúc lúc</label><input id="aih-e" type="time" value="${esc(m.end_at.slice(11, 16))}"></div>
        <div class="field"><label for="aih-q">Quyền hạn ký thông báo</label><input id="aih-q" maxlength="60" placeholder="Ví dụ: TL. GIÁM ĐỐC (để trống nếu chủ trì ký)"></div>
        <div class="field"><label for="aih-cv">Chức vụ người ký</label><input id="aih-cv" maxlength="100" value="${esc(titleOf(m.host_id))}"></div>
        <div class="field"><label for="aih-n">Họ tên người ký</label><input id="aih-n" maxlength="100" value="${esc(m.host_name || '')}"></div>
      </div>
      <h3 class="sec-t">3. Nội dung (sửa trực tiếp; văn bản cập nhật ngay)</h3>
      <div class="field full"><label for="aim-db">Diễn biến – ý kiến phát biểu (mỗi dòng: Họ tên: ý kiến)</label><textarea id="aim-db" rows="7"></textarea></div>
      <div class="field full"><label for="aim-kl">Kết luận của chủ trì (mỗi dòng một kết luận)</label><textarea id="aim-kl" rows="5"></textarea></div>
      <h3 class="sec-t">4. Đầu việc và đề xuất phân công</h3>
      <p class="hint" style="margin:0" id="aim-wl"></p>
      <div id="aim-tasks"></div>
      <h3 class="sec-t">5. Văn bản</h3>
      <div class="seg" role="group" aria-label="Văn bản xem trước"><button aria-pressed="true" data-act="aim-tab" data-k="bb">Biên bản (Mẫu 1.9)</button><button aria-pressed="false" data-act="aim-tab" data-k="tb">Thông báo kết luận (Mẫu 1.4)</button></div>
      <div class="nd30-paper" id="aim-doc" aria-live="polite"></div>
      <div class="actions"><button class="btn primary" data-act="aim-save" ${m.can_edit ? '' : 'disabled title="Chỉ người chủ trì hoặc người tạo cuộc họp được lưu biên bản"'}>Lưu biên bản vào cuộc họp</button><button class="btn" data-act="aim-doc-bb">Tải Word (.docx): Biên bản</button><button class="btn" data-act="aim-doc-tb">Tải Word (.docx): Thông báo kết luận</button></div>
      <p class="hint">Bản thảo do AI lập. Số văn bản để trống (…) để Văn thư cấp số khi đăng ký. Người trình ký chịu trách nhiệm kiểm tra nội dung, thể thức trước khi ký.</p>
    </div>
    <p class="err" id="aim-err" hidden></p></div>
  <div class="modal-f"><button class="btn" data-act="close">Đóng</button></div>`, {
    'aim-mic': () => { const r = CURRENT && CURRENT.anchor === 'aim-root' ? CURRENT.rec : bindMeetingRecorder(); (r.active ? r.stop() : r.start()).catch(e => showErr('#aim-err', e)); },
    'aim-sample': b => S.busy(b, async () => {
      const uid = Number(b.dataset.uid);
      try {
        const pcm = await captureSeconds(6, s => { b.textContent = `Đang nghe ${Math.ceil(6 - s)} giây…`; });
        const e = V.embed(pcm); if (!e) throw new Error('Chưa nghe rõ tiếng nói. Hãy lấy mẫu khi ' + names.get(uid) + ' đang nói.');
        model.set(uid, e, 3); sampled.add(uid); toast('Đã lấy mẫu giọng của ' + names.get(uid) + ' (chỉ dùng trong phiên này)'); people_();
      } catch (e) { showErr('#aim-err', e); }
    }),
    'aim-add': () => { S0.segs.push({ t: S0.segs.length ? S0.segs[S0.segs.length - 1].t + 1 : 0, uid: null, text: '', emb: null, spk: null, sure: true, manual: true }); S0.dirty = true; segs_(); const ta = document.querySelector(`.aim-st[data-i="${S0.segs.length - 1}"]`); if (ta) ta.focus(); },
    'aim-del': b => { S0.segs.splice(Number(b.dataset.i), 1); S0.dirty = true; segs_(); },
    'aim-savetr': btn => S.busy(btn, async () => {
      try {
        /* Học thêm mẫu giọng: đoạn có dấu giọng, đã được thư ký chọn hoặc trợ lý nhận chắc chắn, của người đã đăng ký mẫu; mỗi đoạn chỉ gửi một lần */
        const g = new Map();
        S0.segs.forEach(s => { if (s.uid && s.emb && !s.adapted && (s.manual || s.sure) && enrolled.has(s.uid) && s.text.trim()) { if (!g.has(s.uid)) g.set(s.uid, []); g.get(s.uid).push(s); } });
        const adapt = V ? [...g].map(([uid, l]) => ({ uid, n: l.length, vec: V.mean(l.map(x => x.emb)) })).filter(a => a.vec) : [];
        const r = await PUT(`/api/meetings/${m.id}/transcript`, { segments: S0.segs.filter(s => s.text.trim()).map(s => ({ t: Math.round(s.t), uid: s.uid, text: s.text })), adapt });
        (r.adapted || []).forEach(uid => (g.get(uid) || []).forEach(s => { s.adapted = true; }));
        S0.dirty = false; $('#aim-trs').textContent = `Đã lưu ${r.segments} đoạn phát biểu${(r.adapted || []).length ? `; cập nhật mẫu giọng của ${r.adapted.length} người` : ''}.`; toast('Đã lưu bản ghi phát biểu');
      }
      catch (e) { showErr('#aim-err', e); }
    }),
    'aim-go': btn => S.busy(btn, async () => {
      if (CURRENT && CURRENT.anchor === 'aim-root' && CURRENT.rec.active) { $('#aim-st').textContent = 'Đang dừng ghi âm và chuyển nốt đoạn cuối…'; await CURRENT.rec.stop(); }
      const transcript = transcriptText();
      $('#aim-err').hidden = true; $('#aim-st').textContent = 'Đang lập biên bản, bóc tách đầu việc… (có thể mất 20–90 giây)';
      try {
        const r = await api('/api/ai/minutes', { meeting_id: m.id, transcript });
        S0.res = r; (r.candidates || []).forEach(c => people.set(c.id, c));
        $('#aim-out').hidden = false; $('#aim-st').textContent = `Đã lập bằng ${r.provider} · ${r.model}${r.truncated ? ' — kết quả quá dài, đã bị cắt' : ''}.`;
        $('#aim-sum').textContent = r.tom_tat || (r.ok ? '' : 'Trợ lý không trả về đúng cấu trúc; nội dung nhận được đưa vào phần diễn biến.');
        $('#aim-db').value = r.ok ? r.dien_bien.map(d => `${d.nguoi_id && names.get(d.nguoi_id) || d.ten || ''}: ${d.y_kien}`.replace(/^: /, '')).join('\n') : (r.raw || '');
        $('#aim-kl').value = r.ket_luan.join('\n');
        if (!$('#aih-cv').value) $('#aih-cv').value = titleOf(m.host_id);
        tasks_(r.viec_can_lam); doc_();
        $('#aim-out').scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (e) { $('#aim-st').textContent = ''; showErr('#aim-err', e); }
    }),
    'aim-adel': b => S.busy(b, async () => { if (!confirm('Xóa bản ghi âm này? Không khôi phục được.')) return; try { await DEL(`/api/meetings/${m.id}/audio/${b.dataset.id}`); toast('Đã xóa bản ghi âm'); audio_(); } catch (e) { showErr('#aim-err', e); } }),
    'aim-alocal': () => { if (!archLocal) return; const a = document.createElement('a'); a.href = URL.createObjectURL(archLocal); a.download = `ghi-am-cuoc-hop-${m.id}-${TODAY()}.${/ogg/.test(archLocal.type) ? 'ogg' : /mp4/.test(archLocal.type) ? 'm4a' : 'webm'}`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); },
    'aim-tab': b => { document.querySelectorAll('#aim-root [data-act=aim-tab]').forEach(t => t.setAttribute('aria-pressed', String(t === b))); doc_(); },
    'aim-save': btn => S.busy(btn, async () => { try { await POST(`/api/meetings/${m.id}/minutes`, { minutes: docs().bb.text.slice(0, 20000) }); toast('Đã lưu biên bản cuộc họp'); S.render(); } catch (e) { showErr('#aim-err', e); } }),
    'aim-doc-bb': () => saveFile(new Blob([ND().docx(docs().bb, 'Biên bản cuộc họp')], { type: DOCX_MIME }), `bien-ban-hop-${TODAY()}.docx`),
    'aim-doc-tb': () => saveFile(new Blob([ND().docx(docs().tb, 'Thông báo kết luận')], { type: DOCX_MIME }), `thong-bao-ket-luan-${TODAY()}.docx`),
    'aim-assign': btn => S.busy(btn, async () => {
      const rows = [...document.querySelectorAll('.aim-ck')].filter(c => c.checked).map(c => c.dataset.i);
      if (!rows.length) return showErr('#aim-err', 'Chưa chọn việc nào.');
      let ok = 0; const errs = [];
      for (const i of rows) {
        const q = s => document.querySelector(`${s}[data-i="${i}"]`);
        const who = Number(q('.aim-ta').value), co = [...q('.aim-tf').selectedOptions].map(o => Number(o.value)).filter(x => x && x !== who);
        if (!who) { errs.push(`Việc ${Number(i) + 1}: chưa chọn người chủ trì`); continue; }
        try {
          await POST('/api/tasks', { project_id: $('#aim-p').value, title: q('.aim-tt').value, assignee_id: who, followers: co, start_date: TODAY(), due_date: q('.aim-td').value, priority: 'tb',
            description: 'Theo kết luận cuộc họp: ' + m.title + ' (' + fmtD(m.start_at) + ')' + (co.length ? '\nPhối hợp: ' + co.map(c => (people.get(c) || {}).full_name || names.get(c) || c).join(', ') : '') });
          ok++; q('.aim-ck').checked = false; q('.aim-ck').disabled = true;
        } catch (e) { errs.push(`Việc ${Number(i) + 1}: ${e.message}`); }
      }
      if (ok) { toast(`Đã giao ${ok} việc`); S.refreshBoot(); }
      if (errs.length) showErr('#aim-err', errs.join('; '));
    })
  });

  /* ---------- Hiển thị ---------- */
  function people_() {
    const el = $('#aim-people'); if (!el) return;
    el.innerHTML = m.members.map(x => {
      const has = enrolled.has(x.user_id) || sampled.has(x.user_id);
      return `<span class="aim-person"><span>${esc(x.full_name)}</span> <span class="tag ${has ? 'aim-ok' : ''}" title="${enrolled.has(x.user_id) ? 'Đã đăng ký mẫu giọng' : sampled.has(x.user_id) ? 'Đã lấy mẫu trong phiên này' : 'Chưa có mẫu giọng'}">${has ? '🎙 có mẫu' : 'chưa có mẫu'}</span>${V && hasMic() ? ` <button class="btn sm" data-act="aim-sample" data-uid="${x.user_id}" aria-label="Lấy mẫu giọng của ${esc(x.full_name)} trong 6 giây">Lấy mẫu</button>` : ''}</span>`;
    }).join('');
    stat_();
  }
  function stat_() {
    const el = $('#aim-stat'); if (!el) return;
    const segs = S0.segs, st = new Map();
    segs.forEach((s, i) => { const k = s.uid || 0, o = st.get(k) || { n: 0, sec: 0 }; if (!i || segs[i - 1].uid !== s.uid) o.n++; o.sec += Math.min(300, Math.max(0, (segs[i + 1] ? segs[i + 1].t : s.t + Math.ceil(s.text.length / 15)) - s.t)); st.set(k, o); });
    el.textContent = st.size ? 'Phát biểu: ' + [...st].sort((a, b) => b[1].sec - a[1].sec).map(([k, o]) => `${k ? names.get(k) : 'Chưa rõ'} ${o.n} lượt, ~${Math.max(1, Math.round(o.sec / 60))} phút`).join(' · ') : '';
  }
  function segRow(s, i) {
    return `<div class="aim-seg${s.uid && !s.sure ? ' unsure' : ''}" role="listitem"><span class="mono hint">${mmss(s.t)}</span>
      <select class="aim-ss" data-i="${i}" aria-label="Người nói đoạn ${i + 1}">${spkOpts(s.uid)}</select><span class="hint aim-q" ${s.uid && !s.sure ? 'title="Trợ lý đoán, chưa chắc chắn">?' : 'aria-hidden="true">'}</span>
      <textarea class="aim-st" data-i="${i}" rows="2" aria-label="Lời phát biểu đoạn ${i + 1}">${esc(s.text)}</textarea>
      <button class="btn sm ghost" data-act="aim-del" data-i="${i}" aria-label="Xóa đoạn ${i + 1}">✕</button></div>`;
  }
  function segs_() {
    const el = $('#aim-segs'); if (!el) return;
    el.innerHTML = S0.segs.length ? S0.segs.map(segRow).join('') : `<p class="hint">${inMeeting ? 'Bản ghi phát biểu sẽ hiện ở đây trong lúc ghi âm. Có thể thêm đoạn và gõ trực tiếp.' : ''}</p>`;
    stat_();
  }
  /* Đoạn mới từ bộ ghi âm: gợi ý người nói theo dấu giọng; nhãn người nói của nhà cung cấp đã được thư ký xác nhận thì dùng lại */
  function addSeg(seg) {
    let uid = null, sure = false;
    const prev = seg.spk ? S0.segs.find(x => x.spk === seg.spk && x.manual && x.uid) : null;
    if (prev) { uid = prev.uid; sure = true; }
    else if (model && seg.emb) { const c = model.classify(seg.emb); if (c.key) { uid = Number(c.key); sure = c.sure; } }
    S0.segs.push({ t: seg.t, uid, text: seg.text, emb: seg.emb, spk: seg.spk, sure, manual: false }); S0.dirty = true;
    const el = $('#aim-segs'); if (!el) return;
    if (S0.segs.length === 1) el.innerHTML = '';
    el.insertAdjacentHTML('beforeend', segRow(S0.segs[S0.segs.length - 1], S0.segs.length - 1));
    el.scrollTop = el.scrollHeight; stat_();
  }
  /* Danh sách bản ghi âm còn hạn (24 giờ) */
  let ARCH = null, archLocal = null;
  async function audio_() {
    const el = $('#aim-audio'); if (!el) return;
    let r; try { r = await GET(`/api/meetings/${m.id}/audio`); } catch (e) { el.innerHTML = ''; return; }
    const left = ms => { const h = Math.max(0, (ms - Date.now()) / 3600000); return h >= 1 ? `còn ${Math.floor(h)} giờ` : `còn ${Math.max(1, Math.round(h * 60))} phút`; };
    const rows = r.items.map(a => `<li><span>${esc(fmtD(a.created_at))} ${esc(String(a.created_at || '').slice(11, 16))} · ${mmss(a.seconds || 0)} · ${a.size >= 1048576 ? (a.size / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(a.size / 1024)) + ' KB'}${a.done ? '' : ' · đang ghi'} · <span class="hint">${left(a.expires_ms)}</span></span>
      <span class="actions"><a class="btn sm" href="/api/meetings/${m.id}/audio/${a.id}/file" download>Tải về</a>${r.can_edit ? `<button class="btn sm ghost" data-act="aim-adel" data-id="${a.id}" aria-label="Xóa bản ghi âm lúc ${esc(String(a.created_at || '').slice(11, 16))}">Xóa</button>` : ''}</span></li>`).join('');
    el.innerHTML = (rows ? `<p class="hint" style="margin:0">Bản ghi âm (tự xóa sau ${r.ttl_hours} giờ; mỗi lần tải đều ghi nhật ký an ninh):</p><ul class="aim-alist">${rows}</ul>` : '')
      + (archLocal ? '<p class="notice warn" style="margin:0">Chưa gửi được toàn bộ bản ghi âm lên máy chủ. <button class="btn sm" data-act="aim-alocal">Tải bản ghi trên máy này</button></p>' : '');
  }
  function archState(st) {
    const s = $('#aim-ms'); if (!s || !ARCH) return;
    s.dataset.arch = st.error ? ` · lưu âm thanh: lỗi, sẽ thử lại (${st.error.message})` : st.uploading ? ` · đang gửi âm thanh (${st.uploading} phần)` : ' · đang lưu âm thanh';
  }
  function bindMeetingRecorder() {
    const rec = Recorder({
      onSeg: addSeg,
      onInterim: t => { const el = $('#aim-mi'); if (el) el.textContent = t ? '… ' + t : ''; },
      onState: st => { const b = $('#aim-mic'), s = $('#aim-ms'); if (b) { b.textContent = st.active ? '■ Dừng ghi âm' : '● Ghi âm'; b.classList.toggle('danger', st.active); b.setAttribute('aria-pressed', String(st.active)); } if (s) s.textContent = st.active ? `Đang ghi ${mmss(st.secs)}${st.pending ? ` · đang chuyển ${st.pending} đoạn` : ''}${ARCH ? (s.dataset.arch || '') : ''}` : st.pending ? `Đang chuyển ${st.pending} đoạn còn lại…` : ''; },
      onError: e => toast(e.message, true)
    });
    /* Bộ chép lời và bộ lưu âm thanh chạy song song; đóng hộp thoại thì dừng cả hai (phần âm thanh còn lại vẫn được gửi nốt) */
    const both = {
      kind: rec.kind, get active() { return rec.active; },
      async start() {
        await rec.start();
        const keep = $('#aim-keep');
        if (keep && keep.checked) {
          const a = AudioArchive(m.id, archState);
          try { await a.start(); ARCH = a; archLocal = null; } catch (e) { toast('Không lưu được bản ghi âm: ' + e.message, true); }
        }
      },
      async stop() {
        const q = rec.stop();
        if (ARCH) {
          const a = ARCH; ARCH = null;
          const s = $('#aim-ms'); if (s) s.dataset.arch = '';
          const r = await a.stop();
          if (!r.ok) { archLocal = a.localBlob(); toast('Chưa gửi được toàn bộ bản ghi âm lên máy chủ; có thể tải bản trên máy này.', true); }
          audio_();
        }
        return q;
      }
    };
    CURRENT = { anchor: 'aim-root', rec: both };
    return both;
  }
  const segBox = $('#aim-segs');
  segBox.addEventListener('change', e => {
    const t = e.target; if (!t.classList.contains('aim-ss')) return;
    const i = Number(t.dataset.i), s = S0.segs[i], uid = t.value ? Number(t.value) : null, oldSpk = s.spk;
    s.uid = uid; s.sure = true; s.manual = true; S0.dirty = true;
    if (uid && s.emb && model) model.learn(uid, s.emb); // học thêm từ đoạn thư ký đã xác nhận
    let n = 0; // cùng nhãn người nói của nhà cung cấp, chưa được thư ký chọn: áp dụng luôn
    if (oldSpk) S0.segs.forEach((x, j) => { if (j !== i && x.spk === oldSpk && !x.manual) { x.uid = uid; x.sure = true; n++; } });
    if (n) { segs_(); toast(`Đã áp dụng cho ${n} đoạn khác cùng giọng`); } else { const row = t.closest('.aim-seg'), q = row.querySelector('.aim-q'); row.classList.remove('unsure'); if (q) { q.textContent = ''; q.removeAttribute('title'); } stat_(); }
  });
  segBox.addEventListener('input', e => { const t = e.target; if (t.classList.contains('aim-st')) { S0.segs[Number(t.dataset.i)].text = t.value; S0.dirty = true; } });

  function transcriptText() {
    const lines = S0.segs.filter(s => s.text.trim()).map(s => `[${mmss(s.t)}] ${s.uid ? `${names.get(s.uid)} (mã ${s.uid})` : 'Chưa rõ người nói'}: ${s.text.trim()}`);
    const notes = $('#aim-notes').value.trim();
    return lines.join('\n') + (notes ? (lines.length ? '\n\nGhi chép bổ sung:\n' : '') + notes : '');
  }

  /* ---------- Đầu việc ---------- */
  function candOpts(sel, multi) {
    const list = [...people.values()].sort((a, b) => (b.in_meeting - a.in_meeting) || a.full_name.localeCompare(b.full_name, 'vi'));
    const label = c => `${c.full_name}${c.title ? ' – ' + c.title : ''}${c.open_tasks != null ? ` (${c.open_tasks} việc${c.late_tasks ? ', ' + c.late_tasks + ' quá hạn' : ''})` : ''}`;
    const grp = (k, l) => { const xs = list.filter(c => !!c.in_meeting === k); return xs.length ? `<optgroup label="${l}">${xs.map(c => `<option value="${c.id}" ${(multi ? sel.includes(c.id) : c.id === sel) ? 'selected' : ''}>${esc(label(c))}</option>`).join('')}</optgroup>` : ''; };
    return (multi ? '' : '<option value="">— Chọn —</option>') + grp(true, 'Thành phần họp') + grp(false, 'Trưởng các phòng (không dự họp)');
  }
  function tasks_(list) {
    const r = S0.res || {};
    $('#aim-wl').textContent = r.workload ? 'Số việc đang làm, quá hạn của từng người lấy từ phân hệ Công việc để cân đối khi giao.' : 'Bạn không có quyền xem tải công việc của người khác; đề xuất dựa trên chức trách và nội dung phát biểu.';
    $('#aim-tasks').innerHTML = list.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th><span class="sr-only">Chọn</span></th><th>Đầu việc</th><th>Chủ trì</th><th>Phối hợp</th><th>Hạn</th></tr></thead><tbody>
      ${list.map((v, i) => `<tr><td><input type="checkbox" class="aim-ck" data-i="${i}" ${v.chu_tri_id ? 'checked' : ''} aria-label="Chọn việc ${i + 1}"></td>
        <td><input class="aim-tt" data-i="${i}" value="${esc(v.noi_dung)}" aria-label="Nội dung việc ${i + 1}" style="width:100%"><div class="hint"><span class="tag ${v.nguon === 'giao_ro' ? 'aim-ok' : 'aim-warn'}">${v.nguon === 'giao_ro' ? 'Giao trong cuộc họp' : 'Trợ lý đề xuất'}</span> ${esc(v.ly_do || '')}</div></td>
        <td><select class="aim-ta" data-i="${i}" aria-label="Người chủ trì việc ${i + 1}">${candOpts(v.chu_tri_id)}</select></td>
        <td><select class="aim-tf" data-i="${i}" multiple size="3" aria-label="Người phối hợp việc ${i + 1}">${candOpts(v.phoi_hop_ids || [], true)}</select></td>
        <td><input type="date" class="aim-td" data-i="${i}" value="${v.han || addDays(TODAY(), 7)}" aria-label="Hạn việc ${i + 1}"></td></tr>`).join('')}</tbody></table></div>
      <div class="form" style="margin-top:8px"><div class="field"><label for="aim-p">Dự án/phòng ban nhận việc</label><select id="aim-p">${projects.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></div><div class="field" style="justify-content:flex-end"><button class="btn" data-act="aim-assign" ${projects.length ? '' : 'disabled'}>Giao các việc đã chọn</button></div></div>`
      : '<p class="hint">Không bóc tách được đầu việc nào.</p>';
  }
  function taskLines() {
    return [...document.querySelectorAll('.aim-tt')].map(inp => {
      const i = inp.dataset.i, q = s => document.querySelector(`${s}[data-i="${i}"]`);
      const who = Number(q('.aim-ta').value);
      const nm = id => (people.get(id) || {}).full_name || names.get(id) || '';
      const co = [...q('.aim-tf').selectedOptions].map(o => Number(o.value)).filter(x => x && x !== who).map(nm).filter(Boolean);
      const han = q('.aim-td').value;
      return `${who ? `Đồng chí ${nm(who)} chủ trì${co.length ? ', phối hợp với đồng chí ' + co.join(', ') : ''}: ` : ''}${inp.value.trim()}${han ? '; thời hạn hoàn thành: ' + ddmmyyyy(han) : ''}.`;
    }).filter(x => x.length > 2);
  }

  /* ---------- Văn bản theo thể thức ---------- */
  function hdr() { const h = { org_parent: $('#aih-p').value.trim(), org_name: $('#aih-o').value.trim(), abbr: $('#aih-a').value.trim(), place: $('#aih-d').value.trim() }; saveHdr(Object.assign(loadHdr(), h)); return h; }
  function docs() {
    const h = hdr();
    const who = uid => ({ name: names.get(uid) || (people.get(uid) || {}).full_name || '', title: titleOf(uid) });
    const present = m.members.filter(x => x.response !== 'no').map(x => who(x.user_id)), absent = m.members.filter(x => x.response === 'no').map(x => ({ ...who(x.user_id), reason: 'báo vắng' }));
    const dien = $('#aim-db').value.split('\n').map(l => l.trim()).filter(Boolean).map(l => { const k = l.indexOf(':'); return k > 0 && k < 60 ? { ten: l.slice(0, k).trim(), y_kien: l.slice(k + 1).trim() } : { ten: '', y_kien: l }; });
    const kl = $('#aim-kl').value.split('\n').map(l => l.trim().replace(/^\d+[.)]\s*/, '')).filter(Boolean), nv = taskLines();
    const host = who(m.host_id), tk = Number($('#aih-tk').value);
    const bb = ND().bienBan({ ...h, trich_yeu: m.title, start_at: m.start_at, end_time: $('#aih-e').value, place: [m.room_name, m.place].filter(Boolean).join(', '),
      chu_tri: host, thu_ky: tk ? who(tk) : null, present, absent, dien_bien: dien, ket_luan: kl, nhiem_vu: nv });
    const hostTitle = [host.title, host.name].filter(Boolean).join(' ');
    const tb = ND().thongBao({ ...h, date: TODAY(), trich_yeu: `Kết luận của ${hostTitle || 'chủ trì'} tại cuộc họp ${m.title}`,
      mo_dau: `Ngày ${ddmmyyyy(m.start_at)}, ${hostTitle} chủ trì cuộc họp ${m.title}. Tham dự cuộc họp có: ${present.filter(p => p.name !== host.name).map(p => [p.title, p.name].filter(Boolean).join(' ')).join('; ') || '…'}. Sau khi nghe ý kiến của các thành viên dự họp, ${hostTitle} kết luận như sau:`,
      ket_luan: kl, nhiem_vu: nv, ky: { quyen: $('#aih-q').value.trim(), chuc_vu: $('#aih-cv').value.trim(), name: $('#aih-n').value.trim() } });
    return { bb, tb };
  }
  function doc_() {
    if ($('#aim-out').hidden) return;
    const tab = (document.querySelector('#aim-root [data-act=aim-tab][aria-pressed=true]') || {}).dataset || {};
    try { const d = docs(); $('#aim-doc').innerHTML = tab.k === 'tb' ? d.tb.html : d.bb.html; } catch (e) { $('#aim-doc').textContent = e.message; }
  }
  let tmr = null; const later = () => { clearTimeout(tmr); tmr = setTimeout(doc_, 300); };
  $('#aim-out').addEventListener('input', later); $('#aim-out').addEventListener('change', later);
  people_(); segs_(); audio_();
}
function downloadHtml(html, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + html], { type: 'application/msword' }));
  a.download = `${name}-${TODAY()}.doc`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}

/* ================= 3. Mẫu giọng nói của tôi (Tài khoản) ================= */
const VOICE_TEXT = 'Tôi xin phát biểu ý kiến về nội dung cuộc họp hôm nay. Thứ nhất, đơn vị đã hoàn thành kế hoạch công tác tháng trước, các chỉ tiêu chính đều đạt và vượt. Thứ hai, đề nghị các phòng rà soát tiến độ, báo cáo khó khăn, vướng mắc trước ngày mười lăm. Thứ ba, tôi thống nhất với đề xuất của phòng Hành chính và sẽ phối hợp thực hiện.';
async function mountVoice(el) {
  if (!el || !VX()) return;
  const box = document.createElement('section'); box.className = 'card'; box.id = 'voice-me'; box.style.marginTop = '14px'; el.appendChild(box);
  let st = {}; try { st = await GET('/api/me/voice'); } catch (e) { box.innerHTML = `<div class="card-b"><p class="err">${esc(e.message)}</p></div>`; return; }
  const draw = () => {
    box.innerHTML = `<div class="card-h"><h2>Mẫu giọng nói của tôi</h2></div><div class="card-b stack" style="gap:10px">
      <p class="hint" style="margin:0">Dùng để trợ lý cuộc họp gợi ý người phát biểu trong các cuộc họp bạn tham dự. Hệ thống <b>không lưu âm thanh</b>: trình duyệt tính dãy số đặc trưng giọng (57 số) và chỉ gửi dãy số này. Đặc trưng giọng là dữ liệu sinh trắc học; chỉ chủ trì, người tạo và thành phần cuộc họp có bạn tham dự mới dùng được, mỗi lần đọc đều ghi nhật ký an ninh. Mẫu được cập nhật thêm từ các đoạn phát biểu của bạn mà thư ký cuộc họp đã xác nhận (chỉ cập nhật dãy số), để lần họp sau nhận ra ngay. Bạn xóa được bất kỳ lúc nào; mẫu tự xóa khi tài khoản ngừng hoạt động.</p>
      <p>${st.enrolled ? `<span class="tag aim-ok">Đã đăng ký</span> lúc ${esc(fmtD(st.updated_at))} ${esc(String(st.updated_at || '').slice(11, 16))} (${Math.round(st.seconds)} giây)${st.adapt_n ? `, đã học thêm từ cuộc họp (${st.adapt_n} đoạn, lần cuối ${esc(fmtD(st.adapted_at))})` : ''}` : st.outdated ? '<span class="tag aim-warn">Mẫu cũ, cần ghi lại</span>' : '<span class="tag">Chưa đăng ký</span>'}</p>
      <div class="field full"><label class="check"><input type="checkbox" id="vm-ok"> Tôi đồng ý cho hệ thống lưu đặc trưng giọng nói của tôi, và cập nhật đặc trưng này từ các đoạn phát biểu đã được xác nhận, để nhận dạng người phát biểu trong cuộc họp.</label></div>
      <p class="hint" style="margin:0">Khi bấm ghi, đọc to, tự nhiên đoạn sau (khoảng 20 giây), nên dùng đúng micro thường dùng khi họp:</p>
      <blockquote class="post-body" style="margin:0">${esc(VOICE_TEXT)}</blockquote>
      <div class="actions"><button class="btn primary" data-act="vm-rec" ${hasMic() ? '' : 'disabled title="Trình duyệt không hỗ trợ micro"'}>● Ghi mẫu giọng (20 giây)</button>${st.enrolled || st.outdated ? '<button class="btn danger" data-act="vm-del">Xóa mẫu giọng</button>' : ''}<span class="hint" id="vm-st" aria-live="polite"></span></div>
      <p class="err" id="vm-err" hidden></p></div>`;
  };
  draw();
  Object.assign(ACTIONS, {
    'vm-rec': b => S.busy(b, async () => {
      $('#vm-err').hidden = true;
      if (!$('#vm-ok').checked) return showErr('#vm-err', 'Cần tích đồng ý trước khi ghi mẫu giọng.');
      try {
        const secs = 20, pcm = await captureSeconds(secs, s => { $('#vm-st').textContent = `Đang ghi… còn ${Math.ceil(secs - s)} giây`; });
        $('#vm-st').textContent = 'Đang tính đặc trưng giọng…';
        const vec = VX().embed(pcm); if (!vec) throw new Error('Chưa nghe rõ tiếng nói. Hãy đọc to hơn hoặc kiểm tra micro rồi ghi lại.');
        st = await PUT('/api/me/voice', { vec, version: VX().VERSION, seconds: secs, consent: true }); draw(); toast('Đã lưu mẫu giọng nói');
      } catch (e) { $('#vm-st').textContent = ''; showErr('#vm-err', e); }
    }),
    'vm-del': b => S.busy(b, async () => { if (!confirm('Xóa mẫu giọng nói của bạn?')) return; try { st = await DEL('/api/me/voice'); draw(); toast('Đã xóa mẫu giọng nói'); } catch (e) { showErr('#vm-err', e); } })
  });
}

Object.assign(ACTIONS, {
  'ai-draft': () => draftModal(),
  'ai-meeting': b => meetingAssistant(Number(b.dataset.id)).catch(e => toast(e.message, true))
});
window.SO_AI_OFFICE = { draftModal, draftFreeModal, meetingAssistant, Recorder, AudioArchive, wavFrom, engine, mountVoice, captureSeconds };
})();
