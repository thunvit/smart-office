'use strict';
/**
 * Trợ lý cuộc họp – dữ liệu phía máy chủ (ADR-011, 07/11/2026).
 *  1. Mẫu giọng (dấu giọng) của từng người: chỉ chính người đó đăng ký, phải tích đồng ý; chỉ lưu dãy số đặc trưng (57 số, tính tại trình duyệt),
 *     không lưu âm thanh. Xóa được bất kỳ lúc nào. Đăng ký, xóa, đọc đều ghi nhật ký an ninh.
 *  2. Dấu giọng của thành phần một cuộc họp: chỉ người chủ trì, người tạo cuộc họp, quản trị viên hoặc thành viên được mời đọc (để gợi ý người nói khi ghi âm).
 *  3. Bản ghi phát biểu của cuộc họp (ai nói gì, lúc nào): người chủ trì/người tạo/quản trị viên lưu; thành phần họp xem.
 *  4. Dữ liệu tư vấn phân công: chức vụ, phòng ban của thành phần họp và trưởng các phòng; số việc đang làm, quá hạn chỉ trả cho người có quyền sửa cuộc họp.
 * Không có trong danh mục API của trợ lý hội thoại (ai-tools.js): mô hình không đọc được dấu giọng.
 */
const D = require('./db');
const { all, get, run, now, today, addDays } = D;

D.db.exec(`
CREATE TABLE IF NOT EXISTS voice_profiles (user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, vec TEXT NOT NULL, version TEXT NOT NULL,
  seconds REAL DEFAULT 0, consent_at TEXT NOT NULL, updated_at TEXT);
CREATE TABLE IF NOT EXISTS meeting_transcripts (meeting_id INTEGER PRIMARY KEY REFERENCES meetings(id) ON DELETE CASCADE, segments TEXT NOT NULL, speakers TEXT NOT NULL DEFAULT '[]',
  updated_by INTEGER, updated_at TEXT);
`);
const VOICE_VERSION = 'mfcc-v1', VOICE_DIMS = 57, MAX_SEGS = 3000, MAX_SEG_TEXT = 2000;
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
    const p = get('SELECT version, seconds, consent_at, updated_at FROM voice_profiles WHERE user_id=?', user.id);
    return p ? { enrolled: p.version === VOICE_VERSION, outdated: p.version !== VOICE_VERSION, seconds: p.seconds, consent_at: p.consent_at, updated_at: p.updated_at } : { enrolled: false };
  });
  route('PUT', '/api/me/voice', ({ user, body, req }) => {
    if (body.consent !== true) bad('Cần tích đồng ý cho lưu đặc trưng giọng nói trước khi lưu.');
    if (body.version !== VOICE_VERSION) bad('Phiên bản đặc trưng giọng nói không khớp. Vui lòng tải lại trang.');
    if (!validVec(body.vec)) bad('Đặc trưng giọng nói không hợp lệ.');
    const secs = Math.max(0, Math.min(600, Number(body.seconds) || 0));
    if (secs < 8) bad('Mẫu giọng quá ngắn. Vui lòng đọc liên tục ít nhất 10 giây.');
    const t = now();
    run(`INSERT INTO voice_profiles(user_id, vec, version, seconds, consent_at, updated_at) VALUES(?,?,?,?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET vec=excluded.vec, version=excluded.version, seconds=excluded.seconds, consent_at=excluded.consent_at, updated_at=excluded.updated_at`,
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
      WHERE v.version=? AND v.user_id IN (${m.member_ids.map(() => '?').join(',')})`, VOICE_VERSION, ...m.member_ids);
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
  route('PUT', '/api/meetings/:id/transcript', ({ user, params, body }) => {
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
    return { segments: segs.length, speakers };
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

module.exports = { register, VOICE_VERSION, VOICE_DIMS };
