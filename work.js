'use strict';
/**
 * SmartOffice — Phân hệ Công việc – Dự án (phiên bản 2).
 * Căn cứ: docs/02-thiet-ke/YEU-CAU-CONG-VIEC-DU-AN.md, ADR-005.
 * Tuân thủ: ATTT-12/13 (kiểm tra quyền tại máy chủ), HN-07 (phân trang ≤ 200), chạy được trên Workers (CLAUDE.md mục 3.3).
 */
const D = require('./db');
const { db, all, get, run, tx, today, now, addCol } = D;
const { FILES, saveUpload, sendFile } = require('./files');
const PLAN = require('./work-plan');

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
/* Lập kế hoạch: phụ thuộc, mốc dự án, công việc lặp lại (Base Wework bài 63000283721, 63000283724, 63000267947, 63000268543) */
addCol('tasks', 'milestone_id', 'INTEGER');
/* Bổ sung đầy đủ theo đối chiếu Base Wework (docs/05-ra-soat/2026-11-06-DOI-CHIEU-BASE-WEWORK.md) */
addCol('projects', 'dept_id', 'INTEGER');               // Department (cấp cha)
addCol('projects', 'classification', "TEXT DEFAULT 'internal'"); // internal | customer
addCol('projects', 'bg', "TEXT DEFAULT ''");            // hình nền (mã màu nhẹ)
addCol('task_groups', 'reviewers', "TEXT DEFAULT '[]'"); // người đánh giá theo nhóm
addCol('task_checklist', 'section', "TEXT DEFAULT ''");   // tên checklist (Base: checklist chứa các todo)
addCol('task_checklist', 'assignee_id', 'INTEGER');       // người thực hiện todo
addCol('task_files', 'result_id', 'INTEGER');             // tệp đính kèm kết quả công việc
addCol('task_files', 'field_id', 'INTEGER');              // tệp của trường tùy chỉnh dạng tập tin
db.exec(`
CREATE TABLE IF NOT EXISTS project_favorites (user_id INTEGER NOT NULL, project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE, created_at TEXT, PRIMARY KEY(user_id, project_id));
CREATE INDEX IF NOT EXISTS ix_projects_dept ON projects(dept_id);
CREATE TABLE IF NOT EXISTS work_delegations (owner_id INTEGER NOT NULL, delegate_id INTEGER NOT NULL, created_at TEXT, PRIMARY KEY(owner_id, delegate_id));
CREATE INDEX IF NOT EXISTS ix_deleg_delegate ON work_delegations(delegate_id);
`);
addCol('tasks', 'recurrence_id', 'INTEGER');
db.exec(`
CREATE TABLE IF NOT EXISTS task_deps (
  id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL, pred_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  succ_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, type TEXT NOT NULL DEFAULT 'FS', lag_days INTEGER DEFAULT 0,
  created_by INTEGER, created_at TEXT, UNIQUE(pred_id, succ_id));
CREATE INDEX IF NOT EXISTS ix_dep_succ ON task_deps(succ_id);
CREATE INDEX IF NOT EXISTS ix_dep_proj ON task_deps(project_id);
CREATE TABLE IF NOT EXISTS project_milestones (
  id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE, title TEXT NOT NULL,
  due_date TEXT, owner_id INTEGER, description TEXT DEFAULT '', created_by INTEGER, created_at TEXT);
CREATE INDEX IF NOT EXISTS ix_ms_proj ON project_milestones(project_id);
CREATE INDEX IF NOT EXISTS ix_tasks_ms ON tasks(milestone_id);
CREATE TABLE IF NOT EXISTS task_recurrences (
  id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE, group_id INTEGER,
  title TEXT NOT NULL, description TEXT DEFAULT '', assignee_id INTEGER, creator_id INTEGER, followers TEXT DEFAULT '[]',
  tags TEXT DEFAULT '', subtasks TEXT DEFAULT '', checklist TEXT DEFAULT '', priority TEXT DEFAULT 'tb',
  start_date TEXT NOT NULL, end_date TEXT, rule TEXT NOT NULL, due_hours REAL DEFAULT 17,
  active INTEGER DEFAULT 1, last_gen TEXT, gen_count INTEGER DEFAULT 0, created_at TEXT, updated_at TEXT);
CREATE INDEX IF NOT EXISTS ix_rec_proj ON task_recurrences(project_id);
CREATE INDEX IF NOT EXISTS ix_rec_active ON task_recurrences(active);
CREATE INDEX IF NOT EXISTS ix_tasks_rec ON tasks(recurrence_id);
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
const ROLES = ['manager', 'member', 'guest', 'follower'];
/* Bảng phân quyền sử dụng theo Base Wework (bài 63000277998 và hình minh họa):
 * 1. Theo loại tài khoản (Quản lý luôn có; tùy chọn cho Thành viên, Khách).
 * 2. Chỉnh sửa – cập nhật công việc (Người giao & người thực hiện luôn có; tùy chọn cho Người theo dõi, Khác).
 * 3. Giới hạn đặc biệt đối với người được giao việc. */
const PERM_ACCOUNT = { create_task: 'Thêm công việc mới', create_group: 'Tạo nhóm công việc mới', view_others: 'Xem công việc của người khác', view_unassigned: 'Xem và chỉ định các công việc chưa được giao', view_report: 'Xem báo cáo của dự án', discuss: 'Thêm thảo luận mới', upload_doc: 'Tải lên tài liệu mới' };
const PERM_EDIT = { rename: 'Chỉnh sửa tên công việc', status: 'Đánh dấu - bỏ đánh dấu hoàn thành công việc', description: 'Chỉnh sửa miêu tả công việc', dates: 'Chỉnh sửa thời gian bắt đầu và thời hạn', result: 'Cập nhật kết quả công việc', checklist: 'Tạo và cập nhật checklist', delete: 'Quyền xóa công việc', transfer: 'Chuyển công việc cho người khác' };
const PERM_RESTRICT = { no_edit: 'Không cho phép người được giao việc chỉnh sửa công việc', no_deadline: 'Không cho phép người được giao việc chỉnh sửa deadline', no_delete: 'Không cho phép người được giao việc xóa công việc hoặc chuyển giao cho người khác' };
/* Chuẩn hóa ma trận quyền; tương thích thiết lập cũ (member_create, member_view_all, assignee_edit_*) */
function permOf(S) {
  const P = S.perm && typeof S.perm === 'object' ? S.perm : {};
  const acc = {}, ed = {}, rs = {};
  for (const k of Object.keys(PERM_ACCOUNT)) {
    const v = (P.account || {})[k] || {};
    const legacy = k === 'create_task' ? S.member_create !== false : k === 'view_others' ? S.member_view_all !== false : k === 'view_unassigned' ? S.member_view_all !== false : true;
    acc[k] = { member: v.member === undefined ? legacy : !!v.member, guest: !!v.guest };
  }
  for (const k of Object.keys(PERM_EDIT)) { const v = (P.edit || {})[k] || {}; ed[k] = { follower: v.follower === undefined ? ['result', 'checklist'].includes(k) : !!v.follower, other: !!v.other }; }
  const R0 = P.restrict || {};
  rs.no_edit = R0.no_edit === undefined ? S.assignee_edit_info === false : !!R0.no_edit;
  rs.no_deadline = R0.no_deadline === undefined ? S.assignee_edit_deadline === false : !!R0.no_deadline;
  rs.no_delete = R0.no_delete === undefined ? true : !!R0.no_delete; // mặc định: người được giao không xóa, không chuyển giao (giữ hành vi bản 1.6, khớp hình minh họa bài 63000277998)
  return { account: acc, edit: ed, restrict: rs };
}
const accountCan = (role, S, key) => role === 'owner' || role === 'manager' || ((role === 'member' || role === 'guest') && permOf(S).account[key][role]);
const KINDS = ['project', 'team'];
const HEALTHS = ['on_track', 'late', 'risk'];
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
  deadline_time: false,         // Thời hạn theo giờ
  deps: false,                  // Cho phép công việc phụ thuộc (chỉ áp dụng cho Dự án)
  deps_mode: 'keep'             // keep: giữ nguyên thời gian phụ thuộc khi dời lịch; none: không ảnh hưởng
};
const MAX_DEPTH = 3, PAGE_MAX = 200, MAX_TITLE = 155;
const isTime = s => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(s || ''));
const parseJSON = (s, d) => { try { const v = JSON.parse(s || ''); return v && typeof v === 'object' ? v : d; } catch (e) { return d; } };
const settingsOf = p => Object.assign({}, DEFAULT_SETTINGS, parseJSON(p.settings, {}));

function register({ route, bad, forbid, notFound, isAdmin, isDirector, log, esc, str, int, isDate }) {
  const HOOKS = { task: [], project: [], create: [], clone: [], purge: [], projectPurge: [] };
  let applyTemplate = () => {};
  /* ---------- Phân quyền ---------- */
  const isOwner = u => isAdmin(u) || isDirector(u);
  const projectOf = id => get('SELECT * FROM projects WHERE id=?', id) || notFound('Dự án/phòng ban không tồn tại hoặc đã bị xóa.');
  const roleIn = (u, pid) => { if (isOwner(u)) return 'owner'; const m = get('SELECT role FROM project_members WHERE project_id=? AND user_id=?', pid, u.id); return m ? m.role : null; };
  const canManage = r => r === 'owner' || r === 'manager';
  const isFollower = (tid, uid) => !!get('SELECT 1 FROM task_followers WHERE task_id=? AND user_id=?', tid, uid);
  function taskAccess(u, t, p = projectOf(t.project_id), role = roleIn(u, t.project_id)) {
    const S = settingsOf(p), PM = permOf(S);
    const mine = !!t.assignee_id && t.assignee_id === u.id, creator = t.creator_id === u.id, follower = isFollower(t.id, u.id);
    const manage = canManage(role), party = mine || creator;
    const other = !manage && !party && !follower && (role === 'member' || role === 'guest');
    const unassigned = !t.assignee_id;
    const view = manage || party || follower || (other && (PM.account.view_others[role] || (unassigned && PM.account.view_unassigned[role])));
    const open = p.status !== 'closed';
    /* Người được giao (không đồng thời là người giao) bị giới hạn theo mục 3 */
    const restricted = k => mine && !creator && ((k === 'rename' || k === 'description') ? PM.restrict.no_edit : k === 'dates' ? PM.restrict.no_deadline : (k === 'delete' || k === 'transfer') ? PM.restrict.no_delete : false);
    const can = k => open && view && (manage || (party && !restricted(k) && !(k === 'delete' && creator && !mine && S.creator_delete === false)) || (follower && !party && PM.edit[k].follower) || (other && PM.edit[k].other));
    const reviewer = S.review && (manage || (S.reviewer_mode === 'list' ? (S.reviewers || []).includes(u.id) : creator) || groupReviewer(t.group_id, u.id));
    const r = { view, manage, mine, creator, follower, role, S, open, perm: PM,
      edit: can('transfer'), editInfo: can('rename'), editDesc: can('description'), editDeadline: can('dates'),
      status: can('status'), result: can('result'), checklist: can('checklist'), del: can('delete'),
      fail: open && S.allow_failed && (manage || (creator && S.fail_roles.includes('creator')) || (mine && S.fail_roles.includes('assignee')) || (follower && S.fail_roles.includes('follower'))),
      review: open && !!reviewer, comment: view, claim: open && unassigned && (manage || (view && PM.account.view_unassigned[role])) };
    r.progress = r.status;
    return r;
  }
  const groupReviewer = (gid, uid) => { if (!gid) return false; const g = get('SELECT reviewers FROM task_groups WHERE id=?', gid); return !!g && parseJSON(g.reviewers, []).includes(uid); };
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
    (SELECT COUNT(*) FROM task_files f WHERE f.task_id=t.id) file_count, t.tags, t.goal_id, t.milestone_id, t.recurrence_id,
    (SELECT COUNT(*) FROM task_deps d WHERE d.succ_id=t.id) dep_in, (SELECT COUNT(*) FROM task_deps d WHERE d.pred_id=t.id) dep_out`;
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
    const out = projectBase(u, p, role);
    for (const f of HOOKS.project) f(u, out, role);
    return out;
  }
  function projectBase(u, p, role) {
    return {
      ...p, settings: settingsOf(p), my_role: role, can_manage: canManage(role),
      can_create: p.status !== 'closed' && accountCan(role, settingsOf(p), 'create_task'),
      members: all('SELECT m.user_id, m.role FROM project_members m JOIN users u ON u.id=m.user_id WHERE m.project_id=? ORDER BY CASE m.role WHEN \'manager\' THEN 0 WHEN \'member\' THEN 1 ELSE 2 END, u.full_name', p.id),
      groups: all('SELECT * FROM task_groups WHERE project_id=? ORDER BY sort, id', p.id),
      stats: projectStats(p.id),
      milestones: milestonesOf(p.id),
      perm: permOf(settingsOf(p)), perm_labels: { account: PERM_ACCOUNT, edit: PERM_EDIT, restrict: PERM_RESTRICT },
      can_group: accountCan(role, settingsOf(p), 'create_group'), can_report: accountCan(role, settingsOf(p), 'view_report'),
      can_discuss: accountCan(role, settingsOf(p), 'discuss'), can_upload: accountCan(role, settingsOf(p), 'upload_doc'),
      can_delete: canManage(role) && (isOwner(u) || settingsOf(p).managers_can_delete !== false), is_owner: isOwner(u),
      fav: !!get('SELECT 1 FROM project_favorites WHERE user_id=? AND project_id=?', u.id, p.id),
      dept_name: p.dept_id ? (get('SELECT name FROM departments WHERE id=?', p.dept_id) || {}).name : null,
      tags: [...new Set(all("SELECT tags FROM tasks WHERE project_id=? AND tags<>'' LIMIT 2000", p.id).flatMap(r => tagList(r.tags)))].sort((x, y) => x.localeCompare(y, 'vi')).slice(0, 200)
    };
  }
  route('GET', '/api/projects', ({ user, query }) => {
    recTick();
    const w = [], a = [];
    /* scope: (mặc định) dự án tôi tham gia; all: toàn bộ (chỉ Owner, Base bài 63000252597); dept: dự án thuộc Department tôi quản lý; fav: ưu tiên */
    const scope = query.scope === 'all' && isOwner(user) ? 'all' : query.scope === 'dept' ? 'dept' : query.scope === 'fav' ? 'fav' : 'mine';
    if (scope === 'mine') { w.push('EXISTS (SELECT 1 FROM project_members m WHERE m.project_id=p.id AND m.user_id=?)'); a.push(user.id); }
    if (scope === 'dept') { w.push('p.dept_id IN (SELECT id FROM departments WHERE head_id=?)'); a.push(user.id); }
    if (scope === 'fav') { w.push('EXISTS (SELECT 1 FROM project_favorites f WHERE f.project_id=p.id AND f.user_id=?)'); a.push(user.id); }
    if (HEALTHS.includes(query.health)) { w.push("p.health=? AND p.status<>'closed'"); a.push(query.health); }
    if (query.dept) { w.push('p.dept_id=?'); a.push(int(query.dept)); }
    if (query.status === 'closed') w.push("p.status='closed'"); else if (query.status !== 'all') w.push("p.status<>'closed'");
    if (KINDS.includes(query.kind)) { w.push('p.kind=?'); a.push(query.kind); }
    if (query.q) { w.push('p.name LIKE ?'); a.push('%' + str(query.q, 80) + '%'); }
    const [T, T2, N] = lateArgs();
    const rows = all(`SELECT p.id, p.name, p.color, p.kind, p.status, p.health, p.start_date, p.end_date, p.close_result, p.owner_id, p.dept_id, p.classification,
        (SELECT role FROM project_members m WHERE m.project_id=p.id AND m.user_id=?) my_role,
        EXISTS (SELECT 1 FROM project_favorites f WHERE f.project_id=p.id AND f.user_id=?) fav,
        (SELECT COUNT(*) FROM project_members m WHERE m.project_id=p.id AND m.role<>'follower') member_count,
        (SELECT COUNT(*) FROM tasks t WHERE t.project_id=p.id) total,
        (SELECT COUNT(*) FROM tasks t WHERE t.project_id=p.id AND t.status='done') done,
        (SELECT COUNT(*) FROM tasks t WHERE t.project_id=p.id AND ${lateExpr}) late
      FROM projects p ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY p.status='closed', fav DESC, p.kind, p.name LIMIT 500`, user.id, user.id, T, T2, N, ...a);
    return rows.map(r => ({ ...r, fav: !!r.fav, joined: !!r.my_role, my_role: isOwner(user) && !r.my_role ? 'owner' : r.my_role }));
  });
  route('POST', '/api/projects/:id/favorite', ({ user, params, body }) => {
    const p = projectOf(int(params.id)); need(roleIn(user, p.id), 'Bạn không phải thành viên của dự án/phòng ban này.');
    if (body.on === false) run('DELETE FROM project_favorites WHERE user_id=? AND project_id=?', user.id, p.id);
    else { if (get('SELECT COUNT(*) n FROM project_favorites WHERE user_id=?', user.id).n >= 300) bad('Tối đa 300 dự án/phòng ban ưu tiên.'); run('INSERT OR IGNORE INTO project_favorites(user_id,project_id,created_at) VALUES(?,?,?)', user.id, p.id, now()); }
    return { fav: body.on !== false };
  });
  /* Owner tự thêm mình làm quản lý (Base bài 63000252596) */
  route('POST', '/api/projects/:id/join-manager', ({ user, params }) => {
    const p = projectOf(int(params.id)); need(isOwner(user), 'Chỉ quản trị hệ thống mới thực hiện được thao tác này.');
    run('DELETE FROM project_members WHERE project_id=? AND user_id=?', p.id, user.id);
    run('INSERT INTO project_members(project_id,user_id,role,added_at) VALUES(?,?,?,?)', p.id, user.id, 'manager', now());
    log(user.id, `tự thêm mình làm quản lý <b>${esc(p.name)}</b>`);
    return projectFull(user, projectOf(p.id));
  });
  function projectInput(body, old = {}) {
    const p = {
      name: str(body.name ?? old.name, 120), kind: body.kind ?? old.kind ?? 'project', color: str(body.color ?? old.color, 9) || '#0e6f68',
      description: str(body.description ?? old.description, 3000),
      start_date: (body.start_date ?? old.start_date) || null, end_date: (body.end_date ?? old.end_date) || null,
      dept_id: body.dept_id !== undefined ? (int(body.dept_id) || null) : (old.dept_id || null),
      classification: ['internal', 'customer'].includes(body.classification) ? body.classification : (old.classification || 'internal'),
      bg: body.bg !== undefined ? (/^#[0-9a-fA-F]{6}$/.test(body.bg) ? body.bg : '') : (old.bg || '')
    };
    if (p.dept_id && !get('SELECT 1 FROM departments WHERE id=?', p.dept_id)) bad('Department không hợp lệ.');
    if (!p.name) bad('Vui lòng nhập tên dự án/phòng ban.');
    if (!KINDS.includes(p.kind)) bad('Loại không hợp lệ.');
    if (!/^#[0-9a-fA-F]{6}$/.test(p.color)) bad('Màu không hợp lệ.');
    for (const k of ['start_date', 'end_date']) if (p[k] && !isDate(p[k])) bad('Ngày không hợp lệ.');
    if (p.start_date && p.end_date && p.end_date < p.start_date) bad('Ngày kết thúc phải sau ngày bắt đầu.');
    if (p.kind === 'team') { p.start_date = null; p.end_date = null; }
    return p;
  }
  /* Cấu hình hệ thống của phân hệ (Base bài 63000270226): quyền tạo dự án, phòng ban */
  const CFG_DEF = { create_project: { mode: 'all', users: [] }, create_team: { mode: 'all', users: [] } };
  const workCfg = () => Object.assign({}, CFG_DEF, parseJSON((get("SELECT value FROM settings WHERE key='work_config'") || {}).value, {}));
  const isDeptHead = u => !!get('SELECT 1 FROM departments WHERE head_id=?', u.id);
  const canCreateProject = (u, kind) => { if (isOwner(u)) return true; const c = workCfg()[kind === 'team' ? 'create_team' : 'create_project'] || { mode: 'all' };
    return c.mode === 'all' || (c.mode === 'heads' && isDeptHead(u)) || (c.mode === 'list' && (c.users || []).includes(u.id)); };
  route('GET', '/api/work/config', ({ user }) => ({ ...workCfg(), can_create_project: canCreateProject(user, 'project'), can_create_team: canCreateProject(user, 'team'), is_owner: isOwner(user),
    delegates: all('SELECT delegate_id FROM work_delegations WHERE owner_id=?', user.id).map(r => r.delegate_id),
    delegators: all('SELECT owner_id FROM work_delegations WHERE delegate_id=?', user.id).map(r => r.owner_id) }));
  route('PUT', '/api/work/config', ({ user, body }) => {
    need(isOwner(user), 'Chỉ quản trị hệ thống mới được thay đổi cấu hình.');
    const c = workCfg();
    for (const k of ['create_project', 'create_team']) if (body[k]) { const m = ['all', 'heads', 'list'].includes(body[k].mode) ? body[k].mode : 'all'; c[k] = { mode: m, users: (Array.isArray(body[k].users) ? body[k].users : []).map(int).filter(userOk).slice(0, 500) }; }
    run("INSERT INTO settings(key,value) VALUES('work_config',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", JSON.stringify(c));
    log(user.id, 'cập nhật cấu hình phân hệ Công việc – Dự án');
    return workCfg();
  });
  /* Ủy quyền giao việc (Base bài 63000254750): tối đa 10 người */
  route('PUT', '/api/work/delegations', ({ user, body }) => {
    const ids = [...new Set((Array.isArray(body.delegate_ids) ? body.delegate_ids : []).map(int).filter(id => id !== user.id && userOk(id)))];
    if (ids.length > 10) bad('Mỗi tài khoản ủy quyền tối đa 10 người.');
    tx(() => { run('DELETE FROM work_delegations WHERE owner_id=?', user.id); for (const d of ids) run('INSERT INTO work_delegations(owner_id,delegate_id,created_at) VALUES(?,?,?)', user.id, d, now()); });
    log(user.id, `cập nhật ủy quyền giao việc (${ids.length} người)`);
    return { delegates: ids };
  });
  route('POST', '/api/projects', ({ user, body }) => {
    const p = projectInput(body);
    need(canCreateProject(user, p.kind), `Bạn chưa được phân quyền tạo ${p.kind === 'team' ? 'phòng ban' : 'dự án'} mới.`);
    const managers = new Set([user.id, ...(Array.isArray(body.managers) ? body.managers.map(int) : [])].filter(userOk));
    const memberIds = (Array.isArray(body.members) ? body.members.map(int) : []).concat(...(Array.isArray(body.member_depts) ? body.member_depts : []).map(d => all('SELECT id FROM users WHERE dept_id=? AND active=1', int(d)).map(r => r.id)));
    const members = new Set(memberIds.filter(id => userOk(id) && !managers.has(id)));
    const health = HEALTHS.includes(body.health) ? body.health : 'on_track';
    let id;
    tx(() => {
      id = Number(run(`INSERT INTO projects(name,color,owner_id,kind,description,start_date,end_date,status,health,dept_id,classification,bg,settings,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,'open',?,?,?,?,?,?,?)`, p.name, p.color, user.id, p.kind, p.description, p.start_date, p.end_date, health, p.dept_id, p.classification, p.bg, JSON.stringify(DEFAULT_SETTINGS), now(), now()).lastInsertRowid);
      for (const m of managers) run('INSERT INTO project_members(project_id,user_id,role,added_at) VALUES(?,?,?,?)', id, m, 'manager', now());
      for (const m of members) run('INSERT INTO project_members(project_id,user_id,role,added_at) VALUES(?,?,?,?)', id, m, 'member', now());
      if (body.template_id) applyTemplate(user, id, body.template_id);
    });
    log(user.id, `tạo ${p.kind === 'team' ? 'phòng ban' : 'dự án'} <b>${esc(p.name)}</b>`);
    return projectFull(user, projectOf(id));
  });
  route('GET', '/api/projects/:id', ({ user, params }) => projectFull(user, projectOf(int(params.id))));
  route('PUT', '/api/projects/:id', ({ user, params, body }) => {
    const old = projectOf(int(params.id)); need(canManage(roleIn(user, old.id)), 'Chỉ quản lý dự án/phòng ban mới được sửa thông tin.');
    const p = projectInput(body, old);
    run('UPDATE projects SET name=?, kind=?, color=?, description=?, start_date=?, end_date=?, dept_id=?, classification=?, bg=?, updated_at=? WHERE id=?', p.name, p.kind, p.color, p.description, p.start_date, p.end_date, p.dept_id, p.classification, p.bg, now(), old.id);
    if (p.kind !== old.kind) log(user.id, `chuyển <b>${esc(p.name)}</b> sang loại ${p.kind === 'team' ? 'phòng ban' : 'dự án'}`);
    return projectFull(user, projectOf(old.id));
  });
  route('PUT', '/api/projects/:id/settings', ({ user, params, body }) => {
    const p = projectOf(int(params.id)); need(canManage(roleIn(user, p.id)), 'Chỉ quản lý dự án/phòng ban mới được thay đổi thiết lập.');
    const S = settingsOf(p), b = body || {};
    for (const k of ['allow_percent', 'review', 'allow_failed', 'member_view_all', 'member_create', 'assignee_edit_deadline', 'assignee_edit_info', 'creator_delete', 'deadline_time', 'deps']) if (k in b) S[k] = !!b[k];
    if ('deps_mode' in b) { if (!['keep', 'none'].includes(b.deps_mode)) bad('Chế độ phụ thuộc không hợp lệ.'); S.deps_mode = b.deps_mode; }
    if ('est_enabled' in b) S.est_enabled = !!b.est_enabled;
    if ('subtask_display' in b) S.subtask_display = ['multi', 'one', 'none'].includes(b.subtask_display) ? b.subtask_display : 'multi';
    if ('managers_can_delete' in b) { need(isOwner(user), 'Chỉ quản trị hệ thống mới được thiết lập quyền xóa của quản lý.'); S.managers_can_delete = !!b.managers_can_delete; }
    if (b.perm && typeof b.perm === 'object') {
      const cur = permOf(S), P = { account: {}, edit: {}, restrict: {} };
      for (const k of Object.keys(PERM_ACCOUNT)) { const v = (b.perm.account || {})[k] || cur.account[k]; P.account[k] = { member: !!v.member, guest: !!v.guest }; }
      for (const k of Object.keys(PERM_EDIT)) { const v = (b.perm.edit || {})[k] || cur.edit[k]; P.edit[k] = { follower: !!v.follower, other: !!v.other }; }
      for (const k of Object.keys(PERM_RESTRICT)) P.restrict[k] = (b.perm.restrict || {})[k] !== undefined ? !!b.perm.restrict[k] : cur.restrict[k];
      S.perm = P;
      /* Đồng bộ khóa cũ để các màn hình, báo cáo cũ đọc đúng */
      S.member_create = P.account.create_task.member; S.member_view_all = P.account.view_others.member;
      S.assignee_edit_info = !P.restrict.no_edit; S.assignee_edit_deadline = !P.restrict.no_deadline;
    }
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
    need(isOwner(user) || settingsOf(p).managers_can_delete !== false, 'Quản trị hệ thống đã giới hạn quyền xóa của quản lý đối với dự án/phòng ban này.');
    const blobs = all("SELECT f.stored_name FROM task_files f JOIN tasks t ON t.id=f.task_id WHERE t.project_id=? AND f.kind='file'", p.id).map(r => r.stored_name).concat(...HOOKS.projectPurge.map(f => f(p.id)));
    tx(() => { run('DELETE FROM task_files WHERE task_id IN (SELECT id FROM tasks WHERE project_id=?)', p.id); run('DELETE FROM task_deps WHERE project_id=?', p.id); run('DELETE FROM project_milestones WHERE project_id=?', p.id); run('DELETE FROM task_recurrences WHERE project_id=?', p.id); run('DELETE FROM tasks WHERE project_id=?', p.id); run('DELETE FROM projects WHERE id=?', p.id); });
    releaseBlobs(blobs);
    log(user.id, `xóa <b>${esc(p.name)}</b>`);
    return { ok: true };
  });
  /* Thành viên */
  route('POST', '/api/projects/:id/members', ({ user, params, body }) => {
    const p = projectOf(int(params.id)); need(canManage(roleIn(user, p.id)), 'Chỉ quản lý mới được thêm thành viên.');
    const role = ROLES.includes(body.role) ? body.role : 'member';
    let ids = (Array.isArray(body.user_ids) ? body.user_ids : [body.user_id]).map(int).filter(userOk);
    if (body.dept_id) ids = [...new Set(ids.concat(all('SELECT id FROM users WHERE dept_id=? AND active=1', int(body.dept_id)).map(r => r.id)))];
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
    const p = projectOf(int(params.id)); need(accountCan(roleIn(user, p.id), settingsOf(p), 'create_group'), 'Bạn không có quyền tạo nhóm công việc.');
    if (p.status === 'closed') bad('Dự án/phòng ban đã đóng.');
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
    if ('reviewers' in body) run('UPDATE task_groups SET reviewers=? WHERE id=?', JSON.stringify((Array.isArray(body.reviewers) ? body.reviewers : []).map(int).filter(userOk).slice(0, 50)), g.id);
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
    /* Dự án xem được mọi công việc: quản lý; thành viên/khách khi bảng quyền cho phép. Công việc chưa giao: theo quyền "xem và chỉ định" */
    const rows = all("SELECT p.id, p.settings, m.role FROM project_members m JOIN projects p ON p.id=m.project_id WHERE m.user_id=? AND m.role IN ('manager','member','guest')", u.id);
    const full = rows.filter(r => r.role === 'manager' || permOf(settingsOf(r)).account.view_others[r.role]).map(r => r.id);
    const un = rows.filter(r => r.role !== 'manager' && !full.includes(r.id) && permOf(settingsOf(r)).account.view_unassigned[r.role]).map(r => r.id);
    const inList = ids => ids.map(() => '?').join(',');
    return {
      sql: `(${alias}.assignee_id=? OR ${alias}.creator_id=? OR EXISTS (SELECT 1 FROM task_followers f WHERE f.task_id=${alias}.id AND f.user_id=?)` +
        (full.length ? ` OR ${alias}.project_id IN (${inList(full)})` : '') + (un.length ? ` OR (${alias}.assignee_id IS NULL AND ${alias}.project_id IN (${inList(un)}))` : '') + ')',
      args: [u.id, u.id, u.id, ...full, ...un]
    };
  }
  function statusFilter(q, w, a) {
    if (q.status === 'open') w.push(`t.status NOT IN ${CLOSED}`);
    else if (q.status === 'late') { w.push(lateExpr); a.push(...lateArgs()); }
    else if (STATUS.includes(q.status)) { w.push('t.status=?'); a.push(q.status); }
  }
  route('GET', '/api/projects/:id/tasks', ({ user, params, query }) => {
    recTick();
    const p = projectOf(int(params.id)); const role = roleIn(user, p.id);
    const v = visibleFilter(user);
    if (!role) { /* người ngoài dự án chỉ thấy việc mình liên quan */ }
    const w = ['t.project_id=?', v.sql], a = [p.id, ...v.args];
    statusFilter(query, w, a);
    if (query.assignee === 'none') w.push('t.assignee_id IS NULL'); else if (query.assignee) { w.push('t.assignee_id=?'); a.push(int(query.assignee)); }
    if (query.group) { w.push(query.group === 'none' ? 't.group_id IS NULL' : 't.group_id=?'); if (query.group !== 'none') a.push(int(query.group)); }
    if (query.q) { w.push('t.title LIKE ?'); a.push('%' + str(query.q, 100) + '%'); }
    if (query.tag) { w.push("t.tags LIKE ?"); a.push('%,' + str(query.tag, MAX_TAG_LEN) + ',%'); }
    if (query.milestone) { w.push('t.milestone_id=?'); a.push(int(query.milestone)); }
    if (isDate(query.from) && isDate(query.to)) { w.push('COALESCE(t.due_date, t.start_date) >= ? AND COALESCE(t.start_date, t.due_date) <= ?'); a.push(query.from, query.to); }
    const { limit, offset } = pageArgs(query);
    const total = get(`SELECT COUNT(*) n FROM tasks t WHERE ${w.join(' AND ')}`, ...a).n;
    if (!role && !total) need(false, 'Bạn không phải thành viên của dự án/phòng ban này.');
    const rows = all(`SELECT ${TASK_COLS} FROM tasks t WHERE ${w.join(' AND ')}
      ORDER BY ${query.sort === 'updated' ? 't.updated_at DESC, t.id DESC' : query.sort === 'due' ? 't.due_date IS NULL, t.due_date, t.id' : 'COALESCE(t.parent_id, t.id), t.parent_id IS NOT NULL, t.due_date, t.id'} LIMIT ? OFFSET ?`, ...a, limit, offset).map(shape);
    const out = { total, limit, offset, rows };
    if (query.deps) { const ids = new Set(rows.map(r => r.id)); out.deps = all('SELECT id, pred_id, succ_id, type FROM task_deps WHERE project_id=? LIMIT 2000', p.id).filter(d => ids.has(d.pred_id) && ids.has(d.succ_id)); }
    return out;
  });
  /* Việc của tôi: assigned | created | following | review | staff */
  route('GET', '/api/tasks', ({ user, query }) => {
    recTick();
    const scope = query.scope || 'assigned';
    const w = [], a = [];
    if (scope === 'assigned') { w.push('t.assignee_id=?'); a.push(user.id); }
    else if (scope === 'created') { w.push('t.creator_id=? AND (t.assignee_id IS NULL OR t.assignee_id<>?)'); a.push(user.id, user.id); }
    else if (scope === 'marked') { w.push('EXISTS (SELECT 1 FROM task_marks k WHERE k.task_id=t.id AND k.user_id=?)'); a.push(user.id); const v = visibleFilter(user); w.push(v.sql); a.push(...v.args); }
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
    t.milestone = t.milestone_id ? get('SELECT id, title, due_date FROM project_milestones WHERE id=?', t.milestone_id) || null : null;
    t.milestones = all('SELECT id, title, due_date FROM project_milestones WHERE project_id=? ORDER BY due_date IS NULL, due_date, id', p.id);
    t.deps = depInfo(user, t, p);
    t.recurrence = t.recurrence_id ? get('SELECT id, title, active FROM task_recurrences WHERE id=?', t.recurrence_id) || null : null;
    t.files = all('SELECT f.id, f.kind, f.doc_id, f.file_name, f.file_size, f.mime, f.uploaded_by, f.created_at, f.result_id, f.field_id, d.title doc_title FROM task_files f LEFT JOIN doc_items d ON d.id=f.doc_id WHERE f.task_id=? ORDER BY f.id', t.id);
    const { view, edit, editInfo, editDesc, editDeadline, progress, status, result, checklist, del, fail, review, comment, manage, claim } = acc;
    t.can = { view, edit, editInfo, editDesc, editDeadline, progress, status, result, checklist, del, fail, review, comment, manage, claim };
    t.my_role = acc.role;
    for (const f of HOOKS.task) f(user, t, p, acc);
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
    } else need(accountCan(role, S, 'create_task'), 'Bạn không có quyền tạo công việc trong dự án/phòng ban này.');
    const title = str(body.title, MAX_TITLE); if (!title) bad('Vui lòng nhập tên công việc.');
    const assignees = body.unassigned ? [null] : [...new Set((Array.isArray(body.assignee_ids) && body.assignee_ids.length ? body.assignee_ids : [body.assignee_id || user.id]).map(int))];
    if (assignees.length > 100) bad('Giao tối đa 100 người một lần.');
    for (const a of assignees) if (a !== null && !userOk(a)) bad('Người nhận việc không hợp lệ.');
    /* Ủy quyền giao việc: người giao có thể là người đã ủy quyền cho tôi (Base bài 63000254750) */
    let creator = user.id;
    if (body.creator_id && int(body.creator_id) !== user.id) {
      creator = int(body.creator_id);
      need(get('SELECT 1 FROM work_delegations WHERE owner_id=? AND delegate_id=?', creator, user.id), 'Bạn chưa được người này ủy quyền giao việc.');
      const crole = roleIn(get('SELECT * FROM users WHERE id=?', creator) || {}, p.id); need(parent || accountCan(crole, S, 'create_task'), 'Người ủy quyền không có quyền tạo công việc trong dự án/phòng ban này.');
    }
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
    const ms = body.milestone_id ? int(body.milestone_id) : null; if (ms && !get('SELECT 1 FROM project_milestones WHERE id=? AND project_id=?', ms, p.id)) bad('Mốc dự án không hợp lệ.');
    const ids = [];
    tx(() => {
      for (const a of assignees) {
        const id = Number(run(`INSERT INTO tasks(project_id,group_id,parent_id,title,description,assignee_id,creator_id,status,priority,urgent,important,
            start_date,due_date,due_time,est_hours,progress,tags,goal_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'todo',?,?,?,?,?,?,?,0,?,?,?,?)`,
          p.id, group_id, parent ? parent.id : null, title, str(body.description, 10000), a, creator, prio, body.urgent ? 1 : 0, body.important ? 1 : 0,
          start, due, dueTime, est, tags, goal, now(), now()).lastInsertRowid);
        if (ms) run('UPDATE tasks SET milestone_id=? WHERE id=?', ms, id);
        if (a && !get('SELECT 1 FROM project_members WHERE project_id=? AND user_id=?', p.id, a)) ensureMember(p.id, a, 'follower');
        if (creator !== user.id) run('INSERT OR IGNORE INTO task_followers(task_id,user_id) VALUES(?,?)', id, user.id);
        for (const f of followers) if (f !== a) { run('INSERT OR IGNORE INTO task_followers(task_id,user_id) VALUES(?,?)', id, f); ensureMember(p.id, f, 'follower'); }
        for (const c of (Array.isArray(body.checklist) ? body.checklist : [])) if (str(c)) run('INSERT INTO task_checklist(task_id,text) VALUES(?,?)', id, str(c, 300));
        tlog(id, user.id, 'create', parent ? `việc con của #${parent.id}` : '');
        for (const f of HOOKS.create) f(user, id, p, body);
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
    if (want('title') || want('description') || want('priority') || want('urgent') || want('important') || want('group_id') || want('est_hours') || want('tags') || want('goal_id') || want('milestone_id')) {
      const onlyDesc = Object.keys(body).filter(k => want(k) && ['title', 'description', 'priority', 'urgent', 'important', 'group_id', 'est_hours', 'tags', 'goal_id', 'milestone_id'].includes(k)).every(k => k === 'description');
      if (want('description')) need(acc.editDesc, 'Bạn không có quyền sửa mô tả công việc này.');
      if (!onlyDesc) need(acc.editInfo, 'Bạn không có quyền sửa thông tin công việc này.');
      if (want('title')) { set.title = str(body.title, MAX_TITLE); if (!set.title) bad('Vui lòng nhập tên công việc.'); }
      if (want('description')) set.description = str(body.description, 10000);
      if (want('priority')) { if (!PRIO.includes(body.priority)) bad('Mức ưu tiên không hợp lệ.'); set.priority = body.priority; }
      if (want('urgent')) set.urgent = body.urgent ? 1 : 0;
      if (want('important')) set.important = body.important ? 1 : 0;
      if (want('est_hours')) set.est_hours = Math.max(0, Number(body.est_hours) || 0);
      if (want('tags')) set.tags = normTags(body.tags);
      if (want('milestone_id')) { set.milestone_id = body.milestone_id ? int(body.milestone_id) : null; if (set.milestone_id && !get('SELECT 1 FROM project_milestones WHERE id=? AND project_id=?', set.milestone_id, p.id)) bad('Mốc dự án không hợp lệ.'); }
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
      const a = body.assignee_id ? int(body.assignee_id) : null;
      need(acc.edit || (acc.claim && (a === user.id || acc.manage)), 'Bạn không có quyền chuyển công việc cho người khác.');
      if (a !== null && !userOk(a)) bad('Người nhận việc không hợp lệ.');
      set.assignee_id = a; if (a) ensureMember(p.id, a, 'follower');
    }
    const keys = Object.keys(set); if (!keys.length) bad('Không có thông tin nào thay đổi.');
    for (const k of keys) if (String(set[k] ?? '') !== String(t[k] ?? '')) changed.push(k);
    run(`UPDATE tasks SET ${keys.map(k => k + '=?').join(', ')}, updated_at=? WHERE id=?`, ...keys.map(k => set[k]), now(), t.id);
    const LBL = { title: 'tên', description: 'mô tả', priority: 'mức ưu tiên', urgent: 'khẩn cấp', important: 'quan trọng', est_hours: 'thời lượng', group_id: 'nhóm công việc', tags: 'nhãn', goal_id: 'mục tiêu liên kết', milestone_id: 'mốc dự án', start_date: 'ngày bắt đầu', due_date: 'thời hạn', due_time: 'giờ hết hạn', assignee_id: 'người nhận việc' };
    if (changed.length) tlog(t.id, user.id, 'update', changed.map(k => LBL[k] || k).join(', '));
    /* Giữ nguyên thời gian phụ thuộc: dời các công việc bị phụ thuộc theo độ lệch ngày */
    let shifted = 0;
    if (depsOn(p, S) && S.deps_mode === 'keep' && ('start_date' in set || 'due_date' in set)) {
      const dS = t.start_date && set.start_date ? PLAN.dn(set.start_date) - PLAN.dn(t.start_date) : 0;
      const dE = t.due_date && set.due_date ? PLAN.dn(set.due_date) - PLAN.dn(t.due_date) : 0;
      if (dS || dE) tx(() => { shifted = cascade(t.id, dS, dE, user.id); });
    }
    const out = taskFull(user, t.id); out.shifted = shifted; return out;
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
    need(acc.status, 'Bạn không có quyền cập nhật trạng thái công việc này.');
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
    need(acc.result, 'Bạn không có quyền cập nhật kết quả công việc này.');
    if (['done', 'failed'].includes(t.status)) bad('Công việc đã kết thúc.');
    const note = str(body.note, 5000);
    let prog = null;
    if (body.progress !== undefined && body.progress !== '' && body.progress !== null) {
      if (!acc.S.allow_percent) bad('Dự án/phòng ban chưa bật cập nhật % hoàn thành.');
      prog = int(body.progress); if (prog < 0 || prog > 100) bad('% hoàn thành phải từ 0 đến 100.');
    }
    const f = body.file_data ? saveUpload(body, bad, TASK_FILE_MAX) : null;
    if (!note && prog === null && !f) bad('Vui lòng nhập kết quả, tệp hoặc % hoàn thành.');
    const rid = Number(run('INSERT INTO task_results(task_id,user_id,note,progress,created_at) VALUES(?,?,?,?,?)', t.id, user.id, note, prog, now()).lastInsertRowid);
    if (f) run('INSERT INTO task_files(task_id,kind,file_name,file_size,mime,stored_name,uploaded_by,created_at,result_id) VALUES(?,?,?,?,?,?,?,?,?)', t.id, 'file', f.name, f.size, f.mime, f.stored, user.id, now(), rid);
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
    const blobs = blobsOf(ids).concat(...HOOKS.purge.map(f => f(ids)));
    tx(() => { for (const id of ids.reverse()) { run('DELETE FROM task_files WHERE task_id=?', id); run('DELETE FROM task_deps WHERE pred_id=? OR succ_id=?', id, id); run('DELETE FROM tasks WHERE id=?', id); } });
    releaseBlobs(blobs);
    log(user.id, `xóa công việc <b>${esc(t.title)}</b>`);
    return { ok: true, deleted: ids.length };
  });
  /* Nhân bản công việc */
  route('POST', '/api/tasks/:id/clone', ({ user, params, body }) => {
    const src = taskOf(int(params.id)), p = projectOf(src.project_id), role = roleIn(user, p.id), acc = taskAccess(user, src, p, role);
    need(acc.view && acc.open && accountCan(role, acc.S, 'create_task'), 'Bạn không có quyền nhân bản công việc này.');
    const keep = body.keep || {};
    const cloneOne = (s, parentId, depth) => {
      const id = Number(run(`INSERT INTO tasks(project_id,group_id,parent_id,title,description,assignee_id,creator_id,status,priority,urgent,important,
          start_date,due_date,due_time,est_hours,progress,tags,goal_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'todo',?,?,?,?,?,?,?,0,?,?,?,?)`,
        p.id, depth === 0 && body.group_id !== undefined ? (int(body.group_id) || null) : (keep.group === false ? null : s.group_id), parentId, depth === 0 ? (str(body.title, MAX_TITLE) || ('Bản sao: ' + s.title).slice(0, MAX_TITLE)) : s.title,
        keep.description === false ? '' : s.description,
        depth === 0 ? (body.assignee_id ? int(body.assignee_id) : (keep.assignee === false ? user.id : s.assignee_id)) : (keep.sub_assignee === false ? null : s.assignee_id),
        user.id, s.priority, keep.urgent === false ? 0 : s.urgent, keep.important === false ? 0 : s.important,
        keep.start === false || !s.start_date ? today() : s.start_date,
        depth > 0 ? null : (isDate(body.due_date) ? body.due_date : keep.deadline === false ? null : s.due_date), depth > 0 || keep.deadline === false ? null : s.due_time,
        s.est_hours, keep.tags === false ? '' : (s.tags || ''), s.goal_id || null, now(), now()).lastInsertRowid);
      for (const f of HOOKS.clone) f(s.id, id, keep);
      if (s.milestone_id) run('UPDATE tasks SET milestone_id=? WHERE id=?', s.milestone_id, id);
      if (keep.files !== false) run(`INSERT INTO task_files(task_id,kind,doc_id,file_name,file_size,mime,stored_name,uploaded_by,created_at)
        SELECT ?,kind,doc_id,file_name,file_size,mime,stored_name,?,? FROM task_files WHERE task_id=? AND result_id IS NULL`, id, user.id, now(), s.id);
      if (keep.checklist !== false) for (const c of all('SELECT text, section, assignee_id FROM task_checklist WHERE task_id=?', s.id)) run('INSERT INTO task_checklist(task_id,text,section,assignee_id) VALUES(?,?,?,?)', id, c.text, c.section || '', c.assignee_id || null);
      if (keep.followers !== false) for (const f of all('SELECT user_id FROM task_followers WHERE task_id=?', s.id)) run('INSERT OR IGNORE INTO task_followers(task_id,user_id) VALUES(?,?)', id, f.user_id);
      if (keep.subtasks !== false && depth < MAX_DEPTH) for (const c of all('SELECT * FROM tasks WHERE parent_id=?', s.id)) cloneOne(c, id, depth + 1);
      return id;
    };
    let id; tx(() => { id = cloneOne(src, src.parent_id, 0); tlog(id, user.id, 'clone', `từ #${src.id}`); });
    return taskFull(user, id);
  });
  /* ================= Lập kế hoạch ================= */
  /* ---------- Mốc dự án (milestone): mục tiêu quan trọng của dự án; tiến độ = số việc gắn mốc đã hoàn thành ---------- */
  function milestonesOf(pid) {
    return all(`SELECT m.*, (SELECT COUNT(*) FROM tasks t WHERE t.milestone_id=m.id) total,
        (SELECT COUNT(*) FROM tasks t WHERE t.milestone_id=m.id AND t.status='done') done
      FROM project_milestones m WHERE m.project_id=? ORDER BY m.due_date IS NULL, m.due_date, m.id`, pid);
  }
  const msInput = (b, old = {}) => {
    const x = { title: str(b.title ?? old.title, 200), due_date: (b.due_date ?? old.due_date) || null, owner_id: int(b.owner_id ?? old.owner_id) || null, description: str(b.description ?? old.description, 2000) };
    if (!x.title) bad('Vui lòng nhập tên mốc.');
    if (x.due_date && !isDate(x.due_date)) bad('Hạn của mốc không hợp lệ.');
    if (x.owner_id && !userOk(x.owner_id)) bad('Người phụ trách không hợp lệ.');
    return x;
  };
  route('POST', '/api/projects/:id/milestones', ({ user, params, body }) => {
    const p = projectOf(int(params.id)); need(canManage(roleIn(user, p.id)), 'Chỉ quản lý dự án/phòng ban mới được tạo mốc.');
    if (p.status === 'closed') bad('Dự án/phòng ban đã đóng.');
    if (get('SELECT COUNT(*) n FROM project_milestones WHERE project_id=?', p.id).n >= 100) bad('Mỗi dự án tối đa 100 mốc.');
    const x = msInput(body || {});
    run('INSERT INTO project_milestones(project_id,title,due_date,owner_id,description,created_by,created_at) VALUES(?,?,?,?,?,?,?)', p.id, x.title, x.due_date, x.owner_id, x.description, user.id, now());
    if (x.owner_id) ensureMember(p.id, x.owner_id, 'follower');
    return projectFull(user, projectOf(p.id));
  });
  route('PUT', '/api/milestones/:id', ({ user, params, body }) => {
    const m = get('SELECT * FROM project_milestones WHERE id=?', int(params.id)) || notFound('Mốc không tồn tại.');
    need(canManage(roleIn(user, m.project_id)), 'Chỉ quản lý dự án/phòng ban mới được sửa mốc.');
    const x = msInput(body || {}, m);
    run('UPDATE project_milestones SET title=?, due_date=?, owner_id=?, description=? WHERE id=?', x.title, x.due_date, x.owner_id, x.description, m.id);
    if (x.owner_id) ensureMember(m.project_id, x.owner_id, 'follower');
    return projectFull(user, projectOf(m.project_id));
  });
  route('DELETE', '/api/milestones/:id', ({ user, params }) => {
    const m = get('SELECT * FROM project_milestones WHERE id=?', int(params.id)) || notFound('Mốc không tồn tại.');
    need(canManage(roleIn(user, m.project_id)), 'Chỉ quản lý dự án/phòng ban mới được xóa mốc.');
    tx(() => { run('UPDATE tasks SET milestone_id=NULL WHERE milestone_id=?', m.id); run('DELETE FROM project_milestones WHERE id=?', m.id); });
    return projectFull(user, projectOf(m.project_id));
  });

  /* ---------- Công việc phụ thuộc (chỉ Dự án; quản lý bật trong Thiết lập) ----------
   * pred chặn succ. FS/FF neo theo thời hạn của pred, SS/SF neo theo ngày bắt đầu của pred;
   * FS/SS ràng buộc ngày bắt đầu của succ, FF/SF ràng buộc thời hạn của succ. SmartOffice lập lịch theo ngày (lag_days). */
  const depsOn = (p, S) => p.kind === 'project' && S.deps;
  const dateOfAnchor = (t, type) => PLAN.anchorIsEnd(type) ? (t.due_date || t.start_date) : t.start_date;
  /* Dời công việc (giữ nguyên thời lượng) delta ngày; trả về true nếu có thay đổi */
  const moveTask = (t, delta, uid, why) => {
    if (!delta || t.status === 'done' || t.status === 'failed') return false;
    const st = t.start_date ? PLAN.addDaysStr(t.start_date, delta) : null, du = t.due_date ? PLAN.addDaysStr(t.due_date, delta) : null;
    run('UPDATE tasks SET start_date=?, due_date=?, updated_at=? WHERE id=?', st, du, now(), t.id);
    tlog(t.id, uid, 'shift', `${delta > 0 ? '+' : ''}${delta} ngày (${why})`);
    t.start_date = st; t.due_date = du; return true;
  };
  /* Lan truyền: công việc cur vừa đổi ngày bắt đầu ds và thời hạn de ngày → dời các công việc bị phụ thuộc (giữ khoảng cách) */
  function cascade(curId, dS, dE, uid) {
    let shifted = 0; const seen = new Set([curId]); const queue = [[curId, dS, dE]];
    while (queue.length && shifted < 500) {
      const [id, a, b] = queue.shift();
      for (const d of all('SELECT * FROM task_deps WHERE pred_id=?', id)) {
        if (seen.has(d.succ_id)) continue;
        const delta = PLAN.anchorIsEnd(d.type) ? b : a; if (!delta) continue;
        const succ = taskOf(d.succ_id);
        if (moveTask(succ, delta, uid, `phụ thuộc #${id}`)) { shifted++; seen.add(succ.id); queue.push([succ.id, delta, delta]); }
      }
    }
    return shifted;
  }
  /* Đặt công việc bị phụ thuộc theo ràng buộc (khi tạo phụ thuộc ở chế độ giữ nguyên thời gian) */
  function applyConstraint(d, uid) {
    const pred = taskOf(d.pred_id), succ = taskOf(d.succ_id), anchor = dateOfAnchor(pred, d.type);
    const target = PLAN.targetIsStart(d.type) ? succ.start_date : (succ.due_date || succ.start_date);
    if (!anchor || !target) return 0;
    const want = PLAN.addDaysStr(anchor, (d.lag_days || 0) + (d.type === 'FS' ? 1 : 0)); // FS: bắt đầu từ ngày sau khi pred kết thúc
    const delta = PLAN.dn(want) - PLAN.dn(target);
    if (!delta) return 0;
    if (!moveTask(succ, delta, uid, `ràng buộc ${d.type} với #${pred.id}`)) return 0;
    return 1 + cascade(succ.id, delta, delta, uid);
  }
  const reaches = (from, to) => { // có đường đi from → to theo chiều pred→succ?
    const seen = new Set([from]), st = [from];
    while (st.length) { const x = st.pop(); if (x === to) return true; for (const r of all('SELECT succ_id FROM task_deps WHERE pred_id=?', x)) if (!seen.has(r.succ_id) && seen.size < 5000) { seen.add(r.succ_id); st.push(r.succ_id); } }
    return false;
  };
  route('POST', '/api/tasks/:id/deps', ({ user, params, body }) => {
    const me = taskOf(int(params.id)), other = taskOf(int(body.other_id)), p = projectOf(me.project_id), S = settingsOf(p);
    if (!depsOn(p, S)) bad('Dự án chưa bật tính năng công việc phụ thuộc (chỉ áp dụng cho Dự án).');
    if (me.id === other.id) bad('Công việc không thể phụ thuộc chính nó.');
    if (other.project_id !== p.id) bad('Chỉ liên kết được công việc trong cùng dự án.');
    need(taskAccess(user, me, p).editDeadline && taskAccess(user, other, p).editDeadline, 'Bạn cần quyền sửa thời gian của cả hai công việc để tạo phụ thuộc.');
    const type = PLAN.DEP_TYPES.includes(body.type) ? body.type : 'FS';
    const lag = Math.min(Math.max(Math.trunc(Number(body.lag_days) || 0), 0), 365);
    const [pred, succ] = body.direction === 'blocked_by' ? [other, me] : [me, other];
    if (get('SELECT 1 FROM task_deps WHERE (pred_id=? AND succ_id=?) OR (pred_id=? AND succ_id=?)', pred.id, succ.id, succ.id, pred.id)) bad('Hai công việc này đã có quan hệ phụ thuộc.');
    if (reaches(succ.id, pred.id)) bad('Không thể tạo phụ thuộc vòng lặp.');
    if (get('SELECT COUNT(*) n FROM task_deps WHERE pred_id=? OR succ_id=?', me.id, me.id).n >= 50) bad('Mỗi công việc tối đa 50 quan hệ phụ thuộc.');
    let shifted = 0;
    tx(() => {
      const id = Number(run('INSERT INTO task_deps(project_id,pred_id,succ_id,type,lag_days,created_by,created_at) VALUES(?,?,?,?,?,?,?)', p.id, pred.id, succ.id, type, lag, user.id, now()).lastInsertRowid);
      tlog(pred.id, user.id, 'dep', `chặn #${succ.id} (${type}${lag ? ', ' + lag + ' ngày' : ''})`);
      tlog(succ.id, user.id, 'dep', `bị chặn bởi #${pred.id} (${type}${lag ? ', ' + lag + ' ngày' : ''})`);
      if (S.deps_mode === 'keep') shifted = applyConstraint(get('SELECT * FROM task_deps WHERE id=?', id), user.id);
    });
    const t = taskFull(user, me.id); t.shifted = shifted; return t;
  });
  route('DELETE', '/api/task-deps/:id', ({ user, params, query }) => {
    const d = get('SELECT * FROM task_deps WHERE id=?', int(params.id)) || notFound('Quan hệ phụ thuộc không tồn tại.');
    const p = projectOf(d.project_id), pred = taskOf(d.pred_id), succ = taskOf(d.succ_id);
    need(taskAccess(user, pred, p).editDeadline || taskAccess(user, succ, p).editDeadline, 'Bạn không có quyền gỡ phụ thuộc này.');
    run('DELETE FROM task_deps WHERE id=?', d.id);
    tlog(pred.id, user.id, 'dep_del', `#${succ.id}`); tlog(succ.id, user.id, 'dep_del', `#${pred.id}`);
    return taskFull(user, int(query.view) === succ.id ? succ.id : pred.id);
  });
  /* Cảnh báo theo trạng thái công việc phụ thuộc (không chặn cứng thao tác, theo Base: ràng buộc dựa trên thời gian) */
  function depInfo(user, t, p) {
    const map = r => ({ dep_id: r.id, id: r.tid, title: r.title, status: r.status, start_date: r.start_date, due_date: r.due_date, type: r.type, lag_days: r.lag_days });
    const blocked_by = all('SELECT d.*, t.id tid, t.title, t.status, t.start_date, t.due_date FROM task_deps d JOIN tasks t ON t.id=d.pred_id WHERE d.succ_id=? ORDER BY d.id', t.id).map(map);
    const blocking = all('SELECT d.*, t.id tid, t.title, t.status, t.start_date, t.due_date FROM task_deps d JOIN tasks t ON t.id=d.succ_id WHERE d.pred_id=? ORDER BY d.id', t.id).map(map);
    const warn = [];
    for (const b of blocked_by) {
      const started = b.status !== 'todo', finished = b.status === 'done';
      if (b.type === 'FS' && !finished) warn.push(`Chưa nên bắt đầu: “${b.title}” chưa hoàn thành (FS).`);
      if (b.type === 'SS' && !started) warn.push(`Chưa nên bắt đầu: “${b.title}” chưa bắt đầu (SS).`);
      if (b.type === 'FF' && !finished) warn.push(`Chưa nên hoàn thành: “${b.title}” chưa hoàn thành (FF).`);
      if (b.type === 'SF' && !started) warn.push(`Chưa nên hoàn thành: “${b.title}” chưa bắt đầu (SF).`);
    }
    return { blocked_by, blocking, warnings: t.status === 'done' || t.status === 'failed' ? [] : warn, enabled: depsOn(p, settingsOf(p)), mode: settingsOf(p).deps_mode };
  }

  /* ---------- Công việc lặp lại ----------
   * Sinh tự động: khi thiết lập, sinh ngay lần gần nhất; lần thứ n+1 được sinh lúc 7:00 ngày của lần thứ n (Base).
   * Chạy "lười" trong các yêu cầu đọc danh sách, tối đa 10 phút/lần (không cần tiến trình nền, chạy được trên Workers). */
  let lastTick = 0;
  const recCan = (user, r, p) => { const role = roleIn(user, p.id); return canManage(role) || r.creator_id === user.id; };
  function recInput(b, p, old = {}) {
    const v = k => (b[k] !== undefined ? b[k] : old[k]);
    const title = str(v('title'), MAX_TITLE); if (!title) bad('Vui lòng nhập tên công việc.');
    const start = v('start_date'), end = v('end_date') || null;
    if (!isDate(start)) bad('Ngày bắt đầu không hợp lệ.');
    if (end && (!isDate(end) || end < start)) bad('Ngày kết thúc phải sau ngày bắt đầu.');
    const nr = PLAN.normalizeRule(b.rule !== undefined ? b.rule : parseJSON(old.rule, {})); if (nr.error) bad(nr.error);
    const assignee = int(v('assignee_id')); if (!userOk(assignee)) bad('Người nhận việc không hợp lệ.');
    const group = v('group_id') ? int(v('group_id')) : null;
    if (group && !get('SELECT 1 FROM task_groups WHERE id=? AND project_id=?', group, p.id)) bad('Nhóm công việc không hợp lệ.');
    const fol = (b.followers !== undefined ? (Array.isArray(b.followers) ? b.followers : []) : parseJSON(old.followers, [])).map(int).filter(userOk).slice(0, 50);
    const due = Number(v('due_hours')); if (!(due >= 0 && due <= 24 * 366)) bad('Thời hạn (giờ) không hợp lệ.');
    return { title, description: str(v('description'), 10000), start, end, rule: JSON.stringify(nr.rule), assignee, group, followers: JSON.stringify([...new Set(fol)]),
      tags: b.tags !== undefined ? normTags(b.tags) : (old.tags || ''), subtasks: str(v('subtasks'), 5000), checklist: str(v('checklist'), 5000),
      priority: PRIO.includes(v('priority')) ? v('priority') : 'tb', due_hours: due, active: v('active') === undefined ? 1 : (v('active') ? 1 : 0) };
  }
  const recShape = r => { const rule = parseJSON(r.rule, {}); return { ...r, rule, followers: parseJSON(r.followers, []), tags: tagList(r.tags),
    preview: r.active ? PLAN.nextOccurrences(rule, r.start_date, r.end_date, r.last_gen || today(), 10, !r.last_gen) : [] }; };
  /* Sinh một lần lặp (việc cha + việc con + đầu việc) */
  function genOccurrence(r, p, date) {
    const S = settingsOf(p), d = PLAN.dueFromHours(date, r.due_hours);
    const ins = (title, parent) => Number(run(`INSERT INTO tasks(project_id,group_id,parent_id,title,description,assignee_id,creator_id,status,priority,start_date,due_date,due_time,progress,tags,recurrence_id,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,'todo',?,?,?,?,0,?,?,?,?)`, p.id, r.group_id, parent, title, parent ? '' : r.description, r.assignee_id, r.creator_id, r.priority, date, d.due_date, S.deadline_time ? d.due_time : null, parent ? '' : (r.tags || ''), r.id, now(), now()).lastInsertRowid);
    const id = ins(r.title, null);
    for (const line of String(r.subtasks || '').split('\n').map(x => x.trim()).filter(Boolean).slice(0, 30)) ins(line.slice(0, MAX_TITLE), id);
    for (const line of String(r.checklist || '').split('\n').map(x => x.trim()).filter(Boolean).slice(0, 50)) run('INSERT INTO task_checklist(task_id,text) VALUES(?,?)', id, line.slice(0, 300));
    for (const f of parseJSON(r.followers, [])) if (f !== r.assignee_id) run('INSERT OR IGNORE INTO task_followers(task_id,user_id) VALUES(?,?)', id, f);
    ensureMember(p.id, r.assignee_id, 'follower');
    tlog(id, r.creator_id, 'create', `lặp lại ngày ${date.split('-').reverse().join('/')}`);
    return id;
  }
  /* Sinh các lần lặp đến hạn cho một thiết lập; trả về số công việc đã sinh */
  function recGenerate(r) {
    const p = get('SELECT * FROM projects WHERE id=?', r.project_id); if (!p || p.status === 'closed' || !r.active) return 0;
    const rule = parseJSON(r.rule, null); if (!rule) return 0;
    const T = today(), after7 = D.nowHM() >= '07:00'; let n = 0, last = r.last_gen;
    while (n < 31) {
      if (last && (last > T || (last === T && !after7))) break; // lần thứ n+1 chỉ sinh từ 7:00 ngày của lần thứ n
      const next = PLAN.nextOccurrences(rule, r.start_date, r.end_date, last || T, 1, !last)[0];
      if (!next) break;
      genOccurrence(r, p, next); last = next; n++;
    }
    if (n) run('UPDATE task_recurrences SET last_gen=?, gen_count=gen_count+?, updated_at=? WHERE id=?', last, n, now(), r.id);
    return n;
  }
  function recTick(force) {
    if (!force && Date.now() - lastTick < 600000) return 0;
    lastTick = Date.now(); let n = 0;
    tx(() => { for (const r of all('SELECT * FROM task_recurrences WHERE active=1 LIMIT 500')) n += recGenerate(r); });
    return n;
  }
  route('GET', '/api/projects/:id/recurrences', ({ user, params }) => {
    const p = projectOf(int(params.id)), role = roleIn(user, p.id);
    need(role && role !== 'follower', 'Chỉ quản lý và thành viên dự án/phòng ban mới xem được công việc lặp lại.');
    return all('SELECT * FROM task_recurrences WHERE project_id=? ORDER BY active DESC, id DESC LIMIT 200', p.id).map(r => ({ ...recShape(r), can_edit: recCan(user, r, p) }));
  });
  route('POST', '/api/recurrences/preview', ({ body }) => {
    const nr = PLAN.normalizeRule(body.rule); if (nr.error) bad(nr.error);
    if (!isDate(body.start_date)) bad('Ngày bắt đầu không hợp lệ.');
    return { dates: PLAN.nextOccurrences(nr.rule, body.start_date, isDate(body.end_date) ? body.end_date : null, body.start_date > today() ? body.start_date : today(), 10) };
  });
  route('POST', '/api/projects/:id/recurrences', ({ user, params, body }) => {
    const p = projectOf(int(params.id)), role = roleIn(user, p.id), S = settingsOf(p);
    need(accountCan(role, S, 'create_task'), 'Bạn không có quyền tạo công việc lặp lại trong dự án/phòng ban này.');
    if (p.status === 'closed') bad('Dự án/phòng ban đã đóng.');
    if (get('SELECT COUNT(*) n FROM task_recurrences WHERE project_id=?', p.id).n >= 200) bad('Mỗi dự án tối đa 200 công việc lặp lại.');
    const x = recInput(body || {}, p);
    let id;
    tx(() => {
      id = Number(run(`INSERT INTO task_recurrences(project_id,group_id,title,description,assignee_id,creator_id,followers,tags,subtasks,checklist,priority,start_date,end_date,rule,due_hours,active,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, p.id, x.group, x.title, x.description, x.assignee, user.id, x.followers, x.tags, x.subtasks, x.checklist, x.priority, x.start, x.end, x.rule, x.due_hours, x.active, now(), now()).lastInsertRowid);
      recGenerate(get('SELECT * FROM task_recurrences WHERE id=?', id)); // sinh ngay lần gần nhất
    });
    log(user.id, `thiết lập công việc lặp lại <b>${esc(x.title)}</b>`);
    return { ...recShape(get('SELECT * FROM task_recurrences WHERE id=?', id)), can_edit: true };
  });
  route('PUT', '/api/recurrences/:id', ({ user, params, body }) => {
    const r = get('SELECT * FROM task_recurrences WHERE id=?', int(params.id)) || notFound('Công việc lặp lại không tồn tại.');
    const p = projectOf(r.project_id); need(recCan(user, r, p), 'Chỉ quản lý hoặc người thiết lập mới được sửa.');
    const x = recInput(body || {}, p, r);
    const ruleChanged = x.rule !== r.rule || x.start !== r.start_date;
    tx(() => {
      run(`UPDATE task_recurrences SET group_id=?, title=?, description=?, assignee_id=?, followers=?, tags=?, subtasks=?, checklist=?, priority=?, start_date=?, end_date=?, rule=?, due_hours=?, active=?, updated_at=? WHERE id=?`,
        x.group, x.title, x.description, x.assignee, x.followers, x.tags, x.subtasks, x.checklist, x.priority, x.start, x.end, x.rule, x.due_hours, x.active, now(), r.id);
      if (ruleChanged && r.last_gen) run('UPDATE task_recurrences SET last_gen=? WHERE id=?', r.last_gen > today() ? r.last_gen : today(), r.id); // không sinh lại các ngày đã qua
      recGenerate(get('SELECT * FROM task_recurrences WHERE id=?', r.id));
    });
    return { ...recShape(get('SELECT * FROM task_recurrences WHERE id=?', r.id)), can_edit: true };
  });
  route('DELETE', '/api/recurrences/:id', ({ user, params }) => {
    const r = get('SELECT * FROM task_recurrences WHERE id=?', int(params.id)) || notFound('Công việc lặp lại không tồn tại.');
    need(recCan(user, r, projectOf(r.project_id)), 'Chỉ quản lý hoặc người thiết lập mới được xóa.');
    tx(() => { run('UPDATE tasks SET recurrence_id=NULL WHERE recurrence_id=?', r.id); run('DELETE FROM task_recurrences WHERE id=?', r.id); });
    return { ok: true };
  });

  /* ---------- Tệp đính kèm, tài liệu liên kết ----------
   * Quyền thêm: người xem được công việc và có quyền sửa thông tin hoặc cập nhật tiến độ (người giao, người nhận, quản lý).
   * Tài liệu từ kho Tài liệu chỉ lưu liên kết; tải về qua /api/docs/:id/file nên vẫn áp dụng quyền xem của tài liệu đó. */
  const canAttach = acc => acc.view && acc.open && (acc.editInfo || acc.editDesc || acc.result);
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
      if (body.field_id) { const fd = get("SELECT id FROM task_fields WHERE id=? AND type='file' AND project_id=?", int(body.field_id), taskOf(ids[0]).project_id); if (!fd) bad('Trường tùy chỉnh không hợp lệ.'); row.field = fd.id; }
    }
    tx(() => { for (const id of ids) {
      run('INSERT INTO task_files(task_id,kind,doc_id,file_name,file_size,mime,stored_name,uploaded_by,created_at,field_id) VALUES(?,?,?,?,?,?,?,?,?,?)', id, row.kind, row.doc_id, row.name, row.size, row.mime, row.stored, user.id, now(), row.field || null);
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
    const t = taskOf(int(params.id)); need(taskAccess(user, t).checklist, 'Bạn không có quyền tạo, cập nhật checklist.');
    const text = str(body.text, 300); if (!text) bad('Vui lòng nhập nội dung đầu việc.');
    const asg = body.assignee_id ? int(body.assignee_id) : null; if (asg && !userOk(asg)) bad('Người thực hiện không hợp lệ.');
    if (get('SELECT COUNT(*) n FROM task_checklist WHERE task_id=?', t.id).n >= 200) bad('Mỗi công việc tối đa 200 việc cần làm.');
    run('INSERT INTO task_checklist(task_id,text,section,assignee_id) VALUES(?,?,?,?)', t.id, text, str(body.section, 120), asg);
    return taskFull(user, t.id);
  });
  route('PUT', '/api/checklist/:id', ({ user, params, body }) => {
    const c = get('SELECT * FROM task_checklist WHERE id=?', int(params.id)) || notFound();
    need(taskAccess(user, taskOf(c.task_id)).checklist, 'Bạn không có quyền tạo, cập nhật checklist.');
    if ('done' in body) run('UPDATE task_checklist SET done=? WHERE id=?', body.done ? 1 : 0, c.id);
    if ('text' in body) { const tx2 = str(body.text, 300); if (!tx2) bad('Vui lòng nhập nội dung.'); run('UPDATE task_checklist SET text=? WHERE id=?', tx2, c.id); }
    if ('assignee_id' in body) { const a2 = body.assignee_id ? int(body.assignee_id) : null; if (a2 && !userOk(a2)) bad('Người thực hiện không hợp lệ.'); run('UPDATE task_checklist SET assignee_id=? WHERE id=?', a2, c.id); }
    return taskFull(user, c.task_id);
  });
  route('DELETE', '/api/checklist/:id', ({ user, params }) => {
    const c = get('SELECT * FROM task_checklist WHERE id=?', int(params.id)) || notFound();
    need(taskAccess(user, taskOf(c.task_id)).checklist, 'Bạn không có quyền tạo, cập nhật checklist.');
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
    const p = projectOf(int(params.id)), role = roleIn(user, p.id); need(accountCan(role, settingsOf(p), 'view_report'), 'Bạn không có quyền xem báo cáo của dự án/phòng ban này.');
    const [T, T2, N] = lateArgs();
    const v = canManage(role) || permOf(settingsOf(p)).account.view_others[role] ? { sql: '1=1', args: [] } : visibleFilter(user);
    const base = `FROM tasks t WHERE t.project_id=? AND ${v.sql}`;
    const agg = `COUNT(*) total, SUM(t.status='todo') todo, SUM(t.status='doing') doing, SUM(t.status='review') review, SUM(t.status='done') done,
      SUM(t.status='failed') failed, SUM(${lateExpr}) late,
      SUM(t.status='done' AND t.due_date IS NOT NULL AND substr(COALESCE(t.completed_at,t.done_at),1,10) <= t.due_date) ontime,
      SUM(t.status='done' AND t.due_date IS NOT NULL) done_with_due, ROUND(SUM(COALESCE(t.est_hours,0)),2) est_hours, ROUND(SUM(CASE WHEN t.status='done' THEN COALESCE(t.est_hours,0) ELSE 0 END),2) est_done`;
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

  /* Mô-đun mở rộng (work-ext.js): dùng chung các hàm phân quyền, truy vấn của mô-đun này */
  const H = { route, bad, forbid, notFound, isAdmin, isDirector, log, esc, str, int, isDate, isOwner, projectOf, roleIn, canManage, taskAccess, taskOf, taskFull, projectFull,
    need, tlog, userOk, ensureMember, settingsOf, accountCan, permOf, visibleFilter, lateExpr, lateArgs, TASK_COLS, shape, pageArgs, releaseBlobs, blobsOf, normTags, tagList,
    depthOf, PLAN, MAX_TITLE, MAX_DEPTH, PRIO, CLOSED, STATUS, isDeptHead, canCreateProject, milestonesOf, HOOKS, parseJSON, DEFAULT_SETTINGS, validDue, cascade, depsOn, recTick, isTime };
  const EXT = require('./work-ext').register(H);
  applyTemplate = EXT.applyTemplate;
  return { taskAccess, roleIn, recTick };
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
