'use strict';
/**
 * SmartOffice – máy chủ ứng dụng.
 * Chạy: node server.js   (cổng mặc định 3000, đổi bằng biến môi trường PORT)
 * Không dùng thư viện ngoài; yêu cầu Node.js >= 22.13.
 */
const IS_WORKER = !!globalThis.__SO_WORKER; // true khi chạy trong Cloudflare Durable Object (worker/do-core.js)
if (!IS_WORKER) {
  const [maj, min] = process.versions.node.split('.').map(Number);
  if (maj < 22 || (maj === 22 && min < 13)) {
    console.error('\n[LỖI] SmartOffice cần Node.js phiên bản 22.13 trở lên (khuyến nghị bản LTS mới nhất).');
    console.error('      Phiên bản hiện tại: ' + process.version + '. Tải tại https://nodejs.org\n');
    process.exit(1);
  }
  process.removeAllListeners('warning');
  process.on('warning', w => { if (w.name !== 'ExperimentalWarning') console.warn(w); });
}

const fs = IS_WORKER ? null : require('fs');
const path = require('path');
const crypto = require('crypto');
const D = require('./db');
const HR2 = require('./hr2');
const BIZ = require('./biz');
const EXT = require('./ext');
const WORK = require('./work');
const { all, get, run, tx, today, now, addDays } = D;

const PORT = Number(process.env.PORT || 3000);
const PUBLIC = IS_WORKER ? '' : path.join(__dirname, 'public');
const SESSION_DAYS = 7;
/* Chạy sau Cloudflare (Tunnel/proxy): đặt TRUST_PROXY=1 để lấy IP thật của người dùng và nhận biết HTTPS.
 * PUBLIC_ORIGINS: danh sách địa chỉ công khai được phép gửi yêu cầu ghi dữ liệu, cách nhau bởi dấu phẩy,
 * ví dụ https://smartoffice.vnptninhbinh.com.vn */
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const PUBLIC_ORIGINS = String(process.env.PUBLIC_ORIGINS || '').split(',').map(s => s.trim().replace(/\/+$/, '')).filter(Boolean);
const clientIp = req => (TRUST_PROXY && (req.headers['cf-connecting-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0].trim())) || req.socket.remoteAddress || '';
const isHttps = req => !!req.socket.encrypted || (TRUST_PROXY && String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https');
const cookieAttrs = req => 'HttpOnly; SameSite=Lax; Path=/' + (isHttps(req) ? '; Secure' : '');

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const bad = m => { throw new HttpError(400, m); };
const forbid = (m = 'Bạn không có quyền thực hiện thao tác này.') => { throw new HttpError(403, m); };
const notFound = (m = 'Không tìm thấy dữ liệu.') => { throw new HttpError(404, m); };
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const str = (v, max = 500) => String(v == null ? '' : v).trim().slice(0, max);
const int = v => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : 0; };
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const log = (uid, text) => run('INSERT INTO activity(user_id,text,created_at) VALUES(?,?,?)', uid, text, now());

/* ================= Phân quyền ================= */
const isAdmin = u => u.role === 'admin';
const isHR = u => isAdmin(u) || u.dept_id === D.getSettings().hr_dept_id;
const isDirector = u => u.id === D.getSettings().director_id;
const headOf = uid => { const r = get('SELECT d.head_id h FROM users u JOIN departments d ON d.id=u.dept_id WHERE u.id=?', uid); return r ? r.h : null; };

/* ================= Định tuyến ================= */
const routes = [];
function route(method, pattern, handler, opts = {}) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ method, re, keys, handler, public: !!opts.public, admin: !!opts.admin, raw: !!opts.raw });
}

/* ================= Phiên đăng nhập ================= */
const loginFails = new Map();
function parseCookies(h) { const o = {}; (h || '').split(';').forEach(p => { const i = p.indexOf('='); if (i > 0) o[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); }); return o; }
function userFromReq(req) {
  const tok = parseCookies(req.headers.cookie).sid;
  if (!tok) return null;
  const s = get('SELECT user_id, expires FROM sessions WHERE token=?', tok);
  if (!s || s.expires < now()) return null;
  const u = get('SELECT * FROM users WHERE id=? AND active=1', s.user_id);
  return u || null;
}
let HR2API = { isPayroll: () => false };
let EXTAPI = { canRecruit: () => false, isLead: () => false, badges: () => ({}) };
let WORKAPI = null;
let BIZAPI = { isFinance: () => false, canPost: () => false, canManageAssets: () => false, badges: () => ({}) };
const publicUser = u => u && ({ id: u.id, username: u.username, full_name: u.full_name, title: u.title, dept_id: u.dept_id, role: u.role, email: u.email, phone: u.phone, color: u.color, must_change_pw: !!u.must_change_pw, is_hr: isHR(u), is_director: isDirector(u), is_payroll: HR2API.isPayroll(u), is_finance: BIZAPI.isFinance(u), can_post: BIZAPI.canPost(u), can_assets: BIZAPI.canManageAssets(u), can_recruit: EXTAPI.canRecruit(u), is_lead: EXTAPI.isLead(u) });

route('POST', '/api/login', ({ body, res, req }) => {
  const username = str(body.username, 60), pw = String(body.password || '');
  const key = username.toLowerCase() + '|' + clientIp(req);
  const f = loginFails.get(key);
  if (f && f.until > Date.now()) throw new HttpError(429, 'Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau 5 phút.');
  const u = get('SELECT * FROM users WHERE username=? AND active=1', username);
  if (!u || !D.verifyPw(pw, u.pass_hash)) {
    const n = (f && f.until <= Date.now() ? 0 : (f ? f.n : 0)) + 1;
    loginFails.set(key, { n, until: n >= 5 ? Date.now() + 5 * 60e3 : 0 });
    throw new HttpError(401, 'Tên đăng nhập hoặc mật khẩu không đúng.');
  }
  loginFails.delete(key);
  const tok = crypto.randomBytes(32).toString('hex');
  run('DELETE FROM sessions WHERE expires < ?', now());
  run('INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)', tok, u.id, addDays(today(), SESSION_DAYS) + ' 23:59:59');
  res.setHeader('Set-Cookie', `sid=${tok}; ${cookieAttrs(req)}; Max-Age=${SESSION_DAYS * 86400}`);
  return { user: publicUser(u) };
}, { public: true });

route('POST', '/api/logout', ({ req, res }) => {
  const tok = parseCookies(req.headers.cookie).sid;
  if (tok) run('DELETE FROM sessions WHERE token=?', tok);
  res.setHeader('Set-Cookie', `sid=; ${cookieAttrs(req)}; Max-Age=0`);
  return { ok: true };
}, { public: true });

route('PUT', '/api/me/password', ({ user, body }) => {
  const u = get('SELECT pass_hash FROM users WHERE id=?', user.id);
  if (!D.verifyPw(body.old_password, u.pass_hash)) bad('Mật khẩu hiện tại không đúng.');
  const np = String(body.new_password || '');
  if (np.length < 8 || !/[A-Za-z]/.test(np) || !/\d/.test(np)) bad('Mật khẩu mới phải có tối thiểu 8 ký tự, gồm cả chữ và số.');
  run('UPDATE users SET pass_hash=?, must_change_pw=0 WHERE id=?', D.hashPw(np), user.id);
  return { ok: true };
});

/* ================= Dữ liệu dùng chung ================= */
route('GET', '/api/bootstrap', ({ user }) => {
  const s = D.getSettings();
  return {
    me: publicUser(user),
    settings: s,
    users: all('SELECT id, full_name, title, dept_id, color, role, active FROM users ORDER BY full_name'),
    departments: all('SELECT id, name, head_id FROM departments ORDER BY sort, id'),
    projects: (isAdmin(user) || isDirector(user)) ? all('SELECT id, name, color, owner_id, kind, status FROM projects ORDER BY status=\'closed\', name')
      : all('SELECT p.id, p.name, p.color, p.owner_id, p.kind, p.status FROM projects p JOIN project_members m ON m.project_id=p.id AND m.user_id=? ORDER BY p.status=\'closed\', p.name', user.id),
    counts: counts(user)
  };
});
function counts(user) {
  return {
    inbox: get(`SELECT COUNT(*) n FROM request_steps s JOIN requests r ON r.id=s.request_id WHERE s.approver_id=? AND s.status='pending' AND r.status='pending'`, user.id).n,
    wf: get(`SELECT COUNT(*) n FROM wf_run_steps s JOIN wf_runs r ON r.id=s.run_id WHERE s.assignee_id=? AND s.status='active' AND r.status='running'`, user.id).n,
    tasks: get(`SELECT COUNT(*) n FROM tasks WHERE assignee_id=? AND status NOT IN ('done','failed')`, user.id).n,
    ...BIZAPI.badges(user),
    ...EXTAPI.badges(user)
  };
}

/* ================= Tổng quan ================= */
route('GET', '/api/dashboard', ({ user }) => {
  const T = today();
  const scopeAll = isAdmin(user) || isDirector(user);
  const scopeSql = scopeAll ? '' : ' AND u.dept_id = ' + int(user.dept_id);
  const loads = all(`SELECT u.id, u.full_name, u.color,
      SUM(CASE WHEN t.status NOT IN ('done','failed') THEN 1 ELSE 0 END) open,
      SUM(CASE WHEN t.status NOT IN ('done','failed') AND t.due_date < ? THEN 1 ELSE 0 END) late
    FROM users u JOIN tasks t ON t.assignee_id=u.id WHERE u.active=1 ${scopeSql}
    GROUP BY u.id HAVING open > 0 ORDER BY open DESC, late DESC LIMIT 15`, T);
  const tot = get(`SELECT COUNT(*) n, SUM(status='done') done, SUM(status NOT IN ('done','failed')) open, SUM(status NOT IN ('done','failed') AND due_date < ?) late FROM tasks`, T);
  const mine = all(`SELECT t.*, p.name project_name FROM tasks t LEFT JOIN projects p ON p.id=t.project_id
    WHERE t.assignee_id=? AND t.status NOT IN ('done','failed') ORDER BY t.due_date LIMIT 10`, user.id);
  const inbox = listRequests(user, 'inbox').slice(0, 6);
  const wf = all(`SELECT r.id, r.code, r.title, s.name step_name, s.due_date FROM wf_run_steps s JOIN wf_runs r ON r.id=s.run_id
    WHERE s.assignee_id=? AND s.status='active' AND r.status='running' ORDER BY s.due_date LIMIT 6`, user.id);
  const activity = all('SELECT a.*, u.full_name, u.color FROM activity a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 10');
  const contracts = isHR(user) ? all(`SELECT c.*, u.full_name FROM contracts c JOIN users u ON u.id=c.user_id
    WHERE u.active=1 AND c.end_date IS NOT NULL AND c.end_date BETWEEN ? AND ? AND NOT EXISTS
    (SELECT 1 FROM contracts c2 WHERE c2.user_id=c.user_id AND c2.start_date > c.start_date) ORDER BY c.end_date`, T, addDays(T, 60)) : [];
  return { loads, totals: tot, mine, inbox, wf, activity, contracts, scope: scopeAll ? 'all' : 'dept', counts: counts(user) };
});

/* ================= Dự án, công việc: xem work.js (phân hệ Công việc – Dự án v2) ================= */

/* ================= Phê duyệt đề xuất ================= */
const RTYPES = { thanhtoan: 'Đề nghị thanh toán', mua: 'Đề xuất mua sắm', tamung: 'Đề nghị tạm ứng', nghiphep: 'Đơn xin nghỉ phép', tangca: 'Đăng ký làm thêm giờ', congtac: 'Đề nghị đi công tác', giaitrinh: 'Giải trình chấm công', khac: 'Tờ trình khác' };
const HR_TYPES = ['nghiphep', 'tangca', 'congtac', 'giaitrinh'];
function workDays(from, to) {
  const st = D.getSettings(); let n = 0, d = from;
  for (let i = 0; i < 400 && d <= to; i++) { if (HR2.isWorkday(d, st) && !st.holidays.includes(d)) n++; d = addDays(d, 1); }
  return n;
}
function buildRoute(type, amount, creatorId, days = 0) {
  const s = D.getSettings(), out = [];
  const add = (uid, label) => { if (uid && uid !== creatorId && !out.some(x => x.approver_id === uid) && get('SELECT 1 FROM users WHERE id=? AND active=1', uid)) out.push({ approver_id: uid, label }); };
  add(headOf(creatorId), 'Lãnh đạo phòng');
  if (['nghiphep', 'tangca', 'giaitrinh'].includes(type)) add(s.hr_approver_id, 'Phòng HC–NS');
  else if (type === 'congtac') { if (days > 3) add(s.director_id, 'Giám đốc'); add(s.hr_approver_id, 'Phòng HC–NS'); }
  else { if (amount > s.threshold1) add(s.accountant_id, 'Kế toán trưởng'); if (amount > s.threshold2) add(s.director_id, 'Giám đốc'); }
  if (!out.length) add(s.director_id, 'Giám đốc');
  return out.map(x => Object.assign(x, get('SELECT full_name, color FROM users WHERE id=?', x.approver_id)));
}
function leaveBalance(uid, year) {
  const u = get('SELECT leave_quota FROM users WHERE id=?', uid);
  const used = get(`SELECT COALESCE(SUM(days),0) n FROM requests WHERE creator_id=? AND type='nghiphep' AND status='approved' AND substr(date_from,1,4)=?`, uid, String(year)).n;
  const pending = get(`SELECT COALESCE(SUM(days),0) n FROM requests WHERE creator_id=? AND type='nghiphep' AND status='pending' AND substr(date_from,1,4)=?`, uid, String(year)).n;
  return { quota: u ? u.leave_quota : 12, used, pending, remaining: (u ? u.leave_quota : 12) - used };
}
function listRequests(user, box, q = {}) {
  const w = [], p = [];
  if (box === 'inbox') { w.push(`r.status='pending' AND EXISTS (SELECT 1 FROM request_steps s WHERE s.request_id=r.id AND s.status='pending' AND s.approver_id=?)`); p.push(user.id); }
  else if (box === 'sent') { w.push('r.creator_id=?'); p.push(user.id); }
  else if (box === 'done') { w.push(`EXISTS (SELECT 1 FROM request_steps s WHERE s.request_id=r.id AND s.approver_id=? AND s.status IN ('approved','rejected'))`); p.push(user.id); }
  else if (!(isAdmin(user) || isDirector(user) || isHR(user) && HR_TYPES.includes(q.type))) {
    w.push(`(r.creator_id=? OR EXISTS (SELECT 1 FROM request_steps s WHERE s.request_id=r.id AND s.approver_id=?))`); p.push(user.id, user.id);
  }
  if (q.type) { w.push('r.type=?'); p.push(q.type); }
  if (q.status) { w.push('r.status=?'); p.push(q.status); }
  return all(`SELECT r.*, u.full_name creator_name, u.color creator_color,
      (SELECT s.approver_id FROM request_steps s WHERE s.request_id=r.id AND s.status='pending' LIMIT 1) cur_approver,
      (SELECT s.label FROM request_steps s WHERE s.request_id=r.id AND s.status='pending' LIMIT 1) cur_label
    FROM requests r LEFT JOIN users u ON u.id=r.creator_id ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY r.id DESC LIMIT 500`, ...p);
}
route('GET', '/api/requests', ({ user, query }) => listRequests(user, query.box || 'all', query));
route('GET', '/api/requests/route', ({ user, query }) => {
  const days = isDate(query.from) && isDate(query.to) && query.to >= query.from ? workDays(query.from, query.to) : 0;
  return { steps: buildRoute(query.type, int(query.amount), user.id, days), leave: leaveBalance(user.id, today().slice(0, 4)), days };
});
route('POST', '/api/requests', ({ user, body }) => {
  const type = body.type; if (!RTYPES[type]) bad('Loại đề xuất không hợp lệ.');
  const title = str(body.title, 300); if (!title) bad('Vui lòng nhập trích yếu nội dung.');
  const reason = str(body.reason, 5000); if (!reason) bad('Vui lòng nêu lý do, căn cứ đề xuất.');
  let amount = 0, from = null, to = null, days = 0, hours = 0;
  if (type === 'nghiphep' || type === 'congtac') {
    from = body.date_from; to = body.date_to;
    if (!isDate(from) || !isDate(to) || to < from) bad('Khoảng thời gian không hợp lệ.');
    if (type === 'nghiphep' && body.half_day && from !== to) bad('Nghỉ nửa ngày chỉ chọn trong một ngày.');
    days = type === 'nghiphep' && body.half_day ? 0.5 : workDays(from, to);
    if (!days) bad('Khoảng thời gian đã chọn không có ngày làm việc.');
  } else if (type === 'tangca' || type === 'giaitrinh') {
    from = to = body.date_from; if (!isDate(from)) bad('Vui lòng chọn ngày.');
    if (type === 'tangca') { hours = Number(body.hours); if (!(hours > 0 && hours <= 12)) bad('Số giờ làm thêm phải lớn hơn 0 và không quá 12 giờ/ngày.'); }
    if (type === 'giaitrinh' && from > today()) bad('Chỉ giải trình cho ngày đã qua hoặc hôm nay.');
  } else if (type !== 'khac') { amount = int(String(body.amount).replace(/\D/g, '')); if (amount <= 0) bad('Vui lòng nhập số tiền đề nghị.'); }
  else amount = int(String(body.amount || 0).replace(/\D/g, ''));
  const steps = buildRoute(type, amount, user.id, days);
  const id = tx(() => {
    const y = today().slice(0, 4);
    const seq = get(`SELECT COALESCE(MAX(CAST(substr(code,-4) AS INTEGER)),0) n FROM requests WHERE code LIKE ?`, `ĐX-${y}-%`).n + 1;
    let code = `ĐX-${y}-${String(seq).padStart(4, '0')}`;
    while (get('SELECT 1 FROM requests WHERE code=?', code)) code = `ĐX-${y}-${String(int(code.slice(-4)) + 1).padStart(4, '0')}`;
    const status = steps.length ? 'pending' : 'approved';
    const rid = Number(run(`INSERT INTO requests(code,type,title,amount,date_from,date_to,days,hours,reason,creator_id,status,created_at,closed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      code, type, title, amount, from, to, days, hours, reason, user.id, status, now(), status === 'approved' ? now() : null).lastInsertRowid);
    steps.forEach((s, i) => run('INSERT INTO request_steps(request_id,seq,approver_id,label,status) VALUES(?,?,?,?,?)', rid, i + 1, s.approver_id, s.label, i === 0 ? 'pending' : 'waiting'));
    return rid;
  });
  log(user.id, `gửi đề xuất <b>${esc(title)}</b>`);
  return requestFull(id, user);
});
function requestFull(id, user) {
  const r = get('SELECT r.*, u.full_name creator_name, u.color creator_color, u.dept_id creator_dept FROM requests r LEFT JOIN users u ON u.id=r.creator_id WHERE r.id=?', id) || notFound('Đề xuất không tồn tại.');
  r.steps = all('SELECT s.*, u.full_name, u.color FROM request_steps s LEFT JOIN users u ON u.id=s.approver_id WHERE request_id=? ORDER BY seq', id);
  const involved = r.creator_id === user.id || r.steps.some(s => s.approver_id === user.id);
  if (!involved && !isAdmin(user) && !isDirector(user) && !(isHR(user) && HR_TYPES.includes(r.type))) forbid('Bạn không có quyền xem đề xuất này.');
  const cur = r.steps.find(s => s.status === 'pending');
  r.can_act = r.status === 'pending' && cur && cur.approver_id === user.id;
  r.can_withdraw = r.status === 'pending' && r.creator_id === user.id && !r.steps.some(s => s.status === 'approved');
  if (r.type === 'nghiphep') r.leave = leaveBalance(r.creator_id, (r.date_from || today()).slice(0, 4));
  return r;
}
route('GET', '/api/requests/:id', ({ user, params }) => requestFull(int(params.id), user));
route('POST', '/api/requests/:id/:action', ({ user, params, body }) => {
  const r = requestFull(int(params.id), user), act = params.action, note = str(body.note, 2000);
  if (act === 'withdraw') {
    if (!r.can_withdraw) forbid('Chỉ người gửi được thu hồi khi đề xuất chưa được duyệt bước nào.');
    tx(() => { run(`UPDATE requests SET status='withdrawn', closed_at=? WHERE id=?`, now(), r.id); run(`UPDATE request_steps SET status='skipped' WHERE request_id=? AND status IN ('pending','waiting')`, r.id); });
    log(user.id, `thu hồi đề xuất <b>${esc(r.title)}</b>`);
    return requestFull(r.id, user);
  }
  if (!['approve', 'reject'].includes(act)) notFound();
  if (!r.can_act) forbid('Đề xuất không ở bước chờ bạn xử lý.');
  if (act === 'reject' && !note) bad('Vui lòng ghi rõ lý do từ chối.');
  const cur = r.steps.find(s => s.status === 'pending');
  tx(() => {
    run('UPDATE request_steps SET status=?, note=?, acted_at=? WHERE id=?', act === 'approve' ? 'approved' : 'rejected', note, now(), cur.id);
    if (act === 'approve') {
      const nx = r.steps.find(s => s.status === 'waiting');
      if (nx) run(`UPDATE request_steps SET status='pending' WHERE id=?`, nx.id);
      else run(`UPDATE requests SET status='approved', closed_at=? WHERE id=?`, now(), r.id);
    } else {
      run(`UPDATE requests SET status='rejected', closed_at=? WHERE id=?`, now(), r.id);
      run(`UPDATE request_steps SET status='skipped' WHERE request_id=? AND status='waiting'`, r.id);
    }
  });
  log(user.id, `${act === 'approve' ? 'duyệt' : 'từ chối'} đề xuất <b>${esc(r.title)}</b>`);
  return requestFull(r.id, user);
});

/* ================= Quy trình ================= */
function templateFull(id) {
  const t = get('SELECT * FROM wf_templates WHERE id=?', id) || notFound('Mẫu quy trình không tồn tại.');
  t.steps = all('SELECT s.*, u.full_name FROM wf_template_steps s LEFT JOIN users u ON u.id=s.assignee_id WHERE template_id=? ORDER BY seq', id);
  return t;
}
route('GET', '/api/wf/templates', () => all('SELECT * FROM wf_templates ORDER BY active DESC, id').map(t => templateFull(t.id)));
function saveTemplate(body, id) {
  const name = str(body.name, 200); if (!name) bad('Vui lòng nhập tên quy trình.');
  const steps = (Array.isArray(body.steps) ? body.steps : []).map(s => ({ name: str(s.name, 300), assignee_id: int(s.assignee_id), duration_days: Math.max(1, Math.min(365, int(s.duration_days) || 1)) })).filter(s => s.name);
  if (steps.length < 2) bad('Quy trình phải có tối thiểu 02 bước.');
  for (const s of steps) if (!get('SELECT 1 FROM users WHERE id=? AND active=1', s.assignee_id)) bad(`Bước “${s.name}” chưa có người phụ trách hợp lệ.`);
  return tx(() => {
    if (id) { run('UPDATE wf_templates SET name=?, description=?, active=? WHERE id=?', name, str(body.description, 1000), body.active === false ? 0 : 1, id); run('DELETE FROM wf_template_steps WHERE template_id=?', id); }
    else id = Number(run('INSERT INTO wf_templates(name,description,created_at) VALUES(?,?,?)', name, str(body.description, 1000), now()).lastInsertRowid);
    steps.forEach((s, i) => run('INSERT INTO wf_template_steps(template_id,seq,name,assignee_id,duration_days) VALUES(?,?,?,?,?)', id, i + 1, s.name, s.assignee_id, s.duration_days));
    return templateFull(id);
  });
}
route('POST', '/api/wf/templates', ({ body }) => saveTemplate(body), { admin: true });
route('PUT', '/api/wf/templates/:id', ({ params, body }) => { templateFull(int(params.id)); return saveTemplate(body, int(params.id)); }, { admin: true });
route('DELETE', '/api/wf/templates/:id', ({ params }) => { run('UPDATE wf_templates SET active=0 WHERE id=?', int(params.id)); return { ok: true }; }, { admin: true });

function runFull(id, user) {
  const r = get('SELECT r.*, u.full_name creator_name, u.color creator_color FROM wf_runs r LEFT JOIN users u ON u.id=r.creator_id WHERE r.id=?', id) || notFound('Quy trình không tồn tại.');
  r.steps = all('SELECT s.*, u.full_name, u.color FROM wf_run_steps s LEFT JOIN users u ON u.id=s.assignee_id WHERE run_id=? ORDER BY seq', id);
  r.logs = all('SELECT l.*, u.full_name, u.color FROM wf_logs l LEFT JOIN users u ON u.id=l.user_id WHERE run_id=? ORDER BY l.id', id);
  const cur = r.steps.find(s => s.status === 'active');
  r.current = cur || null;
  r.can_act = r.status === 'running' && cur && (cur.assignee_id === user.id || isAdmin(user));
  r.can_cancel = r.status === 'running' && (r.creator_id === user.id || isAdmin(user));
  return r;
}
route('GET', '/api/wf/runs', ({ user, query }) => {
  const box = query.box || 'mine', w = [], p = [];
  if (box === 'mine') { w.push(`r.status='running' AND EXISTS (SELECT 1 FROM wf_run_steps s WHERE s.run_id=r.id AND s.status='active' AND s.assignee_id=?)`); p.push(user.id); }
  else if (box === 'involved') { w.push(`(r.creator_id=? OR EXISTS (SELECT 1 FROM wf_run_steps s WHERE s.run_id=r.id AND s.assignee_id=?))`); p.push(user.id, user.id); }
  if (query.status) { w.push('r.status=?'); p.push(query.status); }
  return all(`SELECT r.*, u.full_name creator_name, u.color creator_color,
      (SELECT COUNT(*) FROM wf_run_steps s WHERE s.run_id=r.id) total_steps,
      (SELECT COUNT(*) FROM wf_run_steps s WHERE s.run_id=r.id AND s.status='done') done_steps,
      (SELECT s.name FROM wf_run_steps s WHERE s.run_id=r.id AND s.status='active') cur_step,
      (SELECT s.assignee_id FROM wf_run_steps s WHERE s.run_id=r.id AND s.status='active') cur_assignee,
      (SELECT s.due_date FROM wf_run_steps s WHERE s.run_id=r.id AND s.status='active') cur_due
    FROM wf_runs r LEFT JOIN users u ON u.id=r.creator_id ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY r.id DESC LIMIT 500`, ...p);
});
route('GET', '/api/wf/runs/:id', ({ user, params }) => runFull(int(params.id), user));
route('POST', '/api/wf/runs', ({ user, body }) => {
  const tpl = templateFull(int(body.template_id)); if (!tpl.active) bad('Mẫu quy trình đã ngừng sử dụng.');
  const title = str(body.title, 300); if (!title) bad('Vui lòng nhập trích yếu / tên hồ sơ.');
  const over = body.assignees || {};
  const id = tx(() => {
    const y = today().slice(0, 4);
    const seq = get(`SELECT COALESCE(MAX(CAST(substr(code,-4) AS INTEGER)),0) n FROM wf_runs WHERE code LIKE ?`, `QT-${y}-%`).n + 1;
    const rid = Number(run('INSERT INTO wf_runs(code,template_id,template_name,title,note,creator_id,status,created_at) VALUES(?,?,?,?,?,?,?,?)',
      `QT-${y}-${String(seq).padStart(4, '0')}`, tpl.id, tpl.name, title, str(body.note, 3000), user.id, 'running', now()).lastInsertRowid);
    tpl.steps.forEach((s, i) => {
      let a = int(over[s.seq]) || s.assignee_id;
      if (!get('SELECT 1 FROM users WHERE id=? AND active=1', a)) a = s.assignee_id;
      run('INSERT INTO wf_run_steps(run_id,seq,name,assignee_id,duration_days,due_date,status) VALUES(?,?,?,?,?,?,?)', rid, s.seq, s.name, a, s.duration_days, i === 0 ? addDays(today(), s.duration_days) : null, i === 0 ? 'active' : 'waiting');
    });
    run('INSERT INTO wf_logs(run_id,user_id,action,step_name,note,created_at) VALUES(?,?,?,?,?,?)', rid, user.id, 'start', '', 'Khởi tạo quy trình', now());
    return rid;
  });
  log(user.id, `khởi tạo quy trình <b>${esc(title)}</b>`);
  return runFull(id, user);
});
route('POST', '/api/wf/runs/:id/:action', ({ user, params, body }) => {
  const r = runFull(int(params.id), user), act = params.action, note = str(body.note, 2000);
  if (act === 'cancel') {
    if (!r.can_cancel) forbid();
    if (!note) bad('Vui lòng ghi lý do hủy.');
    tx(() => { run(`UPDATE wf_runs SET status='cancelled', closed_at=? WHERE id=?`, now(), r.id); run('INSERT INTO wf_logs(run_id,user_id,action,step_name,note,created_at) VALUES(?,?,?,?,?,?)', r.id, user.id, 'cancel', '', note, now()); });
    log(user.id, `hủy quy trình <b>${esc(r.title)}</b>`);
    return runFull(r.id, user);
  }
  if (!r.can_act) forbid('Bước hiện tại không do bạn phụ trách.');
  const cur = r.current;
  if (act === 'complete') {
    tx(() => {
      run(`UPDATE wf_run_steps SET status='done', done_at=? WHERE id=?`, now(), cur.id);
      const nx = r.steps.find(s => s.seq > cur.seq);
      if (nx) run(`UPDATE wf_run_steps SET status='active', due_date=?, done_at=NULL WHERE id=?`, addDays(today(), nx.duration_days), nx.id);
      else run(`UPDATE wf_runs SET status='done', closed_at=? WHERE id=?`, now(), r.id);
      run('INSERT INTO wf_logs(run_id,user_id,action,step_name,note,created_at) VALUES(?,?,?,?,?,?)', r.id, user.id, 'complete', cur.name, note, now());
    });
    log(user.id, `hoàn thành bước <b>${esc(cur.name)}</b>`);
  } else if (act === 'return') {
    const prev = [...r.steps].reverse().find(s => s.seq < cur.seq);
    if (!prev) bad('Đây là bước đầu tiên, không thể trả lại.');
    if (!note) bad('Vui lòng ghi rõ lý do trả lại.');
    tx(() => {
      run(`UPDATE wf_run_steps SET status='waiting', due_date=NULL WHERE id=?`, cur.id);
      run(`UPDATE wf_run_steps SET status='active', due_date=?, done_at=NULL WHERE id=?`, addDays(today(), prev.duration_days), prev.id);
      run('INSERT INTO wf_logs(run_id,user_id,action,step_name,note,created_at) VALUES(?,?,?,?,?,?)', r.id, user.id, 'return', cur.name, note, now());
    });
    log(user.id, `trả lại bước <b>${esc(prev.name)}</b>`);
  } else notFound();
  return runFull(r.id, user);
});

/* ================= Nhân sự ================= */
const PROFILE_PRIVATE = ['dob', 'gender', 'address', 'join_date', 'leave_quota'];
route('GET', '/api/hr/employees', ({ user, query }) => {
  const w = ['1=1'], p = [];
  if (query.active !== 'all') w.push('u.active=1');
  if (query.dept) { w.push('u.dept_id=?'); p.push(int(query.dept)); }
  if (query.q) { w.push('(u.full_name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)'); const q = '%' + str(query.q, 80) + '%'; p.push(q, q, q); }
  const rows = all(`SELECT u.id, u.username, u.full_name, u.title, u.dept_id, u.email, u.phone, u.color, u.role, u.active, u.join_date, u.dob, u.gender, u.leave_quota,
      (SELECT COUNT(*) FROM tasks t WHERE t.assignee_id=u.id AND t.status NOT IN ('done','failed')) open_tasks,
      (SELECT COUNT(*) FROM tasks t WHERE t.assignee_id=u.id AND t.status NOT IN ('done','failed') AND t.due_date < ?) late_tasks,
      (SELECT c.end_date FROM contracts c WHERE c.user_id=u.id ORDER BY c.start_date DESC LIMIT 1) contract_end,
      (SELECT c.type FROM contracts c WHERE c.user_id=u.id ORDER BY c.start_date DESC LIMIT 1) contract_type
    FROM users u WHERE ${w.join(' AND ')} ORDER BY u.full_name`, today(), ...p);
  if (!isHR(user)) rows.forEach(r => { PROFILE_PRIVATE.concat(['contract_end', 'contract_type', 'username']).forEach(k => delete r[k]); });
  return rows;
});
route('GET', '/api/hr/employees/:id', ({ user, params }) => {
  const id = int(params.id);
  const u = get('SELECT id, username, full_name, title, dept_id, email, phone, dob, gender, address, join_date, leave_quota, color, role, active FROM users WHERE id=?', id) || notFound();
  const full = isHR(user) || user.id === id;
  if (!full) { PROFILE_PRIVATE.concat(['username']).forEach(k => delete u[k]); return { profile: u, full: false }; }
  const y = today().slice(0, 4);
  return {
    profile: u, full: true, can_edit: isHR(user),
    contracts: all('SELECT * FROM contracts WHERE user_id=? ORDER BY start_date DESC', id),
    leave: leaveBalance(id, y),
    leaves: all(`SELECT id, code, title, date_from, date_to, days, status FROM requests WHERE creator_id=? AND type='nghiphep' AND substr(date_from,1,4)=? ORDER BY date_from DESC`, id, y)
  };
});
route('PUT', '/api/hr/employees/:id', ({ user, params, body }) => {
  if (!isHR(user)) forbid('Chỉ cán bộ Phòng Hành chính – Nhân sự được cập nhật hồ sơ.');
  const u = get('SELECT * FROM users WHERE id=?', params.id) || notFound();
  const v = k => body[k] === undefined ? u[k] : body[k];
  const full = str(v('full_name'), 120); if (!full) bad('Họ và tên không được để trống.');
  for (const k of ['dob', 'join_date']) if (v(k) && !isDate(v(k))) bad('Ngày tháng không hợp lệ.');
  if (!get('SELECT 1 FROM departments WHERE id=?', int(v('dept_id')))) bad('Phòng ban không hợp lệ.');
  run(`UPDATE users SET full_name=?, title=?, dept_id=?, email=?, phone=?, dob=?, gender=?, address=?, join_date=?, leave_quota=? WHERE id=?`,
    full, str(v('title'), 120), int(v('dept_id')), str(v('email'), 120), str(v('phone'), 30), v('dob') || null, str(v('gender'), 10), str(v('address'), 300), v('join_date') || null, Math.max(0, Math.min(60, int(v('leave_quota')))), u.id);
  log(user.id, `cập nhật hồ sơ nhân sự <b>${esc(full)}</b>`);
  return { ok: true };
});
route('POST', '/api/hr/contracts', ({ user, body }) => {
  if (!isHR(user)) forbid();
  const uid = int(body.user_id); if (!get('SELECT 1 FROM users WHERE id=?', uid)) bad('Nhân sự không hợp lệ.');
  if (!str(body.number) || !str(body.type)) bad('Vui lòng nhập số hợp đồng và loại hợp đồng.');
  if (!isDate(body.start_date) || (body.end_date && !isDate(body.end_date))) bad('Ngày hiệu lực không hợp lệ.');
  if (body.end_date && body.end_date < body.start_date) bad('Ngày hết hạn phải sau ngày hiệu lực.');
  run('INSERT INTO contracts(user_id,number,type,start_date,end_date,note,created_at) VALUES(?,?,?,?,?,?,?)', uid, str(body.number, 60), str(body.type, 120), body.start_date, body.end_date || null, str(body.note, 500), now());
  return { ok: true };
});
route('DELETE', '/api/hr/contracts/:id', ({ user, params }) => { if (!isHR(user)) forbid(); run('DELETE FROM contracts WHERE id=?', int(params.id)); return { ok: true }; });

/* ================= Mục tiêu – KPI ================= */
route('GET', '/api/goals/cycles', () => all('SELECT * FROM goal_cycles ORDER BY start_date DESC'));
route('POST', '/api/goals/cycles', ({ body }) => {
  const name = str(body.name, 80); if (!name) bad('Vui lòng nhập tên chu kỳ.');
  if (!isDate(body.start_date) || !isDate(body.end_date) || body.end_date < body.start_date) bad('Thời gian chu kỳ không hợp lệ.');
  return { id: Number(run('INSERT INTO goal_cycles(name,start_date,end_date) VALUES(?,?,?)', name, body.start_date, body.end_date).lastInsertRowid) };
}, { admin: true });
/* Kỳ mặc định: kỳ chứa ngày hôm nay; nếu không có thì kỳ gần nhất đã bắt đầu; cuối cùng là kỳ bất kỳ mới nhất.
 * (Sửa lỗi 06/11/2026: trước đây chọn kỳ có ngày bắt đầu muộn nhất, kể cả kỳ tương lai chưa có mục tiêu.) */
function currentCycleId() {
  const T = today();
  return (get('SELECT id FROM goal_cycles WHERE start_date<=? AND end_date>=? ORDER BY start_date DESC LIMIT 1', T, T)
    || get('SELECT id FROM goal_cycles WHERE start_date<=? ORDER BY start_date DESC LIMIT 1', T)
    || get('SELECT id FROM goal_cycles ORDER BY start_date DESC LIMIT 1') || {}).id;
}
function goalTree(cycleId) {
  const rows = all(`SELECT g.*, u.full_name owner_name, u.color owner_color, d.name dept_name FROM goals g
    LEFT JOIN users u ON u.id=g.owner_id LEFT JOIN departments d ON d.id=g.dept_id WHERE cycle_id=? ORDER BY g.id`, cycleId);
  const by = new Map(rows.map(r => [r.id, Object.assign(r, { children: [] })]));
  const roots = [];
  for (const r of rows) (r.parent_id && by.get(r.parent_id) ? by.get(r.parent_id).children : roots).push(r);
  const calc = g => {
    g.children.forEach(calc);
    const own = g.target ? Math.max(0, Math.min(100, g.current / g.target * 100)) : 0;
    if (g.children.length) { const w = g.children.reduce((s, c) => s + (c.weight || 1), 0); g.progress = g.children.reduce((s, c) => s + c.progress * (c.weight || 1), 0) / w; }
    else g.progress = own;
    g.own_progress = own;
    g.progress = Math.round(g.progress * 10) / 10;
  };
  roots.forEach(calc);
  return roots;
}
const canEditGoal = (u, g) => isAdmin(u) || isDirector(u) || g.owner_id === u.id || (g.dept_id && get('SELECT head_id h FROM departments WHERE id=?', g.dept_id)?.h === u.id);
route('GET', '/api/goals', ({ user, query }) => {
  const cyc = int(query.cycle) || currentCycleId();
  if (!cyc) return { cycle: null, goals: [] };
  const tree = goalTree(cyc);
  const mark = g => { g.can_edit = canEditGoal(user, g); g.children.forEach(mark); };
  tree.forEach(mark);
  return { cycle: get('SELECT * FROM goal_cycles WHERE id=?', cyc), goals: tree };
});
function goalInput(body, user, old = {}) {
  const v = k => body[k] === undefined ? old[k] : body[k];
  const g = { title: str(v('title'), 300), level: v('level'), unit: str(v('unit'), 40), target: Number(v('target')), current: Number(v('current') || 0), weight: Number(v('weight') || 1), owner_id: int(v('owner_id')), dept_id: int(v('dept_id')) || null, parent_id: int(v('parent_id')) || null };
  if (!g.title) bad('Vui lòng nhập nội dung mục tiêu.');
  if (!['company', 'dept', 'user'].includes(g.level)) bad('Cấp mục tiêu không hợp lệ.');
  if (!(g.target > 0)) bad('Chỉ tiêu phải lớn hơn 0.');
  if (!(g.weight > 0)) bad('Trọng số phải lớn hơn 0.');
  if (!get('SELECT 1 FROM users WHERE id=?', g.owner_id)) bad('Người phụ trách không hợp lệ.');
  if (g.level === 'company' && !(isAdmin(user) || isDirector(user))) forbid('Chỉ Giám đốc hoặc quản trị viên được tạo mục tiêu cấp đơn vị.');
  if (g.level !== 'company' && !g.dept_id) g.dept_id = (get('SELECT dept_id FROM users WHERE id=?', g.owner_id) || {}).dept_id || null;
  return g;
}
route('POST', '/api/goals', ({ user, body }) => {
  const cyc = int(body.cycle_id); if (!get('SELECT 1 FROM goal_cycles WHERE id=?', cyc)) bad('Chu kỳ không hợp lệ.');
  const g = goalInput(body, user);
  if (g.parent_id) { const p = get('SELECT * FROM goals WHERE id=? AND cycle_id=?', g.parent_id, cyc); if (!p) bad('Mục tiêu cấp trên không hợp lệ.'); }
  if (g.level === 'dept' && !(isAdmin(user) || isDirector(user) || get('SELECT head_id h FROM departments WHERE id=?', g.dept_id)?.h === user.id)) forbid('Chỉ lãnh đạo phòng được giao mục tiêu cấp phòng.');
  const id = Number(run('INSERT INTO goals(cycle_id,parent_id,level,dept_id,owner_id,title,unit,target,current,weight,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
    cyc, g.parent_id, g.level, g.dept_id, g.owner_id, g.title, g.unit, g.target, g.current, g.weight, user.id, now()).lastInsertRowid);
  log(user.id, `đặt mục tiêu <b>${esc(g.title)}</b>`);
  return { id };
});
route('PUT', '/api/goals/:id', ({ user, params, body }) => {
  const old = get('SELECT * FROM goals WHERE id=?', params.id) || notFound();
  if (!canEditGoal(user, old)) forbid();
  const g = goalInput(body, user, old);
  if (g.parent_id === old.id) bad('Mục tiêu cấp trên không hợp lệ.');
  run('UPDATE goals SET parent_id=?,level=?,dept_id=?,owner_id=?,title=?,unit=?,target=?,weight=? WHERE id=?', g.parent_id, g.level, g.dept_id, g.owner_id, g.title, g.unit, g.target, g.weight, old.id);
  return { ok: true };
});
route('DELETE', '/api/goals/:id', ({ user, params }) => {
  const g = get('SELECT * FROM goals WHERE id=?', params.id) || notFound();
  if (!canEditGoal(user, g)) forbid();
  tx(() => { run('UPDATE goals SET parent_id=? WHERE parent_id=?', g.parent_id, g.id); run('DELETE FROM goals WHERE id=?', g.id); });
  return { ok: true };
});
route('GET', '/api/goals/:id/updates', ({ params }) => all('SELECT gu.*, u.full_name, u.color FROM goal_updates gu LEFT JOIN users u ON u.id=gu.user_id WHERE goal_id=? ORDER BY gu.id DESC', int(params.id)));
route('POST', '/api/goals/:id/updates', ({ user, params, body }) => {
  const g = get('SELECT * FROM goals WHERE id=?', params.id) || notFound();
  if (!canEditGoal(user, g)) forbid('Chỉ người phụ trách hoặc lãnh đạo phòng được cập nhật kết quả.');
  const v = Number(body.value); if (!Number.isFinite(v) || v < 0) bad('Kết quả thực hiện không hợp lệ.');
  tx(() => { run('UPDATE goals SET current=? WHERE id=?', v, g.id); run('INSERT INTO goal_updates(goal_id,user_id,value,note,created_at) VALUES(?,?,?,?,?)', g.id, user.id, v, str(body.note, 1000), now()); });
  log(user.id, `cập nhật kết quả mục tiêu <b>${esc(g.title)}</b>`);
  return { ok: true };
});

/* ================= Quản trị ================= */
route('GET', '/api/admin/users', () => all(`SELECT id, username, full_name, title, dept_id, role, email, phone, active, must_change_pw, created_at FROM users ORDER BY active DESC, full_name`), { admin: true });
route('POST', '/api/admin/users', ({ user, body }) => {
  const username = str(body.username, 60).toLowerCase();
  if (!/^[a-z0-9._-]{3,60}$/.test(username)) bad('Tên đăng nhập 3–60 ký tự, chỉ gồm chữ thường không dấu, số và các ký tự . _ -');
  if (get('SELECT 1 FROM users WHERE username=?', username)) bad('Tên đăng nhập đã tồn tại.');
  const full = str(body.full_name, 120); if (!full) bad('Vui lòng nhập họ và tên.');
  if (!get('SELECT 1 FROM departments WHERE id=?', int(body.dept_id))) bad('Vui lòng chọn phòng ban.');
  const pw = String(body.password || '');
  if (pw.length < 8) bad('Mật khẩu khởi tạo tối thiểu 8 ký tự.');
  const n = get('SELECT COUNT(*) n FROM users').n;
  const id = Number(run(`INSERT INTO users(username,pass_hash,full_name,title,dept_id,role,email,phone,join_date,color,must_change_pw,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,1,?)`,
    username, D.hashPw(pw), full, str(body.title, 120), int(body.dept_id), body.role === 'admin' ? 'admin' : 'user', str(body.email, 120), str(body.phone, 30), today(), D.COLORS[n % D.COLORS.length], now()).lastInsertRowid);
  log(user.id, `tạo tài khoản <b>${esc(full)}</b>`);
  return { id };
}, { admin: true });
route('POST', '/api/admin/users/import', ({ user, body }) => {
  const rows = Array.isArray(body.rows) ? body.rows : []; if (!rows.length) bad('Không có dữ liệu để nhập.');
  if (rows.length > 2000) bad('Mỗi lần nhập tối đa 2.000 dòng.');
  const pw = String(body.password || ''); if (pw.length < 8) bad('Mật khẩu khởi tạo tối thiểu 8 ký tự.');
  const deps = new Map(all('SELECT id, name FROM departments').map(d => [d.name.toLowerCase().trim(), d.id]));
  const hash = D.hashPw(pw), errors = []; let ok = 0;
  tx(() => rows.forEach((r, i) => {
    const line = i + 2, username = str(r.username, 60).toLowerCase(), full = str(r.full_name, 120);
    if (!/^[a-z0-9._-]{3,60}$/.test(username)) return errors.push(`Dòng ${line}: tên đăng nhập không hợp lệ`);
    if (!full) return errors.push(`Dòng ${line}: thiếu họ tên`);
    if (get('SELECT 1 FROM users WHERE username=?', username)) return errors.push(`Dòng ${line}: tên đăng nhập “${username}” đã tồn tại`);
    let dep = deps.get(str(r.department).toLowerCase());
    if (!dep && str(r.department)) { dep = Number(run('INSERT INTO departments(name) VALUES(?)', str(r.department, 120)).lastInsertRowid); deps.set(str(r.department).toLowerCase(), dep); }
    if (!dep) return errors.push(`Dòng ${line}: thiếu phòng ban`);
    run(`INSERT INTO users(username,pass_hash,full_name,title,dept_id,email,phone,color,must_change_pw,created_at) VALUES(?,?,?,?,?,?,?,?,1,?)`,
      username, hash, full, str(r.title, 120), dep, str(r.email, 120), str(r.phone, 30), D.COLORS[(ok + i) % D.COLORS.length], now());
    ok++;
  }));
  log(user.id, `nhập ${ok} tài khoản từ tệp`);
  return { ok, errors };
}, { admin: true });
route('PUT', '/api/admin/users/:id', ({ user, params, body }) => {
  const u = get('SELECT * FROM users WHERE id=?', params.id) || notFound();
  if (u.id === user.id && (body.active === false || body.role === 'user')) bad('Không thể tự khóa hoặc tự hạ quyền tài khoản đang đăng nhập.');
  if (body.dept_id !== undefined && !get('SELECT 1 FROM departments WHERE id=?', int(body.dept_id))) bad('Phòng ban không hợp lệ.');
  run('UPDATE users SET full_name=?, title=?, dept_id=?, role=?, email=?, phone=?, active=? WHERE id=?',
    str(body.full_name ?? u.full_name, 120) || u.full_name, str(body.title ?? u.title, 120), int(body.dept_id ?? u.dept_id),
    (body.role ?? u.role) === 'admin' ? 'admin' : 'user', str(body.email ?? u.email, 120), str(body.phone ?? u.phone, 30), (body.active ?? !!u.active) ? 1 : 0, u.id);
  if (body.active === false) run('DELETE FROM sessions WHERE user_id=?', u.id);
  if (body.password) {
    if (String(body.password).length < 8) bad('Mật khẩu tối thiểu 8 ký tự.');
    run('UPDATE users SET pass_hash=?, must_change_pw=1 WHERE id=?', D.hashPw(body.password), u.id);
    run('DELETE FROM sessions WHERE user_id=?', u.id);
  }
  return { ok: true };
}, { admin: true });
route('POST', '/api/admin/departments', ({ body }) => {
  const name = str(body.name, 120); if (!name) bad('Vui lòng nhập tên phòng ban.');
  return { id: Number(run('INSERT INTO departments(name, head_id) VALUES(?,?)', name, int(body.head_id) || null).lastInsertRowid) };
}, { admin: true });
route('PUT', '/api/admin/departments/:id', ({ params, body }) => {
  const d = get('SELECT * FROM departments WHERE id=?', params.id) || notFound();
  run('UPDATE departments SET name=?, head_id=? WHERE id=?', str(body.name, 120) || d.name, int(body.head_id) || null, d.id);
  return { ok: true };
}, { admin: true });
route('DELETE', '/api/admin/departments/:id', ({ params }) => {
  if (get('SELECT 1 FROM users WHERE dept_id=?', int(params.id))) bad('Phòng ban còn nhân sự, cần chuyển nhân sự sang đơn vị khác trước khi xóa.');
  run('DELETE FROM departments WHERE id=?', int(params.id)); return { ok: true };
}, { admin: true });
route('PUT', '/api/admin/settings', ({ body }) => {
  const t1 = int(body.threshold1), t2 = int(body.threshold2);
  if (t1 < 0 || t2 < t1) bad('Ngưỡng 2 phải lớn hơn hoặc bằng ngưỡng 1.');
  for (const k of ['accountant_id', 'director_id', 'hr_approver_id']) if (!get('SELECT 1 FROM users WHERE id=? AND active=1', int(body[k]))) bad('Vui lòng chọn đủ người duyệt hợp lệ.');
  D.setSetting('org_name', str(body.org_name, 200) || 'Đơn vị của tôi');
  D.setSetting('threshold1', t1); D.setSetting('threshold2', t2);
  for (const k of ['accountant_id', 'director_id', 'hr_approver_id', 'hr_dept_id']) D.setSetting(k, int(body[k]));
  return D.getSettings();
}, { admin: true });
route('GET', '/api/admin/backup', ({ res }) => {
  if (IS_WORKER) bad('Trên Cloudflare, dữ liệu được Durable Objects sao lưu tự động và có thể khôi phục về thời điểm bất kỳ trong 30 ngày gần nhất. Liên hệ đơn vị cung cấp dịch vụ khi cần khôi phục.');
  const f = path.join(path.dirname(D.DB_FILE), `sao-luu-${today()}-${Date.now()}.db`);
  D.db.exec(`VACUUM INTO '${f.replace(/'/g, "''")}'`);
  res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="smartoffice-sao-luu-${today()}.db"` });
  fs.createReadStream(f).on('end', () => fs.unlink(f, () => {})).pipe(res);
}, { admin: true, raw: true });

/* ================= Xuất báo cáo CSV (mở bằng Excel) ================= */
const csv = rows => '﻿' + rows.map(r => r.map(v => { const s = String(v == null ? '' : v); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',')).join('\r\n');
const fmtD = s => s ? String(s).slice(0, 10).split('-').reverse().join('/') : '';
const LBL = { ...RTYPES, todo: 'Cần làm', doing: 'Đang làm', review: 'Chờ kiểm tra', done: 'Hoàn thành', cao: 'Cao', tb: 'Trung bình', thap: 'Thấp', pending: 'Đang chờ duyệt', approved: 'Đã duyệt', rejected: 'Từ chối', withdrawn: 'Đã thu hồi' };
route('GET', '/api/export/tasks.csv', ({ user, res }) => {
  const T = today();
  const own = isAdmin(user) || isDirector(user);
  const rows = all(`SELECT t.*, p.name pn, u.full_name an, d.name dn FROM tasks t LEFT JOIN projects p ON p.id=t.project_id LEFT JOIN users u ON u.id=t.assignee_id LEFT JOIN departments d ON d.id=u.dept_id ${own ? '' : 'WHERE t.assignee_id=? OR t.creator_id=?'} ORDER BY p.name, t.due_date`, ...(own ? [] : [user.id, user.id]));
  const out = [['STT', 'Dự án', 'Công việc', 'Người thực hiện', 'Phòng ban', 'Ngày bắt đầu', 'Hạn hoàn thành', 'Ngày hoàn thành', 'Mức ưu tiên', 'Trạng thái', 'Quá hạn (ngày)']]
    .concat(rows.map((t, i) => [i + 1, t.pn, t.title, t.an, t.dn, fmtD(t.start_date), fmtD(t.due_date), fmtD(t.done_at), LBL[t.priority], LBL[t.status],
      t.status !== 'done' && t.due_date < T ? Math.round((Date.parse(T) - Date.parse(t.due_date)) / 864e5) : '']));
  res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="bao-cao-cong-viec-${T}.csv"` });
  res.end(csv(out));
}, { raw: true });
route('GET', '/api/export/requests.csv', ({ user, res }) => {
  const rows = listRequests(user, 'all');
  const out = [['STT', 'Số đề xuất', 'Loại', 'Trích yếu', 'Người đề xuất', 'Ngày gửi', 'Số tiền (đồng)', 'Từ ngày', 'Đến ngày', 'Số ngày', 'Số giờ', 'Tình trạng']]
    .concat(rows.map((r, i) => [i + 1, r.code, RTYPES[r.type], r.title, r.creator_name, fmtD(r.created_at), r.amount || '', fmtD(r.date_from), fmtD(r.date_to), r.days || '', r.hours || '', LBL[r.status]]));
  res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="so-theo-doi-de-xuat-${today()}.csv"` });
  res.end(csv(out));
}, { raw: true });

/* ================= Chấm công, Tiền lương ================= */
HR2API = HR2.register({ route, bad, forbid, notFound, isAdmin, isHR, isDirector, log, esc, str, int, isDate, HttpError });

EXTAPI = EXT.register({ route, bad, forbid, notFound, isAdmin, isHR, isDirector, log, esc, str, int, isDate });
WORKAPI = WORK.register({ route, bad, forbid, notFound, isAdmin, isDirector, log, esc, str, int, isDate });
BIZAPI = BIZ.register({ route, bad, forbid, notFound, isAdmin, isHR, isDirector, log, esc, str, int, isDate });

/* ================= Máy chủ HTTP ================= */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };
function securityHeaders(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self), payment=()');
  if (isHttps(req)) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
}
function originAllowed(req) {
  const o = req.headers.origin;
  if (!o) return true;
  let u; try { u = new URL(o); } catch (e) { return false; }
  if (PUBLIC_ORIGINS.includes(u.origin)) return true;
  const host = (TRUST_PROXY && req.headers['x-forwarded-host']) || req.headers.host;
  return u.host === host;
}
function sendStatic(req, res, pathname) {
  let p = path.normalize(decodeURIComponent(pathname)).replace(/^([\\/])+/, '');
  if (/(^|[\\/])[_.]/.test(p)) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Không tìm thấy.'); }
  if (!p || p.endsWith(path.sep)) p = 'index.html';
  let file = path.join(PUBLIC, p);
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    if (path.extname(p) && !p.endsWith('.html')) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Không tìm thấy.'); }
    file = path.join(PUBLIC, 'index.html');
  }
  const h = { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' };
  if (p === 'sw.js') { h['Service-Worker-Allowed'] = '/'; h['Cache-Control'] = 'no-cache, no-store, must-revalidate'; }
  else if (p.startsWith('icons' + path.sep) || p.startsWith('icons/')) h['Cache-Control'] = 'public, max-age=604800';
  res.writeHead(200, h);
  fs.createReadStream(file).pipe(res);
}
function readBody(req, limit = 5e6) {
  if (req.rawBody !== undefined) { // Cloudflare: thân yêu cầu đã được đọc sẵn
    const b = req.rawBody;
    if (!b || !b.length) return Promise.resolve({});
    if (b.length > limit) return Promise.reject(new HttpError(413, 'Dữ liệu gửi lên quá lớn.'));
    try { return Promise.resolve(JSON.parse(b.toString('utf8'))); } catch (e) { return Promise.reject(new HttpError(400, 'Dữ liệu không đúng định dạng JSON.')); }
  }
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { reject(new HttpError(413, 'Dữ liệu gửi lên quá lớn.')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { if (!chunks.length) return resolve({}); try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (e) { reject(new HttpError(400, 'Dữ liệu không đúng định dạng JSON.')); } });
    req.on('error', reject);
  });
}
async function handle(req, res) {
  const url = new URL(req.url, 'http://x');
  securityHeaders(req, res);
  if (url.pathname === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' }); return res.end('ok'); }
  if (!url.pathname.startsWith('/api/')) { if (IS_WORKER) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Không tìm thấy.'); } return sendStatic(req, res, url.pathname); }
  const json = (status, obj) => { if (res.headersSent) return; res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
  try {
    let m = null, rt = null;
    for (const r of routes) { if (r.method !== req.method) continue; m = url.pathname.match(r.re); if (m) { rt = r; break; } }
    if (!rt) throw new HttpError(404, 'Không tìm thấy chức năng.');
    if (req.method !== 'GET' && !originAllowed(req)) throw new HttpError(403, 'Yêu cầu không hợp lệ.');
    const user = userFromReq(req);
    if (!rt.public && !user) throw new HttpError(401, 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
    if (rt.admin && !isAdmin(user)) forbid('Chức năng dành cho quản trị viên.');
    const params = {}; rt.keys.forEach((k, i) => params[k] = decodeURIComponent(m[i + 1]));
    const body = ['POST', 'PUT', 'DELETE'].includes(req.method) ? await readBody(req, (url.pathname.startsWith('/api/docs') ? 30e6 : /^\/api\/tasks\/\d+\/files$/.test(url.pathname) ? 15e6 : 5e6)) : {};
    const result = await rt.handler({ req, res, user, params, body, query: Object.fromEntries(url.searchParams) });
    if (!rt.raw) json(200, result === undefined ? { ok: true } : result);
  } catch (e) {
    if (e instanceof HttpError) return json(e.status, { error: e.message });
    console.error(new Date().toISOString(), req.method, req.url, (e && e.message) || String(e), e && e.stack);
    json(500, Object.assign({ error: 'Lỗi hệ thống. Vui lòng thử lại hoặc liên hệ quản trị viên.' }, process.env.SO_DEBUG === '1' ? { detail: String((e && e.stack) || e).slice(0, 600) } : {}));
  }
}

const created = D.init();
HR2.seedExtras();
BIZ.seedBiz();
EXT.seedExt();
WORK.migrate();

/* Cloudflare: đặt lại mật khẩu quản trị ban đầu theo bí mật ADMIN_PASSWORD (chỉ khi tài khoản admin chưa đổi mật khẩu). */
function applyAdminSecret() {
  // Ưu tiên bí mật ADMIN_PASSWORD; nếu không có, dùng mã băm ADMIN_PASSWORD_HASH (chỉ lưu mã băm, không lưu mật khẩu).
  const pw = process.env.ADMIN_PASSWORD, ph = process.env.ADMIN_PASSWORD_HASH;
  if (!pw && !/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/.test(ph || '')) return false;
  const a = get("SELECT id, must_change_pw FROM users WHERE username='admin'");
  if (!a || !a.must_change_pw) return false;
  run('UPDATE users SET pass_hash=? WHERE id=?', pw ? D.hashPw(pw) : ph, a.id);
  return true;
}
module.exports = { handle, applyAdminSecret };

if (!IS_WORKER) {
const http = require('http');
const os = require('os');
const server = http.createServer(handle);
server.listen(PORT, '0.0.0.0', () => {
  const ips = [];
  for (const list of Object.values(os.networkInterfaces())) for (const i of list || []) if (i.family === 'IPv4' && !i.internal) ips.push(i.address);
  console.log('\n  =============================================');
  console.log('   SmartOffice đang chạy');
  console.log('  =============================================');
  console.log(`   Trên máy này:        http://localhost:${PORT}`);
  ips.forEach(ip => console.log(`   Máy khác cùng mạng:  http://${ip}:${PORT}`));
  console.log(`   Tệp dữ liệu:         ${D.DB_FILE}`);
  if (created) console.log('\n   Đã tạo dữ liệu ban đầu. Tài khoản quản trị: admin / Admin@123 (đổi ngay khi đăng nhập)');
  console.log('\n   Nhấn Ctrl + C để dừng máy chủ.\n');
});
server.on('error', e => {
  if (e.code === 'EADDRINUSE') console.error(`\n[LỖI] Cổng ${PORT} đang được phần mềm khác sử dụng. Đóng phần mềm đó hoặc chạy với cổng khác (ví dụ: set PORT=3001).\n`);
  else console.error(e);
  process.exit(1);
});
}
