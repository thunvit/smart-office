'use strict';
/**
 * Cơ sở dữ liệu SmartOffice (SQLite tích hợp sẵn trong Node.js >= 22.13).
 * Tệp dữ liệu: ./data/smartoffice.db (đổi bằng biến môi trường DATA_DIR).
 */
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_FILE = path.join(DATA_DIR, 'smartoffice.db');
const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

const all = (sql, ...p) => db.prepare(sql).all(...p);
const get = (sql, ...p) => db.prepare(sql).get(...p);
const run = (sql, ...p) => db.prepare(sql).run(...p);
function tx(fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { try { db.exec('ROLLBACK'); } catch (_) {} throw e; }
}

/* ---------------- Mật khẩu ---------------- */
function hashPw(pw) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(String(pw), salt, 64);
  return 'scrypt$' + salt.toString('hex') + '$' + h.toString('hex');
}
function verifyPw(pw, stored) {
  try {
    const [, s, h] = String(stored).split('$');
    const calc = crypto.scryptSync(String(pw), Buffer.from(s, 'hex'), 64);
    const want = Buffer.from(h, 'hex');
    return want.length === calc.length && crypto.timingSafeEqual(calc, want);
  } catch (e) { return false; }
}

/* ---------------- Ngày giờ (giờ máy chủ) ---------------- */
const pad = n => String(n).padStart(2, '0');
const isoDate = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const today = () => isoDate(new Date());
const now = () => { const d = new Date(); return isoDate(d) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); };
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return isoDate(d); };

/* ---------------- Lược đồ ---------------- */
db.exec(`
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS departments (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, head_id INTEGER, sort INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE, pass_hash TEXT NOT NULL,
  full_name TEXT NOT NULL, title TEXT DEFAULT '', dept_id INTEGER REFERENCES departments(id),
  role TEXT NOT NULL DEFAULT 'user', email TEXT DEFAULT '', phone TEXT DEFAULT '',
  dob TEXT, gender TEXT DEFAULT '', address TEXT DEFAULT '', join_date TEXT,
  leave_quota INTEGER DEFAULT 12, color TEXT DEFAULT '#0e6f68',
  active INTEGER NOT NULL DEFAULT 1, must_change_pw INTEGER NOT NULL DEFAULT 0, created_at TEXT);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY, user_id INTEGER, text TEXT, created_at TEXT);

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, color TEXT DEFAULT '#0e6f68', owner_id INTEGER,
  archived INTEGER DEFAULT 0, created_at TEXT);
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY, project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL, description TEXT DEFAULT '', assignee_id INTEGER REFERENCES users(id),
  creator_id INTEGER REFERENCES users(id), status TEXT NOT NULL DEFAULT 'todo', priority TEXT DEFAULT 'tb',
  start_date TEXT, due_date TEXT, done_at TEXT, created_at TEXT, updated_at TEXT);
CREATE INDEX IF NOT EXISTS ix_tasks_assignee ON tasks(assignee_id);
CREATE INDEX IF NOT EXISTS ix_tasks_project ON tasks(project_id);
CREATE TABLE IF NOT EXISTS task_checklist (
  id INTEGER PRIMARY KEY, task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE, text TEXT, done INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS task_comments (
  id INTEGER PRIMARY KEY, task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE, user_id INTEGER, body TEXT, created_at TEXT);

CREATE TABLE IF NOT EXISTS requests (
  id INTEGER PRIMARY KEY, code TEXT UNIQUE, type TEXT NOT NULL, title TEXT NOT NULL, amount INTEGER DEFAULT 0,
  date_from TEXT, date_to TEXT, days REAL DEFAULT 0, reason TEXT DEFAULT '', creator_id INTEGER REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending', created_at TEXT, closed_at TEXT);
CREATE TABLE IF NOT EXISTS request_steps (
  id INTEGER PRIMARY KEY, request_id INTEGER REFERENCES requests(id) ON DELETE CASCADE, seq INTEGER,
  approver_id INTEGER REFERENCES users(id), label TEXT, status TEXT DEFAULT 'waiting', note TEXT DEFAULT '', acted_at TEXT);
CREATE INDEX IF NOT EXISTS ix_rsteps ON request_steps(approver_id, status);

CREATE TABLE IF NOT EXISTS wf_templates (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, description TEXT DEFAULT '', active INTEGER DEFAULT 1, created_at TEXT);
CREATE TABLE IF NOT EXISTS wf_template_steps (
  id INTEGER PRIMARY KEY, template_id INTEGER REFERENCES wf_templates(id) ON DELETE CASCADE, seq INTEGER,
  name TEXT, assignee_id INTEGER, duration_days INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS wf_runs (
  id INTEGER PRIMARY KEY, code TEXT, template_id INTEGER, template_name TEXT, title TEXT NOT NULL, note TEXT DEFAULT '',
  creator_id INTEGER, status TEXT DEFAULT 'running', created_at TEXT, closed_at TEXT);
CREATE TABLE IF NOT EXISTS wf_run_steps (
  id INTEGER PRIMARY KEY, run_id INTEGER REFERENCES wf_runs(id) ON DELETE CASCADE, seq INTEGER, name TEXT,
  assignee_id INTEGER, duration_days INTEGER DEFAULT 1, due_date TEXT, status TEXT DEFAULT 'waiting', done_at TEXT);
CREATE INDEX IF NOT EXISTS ix_wfsteps ON wf_run_steps(assignee_id, status);
CREATE TABLE IF NOT EXISTS wf_logs (
  id INTEGER PRIMARY KEY, run_id INTEGER REFERENCES wf_runs(id) ON DELETE CASCADE, user_id INTEGER,
  action TEXT, step_name TEXT, note TEXT DEFAULT '', created_at TEXT);

CREATE TABLE IF NOT EXISTS contracts (
  id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, number TEXT, type TEXT,
  start_date TEXT, end_date TEXT, note TEXT DEFAULT '', created_at TEXT);

CREATE TABLE IF NOT EXISTS goal_cycles (id INTEGER PRIMARY KEY, name TEXT, start_date TEXT, end_date TEXT);
CREATE TABLE IF NOT EXISTS goals (
  id INTEGER PRIMARY KEY, cycle_id INTEGER REFERENCES goal_cycles(id) ON DELETE CASCADE, parent_id INTEGER,
  level TEXT NOT NULL, dept_id INTEGER, owner_id INTEGER, title TEXT NOT NULL, unit TEXT DEFAULT '',
  target REAL DEFAULT 100, current REAL DEFAULT 0, weight REAL DEFAULT 1, created_by INTEGER, created_at TEXT);
CREATE TABLE IF NOT EXISTS goal_updates (
  id INTEGER PRIMARY KEY, goal_id INTEGER REFERENCES goals(id) ON DELETE CASCADE, user_id INTEGER,
  value REAL, note TEXT DEFAULT '', created_at TEXT);
`);

/* ---------------- Lược đồ bổ sung v2: Chấm công, Tiền lương ---------------- */
db.exec(`
CREATE TABLE IF NOT EXISTS attendance (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, work_date TEXT NOT NULL,
  check_in TEXT, check_out TEXT, source TEXT DEFAULT 'web', note TEXT DEFAULT '', edited_by INTEGER, updated_at TEXT,
  UNIQUE(user_id, work_date));
CREATE TABLE IF NOT EXISTS salary_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  base_salary INTEGER DEFAULT 0, insurance_salary INTEGER DEFAULT 0, insured INTEGER DEFAULT 1,
  allowance_taxable INTEGER DEFAULT 0, allowance_nontax INTEGER DEFAULT 0, dependents INTEGER DEFAULT 0,
  tax_mode TEXT DEFAULT 'progressive', bank_account TEXT DEFAULT '', bank_name TEXT DEFAULT '', updated_at TEXT, updated_by INTEGER);
CREATE TABLE IF NOT EXISTS payroll_periods (
  id INTEGER PRIMARY KEY, month TEXT NOT NULL UNIQUE, status TEXT DEFAULT 'draft', std_days REAL,
  params TEXT, created_by INTEGER, created_at TEXT, locked_by INTEGER, locked_at TEXT);
CREATE TABLE IF NOT EXISTS payroll_lines (
  id INTEGER PRIMARY KEY, period_id INTEGER NOT NULL REFERENCES payroll_periods(id) ON DELETE CASCADE, user_id INTEGER NOT NULL,
  full_name TEXT, title TEXT, dept_name TEXT,
  base_salary INTEGER, insurance_salary INTEGER, std_days REAL, work_days REAL, paid_leave REAL, holiday_days REAL, paid_days REAL,
  ot_hours REAL, salary_by_days INTEGER, allowance_taxable INTEGER, allowance_nontax INTEGER, ot_pay INTEGER, ot_exempt INTEGER,
  bonus INTEGER DEFAULT 0, gross INTEGER, ins_bhxh INTEGER, ins_bhyt INTEGER, ins_bhtn INTEGER, ins_total INTEGER,
  dependents INTEGER, deduction_family INTEGER, taxable_income INTEGER, pit INTEGER,
  other_deduction INTEGER DEFAULT 0, advance INTEGER DEFAULT 0, net INTEGER,
  er_bhxh INTEGER, er_bhyt INTEGER, er_bhtn INTEGER, er_kpcd INTEGER, er_total INTEGER, note TEXT DEFAULT '',
  UNIQUE(period_id, user_id));
`);
/* Nâng cấp CSDL cũ: bổ sung cột còn thiếu, không ảnh hưởng dữ liệu hiện có */
const hasCol = (t, c) => all(`PRAGMA table_info(${t})`).some(r => r.name === c);
if (!hasCol('requests', 'hours')) db.exec('ALTER TABLE requests ADD COLUMN hours REAL DEFAULT 0');

/* ---------------- Cấu hình ---------------- */
function getSettings() {
  const s = {};
  for (const r of all('SELECT key, value FROM settings')) s[r.key] = r.value;
  return {
    org_name: s.org_name || 'Đơn vị của tôi',
    threshold1: Number(s.threshold1 || 5000000),
    threshold2: Number(s.threshold2 || 50000000),
    accountant_id: Number(s.accountant_id || 0),
    director_id: Number(s.director_id || 0),
    hr_approver_id: Number(s.hr_approver_id || 0),
    hr_dept_id: Number(s.hr_dept_id || 0),
    work_start: s.work_start || '08:00',
    work_end: s.work_end || '17:00',
    late_grace: Number(s.late_grace ?? 5),
    work_saturday: s.work_saturday === '1',
    holidays: (s.holidays || DEFAULT_HOLIDAYS).split(/[\s,;]+/).filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x)),
    pay: Object.assign({}, PAY_DEFAULTS, safeJson(s.payroll_params))
  };
}
const safeJson = s => { try { return JSON.parse(s || '{}') || {}; } catch (e) { return {}; } };
/* Ngày nghỉ lễ, Tết hưởng nguyên lương năm 2026 (Điều 112 Bộ luật Lao động 2019; Tết Âm lịch theo thông báo
   của Bộ Nội vụ). Quản trị viên rà soát, bổ sung ngày nghỉ bù theo thông báo hằng năm tại Cấu hình. */
const DEFAULT_HOLIDAYS = '2026-01-01,2026-02-16,2026-02-17,2026-02-18,2026-02-19,2026-02-20,2026-04-27,2026-04-30,2026-05-01,2026-09-01,2026-09-02';
/* Tham số tính lương mặc định năm 2026 – có thể chỉnh tại Quản trị › Cấu hình */
const PAY_DEFAULTS = {
  ded_self: 15500000,       // Giảm trừ bản thân/tháng – NQ 110/2025/UBTVQH15, từ kỳ tính thuế 2026
  ded_dependent: 6200000,   // Giảm trừ mỗi người phụ thuộc/tháng – NQ 110/2025/UBTVQH15
  ref_wage: 2340000,        // Mức tham chiếu/lương cơ sở làm căn cứ trần BHXH, BHYT (20 lần)
  region_min: 5310000,      // Lương tối thiểu vùng I – NĐ 293/2025/NĐ-CP (trần BHTN = 20 lần)
  ee_bhxh: 8, ee_bhyt: 1.5, ee_bhtn: 1,          // Người lao động đóng (%)
  er_bhxh: 17.5, er_bhyt: 3, er_bhtn: 1, er_kpcd: 2, // Đơn vị đóng (%): BHXH gồm 14 + 3 + 0,5; KPCĐ 2%
  ot_rate: 150,             // Làm thêm ngày thường: tối thiểu 150% (Điều 98 BLLĐ 2019)
  hours_per_day: 8,
  brackets: [[10000000, 5], [30000000, 10], [60000000, 20], [100000000, 30], [null, 35]] // Biểu 5 bậc, áp dụng tiền lương từ kỳ tính thuế 2026
};
function setSetting(k, v) { run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', k, String(v)); }

/* ---------------- Dữ liệu ban đầu ---------------- */
const COLORS = ['#0e6f68', '#3a5bb0', '#a8501f', '#7a4fb0', '#2b8547', '#b03a6c', '#5b6774', '#a86a10'];

function seedDemo() {
  const T = today(), d = n => addDays(T, n), ts = (n, h) => addDays(T, n) + ' ' + h + ':00';
  tx(() => {
    const dep = n => Number(run('INSERT INTO departments(name, sort) VALUES(?,?)', n, 0).lastInsertRowid);
    const D = { bgd: dep('Ban Giám đốc'), tckt: dep('Phòng Tài chính – Kế toán'), kd: dep('Phòng Kinh doanh'), hcns: dep('Phòng Hành chính – Nhân sự'), kt: dep('Phòng Kỹ thuật') };
    const demoPw = hashPw('123456');
    let ci = 0;
    const user = (username, name, title, dept, extra = {}) => Number(run(
      `INSERT INTO users(username, pass_hash, full_name, title, dept_id, role, email, phone, dob, gender, join_date, color, must_change_pw, created_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      username, extra.pw ? hashPw(extra.pw) : demoPw, name, title, dept, extra.role || 'user',
      username + '@donvi.vn', extra.phone || '', extra.dob || null, extra.gender || '', extra.join || '2022-03-01',
      COLORS[ci++ % COLORS.length], extra.mustChange ? 1 : 0, now()).lastInsertRowid);
    const U = {
      admin: user('admin', 'Quản trị hệ thống', 'Quản trị viên', D.kt, { role: 'admin', pw: 'Admin@123', mustChange: true }),
      thanh: user('thanh.nv', 'Nguyễn Văn Thành', 'Giám đốc', D.bgd, { gender: 'Nam', dob: '1978-05-12', phone: '0912 345 001', join: '2015-01-05' }),
      huong: user('huong.tt', 'Trần Thị Hương', 'Kế toán trưởng', D.tckt, { gender: 'Nữ', dob: '1983-09-20', phone: '0912 345 002', join: '2016-07-01' }),
      quan: user('quan.lm', 'Lê Minh Quân', 'Trưởng phòng Kinh doanh', D.kd, { gender: 'Nam', dob: '1986-02-03', phone: '0912 345 003', join: '2017-04-10' }),
      trang: user('trang.pt', 'Phạm Thu Trang', 'Trưởng phòng HC–NS', D.hcns, { gender: 'Nữ', dob: '1988-11-15', phone: '0912 345 004', join: '2018-08-01' }),
      huy: user('huy.dq', 'Đỗ Quang Huy', 'Chuyên viên kinh doanh', D.kd, { gender: 'Nam', dob: '1995-06-30', phone: '0912 345 005', join: '2021-02-22' }),
      anh: user('anh.vn', 'Vũ Ngọc Anh', 'Chuyên viên kinh doanh', D.kd, { gender: 'Nữ', dob: '1997-12-08', phone: '0912 345 006', join: '2022-06-13' }),
      long: user('long.hd', 'Hoàng Đức Long', 'Kỹ sư CNTT', D.kt, { gender: 'Nam', dob: '1992-04-18', phone: '0912 345 007', join: '2019-10-01' }),
      mai: user('mai.bt', 'Bùi Thị Mai', 'Chuyên viên nhân sự', D.hcns, { gender: 'Nữ', dob: '1996-03-25', phone: '0912 345 008', join: '2020-09-14' })
    };
    const head = (dept, u) => run('UPDATE departments SET head_id=? WHERE id=?', u, dept);
    head(D.bgd, U.thanh); head(D.tckt, U.huong); head(D.kd, U.quan); head(D.hcns, U.trang); head(D.kt, U.thanh);
    setSetting('org_name', 'Công ty Cổ phần SmartOffice');
    setSetting('threshold1', 5000000); setSetting('threshold2', 50000000);
    setSetting('accountant_id', U.huong); setSetting('director_id', U.thanh);
    setSetting('hr_approver_id', U.trang); setSetting('hr_dept_id', D.hcns);

    /* Dự án & công việc */
    const proj = (n, c, o) => Number(run('INSERT INTO projects(name,color,owner_id,created_at) VALUES(?,?,?,?)', n, c, o, now()).lastInsertRowid);
    const P1 = proj('Triển khai văn phòng số', '#0e6f68', U.long), P2 = proj('Kế hoạch kinh doanh Quý IV', '#3a5bb0', U.quan), P3 = proj('Tuyển dụng tháng 11', '#a8501f', U.trang);
    const task = (p, title, a, c, s, st, du, pr, cl = [], desc = '') => {
      const id = Number(run(`INSERT INTO tasks(project_id,title,description,assignee_id,creator_id,status,priority,start_date,due_date,done_at,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`, p, title, desc, a, c, s, pr, d(st), d(du), s === 'done' ? ts(du, '16:00') : null, ts(st, '08:00'), ts(st, '08:00')).lastInsertRowid);
      for (const [t, dn] of cl) run('INSERT INTO task_checklist(task_id,text,done) VALUES(?,?,?)', id, t, dn ? 1 : 0);
      return id;
    };
    task(P1, 'Khảo sát quy trình phê duyệt hiện hành', U.long, U.thanh, 'done', -14, -8, 'tb', [['Phỏng vấn 5 phòng ban', 1], ['Tổng hợp biểu mẫu giấy', 1]], 'Thu thập toàn bộ mẫu tờ trình, đề xuất đang dùng bản giấy để số hóa.');
    task(P1, 'Cấu hình sơ đồ tổ chức và phân quyền', U.long, U.thanh, 'doing', -5, 2, 'cao', [['Nhập danh sách phòng ban', 1], ['Gán trưởng phòng', 1], ['Phân quyền xem báo cáo', 0]]);
    task(P1, 'Soạn quy chế sử dụng phần mềm nội bộ', U.mai, U.trang, 'review', -6, 0, 'tb', [['Dự thảo', 1], ['Lấy ý kiến các phòng', 0]], 'Căn cứ quy chế làm việc hiện hành của công ty.');
    task(P1, 'Đào tạo người dùng đợt 1', U.trang, U.thanh, 'todo', 4, 8, 'tb', [['Chuẩn bị tài liệu hướng dẫn', 0], ['Đặt phòng họp', 0]]);
    task(P1, 'Chuyển dữ liệu công việc từ Excel', U.long, U.long, 'todo', 1, 6, 'thap');
    task(P2, 'Lập kế hoạch doanh số tháng 12', U.quan, U.thanh, 'doing', -3, 3, 'cao', [['Số liệu tháng 10', 1], ['Dự báo theo khu vực', 0]]);
    const t7 = task(P2, 'Báo cáo khách hàng tồn đọng', U.huy, U.quan, 'doing', -7, -2, 'cao', [], 'Danh sách khách hàng chưa thanh toán quá 60 ngày.');
    const t8 = task(P2, 'Chuẩn bị hồ sơ chào giá dự án Ninh Bình', U.anh, U.quan, 'review', -4, 1, 'cao', [['Bảng giá', 1], ['Thuyết minh kỹ thuật', 1], ['Trình ký', 0]]);
    task(P2, 'Cập nhật danh mục sản phẩm 2027', U.anh, U.quan, 'todo', 2, 12, 'tb');
    task(P2, 'Tổng kết chương trình khuyến mãi tháng 10', U.huy, U.quan, 'done', -12, -5, 'thap');
    task(P3, 'Đăng tin tuyển 02 nhân viên kinh doanh', U.mai, U.trang, 'done', -10, -7, 'tb');
    task(P3, 'Sàng lọc hồ sơ ứng viên', U.mai, U.trang, 'doing', -6, -1, 'tb', [['Lọc theo tiêu chí', 1], ['Gửi danh sách phỏng vấn', 0]]);
    task(P3, 'Phỏng vấn vòng 1', U.trang, U.trang, 'todo', 2, 5, 'tb');
    task(P3, 'Chuẩn bị hợp đồng thử việc', U.trang, U.trang, 'todo', 7, 10, 'thap');
    run('INSERT INTO task_comments(task_id,user_id,body,created_at) VALUES(?,?,?,?)', t7, U.quan, 'Huy bổ sung cột số ngày quá hạn giúp anh nhé.', ts(-1, '08:42'));
    run('INSERT INTO task_comments(task_id,user_id,body,created_at) VALUES(?,?,?,?)', t8, U.anh, 'Đã hoàn thiện thuyết minh, chờ anh Quân xem lại.', ts(0, '09:15'));

    /* Đề xuất */
    const year = T.slice(0, 4);
    const req = (n, type, title, amount, reason, creator, created, status, steps, extra = {}) => {
      const id = Number(run(`INSERT INTO requests(code,type,title,amount,date_from,date_to,days,reason,creator_id,status,created_at,closed_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`, `ĐX-${year}-${String(n).padStart(4, '0')}`, type, title, amount, extra.from || null, extra.to || null, extra.days || 0,
        reason, creator, status, created, status === 'pending' ? null : steps[steps.length - 1][4] || created).lastInsertRowid);
      steps.forEach(([ap, label, st, note, at], i) => run('INSERT INTO request_steps(request_id,seq,approver_id,label,status,note,acted_at) VALUES(?,?,?,?,?,?,?)', id, i + 1, ap, label, st, note || '', at || null));
    };
    req(135, 'mua', 'Mua bàn ghế phòng họp tầng 3', 72500000, 'Bổ sung cho phòng họp mới.', U.mai, ts(-9, '09:00'), 'rejected',
      [[U.trang, 'Lãnh đạo phòng', 'approved', '', ts(-9, '10:00')], [U.huong, 'Kế toán trưởng', 'approved', '', ts(-8, '14:00')], [U.thanh, 'Giám đốc', 'rejected', 'Hoãn sang Quý I năm sau, đề nghị lấy thêm 02 báo giá.', ts(-7, '17:05')]]);
    req(138, 'tamung', 'Tạm ứng công tác phí Hà Nội', 8000000, 'Công tác làm việc với đối tác trong tuần tới.', U.quan, ts(-5, '11:00'), 'approved',
      [[U.thanh, 'Lãnh đạo phòng', 'approved', 'Đồng ý.', ts(-5, '15:40')], [U.huong, 'Kế toán trưởng', 'approved', '', ts(-4, '08:30')]]);
    req(141, 'mua', 'Mua 03 máy tính xách tay cho Phòng Kinh doanh', 54000000, 'Thay thế máy cũ đã hết khấu hao (mua năm 2019), cấu hình không đáp ứng phần mềm mới.', U.huy, ts(-2, '10:05'), 'pending',
      [[U.quan, 'Lãnh đạo phòng', 'approved', 'Đồng ý, cần thiết cho công việc.', ts(-2, '14:20')], [U.huong, 'Kế toán trưởng', 'approved', 'Nằm trong ngân sách công cụ dụng cụ năm nay.', ts(-1, '09:10')], [U.thanh, 'Giám đốc', 'pending']]);
    req(143, 'thanhtoan', 'Thanh toán chi phí tiếp khách hàng tháng 10', 3850000, 'Theo hóa đơn GTGT số 0004127.', U.anh, ts(-1, '16:30'), 'pending', [[U.quan, 'Lãnh đạo phòng', 'pending']]);
    req(144, 'nghiphep', 'Nghỉ phép năm 02 ngày', 0, 'Giải quyết việc gia đình.', U.long, ts(0, '08:20'), 'pending',
      [[U.thanh, 'Lãnh đạo phòng', 'pending'], [U.trang, 'Phòng HC–NS', 'waiting']], { from: d(6), to: d(7), days: 2 });

    /* Quy trình mẫu */
    const tpl = (name, desc, steps) => {
      const id = Number(run('INSERT INTO wf_templates(name,description,created_at) VALUES(?,?,?)', name, desc, now()).lastInsertRowid);
      steps.forEach(([n, a, dd], i) => run('INSERT INTO wf_template_steps(template_id,seq,name,assignee_id,duration_days) VALUES(?,?,?,?,?)', id, i + 1, n, a, dd));
      return id;
    };
    const W1 = tpl('Xử lý văn bản đến', 'Tiếp nhận, phân công và xử lý công văn, văn bản đến của đơn vị.',
      [['Văn thư tiếp nhận, vào sổ văn bản đến', U.mai, 1], ['Giám đốc cho ý kiến chỉ đạo, phân công', U.thanh, 1], ['Phòng chuyên môn xử lý, dự thảo văn bản trả lời', U.quan, 5], ['Văn thư phát hành và lập hồ sơ lưu', U.mai, 1]]);
    tpl('Mua sắm tài sản, công cụ dụng cụ', 'Áp dụng cho mua sắm đã được phê duyệt chủ trương.',
      [['Lấy tối thiểu 03 báo giá', U.mai, 3], ['Kế toán kiểm tra ngân sách, đối chiếu báo giá', U.huong, 2], ['Giám đốc phê duyệt nhà cung cấp', U.thanh, 1], ['Ký hợp đồng, nghiệm thu và bàn giao', U.trang, 5], ['Thanh toán, lưu chứng từ', U.huong, 2]]);
    tpl('Tiếp nhận nhân sự mới', 'Chuẩn bị điều kiện làm việc cho nhân sự mới trước ngày nhận việc.',
      [['Hoàn thiện hồ sơ, hợp đồng thử việc', U.trang, 2], ['Cấp tài khoản, thiết bị làm việc', U.long, 2], ['Hướng dẫn hội nhập, giao nhiệm vụ', U.quan, 3]]);
    const runId = Number(run('INSERT INTO wf_runs(code,template_id,template_name,title,note,creator_id,status,created_at) VALUES(?,?,?,?,?,?,?,?)',
      `QT-${year}-0021`, W1, 'Xử lý văn bản đến', 'Công văn số 1520/SCT-QLTM của Sở Công Thương về báo cáo tình hình kinh doanh năm', 'Hạn báo cáo trước ngày 20 của tháng.', U.mai, 'running', ts(-2, '08:30')).lastInsertRowid);
    [['Văn thư tiếp nhận, vào sổ văn bản đến', U.mai, 1, d(-2), 'done', ts(-2, '08:45')], ['Giám đốc cho ý kiến chỉ đạo, phân công', U.thanh, 1, d(-1), 'done', ts(-1, '10:20')], ['Phòng chuyên môn xử lý, dự thảo văn bản trả lời', U.quan, 5, d(4), 'active', null], ['Văn thư phát hành và lập hồ sơ lưu', U.mai, 1, null, 'waiting', null]]
      .forEach(([n, a, dd, due, st, at], i) => run('INSERT INTO wf_run_steps(run_id,seq,name,assignee_id,duration_days,due_date,status,done_at) VALUES(?,?,?,?,?,?,?,?)', runId, i + 1, n, a, dd, due, st, at));
    run('INSERT INTO wf_logs(run_id,user_id,action,step_name,note,created_at) VALUES(?,?,?,?,?,?)', runId, U.mai, 'start', '', 'Khởi tạo quy trình', ts(-2, '08:30'));
    run('INSERT INTO wf_logs(run_id,user_id,action,step_name,note,created_at) VALUES(?,?,?,?,?,?)', runId, U.mai, 'complete', 'Văn thư tiếp nhận, vào sổ văn bản đến', 'Số đến: 245', ts(-2, '08:45'));
    run('INSERT INTO wf_logs(run_id,user_id,action,step_name,note,created_at) VALUES(?,?,?,?,?,?)', runId, U.thanh, 'complete', 'Giám đốc cho ý kiến chỉ đạo, phân công', 'Giao Phòng Kinh doanh chủ trì, phối hợp Phòng TC–KT tổng hợp số liệu.', ts(-1, '10:20'));

    /* Hợp đồng lao động */
    const ct = (u, num, type, s, e) => run('INSERT INTO contracts(user_id,number,type,start_date,end_date,created_at) VALUES(?,?,?,?,?,?)', u, num, type, s, e, now());
    ct(U.thanh, '01/2015/HĐLĐ', 'Không xác định thời hạn', '2015-01-05', null);
    ct(U.huong, '12/2016/HĐLĐ', 'Không xác định thời hạn', '2016-07-01', null);
    ct(U.quan, '08/2019/HĐLĐ', 'Không xác định thời hạn', '2019-04-10', null);
    ct(U.trang, '15/2020/HĐLĐ', 'Không xác định thời hạn', '2020-08-01', null);
    ct(U.huy, '05/2023/HĐLĐ', 'Xác định thời hạn 36 tháng', '2023-02-22', '2026-02-21');
    ct(U.huy, '04/2026/HĐLĐ', 'Không xác định thời hạn', '2026-02-22', null);
    ct(U.anh, '22/2024/HĐLĐ', 'Xác định thời hạn 36 tháng', '2024-06-13', d(40));
    ct(U.long, '18/2022/HĐLĐ', 'Không xác định thời hạn', '2022-10-01', null);
    ct(U.mai, '30/2023/HĐLĐ', 'Xác định thời hạn 36 tháng', '2023-09-14', d(25));

    /* Mục tiêu – KPI */
    const y = Number(year), q = Math.floor((new Date().getMonth()) / 3);
    const qs = [[1, 3], [4, 6], [7, 9], [10, 12]][q];
    const lastDay = new Date(y, qs[1], 0).getDate();
    const cyc = Number(run('INSERT INTO goal_cycles(name,start_date,end_date) VALUES(?,?,?)', `Quý ${['I', 'II', 'III', 'IV'][q]}/${y}`,
      `${y}-${pad(qs[0])}-01`, `${y}-${pad(qs[1])}-${pad(lastDay)}`).lastInsertRowid);
    const goal = (parent, level, dept, owner, title, unit, target, current, weight = 1) => Number(run(
      'INSERT INTO goals(cycle_id,parent_id,level,dept_id,owner_id,title,unit,target,current,weight,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
      cyc, parent, level, dept, owner, title, unit, target, current, weight, U.thanh, now()).lastInsertRowid);
    const G1 = goal(null, 'company', null, U.thanh, 'Doanh thu thuần đạt 12 tỷ đồng', 'triệu đồng', 12000, 0);
    const G2 = goal(null, 'company', null, U.thanh, 'Hoàn thành chuyển đổi số quy trình nội bộ', '%', 100, 0);
    const G11 = goal(G1, 'dept', D.kd, U.quan, 'Doanh số bán hàng Phòng Kinh doanh', 'triệu đồng', 10500, 6900, 1);
    goal(G11, 'user', D.kd, U.huy, 'Doanh số cá nhân', 'triệu đồng', 5000, 3600);
    goal(G11, 'user', D.kd, U.anh, 'Doanh số cá nhân', 'triệu đồng', 5500, 3300);
    goal(G1, 'dept', D.tckt, U.huong, 'Thu hồi công nợ quá hạn', 'triệu đồng', 1500, 980, 1);
    const G21 = goal(G2, 'dept', D.kt, U.long, 'Số quy trình đưa lên phần mềm', 'quy trình', 10, 3, 2);
    goal(G2, 'dept', D.hcns, U.trang, 'Tỷ lệ nhân sự được đào tạo sử dụng phần mềm', '%', 100, 35, 1);
    goal(G21, 'user', D.kt, U.long, 'Cấu hình và kiểm thử quy trình', 'quy trình', 10, 3);

    /* Nhật ký */
    const act = (u, text, at) => run('INSERT INTO activity(user_id,text,created_at) VALUES(?,?,?)', u, text, at);
    act(U.mai, 'hoàn thành <b>Đăng tin tuyển 02 nhân viên kinh doanh</b>', ts(-1, '08:05'));
    act(U.huong, 'duyệt đề xuất <b>Mua 03 máy tính xách tay cho Phòng Kinh doanh</b>', ts(-1, '09:10'));
    act(U.thanh, 'xử lý bước <b>Giám đốc cho ý kiến chỉ đạo, phân công</b>', ts(-1, '10:20'));
    act(U.anh, 'gửi đề xuất <b>Thanh toán chi phí tiếp khách hàng tháng 10</b>', ts(-1, '16:30'));
    act(U.long, 'gửi đề xuất <b>Nghỉ phép năm 02 ngày</b>', ts(0, '08:20'));
    act(U.anh, 'bình luận trong <b>Chuẩn bị hồ sơ chào giá dự án Ninh Bình</b>', ts(0, '09:15'));
  });
}

function seedEmpty() {
  tx(() => {
    const dep = Number(run('INSERT INTO departments(name) VALUES(?)', 'Ban Giám đốc').lastInsertRowid);
    const id = Number(run(`INSERT INTO users(username,pass_hash,full_name,title,dept_id,role,must_change_pw,created_at)
      VALUES('admin',?,?,?,?, 'admin', 1, ?)`, hashPw('Admin@123'), 'Quản trị hệ thống', 'Quản trị viên', dep, now()).lastInsertRowid);
    run('UPDATE departments SET head_id=? WHERE id=?', id, dep);
    setSetting('director_id', id); setSetting('accountant_id', id); setSetting('hr_approver_id', id);
    setSetting('org_name', 'Đơn vị của tôi');
  });
}

function init() {
  const c = get('SELECT COUNT(*) n FROM users').n;
  if (!c) { if (process.env.NO_DEMO === '1') seedEmpty(); else seedDemo(); return true; }
  return false;
}

module.exports = { db, all, get, run, tx, hashPw, verifyPw, today, now, addDays, isoDate, getSettings, setSetting, init, DB_FILE, COLORS };
