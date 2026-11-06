'use strict';
/**
 * SmartOffice — Phân hệ Công việc – Dự án: các chức năng bổ sung đầy đủ theo tài liệu Base Wework.
 * Căn cứ: docs/05-ra-soat/2026-11-06-DOI-CHIEU-BASE-WEWORK.md; ADR-007.
 * Đăng ký vào cùng bộ định tuyến và dùng chung hàm phân quyền của work.js (đối tượng H).
 *
 * Nội dung: trường dữ liệu tùy chỉnh (13 loại, gồm bảng và công thức); thảo luận; tài liệu dự án; hoạt động; thanh thông tin;
 * mẫu dự án; nhân bản dự án; nhân bản công việc sang dự án khác; đánh dấu; iCalendar; nhập/xuất dữ liệu; báo cáo thành viên,
 * báo cáo hệ thống; tác vụ hàng loạt.
 */
const D = require('./db');
const { db, all, get, run, tx, today, now, addCol } = D;
const { FILES, saveUpload, sendFile } = require('./files');
const FORMULA = require('./public/work-formula');

db.exec(`
CREATE TABLE IF NOT EXISTS task_fields (
  id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE, name TEXT NOT NULL, type TEXT NOT NULL,
  input_key TEXT NOT NULL, description TEXT DEFAULT '', required INTEGER DEFAULT 0, sort INTEGER DEFAULT 0, options TEXT DEFAULT '{}', created_at TEXT);
CREATE INDEX IF NOT EXISTS ix_tf_proj ON task_fields(project_id);
CREATE TABLE IF NOT EXISTS task_field_values (task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, field_id INTEGER NOT NULL, value TEXT, PRIMARY KEY(task_id, field_id));
CREATE INDEX IF NOT EXISTS ix_tfv_field ON task_field_values(field_id);
CREATE TABLE IF NOT EXISTS project_posts (
  id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE, user_id INTEGER, title TEXT NOT NULL, body TEXT DEFAULT '',
  pinned INTEGER DEFAULT 0, created_at TEXT, updated_at TEXT);
CREATE INDEX IF NOT EXISTS ix_post_proj ON project_posts(project_id);
CREATE TABLE IF NOT EXISTS project_post_comments (id INTEGER PRIMARY KEY, post_id INTEGER NOT NULL REFERENCES project_posts(id) ON DELETE CASCADE, user_id INTEGER, body TEXT, created_at TEXT);
CREATE INDEX IF NOT EXISTS ix_pc_post ON project_post_comments(post_id);
CREATE TABLE IF NOT EXISTS project_files (
  id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE, file_name TEXT, file_size INTEGER, mime TEXT,
  stored_name TEXT, folder TEXT DEFAULT '', uploaded_by INTEGER, created_at TEXT);
CREATE INDEX IF NOT EXISTS ix_pf_proj ON project_files(project_id);
CREATE TABLE IF NOT EXISTS project_logs (id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL, user_id INTEGER, action TEXT, detail TEXT, created_at TEXT);
CREATE INDEX IF NOT EXISTS ix_pl_proj ON project_logs(project_id, id);
CREATE TABLE IF NOT EXISTS task_marks (user_id INTEGER NOT NULL, task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, created_at TEXT, PRIMARY KEY(user_id, task_id));
CREATE INDEX IF NOT EXISTS ix_mark_task ON task_marks(task_id);
CREATE TABLE IF NOT EXISTS project_templates (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, kind TEXT DEFAULT 'project', owner_id INTEGER, source_project_id INTEGER,
  shared TEXT DEFAULT '{}', include TEXT DEFAULT '{}', data TEXT DEFAULT '{}', created_at TEXT, updated_at TEXT);
CREATE INDEX IF NOT EXISTS ix_tpl_src ON project_templates(source_project_id);
CREATE INDEX IF NOT EXISTS ix_tasks_updated ON tasks(project_id, updated_at);
CREATE INDEX IF NOT EXISTS ix_tasks_created ON tasks(created_at);
CREATE INDEX IF NOT EXISTS ix_tlog_task ON task_logs(task_id, id);
`);

const FTYPES = { int: 'Số nguyên', float: 'Số thập phân', text: 'Văn bản ngắn', textarea: 'Văn bản đoạn', date: 'Ngày', datetime: 'Ngày giờ', select: 'Một lựa chọn',
  mselect: 'Nhiều lựa chọn', checkbox: 'Checkbox', file: 'Tập tin', heading: 'Tiêu đề', table: 'Bảng', formula: 'Công thức' };
const COLTYPES = ['int', 'float', 'text', 'date', 'datetime', 'select', 'mselect', 'formula'];
const NOVALUE = ['heading', 'file', 'formula'];
/* Mẫu dựng sẵn (Base: "Tạo phòng ban/dự án từ mẫu") */
const BUILTIN = [
  { id: 'b1', name: 'Phát triển phần mềm', kind: 'project', data: { groups: [{ name: 'Phân tích yêu cầu' }, { name: 'Thiết kế' }, { name: 'Lập trình' }, { name: 'Kiểm thử' }, { name: 'Triển khai' }],
    fields: [{ name: 'Mức độ ưu tiên khách hàng', type: 'select', input_key: 'uu_tien_kh', options: { choices: ['Cao', 'Trung bình', 'Thấp'] } }, { name: 'Điểm ước lượng', type: 'int', input_key: 'diem' }], tags: ['Lỗi', 'Tính năng', 'Cải tiến'] } },
  { id: 'b2', name: 'Tổ chức sự kiện', kind: 'project', data: { groups: [{ name: 'Kế hoạch' }, { name: 'Truyền thông' }, { name: 'Hậu cần' }, { name: 'Tổng kết' }],
    fields: [{ name: 'Chi phí dự kiến', type: 'float', input_key: 'chi_phi' }, { name: 'Chi phí thực tế', type: 'float', input_key: 'thuc_te' }, { name: 'Chênh lệch', type: 'formula', input_key: 'chenh_lech', options: { formula: '$thuc_te - $chi_phi' } }], tags: [] } },
  { id: 'b3', name: 'Phòng Hành chính – Nhân sự', kind: 'team', data: { groups: [{ name: 'Hồ sơ nhân sự' }, { name: 'Văn thư' }, { name: 'Tài sản' }, { name: 'Báo cáo định kỳ' }], fields: [], tags: ['Định kỳ'] } },
  { id: 'b4', name: 'Phòng Kinh doanh', kind: 'team', data: { groups: [{ name: 'Khách hàng mới' }, { name: 'Chăm sóc khách hàng' }, { name: 'Hợp đồng' }, { name: 'Báo cáo' }],
    fields: [{ name: 'Khách hàng', type: 'text', input_key: 'khach_hang' }, { name: 'Giá trị hợp đồng (₫)', type: 'float', input_key: 'gia_tri' }], tags: [] } }
];
const parseJSON = (s, d) => { try { const v = JSON.parse(s || ''); return v === null || v === undefined ? d : v; } catch (e) { return d; } };
const slug = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'truong';
const DAYMS = 864e5;
const dnum = s => Math.floor(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / DAYMS);
const dstr = n => new Date(n * DAYMS).toISOString().slice(0, 10);

function register(H) {
  const { route, bad, forbid, notFound, log, esc, str, int, isDate, isOwner, projectOf, roleIn, canManage, taskAccess, taskOf, taskFull, projectFull,
    need, tlog, userOk, ensureMember, settingsOf, accountCan, permOf, visibleFilter, lateExpr, lateArgs, TASK_COLS, shape, pageArgs, releaseBlobs,
    normTags, tagList, depthOf, PLAN, MAX_TITLE, MAX_DEPTH, PRIO, CLOSED, isDeptHead, canCreateProject, milestonesOf, HOOKS, DEFAULT_SETTINGS } = H;
  const plog = (pid, uid, action, detail = '') => run('INSERT INTO project_logs(project_id,user_id,action,detail,created_at) VALUES(?,?,?,?,?)', pid, uid, action, str(detail, 500), now());
  const userByName = n => { const k = String(n || '').trim().replace(/^@/, ''); return k ? get('SELECT id FROM users WHERE (username=? COLLATE NOCASE) AND active=1', k) : null; };
  const isAppAdmin = u => isOwner(u);

  /* =================== Trường dữ liệu tùy chỉnh =================== */
  const fieldsOf = pid => all('SELECT * FROM task_fields WHERE project_id=? ORDER BY sort, id', pid).map(f => ({ ...f, required: !!f.required, options: parseJSON(f.options, {}) }));
  function fieldInput(b, pid, old) {
    const type = old ? old.type : b.type;
    if (!FTYPES[type]) bad('Loại dữ liệu không hợp lệ.');
    const name = str(b.name ?? (old && old.name), 120); if (!name) bad('Vui lòng nhập tên trường.');
    let key = slug(b.input_key || (old && old.input_key) || name);
    const dup = get('SELECT id FROM task_fields WHERE project_id=? AND input_key=?' + (old ? ' AND id<>?' : ''), ...[pid, key].concat(old ? [old.id] : []));
    if (dup) { if (b.input_key) bad(`Mã trường "${key}" đã tồn tại.`); key = key.slice(0, 34) + '_' + Math.random().toString(36).slice(2, 6); }
    const oo = b.options || {}, opt = {};
    const choices = v => (Array.isArray(v) ? v : String(v || '').split(',')).map(x => str(x, 100)).filter(Boolean).slice(0, 100);
    if (type === 'select' || type === 'mselect') { opt.choices = choices(oo.choices ?? b.choices ?? (old && old.options.choices)); if (!opt.choices.length) bad('Vui lòng nhập các lựa chọn, cách nhau bởi dấu phẩy.'); }
    if (type === 'float' || type === 'formula') opt.decimals = Math.min(Math.max(int(oo.decimals ?? 2), 0), 6);
    if (type === 'formula') {
      opt.formula = str(oo.formula ?? b.formula ?? (old && old.options.formula), 500); if (!opt.formula) bad('Vui lòng nhập công thức.');
      const allowed = all("SELECT input_key FROM task_fields WHERE project_id=? AND type IN ('int','float','select')" + (old ? ' AND id<>?' : ''), ...[pid].concat(old ? [old.id] : [])).map(r => r.input_key);
      const c = FORMULA.check(opt.formula, allowed); if (!c.ok) bad('Công thức không hợp lệ: ' + c.error);
    }
    if (type === 'table') {
      const cols = Array.isArray(oo.columns) ? oo.columns : (old ? old.options.columns : []);
      if (!cols.length || cols.length > 20) bad('Bảng cần từ 1 đến 20 cột.');
      const keys = new Set();
      opt.columns = cols.map(c => {
        const ct = COLTYPES.includes(c.type) ? c.type : 'text', cn = str(c.name, 80); if (!cn) bad('Vui lòng nhập tên cột.');
        let ck = slug(c.key || cn); while (keys.has(ck)) ck += '_2'; keys.add(ck);
        const col = { key: ck, name: cn, type: ct, width: Math.min(Math.max(Number(c.width) || 1, 1), 10), required: !!c.required, sum: !!c.sum && ['int', 'float', 'formula'].includes(ct) };
        if (ct === 'select' || ct === 'mselect') { col.choices = choices(c.choices); if (!col.choices.length) bad(`Cột "${cn}" cần các lựa chọn.`); }
        if (ct === 'formula') col.formula = str(c.formula, 300);
        return col;
      });
      const numKeys = opt.columns.filter(c => ['int', 'float', 'select'].includes(c.type)).map(c => c.key);
      for (const c of opt.columns) if (c.type === 'formula') { const r = FORMULA.check(c.formula, numKeys); if (!r.ok) bad(`Công thức cột "${c.name}" không hợp lệ: ${r.error}`); }
    }
    return { name, type, input_key: key, description: str(b.description ?? (old && old.description), 500), required: (b.required ?? (old && old.required)) ? 1 : 0, options: JSON.stringify(opt) };
  }
  const num = v => (v === '' || v === null || v === undefined ? null : Number(v));
  function cell(type, v, choicesList, label) {
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) return null;
    switch (type) {
      case 'int': { const n = num(v); if (!Number.isInteger(n)) bad(`"${label}" phải là số nguyên.`); return n; }
      case 'float': { const n = num(String(v).replace(',', '.')); if (!isFinite(n)) bad(`"${label}" phải là số.`); return n; }
      case 'text': return str(v, 500);
      case 'textarea': return str(v, 5000);
      case 'date': if (!isDate(v)) bad(`"${label}" phải là ngày hợp lệ.`); return v;
      case 'datetime': if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(v))) bad(`"${label}" phải là ngày giờ hợp lệ.`); return String(v);
      case 'select': if (!choicesList.includes(String(v))) bad(`Giá trị của "${label}" không có trong danh sách lựa chọn.`); return String(v);
      case 'mselect': { const a = (Array.isArray(v) ? v : String(v).split(',')).map(x => String(x).trim()).filter(Boolean); for (const x of a) if (!choicesList.includes(x)) bad(`Giá trị "${x}" của "${label}" không có trong danh sách.`); return [...new Set(a)]; }
      case 'checkbox': return v === true || v === 1 || v === '1' || String(v).toLowerCase() === 'true' || String(v).toLowerCase() === 'có';
      default: return null;
    }
  }
  const numOf = (type, v) => (type === 'select' ? (isFinite(Number(v)) ? Number(v) : 0) : Number(v) || 0);
  function tableValue(f, rows) {
    if (!Array.isArray(rows)) bad(`"${f.name}" phải là bảng.`);
    if (rows.length > 100) bad(`"${f.name}" tối đa 100 dòng.`);
    const cols = f.options.columns || [];
    const out = rows.map((r, i) => {
      const row = {}, vars = {};
      for (const c of cols) if (c.type !== 'formula') { row[c.key] = cell(c.type, (r || {})[c.key], c.choices || [], `${f.name} – ${c.name} (dòng ${i + 1})`); if (c.required && (row[c.key] === null)) bad(`Cột "${c.name}" của "${f.name}" là bắt buộc (dòng ${i + 1}).`); if (['int', 'float', 'select'].includes(c.type)) vars[c.key] = numOf(c.type, row[c.key]); }
      for (const c of cols) if (c.type === 'formula') { const e = FORMULA.evaluate(c.formula, vars); row[c.key] = e.ok ? e.value : null; }
      return row;
    }).filter(r => Object.values(r).some(v => v !== null && v !== ''));
    return out.length ? out : null;
  }
  const tableSums = (f, rows) => { const s = {}; for (const c of f.options.columns || []) if (c.sum) s[c.key] = Math.round((rows || []).reduce((a, r) => a + (Number(r[c.key]) || 0), 0) * 1e6) / 1e6; return s; };
  function valuesOf(taskId, fields) {
    const raw = {}; for (const r of all('SELECT field_id, value FROM task_field_values WHERE task_id=?', taskId)) raw[r.field_id] = parseJSON(r.value, null);
    const out = {};
    for (const f of fields) {
      if (f.type === 'file') out[f.id] = all('SELECT id, file_name, file_size FROM task_files WHERE task_id=? AND field_id=? ORDER BY id', taskId, f.id);
      else if (f.type === 'table') { const rows = raw[f.id] || []; out[f.id] = { rows, sums: tableSums(f, rows) }; }
      else if (f.type !== 'heading') out[f.id] = raw[f.id] ?? null;
    }
    return out;
  }
  /* Lấy giá trị cho nhiều công việc bằng truy vấn gộp theo khối 500 mã (HN: không truy vấn trong vòng lặp từng công việc) */
  function valuesMany(ids, fields) {
    const raw = {}, files = {}, out = {}, hasFile = fields.some(f => f.type === 'file');
    for (let i = 0; i < ids.length; i += 500) {
      const part = ids.slice(i, i + 500), ph = part.map(() => '?').join(',');
      for (const r of all(`SELECT task_id, field_id, value FROM task_field_values WHERE task_id IN (${ph})`, ...part)) (raw[r.task_id] = raw[r.task_id] || {})[r.field_id] = parseJSON(r.value, null);
      if (hasFile) for (const r of all(`SELECT id, task_id, field_id, file_name, file_size FROM task_files WHERE field_id IS NOT NULL AND task_id IN (${ph}) ORDER BY id`, ...part)) ((files[r.task_id] = files[r.task_id] || {})[r.field_id] = (files[r.task_id] || {})[r.field_id] || []).push({ id: r.id, file_name: r.file_name, file_size: r.file_size });
    }
    for (const id of ids) { const o = {}, rv = raw[id] || {};
      for (const f of fields) { if (f.type === 'file') o[f.id] = (files[id] || {})[f.id] || []; else if (f.type === 'table') { const rows = rv[f.id] || []; o[f.id] = { rows, sums: tableSums(f, rows) }; } else if (f.type !== 'heading') o[f.id] = rv[f.id] ?? null; }
      out[id] = o; }
    return out;
  }
  /* Ghi giá trị; requireAll: kiểm tra trường bắt buộc (khi tạo công việc) */
  function saveValues(taskId, pid, input, requireAll) {
    const fields = fieldsOf(pid); if (!fields.length) return;
    const byKey = {}; for (const f of fields) { byKey[f.id] = f; byKey[f.input_key] = f; byKey[f.name] = f; }
    const cur = {}; for (const r of all('SELECT field_id, value FROM task_field_values WHERE task_id=?', taskId)) cur[r.field_id] = parseJSON(r.value, null);
    for (const [k, v] of Object.entries(input || {})) {
      const f = byKey[k]; if (!f) bad(`Trường tùy chỉnh "${k}" không tồn tại.`);
      if (NOVALUE.includes(f.type)) continue;
      cur[f.id] = f.type === 'table' ? (v === null || v === '' ? null : tableValue(f, v)) : cell(f.type, v, f.options.choices || [], f.name);
    }
    if (requireAll) for (const f of fields) if (f.required && !NOVALUE.includes(f.type) && (cur[f.id] === null || cur[f.id] === undefined)) bad(`Vui lòng nhập trường bắt buộc "${f.name}".`);
    const vars = {}; for (const f of fields) if (['int', 'float', 'select'].includes(f.type)) vars[f.input_key] = numOf(f.type, cur[f.id]);
    for (const f of fields) if (f.type === 'formula') { const e = FORMULA.evaluate(f.options.formula, vars); cur[f.id] = e.ok ? e.value : null; }
    for (const f of fields) {
      if (f.type === 'heading' || f.type === 'file') continue;
      const v = cur[f.id];
      if (v === null || v === undefined) run('DELETE FROM task_field_values WHERE task_id=? AND field_id=?', taskId, f.id);
      else run('INSERT INTO task_field_values(task_id,field_id,value) VALUES(?,?,?) ON CONFLICT(task_id,field_id) DO UPDATE SET value=excluded.value', taskId, f.id, JSON.stringify(v));
    }
  }
  const recomputeProject = pid => { for (const r of all('SELECT id FROM tasks WHERE project_id=? LIMIT 5000', pid)) saveValues(r.id, pid, {}, false); };
  route('GET', '/api/projects/:id/fields', ({ user, params }) => { const p = projectOf(int(params.id)); need(roleIn(user, p.id), 'Bạn không phải thành viên.'); return { types: FTYPES, col_types: COLTYPES, fields: fieldsOf(p.id) }; });
  route('POST', '/api/projects/:id/fields', ({ user, params, body }) => {
    const p = projectOf(int(params.id)); need(canManage(roleIn(user, p.id)), 'Chỉ quản lý mới được thiết lập trường dữ liệu tùy chỉnh.');
    if (get('SELECT COUNT(*) n FROM task_fields WHERE project_id=?', p.id).n >= 50) bad('Mỗi dự án tối đa 50 trường tùy chỉnh.');
    const x = fieldInput(body || {}, p.id);
    /* Vị trí: đầu tiên (after = 0) hoặc sau một trường */
    let sort; const after = body.after === undefined ? null : int(body.after);
    if (after === null) sort = (get('SELECT MAX(sort) m FROM task_fields WHERE project_id=?', p.id).m || 0) + 1;
    else { const a = after ? get('SELECT sort FROM task_fields WHERE id=? AND project_id=?', after, p.id) : { sort: 0 }; sort = (a ? a.sort : 0) + 1; run('UPDATE task_fields SET sort=sort+1 WHERE project_id=? AND sort>=?', p.id, sort); }
    run('INSERT INTO task_fields(project_id,name,type,input_key,description,required,sort,options,created_at) VALUES(?,?,?,?,?,?,?,?,?)', p.id, x.name, x.type, x.input_key, x.description, x.required, sort, x.options, now());
    plog(p.id, user.id, 'field', `thêm trường "${x.name}"`);
    return { fields: fieldsOf(p.id) };
  });
  route('PUT', '/api/fields/:id', ({ user, params, body }) => {
    const f0 = get('SELECT * FROM task_fields WHERE id=?', int(params.id)) || notFound('Trường không tồn tại.');
    need(canManage(roleIn(user, f0.project_id)), 'Chỉ quản lý mới được sửa trường tùy chỉnh.');
    const old = { ...f0, options: parseJSON(f0.options, {}) }, x = fieldInput(body || {}, f0.project_id, old);
    run('UPDATE task_fields SET name=?, input_key=?, description=?, required=?, options=? WHERE id=?', x.name, x.input_key, x.description, x.required, x.options, f0.id);
    if (x.type === 'formula' || x.input_key !== f0.input_key) recomputeProject(f0.project_id);
    return { fields: fieldsOf(f0.project_id) };
  });
  route('DELETE', '/api/fields/:id', ({ user, params }) => {
    const f = get('SELECT * FROM task_fields WHERE id=?', int(params.id)) || notFound('Trường không tồn tại.');
    need(canManage(roleIn(user, f.project_id)), 'Chỉ quản lý mới được xóa trường tùy chỉnh.');
    const used = all("SELECT input_key, options FROM task_fields WHERE project_id=? AND type='formula' AND id<>?", f.project_id, f.id).filter(x => FORMULA.vars(parseJSON(x.options, {}).formula || '').includes(f.input_key));
    if (used.length) bad(`Trường đang được dùng trong công thức: ${used.map(x => x.input_key).join(', ')}.`);
    const blobs = all("SELECT stored_name FROM task_files WHERE field_id=? AND kind='file'", f.id).map(r => r.stored_name);
    tx(() => { run('DELETE FROM task_field_values WHERE field_id=?', f.id); run('DELETE FROM task_files WHERE field_id=?', f.id); run('DELETE FROM task_fields WHERE id=?', f.id); });
    releaseBlobs(blobs); plog(f.project_id, user.id, 'field', `xóa trường "${f.name}"`);
    return { fields: fieldsOf(f.project_id) };
  });
  route('PUT', '/api/projects/:id/fields-order', ({ user, params, body }) => {
    const p = projectOf(int(params.id)); need(canManage(roleIn(user, p.id)), 'Chỉ quản lý mới được sắp xếp.');
    const ids = (Array.isArray(body.ids) ? body.ids : []).map(int);
    tx(() => ids.forEach((id, i) => run('UPDATE task_fields SET sort=? WHERE id=? AND project_id=?', i + 1, id, p.id)));
    return { fields: fieldsOf(p.id) };
  });
  /* Nhập định nghĩa trường từ Excel (Base bài 63000277992): Name, Type, Content, Required, Input key; cột bảng theo sheet riêng */
  route('POST', '/api/projects/:id/fields/import', ({ user, params, body }) => {
    const p = projectOf(int(params.id)); need(canManage(roleIn(user, p.id)), 'Chỉ quản lý mới được nhập trường tùy chỉnh.');
    const rows = Array.isArray(body.rows) ? body.rows.slice(0, 50) : []; if (!rows.length) bad('Tệp không có dòng dữ liệu.');
    const MAP = { int: 'int', float: 'float', text: 'text', textarea: 'textarea', date: 'date', datetime: 'datetime', dropdown: 'select', 'dropdown list': 'select', select: 'select', 'm-select': 'mselect', mselect: 'mselect', checkbox: 'checkbox', file: 'file', 'input-table': 'table', table: 'table', 'input-formula': 'formula', formula: 'formula', heading: 'heading' };
    let n = 0;
    tx(() => {
      for (const [i, r] of rows.entries()) {
        const type = MAP[String(r.type || '').trim().toLowerCase()]; if (!r.name || !type) bad(`Dòng ${i + 2}: thiếu Name hoặc Type không hợp lệ.`);
        const b = { name: r.name, type, input_key: r.input_key || undefined, description: (type === 'select' || type === 'mselect') ? '' : r.content, required: ['1', 'required', 'true', 'có'].includes(String(r.required || '').trim().toLowerCase()),
          options: { choices: r.content, formula: r.content, columns: r.columns } };
        if (type === 'table' && !(Array.isArray(r.columns) && r.columns.length)) bad(`Dòng ${i + 2}: bảng "${r.name}" chưa có sheet khai báo cột (tên sheet là Input key).`);
        const x = fieldInput(b, p.id); const sort = (get('SELECT MAX(sort) m FROM task_fields WHERE project_id=?', p.id).m || 0) + 1;
        run('INSERT INTO task_fields(project_id,name,type,input_key,description,required,sort,options,created_at) VALUES(?,?,?,?,?,?,?,?,?)', p.id, x.name, x.type, x.input_key, x.description, x.required, sort, x.options, now()); n++;
      }
    });
    plog(p.id, user.id, 'field', `nhập ${n} trường từ Excel`);
    return { imported: n, fields: fieldsOf(p.id) };
  });
  route('PUT', '/api/tasks/:id/fields', ({ user, params, body }) => {
    const t = taskOf(int(params.id)), acc = taskAccess(user, t); need(acc.editInfo, 'Bạn không có quyền sửa thông tin công việc này.');
    tx(() => { saveValues(t.id, t.project_id, body.values || {}, false); run('UPDATE tasks SET updated_at=? WHERE id=?', now(), t.id); tlog(t.id, user.id, 'update', 'trường tùy chỉnh'); });
    return taskFull(user, t.id);
  });
  /* Cập nhật giá trị trường tùy chỉnh hàng loạt từ Excel (Base bài 63000278601): theo Mã công việc (ID); ô trống = xóa giá trị */
  route('POST', '/api/projects/:id/fields/bulk', ({ user, params, body }) => {
    const p = projectOf(int(params.id)); need(canManage(roleIn(user, p.id)), 'Chỉ quản lý mới được cập nhật hàng loạt.');
    const rows = Array.isArray(body.rows) ? body.rows : []; if (!rows.length) bad('Tệp không có dữ liệu.'); if (rows.length > 300) bad('Mỗi lần tối đa 300 công việc.');
    let n = 0;
    tx(() => { for (const [i, r] of rows.entries()) {
      const t = get('SELECT * FROM tasks WHERE id=? AND project_id=?', int(r.id), p.id); if (!t) bad(`Dòng ${i + 2}: mã công việc ${r.id} không thuộc dự án.`);
      const vals = {}; for (const [k, v] of Object.entries(r.values || {})) vals[k] = v === '' ? null : v;
      saveValues(t.id, p.id, vals, false); tlog(t.id, user.id, 'update', 'trường tùy chỉnh (từ Excel)'); n++;
    } });
    plog(p.id, user.id, 'import', `cập nhật trường tùy chỉnh ${n} công việc từ Excel`);
    return { updated: n };
  });

  /* Mở rộng chi tiết công việc, dự án */
  HOOKS.task.push((u, t, p) => {
    t.fields = fieldsOf(p.id); t.field_values = valuesOf(t.id, t.fields);
    t.marked = !!get('SELECT 1 FROM task_marks WHERE user_id=? AND task_id=?', u.id, t.id);
    const rf = t.files.filter(f => f.result_id); t.files = t.files.filter(f => !f.result_id && !f.field_id);
    for (const r of t.results) r.files = rf.filter(f => f.result_id === r.id);
    t.subtasks.forEach(s => { s.depth = 1; });
    t.calendar = { title: t.title, start: t.start_date, due: t.due_date, due_time: t.due_time };
  });
  HOOKS.project.push((u, out) => { out.fields = fieldsOf(out.id); out.tags_preset = settingsOf(out).tags_preset || []; out.tags = [...new Set(out.tags.concat(out.tags_preset))]; });
  HOOKS.create.push((u, id, p, body) => { if (body.fields || fieldsOf(p.id).some(f => f.required)) saveValues(id, p.id, body.fields || {}, !body._import && !(body.quick && body.parent_id)); }); // tạo nhanh việc con: bổ sung trường bắt buộc sau
  HOOKS.clone.push((srcId, newId, keep) => {
    if (keep.fields === false) return;
    run("INSERT INTO task_field_values(task_id,field_id,value) SELECT ?, v.field_id, v.value FROM task_field_values v JOIN task_fields f ON f.id=v.field_id AND f.type<>'file' WHERE v.task_id=?", newId, srcId);
  });
  HOOKS.purge.push(ids => { const ph = ids.map(() => '?').join(','); run(`DELETE FROM task_field_values WHERE task_id IN (${ph})`, ...ids); run(`DELETE FROM task_marks WHERE task_id IN (${ph})`, ...ids); return []; });
  HOOKS.projectPurge.push(pid => {
    const blobs = all('SELECT stored_name FROM project_files WHERE project_id=?', pid).map(r => r.stored_name);
    run('DELETE FROM task_field_values WHERE field_id IN (SELECT id FROM task_fields WHERE project_id=?)', pid);
    run('DELETE FROM task_fields WHERE project_id=?', pid); run('DELETE FROM project_post_comments WHERE post_id IN (SELECT id FROM project_posts WHERE project_id=?)', pid);
    run('DELETE FROM project_posts WHERE project_id=?', pid); run('DELETE FROM project_files WHERE project_id=?', pid); run('DELETE FROM project_logs WHERE project_id=?', pid);
    run('DELETE FROM task_marks WHERE task_id IN (SELECT id FROM tasks WHERE project_id=?)', pid);
    run('DELETE FROM project_favorites WHERE project_id=?', pid);
    for (const n of blobs) FILES.del(n);
    return [];
  });

  /* =================== Đánh dấu, lịch =================== */
  route('POST', '/api/tasks/:id/mark', ({ user, params, body }) => {
    const t = taskOf(int(params.id)); need(taskAccess(user, t).view, 'Bạn không có quyền xem công việc này.');
    if (body.on === false) run('DELETE FROM task_marks WHERE user_id=? AND task_id=?', user.id, t.id);
    else run('INSERT OR IGNORE INTO task_marks(user_id,task_id,created_at) VALUES(?,?,?)', user.id, t.id, now());
    return { marked: body.on !== false };
  });
  /* Tệp iCalendar (Base bài 63000252604: thêm vào iCalendar) */
  route('GET', '/api/tasks/:id/ics', ({ user, params, res }) => {
    const t = taskOf(int(params.id)); need(taskAccess(user, t).view, 'Bạn không có quyền xem công việc này.');
    const icsEsc = s => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
    const d = s => s.replace(/-/g, ''), day = t.due_date || t.start_date || today();
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SmartOffice//Cong viec//VI', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT', `UID:task-${t.id}@smartoffice`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`];
    if (t.due_time) { const [h, m] = t.due_time.split(':'); lines.push(`DTSTART;TZID=Asia/Ho_Chi_Minh:${d(day)}T${h}${m}00`, `DTEND;TZID=Asia/Ho_Chi_Minh:${d(day)}T${h}${m}00`); }
    else lines.push(`DTSTART;VALUE=DATE:${d(day)}`, `DTEND;VALUE=DATE:${d(dstr(dnum(day) + 1))}`);
    lines.push(`SUMMARY:${icsEsc(t.title)}`, `DESCRIPTION:${icsEsc((t.description || '').slice(0, 1000))}`, 'END:VEVENT', 'END:VCALENDAR');
    const body = lines.join('\r\n') + '\r\n';
    res.writeHead(200, { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': `attachment; filename="cong-viec-${t.id}.ics"`, 'X-Content-Type-Options': 'nosniff' });
    res.end(body);
  }, { raw: true });

  /* =================== Thảo luận =================== */
  const postOf = id => get('SELECT * FROM project_posts WHERE id=?', id) || notFound('Thảo luận không tồn tại.');
  route('GET', '/api/projects/:id/posts', ({ user, params, query }) => {
    const p = projectOf(int(params.id)); need(roleIn(user, p.id), 'Bạn không phải thành viên.');
    const { limit, offset } = pageArgs(query);
    return { total: get('SELECT COUNT(*) n FROM project_posts WHERE project_id=?', p.id).n, can_post: p.status !== 'closed' && accountCan(roleIn(user, p.id), settingsOf(p), 'discuss'),
      rows: all(`SELECT p.*, (SELECT COUNT(*) FROM project_post_comments c WHERE c.post_id=p.id) cm_count FROM project_posts p WHERE p.project_id=? ORDER BY p.pinned DESC, COALESCE(p.updated_at,p.created_at) DESC LIMIT ? OFFSET ?`, p.id, limit, offset) };
  });
  route('POST', '/api/projects/:id/posts', ({ user, params, body }) => {
    const p = projectOf(int(params.id)); need(accountCan(roleIn(user, p.id), settingsOf(p), 'discuss'), 'Bạn không có quyền thêm thảo luận mới.');
    if (p.status === 'closed') bad('Dự án/phòng ban đã đóng.');
    const title = str(body.title, 200); if (!title) bad('Vui lòng nhập tiêu đề thảo luận.');
    const id = Number(run('INSERT INTO project_posts(project_id,user_id,title,body,created_at,updated_at) VALUES(?,?,?,?,?,?)', p.id, user.id, title, str(body.body, 20000), now(), now()).lastInsertRowid);
    plog(p.id, user.id, 'post', title);
    return { ...postOf(id), comments: [] };
  });
  route('GET', '/api/posts/:id', ({ user, params }) => {
    const x = postOf(int(params.id)); need(roleIn(user, x.project_id), 'Bạn không phải thành viên.');
    return { ...x, comments: all('SELECT * FROM project_post_comments WHERE post_id=? ORDER BY id LIMIT 500', x.id), can_edit: x.user_id === user.id || canManage(roleIn(user, x.project_id)) };
  });
  route('PUT', '/api/posts/:id', ({ user, params, body }) => {
    const x = postOf(int(params.id)); need(x.user_id === user.id || canManage(roleIn(user, x.project_id)), 'Chỉ người viết hoặc quản lý mới được sửa.');
    const title = str(body.title ?? x.title, 200); if (!title) bad('Vui lòng nhập tiêu đề.');
    run('UPDATE project_posts SET title=?, body=?, pinned=?, updated_at=? WHERE id=?', title, str(body.body ?? x.body, 20000), 'pinned' in body && canManage(roleIn(user, x.project_id)) ? (body.pinned ? 1 : 0) : x.pinned, now(), x.id);
    return { ...postOf(x.id), comments: all('SELECT * FROM project_post_comments WHERE post_id=? ORDER BY id LIMIT 500', x.id), can_edit: true };
  });
  route('DELETE', '/api/posts/:id', ({ user, params }) => {
    const x = postOf(int(params.id)); need(x.user_id === user.id || canManage(roleIn(user, x.project_id)), 'Chỉ người viết hoặc quản lý mới được xóa.');
    tx(() => { run('DELETE FROM project_post_comments WHERE post_id=?', x.id); run('DELETE FROM project_posts WHERE id=?', x.id); });
    return { ok: true };
  });
  route('POST', '/api/posts/:id/comments', ({ user, params, body }) => {
    const x = postOf(int(params.id)); need(roleIn(user, x.project_id), 'Bạn không phải thành viên.');
    const b = str(body.body, 5000); if (!b) bad('Vui lòng nhập nội dung.');
    run('INSERT INTO project_post_comments(post_id,user_id,body,created_at) VALUES(?,?,?,?)', x.id, user.id, b, now());
    run('UPDATE project_posts SET updated_at=? WHERE id=?', now(), x.id);
    return { ...postOf(x.id), comments: all('SELECT * FROM project_post_comments WHERE post_id=? ORDER BY id LIMIT 500', x.id), can_edit: x.user_id === user.id || canManage(roleIn(user, x.project_id)) };
  });
  route('DELETE', '/api/post-comments/:id', ({ user, params }) => {
    const c = get('SELECT * FROM project_post_comments WHERE id=?', int(params.id)) || notFound(); const x = postOf(c.post_id);
    need(c.user_id === user.id || canManage(roleIn(user, x.project_id)), 'Chỉ người viết hoặc quản lý mới được xóa.');
    run('DELETE FROM project_post_comments WHERE id=?', c.id);
    return { ok: true };
  });

  /* =================== Tài liệu dự án =================== */
  route('GET', '/api/projects/:id/files', ({ user, params }) => {
    const p = projectOf(int(params.id)), role = roleIn(user, p.id); need(role, 'Bạn không phải thành viên.');
    const v = canManage(role) || permOf(settingsOf(p)).account.view_others[role] ? { sql: '1=1', args: [] } : visibleFilter(user);
    return { can_upload: p.status !== 'closed' && accountCan(role, settingsOf(p), 'upload_doc'),
      files: all('SELECT * FROM project_files WHERE project_id=? ORDER BY folder, id DESC LIMIT 500', p.id),
      task_files: all(`SELECT f.id, f.kind, f.doc_id, f.file_name, f.file_size, f.uploaded_by, f.created_at, t.id task_id, t.title task_title FROM task_files f JOIN tasks t ON t.id=f.task_id
        WHERE t.project_id=? AND ${v.sql} ORDER BY f.id DESC LIMIT 200`, p.id, ...v.args) };
  });
  route('POST', '/api/projects/:id/files', ({ user, params, body }) => {
    const p = projectOf(int(params.id)); need(accountCan(roleIn(user, p.id), settingsOf(p), 'upload_doc'), 'Bạn không có quyền tải lên tài liệu mới.');
    if (p.status === 'closed') bad('Dự án/phòng ban đã đóng.');
    if (get('SELECT COUNT(*) n FROM project_files WHERE project_id=?', p.id).n >= 500) bad('Mỗi dự án tối đa 500 tài liệu.');
    const f = saveUpload(body, bad, 10 * 1024 * 1024); if (!f) bad('Vui lòng chọn tệp.');
    run('INSERT INTO project_files(project_id,file_name,file_size,mime,stored_name,folder,uploaded_by,created_at) VALUES(?,?,?,?,?,?,?,?)', p.id, f.name, f.size, f.mime, f.stored, str(body.folder, 80), user.id, now());
    plog(p.id, user.id, 'file', f.name);
    return { ok: true };
  });
  route('GET', '/api/project-files/:id', ({ user, params, res }) => {
    const f = get('SELECT * FROM project_files WHERE id=?', int(params.id)) || notFound('Tài liệu không tồn tại.'); need(roleIn(user, f.project_id), 'Bạn không phải thành viên.');
    const buf = FILES.read(f.stored_name); if (!buf) notFound('Không tìm thấy nội dung tệp.');
    sendFile(res, buf, f.file_name, f.mime);
  }, { raw: true });
  route('DELETE', '/api/project-files/:id', ({ user, params }) => {
    const f = get('SELECT * FROM project_files WHERE id=?', int(params.id)) || notFound();
    need(f.uploaded_by === user.id || canManage(roleIn(user, f.project_id)), 'Chỉ người tải lên hoặc quản lý mới được xóa.');
    run('DELETE FROM project_files WHERE id=?', f.id); FILES.del(f.stored_name); plog(f.project_id, user.id, 'file_del', f.file_name);
    return { ok: true };
  });

  /* =================== Hoạt động, thanh thông tin =================== */
  route('GET', '/api/projects/:id/activity', ({ user, params, query }) => {
    const p = projectOf(int(params.id)), role = roleIn(user, p.id); need(role, 'Bạn không phải thành viên.');
    const v = canManage(role) || permOf(settingsOf(p)).account.view_others[role] ? { sql: '1=1', args: [] } : visibleFilter(user);
    const limit = 50, offset = Math.max(int(query.offset), 0);
    return all(`SELECT * FROM (
        SELECT 'task' src, l.id, l.user_id, l.action, l.detail, l.created_at, t.id task_id, t.title task_title FROM task_logs l JOIN tasks t ON t.id=l.task_id WHERE t.project_id=? AND ${v.sql}
        UNION ALL SELECT 'project' src, l.id, l.user_id, l.action, l.detail, l.created_at, NULL, NULL FROM project_logs l WHERE l.project_id=?)
      ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`, p.id, ...v.args, p.id, limit, offset);
  });
  route('GET', '/api/projects/:id/sidebar', ({ user, params }) => {
    const p = projectOf(int(params.id)), role = roleIn(user, p.id); need(role, 'Bạn không phải thành viên.');
    const [T, T2, N] = lateArgs();
    const my = get(`SELECT SUM(t.status='todo') todo, SUM(t.status IN ('doing','review')) doing, SUM(t.status='done') done FROM tasks t WHERE t.project_id=? AND t.assignee_id=?`, p.id, user.id);
    const scope = canManage(role) ? '1=1' : 't.assignee_id=' + Number(user.id);
    return { my, attention: all(`SELECT t.id, t.title, t.due_date, t.assignee_id FROM tasks t WHERE t.project_id=? AND ${scope} AND ${lateExpr} ORDER BY t.due_date LIMIT 5`, p.id, T, T2, N),
      recent: all("SELECT t.id, t.title, t.due_date, t.creator_id FROM tasks t WHERE t.project_id=? AND t.assignee_id=? AND t.status NOT IN ('done','failed') ORDER BY t.created_at DESC LIMIT 5", p.id, user.id),
      activity: all('SELECT user_id, action, detail, created_at FROM project_logs WHERE project_id=? ORDER BY id DESC LIMIT 5', p.id) };
  });

  /* =================== Mẫu dự án =================== */
  const tplVisible = (u, t) => t.owner_id === u.id || isOwner(u) || (t.source_project_id && canManage(roleIn(u, t.source_project_id))) || (() => { const s = parseJSON(t.shared, {}); return (s.users || []).includes(u.id) || (u.dept_id && (s.depts || []).includes(u.dept_id)); })();
  const tplCanEdit = (u, t) => t.owner_id === u.id || isOwner(u) || (t.source_project_id && canManage(roleIn(u, t.source_project_id)));
  function snapshot(pid, inc) {
    const p = projectOf(pid), S = settingsOf(p), data = {};
    if (inc.groups !== false) data.groups = all('SELECT name, description, std_hours, reviewers FROM task_groups WHERE project_id=? AND closed=0 ORDER BY sort, id', pid);
    if (inc.fields !== false) data.fields = fieldsOf(pid).map(f => ({ name: f.name, type: f.type, input_key: f.input_key, description: f.description, required: f.required, options: f.options }));
    if (inc.perm !== false) data.settings = Object.fromEntries(Object.entries(S).filter(([k]) => k !== 'tags_preset'));
    if (inc.tags !== false) data.tags = [...new Set(all("SELECT tags FROM tasks WHERE project_id=? AND tags<>'' LIMIT 2000", pid).flatMap(r => tagList(r.tags)).concat(S.tags_preset || []))].slice(0, 100);
    return data;
  }
  route('GET', '/api/work/templates', ({ user }) => ({
    builtin: BUILTIN.map(t => ({ id: t.id, name: t.name, kind: t.kind, groups: t.data.groups.length, fields: t.data.fields.length })),
    mine: all('SELECT * FROM project_templates ORDER BY id DESC LIMIT 500').filter(t => tplVisible(user, t)).map(t => ({ id: t.id, name: t.name, kind: t.kind, owner_id: t.owner_id, source_project_id: t.source_project_id,
      shared: parseJSON(t.shared, {}), include: parseJSON(t.include, {}), can_edit: tplCanEdit(user, t), updated_at: t.updated_at }))
  }));
  route('POST', '/api/projects/:id/templates', ({ user, params, body }) => {
    const p = projectOf(int(params.id)); need(canManage(roleIn(user, p.id)), 'Chỉ quản lý dự án/phòng ban mới được tạo mẫu.');
    const name = str(body.name, 120); if (!name) bad('Vui lòng nhập tên mẫu.');
    const inc = { groups: body.include?.groups !== false, fields: body.include?.fields !== false, perm: body.include?.perm !== false, tags: body.include?.tags !== false };
    const shared = { users: (body.shared?.users || []).map(int).filter(userOk).slice(0, 200), depts: (body.shared?.depts || []).map(int).filter(d => get('SELECT 1 FROM departments WHERE id=?', d)).slice(0, 100) };
    const id = Number(run('INSERT INTO project_templates(name,kind,owner_id,source_project_id,shared,include,data,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)', name, p.kind, user.id, p.id, JSON.stringify(shared), JSON.stringify(inc), JSON.stringify(snapshot(p.id, inc)), now(), now()).lastInsertRowid);
    plog(p.id, user.id, 'template', `tạo mẫu "${name}"`);
    return { id };
  });
  route('PUT', '/api/work/templates/:id', ({ user, params, body }) => {
    const t = get('SELECT * FROM project_templates WHERE id=?', int(params.id)) || notFound('Mẫu không tồn tại.'); need(tplCanEdit(user, t), 'Bạn không có quyền sửa mẫu này.');
    const inc = body.include ? { groups: body.include.groups !== false, fields: body.include.fields !== false, perm: body.include.perm !== false, tags: body.include.tags !== false } : parseJSON(t.include, {});
    const shared = body.shared ? { users: (body.shared.users || []).map(int).filter(userOk), depts: (body.shared.depts || []).map(int) } : parseJSON(t.shared, {});
    const src = int(body.source_project_id) || t.source_project_id;
    if (src && src !== t.source_project_id) need(canManage(roleIn(user, src)), 'Bạn phải là quản lý của dự án làm căn cứ.');
    const data = src && get('SELECT 1 FROM projects WHERE id=?', src) ? JSON.stringify(snapshot(src, inc)) : t.data;
    run('UPDATE project_templates SET name=?, shared=?, include=?, source_project_id=?, data=?, updated_at=? WHERE id=?', str(body.name ?? t.name, 120) || t.name, JSON.stringify(shared), JSON.stringify(inc), src, data, now(), t.id);
    return { ok: true };
  });
  route('DELETE', '/api/work/templates/:id', ({ user, params }) => {
    const t = get('SELECT * FROM project_templates WHERE id=?', int(params.id)) || notFound('Mẫu không tồn tại.'); need(tplCanEdit(user, t), 'Bạn không có quyền xóa mẫu này.');
    run('DELETE FROM project_templates WHERE id=?', t.id); return { ok: true };
  });
  function applyTemplate(user, pid, tid) {
    let data;
    const b = BUILTIN.find(x => x.id === String(tid));
    if (b) data = b.data;
    else { const t = get('SELECT * FROM project_templates WHERE id=?', int(tid)); if (!t || !tplVisible(user, t)) bad('Mẫu không tồn tại hoặc không được chia sẻ với bạn.'); data = parseJSON(t.data, {}); }
    (data.groups || []).forEach((g, i) => run('INSERT INTO task_groups(project_id,name,description,sort,std_hours,reviewers) VALUES(?,?,?,?,?,?)', pid, str(g.name, 120), str(g.description, 500), i + 1, Number(g.std_hours) || 0, g.reviewers || '[]'));
    (data.fields || []).forEach((f, i) => run('INSERT INTO task_fields(project_id,name,type,input_key,description,required,sort,options,created_at) VALUES(?,?,?,?,?,?,?,?,?)', pid, f.name, f.type, f.input_key, f.description || '', f.required ? 1 : 0, i + 1, JSON.stringify(f.options || {}), now()));
    const S = Object.assign({}, DEFAULT_SETTINGS, data.settings || {}); if (data.tags) S.tags_preset = data.tags;
    run('UPDATE projects SET settings=? WHERE id=?', JSON.stringify(S), pid);
  }

  /* =================== Nhân bản dự án (Base bài 63000273296) =================== */
  route('POST', '/api/projects/:id/clone', ({ user, params, body }) => {
    const src = projectOf(int(params.id)); need(canManage(roleIn(user, src.id)), 'Chỉ quản lý dự án/phòng ban mới được nhân bản.');
    need(canCreateProject(user, src.kind), `Bạn chưa được phân quyền tạo ${src.kind === 'team' ? 'phòng ban' : 'dự án'} mới.`);
    const o = body || {}, name = str(o.name, 120) || ('Bản sao ' + src.name).slice(0, 120);
    const mode = ['all', 'groups', 'none'].includes(o.tasks) ? o.tasks : 'all';
    const shiftH = Number(o.shift_hours) || 0, shiftD = Math.round(shiftH / 24);
    let id, n = 0;
    tx(() => {
      const S = settingsOf(src), keepS = o.keep_settings !== false;
      const S2 = keepS ? { ...S } : { ...DEFAULT_SETTINGS }; if (o.keep_perm === false) delete S2.perm; if (o.keep_tags === false) delete S2.tags_preset;
      id = Number(run(`INSERT INTO projects(name,color,owner_id,kind,description,start_date,end_date,status,health,dept_id,classification,bg,settings,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,'open','on_track',?,?,?,?,?,?)`, name, src.color, user.id, src.kind, src.description, src.start_date, src.end_date, src.dept_id, src.classification, src.bg || '', JSON.stringify(S2), now(), now()).lastInsertRowid);
      run('INSERT INTO project_members(project_id,user_id,role,added_at) VALUES(?,?,?,?)', id, user.id, 'manager', now());
      for (const m of all('SELECT user_id, role FROM project_members WHERE project_id=? AND user_id<>?', src.id, user.id)) {
        if ((m.role === 'manager' && o.keep_managers !== false) || (m.role !== 'manager' && o.keep_members !== false)) run('INSERT INTO project_members(project_id,user_id,role,added_at) VALUES(?,?,?,?)', id, m.user_id, m.role, now());
      }
      const gmap = {};
      if (mode !== 'none') for (const g of all('SELECT * FROM task_groups WHERE project_id=? ORDER BY sort, id', src.id)) gmap[g.id] = Number(run('INSERT INTO task_groups(project_id,name,description,sort,std_hours,closed,reviewers) VALUES(?,?,?,?,?,?,?)', id, g.name, g.description, g.sort, g.std_hours, g.closed, g.reviewers || '[]').lastInsertRowid);
      const fmap = {};
      if (o.keep_fields !== false) for (const f of all('SELECT * FROM task_fields WHERE project_id=? ORDER BY sort, id', src.id)) fmap[f.id] = Number(run('INSERT INTO task_fields(project_id,name,type,input_key,description,required,sort,options,created_at) VALUES(?,?,?,?,?,?,?,?,?)', id, f.name, f.type, f.input_key, f.description, f.required, f.sort, f.options, now()).lastInsertRowid);
      const mmap = {}; for (const m of all('SELECT * FROM project_milestones WHERE project_id=?', src.id)) mmap[m.id] = Number(run('INSERT INTO project_milestones(project_id,title,due_date,owner_id,description,created_by,created_at) VALUES(?,?,?,?,?,?,?)', id, m.title, m.due_date, m.owner_id, m.description, user.id, now()).lastInsertRowid);
      if (mode === 'all') {
        const due = (d, sub) => { if (!d) return null; if (sub && o.keep_sub_deadline === false) return null; if (o.deadline === 'none') return null; if (o.deadline === 'shift' && shiftD) return dstr(dnum(d) + shiftD); return d; };
        const map = {};
        const copy = (t, parentId) => {
          const sub = !!parentId;
          const nid = Number(run(`INSERT INTO tasks(project_id,group_id,parent_id,title,description,assignee_id,creator_id,status,priority,urgent,important,start_date,due_date,due_time,est_hours,progress,tags,goal_id,milestone_id,created_at,updated_at)
            VALUES(?,?,?,?,?,?,?,'todo',?,?,?,?,?,?,?,0,?,?,?,?,?)`, id, t.group_id ? (gmap[t.group_id] || null) : null, parentId, t.title, t.description, o.keep_assignee === false ? null : t.assignee_id,
            o.keep_creator === false ? user.id : t.creator_id, t.priority, t.urgent, t.important, t.start_date, due(t.due_date, sub), o.deadline === 'none' ? null : t.due_time, t.est_hours,
            o.keep_tags === false ? '' : t.tags, t.goal_id, t.milestone_id ? mmap[t.milestone_id] || null : null, now(), now()).lastInsertRowid);
          map[t.id] = nid; n++;
          if (o.keep_followers !== false) run('INSERT OR IGNORE INTO task_followers(task_id,user_id) SELECT ?, user_id FROM task_followers WHERE task_id=?', nid, t.id);
          if (o.keep_checklist !== false) run('INSERT INTO task_checklist(task_id,text,section,assignee_id) SELECT ?, text, section, assignee_id FROM task_checklist WHERE task_id=?', nid, t.id);
          if (o.keep_fields !== false) for (const v of all('SELECT field_id, value FROM task_field_values WHERE task_id=?', t.id)) if (fmap[v.field_id]) run('INSERT INTO task_field_values(task_id,field_id,value) VALUES(?,?,?)', nid, fmap[v.field_id], v.value);
          if (o.keep_subtasks !== false) for (const c of all('SELECT * FROM tasks WHERE parent_id=? ORDER BY id', t.id)) copy(c, nid);
          for (const uid of [t.assignee_id, t.creator_id]) if (uid && o.keep_assignee !== false) ensureMember(id, uid, 'follower');
        };
        for (const t of all('SELECT * FROM tasks WHERE project_id=? AND parent_id IS NULL ORDER BY id LIMIT 3000', src.id)) copy(t, null);
        for (const d of all('SELECT * FROM task_deps WHERE project_id=?', src.id)) if (map[d.pred_id] && map[d.succ_id]) run('INSERT INTO task_deps(project_id,pred_id,succ_id,type,lag_days,created_by,created_at) VALUES(?,?,?,?,?,?,?)', id, map[d.pred_id], map[d.succ_id], d.type, d.lag_days, user.id, now());
      }
      plog(id, user.id, 'clone', `nhân bản từ "${src.name}" (${n} công việc)`);
    });
    log(user.id, `nhân bản <b>${esc(src.name)}</b> thành <b>${esc(name)}</b>`);
    return projectFull(user, projectOf(id));
  });

  /* =================== Nhân bản công việc sang dự án khác (Base bài 63000273298) =================== */
  route('POST', '/api/tasks/:id/clone-to', ({ user, params, body }) => {
    const src = taskOf(int(params.id)); need(taskAccess(user, src).view, 'Bạn không có quyền xem công việc này.');
    const p = projectOf(int(body.project_id)), role = roleIn(user, p.id); need(accountCan(role, settingsOf(p), 'create_task'), 'Bạn không có quyền tạo công việc trong dự án/phòng ban đích.');
    if (p.status === 'closed') bad('Dự án/phòng ban đích đã đóng.');
    const gid = body.group_id ? int(body.group_id) : null; if (gid && !get('SELECT 1 FROM task_groups WHERE id=? AND project_id=?', gid, p.id)) bad('Nhóm công việc không thuộc dự án đích.');
    let id;
    const copy = (t, parentId, depth) => {
      const nid = Number(run(`INSERT INTO tasks(project_id,group_id,parent_id,title,description,assignee_id,creator_id,status,priority,urgent,important,start_date,due_date,due_time,est_hours,progress,tags,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,'todo',?,?,?,?,?,?,?,0,?,?,?)`, p.id, gid, parentId, t.title, t.description, t.assignee_id, user.id, t.priority, t.urgent, t.important, today(),
        depth === 0 ? (isDate(body.due_date) ? body.due_date : null) : (body.keep_sub_deadline ? t.due_date : null), null, t.est_hours, t.tags || '', now(), now()).lastInsertRowid);
      if (t.assignee_id) ensureMember(p.id, t.assignee_id, 'follower');
      if (depth === 0 || body.keep_sub_checklist !== false) run('INSERT INTO task_checklist(task_id,text,section,assignee_id) SELECT ?, text, section, assignee_id FROM task_checklist WHERE task_id=?', nid, t.id);
      if (body.keep_subtasks !== false && depth < MAX_DEPTH) for (const c of all('SELECT * FROM tasks WHERE parent_id=? ORDER BY id', t.id)) copy(c, nid, depth + 1);
      return nid;
    };
    tx(() => { id = copy(src, null, 0); tlog(id, user.id, 'clone', `từ #${src.id} (dự án khác)`); tlog(src.id, user.id, 'clone', `sang #${id}`); plog(p.id, user.id, 'clone', `nhận công việc nhân bản "${src.title}"`); });
    return taskFull(user, id);
  });

  /* =================== Nhập công việc từ Excel (Base bài 63000252615, 63000286215) ===================
   * Trình duyệt đọc tệp .xlsx, gửi các dòng đã chuẩn hóa: { group, title, level (0 = việc cha, 1.. = cấp việc con theo số dấu #), creator, assignee,
   * followers, urgent, important, tags, start, due, done_at, description, milestone, key, deps } */
  function parseDeps(s) {
    const out = [];
    for (const part of String(s || '').split(',').map(x => x.trim()).filter(Boolean)) {
      const m = part.match(/^([A-Za-z0-9_-]+?)(FS|FF|SS|SF)(-?\d+d)?(-?\d+h)?$/i); if (!m) bad(`Phụ thuộc "${part}" không đúng định dạng {Key}{Quan hệ}{Thời gian}, ví dụ 1FS1d2h.`);
      const days = m[3] ? parseInt(m[3], 10) : 0, hours = m[4] ? parseInt(m[4], 10) : 0;
      out.push({ key: m[1], type: m[2].toUpperCase(), lag: Math.max(0, days + (hours >= 12 ? 1 : 0)) });
    }
    return out;
  }
  const toDate = v => { if (!v) return null; const s = String(v).trim(); let m;
    if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return `${m[1]}-${m[2]}-${m[3]}`;
    if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/))) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
    return 'x'; };
  const yes = v => ['có', 'co', 'yes', 'x', '1', 'true'].includes(String(v || '').trim().toLowerCase());
  route('POST', '/api/projects/:id/import', ({ user, params, body }) => {
    const p = projectOf(int(params.id)); need(canManage(roleIn(user, p.id)), 'Chỉ quản lý dự án/phòng ban mới được nhập công việc.');
    if (p.status === 'closed') bad('Dự án/phòng ban đã đóng.');
    const rows = Array.isArray(body.rows) ? body.rows : []; if (!rows.length) bad('Tệp không có dòng dữ liệu.'); if (rows.length > 2000) bad('Mỗi lần nhập tối đa 2.000 dòng.');
    const S = settingsOf(p), withDeps = !!body.with_deps;
    if (withDeps && !(p.kind === 'project' && S.deps)) bad('Vui lòng bật tính năng công việc phụ thuộc trong Thiết lập trước khi nhập.');
    const res = { groups: 0, tasks: 0, deps: 0, errors: [] }; const keys = {};
    tx(() => {
      let gid = null; const stack = [];
      const gfind = name => { const g = get('SELECT id FROM task_groups WHERE project_id=? AND name=?', p.id, name); if (g) return g.id; res.groups++;
        return Number(run('INSERT INTO task_groups(project_id,name,description,sort,std_hours) VALUES(?,?,?,?,?)', p.id, name, '', (get('SELECT MAX(sort) m FROM task_groups WHERE project_id=?', p.id).m || 0) + 1, 0).lastInsertRowid); };
      for (const [i, r] of rows.entries()) {
        const line = r._line || i + 2;
        if (r.group) { gid = gfind(str(r.group, 120)); stack.length = 0; continue; }
        const title = str(r.title, MAX_TITLE); if (!title) { res.errors.push(`Dòng ${line}: thiếu tên công việc.`); continue; }
        const level = Math.min(Math.max(int(r.level), 0), MAX_DEPTH);
        if (level > 0 && !stack[level - 1]) bad(`Dòng ${line}: công việc con cấp ${level} không có công việc cha liền trước.`);
        const parent = level > 0 ? stack[level - 1] : null;
        const who = (n, label) => { if (!n) return null; const u = userByName(n); if (!u) bad(`Dòng ${line}: không tìm thấy tài khoản "${n}" (${label}).`); return u.id; };
        const creator = who(r.creator, 'người giao') || user.id, assignee = who(r.assignee, 'người thực hiện');
        const start = toDate(r.start) || today(), due = toDate(r.due), doneAt = toDate(r.done_at);
        for (const [v, lab] of [[start, 'Ngày bắt đầu'], [due, 'Deadline'], [doneAt, 'Hoàn thành thực tế']]) if (v === 'x') bad(`Dòng ${line}: ${lab} không đúng định dạng dd/mm/yyyy.`);
        if (due && due < start) bad(`Dòng ${line}: Deadline trước Ngày bắt đầu.`);
        let ms = null; if (r.milestone) { const m = get('SELECT id FROM project_milestones WHERE project_id=? AND title=?', p.id, str(r.milestone, 200)); if (!m) bad(`Dòng ${line}: không có mốc dự án "${r.milestone}".`); ms = m.id; }
        const id = Number(run(`INSERT INTO tasks(project_id,group_id,parent_id,title,description,assignee_id,creator_id,status,priority,urgent,important,start_date,due_date,progress,tags,milestone_id,done_at,completed_at,created_at,updated_at)
          VALUES(?,?,?,?,?,?,?,?,'tb',?,?,?,?,?,?,?,?,?,?,?)`, p.id, parent ? parent.group_id : gid, parent ? parent.id : null, title, str(r.description, 10000), assignee, creator, doneAt ? 'done' : 'todo',
          yes(r.urgent) ? 1 : 0, yes(r.important) ? 1 : 0, start, due, doneAt ? 100 : 0, normTags(r.tags), ms, doneAt ? doneAt + ' 17:00:00' : null, doneAt ? doneAt + ' 17:00:00' : null, now(), now()).lastInsertRowid);
        if (assignee) ensureMember(p.id, assignee, 'follower');
        for (const f of String(r.followers || '').split(',').map(x => x.trim()).filter(Boolean)) { const fu = who(f, 'người theo dõi'); run('INSERT OR IGNORE INTO task_followers(task_id,user_id) VALUES(?,?)', id, fu); ensureMember(p.id, fu, 'follower'); }
        if (r.fields && Object.keys(r.fields).length) saveValues(id, p.id, r.fields, false);
        tlog(id, user.id, 'create', 'nhập từ Excel');
        stack[level] = { id, group_id: parent ? parent.group_id : gid }; stack.length = level + 1; res.tasks++;
        if (withDeps && r.key) { if (keys[r.key]) bad(`Dòng ${line}: Key "${r.key}" bị trùng.`); keys[r.key] = { id, deps: r.deps, line }; }
      }
      if (withDeps) for (const k of Object.values(keys)) for (const d of parseDeps(k.deps)) {
        const pred = keys[d.key]; if (!pred) bad(`Dòng ${k.line}: Key phụ thuộc "${d.key}" không tồn tại trong tệp.`);
        if (pred.id === k.id) bad(`Dòng ${k.line}: công việc không thể phụ thuộc chính nó.`);
        run('INSERT OR IGNORE INTO task_deps(project_id,pred_id,succ_id,type,lag_days,created_by,created_at) VALUES(?,?,?,?,?,?,?)', p.id, pred.id, k.id, d.type, d.lag, user.id, now()); res.deps++;
      }
      plog(p.id, user.id, 'import', `nhập ${res.tasks} công việc, ${res.groups} nhóm${withDeps ? ', ' + res.deps + ' phụ thuộc' : ''} từ Excel`);
    });
    return res;
  });
  /* Cập nhật thời gian bắt đầu/thời hạn từ Excel theo mã công việc (Base bài 63000271425): tối đa 300 */
  route('POST', '/api/projects/:id/tasks/dates', ({ user, params, body }) => {
    const p = projectOf(int(params.id)); need(canManage(roleIn(user, p.id)), 'Chỉ quản lý dự án/phòng ban mới được cập nhật hàng loạt.');
    const rows = Array.isArray(body.rows) ? body.rows : []; if (!rows.length) bad('Tệp không có dữ liệu.'); if (rows.length > 300) bad('Tệp cập nhật tối đa 300 công việc.');
    const S = settingsOf(p); let n = 0;
    tx(() => { for (const [i, r] of rows.entries()) {
      const t = get('SELECT * FROM tasks WHERE id=? AND project_id=?', int(r.id), p.id); if (!t) bad(`Dòng ${i + 2}: mã công việc ${r.id} không thuộc dự án.`);
      const set = {};
      const parse = (v, def) => { const m = String(v || '').trim().match(/^(\S+)(?:\s+(\d{1,2}):(\d{2}))?$/); if (!m) return null; const d = toDate(m[1]); if (!d || d === 'x') bad(`Dòng ${i + 2}: ngày không đúng định dạng dd/mm/yy hh:mm.`); return { d, t: m[2] ? `${m[2].padStart(2, '0')}:${m[3]}` : def }; };
      if (body.start !== false && r.start) set.start_date = parse(r.start, '00:00').d;
      if (body.due !== false && r.due) { const x = parse(r.due, '23:59'); set.due_date = x.d; if (S.deadline_time) set.due_time = x.t; }
      const st = set.start_date || t.start_date, du = set.due_date || t.due_date; if (st && du && du < st) bad(`Dòng ${i + 2}: thời hạn trước ngày bắt đầu.`);
      const ks = Object.keys(set); if (!ks.length) continue;
      run(`UPDATE tasks SET ${ks.map(k => k + '=?').join(', ')}, updated_at=? WHERE id=?`, ...ks.map(k => set[k]), now(), t.id);
      tlog(t.id, user.id, 'update', 'thời gian (từ Excel)'); n++;
    } });
    plog(p.id, user.id, 'import', `cập nhật thời gian ${n} công việc từ Excel`);
    return { updated: n };
  });

  /* =================== Xuất dữ liệu (trình duyệt dựng tệp .xlsx) ===================
   * basis: created (ngày tạo) | due (thời hạn) | active (thời gian thực hiện, Base bài 63000252614 và 63000268365) */
  function exportRows(where, args, q, maxTasks, maxSubs) {
    const from = isDate(q.from) ? q.from : null, to = isDate(q.to) ? q.to : null, w = [...where], a = [...args];
    if (q.basis === 'due') { if (from) { w.push('t.due_date>=?'); a.push(from); } if (to) { w.push('t.due_date<=?'); a.push(to); } }
    else if (q.basis === 'active') {
      if (from && to) { w.push(`((substr(t.created_at,1,10)<? AND (t.status NOT IN ${CLOSED} OR substr(COALESCE(t.done_at,t.updated_at),1,10)>?)) OR substr(t.created_at,1,10) BETWEEN ? AND ? OR substr(COALESCE(t.done_at,''),1,10) BETWEEN ? AND ?)`); a.push(from, to, from, to, from, to); }
      else if (from) { w.push(`(t.status NOT IN ${CLOSED} OR substr(COALESCE(t.done_at,t.updated_at),1,10)>=?)`); a.push(from); }
      else if (to) { w.push('substr(t.created_at,1,10)<=?'); a.push(to); }
    } else { if (from) { w.push('substr(t.created_at,1,10)>=?'); a.push(from); } if (to) { w.push('substr(t.created_at,1,10)<=?'); a.push(to); } }
    if (!q.sub) w.push('t.parent_id IS NULL');
    const rows = all(`SELECT t.*, p.name project_name, g.name group_name FROM tasks t JOIN projects p ON p.id=t.project_id LEFT JOIN task_groups g ON g.id=t.group_id
      WHERE ${w.join(' AND ')} ORDER BY p.id, t.group_id, COALESCE(t.parent_id,t.id), t.id LIMIT ?`, ...a, maxTasks + maxSubs + 1);
    const tops = rows.filter(r => !r.parent_id).length, subs = rows.length - tops;
    if (tops > maxTasks || subs > maxSubs) bad(`Vượt giới hạn xuất (${maxTasks.toLocaleString('vi-VN')} công việc, ${maxSubs.toLocaleString('vi-VN')} công việc con). Vui lòng thu hẹp khoảng thời gian.`);
    const fol = {}; if (rows.length) for (const f of all(`SELECT task_id, user_id FROM task_followers WHERE task_id IN (${rows.map(() => '?').join(',')})`, ...rows.map(r => r.id))) (fol[f.task_id] = fol[f.task_id] || []).push(f.user_id);
    return rows.map(r => ({ ...r, tags: tagList(r.tags), followers: fol[r.id] || [] }));
  }
  /* Bảng tên đăng nhập để tệp xuất nhập lại được (Base nhập theo username) */
  const userMap = rows => { const ids = new Set(); for (const r of rows) { if (r.assignee_id) ids.add(r.assignee_id); if (r.creator_id) ids.add(r.creator_id); for (const f of r.followers || []) ids.add(f); }
    const out = {}; if (ids.size) for (const u of all(`SELECT id, username, full_name FROM users WHERE id IN (${[...ids].map(() => '?').join(',')})`, ...ids)) out[u.id] = { username: u.username, full_name: u.full_name }; return out; };
  route('GET', '/api/projects/:id/export', ({ user, params, query }) => {
    const p = projectOf(int(params.id)), role = roleIn(user, p.id); need(role, 'Bạn không phải thành viên.');
    const v = canManage(role) || permOf(settingsOf(p)).account.view_others[role] ? { sql: '1=1', args: [] } : visibleFilter(user);
    const rows = exportRows([`t.project_id=?`, v.sql], [p.id, ...v.args], query, 3000, 5000);
    const fids = String(query.fields || '').split(',').map(Number).filter(Boolean), fields = fieldsOf(p.id).filter(f => fids.includes(f.id) || query.fields === 'all');
    if (fields.length) { const vm = valuesMany(rows.map(r => r.id), fields); for (const r of rows) r.fields = vm[r.id]; }
    return { project: { id: p.id, name: p.name, kind: p.kind, color: p.color }, fields, rows, users: userMap(rows), milestones: all('SELECT id, title FROM project_milestones WHERE project_id=?', p.id) };
  });
  /* Xuất công việc của tôi */
  route('GET', '/api/work/export-mine', ({ user, query }) => { const rows = exportRows(['t.assignee_id=?'], [user.id], query, 3000, 5000); return { rows, users: userMap(rows) }; });
  /* Owner: xuất nhiều dự án cùng lúc (tối đa 500 dự án, 3.000 công việc, 5.000 công việc con) */
  route('GET', '/api/work/export', ({ user, query }) => {
    need(isAppAdmin(user), 'Chỉ quản trị hệ thống mới xuất được công việc của nhiều dự án/phòng ban.');
    let ids = String(query.projects || '').split(',').map(Number).filter(Boolean);
    if (query.dept) ids = ids.concat(all('SELECT id FROM projects WHERE dept_id=?', int(query.dept)).map(r => r.id));
    ids = [...new Set(ids)]; if (!ids.length) bad('Vui lòng chọn dự án/phòng ban.'); if (ids.length > 500) bad('Tối đa 500 dự án/phòng ban mỗi lần xuất.');
    const rows = exportRows([`t.project_id IN (${ids.map(() => '?').join(',')})`], ids, query, 3000, 5000); return { rows, users: userMap(rows) };
  });

  /* =================== Báo cáo thành viên (Base bài 63000271837, 63000252592) =================== */
  const canSeeMember = (u, uid) => u.id === uid || isOwner(u) || !!get('SELECT 1 FROM users x JOIN departments d ON d.id=x.dept_id WHERE x.id=? AND d.head_id=?', uid, u.id);
  route('GET', '/api/work/members', ({ user, query }) => {
    const [T, T2, N] = lateArgs();
    const w = ['u.active=1'], a = [];
    if (!isOwner(user)) { w.push('(u.id=? OR u.dept_id IN (SELECT id FROM departments WHERE head_id=?))'); a.push(user.id, user.id); }
    if (query.dept) { w.push('u.dept_id=?'); a.push(int(query.dept)); }
    if (query.q) { w.push('u.full_name LIKE ?'); a.push('%' + str(query.q, 80) + '%'); }
    return all(`SELECT u.id, u.full_name, u.title, u.dept_id,
        (SELECT COUNT(*) FROM project_members m WHERE m.user_id=u.id) projects,
        (SELECT COUNT(*) FROM tasks t WHERE t.assignee_id=u.id AND t.status NOT IN ${CLOSED}) open,
        (SELECT COUNT(*) FROM tasks t WHERE t.assignee_id=u.id AND ${lateExpr}) late,
        (SELECT COUNT(*) FROM tasks t WHERE t.assignee_id=u.id AND t.status='done') done
      FROM users u WHERE ${w.join(' AND ')} ORDER BY u.full_name LIMIT 500`, T, T2, N, ...a);
  });
  route('GET', '/api/work/members/:id/report', ({ user, params, query }) => {
    const uid = int(params.id); need(canSeeMember(user, uid), 'Bạn chỉ xem được báo cáo của mình hoặc nhân viên do mình quản lý.');
    const u = get('SELECT id, full_name, title, dept_id FROM users WHERE id=?', uid) || notFound('Thành viên không tồn tại.');
    const [T, T2, N] = lateArgs();
    const from = isDate(query.from) ? query.from : D.addDays ? D.addDays(today(), -30) : dstr(dnum(today()) - 30), to = isDate(query.to) ? query.to : today();
    const v = isOwner(user) || user.id === uid ? { sql: '1=1', args: [] } : visibleFilter(user);
    const w = ['t.assignee_id=?', v.sql], a = [uid, ...v.args];
    if (query.project) { w.push('t.project_id=?'); a.push(int(query.project)); }
    if (query.basis === 'due') { w.push('t.due_date BETWEEN ? AND ?'); a.push(from, to); }
    else { w.push(`(substr(t.created_at,1,10) BETWEEN ? AND ? OR (substr(t.created_at,1,10)<? AND (t.status NOT IN ${CLOSED} OR substr(COALESCE(t.done_at,''),1,10)>=?)))`); a.push(from, to, from, from); }
    const sw = [...w], sa = [...a];
    if (query.status === 'late') { sw.push(lateExpr); sa.push(T, T2, N); } else if (['todo', 'doing', 'review', 'done', 'failed'].includes(query.status)) { sw.push('t.status=?'); sa.push(query.status); }
    const base = `FROM tasks t WHERE ${w.join(' AND ')}`;
    const sum = get(`SELECT COUNT(*) total, SUM(t.status='todo') todo, SUM(t.status IN ('doing','review')) doing, SUM(t.status='done') done,
      SUM(t.status='done' AND t.due_date IS NOT NULL AND substr(COALESCE(t.completed_at,t.done_at),1,10) > t.due_date) done_late, SUM(${lateExpr}) late, SUM(t.urgent=1 AND t.status NOT IN ${CLOSED}) urgent,
      ROUND(SUM(COALESCE(t.est_hours,0)),2) est_hours ${base}`, T, T2, N, ...a);
    /* Biểu đồ tiến độ: một truy vấn lấy mốc thời gian của các công việc, tính tích lũy trong bộ nhớ (HN: không truy vấn trong vòng lặp) */
    const series = [], span = Math.min(dnum(to) - dnum(from), 92), pts = all(`SELECT substr(t.created_at,1,10) c, substr(COALESCE(t.done_at,''),1,10) dn, t.status s, t.due_date du ${base} LIMIT 5000`, ...a);
    for (let i = 0; i <= span; i += Math.max(1, Math.ceil(span / 31))) {
      const d = dstr(dnum(from) + i); let active = 0, done = 0, overdue = 0;
      for (const x of pts) { if (x.c > d) continue; const closedBy = x.dn && x.dn <= d && (x.s === 'done' || x.s === 'failed'); if (x.s === 'done' && x.dn && x.dn <= d) done++; if (!closedBy) { active++; if (x.du && x.du < d) overdue++; } }
      series.push({ d, active, done, overdue });
    }
    return { user: u, from, to, summary: sum, series,
      tasks: all(`SELECT ${TASK_COLS}, p.name project_name, p.color project_color FROM tasks t JOIN projects p ON p.id=t.project_id WHERE ${sw.join(' AND ')} ORDER BY p.name, t.due_date LIMIT 200`, ...sa).map(shape),
      by_project: all(`SELECT t.project_id, p.name, COUNT(*) n ${base.replace('FROM tasks t', 'FROM tasks t JOIN projects p ON p.id=t.project_id')} GROUP BY t.project_id ORDER BY n DESC LIMIT 20`, ...a),
      goals: all(`SELECT g.id, g.title, g.current, g.target, g.unit, COUNT(t.id) n, SUM(t.status='done') done FROM tasks t JOIN goals g ON g.id=t.goal_id WHERE t.assignee_id=? GROUP BY g.id LIMIT 20`, uid),
      milestones: all(`SELECT m.id, m.title, m.due_date, COUNT(t.id) n, SUM(t.status='done') done FROM tasks t JOIN project_milestones m ON m.id=t.milestone_id WHERE t.assignee_id=? GROUP BY m.id LIMIT 20`, uid),
      staff: all('SELECT x.id, x.full_name FROM users x JOIN departments d ON d.id=x.dept_id WHERE d.head_id=? AND x.id<>? AND x.active=1 ORDER BY x.full_name', uid, uid),
      delegates: all('SELECT delegate_id FROM work_delegations WHERE owner_id=?', uid).map(r => r.delegate_id) };
  });

  /* =================== Báo cáo hệ thống (Base bài 63000271457; chỉ Owner/quản trị ứng dụng) =================== */
  route('GET', '/api/work/system-report', ({ user, query }) => {
    need(isAppAdmin(user), 'Chỉ quản trị hệ thống mới xem được báo cáo hệ thống.');
    const [T, T2, N] = lateArgs();
    const from = isDate(query.from) ? query.from : dstr(dnum(today()) - 30), to = isDate(query.to) ? query.to : today();
    const w = ["p.id IS NOT NULL"], a = [];
    if (query.basis === 'due') { w.push('t.due_date BETWEEN ? AND ?'); a.push(from, to); } else { w.push('substr(t.created_at,1,10) BETWEEN ? AND ?'); a.push(from, to); }
    if (query.dept) { w.push('p.dept_id=?'); a.push(int(query.dept)); }
    if (!query.sub) w.push('t.parent_id IS NULL');
    if (['todo', 'doing', 'review', 'done', 'failed'].includes(query.status)) { w.push('t.status=?'); a.push(query.status); }
    const B = `FROM tasks t JOIN projects p ON p.id=t.project_id WHERE ${w.join(' AND ')}`;
    const ontime = `t.status='done' AND (t.due_date IS NULL OR substr(COALESCE(t.completed_at,t.done_at),1,10) <= t.due_date)`, donelate = `t.status='done' AND t.due_date IS NOT NULL AND substr(COALESCE(t.completed_at,t.done_at),1,10) > t.due_date`;
    const st = get(`SELECT COUNT(*) total, SUM(${ontime}) done_ontime, SUM(${donelate}) done_late, SUM(t.status NOT IN ${CLOSED} AND NOT COALESCE(${lateExpr},0)) in_progress, SUM(${lateExpr}) overdue,
      SUM(t.status NOT IN ${CLOSED}) active, SUM(t.status='done') done, SUM(t.status='failed') failed, SUM(t.status='review') review, SUM(t.status='review' AND ${lateExpr.replace(/t\.status NOT IN \('done','failed'\) AND /, '')}) review_late,
      SUM(t.due_date IS NULL) no_deadline, SUM(t.important=1 AND t.urgent=0) imp, SUM(t.important=1 AND t.urgent=1) imp_urg, SUM(t.urgent=1 AND t.important=0) urg, SUM(t.urgent=0 AND t.important=0) none ${B}`, T, T2, N, T, T2, N, T, T2, N, ...a);
    const per = (sel, grp, ord, lim) => { const k = (sel.split(lateExpr).length - 1) + (grp.split(lateExpr).length - 1); const la = []; for (let i = 0; i < k; i++) la.push(T, T2, N);
      return all(`SELECT ${sel} ${B} ${grp} ${ord} LIMIT ${lim}`, ...la, ...a); };
    const weeks = [], days = [];
    /* Xu hướng theo ngày: 3 truy vấn gộp nhóm, không truy vấn trong vòng lặp (HN) */
    const span = Math.min(dnum(to) - dnum(from), 92);
    const grp = (expr, cond) => Object.fromEntries(all(`SELECT ${expr} d, COUNT(*) n ${B} ${cond} GROUP BY d`, ...a).map(r => [r.d, r.n]));
    const cr = grp('substr(t.created_at,1,10)', ''), dn = grp("substr(COALESCE(t.done_at,''),1,10)", "AND t.status='done'"), od = grp('t.due_date', `AND t.status NOT IN ${CLOSED}`);
    for (let i = 0; i <= span; i++) { const d = dstr(dnum(from) + i); days.push({ d, created: cr[d] || 0, done: dn[d] || 0, overdue: d < T ? (od[d] || 0) : 0 }); }
    for (let i = 0; i < days.length; i += 7) { const wk = days.slice(i, i + 7); weeks.push({ from: wk[0].d, to: wk[wk.length - 1].d, created: wk.reduce((s, x) => s + (x.created || 0), 0), done: wk.reduce((s, x) => s + (x.done || 0), 0), overdue: wk.reduce((s, x) => s + (x.overdue || 0), 0) }); }
    const tagCount = {}; for (const r of all(`SELECT t.tags ${B} AND t.tags<>'' LIMIT 20000`, ...a)) for (const g of tagList(r.tags)) tagCount[g] = (tagCount[g] || 0) + 1;
    const weeksN = Math.max(1, (dnum(to) - dnum(from) + 1) / 7), users = get('SELECT COUNT(*) n FROM users WHERE active=1').n;
    return { from, to,
      overview: {
        projects: get("SELECT COUNT(*) n, SUM(classification='customer') external, SUM(classification<>'customer' OR classification IS NULL) internal FROM projects WHERE kind='project'" + (query.dept ? ' AND dept_id=' + int(query.dept) : '')),
        teams: get("SELECT COUNT(*) n, SUM(status<>'closed') active, SUM(status='closed') closed FROM projects WHERE kind='team'" + (query.dept ? ' AND dept_id=' + int(query.dept) : '')),
        milestones: get("SELECT COUNT(*) n, SUM((SELECT COUNT(*) FROM tasks t WHERE t.milestone_id=m.id)>0 AND (SELECT COUNT(*) FROM tasks t WHERE t.milestone_id=m.id AND t.status<>'done')=0) completed FROM project_milestones m"),
        members: { n: users, guests: get("SELECT COUNT(DISTINCT user_id) n FROM project_members WHERE role='guest'").n }
      },
      status: st,
      top_members: per(`t.assignee_id user_id, SUM(t.status='done') done, COUNT(*) total`, 'AND t.assignee_id IS NOT NULL GROUP BY t.assignee_id', 'ORDER BY done DESC', 5),
      member_detail: per(`t.assignee_id user_id, SUM(${ontime}) ontime, SUM(${donelate}) late_done, SUM(${lateExpr}) overdue, SUM(t.status='review') review, COUNT(*) total`, 'AND t.assignee_id IS NOT NULL GROUP BY t.assignee_id', 'ORDER BY total DESC', 500),
      most_open: per(`t.assignee_id user_id, SUM(t.status NOT IN ${CLOSED}) open`, 'AND t.assignee_id IS NOT NULL GROUP BY t.assignee_id HAVING open>0', 'ORDER BY open DESC', 10),
      most_late: per(`t.assignee_id user_id, SUM(${lateExpr}) late`, 'AND t.assignee_id IS NOT NULL GROUP BY t.assignee_id HAVING late>0', 'ORDER BY late DESC', 10),
      by_project: per(`p.id, p.name, p.kind, COUNT(*) total, SUM(t.status='done') done, SUM(${lateExpr}) overdue, SUM(t.status='review') review`, 'GROUP BY p.id', 'ORDER BY total DESC', 50),
      project_summary: get(`SELECT SUM(status<>'closed' AND health='on_track') on_track, SUM(status<>'closed' AND health='late') late, SUM(status<>'closed' AND health='risk') risk,
        SUM(status='closed' AND close_result='success') closed_success, SUM(status='closed' AND close_result='failed') closed_failed, SUM(status='closed' AND close_result='cancelled') closed_cancelled FROM projects WHERE kind='project'`),
      by_dept: per(`p.dept_id, COUNT(*) total, SUM(t.status IN ('todo','doing')) doing, SUM(t.status='done') done, SUM(${lateExpr}) overdue, SUM(t.status='review') review`, 'GROUP BY p.dept_id', 'ORDER BY total DESC', 100),
      milestones: all(`SELECT m.id, m.title, m.due_date, m.owner_id, p.name project_name, p.dept_id, (SELECT COUNT(*) FROM tasks t WHERE t.milestone_id=m.id) total, (SELECT COUNT(*) FROM tasks t WHERE t.milestone_id=m.id AND t.status='done') done
        FROM project_milestones m JOIN projects p ON p.id=m.project_id ORDER BY m.due_date DESC LIMIT 100`),
      days, weeks, tags: Object.entries(tagCount).sort((x, y) => y[1] - x[1]).slice(0, 60).map(([tag, n]) => ({ tag, n })),
      unit: { per_week: Math.round((st.total || 0) / weeksN * 10) / 10, per_user_week: Math.round((st.total || 0) / weeksN / Math.max(1, users) * 10) / 10,
        per_project: Math.round((get('SELECT COUNT(*) n FROM tasks').n / Math.max(1, get('SELECT COUNT(*) n FROM projects').n)) * 10) / 10, comments: get('SELECT COUNT(*) n FROM task_comments').n } };
  });

  /* =================== Tác vụ hàng loạt (Base bài 63000286115; chỉ Owner) =================== */
  route('GET', '/api/work/bulk/tasks', ({ user, query }) => {
    need(isOwner(user), 'Chỉ quản trị hệ thống mới dùng được tác vụ hàng loạt.');
    const uid = int(query.user); if (!uid) bad('Vui lòng chọn người dùng.');
    const role = ['assignee', 'creator', 'follower'].includes(query.role) ? query.role : 'assignee';
    const w = [role === 'follower' ? 'EXISTS (SELECT 1 FROM task_followers f WHERE f.task_id=t.id AND f.user_id=?)' : `t.${role}_id=?`], a = [uid];
    if (query.status === 'open' || !query.status) w.push(`t.status NOT IN ${CLOSED}`);
    if (query.project) { w.push('t.project_id=?'); a.push(int(query.project)); }
    const { limit, offset } = pageArgs(query);
    return { total: get(`SELECT COUNT(*) n FROM tasks t WHERE ${w.join(' AND ')}`, ...a).n,
      rows: all(`SELECT ${TASK_COLS}, p.name project_name, p.color project_color FROM tasks t JOIN projects p ON p.id=t.project_id WHERE ${w.join(' AND ')} ORDER BY p.name, t.id LIMIT ? OFFSET ?`, ...a, limit, offset).map(shape) };
  });
  route('POST', '/api/work/bulk/tasks', ({ user, body }) => {
    need(isOwner(user), 'Chỉ quản trị hệ thống mới dùng được tác vụ hàng loạt.');
    const ids = [...new Set((Array.isArray(body.task_ids) ? body.task_ids : []).map(int))]; if (!ids.length) bad('Vui lòng chọn công việc.'); if (ids.length > 500) bad('Mỗi lần tối đa 500 công việc.');
    const to = int(body.to_user); if (!userOk(to)) bad('Vui lòng chọn người thay thế.');
    const action = ['assignee', 'creator', 'add_follower'].includes(body.action) ? body.action : bad('Thao tác không hợp lệ.');
    const toName = get('SELECT full_name FROM users WHERE id=?', to).full_name; let n = 0;
    tx(() => { for (const id of ids) {
      const t = get('SELECT * FROM tasks WHERE id=?', id); if (!t) continue;
      if (action === 'assignee') { run('UPDATE tasks SET assignee_id=?, updated_at=? WHERE id=?', to, now(), id); ensureMember(t.project_id, to, 'follower'); tlog(id, user.id, 'update', `tác vụ hàng loạt: thay người nhận việc → ${toName}`); }
      if (action === 'creator') { run('UPDATE tasks SET creator_id=?, updated_at=? WHERE id=?', to, now(), id); ensureMember(t.project_id, to, 'follower'); tlog(id, user.id, 'update', `tác vụ hàng loạt: thay người giao việc → ${toName}`); }
      if (action === 'add_follower') { run('INSERT OR IGNORE INTO task_followers(task_id,user_id) VALUES(?,?)', id, to); ensureMember(t.project_id, to, 'follower'); tlog(id, user.id, 'followers', `tác vụ hàng loạt: thêm ${toName}`); }
      n++;
    } });
    log(user.id, `tác vụ hàng loạt trên ${n} công việc (${action})`);
    return { updated: n };
  });
  route('GET', '/api/work/bulk/projects', ({ user, query }) => {
    need(isOwner(user), 'Chỉ quản trị hệ thống mới dùng được tác vụ hàng loạt.');
    const uid = int(query.user); if (!uid) bad('Vui lòng chọn người dùng.');
    return all("SELECT p.id, p.name, p.kind, p.status, p.color, m.role FROM project_members m JOIN projects p ON p.id=m.project_id WHERE m.user_id=? AND m.role IN ('manager','member','guest') ORDER BY p.status='closed', p.name LIMIT 500", uid);
  });
  route('POST', '/api/work/bulk/projects', ({ user, body }) => {
    need(isOwner(user), 'Chỉ quản trị hệ thống mới dùng được tác vụ hàng loạt.');
    const uid = int(body.user), ids = [...new Set((Array.isArray(body.project_ids) ? body.project_ids : []).map(int))];
    if (!uid || !ids.length) bad('Vui lòng chọn người dùng và dự án/phòng ban.');
    const action = ['replace', 'demote', 'remove'].includes(body.action) ? body.action : bad('Thao tác không hợp lệ.');
    const to = action === 'replace' ? int(body.to_user) : null; if (action === 'replace' && !userOk(to)) bad('Vui lòng chọn người thay thế.');
    const uname = (get('SELECT full_name FROM users WHERE id=?', uid) || {}).full_name || '#' + uid; let n = 0;
    tx(() => { for (const pid of ids) {
      const m = get('SELECT role FROM project_members WHERE project_id=? AND user_id=?', pid, uid); if (!m) continue;
      if (action === 'demote') { if (m.role !== 'manager') continue; run("UPDATE project_members SET role='member' WHERE project_id=? AND user_id=?", pid, uid); plog(pid, user.id, 'member', `tác vụ hàng loạt: hạ quyền quản lý của ${uname} xuống thành viên`); }
      if (action === 'remove' || action === 'replace') {
        if (m.role === 'manager' && !(action === 'replace') && get("SELECT COUNT(*) n FROM project_members WHERE project_id=? AND role='manager'", pid).n <= 1) bad(`Dự án #${pid}: phải còn ít nhất một quản lý; dùng "Thay thế vai trò".`);
        run('DELETE FROM project_members WHERE project_id=? AND user_id=?', pid, uid);
        if (action === 'replace') { run('DELETE FROM project_members WHERE project_id=? AND user_id=?', pid, to); run('INSERT INTO project_members(project_id,user_id,role,added_at) VALUES(?,?,?,?)', pid, to, m.role, now()); }
        plog(pid, user.id, 'member', action === 'replace' ? `tác vụ hàng loạt: thay ${uname} bằng ${(get('SELECT full_name FROM users WHERE id=?', to) || {}).full_name} (${m.role})` : `tác vụ hàng loạt: xóa ${uname} khỏi dự án/phòng ban`);
      }
      n++;
    } });
    log(user.id, `tác vụ hàng loạt trên ${n} dự án/phòng ban (${action})`);
    return { updated: n };
  });

  /* Ghi lịch sử dự án cho các thao tác ở work.js (đóng, mở, thành viên...) qua log chung */
  return { applyTemplate, plog, fieldsOf, saveValues, valuesOf, FTYPES };
}

module.exports = { register, BUILTIN, FTYPES };
