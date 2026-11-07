'use strict';
/**
 * Đợt 4: Tuyển dụng, Nhắn tin nội bộ, Đăng ký khách đến, Khen thưởng – Kỷ luật, Đào tạo, Đánh giá năng lực.
 */
const D = require('./db');
const { db, all, get, run, tx, today, now, addDays } = D;

db.exec(`
CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY, code TEXT, title TEXT NOT NULL, dept_id INTEGER, quantity INTEGER DEFAULT 1, deadline TEXT, status TEXT DEFAULT 'open',
  salary_range TEXT DEFAULT '', description TEXT DEFAULT '', requirements TEXT DEFAULT '', created_by INTEGER, created_at TEXT);
CREATE TABLE IF NOT EXISTS candidates (
  id INTEGER PRIMARY KEY, job_id INTEGER REFERENCES jobs(id) ON DELETE CASCADE, full_name TEXT NOT NULL, phone TEXT DEFAULT '', email TEXT DEFAULT '',
  source TEXT DEFAULT '', cv_link TEXT DEFAULT '', stage TEXT DEFAULT 'moi', rating INTEGER DEFAULT 0, interview_at TEXT, interviewer_id INTEGER,
  note TEXT DEFAULT '', created_at TEXT, updated_at TEXT);
CREATE TABLE IF NOT EXISTS cand_notes (id INTEGER PRIMARY KEY, candidate_id INTEGER REFERENCES candidates(id) ON DELETE CASCADE, user_id INTEGER, score INTEGER, content TEXT, created_at TEXT);

CREATE TABLE IF NOT EXISTS conversations (id INTEGER PRIMARY KEY, kind TEXT DEFAULT 'direct', name TEXT DEFAULT '', created_by INTEGER, created_at TEXT, last_at TEXT);
CREATE TABLE IF NOT EXISTS conv_members (conv_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE, user_id INTEGER, last_read INTEGER DEFAULT 0, PRIMARY KEY(conv_id, user_id));
CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY, conv_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE, user_id INTEGER, body TEXT, created_at TEXT);
CREATE INDEX IF NOT EXISTS ix_msg_conv ON messages(conv_id, id);

CREATE TABLE IF NOT EXISTS visitors (
  id INTEGER PRIMARY KEY, full_name TEXT NOT NULL, organization TEXT DEFAULT '', phone TEXT DEFAULT '', purpose TEXT DEFAULT '', guests INTEGER DEFAULT 1,
  host_id INTEGER, visit_at TEXT NOT NULL, status TEXT DEFAULT 'registered', badge_no TEXT DEFAULT '', checkin_at TEXT, checkout_at TEXT, note TEXT DEFAULT '',
  created_by INTEGER, created_at TEXT);

CREATE TABLE IF NOT EXISTS cases (
  id INTEGER PRIMARY KEY, code TEXT, kind TEXT NOT NULL, title TEXT NOT NULL, user_id INTEGER, occurred_on TEXT, description TEXT DEFAULT '',
  form TEXT DEFAULT '', amount INTEGER DEFAULT 0, decision_no TEXT DEFAULT '', status TEXT DEFAULT 'new', created_by INTEGER, created_at TEXT,
  decided_by INTEGER, decided_at TEXT, result_note TEXT DEFAULT '');

CREATE TABLE IF NOT EXISTS courses (
  id INTEGER PRIMARY KEY, title TEXT NOT NULL, kind TEXT DEFAULT 'noibo', trainer TEXT DEFAULT '', start_date TEXT, end_date TEXT, location TEXT DEFAULT '',
  hours REAL DEFAULT 0, capacity INTEGER DEFAULT 0, cost INTEGER DEFAULT 0, description TEXT DEFAULT '', open_register INTEGER DEFAULT 1, status TEXT DEFAULT 'open',
  created_by INTEGER, created_at TEXT);
CREATE TABLE IF NOT EXISTS course_members (course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE, user_id INTEGER, status TEXT DEFAULT 'registered', score REAL, feedback TEXT DEFAULT '', PRIMARY KEY(course_id, user_id));

CREATE TABLE IF NOT EXISTS review_cycles (id INTEGER PRIMARY KEY, name TEXT, start_date TEXT, end_date TEXT, criteria TEXT, status TEXT DEFAULT 'open', created_at TEXT);
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY, cycle_id INTEGER REFERENCES review_cycles(id) ON DELETE CASCADE, user_id INTEGER, reviewer_id INTEGER,
  self_scores TEXT, self_comment TEXT DEFAULT '', self_at TEXT, mgr_scores TEXT, mgr_comment TEXT DEFAULT '', mgr_at TEXT,
  final_score REAL, rank TEXT, status TEXT DEFAULT 'pending', UNIQUE(cycle_id, user_id));
`);

const STAGES = ['moi', 'sangloc', 'phongvan', 'denghi', 'nhanviec', 'loai'];
const CASE_KIND = ['khenthuong', 'kyluat', 'suvu'];
/* Hình thức xử lý kỷ luật lao động theo Điều 124 Bộ luật Lao động 2019 */
const DISCIPLINE = ['Khiển trách', 'Kéo dài thời hạn nâng lương không quá 06 tháng', 'Cách chức', 'Sa thải'];
const REWARD = ['Giấy khen của Giám đốc', 'Thưởng tiền', 'Biểu dương trước tập thể', 'Nâng bậc lương trước thời hạn'];
const DEFAULT_CRITERIA = [
  { name: 'Khối lượng, tiến độ hoàn thành nhiệm vụ', weight: 35 },
  { name: 'Chất lượng, hiệu quả công việc', weight: 30 },
  { name: 'Tinh thần trách nhiệm, chấp hành nội quy', weight: 15 },
  { name: 'Phối hợp, làm việc nhóm', weight: 10 },
  { name: 'Học tập, sáng kiến, cải tiến', weight: 10 }
];
const rankOf = s => s >= 4.5 ? 'A' : s >= 3.5 ? 'B' : s >= 2.5 ? 'C' : 'D';

function register({ route, bad, forbid, notFound, isAdmin, isHR, isDirector, log, esc, str, int, isDate }) {
  const isHead = u => !!get('SELECT 1 FROM departments WHERE head_id=?', u.id);
  const headDepts = u => all('SELECT id FROM departments WHERE head_id=?', u.id).map(r => r.id);
  const isDT = s => /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(String(s || ''));
  const money = v => Math.max(0, int(String(v ?? 0).replace(/\D/g, '')));
  const nextCode = (table, prefix) => { const y = today().slice(0, 4), p = `${prefix}-${y}-`; const n = get(`SELECT COALESCE(MAX(CAST(substr(code, ${p.length + 1}) AS INTEGER)),0) n FROM ${table} WHERE code LIKE ?`, p + '%').n + 1; return p + String(n).padStart(4, '0'); };
  const lead = u => isAdmin(u) || isDirector(u) || isHR(u);

  /* ================= TUYỂN DỤNG ================= */
  const canRecruit = u => lead(u) || isHead(u);
  const jobScope = u => lead(u) ? ['1=1', []] : [`j.dept_id IN (${headDepts(u).map(() => '?').join(',') || 'NULL'})`, headDepts(u)];
  route('GET', '/api/recruit/jobs', ({ user }) => {
    if (!canRecruit(user)) forbid('Phân hệ Tuyển dụng dành cho Phòng HC–NS và lãnh đạo các phòng.');
    const [w, p] = jobScope(user);
    return all(`SELECT j.*, d.name dept_name, (SELECT COUNT(*) FROM candidates c WHERE c.job_id=j.id) n_cand,
      (SELECT COUNT(*) FROM candidates c WHERE c.job_id=j.id AND c.stage='nhanviec') n_hired,
      (SELECT COUNT(*) FROM candidates c WHERE c.job_id=j.id AND c.stage='phongvan') n_interview
      FROM jobs j LEFT JOIN departments d ON d.id=j.dept_id WHERE ${w} ORDER BY j.status, j.id DESC`, ...p);
  });
  const jobOr = (u, id) => { const [w, p] = jobScope(u); return get(`SELECT j.*, d.name dept_name FROM jobs j LEFT JOIN departments d ON d.id=j.dept_id WHERE j.id=? AND ${w}`, int(id), ...p) || notFound('Vị trí tuyển dụng không tồn tại hoặc bạn không có quyền xem.'); };
  route('GET', '/api/recruit/jobs/:id', ({ user, params }) => {
    if (!canRecruit(user)) forbid();
    const j = jobOr(user, params.id);
    j.candidates = all('SELECT c.*, u.full_name interviewer_name FROM candidates c LEFT JOIN users u ON u.id=c.interviewer_id WHERE job_id=? ORDER BY c.updated_at DESC', j.id);
    return j;
  });
  function jobInput(b) {
    const t = str(b.title, 200); if (!t) bad('Vui lòng nhập vị trí tuyển dụng.');
    if (!get('SELECT 1 FROM departments WHERE id=?', int(b.dept_id))) bad('Vui lòng chọn phòng ban.');
    if (b.deadline && !isDate(b.deadline)) bad('Hạn nhận hồ sơ không hợp lệ.');
    return [t, int(b.dept_id), Math.max(1, int(b.quantity) || 1), b.deadline || null, b.status === 'closed' ? 'closed' : 'open', str(b.salary_range, 100), str(b.description, 5000), str(b.requirements, 5000)];
  }
  route('POST', '/api/recruit/jobs', ({ user, body }) => {
    if (!lead(user)) forbid('Chỉ Phòng HC–NS được mở vị trí tuyển dụng.');
    const v = jobInput(body);
    const id = Number(run('INSERT INTO jobs(title,dept_id,quantity,deadline,status,salary_range,description,requirements,code,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)', ...v, nextCode('jobs', 'TD'), user.id, now()).lastInsertRowid);
    log(user.id, `mở vị trí tuyển dụng <b>${esc(v[0])}</b>`);
    return { id };
  });
  route('PUT', '/api/recruit/jobs/:id', ({ user, params, body }) => {
    if (!lead(user)) forbid(); const j = jobOr(user, params.id);
    run('UPDATE jobs SET title=?,dept_id=?,quantity=?,deadline=?,status=?,salary_range=?,description=?,requirements=? WHERE id=?', ...jobInput(body), j.id);
    return { ok: true };
  });
  route('POST', '/api/recruit/candidates', ({ user, body }) => {
    if (!canRecruit(user)) forbid(); const j = jobOr(user, body.job_id);
    const n = str(body.full_name, 120); if (!n) bad('Vui lòng nhập họ tên ứng viên.');
    const id = Number(run('INSERT INTO candidates(job_id,full_name,phone,email,source,cv_link,note,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)', j.id, n, str(body.phone, 30), str(body.email, 120), str(body.source, 80), str(body.cv_link, 500), str(body.note, 2000), now(), now()).lastInsertRowid);
    return { id };
  });
  const candOr = (u, id) => { const c = get('SELECT * FROM candidates WHERE id=?', int(id)) || notFound('Ứng viên không tồn tại.'); jobOr(u, c.job_id); return c; };
  route('GET', '/api/recruit/candidates/:id', ({ user, params }) => {
    if (!canRecruit(user)) forbid(); const c = candOr(user, params.id);
    c.notes = all('SELECT n.*, u.full_name FROM cand_notes n LEFT JOIN users u ON u.id=n.user_id WHERE candidate_id=? ORDER BY n.id DESC', c.id);
    return c;
  });
  route('PUT', '/api/recruit/candidates/:id', ({ user, params, body }) => {
    if (!canRecruit(user)) forbid(); const c = candOr(user, params.id);
    const stage = STAGES.includes(body.stage) ? body.stage : c.stage;
    if (body.interview_at && !isDT(body.interview_at)) bad('Thời gian phỏng vấn không hợp lệ.');
    run('UPDATE candidates SET full_name=?, phone=?, email=?, source=?, cv_link=?, stage=?, interview_at=?, interviewer_id=?, note=?, updated_at=? WHERE id=?',
      str(body.full_name ?? c.full_name, 120) || c.full_name, str(body.phone ?? c.phone, 30), str(body.email ?? c.email, 120), str(body.source ?? c.source, 80), str(body.cv_link ?? c.cv_link, 500), stage,
      body.interview_at !== undefined ? (body.interview_at || null) : c.interview_at, body.interviewer_id !== undefined ? (int(body.interviewer_id) || null) : c.interviewer_id, str(body.note ?? c.note, 2000), now(), c.id);
    if (stage !== c.stage) log(user.id, `chuyển ứng viên <b>${esc(c.full_name)}</b> sang bước mới`);
    return { ok: true };
  });
  route('POST', '/api/recruit/candidates/:id/notes', ({ user, params, body }) => {
    if (!canRecruit(user)) forbid(); const c = candOr(user, params.id);
    const content = str(body.content, 3000); if (!content) bad('Vui lòng nhập nhận xét.');
    const score = body.score ? Math.max(1, Math.min(5, int(body.score))) : null;
    run('INSERT INTO cand_notes(candidate_id,user_id,score,content,created_at) VALUES(?,?,?,?,?)', c.id, user.id, score, content, now());
    const avg = get('SELECT AVG(score) a FROM cand_notes WHERE candidate_id=? AND score IS NOT NULL', c.id).a;
    run('UPDATE candidates SET rating=?, updated_at=? WHERE id=?', avg ? Math.round(avg) : 0, now(), c.id);
    return { ok: true };
  });
  route('DELETE', '/api/recruit/candidates/:id', ({ user, params }) => { if (!lead(user)) forbid(); const c = candOr(user, params.id); run('DELETE FROM candidates WHERE id=?', c.id); return { ok: true }; });

  /* ================= NHẮN TIN NỘI BỘ ================= */
  const memberOf = (u, cid) => get('SELECT * FROM conv_members WHERE conv_id=? AND user_id=?', int(cid), u.id) || forbid('Bạn không thuộc cuộc trò chuyện này.');
  route('GET', '/api/chat/conversations', ({ user }) => all(`SELECT c.*, m.last_read,
      (SELECT COUNT(*) FROM messages x WHERE x.conv_id=c.id AND x.id > m.last_read AND x.user_id<>?) unread,
      (SELECT body FROM messages x WHERE x.conv_id=c.id ORDER BY id DESC LIMIT 1) last_body,
      (SELECT user_id FROM messages x WHERE x.conv_id=c.id ORDER BY id DESC LIMIT 1) last_user,
      (SELECT GROUP_CONCAT(user_id) FROM conv_members y WHERE y.conv_id=c.id) member_ids
    FROM conversations c JOIN conv_members m ON m.conv_id=c.id AND m.user_id=? ORDER BY COALESCE(c.last_at, c.created_at) DESC`, user.id, user.id));
  route('POST', '/api/chat/conversations', ({ user, body }) => {
    const ids = [...new Set((Array.isArray(body.members) ? body.members : []).map(int).filter(x => x && x !== user.id))];
    if (!ids.length) bad('Vui lòng chọn người nhận.');
    for (const i of ids) if (!get('SELECT 1 FROM users WHERE id=? AND active=1', i)) bad('Người nhận không hợp lệ.');
    if (ids.length === 1 && !body.name) {
      const ex = get(`SELECT c.id FROM conversations c WHERE c.kind='direct' AND EXISTS (SELECT 1 FROM conv_members a WHERE a.conv_id=c.id AND a.user_id=?) AND EXISTS (SELECT 1 FROM conv_members b WHERE b.conv_id=c.id AND b.user_id=?)`, user.id, ids[0]);
      if (ex) return { id: ex.id };
    }
    const kind = ids.length === 1 && !body.name ? 'direct' : 'group';
    if (kind === 'group' && !str(body.name)) bad('Vui lòng đặt tên nhóm.');
    const id = tx(() => {
      const c = Number(run('INSERT INTO conversations(kind,name,created_by,created_at,last_at) VALUES(?,?,?,?,?)', kind, str(body.name, 120), user.id, now(), now()).lastInsertRowid);
      for (const u of [user.id, ...ids]) run('INSERT INTO conv_members(conv_id,user_id) VALUES(?,?)', c, u);
      return c;
    });
    return { id };
  });
  route('GET', '/api/chat/conversations/:id/messages', ({ user, params, query }) => {
    const m = memberOf(user, params.id), after = int(query.after);
    const rows = after ? all('SELECT * FROM messages WHERE conv_id=? AND id>? ORDER BY id', m.conv_id, after)
      : all('SELECT * FROM (SELECT * FROM messages WHERE conv_id=? ORDER BY id DESC LIMIT 200) ORDER BY id', m.conv_id);
    const last = rows.length ? rows[rows.length - 1].id : 0;
    /* peek=1 (trợ lý AI đọc thay người dùng): không đánh dấu đã đọc, để người dùng vẫn thấy tin mới */
    if (last > m.last_read && query.peek !== '1') run('UPDATE conv_members SET last_read=? WHERE conv_id=? AND user_id=?', last, m.conv_id, user.id);
    return rows;
  });
  route('POST', '/api/chat/conversations/:id/messages', ({ user, params, body }) => {
    const m = memberOf(user, params.id), b = str(body.body, 4000); if (!b) bad('Tin nhắn trống.');
    const id = Number(run('INSERT INTO messages(conv_id,user_id,body,created_at) VALUES(?,?,?,?)', m.conv_id, user.id, b, now()).lastInsertRowid);
    run('UPDATE conversations SET last_at=? WHERE id=?', now(), m.conv_id);
    run('UPDATE conv_members SET last_read=? WHERE conv_id=? AND user_id=?', id, m.conv_id, user.id);
    return { id };
  });
  route('POST', '/api/chat/conversations/:id/leave', ({ user, params }) => { const m = memberOf(user, params.id); run('DELETE FROM conv_members WHERE conv_id=? AND user_id=?', m.conv_id, user.id); return { ok: true }; });

  /* ================= KHÁCH ĐẾN ================= */
  const reception = u => lead(u);
  route('GET', '/api/visitors', ({ user, query }) => {
    const from = isDate(query.from) ? query.from : today(), to = isDate(query.to) ? query.to : from;
    const mine = !reception(user) || query.mine === '1';
    return { can_reception: reception(user), visitors: all(`SELECT v.*, u.full_name host_name FROM visitors v LEFT JOIN users u ON u.id=v.host_id
      WHERE substr(v.visit_at,1,10) BETWEEN ? AND ? ${mine ? 'AND (v.host_id=? OR v.created_by=?)' : ''} ORDER BY v.visit_at`, from, to, ...(mine ? [user.id, user.id] : [])) };
  });
  route('POST', '/api/visitors', ({ user, body }) => {
    const n = str(body.full_name, 120); if (!n) bad('Vui lòng nhập họ tên khách.');
    if (!isDT(body.visit_at)) bad('Vui lòng chọn thời gian đến.');
    const host = int(body.host_id) || user.id;
    const id = Number(run('INSERT INTO visitors(full_name,organization,phone,purpose,guests,host_id,visit_at,note,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
      n, str(body.organization, 200), str(body.phone, 30), str(body.purpose, 500), Math.max(1, int(body.guests) || 1), host, body.visit_at, str(body.note, 500), user.id, now()).lastInsertRowid);
    log(user.id, `đăng ký đón khách <b>${esc(n)}</b>`);
    return { id };
  });
  route('POST', '/api/visitors/:id/:action', ({ user, params, body }) => {
    const v = get('SELECT * FROM visitors WHERE id=?', int(params.id)) || notFound();
    const a = params.action;
    if (a === 'cancel') { if (!(reception(user) || v.created_by === user.id || v.host_id === user.id)) forbid(); run(`UPDATE visitors SET status='cancelled' WHERE id=?`, v.id); return { ok: true }; }
    if (!reception(user)) forbid('Chỉ bộ phận lễ tân (Phòng HC–NS) được xác nhận khách vào, ra.');
    if (a === 'checkin') run(`UPDATE visitors SET status='in', checkin_at=?, badge_no=? WHERE id=?`, now(), str(body.badge_no, 20), v.id);
    else if (a === 'checkout') run(`UPDATE visitors SET status='out', checkout_at=? WHERE id=?`, now(), v.id);
    else notFound();
    return { ok: true };
  });

  /* ================= KHEN THƯỞNG – KỶ LUẬT ================= */
  const caseScope = u => {
    if (lead(u)) return ['1=1', []];
    const hd = headDepts(u);
    return [`(c.user_id=? AND c.status='decided' OR c.created_by=? ${hd.length ? `OR c.user_id IN (SELECT id FROM users WHERE dept_id IN (${hd.map(() => '?').join(',')}))` : ''})`, [u.id, u.id, ...hd]];
  };
  route('GET', '/api/cases', ({ user, query }) => {
    const [w, p] = caseScope(user), ww = [w];
    if (query.kind) { ww.push('c.kind=?'); p.push(query.kind); }
    return { can_manage: lead(user), can_report: lead(user) || isHead(user), forms: { kyluat: DISCIPLINE, khenthuong: REWARD },
      cases: all(`SELECT c.*, u.full_name subject_name, u.dept_id, d.name dept_name FROM cases c LEFT JOIN users u ON u.id=c.user_id LEFT JOIN departments d ON d.id=u.dept_id WHERE ${ww.join(' AND ')} ORDER BY c.id DESC`, ...p) };
  });
  route('POST', '/api/cases', ({ user, body }) => {
    if (!(lead(user) || isHead(user))) forbid('Chỉ lãnh đạo phòng và Phòng HC–NS được đề nghị khen thưởng, kỷ luật.');
    const kind = CASE_KIND.includes(body.kind) ? body.kind : 'suvu';
    const t = str(body.title, 300); if (!t) bad('Vui lòng nhập nội dung.');
    const u = get('SELECT * FROM users WHERE id=? AND active=1', int(body.user_id)); if (!u) bad('Vui lòng chọn nhân sự liên quan.');
    if (!lead(user) && !headDepts(user).includes(u.dept_id)) forbid('Chỉ đề nghị đối với nhân sự trong phòng mình phụ trách.');
    if (body.occurred_on && !isDate(body.occurred_on)) bad('Ngày xảy ra không hợp lệ.');
    const id = Number(run('INSERT INTO cases(code,kind,title,user_id,occurred_on,description,form,amount,status,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
      nextCode('cases', kind === 'khenthuong' ? 'KT' : kind === 'kyluat' ? 'KL' : 'SV'), kind, t, u.id, body.occurred_on || null, str(body.description, 5000), str(body.form, 200), money(body.amount), 'new', user.id, now()).lastInsertRowid);
    log(user.id, `lập hồ sơ ${kind === 'khenthuong' ? 'khen thưởng' : kind === 'kyluat' ? 'kỷ luật' : 'sự vụ'} <b>${esc(t)}</b>`);
    return { id };
  });
  route('POST', '/api/cases/:id/decide', ({ user, body, params }) => {
    if (!lead(user)) forbid('Chỉ Ban Giám đốc, Phòng HC–NS được ra quyết định.');
    const c = get('SELECT * FROM cases WHERE id=?', int(params.id)) || notFound();
    const status = body.status === 'cancelled' ? 'cancelled' : body.status === 'processing' ? 'processing' : 'decided';
    if (status === 'decided' && c.kind !== 'suvu' && !str(body.decision_no)) bad('Vui lòng nhập số quyết định.');
    if (status === 'decided' && c.kind === 'kyluat' && !DISCIPLINE.includes(body.form)) bad('Vui lòng chọn hình thức kỷ luật theo Điều 124 Bộ luật Lao động.');
    run('UPDATE cases SET status=?, form=?, amount=?, decision_no=?, result_note=?, decided_by=?, decided_at=? WHERE id=?',
      status, str(body.form ?? c.form, 200), body.amount !== undefined ? money(body.amount) : c.amount, str(body.decision_no ?? c.decision_no, 60), str(body.result_note, 3000), user.id, now(), c.id);
    return { ok: true };
  });

  /* ================= ĐÀO TẠO ================= */
  route('GET', '/api/courses', ({ user }) => ({ can_manage: lead(user), courses: all(`SELECT c.*, (SELECT COUNT(*) FROM course_members m WHERE m.course_id=c.id) n_members,
    (SELECT COUNT(*) FROM course_members m WHERE m.course_id=c.id AND m.status='completed') n_done,
    (SELECT status FROM course_members m WHERE m.course_id=c.id AND m.user_id=?) my_status FROM courses c ORDER BY c.start_date DESC`, user.id),
    my_hours: get(`SELECT COALESCE(SUM(c.hours),0) h FROM course_members m JOIN courses c ON c.id=m.course_id WHERE m.user_id=? AND m.status='completed' AND substr(c.end_date,1,4)=?`, user.id, today().slice(0, 4)).h }));
  route('GET', '/api/courses/:id', ({ user, params }) => {
    const c = get('SELECT * FROM courses WHERE id=?', int(params.id)) || notFound('Khóa học không tồn tại.');
    c.members = all('SELECT m.*, u.full_name, u.dept_id FROM course_members m JOIN users u ON u.id=m.user_id WHERE course_id=? ORDER BY u.full_name', c.id);
    c.can_manage = lead(user);
    return c;
  });
  function courseInput(b) {
    const t = str(b.title, 300); if (!t) bad('Vui lòng nhập tên khóa học.');
    if (!isDate(b.start_date) || !isDate(b.end_date) || b.end_date < b.start_date) bad('Thời gian đào tạo không hợp lệ.');
    return [t, b.kind === 'benngoai' ? 'benngoai' : 'noibo', str(b.trainer, 200), b.start_date, b.end_date, str(b.location, 200), Math.max(0, Number(b.hours) || 0), Math.max(0, int(b.capacity)), money(b.cost), str(b.description, 5000), b.open_register === false ? 0 : 1];
  }
  route('POST', '/api/courses', ({ user, body }) => {
    if (!lead(user)) forbid('Chỉ Phòng HC–NS được tạo khóa đào tạo.');
    const v = courseInput(body);
    const id = tx(() => {
      const c = Number(run('INSERT INTO courses(title,kind,trainer,start_date,end_date,location,hours,capacity,cost,description,open_register,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)', ...v, user.id, now()).lastInsertRowid);
      for (const u of (Array.isArray(body.members) ? body.members : []).map(int)) if (get('SELECT 1 FROM users WHERE id=? AND active=1', u)) run(`INSERT OR IGNORE INTO course_members(course_id,user_id,status) VALUES(?,?, 'assigned')`, c, u);
      return c;
    });
    log(user.id, `tạo khóa đào tạo <b>${esc(v[0])}</b>`);
    return { id };
  });
  route('PUT', '/api/courses/:id', ({ user, params, body }) => {
    if (!lead(user)) forbid(); const c = get('SELECT * FROM courses WHERE id=?', int(params.id)) || notFound();
    run('UPDATE courses SET title=?,kind=?,trainer=?,start_date=?,end_date=?,location=?,hours=?,capacity=?,cost=?,description=?,open_register=?, status=? WHERE id=?', ...courseInput(body), body.status === 'closed' ? 'closed' : 'open', c.id);
    return { ok: true };
  });
  route('POST', '/api/courses/:id/:action', ({ user, params, body }) => {
    const c = get('SELECT * FROM courses WHERE id=?', int(params.id)) || notFound(), a = params.action;
    if (a === 'register') {
      if (!c.open_register || c.status !== 'open') bad('Khóa học không mở đăng ký.');
      if (c.capacity && get('SELECT COUNT(*) n FROM course_members WHERE course_id=?', c.id).n >= c.capacity) bad('Khóa học đã đủ số lượng học viên.');
      run(`INSERT OR IGNORE INTO course_members(course_id,user_id,status) VALUES(?,?, 'registered')`, c.id, user.id);
    } else if (a === 'unregister') run(`DELETE FROM course_members WHERE course_id=? AND user_id=? AND status IN ('registered','assigned')`, c.id, user.id);
    else if (a === 'feedback') { const m = get('SELECT * FROM course_members WHERE course_id=? AND user_id=?', c.id, user.id) || forbid(); run('UPDATE course_members SET feedback=? WHERE course_id=? AND user_id=?', str(body.feedback, 2000), c.id, user.id); }
    else if (a === 'members') {
      if (!lead(user)) forbid();
      tx(() => { for (const m of (Array.isArray(body.members) ? body.members : [])) {
        const uid = int(m.user_id); if (!get('SELECT 1 FROM users WHERE id=?', uid)) continue;
        if (m.remove) { run('DELETE FROM course_members WHERE course_id=? AND user_id=?', c.id, uid); continue; }
        const st = ['registered', 'assigned', 'completed', 'absent'].includes(m.status) ? m.status : 'assigned';
        run(`INSERT INTO course_members(course_id,user_id,status,score) VALUES(?,?,?,?) ON CONFLICT(course_id,user_id) DO UPDATE SET status=excluded.status, score=excluded.score`, c.id, uid, st, m.score === '' || m.score == null ? null : Number(m.score));
      } });
    } else notFound();
    return { ok: true };
  });

  /* ================= ĐÁNH GIÁ NĂNG LỰC ================= */
  const reviewerFor = uid => { const u = get('SELECT u.id, d.head_id FROM users u LEFT JOIN departments d ON d.id=u.dept_id WHERE u.id=?', uid); const s = D.getSettings(); return u && u.head_id && u.head_id !== uid ? u.head_id : (s.director_id !== uid ? s.director_id : null); };
  route('GET', '/api/reviews/cycles', ({ user }) => ({ can_manage: lead(user), cycles: all(`SELECT c.*, (SELECT COUNT(*) FROM reviews r WHERE r.cycle_id=c.id) n, (SELECT COUNT(*) FROM reviews r WHERE r.cycle_id=c.id AND r.status='done') n_done FROM review_cycles c ORDER BY c.id DESC`) }));
  route('POST', '/api/reviews/cycles', ({ user, body }) => {
    if (!lead(user)) forbid('Chỉ Ban Giám đốc, Phòng HC–NS được mở kỳ đánh giá.');
    const name = str(body.name, 120); if (!name) bad('Vui lòng nhập tên kỳ đánh giá.');
    if (!isDate(body.start_date) || !isDate(body.end_date) || body.end_date < body.start_date) bad('Thời gian đánh giá không hợp lệ.');
    let crit = Array.isArray(body.criteria) && body.criteria.length ? body.criteria.map(c => ({ name: str(c.name, 200), weight: Number(c.weight) || 0 })).filter(c => c.name && c.weight > 0) : DEFAULT_CRITERIA;
    if (Math.round(crit.reduce((s, c) => s + c.weight, 0)) !== 100) bad('Tổng trọng số các tiêu chí phải bằng 100%.');
    const id = tx(() => {
      const cid = Number(run('INSERT INTO review_cycles(name,start_date,end_date,criteria,created_at) VALUES(?,?,?,?,?)', name, body.start_date, body.end_date, JSON.stringify(crit), now()).lastInsertRowid);
      for (const u of all(`SELECT id FROM users WHERE active=1 AND username<>'admin'`)) run('INSERT INTO reviews(cycle_id,user_id,reviewer_id) VALUES(?,?,?)', cid, u.id, reviewerFor(u.id));
      return cid;
    });
    log(user.id, `mở kỳ đánh giá <b>${esc(name)}</b>`);
    return { id };
  });
  route('GET', '/api/reviews', ({ user, query }) => {
    const cyc = get('SELECT * FROM review_cycles WHERE id=?', int(query.cycle)) || get('SELECT * FROM review_cycles ORDER BY id DESC LIMIT 1');
    if (!cyc) return { cycle: null, mine: null, to_review: [], all: [] };
    cyc.criteria = JSON.parse(cyc.criteria || '[]');
    const sel = `SELECT r.*, u.full_name, u.title, u.dept_id, v.full_name reviewer_name FROM reviews r JOIN users u ON u.id=r.user_id LEFT JOIN users v ON v.id=r.reviewer_id WHERE r.cycle_id=?`;
    const parse = r => r && Object.assign(r, { self_scores: JSON.parse(r.self_scores || 'null'), mgr_scores: JSON.parse(r.mgr_scores || 'null') });
    return { cycle: cyc, mine: parse(get(sel + ' AND r.user_id=?', cyc.id, user.id)), to_review: all(sel + ' AND r.reviewer_id=? ORDER BY u.full_name', cyc.id, user.id).map(parse),
      all: lead(user) ? all(sel + ' ORDER BY u.dept_id, u.full_name', cyc.id).map(parse) : [] };
  });
  route('POST', '/api/reviews/:id/:action', ({ user, params, body }) => {
    const r = get('SELECT * FROM reviews WHERE id=?', int(params.id)) || notFound();
    const cyc = get('SELECT * FROM review_cycles WHERE id=?', r.cycle_id); const crit = JSON.parse(cyc.criteria || '[]');
    if (cyc.status !== 'open') bad('Kỳ đánh giá đã đóng.');
    const scores = (Array.isArray(body.scores) ? body.scores : []).map(Number);
    if (scores.length !== crit.length || scores.some(s => !(s >= 1 && s <= 5))) bad('Vui lòng chấm đủ điểm từng tiêu chí (từ 1 đến 5).');
    if (params.action === 'self') {
      if (r.user_id !== user.id) forbid();
      if (r.status === 'done') bad('Phiếu đánh giá đã hoàn thành.');
      run(`UPDATE reviews SET self_scores=?, self_comment=?, self_at=?, status='self' WHERE id=?`, JSON.stringify(scores), str(body.comment, 3000), now(), r.id);
    } else if (params.action === 'manager') {
      if (!(r.reviewer_id === user.id || lead(user))) forbid('Bạn không phải người đánh giá của phiếu này.');
      const final = Math.round(crit.reduce((s, c, i) => s + scores[i] * c.weight, 0) / 100 * 100) / 100;
      run(`UPDATE reviews SET mgr_scores=?, mgr_comment=?, mgr_at=?, final_score=?, rank=?, status='done' WHERE id=?`, JSON.stringify(scores), str(body.comment, 3000), now(), final, rankOf(final), r.id);
    } else notFound();
    return { ok: true };
  });
  route('POST', '/api/reviews/cycles/:id/close', ({ user, params }) => { if (!lead(user)) forbid(); run(`UPDATE review_cycles SET status='closed' WHERE id=?`, int(params.id)); return { ok: true }; });

  const badges = u => ({
    chat: get(`SELECT COUNT(*) n FROM messages x JOIN conv_members m ON m.conv_id=x.conv_id AND m.user_id=? WHERE x.id > m.last_read AND x.user_id<>?`, u.id, u.id).n,
    reviews: get(`SELECT COUNT(*) n FROM reviews r JOIN review_cycles c ON c.id=r.cycle_id WHERE c.status='open' AND ((r.user_id=? AND r.status='pending') OR (r.reviewer_id=? AND r.status='self'))`, u.id, u.id).n,
    visitors: lead(u) ? get(`SELECT COUNT(*) n FROM visitors WHERE status='registered' AND substr(visit_at,1,10)=?`, today()).n : 0
  });
  return { canRecruit, badges, isLead: lead };
}

/* ================= Dữ liệu mẫu ================= */
function seedExt() {
  if (get(`SELECT value v FROM settings WHERE key='extras_v4'`)) return;
  const U = n => get('SELECT id, dept_id FROM users WHERE username=?', n);
  if (!U('thanh.nv')) { D.setSetting('extras_v4', '1'); return; }
  const id = Object.fromEntries(['thanh.nv', 'huong.tt', 'quan.lm', 'trang.pt', 'huy.dq', 'anh.vn', 'long.hd', 'mai.bt'].map(n => [n.split('.')[0], U(n).id]));
  const T = today(), d = n => addDays(T, n), ts = (n, h) => `${addDays(T, n)} ${h}`, y = T.slice(0, 4);
  tx(() => {
    /* Tuyển dụng */
    const kd = U('quan.lm').dept_id, kt = U('long.hd').dept_id;
    const job = (code, t, dep, q, dl, sal, desc, req) => Number(run('INSERT INTO jobs(code,title,dept_id,quantity,deadline,salary_range,description,requirements,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)', code, t, dep, q, d(dl), sal, desc, req, id.trang, ts(-20, '09:00')).lastInsertRowid);
    const J1 = job(`TD-${y}-0001`, 'Chuyên viên kinh doanh', kd, 2, 10, '12 – 18 triệu đồng + thưởng doanh số', 'Tìm kiếm, chăm sóc khách hàng doanh nghiệp khu vực Ninh Bình và lân cận; lập báo giá, theo dõi hợp đồng.', 'Tốt nghiệp đại học khối kinh tế; tối thiểu 01 năm kinh nghiệm bán hàng B2B; có phương tiện đi lại.');
    const J2 = job(`TD-${y}-0002`, 'Kỹ thuật viên hỗ trợ phần mềm', kt, 1, 20, '10 – 14 triệu đồng', 'Cài đặt, hướng dẫn và hỗ trợ khách hàng sử dụng phần mềm.', 'Tốt nghiệp cao đẳng trở lên ngành CNTT; giao tiếp tốt.');
    const cand = (j, n, ph, src, st, rating, iv, ivBy) => run('INSERT INTO candidates(job_id,full_name,phone,email,source,stage,rating,interview_at,interviewer_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)', j, n, ph, '', src, st, rating, iv, ivBy, ts(-15, '10:00'), ts(-2, '10:00'));
    cand(J1, 'Trần Văn Khánh', '0912 111 222', 'Trang tuyển dụng', 'phongvan', 4, ts(2, '09:00'), id.quan);
    cand(J1, 'Lê Thị Hồng Nhung', '0913 222 333', 'Giới thiệu nội bộ', 'phongvan', 0, ts(2, '10:30'), id.quan);
    cand(J1, 'Phạm Quang Minh', '0914 333 444', 'Trang tuyển dụng', 'sangloc', 0, null, null);
    cand(J1, 'Ngô Thị Thu', '0915 444 555', 'Mạng xã hội', 'moi', 0, null, null);
    cand(J1, 'Đặng Hữu Phúc', '0916 555 666', 'Trang tuyển dụng', 'loai', 2, null, null);
    cand(J2, 'Vũ Đức Anh', '0917 666 777', 'Trường đại học', 'denghi', 5, ts(-3, '14:00'), id.long);
    /* Nhắn tin */
    const conv = (kind, name, members, msgs) => { const c = Number(run('INSERT INTO conversations(kind,name,created_by,created_at,last_at) VALUES(?,?,?,?,?)', kind, name, members[0], ts(-3, '08:00'), ts(0, '08:40')).lastInsertRowid);
      for (const m of members) run('INSERT INTO conv_members(conv_id,user_id) VALUES(?,?)', c, m);
      for (const [u, b, at] of msgs) run('INSERT INTO messages(conv_id,user_id,body,created_at) VALUES(?,?,?,?)', c, u, b, at); };
    conv('group', 'Phòng Kinh doanh', [id.quan, id.huy, id.anh], [[id.quan, 'Chiều nay 14h họp rà soát doanh số tháng 12 ở phòng họp nhỏ A nhé cả nhà.', ts(0, '08:10')], [id.anh, 'Dạ em nhận ạ. Em mang theo số liệu dự án Ninh Bình.', ts(0, '08:15')], [id.huy, 'Em cập nhật xong báo cáo công nợ trước 12h anh nhé.', ts(0, '08:40')]]);
    conv('direct', '', [id.trang, id.mai], [[id.trang, 'Mai ơi, em chuẩn bị giúp chị danh sách học viên đợt đào tạo phần mềm nhé.', ts(-1, '15:00')], [id.mai, 'Dạ chị, em gửi chị trong sáng mai ạ.', ts(-1, '15:05')]]);
    /* Khách đến */
    const vis = (n, org, ph, pur, host, at, st, ci) => run('INSERT INTO visitors(full_name,organization,phone,purpose,host_id,visit_at,status,checkin_at,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)', n, org, ph, pur, host, at, st, ci, host, now());
    vis('Hoàng Văn Nam', 'Công ty TNHH Xây dựng Tràng An', '0229 3888 111', 'Trình bày giải pháp phần mềm quản lý công trình', id.anh, ts(0, '09:30'), 'in', ts(0, '09:25'));
    vis('Nguyễn Thị Hà', 'Công ty CP Thiết bị Minh Phát', '0904 222 999', 'Đàm phán cung cấp máy tính xách tay', id.trang, ts(1, '09:00'), 'registered', null);
    vis('Trần Văn Khánh', 'Ứng viên', '0912 111 222', 'Phỏng vấn vị trí Chuyên viên kinh doanh', id.quan, ts(2, '09:00'), 'registered', null);
    /* Khen thưởng – kỷ luật */
    run(`INSERT INTO cases(code,kind,title,user_id,occurred_on,description,form,amount,decision_no,status,created_by,created_at,decided_by,decided_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      `KT-${y}-0001`, 'khenthuong', 'Hoàn thành xuất sắc hợp đồng hệ thống đặt phòng Du lịch Hoa Lư', id.huy, d(-10), 'Chủ động chăm sóc, chốt hợp đồng giá trị 350 triệu đồng trước thời hạn.', 'Thưởng tiền', 3000000, `15/${y}/QĐ-SO`, 'decided', id.quan, ts(-9, '09:00'), id.thanh, ts(-8, '10:00'));
    run(`INSERT INTO cases(code,kind,title,user_id,occurred_on,description,status,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)`,
      `SV-${y}-0001`, 'suvu', 'Đi muộn nhiều lần trong tháng không có lý do', id.anh, d(-2), 'Theo dữ liệu chấm công, đi muộn 02 lần chưa giải trình. Đề nghị nhắc nhở.', 'new', id.quan, ts(-1, '16:00'));
    /* Đào tạo */
    const course = (t, kind, trainer, s, e, loc, h, cap, cost, desc, members) => { const c = Number(run('INSERT INTO courses(title,kind,trainer,start_date,end_date,location,hours,capacity,cost,description,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)', t, kind, trainer, d(s), d(e), loc, h, cap, cost, desc, id.trang, now()).lastInsertRowid);
      for (const [u, st, sc] of members) run('INSERT INTO course_members(course_id,user_id,status,score) VALUES(?,?,?,?)', c, u, st, sc ?? null); };
    course('Hướng dẫn sử dụng phần mềm SmartOffice – đợt 1', 'noibo', 'Hoàng Đức Long', 3, 3, 'Phòng họp lớn', 2, 30, 0, 'Giao việc, gửi đề xuất, chấm công, tra cứu phiếu lương trên phần mềm.', [[id.huy, 'assigned'], [id.anh, 'assigned'], [id.mai, 'registered'], [id.huong, 'assigned']]);
    course('Kỹ năng đàm phán và chốt hợp đồng B2B', 'benngoai', 'Trung tâm Đào tạo doanh nghiệp', -30, -29, 'Hà Nội', 16, 5, 12000000, 'Khóa học bên ngoài cho Phòng Kinh doanh.', [[id.huy, 'completed', 8.5], [id.anh, 'completed', 9], [id.quan, 'completed', 8]]);
    course('An toàn thông tin cho người dùng văn phòng', 'noibo', 'Phòng Kỹ thuật', 15, 15, 'Phòng họp lớn', 3, 40, 0, 'Nhận diện thư điện tử lừa đảo, quản lý mật khẩu, sao lưu dữ liệu.', []);
    /* Đánh giá */
    const qn = ['I', 'II', 'III', 'IV'][Math.floor(D.vnMonth() / 3)];
    const cid = Number(run('INSERT INTO review_cycles(name,start_date,end_date,criteria,created_at) VALUES(?,?,?,?,?)', `Đánh giá Quý ${qn}/${y}`, d(-5), d(25), JSON.stringify(DEFAULT_CRITERIA), now()).lastInsertRowid);
    for (const u of all(`SELECT id FROM users WHERE active=1 AND username<>'admin'`)) run('INSERT INTO reviews(cycle_id,user_id,reviewer_id) VALUES(?,?,?)', cid, u.id, (function () { const x = get('SELECT d.head_id h FROM users u JOIN departments d ON d.id=u.dept_id WHERE u.id=?', u.id); return x && x.h !== u.id ? x.h : (u.id !== id.thanh ? id.thanh : null); })());
    run(`UPDATE reviews SET self_scores=?, self_comment=?, self_at=?, status='self' WHERE cycle_id=? AND user_id=?`, JSON.stringify([5, 4, 4, 5, 4]), 'Hoàn thành vượt chỉ tiêu doanh số quý, chốt 01 hợp đồng lớn.', now(), cid, id.huy);
    const fs = [4, 4, 5, 4, 3], fin = Math.round(DEFAULT_CRITERIA.reduce((s, c, i) => s + fs[i] * c.weight, 0)) / 100;
    run(`UPDATE reviews SET self_scores=?, self_comment=?, self_at=?, mgr_scores=?, mgr_comment=?, mgr_at=?, final_score=?, rank=?, status='done' WHERE cycle_id=? AND user_id=?`, JSON.stringify([4, 4, 4, 4, 4]), 'Hoàn thành nhiệm vụ được giao.', now(), JSON.stringify(fs), 'Hoàn thành tốt, cần chủ động hơn trong cải tiến quy trình.', now(), fin, rankOf(fin), cid, id.long);
    D.setSetting('extras_v4', '1');
  });
}

module.exports = { register, seedExt, DISCIPLINE, REWARD };
