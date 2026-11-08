'use strict';
/**
 * SmartOffice — Vận hành tự chủ (ADR-012).
 *  - Phân hệ 26. Cập nhật tiến độ tuần: nhân sự tự báo đã làm, sẽ làm, vướng mắc; quản lý ghi nhận, phản hồi.
 *  - Phân hệ 30. Giám sát, cảnh báo, leo thang: hệ thống tự phát hiện việc quá hạn, sắp đến hạn, chưa có người nhận,
 *    quá tải, mục tiêu chậm tiến độ, chưa cập nhật tiến độ tuần, cần hỗ trợ; mức cảnh báo tăng theo thời gian và
 *    được chuyển lần lượt: người thực hiện (mức 1) → trưởng phòng (mức 2) → giám đốc (mức 3).
 * Nguyên tắc: nhân sự là chủ thể thực hiện; hệ thống chỉ giám sát kết quả, tiến độ công việc (không thu thập dữ liệu
 * ngoài phạm vi công việc); cảnh báo tính tại thời điểm xem, không cần tác vụ định kỳ.
 * Tuân thủ: ATTT-12/13 (kiểm tra phạm vi tại máy chủ), HN-07 (giới hạn bản ghi), chạy được trên Workers (CLAUDE.md mục 3.3).
 */
const D = require('./db');
const { db, all, get, run, today, now, addDays, setSetting } = D;

db.exec(`
CREATE TABLE IF NOT EXISTS checkins (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), week TEXT NOT NULL,
  done TEXT DEFAULT '', next TEXT DEFAULT '', blockers TEXT DEFAULT '', need_help INTEGER DEFAULT 0,
  created_at TEXT, updated_at TEXT, ack_by INTEGER, ack_at TEXT, ack_note TEXT DEFAULT '',
  UNIQUE(user_id, week));
CREATE INDEX IF NOT EXISTS ix_checkins_week ON checkins(week);
CREATE INDEX IF NOT EXISTS ix_tasks_status_due ON tasks(status, due_date);
`);

/* ---------------- Tham số ---------------- */
const DEFAULTS = {
  due_soon_days: 2,   // cảnh báo trước hạn (ngày)
  lv2_days: 3,        // quá hạn từ ngày này: chuyển trưởng phòng (mức 2)
  lv3_days: 7,        // quá hạn từ ngày này: chuyển giám đốc (mức 3)
  overload_open: 15,  // số việc đang mở tối đa trước khi cảnh báo quá tải
  goal_lag_pct: 20,   // tiến độ mục tiêu chậm hơn tiến độ thời gian từ bấy nhiêu điểm %
  checkin_wd: 5,      // thứ trong tuần (1 = Thứ Hai … 7 = Chủ nhật) phải xong cập nhật tuần hiện tại
  since: ''           // ngày bắt đầu áp dụng cập nhật tuần (không cảnh báo các tuần trước ngày này)
};
const LIMITS = { due_soon_days: [0, 14], lv2_days: [1, 60], lv3_days: [2, 120], overload_open: [1, 200], goal_lag_pct: [5, 100], checkin_wd: [1, 7] };
/* Ngày hợp lệ: đúng định dạng và có thật (loại 2026-13-01, 2026-02-30) */
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !Number.isNaN(Date.parse(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
function params() {
  const r = get("SELECT value FROM settings WHERE key='ops_params'");
  let v = {}; try { v = JSON.parse((r && r.value) || '{}') || {}; } catch (e) { v = {}; }
  const p = Object.assign({}, DEFAULTS, v);
  if (!isDate(p.since)) p.since = '';
  return p;
}
const MAX_TEXT = 3000, MAX_ITEMS = 200, CLOSED = "('done','failed')";

/* ---------------- Tuần ---------------- */
const dow = s => { const d = new Date(s + 'T00:00:00Z').getUTCDay(); return d === 0 ? 7 : d; }; // 1 = Thứ Hai … 7 = Chủ nhật
const weekOf = s => addDays(s, 1 - dow(s));
const dayDiff = (a, b) => Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 864e5);
const isMonday = s => isDate(s) && dow(s) === 1;

function register({ route, bad, forbid, notFound, isAdmin, isDirector, log, str, int }) {
  const isTop = u => isAdmin(u) || isDirector(u);
  const headDepts = u => all('SELECT id FROM departments WHERE head_id=?', u.id).map(r => r.id);
  const isManager = u => isTop(u) || headDepts(u).length > 0;
  /* Phạm vi theo dõi của người xem: null = toàn đơn vị; mảng mã phòng = các phòng mình phụ trách. */
  const teamScope = u => isTop(u) ? null : headDepts(u);
  const canOversee = (viewer, subjectDeptId) => isTop(viewer) || (subjectDeptId != null && headDepts(viewer).includes(subjectDeptId));
  /* Danh sách người thuộc phạm vi (đang hoạt động, không tính tài khoản quản trị hệ thống) */
  const subjectsSql = (scope, alias = 'u') => scope === null ? '' : scope.length ? ` AND ${alias}.dept_id IN (${scope.map(Number).join(',')})` : ' AND 0';

  /* ================= Phân hệ 26: Cập nhật tiến độ tuần ================= */
  const curWeek = () => weekOf(today());
  const editableWeek = w => w === curWeek() || w === addDays(curWeek(), -7);
  const pickWeek = q => { const w = q ? String(q) : curWeek(); if (!isMonday(w)) bad('Tuần không hợp lệ (nhập ngày Thứ Hai đầu tuần).'); return w; };

  function suggest(uid, week) {
    const end = addDays(week, 7);
    const done = all(`SELECT t.id, t.title, p.name project_name FROM tasks t LEFT JOIN projects p ON p.id=t.project_id
      WHERE t.assignee_id=? AND t.status='done' AND COALESCE(t.completed_at, t.done_at) >= ? AND COALESCE(t.completed_at, t.done_at) < ?
      ORDER BY COALESCE(t.completed_at, t.done_at) LIMIT 50`, uid, week, end);
    const open = all(`SELECT t.id, t.title, t.status, t.due_date, t.progress, p.name project_name FROM tasks t LEFT JOIN projects p ON p.id=t.project_id
      WHERE t.assignee_id=? AND t.status NOT IN ${CLOSED} AND (t.due_date IS NULL OR t.due_date < ?)
      ORDER BY t.due_date IS NULL, t.due_date LIMIT 50`, uid, addDays(end, 7));
    const cyc = currentCycle();
    const goals = cyc ? all(`SELECT g.id, g.title, g.unit, g.target, g.current FROM goals g WHERE g.cycle_id=? AND g.owner_id=?
      AND NOT EXISTS (SELECT 1 FROM goals c WHERE c.parent_id=g.id) ORDER BY g.id LIMIT 30`, cyc.id, uid) : [];
    return { done, open, goals };
  }
  const shape = c => c && Object.assign({}, c, { need_help: !!c.need_help, ack_name: c.ack_by ? (get('SELECT full_name n FROM users WHERE id=?', c.ack_by) || {}).n : null });

  route('GET', '/api/ops/checkin', ({ user, query }) => {
    const week = pickWeek(query.week);
    const c = get('SELECT * FROM checkins WHERE user_id=? AND week=?', user.id, week);
    return { week, current_week: curWeek(), editable: editableWeek(week), checkin: shape(c) || null, suggest: suggest(user.id, week) };
  });

  route('PUT', '/api/ops/checkin', ({ user, body }) => {
    const week = pickWeek(body.week);
    if (!editableWeek(week)) bad('Chỉ cập nhật được tuần hiện tại hoặc tuần liền trước.');
    const v = { done: str(body.done, MAX_TEXT), next: str(body.next, MAX_TEXT), blockers: str(body.blockers, MAX_TEXT), need_help: body.need_help ? 1 : 0 };
    if (!v.done && !v.next) bad('Vui lòng nhập ít nhất phần "Đã làm" hoặc "Sẽ làm".');
    if (v.need_help && !v.blockers) bad('Vui lòng mô tả vướng mắc cần hỗ trợ.');
    const old = get('SELECT id FROM checkins WHERE user_id=? AND week=?', user.id, week);
    /* Sửa sau khi quản lý đã ghi nhận thì ghi nhận cũ không còn giá trị, quản lý cần xem lại. */
    if (old) run('UPDATE checkins SET done=?, next=?, blockers=?, need_help=?, updated_at=?, ack_by=NULL, ack_at=NULL, ack_note=\'\' WHERE id=?', v.done, v.next, v.blockers, v.need_help, now(), old.id);
    else run('INSERT INTO checkins(user_id,week,done,next,blockers,need_help,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)', user.id, week, v.done, v.next, v.blockers, v.need_help, now(), now());
    if (!old) log(user.id, `cập nhật tiến độ tuần ${week.split('-').reverse().join('/')}${v.need_help ? ' (cần hỗ trợ)' : ''}`);
    return shape(get('SELECT * FROM checkins WHERE user_id=? AND week=?', user.id, week));
  });

  route('GET', '/api/ops/checkins', ({ user, query }) => {
    if (!isManager(user)) forbid('Chỉ trưởng phòng, giám đốc hoặc quản trị viên xem được cập nhật tiến độ của nhóm.');
    const week = pickWeek(query.week);
    let scope = teamScope(user);
    const dept = int(query.dept_id);
    if (dept) { if (scope !== null && !scope.includes(dept)) forbid('Phòng ban không thuộc phạm vi phụ trách.'); scope = [dept]; }
    const rows = all(`SELECT u.id user_id, u.full_name, u.title, u.dept_id, c.id, c.done, c.next, c.blockers, c.need_help, c.created_at, c.updated_at, c.ack_by, c.ack_at, c.ack_note
      FROM users u LEFT JOIN checkins c ON c.user_id=u.id AND c.week=?
      WHERE u.active=1 AND u.role<>'admin'${subjectsSql(scope)} ORDER BY u.dept_id, u.full_name LIMIT ?`, week, MAX_ITEMS);
    const out = rows.map(r => ({ user_id: r.user_id, full_name: r.full_name, title: r.title, dept_id: r.dept_id,
      checkin: r.id ? shape({ id: r.id, user_id: r.user_id, week, done: r.done, next: r.next, blockers: r.blockers, need_help: r.need_help, created_at: r.created_at, updated_at: r.updated_at, ack_by: r.ack_by, ack_at: r.ack_at, ack_note: r.ack_note }) : null }));
    return { week, current_week: curWeek(), rows: out,
      summary: { total: out.length, submitted: out.filter(r => r.checkin).length, need_help: out.filter(r => r.checkin && r.checkin.need_help && !r.checkin.ack_at).length } };
  });

  route('POST', '/api/ops/checkins/:id/ack', ({ user, params, body }) => {
    const c = get('SELECT c.*, u.dept_id FROM checkins c JOIN users u ON u.id=c.user_id WHERE c.id=?', int(params.id)) || notFound();
    if (c.user_id === user.id) forbid('Không tự ghi nhận cập nhật của chính mình.');
    if (!canOversee(user, c.dept_id)) forbid('Cập nhật này không thuộc phạm vi phụ trách.');
    run('UPDATE checkins SET ack_by=?, ack_at=?, ack_note=? WHERE id=?', user.id, now(), str(body.note, 1000), c.id);
    return shape(get('SELECT * FROM checkins WHERE id=?', c.id));
  });

  /* ================= Phân hệ 30: Giám sát, cảnh báo, leo thang ================= */
  function currentCycle() {
    const T = today();
    return get('SELECT * FROM goal_cycles WHERE start_date<=? AND end_date>=? ORDER BY start_date DESC, id DESC LIMIT 1', T, T) || null;
  }
  const levelByDays = (d, P) => d >= P.lv3_days ? 3 : d >= P.lv2_days ? 2 : 1;

  /**
   * Tính cảnh báo cho một tập người (scope: null = toàn đơn vị, [] = không ai, [mã phòng…]) hoặc một người (uid).
   * mode 'mine': cảnh báo của chính người xem (kể cả việc sắp đến hạn và việc chưa có người nhận trong dự án mình quản lý).
   * mode 'team': cảnh báo của nhân sự trong phạm vi (không gồm việc sắp đến hạn; gồm đề nghị hỗ trợ chưa được ghi nhận).
   */
  function compute({ mode, uid, scope, P }) {
    const T = today(), items = [];
    const who = mode === 'mine' ? ` AND u.id=${Number(uid)}` : subjectsSql(scope);
    const push = it => { if (items.length < 1000) items.push(it); };

    /* 1–2. Quá hạn, sắp đến hạn (việc trong dự án đã đóng không tính) */
    const horizon = mode === 'mine' ? addDays(T, P.due_soon_days) : addDays(T, -1);
    for (const t of all(`SELECT t.id, t.title, t.due_date, t.assignee_id, t.project_id, p.name project_name, u.dept_id
      FROM tasks t JOIN users u ON u.id=t.assignee_id LEFT JOIN projects p ON p.id=t.project_id
      WHERE t.status NOT IN ${CLOSED} AND t.due_date IS NOT NULL AND t.due_date <= ? AND u.active=1
        AND (p.id IS NULL OR COALESCE(p.status,'open')<>'closed')${who}
      ORDER BY t.due_date LIMIT 1000`, horizon)) {
      const late = dayDiff(T, t.due_date);
      if (late >= 1) push({ type: 'overdue', level: levelByDays(late, P), user_id: t.assignee_id, dept_id: t.dept_id, days: late, title: t.title,
        detail: `Quá hạn ${late} ngày (hạn ${t.due_date.split('-').reverse().join('/')})${t.project_name ? ' · ' + t.project_name : ''}`, ref: { kind: 'task', id: t.id } });
      else push({ type: 'due_soon', level: 1, user_id: t.assignee_id, dept_id: t.dept_id, days: late, title: t.title,
        detail: (late === 0 ? 'Đến hạn hôm nay' : `Còn ${-late} ngày`) + (t.project_name ? ' · ' + t.project_name : ''), ref: { kind: 'task', id: t.id } });
    }

    /* 3. Việc có thời hạn nhưng chưa có người nhận — báo người quản lý dự án */
    if (mode === 'mine') {
      for (const t of all(`SELECT t.id, t.title, t.due_date, p.name project_name FROM tasks t JOIN projects p ON p.id=t.project_id
        WHERE t.assignee_id IS NULL AND t.status NOT IN ${CLOSED} AND t.due_date IS NOT NULL AND t.due_date <= ? AND COALESCE(p.status,'open')<>'closed'
          AND (p.owner_id=? OR EXISTS (SELECT 1 FROM project_members m WHERE m.project_id=p.id AND m.user_id=? AND m.role='manager'))
        ORDER BY t.due_date LIMIT 200`, addDays(T, P.due_soon_days), uid, uid)) {
        const late = dayDiff(T, t.due_date);
        push({ type: 'unassigned', level: late >= 1 ? 2 : 1, user_id: uid, dept_id: null, days: late, title: t.title,
          detail: `Chưa có người nhận · hạn ${t.due_date.split('-').reverse().join('/')} · ${t.project_name}`, ref: { kind: 'task', id: t.id } });
      }
    }

    /* 4. Quá tải: số việc đang mở vượt ngưỡng */
    for (const r of all(`SELECT t.assignee_id uid, u.full_name, u.dept_id, COUNT(*) n FROM tasks t JOIN users u ON u.id=t.assignee_id
      WHERE t.status NOT IN ${CLOSED} AND u.active=1${who} GROUP BY t.assignee_id HAVING n > ? ORDER BY n DESC LIMIT 200`, P.overload_open)) {
      push({ type: 'overload', level: r.n >= P.overload_open * 2 ? 2 : 1, user_id: r.uid, dept_id: r.dept_id, days: 0, title: r.full_name,
        detail: `${r.n} việc đang mở (ngưỡng ${P.overload_open})`, ref: { kind: 'user', id: r.uid } });
    }

    /* 5. Mục tiêu chậm tiến độ so với thời gian đã trôi qua của chu kỳ (chỉ mục tiêu không có mục tiêu con) */
    const cyc = currentCycle();
    if (cyc) {
      const span = Math.max(1, dayDiff(cyc.end_date, cyc.start_date) + 1), passed = Math.min(span, Math.max(0, dayDiff(T, cyc.start_date) + 1));
      const expected = passed / span * 100;
      for (const g of all(`SELECT g.id, g.title, g.target, g.current, g.unit, g.owner_id, u.dept_id FROM goals g JOIN users u ON u.id=g.owner_id
        WHERE g.cycle_id=? AND g.target > 0 AND u.active=1 AND NOT EXISTS (SELECT 1 FROM goals c WHERE c.parent_id=g.id)${who} LIMIT 500`, cyc.id)) {
        const prog = Math.max(0, Math.min(100, g.current / g.target * 100)), lag = expected - prog;
        if (lag >= P.goal_lag_pct) push({ type: 'goal_lag', level: lag >= P.goal_lag_pct * 2 ? 2 : 1, user_id: g.owner_id, dept_id: g.dept_id, days: 0, title: g.title,
          detail: `Đạt ${Math.round(prog)}%, theo thời gian cần khoảng ${Math.round(expected)}% · ${cyc.name}`, ref: { kind: 'goal', id: g.id } });
      }
    }

    /* 6. Chưa cập nhật tiến độ tuần: tuần trước (mức 2); tuần này từ ngày quy định (mức 1) */
    const cw = curWeek(), lw = addDays(cw, -7), since = P.since ? weekOf(P.since) : cw;
    const weeks = [];
    if (lw >= since) weeks.push([lw, 2]);
    if (cw >= since && dow(T) >= P.checkin_wd) weeks.push([cw, 1]);
    for (const [w, lv] of weeks) {
      for (const u of all(`SELECT u.id, u.full_name, u.dept_id FROM users u WHERE u.active=1 AND u.role<>'admin'
        AND (u.join_date IS NULL OR u.join_date < ?)${who} AND NOT EXISTS (SELECT 1 FROM checkins c WHERE c.user_id=u.id AND c.week=?) LIMIT 500`, addDays(w, 7), w)) {
        push({ type: 'checkin_missing', level: lv, user_id: u.id, dept_id: u.dept_id, days: dayDiff(T, w), title: u.full_name,
          detail: `Chưa cập nhật tiến độ tuần ${w.split('-').reverse().join('/')}`, ref: { kind: 'checkin', id: w } });
      }
    }

    /* 7. Đề nghị hỗ trợ chưa được quản lý ghi nhận (2 tuần gần nhất) */
    if (mode === 'team') {
      for (const c of all(`SELECT c.id, c.week, c.blockers, c.user_id, u.full_name, u.dept_id FROM checkins c JOIN users u ON u.id=c.user_id
        WHERE c.need_help=1 AND c.ack_at IS NULL AND c.week >= ? AND u.active=1${who} LIMIT 200`, lw)) {
        push({ type: 'need_help', level: 2, user_id: c.user_id, dept_id: c.dept_id, days: dayDiff(T, c.week), title: c.full_name,
          detail: 'Cần hỗ trợ: ' + String(c.blockers || '').slice(0, 160), ref: { kind: 'checkin', id: c.week, checkin_id: c.id } });
      }
    }

    items.forEach(it => { it.key = `${it.type}:${it.ref.kind}:${it.ref.id}:${it.user_id}`; });
    items.sort((a, b) => b.level - a.level || b.days - a.days || a.key.localeCompare(b.key));
    return items;
  }

  const countLv = items => ({ 1: items.filter(i => i.level === 1).length, 2: items.filter(i => i.level === 2).length, 3: items.filter(i => i.level === 3).length });

  route('GET', '/api/ops/alerts', ({ user, query }) => {
    const P = params(), mode = query.scope === 'team' ? 'team' : 'mine';
    let scope = null;
    if (mode === 'team') {
      if (!isManager(user)) forbid('Chỉ trưởng phòng, giám đốc hoặc quản trị viên xem được cảnh báo của nhóm.');
      scope = teamScope(user);
      const dept = int(query.dept_id);
      if (dept) { if (scope !== null && !scope.includes(dept)) forbid('Phòng ban không thuộc phạm vi phụ trách.'); scope = [dept]; }
    }
    const minLv = Math.min(3, Math.max(1, int(query.min_level) || 1));
    let items = compute({ mode, uid: user.id, scope, P });
    if (mode === 'team') items = items.filter(i => i.user_id !== user.id || i.type === 'need_help');
    const counts = countLv(items);
    return { scope: mode, params: P, counts, total: items.length, items: items.filter(i => i.level >= minLv).slice(0, MAX_ITEMS) };
  });

  route('GET', '/api/ops/settings', ({ user }) => ({ params: params(), can_edit: isAdmin(user), is_manager: isManager(user), head_depts: headDepts(user), is_top: isTop(user) }));
  route('PUT', '/api/ops/settings', ({ user, body }) => {
    const P = params(), next = Object.assign({}, P);
    for (const [k, [lo, hi]] of Object.entries(LIMITS)) if (body[k] !== undefined) {
      const n = Number(body[k]);
      if (!Number.isInteger(n) || n < lo || n > hi) bad(`Tham số "${k}" phải là số nguyên từ ${lo} đến ${hi}.`);
      next[k] = n;
    }
    if (next.lv3_days <= next.lv2_days) bad('Số ngày chuyển giám đốc phải lớn hơn số ngày chuyển trưởng phòng.');
    if (body.since !== undefined) { if (body.since && !isDate(body.since)) bad('Ngày áp dụng không hợp lệ.'); next.since = body.since || ''; }
    setSetting('ops_params', JSON.stringify(next));
    log(user.id, 'cập nhật tham số giám sát, cảnh báo');
    return { params: params() };
  }, { admin: true });

  /* Huy hiệu trên menu: cảnh báo của chính mình (trừ việc sắp đến hạn) + cảnh báo đã leo thang đến mình
   * (trưởng phòng: mức 2 trở lên của nhân sự trong phòng; giám đốc, quản trị viên: mức 3). */
  function badge(user) {
    try {
      const P = params();
      let n = compute({ mode: 'mine', uid: user.id, scope: null, P }).filter(i => i.type !== 'due_soon').length;
      if (isManager(user)) {
        const min = isTop(user) ? 3 : 2;
        n += compute({ mode: 'team', uid: user.id, scope: teamScope(user), P }).filter(i => i.user_id !== user.id && i.level >= min).length;
      }
      return n;
    } catch (e) { return 0; }
  }

  return { badge, params, compute, weekOf };
}

/* Lần đầu chạy: ghi ngày bắt đầu áp dụng để không cảnh báo các tuần trước khi có chức năng. */
function migrate() {
  const r = get("SELECT value FROM settings WHERE key='ops_params'");
  if (!r) setSetting('ops_params', JSON.stringify(Object.assign({}, DEFAULTS, { since: today() })));
}

module.exports = { register, migrate, DEFAULTS, weekOf };
