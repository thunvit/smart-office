'use strict';
/**
 * SmartOffice — Phân hệ Công việc – Dự án (phiên bản 2).
 * Căn cứ: docs/02-thiet-ke/YEU-CAU-CONG-VIEC-DU-AN.md, ADR-005.
 * Tuân thủ: ATTT-12/13 (kiểm tra quyền tại máy chủ), HN-07 (phân trang ≤ 200), chạy được trên Workers (CLAUDE.md mục 3.3).
 */
const D = require('./db');
const { db, all, get, run, tx, today, now, addCol } = D;
const { FILES, saveUpload, sendFile } = require('./files');

/* ================= Lược đồ ================= */
db.exec(`
CREATE TABLE IF NOT EXISTS project_members (
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE, user_id INTEGER NOT NULL REFERENCES users(id),
  role TEXT NOT NULL DEFAULT 'member', added_at TEXT, PRIMARY KEY(project_id, user_id));
CREATE INDEX IF NOT EXISTS ix_pm_user ON project_members(user_id);
CREATE TABLE IF NOT EXISTS task_groups (
  id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE, name TEXT NOT NULL,
  description TEXT DEFAULT '', sort INTEGER DEFAULT 0, closed INTEGER DEFAULT 0, std_hours REAL DEFAULT 0);
CREATE INDEX IF NOT EXISTS ix_tg_project ON task_groups(project_id, sort);
CREATE TABLE IF NOT EXISTS task_followers (
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, user_id INTEGER NOT NULL REFERENCES users(id), PRIMARY KEY(task_id, user_id));
CREATE INDEX IF NOT EXISTS ix_tf_user ON task_followers(user_id);
CREATE TABLE IF NOT EXISTS task_results (
  id INTEGER PRIMARY KEY, task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, user_id INTEGER, note TEXT DEFAULT '', progress INTEGER, created_at TEXT);
CREATE INDEX IF NOT EXISTS ix_tr_task ON task_results(task_id);
CREATE TABLE IF NOT EXISTS task_logs (
  id INTEGER PRIMARY KEY, task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, user_id INTEGER, action TEXT, detail TEXT DEFAULT '', created_at TEXT);
CREATE INDEX IF NOT EXISTS ix_tl_task ON task_logs(task_id);
`);
addCol('projects', 'kind', "TEXT DEFAULT 'project'");
addCol('projects', 'description', "TEXT DEFAULT ''");
addCol('projects', 'start_date', 'TEXT');
addCol('projects', 'end_date', 'TEXT');
addCol('projects', 'status', "TEXT DEFAULT 'open'");
addCol('projects', 'health', "TEXT DEFAULT 'on_track'");
addCol('projects', 'close_result', 'TEXT');
addCol('projects', 'close_note', 'TEXT');
addCol('projects', 'settings', "TEXT DEFAULT '{}'");
addCol('projects', 'updated_at', 'TEXT');
addCol('tasks', 'group_id', 'INTEGER');
addCol('tasks', 'parent_id', 'INTEGER');
addCol('tasks', 'progress', 'INTEGER DEFAULT 0');
addCol('tasks', 'due_time', 'TEXT');
addCol('tasks', 'urgent', 'INTEGER DEFAULT 0');
addCol('tasks', 'important', 'INTEGER DEFAULT 0');
addCol('tasks', 'est_hours', 'REAL DEFAULT 0');
addCol('tasks', 'completed_at', 'TEXT');
addCol('tasks', 'review_by', 'INTEGER');
addCol('tasks', 'reviewed_at', 'TEXT');
addCol('tasks', 'fail_reason', 'TEXT');
addCol('tasks', 'tags', "TEXT DEFAULT ''");     // dạng ",nhãn 1,nhãn 2," để lọc chính xác
addCol('tasks', 'goal_id', 'INTEGER');            // liên kết Mục tiêu – KPI
db.exec(`
CREATE TABLE IF NOT EXISTS task_files (
  id INTEGER PRIMARY KEY, task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, kind TEXT NOT NULL DEFAULT 'file',
  doc_id INTEGER, file_name TEXT, file_size INTEGER, mime TEXT, stored_name TEXT, uploaded_by INTEGER, created_at TEXT);
CREATE INDEX IF NOT EXISTS ix_tfile_task ON task_files(task_id);
CREATE INDEX IF NOT EXISTS ix_tfile_stored ON task_files(stored_name);
CREATE INDEX IF NOT EXISTS ix_tasks_goal ON tasks(goal_id);
`);
db.exec(`
CREATE INDEX IF NOT EXISTS ix_tasks_parent ON tasks(parent_id);
CREATE INDEX IF NOT EXISTS ix_tasks_group ON tasks(group_id);
CREATE INDEX IF NOT EXISTS ix_tasks_creator ON tasks(creator_id);
CREATE INDEX IF NOT EXISTS ix_tasks_proj_status ON tasks(project_id, status, due_date);
`);

/* ================= Hằng số, thiết lập ================= */
const STATUS = ['todo', 'doing', 'review', 'done', 'failed'];
const CLOSED = "('done','failed')";
const PRIO = ['cao', 'tb', 'thap'];
const MAX_TAGS = 10, MAX_TAG_LEN = 30, TASK_FILE_MAX = 10 * 1024 * 1024, TASK_FILES_PER_TASK = 30;
/* Chuẩn hóa nhãn: bỏ khoảng trắng thừa, bỏ dấu phẩy, không trùng (không phân biệt hoa thường), tối đa 10 nhãn × 30 ký tự. */
function normTags(v) {
  const arr = Array.isArray(v) ? v : String(v || '').split(',');
  const out = [], seen = new Set();
  for (const x of arr) {
    const t = String(x || '').replace(/[,\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_TAG_LEN);
    if (t && !seen.has(t.toLowerCase())) { seen.add(t.toLowerCase()); out.push(t); }
    if (out.length >= MAX_TAGS) break;
  }
  return out.length ? ',' + out.join(',') + ',' : '';
}
const tagList = s => String(s || '').split(',').filter(Boolean);
const ROLES = ['manager', 'member', 'follower'];
const KINDS = ['project', 'team'];
const DEFAULT_SETTINGS = {
  allow_percent: true,          // Cho phép cập nhật % hoàn thành
  review: false,                // Yêu cầu đánh giá trước khi hoàn thành
  reviewer_mode: 'creator',     // creator: người giao việc đánh giá; list: danh sách chỉ định
  reviewers: [],
  review_sla_h: 24,
  allow_failed: true,           // Cho phép đánh dấu thất bại
  fail_roles: ['manager'],      // manager luôn có; thêm creator, assignee, follower
  fail_reasons: ['Không còn nhu cầu thực hiện', 'Không đạt yêu cầu', 'Thay đổi kế hoạch', 'Lý do khác'],
  member_view_all: true,        // Thành viên xem được việc của người khác
  member_create: true,          // Thành viên được tạo việc
  assignee_edit_deadline: true, // Người nhận việc được sửa thời hạn
  assignee_edit_info: true,     // Người nhận việc được sửa thông tin (tên, mô tả, nhóm, ưu tiên)
  creator_delete: true,         // Người tạo được xóa việc
  deadline_time: false          // Thời hạn theo giờ
};
const MAX_DEPTH = 3, PAGE_MAX = 200, MAX_TITLE = 155;
const isTime = s => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(s || ''));
const parseJSON = (s, d) => { try { const v = JSON.parse(s || ''); return v && typeof v === 'object' ? v : d; } catch (e) { return d; } };
const settingsOf = p => Object.assign({}, DEFAULT_SETTINGS, parseJSON(p.settings, {}));

function register({ route, bad, forbid, notFound, isAdmin, isDirector, log, esc, str, int, isDate }) {
  /* ---------- Phân quyền ---------- */
  const isOwner = u => isAdmin(u) || isDirector(u);
  const projectOf = id => get('SELECT * FROM projects WHERE id=?', id) || notFound('Dự án/phòng ban không tồn tại hoặc đã bị xóa.');
  const roleIn = (u, pid) => { if (isOwner(u)) return 'owner'; const m = get('SELECT role FROM project_members WHERE project_id=? AND user_id=?', pid, u.id); return m ? m.role : null; };
  const canManage = r => r === 'owner' || r === 'manager';
  const isFollower = (tid, uid) => !!get('SELECT 1 FROM task_followers WHERE task_id=? AND user_id=?', tid, uid);
  function taskAccess(u, t, p = projectOf(t.project_id), role = roleIn(u, t.project_id)) {
    const S = settingsOf(p);
    const mine = t.assignee_id === u.id, creator = t.creator_id === u.id, follower = isFollower(t.id, u.id);
    const manage = canManage(role);
    const view = manage || mine || creator || follower || (role === 'member' && S.member_view_all);
    const open = p.status !== 'closed';
    const fullEdit = open && (manage || creator);
    const reviewer = S.review && (manage || (S.reviewer_mode === 'list' ? (S.reviewers || []).includes(u.id) : creator));
    return {
      view, manage, mine, creator, follower, role, S, open,
      edit: fullEdit,
      editInfo: open && (fullEdit || (mine && S.assignee_edit_info)),
      editDeadline: open && (fullEdit || (mine && S.assignee_edit_deadline)),
      progress: open && (fullEdit || mine),
      del: open && (manage || (creator && S.creator_delete)),
      fail: open && S.allow_failed && (manage || (creator && S.fail_roles.includes('creator')) || (mine && S.fail_roles.includes('assignee')) || (follower && S.fail_roles.includes('follower'))),
      review: open && reviewer,
      comment: view
    };
  }
  const taskOf = id => get('SELECT * FROM tasks WHERE id=?', id) || notFound('Công việc không tồn tại hoặc đã bị xóa.');
  const need = (cond, msg) => { if (!cond) forbid(msg || 'Bạn không có quyền thực hiện thao tác này.'); };
  const tlog = (tid, uid, action, detail = '') => run('INSERT INTO task_logs(task_id,user_id,action,detail,created_at) VALUES(?,?,?,?,?)', tid, uid, action, str(detail, 500), now());
  const userOk = id => !!get('SELECT 1 FROM users WHERE id=? AND active=1', id);
  const ensureMember = (pid, uid, role = 'follower') => { if (!get('SELECT 1 FROM project_members WHERE project_id=? AND user_id=?', pid, uid)) run('INSERT INTO project_members(project_id,user_id,role,added_at) VALUES(?,?,?,?)', pid, uid, role, now()); };
  const pageArgs = q => ({ limit: Math.min(Math.max(int(q.limit) || PAGE_MAX, 1), PAGE_MAX), offset: Math.max(int(q.offset), 0) });
  const lateExpr = `(t.status NOT IN ${CLOSED} AND (t.due_date < ? OR (t.due_date = ? AND t.due_time IS NOT NULL AND t.due_time < ?)))`;
  const lateArgs = () => { const T = today(), N = D.nowHM(); return [T, T, N]; };
  const TASK_COLS = `t.id, t.project_id, t.group_id, t.parent_id, t.title, t.assignee_id, t.creator_id, t.status, t.priority, t.urgent, t.important,
    t.start_date, t.due_date, t.due_time, t.progress, t.est_hours, t.done_at, t.completed_at, t.fail_reason, t.created_at, t.updated_at,
    (SELECT COUNT(*) FROM tasks c WHERE c.parent_id=t.id) sub_total,
    (SELECT COUNT(*) FROM tasks c WHERE c.parent_id=t.id AND c.status='done') sub_done,
    (SELECT COUNT(*) FROM task_checklist c WHERE c.task_id=t.id) cl_total,
    (SELECT COUNT(*) FROM task_checklist c WHERE c.task_id=t.id AND c.done=1) cl_done,
    (SELECT COUNT(*) FROM task_comments c WHERE c.task_id=t.id) cm_count,
    (SELECT COUNT(*) FROM task_files f WHERE f.task_id=t.id) file_count, t.tags, t.goal_id`;
  /* Danh sách trả về: nhãn dạng mảng */
  const shape = r => { r.tags = tagList(r.tags); return r; };
  const goalOk = id => !!get('SELECT 1 FROM goals WHERE id=?', id);
  /* Xóa tệp vật lý khi không còn công việc nào tham chiếu (tệp có thể dùng chung khi nhân bản, giao nhiều người). */
  const releaseBlobs = names => { for (const n of new Set(names.filter(Boolean))) if (!get('SELECT 1 FROM task_files WHERE stored_name=?', n) && !get('SELECT 1 FROM doc_items WHERE stored_name=?', n)) FILES.del(n); };
  const blobsOf = ids => ids.length ? all(`SELECT stored_name FROM task_files WHERE kind='file' AND task_id IN (${ids.map(() => '?').join(',')})`, ...ids).map(r => r.stored_name) : [];

  /* ---------- Dự án, phòng ban ---------- */
  function projectStats(pid) {
    const [T, T2, N] = lateArgs();
    return get(`SELECT COUNT(*) total, SUM(t.status='done') done, SUM(t.status='failed') failed, SUM(t.status='review') review,
      SUM(t.status NOT IN ${CLOSED}) open, SUM(${lateExpr}) late FROM tasks t WHERE t.project_id=?`, T, T2, N, pid);
  }
  function projectFull(u, p) {
    const role = roleIn(u, p.id);
    need(role, 'Bạn không phải thành viên của dự án/phòng ban này.');
    return {
      ...p, settings: settingsOf(p), my_role: role, can_manage: canManage(role),
      can_create: p.status !== 'closed' && (canManage(role) || (role === 'member' && settingsOf(p).member_create)),
      members: all('SELECT m.user_id, m.role FROM project_members m JOIN users u ON u.id=m.user_id WHERE m.project_id=? ORDER BY CASE m.role WHEN \'manager\' THEN 0 WHEN \'member\' THEN 1 ELSE 2 END, u.full_name', p.id),
      groups: all('SELECT * FROM task_groups WHERE project_id=? ORDER BY sort, id', p.id),
      stats: projectStats(p.id),
      tags: [...new Set(all("SELECT tags FROM tasks WHERE project_id=? AND tags<>'' LIMIT 2000", p.id).flatMap(r => tagList(r.tags)))].sort((x, y) => x.localeCompare(y, 'vi')).slice(0, 200)
    };
  }
  route('GET', '/api/projects', ({ user, query }) => {
    const w = [], a = [];
    if (!isOwner(user)) { w.push('EXISTS (SELECT 1 FROM project_members m WHERE m.project_id=p.id AND m.user_id=?)'); a.push(user.id); }
    if (query.status === 'closed') w.push("p.status='closed'"); else if (query.status !== 'all') w.push("p.status<>'closed'");
    if (KINDS.includes(query.kind)) { w.push('p.kind=?'); a.push(query.kind); }
    if (query.q) { w.push('p.name LIKE ?'); a.push('%' + str(query.q, 80) + '%'); }
    const [T, T2, N] = lateArgs();
    const rows = all(`SELECT p.id, p.name, p.color, p.kind, p.status, p.health, p.start_date, p.end_date, p.close_result, p.owner_id,
        (SELECT role FROM project_members m WHERE m.project_id=p.id AND m.user_id=?) my_role,
        (SELECT COUNT(*) FROM project_members m WHERE m.project_id=p.id AND m.role<>'follower') member_count,
        (SELECT COUNT(*) FROM tasks t WHERE t.project_id=p.id) total,
        (SELECT COUNT(*) FROM tasks t WHERE t.project_id=p.id AND t.status='done') done,
        (SELECT COUNT(*) FROM tasks t WHERE t.project_id=p.id AND ${lateExpr}) late
      FROM projects p ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY p.status='closed', p.kind, p.name LIMIT 500`, user.id, T, T2, N, ...a);
    return rows.map(r => ({ ...r, my_role: isOwner(user) && !r.my_role ? 'owner' : r.my_role }));
  });
  function projectInput(body, old = {}) {
    const p = {
      name: str(body.name ?? old.name, 120), kind: body.kind ?? old.kind ?? 'project', color: str(body.color ?? old.color, 9) || '#0e6f68',
      description: str(body.description ?? old.description, 3000),
      start_date: (body.start_date ?? old.start_date) || null, end_date: (body.end_date ?? old.end_date) || null
    };
    if (!p.name) bad('Vui lòng nhập tên dự án/phòng ban.');
    if (!KINDS.includes(p.kind)) bad('Loại không hợp lệ.');
    if (!/^#[0-9a-fA-F]{6}$/.test(p.color)) bad('Màu không hợp lệ.');
    for (const k of ['start_date', 'end_date']) if (p[k] && !isDate(p[k])) bad('Ngày không hợp lệ.');
    if (p.start_date && p.end_date && p.end_date < p.start_date) bad('Ngày kết thúc phải sau ngày bắt đầu.');
    if (p.kind === 'team') { p.start_date = null; p.end_date = null; }
    return p;
  }
  route('POST', '/api/projects', ({ user, body }) => {
    const p = projectInput(body);
    const managers = new Set([user.id, ...(Array.isArray(body.managers) ? body.managers.map(int) : [])].filter(userOk));
    const members = new Set((Array.isArray(body.members) ? body.members.map(int) : []).filter(id => userOk(id) && !managers.has(id)));
    let id;
    tx(() => {
      id = Number(run(`INSERT INTO projects(name,color,owner_id,kind,description,start_date,end_date,status,settings,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,'open',?,?,?)`, p.name, p.color, user.id, p.kind, p.description, p.start_date, p.end_date, JSON.stringify(DEFAULT_SETTINGS), now(), now()).lastInsertRowid);
      for (const m of managers) run('INSERT INTO project_members(project_id,user_id,role,added_at) VALUES(?,?,?,?)', id, m, 'manager', now());
      for (const m of members) run('INSERT INTO project_members(project_id,user_id,role,added_at) VALUES(?,?,?,?)', id, m, 'member', now());
    });
    log(user.id, `tạo ${p.kind === 'team' ? 'phòng ban' : 'dự án'} <b>${esc(p.name)}</b>`);
    return projectFull(user, projectOf(id));
  });
  route('GET', '/api/projects/:id', ({ user, params }) => projectFull(user, projectOf(int(params.id))));
  route('PUT', '/api/projects/:id', ({ user, params, body }) => {
    const old = projectOf(int(params.id)); need(canManage(roleIn(user, old.id)), 'Chỉ quản lý dự án/phòng ban mới được sửa thông tin.');
    const p = projectInput(body, old);
    run('UPDATE projects SET name=?, kind=?, color=?, description=?, start_date=?, end_date=?, updated_at=? WHERE id=?', p.name, p.kind, p.color, p.description, p.start_date, p.end_date, now(), old.id);
    if (p.kind !== old.kind) log(user.id, `chuyển <b>${esc(p.name)}</b> sang loại ${p.kind === 'team' ? 'phòng ban' : 'dự án'}`);
    return projectFull(user, projectOf(old.id));
  });
  route('PUT', '/api/projects/:id/settings', ({ user, params, body }) => {
    const p = projectOf(int(params.id)); need(canManage(roleIn(user, p.id)), 'Chỉ quản lý dự án/phòng ban mới được thay đổi thiết lập.');
    const S = settingsOf(p), b = body || {};
    for (const k of ['allow_percent', 'review', 'allow_failed', 'member_view_all', 'member_create', 'assignee_edit_deadline', 'assignee_edit_info', 'creator_delete', 'deadline_time']) if (k in b) S[k] = !!b[k];
    if ('reviewer_mode' in b) { if (!['creator', 'list'].includes(b.reviewer_mode)) bad('Chế độ đánh giá không hợp lệ.'); S.reviewer_mode = b.reviewer_mode; }
    if ('reviewers' in b) S.reviewers = (Array.isArray(b.reviewers) ? b.reviewers : []).map(int).filter(userOk).slice(0, 50);
    if ('review_sla_h' in b) S.review_sla_h = Math.min(Math.max(int(b.review_sla_h), 0), 720);
    if ('fail_roles' in b) S.fail_roles = ['manager', ...(Array.isArray(b.fail_roles) ? b.fail_roles : []).filter(r => ['creator', 'assignee', 'follower'].includes(r))];
    if ('fail_reasons' in b) { S.fail_reasons = (Array.isArray(b.fail_reasons) ? b.fail_reasons : []).map(x => str(x, 120)).filter(Boolean).slice(0, 20); if (!S.fail_reasons.length) bad('Cần ít nhất một lý do thất bại.'); }
    if (S.review && S.reviewer_mode === 'list' && !S.reviewers.length) bad('Vui lòng chọn ít nhất một người đánh giá.');
    run('UPDATE projects SET settings=?, updated_at=? WHERE id=?', JSON.stringify(S), now(), p.id);
    return projectFull(user, projectOf(p.id));
  });
  route('POST', '/api/projects/:id/close', ({ user, params, body }) => {
    const p = projectOf(int(params.id)); need(canManage(roleIn(user, p.id)), 'Chỉ quản lý mới được đóng dự án/phòng ban.');
    if (!['success', 'failed', 'cancelled'].includes(body.result)) bad('Vui lòng chọn kết quả đóng.');
    run("UPDATE projects SET status='closed', close_result=?, close_note=?, updated_at=? WHERE id=?", body.result, str(body.note, 1000), now(), p.id);
    log(user.id, `đóng <b>${esc(p.name)}</b>`);
    return projectFull(user, projectOf(p.id));
  });
  route('POST', '/api/projects/:id/reopen', ({ user, params, body }) => {
    const p = projectOf(int(params.id)); need(canManage(roleIn(user, p.id)), 'Chỉ quản lý mới được mở lại dự án/phòng ban.');
    if (!['on_track', 'late', 'risk'].includes(body.health)) bad('Vui lòng chọn tình trạng khi mở lại.');
    run("UPDATE projects SET status='open', health=?, close_result=NULL, close_note=?, updated_at=? WHERE id=?", body.health, str(body.note, 1000), now(), p.id);
    log(user.id, `mở lại <b>${esc(p.name)}</b>`);
    return projectFull(user, projectOf(p.id));
  });
  route('DELETE', '/api/projects/:id', ({ user, params }) => {
    const p = projectOf(int(params.id)); need(canManage(roleIn(user, p.id)), 'Chỉ quản lý dự án/phòng ban mới được xóa.');
    const blobs = all("SELECT f.stored_name FROM task_files f JOIN tasks t ON t.id=f.task_id WHERE t.project_id=? AND f.kind='file'", p.id).map(r => r.stored_name);
    tx(() => { run('DELETE FROM task_files WHERE task_id IN (SELECT id FROM tasks WHERE project_id=?)', p.id); run('DELETE FROM tasks WHERE project_id=?', p.id); run('DELETE FROM projects WHERE id=?', p.id); });
    releaseBlobs(blobs);
    log(user.id, `xóa <b>${esc(p.name)}</b>`);
    return { ok: true };
  });
  /* Thành viên */
  route('POST', '/api/projects/:id/members', ({ user, params, body }) => {
    const p = projectOf(int(params.id)); need(canManage(roleIn(user, p.id)), 'Chỉ quản lý mới được thêm thành viên.');
    const role = ROLES.includes(body.role) ? body.role : 'member';
    const ids = (Array.isArray(body.user_ids) ? body.user_ids : [body.user_id]).map(int).filter(userOk);
    if (!ids.length) bad('Vui lòng chọn người dùng.');
    tx(() => { for (const uid of ids) { run('DELETE FROM project_members WHERE project_id=? AND user_id=?', p.id, uid); run('INSERT INTO project_members(project_id,user_id,role,added_at) VALUES(?,?,?,?)', p.id, uid, role, now()); } });
    return projectFull(user, projectOf(p.id));
  });
  route('PUT', '/api/projects/:id/members/:uid', ({ user, params, body }) => {
    const p = projectOf(int(params.id)); need(canManage(roleIn(user, p.id)), 'Chỉ quản lý mới được đổi vai trò.');
    if (!ROLES.includes(body.role)) bad('Vai trò không hợp lệ.');
    const uid = int(params.uid);
    if (body.role !== 'manager' && get("SELECT role FROM project_members WHERE project_id=? AND user_id=?", p.id, uid)?.role === 'manager'
      && get("SELECT COUNT(*) n FROM project_members WHERE project_id=? AND role='manager'", p.id).n <= 1) bad('Dự án/phòng ban phải có ít nhất một quản lý.');
    run('UPDATE project_members SET role=? WHERE project_id=? AND user_id=?', body.role, p.id, uid);
    return projectFull(user, projectOf(p.id));
  });
  route('DELETE', '/api/projects/:id/members/:uid', ({ user, params }) => {
    const p = projectOf(int(params.id)); need(canManage(roleIn(user, p.id)), 'Chỉ quản lý mới được xóa thành viên.');
    const uid = int(params.uid);
    if (get("SELECT role FROM project_members WHERE project_id=? AND user_id=?", p.id, uid)?.role === 'manager'
      && get("SELECT COUNT(*) n FROM project_members WHERE project_id=? AND role='manager'", p.id).n <= 1) bad('Dự án/phòng ban phải có ít nhất một quản lý.');
    run('DELETE FROM project_members WHERE project_id=? AND user_id=?', p.id, uid);
    return projectFull(user, projectOf(p.id));
  });

  /* ---------- Nhóm công việc ---------- */
  route('POST', '/api/projects/:id/groups', ({ user, params, body }) => {
    const p = projectOf(int(params.id)); need(canManage(roleIn(user, p.id)), 'Chỉ quản lý mới được thêm nhóm công việc.');
    const name = str(body.name, 120); if (!name) bad('Vui lòng nhập tên nhóm công việc.');
    const sort = (get('SELECT MAX(sort) m FROM task_groups WHERE project_id=?', p.id).m || 0) + 1;
    run('INSERT INTO task_groups(project_id,name,description,sort,std_hours) VALUES(?,?,?,?,?)', p.id, name, str(body.description, 500), sort, Math.max(0, Number(body.std_hours) || 0));
    return projectFull(user, projectOf(p.id));
  });
  route('PUT', '/api/groups/:id', ({ user, params, body }) => {
    const g = get('SELECT * FROM task_groups WHERE id=?', int(params.id)) || notFound();
    need(canManage(roleIn(user, g.project_id)), 'Chỉ quản lý mới được sửa nhóm công việc.');
    const name = str(body.name ?? g.name, 120); if (!name) bad('Vui lòng nhập tên nhóm công việc.');
    const std = 'std_hours' in body ? Math.max(0, Number(body.std_hours) || 0) : g.std_hours;
    run('UPDATE task_groups SET name=?, description=?, closed=?, std_hours=? WHERE id=?', name, str(body.description ?? g.description, 500), 'closed' in body ? (body.closed ? 1 : 0) : g.closed, std, g.id);
    if (std !== g.std_hours && std > 0) run('UPDATE tasks SET est_hours=? WHERE group_id=?', std, g.id);
    return projectFull(user, projectOf(g.project_id));
  });
  route('DELETE', '/api/groups/:id', ({ user, params }) => {
    const g = get('SELECT * FROM task_groups WHERE id=?', int(params.id)) || notFound();
    need(canManage(roleIn(user, g.project_id)), 'Chỉ quản lý mới được xóa nhóm công việc.');
    tx(() => { run('UPDATE tasks SET group_id=NULL WHERE group_id=?', g.id); run('DELETE FROM task_groups WHERE id=?', g.id); });
    return projectFull(user, projectOf(g.project_id));
  });
  route('PUT', '/api/projects/:id/groups-order', ({ user, params, body }) => {
    const p = projectOf(int(params.id)); need(canManage(roleIn(user, p.id)), 'Chỉ quản lý mới được sắp xếp nhóm công việc.');
    const ids = (Array.isArray(body.ids) ? body.ids : []).map(int);
    tx(() => ids.forEach((id, i) => run('UPDATE task_groups SET sort=? WHERE id=? AND project_id=?', i + 1, id, p.id)));
    return projectFull(user, projectOf(p.id));
  });

  /* ---------- Công việc: danh sách ---------- */
  function visibleFilter(u, alias = 't') {
    if (isOwner(u)) return { sql: '1=1', args: [] };
    /* Dự án mà người dùng xem được mọi công việc: quản lý, hoặc thành viên khi thiết lập cho phép */
    const full = all("SELECT p.id, p.settings, m.role FROM project_members m JOIN projects p ON p.id=m.project_id WHERE m.user_id=? AND m.role IN ('manager','member')", u.id)
      .filter(r => r.role === 'manager' || settingsOf(r).member_view_all).map(r => r.id);
    return {
      sql: `(${alias}.assignee_id=? OR ${alias}.creator_id=? OR EXISTS (SELECT 1 FROM task_followers f WHERE f.task_id=${alias}.id AND f.user_id=?)` +
        (full.length ? ` OR ${alias}.project_id IN (${full.map(() => '?').join(',')}))` : ')'),
      args: [u.id, u.id, u.id, ...full]
    };
  }
  function statusFilter(q, w, a) {
    if (q.status === 'open') w.push(`t.status NOT IN ${CLOSED}`);
    else if (q.status === 'late') { w.push(lateExpr); a.push(...lateArgs()); }
    else if (STATUS.includes(q.status)) { w.push('t.status=?'); a.push(q.status); }
  }
  route('GET', '/api/projects/:id/tasks', ({ user, params, query }) => {
    const p = projectOf(int(params.id)); const role = roleIn(user, p.id);
    const v = visibleFilter(user);
    if (!role) { /* người ngoài dự án chỉ thấy việc mình liên quan */ }
    const w = ['t.project_id=?', v.sql], a = [p.id, ...v.args];
    statusFilter(query, w, a);
    if (query.assignee) { w.push('t.assignee_id=?'); a.push(int(query.assignee)); }
    if (query.group) { w.push(query.group === 'none' ? 't.group_id IS NULL' : 't.group_id=?'); if (query.group !== 'none') a.push(int(query.group)); }
    if (query.q) { w.push('t.title LIKE ?'); a.push('%' + str(query.q, 100) + '%'); }
    if (query.tag) { w.push("t.tags LIKE ?"); a.push('%,' + str(query.tag, MAX_TAG_LEN) + ',%'); }
    const { limit, offset } = pageArgs(query);
    const total = get(`SELECT COUNT(*) n FROM tasks t WHERE ${w.join(' AND ')}`, ...a).n;
    if (!role && !total) need(false, 'Bạn không phải thành viên của dự án/phòng ban này.');
    const rows = all(`SELECT ${TASK_COLS} FROM tasks t WHERE ${w.join(' AND ')}
      ORDER BY COALESCE(t.parent_id, t.id), t.parent_id IS NOT NULL, t.due_date, t.id LIMIT ? OFFSET ?`, ...a, limit, offset).map(shape);
    return { total, limit, offset, rows };
  });
  /* Việc của tôi: assigned | created | following | review | staff */
  route('GET', '/api/tasks', ({ user, query }) => {
    const scope = query.scope || 'assigned';
    const w = [], a = [];
    if (scope === 'assigned') { w.push('t.assignee_id=?'); a.push(user.id); }
    else if (scope === 'created') { w.push('t.creator_id=? AND t.assignee_id<>?'); a.push(user.id, user.id); }
    else if (scope === 'following') { w.push('EXISTS (SELECT 1 FROM task_followers f WHERE f.task_id=t.id AND f.user_id=?)'); a.push(user.id); }
    else if (scope === 'review') {
      w.push("t.status='review'"); const v = visibleFilter(user); w.push(v.sql); a.push(...v.args);
    } else if (scope === 'staff') {
      w.push('t.assignee_id IN (SELECT u.id FROM users u JOIN departments d ON d.id=u.dept_id WHERE d.head_id=? AND u.id<>? AND u.active=1)'); a.push(user.id, user.id);
      if (query.assignee) { w.push('t.assignee_id=?'); a.push(int(query.assignee)); }
    } else bad('Phạm vi không hợp lệ.');
    statusFilter(query, w, a);
    if (query.q) { w.push('t.title LIKE ?'); a.push('%' + str(query.q, 100) + '%'); }
    if (query.tag) { w.push("t.tags LIKE ?"); a.push('%,' + str(query.tag, MAX_TAG_LEN) + ',%'); }
    const { limit, offset } = pageArgs(query);
    let rows = all(`SELECT ${TASK_COLS}, p.name project_name, p.color project_color FROM tasks t JOIN projects p ON p.id=t.project_id
      WHERE ${w.join(' AND ')} ORDER BY t.status IN ${CLOSED}, t.due_date, t.id LIMIT ? OFFSET ?`, ...a, limit, offset);
    rows = rows.map(shape);
    if (scope === 'review') rows = rows.filter(t => taskAccess(user, t).review);
    const total = scope === 'review' ? rows.length : get(`SELECT COUNT(*) n FROM tasks t WHERE ${w.join(' AND ')}`, ...a).n;
    return { total, limit, offset, rows };
  });
  /* Nhân viên của tôi: tổng hợp theo người */
  route('GET', '/api/work/staff', ({ user }) => {
    const [T, T2, N] = lateArgs();
    return all(`SELECT u.id user_id, COUNT(t.id) total, SUM(t.status='todo') todo, SUM(t.status='doing') doing, SUM(t.status='review') review,
        SUM(t.status='done') done, SUM(t.status='failed') failed, SUM(${lateExpr}) late
      FROM users u JOIN departments d ON d.id=u.dept_id LEFT JOIN tasks t ON t.assignee_id=u.id
      WHERE d.head_id=? AND u.id<>? AND u.active=1 GROUP BY u.id ORDER BY u.full_name`, T, T2, N, user.id, user.id);
  });

  /* ---------- Công việc: chi tiết ---------- */
  function depthOf(id) { let d = 0, cur = id; while (cur && d <= MAX_DEPTH + 1) { const r = get('SELECT parent_id FROM tasks WHERE id=?', cur); cur = r && r.parent_id; if (cur) d++; } return d; }
  function taskFull(user, id) {
    const t = taskOf(id), p = projectOf(t.project_id), acc = taskAccess(user, t, p);
    need(acc.view, 'Bạn không có quyền xem công việc này.');
    t.project = { id: p.id, name: p.name, color: p.color, kind: p.kind, status: p.status, settings: settingsOf(p) };
    t.group_name = t.group_id ? (get('SELECT name FROM task_groups WHERE id=?', t.group_id) || {}).name : null;
    t.followers = all('SELECT user_id FROM task_followers WHERE task_id=?', t.id).map(r => r.user_id);
    t.subtasks = all(`SELECT ${TASK_COLS} FROM tasks t WHERE t.parent_id=? ORDER BY t.due_date, t.id`, t.id).filter(s => taskAccess(user, s, p).view).map(shape);
    t.parent = t.parent_id ? get('SELECT id, title FROM tasks WHERE id=?', t.parent_id) : null;
    t.depth = depthOf(t.id);
    t.checklist = all('SELECT * FROM task_checklist WHERE task_id=? ORDER BY id', t.id);
    t.comments = all('SELECT c.id, c.user_id, c.body, c.created_at FROM task_comments c WHERE task_id=? ORDER BY c.id', t.id);
    t.results = all('SELECT id, user_id, note, progress, created_at FROM task_results WHERE task_id=? ORDER BY id DESC LIMIT 50', t.id);
    t.logs = all('SELECT user_id, action, detail, created_at FROM task_logs WHERE task_id=? ORDER BY id DESC LIMIT 100', t.id);
    t.groups = all('SELECT id, name, closed FROM task_groups WHERE project_id=? ORDER BY sort, id', p.id);
    t.tags = tagList(t.tags);
    t.goal = t.goal_id ? get('SELECT id, title, unit, target, current, level FROM goals WHERE id=?', t.goal_id) || null : null;
    t.files = all('SELECT f.id, f.kind, f.doc_id, f.file_name, f.file_size, f.mime, f.uploaded_by, f.created_at, d.title doc_title FROM task_files f LEFT JOIN doc_items d ON d.id=f.doc_id WHERE f.task_id=? ORDER BY f.id', t.id);
    const { view, edit, editInfo, editDeadline, progress, del, fail, review, comment, manage } = acc;
    t.can = { view, edit, editInfo, editDeadline, progress, del, fail, review, comment, manage };
    return t;
  }
  route('GET', '/api/tasks/:id', ({ user, params }) => taskFull(user, int(params.id)));

  function validDue(S, due_date, due_time) {
    if (due_date && !isDate(due_date)) bad('Thời hạn không hợp lệ.');
    if (due_time && (!S.deadline_time || !isTime(due_time))) bad('Giờ hết hạn không hợp lệ.');
  }
  /* Tạo công việc (một hoặc nhiều người nhận) */
  route('POST', '/api/tasks', ({ user, body }) => {
    const p = projectOf(int(body.project_id)); const role = roleIn(user, p.id), S = settingsOf(p);
    if (p.status === 'closed') bad('Dự án/phòng ban đã đóng, không thể thêm công việc.');
    let parent = null;
    if (body.parent_id) {
      parent = taskOf(int(body.parent_id));
      if (parent.project_id !== p.id) bad('Việc con phải cùng dự án với việc cha.');
      need(taskAccess(user, parent, p, role).view, 'Bạn không có quyền với công việc cha.');
      if (depthOf(parent.id) + 1 > MAX_DEPTH) bad(`Chỉ tạo được tối đa ${MAX_DEPTH} cấp việc con.`);
    } else need(canManage(role) || (role === 'member' && S.member_create), 'Bạn không có quyền tạo công việc trong dự án/phòng ban này.');
    const title = str(body.title, MAX_TITLE); if (!title) bad('Vui lòng nhập tên công việc.');
    const assignees = [...new Set((Array.isArray(body.assignee_ids) && body.assignee_ids.length ? body.assignee_ids : [body.assignee_id || user.id]).map(int))];
    if (assignees.length > 100) bad('Giao tối đa 100 người một lần.');
    for (const a of assignees) if (!userOk(a)) bad('Người nhận việc không hợp lệ.');
    const group_id = body.group_id ? int(body.group_id) : (parent ? parent.group_id : null);
    let est = Number(body.est_hours) || 0;
    if (group_id) { const g = get('SELECT * FROM task_groups WHERE id=? AND project_id=?', group_id, p.id); if (!g) bad('Nhóm công việc không hợp lệ.'); if (!est && g.std_hours) est = g.std_hours; }
    const start = body.start_date || today(), due = body.due_date || null, dueTime = body.due_time || null;
    if (!isDate(start)) bad('Ngày bắt đầu không hợp lệ.');
    validDue(S, due, dueTime);
    if (due && due < start) bad('Thời hạn phải sau hoặc trùng ngày bắt đầu.');
    const prio = PRIO.includes(body.priority) ? body.priority : 'tb';
    const followers = [...new Set((Array.isArray(body.followers) ? body.followers : []).map(int).filter(userOk))];
    const tags = normTags(body.tags);
    const goal = body.goal_id ? int(body.goal_id) : null; if (goal && !goalOk(goal)) bad('Mục tiêu liên kết không tồn tại.');
    const ids = [];
    tx(() => {
      for (const a of assignees) {
        const id = Number(run(`INSERT INTO tasks(project_id,group_id,parent_id,title,description,assignee_id,creator_id,status,priority,urgent,important,
            start_date,due_date,due_time,est_hours,progress,tags,goal_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'todo',?,?,?,?,?,?,?,0,?,?,?,?)`,
          p.id, group_id, parent ? parent.id : null, title, str(body.description, 10000), a, user.id, prio, body.urgent ? 1 : 0, body.important ? 1 : 0,
          start, due, dueTime, est, tags, goal, now(), now()).lastInsertRowid);
        if (!get('SELECT 1 FROM project_members WHERE project_id=? AND user_id=?', p.id, a)) ensureMember(p.id, a, 'follower');
        for (const f of followers) if (f !== a) { run('INSERT OR IGNORE INTO task_followers(task_id,user_id) VALUES(?,?)', id, f); ensureMember(p.id, f, 'follower'); }
        for (const c of (Array.isArray(body.checklist) ? body.checklist : [])) if (str(c)) run('INSERT INTO task_checklist(task_id,text) VALUES(?,?)', id, str(c, 300));
        tlog(id, user.id, 'create', parent ? `việc con của #${parent.id}` : '');
        ids.push(id);
      }
    });
    log(user.id, `giao việc <b>${esc(title)}</b>${assignees.length > 1 ? ` cho ${assignees.length} người` : ''}`);
    return assignees.length === 1 ? taskFull(user, ids[0]) : { ids };
  });
  /* Sửa công việc theo từng trường có kiểm tra quyền */
  route('PUT', '/api/tasks/:id', ({ user, params, body }) => {
    const t = taskOf(int(params.id)), p = projectOf(t.project_id), acc = taskAccess(user, t, p);
    need(acc.view, 'Bạn không có quyền với công việc này.');
    if (!acc.open) bad('Dự án/phòng ban đã đóng, không thể sửa công việc.');
    const S = acc.S, set = {}, changed = [];
    const want = k => k in body && body[k] !== undefined;
    if (want('title') || want('description') || want('priority') || want('urgent') || want('important') || want('group_id') || want('est_hours') || want('tags') || want('goal_id')) {
      need(acc.editInfo, 'Bạn không có quyền sửa thông tin công việc này.');
      if (want('title')) { set.title = str(body.title, MAX_TITLE); if (!set.title) bad('Vui lòng nhập tên công việc.'); }
      if (want('description')) set.description = str(body.description, 10000);
      if (want('priority')) { if (!PRIO.includes(body.priority)) bad('Mức ưu tiên không hợp lệ.'); set.priority = body.priority; }
      if (want('urgent')) set.urgent = body.urgent ? 1 : 0;
      if (want('important')) set.important = body.important ? 1 : 0;
      if (want('est_hours')) set.est_hours = Math.max(0, Number(body.est_hours) || 0);
      if (want('tags')) set.tags = normTags(body.tags);
      if (want('goal_id')) { set.goal_id = body.goal_id ? int(body.goal_id) : null; if (set.goal_id && !goalOk(set.goal_id)) bad('Mục tiêu liên kết không tồn tại.'); }
      if (want('group_id')) {
        if (body.group_id) { const g = get('SELECT * FROM task_groups WHERE id=? AND project_id=?', int(body.group_id), p.id); if (!g) bad('Nhóm công việc không hợp lệ.'); set.group_id = g.id; if (g.std_hours && !want('est_hours')) set.est_hours = g.std_hours; }
        else set.group_id = null;
      }
    }
    if (want('start_date') || want('due_date') || want('due_time')) {
      need(acc.editDeadline, 'Bạn không được phép sửa thời gian của công việc này.');
      const start = want('start_date') ? body.start_date : t.start_date, due = want('due_date') ? (body.due_date || null) : t.due_date;
      const dt = want('due_time') ? (body.due_time || null) : t.due_time;
      if (!isDate(start)) bad('Ngày bắt đầu không hợp lệ.');
      validDue(S, due, dt);
      if (due && due < start) bad('Thời hạn phải sau hoặc trùng ngày bắt đầu.');
      Object.assign(set, { start_date: start, due_date: due, due_time: dt });
    }
    if (want('assignee_id')) {
      need(acc.edit, 'Chỉ người giao việc hoặc quản lý mới được đổi người nhận việc.');
      const a = int(body.assignee_id); if (!userOk(a)) bad('Người nhận việc không hợp lệ.');
      set.assignee_id = a; ensureMember(p.id, a, 'follower');
    }
    const keys = Object.keys(set); if (!keys.length) bad('Không có thông tin nào thay đổi.');
    for (const k of keys) if (String(set[k] ?? '') !== String(t[k] ?? '')) changed.push(k);
    run(`UPDATE tasks SET ${keys.map(k => k + '=?').join(', ')}, updated_at=? WHERE id=?`, ...keys.map(k => set[k]), now(), t.id);
    const LBL = { title: 'tên', description: 'mô tả', priority: 'mức ưu tiên', urgent: 'khẩn cấp', important: 'quan trọng', est_hours: 'thời lượng', group_id: 'nhóm công việc', tags: 'nhãn', goal_id: 'mục tiêu liên kết', start_date: 'ngày bắt đầu', due_date: 'thời hạn', due_time: 'giờ hết hạn', assignee_id: 'người nhận việc' };
    if (changed.length) tlog(t.id, user.id, 'update', changed.map(k => LBL[k] || k).join(', '));
    return taskFull(user, t.id);
  });
  /* Chuyển trạng thái: todo | doing | done | failed */
  route('POST', '/api/tasks/:id/status', ({ user, params, body }) => {
    const t = taskOf(int(params.id)), p = projectOf(t.project_id), acc = taskAccess(user, t, p), to = body.status;
    need(acc.view, 'Bạn không có quyền với công việc này.');
    if (!acc.open) bad('Dự án/phòng ban đã đóng.');
    if (!['todo', 'doing', 'done', 'failed'].includes(to)) bad('Trạng thái không hợp lệ.');
    if (to === 'failed') {
      need(acc.fail, 'Bạn không có quyền đánh dấu thất bại.');
      if (t.status === 'review') bad('Công việc đang chờ đánh giá: cần chuyển về "Đang làm" trước khi đánh dấu thất bại.');
      const reason = str(body.reason, 200); if (!reason) bad('Vui lòng chọn lý do thất bại.');
      run("UPDATE tasks SET status='failed', fail_reason=?, done_at=?, updated_at=? WHERE id=?", reason, now(), now(), t.id);
      tlog(t.id, user.id, 'failed', reason);
      return taskFull(user, t.id);
    }
    need(acc.progress, 'Chỉ người nhận việc, người giao việc hoặc quản lý mới được cập nhật trạng thái.');
    if (to === 'done') {
      if (t.status === 'done') bad('Công việc đã hoàn thành.');
      if (t.status === 'review') bad('Công việc đang chờ đánh giá.');
      const openSubs = get(`SELECT COUNT(*) n FROM tasks WHERE parent_id=? AND status NOT IN ${CLOSED}`, t.id).n;
      if (openSubs && !body.force) bad(`Còn ${openSubs} việc con chưa kết thúc. Hoàn thành các việc con trước hoặc xác nhận hoàn thành.`);
      const assigneeUser = get('SELECT id, role FROM users WHERE id=?', t.assignee_id) || { id: 0, role: '' };
      const needsReview = acc.S.review && !canManage(roleIn(assigneeUser, p.id)) && !acc.review;
      if (needsReview) {
        run("UPDATE tasks SET status='review', completed_at=?, progress=CASE WHEN ? THEN 100 ELSE progress END, updated_at=? WHERE id=?", now(), acc.S.allow_percent ? 1 : 0, now(), t.id);
        tlog(t.id, user.id, 'submit_review');
      } else {
        run("UPDATE tasks SET status='done', completed_at=?, done_at=?, progress=100, updated_at=? WHERE id=?", now(), now(), now(), t.id);
        tlog(t.id, user.id, 'done');
      }
    } else {
      run('UPDATE tasks SET status=?, done_at=NULL, completed_at=NULL, fail_reason=NULL, updated_at=? WHERE id=?', to, now(), t.id);
      tlog(t.id, user.id, to === 'doing' ? (['done', 'failed'].includes(t.status) ? 'reopen' : 'start') : 'todo');
    }
    return taskFull(user, t.id);
  });
  /* Đánh giá: duyệt hoặc trả lại */
  route('POST', '/api/tasks/:id/review', ({ user, params, body }) => {
    const t = taskOf(int(params.id)), acc = taskAccess(user, t);
    need(acc.review, 'Bạn không phải người đánh giá công việc này.');
    if (t.status !== 'review') bad('Công việc không ở trạng thái chờ đánh giá.');
    const note = str(body.note, 2000);
    if (body.approve) {
      run("UPDATE tasks SET status='done', done_at=?, reviewed_at=?, review_by=?, progress=100, updated_at=? WHERE id=?", now(), now(), user.id, now(), t.id);
      tlog(t.id, user.id, 'approve', note);
    } else {
      if (!note) bad('Vui lòng nêu ý kiến khi trả lại công việc.');
      run("UPDATE tasks SET status='doing', completed_at=NULL, reviewed_at=?, review_by=?, updated_at=? WHERE id=?", now(), user.id, now(), t.id);
      tlog(t.id, user.id, 'return', note);
    }
    if (note) run('INSERT INTO task_comments(task_id,user_id,body,created_at) VALUES(?,?,?,?)', t.id, user.id, (body.approve ? 'Duyệt hoàn thành: ' : 'Trả lại: ') + note, now());
    return taskFull(user, t.id);
  });
  /* Cập nhật kết quả, % hoàn thành */
  route('POST', '/api/tasks/:id/results', ({ user, params, body }) => {
    const t = taskOf(int(params.id)), acc = taskAccess(user, t);
    need(acc.progress, 'Chỉ người nhận việc, người giao việc hoặc quản lý mới được cập nhật kết quả.');
    if (['done', 'failed'].includes(t.status)) bad('Công việc đã kết thúc.');
    const note = str(body.note, 5000);
    let prog = null;
    if (body.progress !== undefined && body.progress !== '' && body.progress !== null) {
      if (!acc.S.allow_percent) bad('Dự án/phòng ban chưa bật cập nhật % hoàn thành.');
      prog = int(body.progress); if (prog < 0 || prog > 100) bad('% hoàn thành phải từ 0 đến 100.');
    }
    if (!note && prog === null) bad('Vui lòng nhập kết quả hoặc % hoàn thành.');
    run('INSERT INTO task_results(task_id,user_id,note,progress,created_at) VALUES(?,?,?,?,?)', t.id, user.id, note, prog, now());
    if (prog !== null) run("UPDATE tasks SET progress=?, status=CASE WHEN status='todo' THEN 'doing' ELSE status END, updated_at=? WHERE id=?", prog, now(), t.id);
    tlog(t.id, user.id, 'result', prog !== null ? prog + '%' : '');
    return taskFull(user, t.id);
  });
  /* Người theo dõi */
  route('POST', '/api/tasks/:id/followers', ({ user, params, body }) => {
    const t = taskOf(int(params.id)), acc = taskAccess(user, t);
    need(acc.editInfo || acc.manage, 'Bạn không có quyền thêm người theo dõi.');
    const ids = (Array.isArray(body.user_ids) ? body.user_ids : [body.user_id]).map(int).filter(userOk);
    if (!ids.length) bad('Vui lòng chọn người theo dõi.');
    tx(() => { for (const uid of ids) { run('INSERT OR IGNORE INTO task_followers(task_id,user_id) VALUES(?,?)', t.id, uid); ensureMember(t.project_id, uid, 'follower'); } });
    tlog(t.id, user.id, 'followers', ids.length + ' người');
    return taskFull(user, t.id);
  });
  route('DELETE', '/api/tasks/:id/followers/:uid', ({ user, params }) => {
    const t = taskOf(int(params.id)), acc = taskAccess(user, t), uid = int(params.uid);
    need(acc.editInfo || acc.manage || uid === user.id, 'Bạn không có quyền xóa người theo dõi.');
    run('DELETE FROM task_followers WHERE task_id=? AND user_id=?', t.id, uid);
    return taskFull(user, t.id);
  });
  /* Xóa công việc (kèm toàn bộ việc con) */
  route('DELETE', '/api/tasks/:id', ({ user, params }) => {
    const t = taskOf(int(params.id)), acc = taskAccess(user, t);
    need(acc.del, 'Bạn không có quyền xóa công việc này.');
    const ids = [t.id]; for (let i = 0; i < ids.length && i < 2000; i++) for (const c of all('SELECT id FROM tasks WHERE parent_id=?', ids[i])) ids.push(c.id);
    const blobs = blobsOf(ids);
    tx(() => { for (const id of ids.reverse()) { run('DELETE FROM task_files WHERE task_id=?', id); run('DELETE FROM tasks WHERE id=?', id); } });
    releaseBlobs(blobs);
    log(user.id, `xóa công việc <b>${esc(t.title)}</b>`);
    return { ok: true, deleted: ids.length };
  });
  /* Nhân bản công việc */
  route('POST', '/api/tasks/:id/clone', ({ user, params, body }) => {
    const src = taskOf(int(params.id)), p = projectOf(src.project_id), role = roleIn(user, p.id), acc = taskAccess(user, src, p, role);
    need(acc.view && acc.open && (canManage(role) || (role === 'member' && acc.S.member_create)), 'Bạn không có quyền nhân bản công việc này.');
    const keep = body.keep || {};
    const cloneOne = (s, parentId, depth) => {
      const id = Number(run(`INSERT INTO tasks(project_id,group_id,parent_id,title,description,assignee_id,creator_id,status,priority,urgent,important,
          start_date,due_date,due_time,est_hours,progress,tags,goal_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'todo',?,?,?,?,?,?,?,0,?,?,?,?)`,
        p.id, keep.group === false ? null : s.group_id, parentId, depth === 0 ? (str(body.title, MAX_TITLE) || ('Bản sao: ' + s.title).slice(0, MAX_TITLE)) : s.title,
        keep.description === false ? '' : s.description, keep.assignee === false ? user.id : s.assignee_id, user.id, s.priority, s.urgent, s.important,
        today(), keep.deadline === false || depth > 0 ? null : s.due_date, keep.deadline === false || depth > 0 ? null : s.due_time, s.est_hours, s.tags || '', s.goal_id || null, now(), now()).lastInsertRowid);
      if (keep.files !== false) run(`INSERT INTO task_files(task_id,kind,doc_id,file_name,file_size,mime,stored_name,uploaded_by,created_at)
        SELECT ?,kind,doc_id,file_name,file_size,mime,stored_name,?,? FROM task_files WHERE task_id=?`, id, user.id, now(), s.id);
      if (keep.checklist !== false) for (const c of all('SELECT text FROM task_checklist WHERE task_id=?', s.id)) run('INSERT INTO task_checklist(task_id,text) VALUES(?,?)', id, c.text);
      if (keep.followers !== false) for (const f of all('SELECT user_id FROM task_followers WHERE task_id=?', s.id)) run('INSERT OR IGNORE INTO task_followers(task_id,user_id) VALUES(?,?)', id, f.user_id);
      if (keep.subtasks !== false && depth < MAX_DEPTH) for (const c of all('SELECT * FROM tasks WHERE parent_id=?', s.id)) cloneOne(c, id, depth + 1);
      return id;
    };
    let id; tx(() => { id = cloneOne(src, src.parent_id, 0); tlog(id, user.id, 'clone', `từ #${src.id}`); });
    return taskFull(user, id);
  });
  /* ---------- Tệp đính kèm, tài liệu liên kết ----------
   * Quyền thêm: người xem được công việc và có quyền sửa thông tin hoặc cập nhật tiến độ (người giao, người nhận, quản lý).
   * Tài liệu từ kho Tài liệu chỉ lưu liên kết; tải về qua /api/docs/:id/file nên vẫn áp dụng quyền xem của tài liệu đó. */
  const canAttach = acc => acc.view && acc.open && (acc.editInfo || acc.progress);
  const docVisible = (u, d) => !d.dept_id || isOwner(u) || u.dept_id === d.dept_id;
  route('POST', '/api/tasks/:id/files', ({ user, params, body }) => {
    const ids = [...new Set([int(params.id), ...(Array.isArray(body.also_task_ids) ? body.also_task_ids.map(int) : [])])].slice(0, 100);
    for (const id of ids) {
      const t = taskOf(id); need(canAttach(taskAccess(user, t)), 'Bạn không có quyền đính kèm tệp vào công việc này.');
      if (get('SELECT COUNT(*) n FROM task_files WHERE task_id=?', id).n >= TASK_FILES_PER_TASK) bad(`Mỗi công việc tối đa ${TASK_FILES_PER_TASK} tệp đính kèm.`);
    }
    let row;
    if (body.doc_id) {
      const d = get('SELECT id, title, dept_id, file_name, file_size, mime FROM doc_items WHERE id=?', int(body.doc_id)) || notFound('Tài liệu không tồn tại.');
      if (!docVisible(user, d)) forbid('Bạn không có quyền xem tài liệu này.');
      row = { kind: 'doc', doc_id: d.id, name: d.file_name || d.title, size: d.file_size || 0, mime: d.mime || '', stored: null };
    } else {
      const f = saveUpload(body, bad, TASK_FILE_MAX); if (!f) bad('Vui lòng chọn tệp đính kèm.');
      row = { kind: 'file', doc_id: null, name: f.name, size: f.size, mime: f.mime, stored: f.stored };
    }
    tx(() => { for (const id of ids) {
      run('INSERT INTO task_files(task_id,kind,doc_id,file_name,file_size,mime,stored_name,uploaded_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)', id, row.kind, row.doc_id, row.name, row.size, row.mime, row.stored, user.id, now());
      tlog(id, user.id, 'file', row.name);
    } });
    return taskFull(user, ids[0]);
  });
  route('GET', '/api/task-files/:id', ({ user, params, res }) => {
    const f = get("SELECT * FROM task_files WHERE id=?", int(params.id)) || notFound('Tệp không tồn tại.');
    need(taskAccess(user, taskOf(f.task_id)).view, 'Bạn không có quyền xem công việc này.');
    if (f.kind !== 'file') bad('Tài liệu liên kết được tải tại phân hệ Tài liệu.');
    const buf = FILES.read(f.stored_name); if (!buf) notFound('Không tìm thấy nội dung tệp.');
    sendFile(res, buf, f.file_name, f.mime);
  }, { raw: true });
  route('DELETE', '/api/task-files/:id', ({ user, params }) => {
    const f = get('SELECT * FROM task_files WHERE id=?', int(params.id)) || notFound('Tệp không tồn tại.');
    const acc = taskAccess(user, taskOf(f.task_id));
    need(acc.view && acc.open && (f.uploaded_by === user.id || acc.edit || acc.manage), 'Chỉ người tải lên, người giao việc hoặc quản lý mới được gỡ tệp.');
    run('DELETE FROM task_files WHERE id=?', f.id); tlog(f.task_id, user.id, 'file_del', f.file_name);
    if (f.kind === 'file') releaseBlobs([f.stored_name]);
    return taskFull(user, f.task_id);
  });

  /* Checklist, bình luận (có kiểm tra quyền) */
  route('POST', '/api/tasks/:id/checklist', ({ user, params, body }) => {
    const t = taskOf(int(params.id)); need(taskAccess(user, t).progress, 'Bạn không có quyền sửa danh mục đầu việc.');
    const text = str(body.text, 300); if (!text) bad('Vui lòng nhập nội dung đầu việc.');
    run('INSERT INTO task_checklist(task_id,text) VALUES(?,?)', t.id, text);
    return taskFull(user, t.id);
  });
  route('PUT', '/api/checklist/:id', ({ user, params, body }) => {
    const c = get('SELECT * FROM task_checklist WHERE id=?', int(params.id)) || notFound();
    need(taskAccess(user, taskOf(c.task_id)).progress, 'Bạn không có quyền sửa danh mục đầu việc.');
    run('UPDATE task_checklist SET done=? WHERE id=?', body.done ? 1 : 0, c.id);
    return taskFull(user, c.task_id);
  });
  route('DELETE', '/api/checklist/:id', ({ user, params }) => {
    const c = get('SELECT * FROM task_checklist WHERE id=?', int(params.id)) || notFound();
    need(taskAccess(user, taskOf(c.task_id)).progress, 'Bạn không có quyền sửa danh mục đầu việc.');
    run('DELETE FROM task_checklist WHERE id=?', c.id);
    return taskFull(user, c.task_id);
  });
  route('POST', '/api/tasks/:id/comments', ({ user, params, body }) => {
    const t = taskOf(int(params.id)); need(taskAccess(user, t).comment, 'Bạn không có quyền trao đổi trong công việc này.');
    const b = str(body.body, 3000); if (!b) bad('Vui lòng nhập nội dung trao đổi.');
    run('INSERT INTO task_comments(task_id,user_id,body,created_at) VALUES(?,?,?,?)', t.id, user.id, b, now());
    return taskFull(user, t.id);
  });

  /* ---------- Báo cáo dự án, xuất CSV ---------- */
  route('GET', '/api/projects/:id/report', ({ user, params }) => {
    const p = projectOf(int(params.id)), role = roleIn(user, p.id); need(role && role !== 'follower', 'Chỉ quản lý và thành viên mới xem được báo cáo dự án/phòng ban.');
    const [T, T2, N] = lateArgs();
    const v = canManage(role) || settingsOf(p).member_view_all ? { sql: '1=1', args: [] } : visibleFilter(user);
    const base = `FROM tasks t WHERE t.project_id=? AND ${v.sql}`;
    const agg = `COUNT(*) total, SUM(t.status='todo') todo, SUM(t.status='doing') doing, SUM(t.status='review') review, SUM(t.status='done') done,
      SUM(t.status='failed') failed, SUM(${lateExpr}) late,
      SUM(t.status='done' AND t.due_date IS NOT NULL AND substr(COALESCE(t.completed_at,t.done_at),1,10) <= t.due_date) ontime,
      SUM(t.status='done' AND t.due_date IS NOT NULL) done_with_due`;
    return {
      summary: get(`SELECT ${agg} ${base}`, T, T2, N, p.id, ...v.args),
      by_member: all(`SELECT t.assignee_id user_id, ${agg} ${base} GROUP BY t.assignee_id ORDER BY total DESC`, T, T2, N, p.id, ...v.args),
      by_group: all(`SELECT t.group_id, ${agg} ${base} GROUP BY t.group_id`, T, T2, N, p.id, ...v.args)
    };
  });
  route('GET', '/api/projects/:id/export.csv', ({ user, params, res }) => {
    const p = projectOf(int(params.id)), role = roleIn(user, p.id); need(role, 'Bạn không phải thành viên của dự án/phòng ban này.');
    const v = visibleFilter(user);
    const rows = all(`SELECT t.*, g.name gn, u.full_name an, c.full_name cn FROM tasks t LEFT JOIN task_groups g ON g.id=t.group_id
      LEFT JOIN users u ON u.id=t.assignee_id LEFT JOIN users c ON c.id=t.creator_id WHERE t.project_id=? AND ${v.sql} ORDER BY g.sort, t.id`, p.id, ...v.args);
    const SL = { todo: 'Cần làm', doing: 'Đang làm', review: 'Chờ đánh giá', done: 'Hoàn thành', failed: 'Thất bại' };
    const fd = s => s ? String(s).slice(0, 10).split('-').reverse().join('/') : '';
    const csv = '﻿' + [['STT', 'Mã', 'Nhóm công việc', 'Công việc', 'Việc cha', 'Người giao', 'Người nhận', 'Ngày bắt đầu', 'Thời hạn', 'Giờ hạn', 'Trạng thái', '% hoàn thành', 'Ngày hoàn thành', 'Lý do thất bại', 'Nhãn']]
      .concat(rows.map((t, i) => [i + 1, t.id, t.gn || 'Chưa phân loại', t.title, t.parent_id || '', t.cn, t.an, fd(t.start_date), fd(t.due_date), t.due_time || '', SL[t.status] || t.status, t.progress, fd(t.done_at), t.fail_reason || '', tagList(t.tags).join('; ')]))
      .map(r => r.map(x => { const s = String(x ?? ''); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',')).join('\r\n');
    res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="cong-viec-du-an-${p.id}-${today()}.csv"` });
    res.end(csv);
  }, { raw: true });

  return { taskAccess, roleIn };
}

/* ================= Chuyển dữ liệu bản 1.x (chạy một lần) ================= */
function migrate() {
  if (get("SELECT value FROM settings WHERE key='work_v2_migrated'")) return false;
  tx(() => {
    for (const p of all('SELECT * FROM projects')) {
      if (!p.settings || p.settings === '{}') run('UPDATE projects SET settings=?, status=COALESCE(status,\'open\'), kind=COALESCE(kind,\'project\') WHERE id=?', JSON.stringify(DEFAULT_SETTINGS), p.id);
      if (p.archived) run("UPDATE projects SET status='closed', close_result='success' WHERE id=?", p.id);
      const ids = new Set(all('SELECT DISTINCT assignee_id u FROM tasks WHERE project_id=? UNION SELECT DISTINCT creator_id FROM tasks WHERE project_id=?', p.id, p.id).map(r => r.u).filter(Boolean));
      if (p.owner_id) run('INSERT OR IGNORE INTO project_members(project_id,user_id,role,added_at) VALUES(?,?,?,?)', p.id, p.owner_id, 'manager', now());
      for (const u of ids) run('INSERT OR IGNORE INTO project_members(project_id,user_id,role,added_at) VALUES(?,?,?,?)', p.id, u, 'member', now());
      const range = get('SELECT MIN(start_date) s, MAX(due_date) e FROM tasks WHERE project_id=?', p.id);
      if (range && range.s && !p.start_date) run('UPDATE projects SET start_date=?, end_date=? WHERE id=?', range.s, range.e, p.id);
    }
    run("UPDATE tasks SET progress=100, completed_at=COALESCE(completed_at, done_at) WHERE status='done'");
    run("INSERT OR REPLACE INTO settings(key,value) VALUES('work_v2_migrated', ?)", now());
  });
  return true;
}

module.exports = { register, migrate, DEFAULT_SETTINGS, STATUS };
