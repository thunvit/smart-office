'use strict';
/**
 * Trợ lý cuộc họp – dữ liệu phía máy chủ (ADR-011, 07/11/2026).
 *  1. Mẫu giọng (dấu giọng) của từng người: chỉ chính người đó đăng ký, phải tích đồng ý; chỉ lưu dãy số đặc trưng (57 số, tính tại trình duyệt),
 *     không lưu âm thanh. Xóa được bất kỳ lúc nào. Đăng ký, xóa, đọc đều ghi nhật ký an ninh.
 *  2. Dấu giọng của thành phần một cuộc họp: chỉ người chủ trì, người tạo cuộc họp, quản trị viên hoặc thành viên được mời đọc (để gợi ý người nói khi ghi âm).
 *  3. Bản ghi phát biểu của cuộc họp (ai nói gì, lúc nào): người chủ trì/người tạo/quản trị viên lưu; thành phần họp xem.
 *  4. Dữ liệu tư vấn phân công: chức vụ, phòng ban của thành phần họp và trưởng các phòng; số việc đang làm, quá hạn chỉ trả cho người có quyền sửa cuộc họp.
 *  5. Quyết định của chủ sở hữu khi duyệt ADR-011 (07/11/2026):
 *     - mẫu giọng tự xóa khi tài khoản ngừng hoạt động;
 *     - bản ghi âm cuộc họp lưu 24 giờ để tải về rồi tự xóa (không đưa vào bản sao lưu);
 *     - mẫu giọng được cập nhật thêm từ các đoạn phát biểu thư ký đã xác nhận, để cuộc họp sau nhận ra ngay, không phải học lại.
 * Không có trong danh mục API của trợ lý hội thoại (ai-tools.js): mô hình không đọc được dấu giọng.
 */
const D = require('./db');
const { sendFile } = require('./files');
const { all, get, run, now, today, addDays } = D;

D.db.exec(`
CREATE TABLE IF NOT EXISTS voice_profiles (user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, vec TEXT NOT NULL, version TEXT NOT NULL,
  seconds REAL DEFAULT 0, consent_at TEXT NOT NULL, updated_at TEXT, adapt_n INTEGER DEFAULT 0, adapted_at TEXT);
CREATE TABLE IF NOT EXISTS meeting_transcripts (meeting_id INTEGER PRIMARY KEY REFERENCES meetings(id) ON DELETE CASCADE, segments TEXT NOT NULL, speakers TEXT NOT NULL DEFAULT '[]',
  updated_by INTEGER, updated_at TEXT);
CREATE TABLE IF NOT EXISTS meeting_audio (id INTEGER PRIMARY KEY AUTOINCREMENT, meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE, mime TEXT NOT NULL,
  parts INTEGER DEFAULT 0, size INTEGER DEFAULT 0, seconds REAL DEFAULT 0, done INTEGER DEFAULT 0, created_by INTEGER, created_at TEXT, expires_ms INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_meeting_audio_meeting ON meeting_audio(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_audio_exp ON meeting_audio(expires_ms);
CREATE TABLE IF NOT EXISTS meeting_audio_parts (audio_id INTEGER NOT NULL, seq INTEGER NOT NULL, data BLOB NOT NULL, PRIMARY KEY(audio_id, seq));
`);
D.addCol('voice_profiles', 'adapt_n', 'INTEGER DEFAULT 0');
D.addCol('voice_profiles', 'adapted_at', 'TEXT');
const VOICE_VERSION = 'mfcc-v1', VOICE_DIMS = 57, MAX_SEGS = 3000, MAX_SEG_TEXT = 2000;
/* Bản ghi âm: lưu 24 giờ kể từ lần gửi cuối; mỗi phần tối đa 1 MB (giới hạn 2 MB/dòng của Durable Object); tổng tối đa 100 MB (khoảng 8 giờ ở 24 kbit/s) */
const AUDIO_TTL_MS = 24 * 3600 * 1000, AUDIO_PART = 1024 * 1024, AUDIO_MAX = 100 * 1024 * 1024;
const AUDIO_MIME = /^audio\/(webm|ogg|mp4|mpeg|wav|x-wav|aac)(;[\w=,. -]{0,60})?$/i;
const AUDIO_EXT = { webm: 'webm', ogg: 'ogg', mp4: 'm4a', mpeg: 'mp3', wav: 'wav', 'x-wav': 'wav', aac: 'aac' };
/* Mẫu giọng học thêm từ cuộc họp: bản đăng ký tính 10 đơn vị trọng số, phần học thêm tối đa 40 (trung bình trượt: giọng, micro thay đổi theo thời gian vẫn theo kịp) */
const ENROLL_W = 10, ADAPT_CAP = 40, ADAPT_PER_SAVE = 20;
const MAINT_EVERY_MS = 10 * 60 * 1000;
let lastMaint = 0;
/** Dọn dữ liệu hết hạn. Máy chủ gọi theo từng yêu cầu, tối đa 10 phút một lần (trên Cloudflare không có tiến trình chạy nền):
 *  bản ghi âm quá 24 giờ, phần âm thanh mồ côi, mẫu giọng của tài khoản đã ngừng hoạt động. */
function maintain(force) {
  const t = Date.now();
  if (!force && t - lastMaint < MAINT_EVERY_MS) return null;
  lastMaint = t;
  let audio = 0, voices = 0;
  D.tx(() => {
    run('DELETE FROM meeting_audio_parts WHERE audio_id IN (SELECT id FROM meeting_audio WHERE expires_ms < ?)', t);
    audio = Number(run('DELETE FROM meeting_audio WHERE expires_ms < ?', t).changes || 0);
    run('DELETE FROM meeting_audio_parts WHERE audio_id NOT IN (SELECT id FROM meeting_audio)');
    voices = Number(run('DELETE FROM voice_profiles WHERE user_id IN (SELECT id FROM users WHERE active=0)').changes || 0);
  });
  return { audio, voices };
}
/** Xóa mẫu giọng ngay khi quản trị viên khóa tài khoản (server.js, PUT /api/admin/users/:id) */
function onUserDisabled(uid) { return Number(run('DELETE FROM voice_profiles WHERE user_id=?', uid).changes || 0); }
const blend = (a, wa, b, wb) => a.map((x, i) => (x * wa + b[i] * wb) / (wa + wb));
const CLOSED = "('done','failed')";
const isAdmin = u => u.role === 'admin';
const validVec = v => Array.isArray(v) && v.length === VOICE_DIMS && v.every(x => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) < 1e4);

function register({ route, bad, forbid, notFound, str, int, secLog, clientIp }) {
  const meetingOf = (id, user) => {
    const m = get('SELECT id, title, host_id, created_by, start_at, end_at, status FROM meetings WHERE id=?', id) || notFound('Cuộc họp không tồn tại.');
    m.member_ids = all('SELECT user_id FROM meeting_members WHERE meeting_id=?', id).map(r => r.user_id);
    if (m.host_id && !m.member_ids.includes(m.host_id)) m.member_ids.push(m.host_id);
    m.can_edit = isAdmin(user) || m.host_id === user.id || m.created_by === user.id;
    m.can_view = m.can_edit || m.member_ids.includes(user.id);
    return m;
  };
  const log = (event, user, req, detail) => secLog(event, { user_id: user.id, username: user.username, ip: clientIp(req), detail });

  /* ---------- 1. Mẫu giọng của tôi ---------- */
  route('GET', '/api/me/voice', ({ user }) => {
    const p = get('SELECT version, seconds, consent_at, updated_at, adapt_n, adapted_at FROM voice_profiles WHERE user_id=?', user.id);
    return p ? { enrolled: p.version === VOICE_VERSION, outdated: p.version !== VOICE_VERSION, seconds: p.seconds, consent_at: p.consent_at, updated_at: p.updated_at, adapt_n: p.adapt_n || 0, adapted_at: p.adapted_at || null } : { enrolled: false };
  });
  route('PUT', '/api/me/voice', ({ user, body, req }) => {
    if (body.consent !== true) bad('Cần tích đồng ý cho lưu đặc trưng giọng nói trước khi lưu.');
    if (body.version !== VOICE_VERSION) bad('Phiên bản đặc trưng giọng nói không khớp. Vui lòng tải lại trang.');
    if (!validVec(body.vec)) bad('Đặc trưng giọng nói không hợp lệ.');
    const secs = Math.max(0, Math.min(600, Number(body.seconds) || 0));
    if (secs < 8) bad('Mẫu giọng quá ngắn. Vui lòng đọc liên tục ít nhất 10 giây.');
    const t = now();
    run(`INSERT INTO voice_profiles(user_id, vec, version, seconds, consent_at, updated_at) VALUES(?,?,?,?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET vec=excluded.vec, version=excluded.version, seconds=excluded.seconds, consent_at=excluded.consent_at, updated_at=excluded.updated_at, adapt_n=0, adapted_at=NULL`,
      user.id, JSON.stringify(body.vec), VOICE_VERSION, secs, t, t);
    log('voice_enroll', user, req, `đăng ký mẫu giọng (${Math.round(secs)} giây; chỉ lưu đặc trưng)`);
    return { enrolled: true, seconds: secs, consent_at: t, updated_at: t };
  });
  route('DELETE', '/api/me/voice', ({ user, req }) => {
    const n = Number(run('DELETE FROM voice_profiles WHERE user_id=?', user.id).changes || 0);
    if (n) log('voice_delete', user, req, 'xóa mẫu giọng');
    return { enrolled: false, deleted: n > 0 };
  });

  /* ---------- 2. Dấu giọng của thành phần cuộc họp ---------- */
  route('GET', '/api/meetings/:id/voices', ({ user, params, req }) => {
    const m = meetingOf(int(params.id), user);
    if (!m.can_view) forbid('Chỉ thành phần cuộc họp được dùng nhận dạng người nói.');
    if (!m.member_ids.length) return [];
    const rows = all(`SELECT v.user_id, v.vec, u.full_name FROM voice_profiles v JOIN users u ON u.id=v.user_id
      WHERE v.version=? AND u.active=1 AND v.user_id IN (${m.member_ids.map(() => '?').join(',')})`, VOICE_VERSION, ...m.member_ids);
    if (rows.length) log('voice_read', user, req, `đọc ${rows.length} mẫu giọng của cuộc họp #${m.id}`);
    return rows.map(r => ({ user_id: r.user_id, full_name: r.full_name, vec: JSON.parse(r.vec) }));
  });

  /* ---------- 3. Bản ghi phát biểu ---------- */
  route('GET', '/api/meetings/:id/transcript', ({ user, params }) => {
    const m = meetingOf(int(params.id), user);
    if (!m.can_view) forbid('Chỉ thành phần cuộc họp được xem bản ghi phát biểu.');
    const t = get('SELECT segments, speakers, updated_by, updated_at FROM meeting_transcripts WHERE meeting_id=?', m.id);
    return t ? { segments: JSON.parse(t.segments), speakers: JSON.parse(t.speakers), updated_by: t.updated_by, updated_at: t.updated_at, can_edit: m.can_edit } : { segments: [], speakers: [], can_edit: m.can_edit };
  });
  route('PUT', '/api/meetings/:id/transcript', ({ user, params, body, req }) => {
    const m = meetingOf(int(params.id), user);
    if (!m.can_edit) forbid('Chỉ người chủ trì hoặc người tạo cuộc họp được lưu bản ghi phát biểu.');
    const src = Array.isArray(body.segments) ? body.segments : bad('Thiếu bản ghi phát biểu.');
    if (src.length > MAX_SEGS) bad(`Tối đa ${MAX_SEGS} đoạn phát biểu.`);
    const ids = new Set(m.member_ids);
    const names = new Map(m.member_ids.length ? all(`SELECT id, full_name FROM users WHERE id IN (${m.member_ids.map(() => '?').join(',')})`, ...m.member_ids).map(r => [r.id, r.full_name]) : []);
    const segs = src.map(s => {
      const uid = s && ids.has(int(s.uid)) ? int(s.uid) : null; // chỉ nhận người trong thành phần họp
      return { t: Math.max(0, Math.min(86400, Math.round(Number(s && s.t) || 0))), uid, name: uid ? names.get(uid) : '', text: str(s && s.text, MAX_SEG_TEXT) };
    }).filter(s => s.text).sort((a, b) => a.t - b.t);
    /* Thống kê phát biểu: số lượt, thời lượng ước tính (đến đoạn kế tiếp, tối đa 5 phút), số chữ */
    const st = new Map();
    segs.forEach((s, i) => {
      const k = s.uid || 0, o = st.get(k) || { uid: s.uid, name: s.uid ? s.name : 'Chưa rõ người nói', turns: 0, seconds: 0, chars: 0 };
      if (!i || segs[i - 1].uid !== s.uid) o.turns++;
      o.seconds += Math.min(300, Math.max(0, (segs[i + 1] ? segs[i + 1].t : s.t + Math.ceil(s.text.length / 15)) - s.t)); o.chars += s.text.length;
      st.set(k, o);
    });
    const speakers = [...st.values()].sort((a, b) => b.seconds - a.seconds);
    run(`INSERT INTO meeting_transcripts(meeting_id, segments, speakers, updated_by, updated_at) VALUES(?,?,?,?,?)
      ON CONFLICT(meeting_id) DO UPDATE SET segments=excluded.segments, speakers=excluded.speakers, updated_by=excluded.updated_by, updated_at=excluded.updated_at`,
      m.id, JSON.stringify(segs), JSON.stringify(speakers), user.id, now());
    run('INSERT INTO activity(user_id, text, created_at) VALUES(?,?,?)', user.id, `lưu bản ghi phát biểu cuộc họp <b>${String(m.title).replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';')}</b>`, now());
    /* Học thêm mẫu giọng từ các đoạn thư ký đã xác nhận: chỉ cập nhật mẫu đã có (người đó đã tự đăng ký, có đồng ý), không tạo mẫu mới từ cuộc họp */
    const adapted = [];
    if (Array.isArray(body.adapt)) {
      const seen = new Set();
      for (const a of body.adapt.slice(0, 200)) {
        const uid = a && int(a.uid), n = Math.max(1, Math.min(ADAPT_PER_SAVE, int(a && a.n) || 1));
        if (!uid || seen.has(uid) || !ids.has(uid) || !validVec(a.vec)) continue;
        seen.add(uid);
        const p = get('SELECT v.vec, v.adapt_n FROM voice_profiles v JOIN users u ON u.id=v.user_id WHERE v.user_id=? AND v.version=? AND u.active=1', uid, VOICE_VERSION);
        if (!p) continue;
        const k = Math.min(ADAPT_CAP, p.adapt_n || 0), vec = blend(JSON.parse(p.vec), ENROLL_W + k, a.vec, n);
        run('UPDATE voice_profiles SET vec=?, adapt_n=?, adapted_at=? WHERE user_id=?', JSON.stringify(vec.map(x => Math.round(x * 1e6) / 1e6)), Math.min(ADAPT_CAP, k + n), now(), uid);
        adapted.push(uid);
      }
      if (adapted.length) log('voice_adapt', user, req, `cập nhật ${adapted.length} mẫu giọng từ đoạn đã xác nhận, cuộc họp #${m.id}`);
    }
    return { segments: segs.length, speakers, adapted };
  });

  /* ---------- 3A. Bản ghi âm cuộc họp: lưu 24 giờ để tải về, rồi tự xóa ---------- */
  const audioOf = (m, aid) => get('SELECT * FROM meeting_audio WHERE id=? AND meeting_id=? AND expires_ms >= ?', aid, m.id, Date.now()) || notFound('Bản ghi âm không tồn tại hoặc đã hết hạn lưu 24 giờ.');
  const audioOut = a => ({ id: a.id, mime: a.mime, size: a.size, seconds: a.seconds, parts: a.parts, done: !!a.done, created_by: a.created_by, created_at: a.created_at, expires_ms: a.expires_ms });
  const audioEdit = (m, what) => { if (!m.can_edit) forbid(`Chỉ người chủ trì hoặc người tạo cuộc họp được ${what} bản ghi âm.`); };
  route('GET', '/api/meetings/:id/audio', ({ user, params }) => {
    const m = meetingOf(int(params.id), user);
    if (!m.can_view) forbid('Chỉ thành phần cuộc họp được xem bản ghi âm.');
    return { ttl_hours: AUDIO_TTL_MS / 3600000, can_edit: m.can_edit, items: all('SELECT * FROM meeting_audio WHERE meeting_id=? AND expires_ms >= ? ORDER BY id DESC LIMIT 50', m.id, Date.now()).map(audioOut) };
  });
  route('POST', '/api/meetings/:id/audio/start', ({ user, params, body }) => {
    const m = meetingOf(int(params.id), user); audioEdit(m, 'lưu');
    const mime = String(body.mime || '').trim();
    if (!AUDIO_MIME.test(mime)) bad('Định dạng âm thanh không hỗ trợ.');
    if (get('SELECT COUNT(*) n FROM meeting_audio WHERE meeting_id=? AND expires_ms >= ?', m.id, Date.now()).n >= 20) bad('Cuộc họp đã có 20 bản ghi âm trong 24 giờ qua. Vui lòng xóa bớt.');
    const id = Number(run('INSERT INTO meeting_audio(meeting_id, mime, created_by, created_at, expires_ms) VALUES(?,?,?,?,?)', m.id, mime, user.id, now(), Date.now() + AUDIO_TTL_MS).lastInsertRowid);
    return audioOut(get('SELECT * FROM meeting_audio WHERE id=?', id));
  });
  /* Gửi từng phần theo thứ tự (seq = số phần đã nhận); gửi lại phần đã nhận (mất mạng, thử lại) thì bỏ qua */
  route('PUT', '/api/meetings/:id/audio/:aid/parts/:seq', ({ user, params, body }) => {
    const m = meetingOf(int(params.id), user); audioEdit(m, 'lưu');
    const a = audioOf(m, int(params.aid)), seq = int(params.seq);
    if (a.done) bad('Bản ghi âm đã kết thúc.');
    if (seq < a.parts) return audioOut(a);
    if (seq !== a.parts) bad(`Thiếu phần ghi âm số ${a.parts}.`);
    const buf = Buffer.from(String(body.data || ''), 'base64');
    if (!buf.length) bad('Phần ghi âm rỗng.');
    if (buf.length > AUDIO_PART) bad('Mỗi phần ghi âm tối đa 1 MB.');
    if (a.size + buf.length > AUDIO_MAX) bad('Bản ghi âm vượt 100 MB. Vui lòng dừng và bắt đầu bản ghi mới.');
    const secs = Math.max(a.seconds, Math.min(86400, Number(body.seconds) || 0));
    D.tx(() => {
      run('INSERT INTO meeting_audio_parts(audio_id, seq, data) VALUES(?,?,?)', a.id, seq, buf);
      run('UPDATE meeting_audio SET parts=parts+1, size=size+?, seconds=?, expires_ms=? WHERE id=?', buf.length, secs, Date.now() + AUDIO_TTL_MS, a.id);
    });
    return audioOut(get('SELECT * FROM meeting_audio WHERE id=?', a.id));
  });
  route('POST', '/api/meetings/:id/audio/:aid/finish', ({ user, params, body }) => {
    const m = meetingOf(int(params.id), user); audioEdit(m, 'lưu');
    const a = audioOf(m, int(params.aid));
    if (!a.parts) { run('DELETE FROM meeting_audio WHERE id=?', a.id); return { deleted: true }; }
    run('UPDATE meeting_audio SET done=1, seconds=?, expires_ms=? WHERE id=?', Math.max(a.seconds, Math.min(86400, Number(body.seconds) || 0)), Date.now() + AUDIO_TTL_MS, a.id);
    run('INSERT INTO activity(user_id, text, created_at) VALUES(?,?,?)', user.id, `lưu bản ghi âm cuộc họp <b>${String(m.title).replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';')}</b> (tự xóa sau 24 giờ)`, now());
    return audioOut(get('SELECT * FROM meeting_audio WHERE id=?', a.id));
  });
  route('GET', '/api/meetings/:id/audio/:aid/file', ({ user, params, req, res }) => {
    const m = meetingOf(int(params.id), user);
    if (!m.can_view) forbid('Chỉ thành phần cuộc họp được tải bản ghi âm.');
    const a = audioOf(m, int(params.aid));
    const rows = all('SELECT data FROM meeting_audio_parts WHERE audio_id=? ORDER BY seq', a.id);
    if (!rows.length) notFound('Bản ghi âm chưa có dữ liệu.');
    const buf = Buffer.concat(rows.map(r => Buffer.from(r.data)));
    log('meeting_audio_download', user, req, `tải bản ghi âm #${a.id} cuộc họp #${m.id} (${Math.round(buf.length / 1024)} KB)`);
    const ext = AUDIO_EXT[((a.mime.match(/^audio\/([\w-]+)/i) || [])[1] || '').toLowerCase()] || 'webm';
    sendFile(res, buf, `ghi-am-cuoc-hop-${m.id}-${String(a.created_at || '').slice(0, 16).replace(/[: ]/g, '-')}.${ext}`, a.mime.split(';')[0]);
  }, { raw: true });
  route('DELETE', '/api/meetings/:id/audio/:aid', ({ user, params, req }) => {
    const m = meetingOf(int(params.id), user); audioEdit(m, 'xóa');
    const a = audioOf(m, int(params.aid));
    D.tx(() => { run('DELETE FROM meeting_audio_parts WHERE audio_id=?', a.id); run('DELETE FROM meeting_audio WHERE id=?', a.id); });
    log('meeting_audio_delete', user, req, `xóa bản ghi âm #${a.id} cuộc họp #${m.id}`);
    return { deleted: true };
  });

  /* ---------- 4. Dữ liệu tư vấn phân công ---------- */
  route('GET', '/api/meetings/:id/assign-context', ({ user, params }) => {
    const m = meetingOf(int(params.id), user);
    if (!m.can_view) forbid('Chỉ thành phần cuộc họp được xem dữ liệu phân công.');
    const heads = all('SELECT head_id FROM departments WHERE head_id IS NOT NULL').map(r => r.head_id);
    const ids = [...new Set(m.member_ids.concat(heads))];
    if (!ids.length) return { candidates: [], workload: false };
    const q = ids.map(() => '?').join(',');
    const people = all(`SELECT u.id, u.full_name, u.title, d.name dept, (SELECT 1 FROM departments h WHERE h.head_id=u.id LIMIT 1) is_head
      FROM users u LEFT JOIN departments d ON d.id=u.dept_id WHERE u.active=1 AND u.id IN (${q}) ORDER BY u.full_name`, ...ids);
    const showLoad = m.can_edit; // số việc của người khác: chỉ người chủ trì/người tạo cuộc họp, quản trị viên
    const load = showLoad ? new Map(all(`SELECT assignee_id uid, COUNT(*) open, SUM(CASE WHEN due_date IS NOT NULL AND due_date < ? THEN 1 ELSE 0 END) late,
      SUM(CASE WHEN due_date BETWEEN ? AND ? THEN 1 ELSE 0 END) soon FROM tasks WHERE status NOT IN ${CLOSED} AND assignee_id IN (${q}) GROUP BY assignee_id`,
      today(), today(), addDays(today(), 7), ...ids).map(r => [r.uid, r])) : null;
    return {
      workload: showLoad,
      candidates: people.map(p => ({
        id: p.id, full_name: p.full_name, title: p.title || '', dept: p.dept || '', is_head: !!p.is_head, in_meeting: m.member_ids.includes(p.id), is_host: p.id === m.host_id,
        ...(showLoad ? { open_tasks: (load.get(p.id) || {}).open || 0, late_tasks: (load.get(p.id) || {}).late || 0, due_7d: (load.get(p.id) || {}).soon || 0 } : {})
      }))
    };
  });
}

module.exports = { register, maintain, onUserDisabled, VOICE_VERSION, VOICE_DIMS, AUDIO_TTL_MS };
