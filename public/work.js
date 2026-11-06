/* SmartOffice — Giao diện phân hệ Công việc – Dự án (phiên bản 2).
 * Căn cứ: docs/02-thiet-ke/YEU-CAU-CONG-VIEC-DU-AN.md; chỉ dùng thành phần dùng chung (TIÊU CHUẨN UI/UX).
 * Địa chỉ: #cong-viec (Việc của tôi) · #cong-viec?tab=projects · #cong-viec?tab=staff · #cong-viec?p=<id>&v=list|kanban|gantt|report|settings
 */
(function () {
'use strict';
const SO = window.SO; if (!SO) return;
const { $, $$, esc, fmtD, fmtDT, GET, POST, PUT, DEL, U, av, who, userOpts, openModal, closeModal, toast, showErr, mh, busy, armed, VIEWS, render, refreshBoot, TODAY, addDays, dayNum, pad, PRIO, debounce } = SO;
const B = () => SO.B;

const ST = { todo: 'Cần làm', doing: 'Đang làm', review: 'Chờ đánh giá', done: 'Hoàn thành', failed: 'Thất bại' };
const KIND = { project: 'Dự án', team: 'Phòng ban' };
const ROLE = { owner: 'Quản trị hệ thống', manager: 'Quản lý', member: 'Thành viên', follower: 'Người theo dõi' };
const CLOSE_RES = { success: 'Thành công', failed: 'Thất bại', cancelled: 'Hủy' };
const HEALTH = { on_track: 'Đúng tiến độ', late: 'Chậm tiến độ', risk: 'Rủi ro cao' };
const LOG = { file: 'đính kèm', file_del: 'gỡ tệp', create: 'tạo công việc', update: 'cập nhật', start: 'bắt đầu thực hiện', todo: 'chuyển về Cần làm', reopen: 'mở lại', done: 'hoàn thành', submit_review: 'gửi đánh giá hoàn thành', approve: 'duyệt hoàn thành', return: 'trả lại', failed: 'đánh dấu thất bại', result: 'cập nhật kết quả', followers: 'thêm người theo dõi', clone: 'nhân bản' };
const COLORS = ['#0e6f68', '#3a5bb0', '#a8501f', '#7a4fb0', '#2b8547', '#b03a6c', '#5b6774', '#a86a10'];
const isDone = t => t.status === 'done' || t.status === 'failed';
const late = t => !isDone(t) && t.due_date && (t.due_date < TODAY() || (t.due_date === TODAY() && t.due_time && t.due_time < new Date().toTimeString().slice(0, 5)));
const dueTxt = t => t.due_date ? fmtD(t.due_date) + (t.due_time ? ' ' + t.due_time : '') : '—';
const qp = () => new URLSearchParams(location.hash.split('?')[1] || '');
const go = params => { const s = new URLSearchParams(params).toString(); const h = '#cong-viec' + (s ? '?' + s : ''); if (location.hash === h) render(); else location.hash = h; };
const pill = s => `<span class="pill s-${s}">${ST[s]}</span>`;
const flags = t => (t.urgent ? '<span class="tag w-urgent">Khẩn cấp</span>' : '') + (t.important ? '<span class="tag w-imp">Quan trọng</span>' : '');
const multiVals = sel => Array.from(sel.selectedOptions).map(o => Number(o.value));
const isHead = () => B().departments.some(d => d.head_id === B().me.id);
let clToggle = null;
/* ---- Nhãn, mục tiêu, tệp đính kèm (bổ sung theo bài "Cách tạo công việc mới" của Base Wework) ---- */
const FILE_MAX = 10 * 1024 * 1024;
const tagChips = tags => (tags || []).map(x => `<span class="tag w-tagc">#${esc(x)}</span>`).join('');
const fmtSize = n => n >= 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round((n || 0) / 1024)) + ' KB';
let GOALS = null, DOCS = null, DOCS_AT = 0;
async function loadGoals() {
  if (GOALS) return GOALS;
  try { const r = await GET('/api/goals'); const out = []; const walk = (g, d) => { out.push({ id: g.id, title: g.title, depth: d }); (g.children || []).forEach(c => walk(c, d + 1)); }; (r.goals || []).forEach(g => walk(g, 0)); GOALS = { cycle: r.cycle, list: out }; }
  catch (e) { GOALS = { cycle: null, list: [] }; }
  return GOALS;
}
async function loadDocs() {
  if (DOCS && Date.now() - DOCS_AT < 60000) return DOCS;
  try { DOCS = (await GET('/api/docs')).docs || []; DOCS_AT = Date.now(); } catch (e) { DOCS = []; }
  return DOCS;
}
const goalOpts = (G, sel) => `<option value="">Không liên kết</option>${G.list.map(g => `<option value="${g.id}" ${g.id === sel ? 'selected' : ''}>${'— '.repeat(g.depth)}${esc(g.title)}</option>`).join('')}`;
const docOpts = docs => docs.map(d => `<option value="${d.id}">${esc(d.title)}${d.number ? ' (' + esc(d.number) + ')' : ''}${d.kind === 'article' ? ' – bài viết' : ''}</option>`).join('');
const readB64 = f => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1] || ''); r.onerror = () => no(new Error('Không đọc được tệp ' + f.name)); r.readAsDataURL(f); });
/* Tải tệp và liên kết tài liệu cho một hoặc nhiều công việc (giao nhiều người dùng chung một tệp). Trả về danh sách lỗi. */
async function attachAll(ids, files, docIds) {
  const errs = [];
  for (const f of files) {
    if (f.size > FILE_MAX) { errs.push(`${f.name}: vượt quá 10 MB`); continue; }
    try { await POST(`/api/tasks/${ids[0]}/files`, { also_task_ids: ids.slice(1), file_name: f.name, file_mime: f.type, file_data: await readB64(f) }); } catch (e) { errs.push(`${f.name}: ${e.message}`); }
  }
  for (const d of docIds) { try { await POST(`/api/tasks/${ids[0]}/files`, { also_task_ids: ids.slice(1), doc_id: d }); } catch (e) { errs.push(`Tài liệu #${d}: ${e.message}`); } }
  return errs;
}
let listTag = '';
let homeQ = '', homeScope = 'assigned', homeStatus = 'open', projStatus = 'open', projQ = '', listStatus = '', listAssignee = '', listQ = '';

/* ================= Hàng công việc dùng chung ================= */
function taskRow(t, opt = {}) {
  const prog = t.progress ? `<div class="prog w-mini ${t.status === 'done' ? 'ok' : ''}" title="${t.progress}%"><i style="width:${t.progress}%"></i></div>` : '';
  const meta = [opt.project && t.project_name ? `<span class="tag" style="border-color:${esc(t.project_color)};color:${esc(t.project_color)}">${esc(t.project_name)}</span>` : '',
    t.sub_total ? `<span>${t.sub_done}/${t.sub_total} việc con</span>` : '', t.cl_total ? `<span>${t.cl_done}/${t.cl_total} đầu việc</span>` : '', t.cm_count ? `<span>${t.cm_count} trao đổi</span>` : '', t.file_count ? `<span>${t.file_count} tệp</span>` : '', (t.tags || []).length ? tagChips(t.tags) : ''].filter(Boolean).join(' · ');
  return `<tr class="click w-row ${isDone(t) ? 'w-closed' : ''}" data-task="${t.id}"><td><div class="w-title" style="padding-left:${(opt.depth || 0) * 22}px">${opt.depth ? '<span class="w-branch" aria-hidden="true">└</span>' : ''}<span class="t-title">${esc(t.title)}</span>${flags(t)}</div>${meta ? `<div class="t-sub" style="padding-left:${(opt.depth || 0) * 22}px">${meta}</div>` : ''}</td>
    <td>${who(t.assignee_id)}</td><td class="num ${late(t) ? 'late' : ''}">${dueTxt(t)}${late(t) ? `<div class="t-sub late">Quá ${dayNum(TODAY()) - dayNum(t.due_date) || 'hạn'}${dayNum(TODAY()) - dayNum(t.due_date) ? ' ngày' : ''}</div>` : ''}</td>
    <td>${pill(t.status)}${prog}</td></tr>`;
}
const tableHead = '<thead><tr><th>Công việc</th><th>Người thực hiện</th><th>Thời hạn</th><th>Trạng thái</th></tr></thead>';

/* ================= Trang chính ================= */
VIEWS['cong-viec'] = async main => {
  const q = qp();
  if (q.get('p')) return projectView(main, Number(q.get('p')), q.get('v') || 'list');
  const tab = q.get('tab') || 'mine';
  const tabs = [['mine', 'Việc của tôi'], ['projects', 'Dự án & phòng ban']].concat(isHead() ? [['staff', 'Nhân viên của tôi']] : []);
  const head = `<div class="page-head"><div><h1>Công việc – Dự án</h1><p>Giao việc, theo dõi tiến độ theo dự án và phòng ban</p></div>
    <div class="actions"><button class="btn" data-act="w-new-project">+ Dự án / phòng ban</button><button class="btn primary" data-act="w-new-task">+ Công việc</button></div></div>
    <div class="toolbar"><div class="seg" role="tablist">${tabs.map(([k, l]) => `<button data-wtab="${k}" aria-pressed="${k === tab}">${l}</button>`).join('')}</div></div>`;
  if (tab === 'projects') return projectsHome(main, head);
  if (tab === 'staff') return staffHome(main, head);
  return mineHome(main, head);
};
async function mineHome(main, head) {
  const SC = [['assigned', 'Được giao cho tôi'], ['created', 'Tôi giao'], ['following', 'Tôi theo dõi'], ['review', 'Chờ tôi đánh giá']];
  const qs = new URLSearchParams({ scope: homeScope, status: homeScope === 'review' ? '' : homeStatus, q: homeQ });
  const d = await GET('/api/tasks?' + qs);
  main.innerHTML = `${head}
  <div class="toolbar"><div class="chips">${SC.map(([k, l]) => `<button class="chip" data-wscope="${k}" aria-pressed="${k === homeScope}">${l}</button>`).join('')}</div><span class="spacer"></span>
    ${homeScope === 'review' ? '' : `<select class="sel" id="w-hst" aria-label="Lọc trạng thái"><option value="open">Chưa kết thúc</option><option value="late">Quá hạn</option><option value="">Tất cả</option>${Object.entries(ST).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select>`}
    <input class="search" id="w-hq" type="search" placeholder="Tìm công việc…" value="${esc(homeQ)}" aria-label="Tìm công việc"></div>
  <section class="card">${d.rows.length ? `<div class="tbl-wrap"><table class="tbl w-tbl">${tableHead}<tbody>${d.rows.map(t => taskRow(t, { project: true })).join('')}</tbody></table></div>
    ${d.total > d.rows.length ? `<p class="hint" style="padding:10px 14px">Hiển thị ${d.rows.length}/${d.total} công việc. Thu hẹp bộ lọc để xem đầy đủ.</p>` : ''}`
    : `<div class="empty">${homeScope === 'review' ? 'Không có công việc nào chờ bạn đánh giá.' : 'Không có công việc phù hợp. Tạo công việc mới bằng nút “+ Công việc”.'}</div>`}</section>`;
  const st = $('#w-hst'); if (st) { st.value = homeStatus; st.addEventListener('change', e => { homeStatus = e.target.value; render(); }); }
  $('#w-hq').addEventListener('input', debounce(e => { homeQ = e.target.value; render(); setTimeout(() => { const i = $('#w-hq'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 50); }, 350));
}
async function projectsHome(main, head) {
  const list = await GET('/api/projects?' + new URLSearchParams({ status: projStatus, q: projQ }));
  const card = p => {
    const pct = p.total ? Math.round(p.done / p.total * 100) : 0;
    return `<a class="card w-pcard" href="#cong-viec?p=${p.id}"><div class="w-pc-h"><i style="background:${esc(p.color)}"></i><b>${esc(p.name)}</b></div>
      <div class="t-sub">${KIND[p.kind]} · ${ROLE[p.my_role] || ''} · ${p.member_count} thành viên${p.kind === 'project' && p.end_date ? ' · đến ' + fmtD(p.end_date) : ''}</div>
      <div class="prog ${pct >= 70 ? 'ok' : ''}"><i style="width:${pct}%"></i></div>
      <div class="t-sub">${p.done}/${p.total} việc hoàn thành${p.late ? ` · <span class="late">${p.late} quá hạn</span>` : ''}${p.status === 'closed' ? ` · Đã đóng (${CLOSE_RES[p.close_result] || ''})` : p.health && p.health !== 'on_track' ? ` · <span class="late">${HEALTH[p.health]}</span>` : ''}</div></a>`;
  };
  const grp = k => list.filter(p => p.kind === k);
  main.innerHTML = `${head}
  <div class="toolbar"><div class="chips">${[['open', 'Đang hoạt động'], ['closed', 'Đã đóng'], ['all', 'Tất cả']].map(([k, l]) => `<button class="chip" data-wpst="${k}" aria-pressed="${k === projStatus}">${l}</button>`).join('')}</div><span class="spacer"></span>
    <input class="search" id="w-pq" type="search" placeholder="Tìm dự án, phòng ban…" value="${esc(projQ)}" aria-label="Tìm dự án"></div>
  ${list.length ? ['project', 'team'].filter(k => grp(k).length).map(k => `<h2 class="sec-t">${k === 'project' ? 'Dự án' : 'Phòng ban'} (${grp(k).length})</h2><div class="w-pgrid">${grp(k).map(card).join('')}</div>`).join('')
    : '<section class="card"><div class="empty">Chưa có dự án, phòng ban nào. Tạo mới bằng nút “+ Dự án / phòng ban”.</div></section>'}`;
  $('#w-pq').addEventListener('input', debounce(e => { projQ = e.target.value; render(); setTimeout(() => { const i = $('#w-pq'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 50); }, 350));
}
async function staffHome(main, head) {
  const rows = await GET('/api/work/staff');
  main.innerHTML = `${head}<section class="card"><div class="card-h"><h2>Tiến độ công việc nhân viên trực tiếp quản lý</h2></div>
  ${rows.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Nhân viên</th><th class="r">Cần làm</th><th class="r">Đang làm</th><th class="r">Chờ đánh giá</th><th class="r">Hoàn thành</th><th class="r">Thất bại</th><th class="r">Quá hạn</th></tr></thead>
    <tbody>${rows.map(r => `<tr class="click" data-wstaff="${r.user_id}"><td>${who(r.user_id)}</td><td class="r num">${r.todo || 0}</td><td class="r num">${r.doing || 0}</td><td class="r num">${r.review || 0}</td><td class="r num">${r.done || 0}</td><td class="r num">${r.failed || 0}</td><td class="r num ${r.late ? 'late' : ''}">${r.late || 0}</td></tr>`).join('')}</tbody></table></div>`
    : '<div class="empty">Phòng của bạn chưa có nhân viên.</div>'}</section><div id="w-staff-list"></div>`;
}

/* ================= Chi tiết dự án ================= */
let PJ = null, PT = { rows: [], total: 0 };
async function projectView(main, id, v) {
  PJ = await GET('/api/projects/' + id);
  const tabs = [['list', 'Danh sách'], ['kanban', 'Kanban']].concat(PJ.kind === 'project' ? [['gantt', 'Gantt']] : []).concat([['report', 'Báo cáo']]).concat(PJ.can_manage ? [['settings', 'Thiết lập']] : []);
  if (!tabs.some(t => t[0] === v)) v = 'list';
  const s = PJ.stats, pct = s.total ? Math.round((s.done || 0) / s.total * 100) : 0;
  const closed = PJ.status === 'closed';
  main.innerHTML = `
  <div class="page-head"><div><p class="t-sub"><a href="#cong-viec?tab=projects">Dự án & phòng ban</a> › ${KIND[PJ.kind]}</p>
    <h1 class="w-ph"><i style="background:${esc(PJ.color)}"></i>${esc(PJ.name)}</h1>
    <p>${ROLE[PJ.my_role]} · ${PJ.members.filter(m => m.role !== 'follower').length} thành viên${PJ.kind === 'project' && PJ.start_date ? ` · ${fmtD(PJ.start_date)} – ${fmtD(PJ.end_date)}` : ''} · ${s.done || 0}/${s.total || 0} việc hoàn thành (${pct}%)${s.late ? ` · <span class="late">${s.late} quá hạn</span>` : ''}
      ${closed ? ` · <span class="pill s-todo">Đã đóng: ${CLOSE_RES[PJ.close_result] || ''}</span>` : PJ.health !== 'on_track' ? ` · <span class="pill s-review">${HEALTH[PJ.health]}</span>` : ''}</p></div>
    <div class="actions"><a class="btn" href="/api/projects/${PJ.id}/export.csv">Xuất Excel (CSV)</a>${PJ.can_create ? '<button class="btn primary" data-act="w-new-task">+ Công việc</button>' : ''}</div></div>
  ${closed ? '<p class="notice">Dự án/phòng ban đã đóng: không thể thêm hoặc sửa công việc. Quản lý có thể mở lại tại tab Thiết lập.</p>' : ''}
  <div class="toolbar"><div class="seg">${tabs.map(([k, l]) => `<button data-wv="${k}" aria-pressed="${k === v}">${l}</button>`).join('')}</div><span class="spacer"></span>
    ${['list', 'kanban', 'gantt'].includes(v) ? `<select class="sel" id="w-ls" aria-label="Lọc trạng thái"><option value="">Mọi trạng thái</option><option value="open">Chưa kết thúc</option><option value="late">Quá hạn</option>${Object.entries(ST).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select>
    <select class="sel" id="w-la" aria-label="Lọc người thực hiện"><option value="">Mọi người thực hiện</option>${PJ.members.map(m => `<option value="${m.user_id}">${esc(U(m.user_id).full_name)}</option>`).join('')}</select>
    ${(PJ.tags || []).length ? `<select class="sel" id="w-lt" aria-label="Lọc theo nhãn"><option value="">Mọi nhãn</option>${PJ.tags.map(x => `<option value="${esc(x)}">#${esc(x)}</option>`).join('')}</select>` : ''}
    <input class="search" id="w-lq" type="search" placeholder="Tìm công việc…" value="${esc(listQ)}" aria-label="Tìm công việc">` : ''}</div>
  <div id="w-body"><div class="loading">Đang tải…</div></div>`;
  const ls = $('#w-ls'); if (ls) { ls.value = listStatus; ls.onchange = e => { listStatus = e.target.value; render(); }; }
  const la = $('#w-la'); if (la) { la.value = listAssignee; la.onchange = e => { listAssignee = e.target.value; render(); }; }
  if (listTag && !(PJ.tags || []).includes(listTag)) listTag = '';
  const lt = $('#w-lt'); if (lt) { lt.value = listTag; lt.onchange = e => { listTag = e.target.value; render(); }; }
  const lq = $('#w-lq'); if (lq) lq.addEventListener('input', debounce(e => { listQ = e.target.value; render(); setTimeout(() => { const i = $('#w-lq'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 50); }, 350));
  const body = $('#w-body');
  if (v === 'report') return reportTab(body);
  if (v === 'settings') return settingsTab(body);
  PT = await GET(`/api/projects/${PJ.id}/tasks?` + new URLSearchParams({ status: listStatus, assignee: listAssignee, q: listQ, tag: listTag, limit: 200 }));
  const more = PT.total > PT.rows.length ? `<p class="hint">Hiển thị ${PT.rows.length}/${PT.total} công việc (tối đa 200 mỗi lần). <button class="btn sm" data-act="w-more">Tải thêm</button></p>` : '';
  if (v === 'kanban') body.innerHTML = kanban(PT.rows) + more, wireKanban();
  else if (v === 'gantt') body.innerHTML = ganttView(PT.rows) + more;
  else body.innerHTML = listView(PT.rows) + more;
}
function tree(rows) {
  const by = new Map(rows.map(t => [t.id, { ...t, kids: [] }])), roots = [];
  for (const t of by.values()) { if (t.parent_id && by.has(t.parent_id)) by.get(t.parent_id).kids.push(t); else roots.push(t); }
  const flat = []; const walk = (t, d) => { flat.push([t, d]); t.kids.forEach(k => walk(k, d + 1)); }; roots.forEach(t => walk(t, 0)); return { roots, flat };
}
function listView(rows) {
  const groups = PJ.groups.filter(g => !g.closed).concat([{ id: null, name: 'Chưa phân loại' }]);
  const { roots } = tree(rows);
  const section = g => {
    const mine = roots.filter(t => (t.group_id || null) === g.id);
    if (!mine.length && g.id === null && !PJ.can_create) return '';
    const flat = []; const walk = (t, d) => { flat.push([t, d]); t.kids.forEach(k => walk(k, d + 1)); }; mine.forEach(t => walk(t, 0));
    return `<section class="card w-group"><div class="card-h"><h2>${esc(g.name)} <span class="muted num">${mine.length}</span></h2>${g.std_hours ? `<span class="t-sub">Định mức ${g.std_hours} giờ/việc</span>` : ''}</div>
      ${flat.length ? `<div class="tbl-wrap"><table class="tbl w-tbl">${tableHead}<tbody>${flat.map(([t, d]) => taskRow(t, { depth: d })).join('')}</tbody></table></div>` : '<div class="empty">Chưa có công việc trong nhóm.</div>'}
      ${PJ.can_create ? `<div class="inline-add w-qadd"><input data-wqadd="${g.id || ''}" placeholder="+ Thêm nhanh công việc vào “${esc(g.name)}” (Enter để lưu, giao cho tôi)" aria-label="Thêm nhanh công việc"><button class="btn sm" data-act="w-qadd" data-g="${g.id || ''}">Thêm</button></div>` : ''}</section>`;
  };
  return groups.map(section).join('') || '<section class="card"><div class="empty">Chưa có công việc.</div></section>';
}
function kanban(rows) {
  const cols = Object.keys(ST).filter(s => s !== 'failed' || PJ.settings.allow_failed).filter(s => s !== 'review' || PJ.settings.review);
  return `<div class="board w-board" style="grid-template-columns:repeat(${cols.length},minmax(220px,1fr))">${cols.map(s => { const col = rows.filter(t => t.status === s); return `<div class="col" data-wcol="${s}"><div class="col-h">${pill(s)}<span class="muted num">${col.length}</span></div>
    ${col.map(t => `<div class="kcard" draggable="${['todo', 'doing', 'done'].includes(s) ? 'true' : 'false'}" data-task="${t.id}"><div class="t-title">${esc(t.title)}</div>${flags(t)}
      ${(t.tags || []).length ? `<div>${tagChips(t.tags)}</div>` : ''}${t.progress ? `<div class="prog"><i style="width:${t.progress}%"></i></div>` : ''}<div class="row">${who(t.assignee_id)}<span class="num ${late(t) ? 'late' : 'muted'}">${t.due_date ? fmtD(t.due_date).slice(0, 5) : ''}</span></div></div>`).join('')}</div>`; }).join('')}</div>
    <p class="hint">Kéo thẻ giữa các cột Cần làm, Đang làm, Hoàn thành để đổi trạng thái. Đánh giá, thất bại thao tác trong chi tiết công việc.</p>`;
}
function wireKanban() {
  let drag = null;
  $$('.w-board .kcard[draggable="true"]').forEach(c => { c.addEventListener('dragstart', () => { drag = c.dataset.task; c.classList.add('dragging'); }); c.addEventListener('dragend', () => c.classList.remove('dragging')); });
  $$('.w-board .col').forEach(col => {
    col.addEventListener('dragover', e => { if (['todo', 'doing', 'done'].includes(col.dataset.wcol)) { e.preventDefault(); col.classList.add('over'); } });
    col.addEventListener('dragleave', () => col.classList.remove('over'));
    col.addEventListener('drop', async e => { e.preventDefault(); col.classList.remove('over'); const t = PT.rows.find(x => String(x.id) === String(drag)); if (!t || t.status === col.dataset.wcol) return;
      try { const r = await POST(`/api/tasks/${t.id}/status`, { status: col.dataset.wcol }); toast(r.status === 'review' ? 'Đã gửi đánh giá hoàn thành' : 'Đã chuyển sang “' + ST[r.status] + '”'); render(); refreshBoot(); } catch (err) { toast(err.message, true); } });
  });
}
function ganttView(rows) {
  const ts = rows.filter(t => t.start_date);
  if (!ts.length) return '<section class="card"><div class="empty">Chưa có công việc có ngày bắt đầu để hiển thị Gantt.</div></section>';
  const T = TODAY(), end = t => t.due_date || t.start_date;
  const lo = Math.min(...ts.map(t => dayNum(t.start_date)), dayNum(T)) - 1, hi = Math.max(...ts.map(t => dayNum(end(t))), dayNum(T)) + 2;
  const W = 32, days = Math.min(hi - lo + 1, 240), LW = 280;
  let head = '<div class="g-head-l">Công việc</div>';
  for (let i = 0; i < days; i++) { const dd = new Date((lo + i) * 864e5), s = dd.toISOString().slice(0, 10), w = dd.getUTCDay();
    head += `<div class="g-day ${w === 0 || w === 6 ? 'we' : ''} ${s === T ? 'today' : ''}"><span>${['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][w]}</span><b class="num">${pad(dd.getUTCDate())}/${pad(dd.getUTCMonth() + 1)}</b></div>`; }
  const { flat } = tree(ts);
  const bars = flat.map(([t, d]) => {
    const l = Math.max(0, dayNum(t.start_date) - lo) * W, w = Math.max(1, Math.min(dayNum(end(t)), lo + days - 1) - Math.max(dayNum(t.start_date), lo) + 1) * W - 4;
    const col = t.status === 'done' ? 'var(--ok)' : t.status === 'failed' ? 'var(--faint)' : late(t) ? 'var(--bad)' : esc(PJ.color);
    return `<div class="g-label" data-task="${t.id}" style="padding-left:${12 + d * 16}px">${av(t.assignee_id)}<span>${esc(t.title)}</span></div><div class="g-cell" style="grid-column:2/span ${days}"><div class="g-bar" data-task="${t.id}" style="left:${l + 2}px;width:${w}px;background:${col}" title="${esc(t.title)}: ${fmtD(t.start_date)} → ${dueTxt(t)} · ${t.progress || 0}%">${t.progress ? t.progress + '%' : ST[t.status]}</div></div>`;
  }).join('');
  return `<section class="card gantt"><div class="g-grid" style="grid-template-columns:${LW}px repeat(${days},${W}px)">${head}${bars}<div class="g-today" style="left:${LW + (dayNum(T) - lo) * W + W / 2}px;top:38px"></div></div></section>
  <div class="legend"><span><i style="background:var(--ok)"></i>Hoàn thành</span><span><i style="background:var(--bad)"></i>Quá hạn</span><span><i style="background:var(--faint)"></i>Thất bại</span><span><i style="background:var(--accent)"></i>Hôm nay</span></div>`;
}
async function reportTab(body) {
  const r = await GET(`/api/projects/${PJ.id}/report`), s = r.summary;
  const rate = x => x.done_with_due ? Math.round(x.ontime / x.done_with_due * 100) + '%' : '—';
  const gname = id => id ? (PJ.groups.find(g => g.id === id) || { name: '—' }).name : 'Chưa phân loại';
  const rowsOf = (arr, label) => arr.map(x => `<tr><td>${label(x)}</td><td class="r num">${x.total}</td><td class="r num">${x.todo || 0}</td><td class="r num">${x.doing || 0}</td><td class="r num">${x.review || 0}</td><td class="r num">${x.done || 0}</td><td class="r num">${x.failed || 0}</td><td class="r num ${x.late ? 'late' : ''}">${x.late || 0}</td><td class="r num">${rate(x)}</td></tr>`).join('');
  const th = '<thead><tr><th></th><th class="r">Tổng</th><th class="r">Cần làm</th><th class="r">Đang làm</th><th class="r">Chờ đánh giá</th><th class="r">Hoàn thành</th><th class="r">Thất bại</th><th class="r">Quá hạn</th><th class="r">Đúng hạn</th></tr></thead>';
  body.innerHTML = `<div class="stats"><div class="card stat"><span class="k">Tổng công việc</span><span class="v num">${s.total || 0}</span><span class="s">${s.done || 0} hoàn thành · ${s.failed || 0} thất bại</span></div>
    <div class="card stat ${s.late ? 'alert' : ''}"><span class="k">Quá hạn</span><span class="v num">${s.late || 0}</span><span class="s">trên ${(s.total || 0) - (s.done || 0) - (s.failed || 0)} việc chưa kết thúc</span></div>
    <div class="card stat"><span class="k">Chờ đánh giá</span><span class="v num">${s.review || 0}</span><span class="s">${PJ.settings.review ? 'Đang bật đánh giá' : 'Chưa bật đánh giá'}</span></div>
    <div class="card stat"><span class="k">Tỷ lệ hoàn thành đúng hạn</span><span class="v num">${rate(s)}</span><span class="s">tính theo thời điểm người làm bấm hoàn thành</span></div></div>
  <section class="card"><div class="card-h"><h2>Theo người thực hiện</h2></div><div class="tbl-wrap"><table class="tbl">${th}<tbody>${rowsOf(r.by_member, x => who(x.user_id))}</tbody></table></div></section>
  <section class="card"><div class="card-h"><h2>Theo nhóm công việc</h2></div><div class="tbl-wrap"><table class="tbl">${th}<tbody>${rowsOf(r.by_group, x => esc(gname(x.group_id)))}</tbody></table></div></section>`;
}

/* ================= Thiết lập dự án ================= */
function settingsTab(body) {
  const S = PJ.settings, chk = (k, l, hint) => `<label class="check w-set"><input type="checkbox" data-wset="${k}" ${S[k] ? 'checked' : ''}> <span>${l}${hint ? `<small class="t-sub">${hint}</small>` : ''}</span></label>`;
  const closed = PJ.status === 'closed';
  body.innerHTML = `<div class="grid2">
  <section class="card"><div class="card-h"><h2>Thông tin</h2></div><div class="card-b"><div class="form">
    <div class="field full"><label for="ps-n">Tên</label><input id="ps-n" value="${esc(PJ.name)}" maxlength="120"></div>
    <div class="field"><label for="ps-k">Loại</label><select id="ps-k">${Object.entries(KIND).map(([k, l]) => `<option value="${k}" ${k === PJ.kind ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <div class="field"><label for="ps-c">Màu nhận diện</label><select id="ps-c">${(COLORS.includes(PJ.color) ? COLORS : [PJ.color, ...COLORS]).map((c, i) => `<option value="${c}" ${c === PJ.color ? 'selected' : ''}>Màu ${i + 1}</option>`).join('')}</select></div>
    <div class="field"><label for="ps-s">Ngày bắt đầu (dự án)</label><input type="date" id="ps-s" value="${PJ.start_date || ''}"></div>
    <div class="field"><label for="ps-e">Ngày kết thúc (dự án)</label><input type="date" id="ps-e" value="${PJ.end_date || ''}"></div>
    <div class="field full"><label for="ps-d">Mô tả</label><textarea id="ps-d">${esc(PJ.description || '')}</textarea></div>
  </div><p class="err" id="ps-err" hidden></p><div class="actions" style="margin-top:10px"><button class="btn primary" data-act="w-ps-save">Lưu thông tin</button></div></div></section>
  <section class="card"><div class="card-h"><h2>Quy tắc làm việc</h2></div><div class="card-b w-sets">
    ${chk('member_create', 'Thành viên được tạo công việc')}
    ${chk('member_view_all', 'Thành viên xem được công việc của người khác', 'Nếu tắt, thành viên chỉ xem việc mình giao, được giao hoặc theo dõi')}
    ${chk('assignee_edit_info', 'Người nhận việc được sửa thông tin công việc')}
    ${chk('assignee_edit_deadline', 'Người nhận việc được sửa thời gian (bắt đầu, thời hạn)')}
    ${chk('creator_delete', 'Người tạo được xóa công việc mình tạo')}
    ${chk('deadline_time', 'Thời hạn theo giờ (ngày và giờ cụ thể)')}
    ${chk('allow_percent', 'Cập nhật % hoàn thành')}
    ${chk('review', 'Yêu cầu đánh giá trước khi hoàn thành', 'Việc của quản lý hoàn thành ngay, không qua đánh giá')}
    <div class="w-sub" ${S.review ? '' : 'hidden'} id="ps-review"><div class="field"><label for="ps-rm">Người đánh giá</label><select id="ps-rm"><option value="creator" ${S.reviewer_mode === 'creator' ? 'selected' : ''}>Người giao việc (và quản lý)</option><option value="list" ${S.reviewer_mode === 'list' ? 'selected' : ''}>Danh sách chỉ định (và quản lý)</option></select></div>
      <div class="field" id="ps-rl-f" ${S.reviewer_mode === 'list' ? '' : 'hidden'}><label for="ps-rl">Danh sách người đánh giá (giữ Ctrl để chọn nhiều)</label><select id="ps-rl" multiple size="5">${B().users.filter(u => u.active).map(u => `<option value="${u.id}" ${(S.reviewers || []).includes(u.id) ? 'selected' : ''}>${esc(u.full_name)}</option>`).join('')}</select></div>
      <div class="field"><label for="ps-sla">Thời hạn đánh giá (giờ)</label><input type="number" id="ps-sla" min="0" max="720" value="${S.review_sla_h}"></div></div>
    ${chk('allow_failed', 'Cho phép đánh dấu Thất bại')}
    <div class="w-sub" ${S.allow_failed ? '' : 'hidden'} id="ps-fail"><div class="t-sub">Ngoài quản lý, cho phép đánh dấu thất bại:</div>
      ${[['creator', 'Người giao việc'], ['assignee', 'Người nhận việc'], ['follower', 'Người theo dõi']].map(([k, l]) => `<label class="check"><input type="checkbox" data-wfr="${k}" ${S.fail_roles.includes(k) ? 'checked' : ''}> ${l}</label>`).join('')}
      <div class="field"><label for="ps-fr">Danh mục lý do thất bại (mỗi dòng một lý do)</label><textarea id="ps-fr" rows="4">${esc(S.fail_reasons.join('\n'))}</textarea></div></div>
    <p class="err" id="pr-err" hidden></p><div class="actions"><button class="btn primary" data-act="w-pr-save">Lưu quy tắc</button></div></div></section></div>
  <div class="grid2">
  <section class="card"><div class="card-h"><h2>Thành viên (${PJ.members.length})</h2></div><div class="tbl-wrap"><table class="tbl"><tbody>
    ${PJ.members.map(m => `<tr><td>${who(m.user_id)}</td><td><select class="sel" data-wrole="${m.user_id}" aria-label="Vai trò">${['manager', 'member', 'follower'].map(r => `<option value="${r}" ${r === m.role ? 'selected' : ''}>${ROLE[r]}</option>`).join('')}</select></td>
      <td class="r"><button class="btn ghost sm" data-act="w-mdel" data-u="${m.user_id}" aria-label="Xóa khỏi dự án">Xóa</button></td></tr>`).join('')}</tbody></table></div>
    <div class="card-b"><div class="form"><div class="field"><label for="pm-u">Thêm người (giữ Ctrl để chọn nhiều)</label><select id="pm-u" multiple size="5">${B().users.filter(u => u.active && !PJ.members.some(m => m.user_id === u.id)).map(u => `<option value="${u.id}">${esc(u.full_name)}</option>`).join('')}</select></div>
      <div class="field"><label for="pm-r">Vai trò</label><select id="pm-r"><option value="member">Thành viên</option><option value="manager">Quản lý</option><option value="follower">Người theo dõi</option></select><button class="btn" data-act="w-madd" style="margin-top:8px">Thêm vào dự án</button></div></div>
    <p class="err" id="pm-err" hidden></p></div></section>
  <section class="card"><div class="card-h"><h2>Nhóm công việc (${PJ.groups.length})</h2></div><div class="tbl-wrap"><table class="tbl"><tbody>
    ${PJ.groups.map((g, i) => `<tr><td><b>${esc(g.name)}</b>${g.closed ? ' <span class="tag">Tạm đóng</span>' : ''}<div class="t-sub">${g.std_hours ? `Định mức ${g.std_hours} giờ` : 'Không định mức'}</div></td>
      <td class="r" style="white-space:nowrap"><button class="btn ghost sm" data-act="w-gmove" data-g="${g.id}" data-d="-1" ${i === 0 ? 'disabled' : ''} aria-label="Đưa lên">↑</button><button class="btn ghost sm" data-act="w-gmove" data-g="${g.id}" data-d="1" ${i === PJ.groups.length - 1 ? 'disabled' : ''} aria-label="Đưa xuống">↓</button>
      <button class="btn ghost sm" data-act="w-gedit" data-g="${g.id}">Sửa</button><button class="btn ghost sm" data-act="w-gclose" data-g="${g.id}">${g.closed ? 'Mở' : 'Tạm đóng'}</button><button class="btn ghost sm" data-act="w-gdel" data-g="${g.id}">Xóa</button></td></tr>`).join('') || '<tr><td class="muted">Chưa có nhóm công việc.</td></tr>'}</tbody></table></div>
    <div class="card-b"><div class="inline-add"><input id="pg-n" placeholder="Tên nhóm công việc mới" aria-label="Tên nhóm công việc mới"><input id="pg-h" type="number" min="0" step="0.5" placeholder="Định mức (giờ)" aria-label="Định mức giờ" style="max-width:130px"><button class="btn" data-act="w-gadd">Thêm nhóm</button></div><p class="err" id="pg-err" hidden></p></div></section></div>
  <section class="card"><div class="card-h"><h2>Trạng thái dự án/phòng ban</h2></div><div class="card-b"><div class="actions">
    ${closed ? '<button class="btn primary" data-act="w-reopen">Mở lại</button>' : '<button class="btn" data-act="w-close">Đóng dự án/phòng ban</button>'}
    <button class="btn danger" data-act="w-pdel">Xóa dự án/phòng ban</button></div><p class="hint">Xóa sẽ xóa toàn bộ công việc bên trong và không khôi phục được.</p></div></section>`;
  $$('[data-wset="review"]').forEach(el => el.onchange = () => { $('#ps-review').hidden = !el.checked; });
  $$('[data-wset="allow_failed"]').forEach(el => el.onchange = () => { $('#ps-fail').hidden = !el.checked; });
  const rm = $('#ps-rm'); if (rm) rm.onchange = () => { $('#ps-rl-f').hidden = rm.value !== 'list'; };
  $$('[data-wrole]').forEach(el => el.onchange = async () => { try { PJ = await PUT(`/api/projects/${PJ.id}/members/${el.dataset.wrole}`, { role: el.value }); toast('Đã đổi vai trò'); render(); } catch (e) { toast(e.message, true); render(); } });
}

/* ================= Hộp thoại: dự án ================= */
function newProject() {
  const others = B().users.filter(u => u.active && u.id !== B().me.id);
  openModal(`${mh('Tạo dự án / phòng ban')}<div class="modal-b"><div class="form">
    <div class="field full"><label for="np-n">Tên</label><input id="np-n" maxlength="120" placeholder="Ví dụ: Triển khai văn phòng số giai đoạn 2"></div>
    <div class="field"><label for="np-k">Loại</label><select id="np-k"><option value="project">Dự án (có ngày bắt đầu, kết thúc)</option><option value="team">Phòng ban (công việc thường xuyên)</option></select></div>
    <div class="field"><label for="np-c">Màu nhận diện</label><select id="np-c">${COLORS.map((c, i) => `<option value="${c}">Màu ${i + 1}</option>`).join('')}</select></div>
    <div class="field np-date"><label for="np-s">Ngày bắt đầu</label><input type="date" id="np-s" value="${TODAY()}"></div>
    <div class="field np-date"><label for="np-e">Ngày kết thúc</label><input type="date" id="np-e" value="${addDays(TODAY(), 30)}"></div>
    <div class="field"><label for="np-m">Quản lý cùng (ngoài bạn)</label><select id="np-m" multiple size="5">${others.map(u => `<option value="${u.id}">${esc(u.full_name)}</option>`).join('')}</select></div>
    <div class="field"><label for="np-mb">Thành viên</label><select id="np-mb" multiple size="5">${others.map(u => `<option value="${u.id}">${esc(u.full_name)}</option>`).join('')}</select></div>
    <div class="field full"><label for="np-d">Mô tả</label><textarea id="np-d" placeholder="Mục tiêu, phạm vi, căn cứ"></textarea></div>
  </div><p class="hint">Giữ Ctrl (hoặc Cmd) để chọn nhiều người. Bạn là quản lý của dự án/phòng ban mới tạo.</p><p class="err" id="np-err" hidden></p></div>
  <div class="modal-f"><button class="btn" data-act="close">Hủy</button><button class="btn primary" data-act="np-save">Tạo</button></div>`, {
    'np-save': btn => busy(btn, async () => {
      try {
        const kind = $('#np-k').value;
        const p = await POST('/api/projects', { name: $('#np-n').value, kind, color: $('#np-c').value, description: $('#np-d').value, start_date: kind === 'project' ? $('#np-s').value : null, end_date: kind === 'project' ? $('#np-e').value : null, managers: multiVals($('#np-m')), members: multiVals($('#np-mb')) });
        closeModal(); await refreshBoot(); toast('Đã tạo ' + KIND[p.kind].toLowerCase()); go({ p: p.id });
      } catch (e) { showErr('#np-err', e); }
    })
  });
  $('#np-k').onchange = e => $$('.np-date').forEach(f => { f.hidden = e.target.value !== 'project'; });
}

/* ================= Hộp thoại: tạo công việc ================= */
async function newTask(ctx = {}) {
  let projects = (await GET('/api/projects')).filter(p => p.status !== 'closed');
  if (!projects.length) { toast('Vui lòng tạo dự án/phòng ban trước khi thêm công việc.', true); return newProject(); }
  let pid = ctx.project_id || (PJ && qp().get('p') ? PJ.id : projects[0].id);
  if (!projects.some(p => p.id === pid)) pid = projects[0].id;
  let P = await GET('/api/projects/' + pid);
  const [G, DOCL] = await Promise.all([loadGoals(), loadDocs()]);
  const draw = () => openModal(`${mh(ctx.parent_id ? 'Thêm việc con' : 'Thêm công việc')}<div class="modal-b"><div class="form">
    <div class="field full"><label for="nt-t">Tên công việc <span class="t-sub" id="nt-cnt">0/155</span></label><input id="nt-t" maxlength="155" placeholder="Ví dụ: Lập báo cáo doanh thu tháng 11"></div>
    <div class="field"><label for="nt-p">Dự án / phòng ban</label><select id="nt-p" ${ctx.parent_id ? 'disabled' : ''}>${projects.map(p => `<option value="${p.id}" ${p.id === P.id ? 'selected' : ''}>${esc(p.name)} (${KIND[p.kind]})</option>`).join('')}</select></div>
    <div class="field"><label for="nt-g">Nhóm công việc</label><select id="nt-g"><option value="">Chưa phân loại</option>${P.groups.filter(g => !g.closed).map(g => `<option value="${g.id}" ${g.id === ctx.group_id ? 'selected' : ''}>${esc(g.name)}${g.std_hours ? ` (${g.std_hours} giờ)` : ''}</option>`).join('')}</select></div>
    <div class="field"><label for="nt-a">Người nhận việc</label><select id="nt-a">${userOpts(B().me.id)}</select><label class="check" style="margin-top:6px"><input type="checkbox" id="nt-multi"> Giao cho nhiều người (mỗi người một việc)</label></div>
    <div class="field" id="nt-am-f" hidden><label for="nt-am">Chọn nhiều người nhận (giữ Ctrl)</label><select id="nt-am" multiple size="6">${B().users.filter(u => u.active).map(u => `<option value="${u.id}">${esc(u.full_name)}</option>`).join('')}</select></div>
    <div class="field"><label for="nt-s">Ngày bắt đầu</label><input type="date" id="nt-s" value="${TODAY()}"></div>
    <div class="field"><label for="nt-d">Thời hạn</label><input type="date" id="nt-d" value="${addDays(TODAY(), 3)}">${P.settings.deadline_time ? '<input type="time" id="nt-dt" aria-label="Giờ hết hạn" style="margin-top:6px">' : ''}</div>
    <div class="field"><label for="nt-pr">Mức ưu tiên</label><select id="nt-pr">${Object.entries(PRIO).map(([k, l]) => `<option value="${k}" ${k === 'tb' ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <div class="field"><span class="lbl">Gắn cờ</span><div class="w-flags"><label class="check"><input type="checkbox" id="nt-u"> Khẩn cấp</label><label class="check"><input type="checkbox" id="nt-i"> Quan trọng</label></div></div>
    <div class="field"><label for="nt-f">Người theo dõi (giữ Ctrl)</label><select id="nt-f" multiple size="5">${B().users.filter(u => u.active).map(u => `<option value="${u.id}">${esc(u.full_name)}</option>`).join('')}</select></div>
    <div class="field full"><label for="nt-desc">Mô tả</label><textarea id="nt-desc" placeholder="Nội dung, căn cứ, kết quả cần đạt"></textarea></div>
    <div class="field"><label for="nt-tags">Nhãn (cách nhau bằng dấu phẩy, tối đa 10)</label><input id="nt-tags" list="nt-taglist" maxlength="330" placeholder="Ví dụ: Hạ tầng, Báo cáo tháng"><datalist id="nt-taglist">${(P.tags || []).map(x => `<option value="${esc(x)}">`).join('')}</datalist></div>
    <div class="field"><label for="nt-goal">Liên kết mục tiêu${G.cycle ? ' (' + esc(G.cycle.name) + ')' : ''}</label><select id="nt-goal" ${G.list.length ? '' : 'disabled'}>${goalOpts(G, null)}</select>${G.list.length ? '' : '<span class="t-sub">Chưa có mục tiêu trong kỳ hiện hành.</span>'}</div>
    <div class="field"><span class="lbl">Tệp đính kèm (mỗi tệp tối đa 10 MB)</span><label class="btn sm w-filepick">Chọn tệp…<input type="file" id="nt-files" multiple aria-label="Chọn tệp đính kèm"></label><span class="t-sub" id="nt-fsum">Chưa chọn tệp.</span></div>
    <div class="field"><label for="nt-docs">Tài liệu từ kho Tài liệu (giữ Ctrl để chọn nhiều)</label><select id="nt-docs" multiple size="4" ${DOCL.length ? '' : 'disabled'}>${DOCL.length ? docOpts(DOCL) : '<option disabled>Chưa có tài liệu bạn được xem</option>'}</select></div>
  </div><p class="hint">Người nhận việc ngoài dự án sẽ được thêm với vai trò Người theo dõi để xem được việc của mình.</p><p class="err" id="nt-err" hidden></p></div>
  <div class="modal-f"><button class="btn" data-act="close">Hủy</button><button class="btn primary" data-act="nt-save">Giao việc</button></div>`, H);
  const H = {
    'nt-save': btn => busy(btn, async () => {
      const multi = $('#nt-multi').checked;
      const body = { project_id: P.id, parent_id: ctx.parent_id || null, group_id: $('#nt-g').value || null, title: $('#nt-t').value, start_date: $('#nt-s').value, due_date: $('#nt-d').value || null,
        due_time: $('#nt-dt') ? ($('#nt-dt').value || null) : null, priority: $('#nt-pr').value, urgent: $('#nt-u').checked, important: $('#nt-i').checked,
        followers: multiVals($('#nt-f')), description: $('#nt-desc').value, tags: $('#nt-tags').value, goal_id: $('#nt-goal').value || null };
      const files = Array.from($('#nt-files').files || []), docIds = $('#nt-docs').disabled ? [] : multiVals($('#nt-docs'));
      const big = files.find(f => f.size > FILE_MAX); if (big) return showErr('#nt-err', `Tệp “${big.name}” vượt quá 10 MB.`);
      if (multi) { body.assignee_ids = multiVals($('#nt-am')); if (!body.assignee_ids.length) return showErr('#nt-err', 'Vui lòng chọn người nhận việc.'); } else body.assignee_id = Number($('#nt-a').value);
      let r;
      try { r = await POST('/api/tasks', body); } catch (e) { return showErr('#nt-err', e); }
      const ids = r.ids || [r.id];
      const errs = files.length || docIds.length ? await attachAll(ids, files, docIds) : [];
      closeModal(); refreshBoot();
      if (errs.length) toast(`Đã giao việc; ${errs.length} tệp/tài liệu chưa đính kèm được: ${errs[0]}`, true);
      else toast(r.ids ? `Đã giao ${r.ids.length} công việc` : 'Đã giao việc' + (files.length + docIds.length ? ` kèm ${files.length + docIds.length} tệp/tài liệu` : ''));
      if (ctx.onDone) ctx.onDone(r); else render();
    })
  };
  const wire = () => {
    $('#nt-t').oninput = e => { $('#nt-cnt').textContent = e.target.value.length + '/155'; };
    $('#nt-files').onchange = e => { const fs = Array.from(e.target.files || []); $('#nt-fsum').textContent = fs.length ? fs.map(f => `${f.name} (${fmtSize(f.size)})`).join('; ') : 'Chưa chọn tệp.'; };
    $('#nt-multi').onchange = e => { $('#nt-am-f').hidden = !e.target.checked; $('#nt-a').disabled = e.target.checked; };
    $('#nt-p').onchange = async e => { try { P = await GET('/api/projects/' + e.target.value); const t = $('#nt-t').value; draw(); wire(); $('#nt-t').value = t; } catch (er) { showErr('#nt-err', er); } };
  };
  draw(); wire();
}

/* ================= Hộp thoại: chi tiết công việc ================= */
async function openTask(id) {
  let t;
  let G, DOCL;
  try { [t, G, DOCL] = await Promise.all([GET('/api/tasks/' + id), loadGoals(), loadDocs()]); } catch (e) { return toast(e.message, true); }
  const reload = async nt => { t = nt || await GET('/api/tasks/' + t.id); draw(true); };
  const after = async nt => { await reload(nt); render(); refreshBoot(); };
  const draw = keep => {
    const c = t.can, S = t.project.settings, dis = f => f ? '' : 'disabled';
    const acts = [];
    if (c.progress && t.status === 'todo') acts.push('<button class="btn" data-act="tk-st" data-s="doing">Bắt đầu thực hiện</button>');
    if (c.progress && ['todo', 'doing'].includes(t.status)) acts.push(`<button class="btn ok" data-act="tk-st" data-s="done">${S.review ? 'Hoàn thành, gửi đánh giá' : 'Hoàn thành'}</button>`);
    if (c.review && t.status === 'review') acts.push('<button class="btn ok" data-act="tk-rv" data-ok="1">Duyệt hoàn thành</button><button class="btn" data-act="tk-rv" data-ok="0">Trả lại</button>');
    if (c.progress && ['done', 'failed', 'review'].includes(t.status)) acts.push('<button class="btn" data-act="tk-st" data-s="doing">Mở lại / chuyển Đang làm</button>');
    if (c.fail && !['failed', 'review'].includes(t.status)) acts.push('<button class="btn danger" data-act="tk-fail">Thất bại</button>');
    const html = (`${mh(esc(t.title), `<a href="#cong-viec?p=${t.project.id}" data-act="close">${esc(t.project.name)}</a>${t.group_name ? ' › ' + esc(t.group_name) : ''}${t.parent ? ` › việc con của <span class="w-link" role="button" tabindex="0" data-act="tk-open" data-id="${t.parent.id}">${esc(t.parent.title)}</span>` : ''} · #${t.id}`)}
    <div class="modal-b">
      <div class="w-status">${pill(t.status)}${flags(t)}${late(t) ? '<span class="late">Quá hạn</span>' : ''}${t.status === 'failed' ? `<span class="t-sub">Lý do: ${esc(t.fail_reason || '')}</span>` : ''}${t.completed_at ? `<span class="t-sub">Bấm hoàn thành lúc ${fmtDT(t.completed_at)}</span>` : ''}<span class="spacer"></span>${acts.join('')}</div>
      ${!c.editInfo && !c.editDeadline ? '<p class="notice info">Bạn có quyền xem, trao đổi' + (c.progress ? ' và cập nhật tiến độ' : '') + ' trong công việc này.</p>' : ''}
      <div class="form">
        <div class="field full"><label for="tk-t">Tên công việc</label><input id="tk-t" maxlength="155" value="${esc(t.title)}" ${dis(c.editInfo)}></div>
        <div class="field"><label for="tk-a">Người nhận việc</label><select id="tk-a" ${dis(c.edit)}>${userOpts(t.assignee_id)}</select><span class="t-sub">Người giao: ${esc(U(t.creator_id).full_name)} · ${fmtDT(t.created_at)}</span></div>
        <div class="field"><label for="tk-g">Nhóm công việc</label><select id="tk-g" ${dis(c.editInfo)}><option value="">Chưa phân loại</option>${t.groups.map(g => `<option value="${g.id}" ${g.id === t.group_id ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select></div>
        <div class="field"><label for="tk-s">Ngày bắt đầu</label><input type="date" id="tk-s" value="${t.start_date || ''}" ${dis(c.editDeadline)}></div>
        <div class="field"><label for="tk-d">Thời hạn</label><input type="date" id="tk-d" value="${t.due_date || ''}" ${dis(c.editDeadline)}>${S.deadline_time ? `<input type="time" id="tk-dt" value="${t.due_time || ''}" aria-label="Giờ hết hạn" style="margin-top:6px" ${dis(c.editDeadline)}>` : ''}</div>
        <div class="field"><label for="tk-pr">Mức ưu tiên</label><select id="tk-pr" ${dis(c.editInfo)}>${Object.entries(PRIO).map(([k, l]) => `<option value="${k}" ${k === t.priority ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label for="tk-h">Thời lượng dự kiến (giờ)</label><input type="number" id="tk-h" min="0" step="0.5" value="${t.est_hours || ''}" ${dis(c.editInfo)}></div>
        <div class="field full"><span class="lbl">Gắn cờ</span><div class="w-flags"><label class="check"><input type="checkbox" id="tk-u" ${t.urgent ? 'checked' : ''} ${dis(c.editInfo)}> Khẩn cấp</label><label class="check"><input type="checkbox" id="tk-i" ${t.important ? 'checked' : ''} ${dis(c.editInfo)}> Quan trọng</label></div></div>
        <div class="field full"><label for="tk-desc">Mô tả</label><textarea id="tk-desc" rows="4" ${dis(c.editInfo)}>${esc(t.description || '')}</textarea></div>
        <div class="field"><label for="tk-tags">Nhãn (cách nhau bằng dấu phẩy)</label>${c.editInfo ? `<input id="tk-tags" maxlength="330" value="${esc(t.tags.join(', '))}">` : `<div class="w-tagrow">${tagChips(t.tags) || '<span class="hint">Chưa gắn nhãn.</span>'}</div>`}</div>
        <div class="field"><label for="tk-goal">Liên kết mục tiêu</label>${c.editInfo ? `<select id="tk-goal">${goalOpts(t.goal && !G.list.some(g => g.id === t.goal.id) ? { list: [{ id: t.goal.id, title: t.goal.title, depth: 0 }, ...G.list] } : G, t.goal ? t.goal.id : null)}</select>` : `<div>${t.goal ? `<a href="#muc-tieu" data-act="close">${esc(t.goal.title)}</a>` : '<span class="hint">Không liên kết.</span>'}</div>`}
          ${t.goal ? `<span class="t-sub">Tiến độ mục tiêu: ${Number(t.goal.current).toLocaleString('vi-VN')}/${Number(t.goal.target).toLocaleString('vi-VN')} ${esc(t.goal.unit || '')}</span>` : ''}</div>
      </div>
      ${c.editInfo || c.editDeadline || c.edit ? '<div class="actions"><button class="btn primary" data-act="tk-save">Lưu thay đổi</button></div>' : ''}
      <p class="err" id="tk-err" hidden></p>

      <h3 class="sec-t">Tệp đính kèm, tài liệu (${t.files.length})</h3>
      <div class="w-files">${t.files.map(f => `<div class="w-file">${f.kind === 'doc'
          ? `<span class="tag">Tài liệu</span><a href="${f.file_size ? `/api/docs/${f.doc_id}/file` : '#tai-lieu'}" ${f.file_size ? 'download' : 'data-act="close"'}>${esc(f.doc_title || f.file_name || 'Tài liệu #' + f.doc_id)}</a>`
          : `<span class="tag">Tệp</span><a href="/api/task-files/${f.id}" download>${esc(f.file_name)}</a><span class="t-sub num">${fmtSize(f.file_size)}</span>`}
        <span class="t-sub">${esc(U(f.uploaded_by).full_name)} · ${fmtDT(f.created_at)}</span><span class="spacer"></span>
        ${f.uploaded_by === B().me.id || c.edit || c.manage ? `<button class="btn ghost sm" data-act="tk-filedel" data-id="${f.id}" aria-label="Gỡ ${esc(f.file_name || 'tài liệu')}">Gỡ</button>` : ''}</div>`).join('') || '<span class="hint">Chưa có tệp đính kèm.</span>'}</div>
      ${t.files.some(f => f.kind === 'doc') ? '<p class="hint">Tài liệu từ kho Tài liệu giữ nguyên phân quyền: chỉ người được xem tài liệu mới tải được.</p>' : ''}
      ${(c.editInfo || c.progress) && t.project.status !== 'closed' ? `<div class="inline-add w-fadd"><label class="btn sm w-filepick">Chọn tệp…<input type="file" id="tk-file" multiple aria-label="Chọn tệp đính kèm"></label><span class="t-sub w-fsum">Chưa chọn tệp.</span><span class="spacer"></span><button class="btn sm" data-act="tk-fileup">Tải lên</button></div>
        ${DOCL.length ? `<div class="inline-add w-fadd"><select id="tk-doc" class="sel" aria-label="Chọn tài liệu từ kho Tài liệu"><option value="">Chọn tài liệu từ kho Tài liệu…</option>${docOpts(DOCL.filter(d => !t.files.some(f => f.doc_id === d.id)))}</select><button class="btn sm" data-act="tk-doclink">Liên kết</button></div>` : ''}` : ''}

      <h3 class="sec-t">Kết quả, tiến độ ${S.allow_percent ? `<span class="muted num">${t.progress || 0}%</span>` : ''}</h3>
      ${S.allow_percent ? `<div class="prog ${t.status === 'done' ? 'ok' : ''}"><i style="width:${t.progress || 0}%"></i></div>` : ''}
      ${c.progress && !isDone(t) && t.status !== 'review' ? `<div class="inline-add"><input id="tk-rn" placeholder="Nội dung kết quả, báo cáo tiến độ" aria-label="Nội dung kết quả">${S.allow_percent ? `<input id="tk-rp" type="number" min="0" max="100" value="${t.progress || 0}" aria-label="% hoàn thành" style="max-width:90px">` : ''}<button class="btn sm" data-act="tk-res">Cập nhật</button></div>` : ''}
      <div class="cmts">${t.results.map(r => `<div class="cmt">${av(r.user_id)}<div><b>${esc(U(r.user_id).full_name)}</b><time>${fmtDT(r.created_at)}</time>${r.progress !== null && r.progress !== undefined ? ` <span class="tag">${r.progress}%</span>` : ''}<p>${esc(r.note || '')}</p></div></div>`).join('') || '<span class="hint">Chưa có cập nhật kết quả.</span>'}</div>

      <h3 class="sec-t">Việc con (${t.subtasks.filter(s => s.status === 'done').length}/${t.subtasks.length})</h3>
      ${t.subtasks.length ? `<div class="tbl-wrap"><table class="tbl"><tbody>${t.subtasks.map(s => `<tr class="click" data-act="tk-open" data-id="${s.id}"><td><span class="t-title">${esc(s.title)}</span></td><td>${who(s.assignee_id)}</td><td class="num ${late(s) ? 'late' : ''}">${dueTxt(s)}</td><td>${pill(s.status)}</td></tr>`).join('')}</tbody></table></div>` : ''}
      ${t.depth < 2 && t.project.status !== 'closed' && (c.editInfo || c.manage) ? '<button class="btn sm" data-act="tk-sub">+ Thêm việc con</button>' : t.depth >= 2 ? '<span class="hint">Đã đạt giới hạn 3 cấp việc con.</span>' : ''}

      <h3 class="sec-t">Người theo dõi (${t.followers.length})</h3>
      <div class="chips">${t.followers.map(u => `<span class="chip">${av(u)} ${esc(U(u).full_name)}${c.editInfo || c.manage || u === B().me.id ? ` <button class="btn ghost sm" data-act="tk-fdel" data-u="${u}" aria-label="Bỏ theo dõi">×</button>` : ''}</span>`).join('') || '<span class="hint">Chưa có người theo dõi.</span>'}</div>
      ${c.editInfo || c.manage ? `<div class="inline-add"><select id="tk-fa" class="sel" aria-label="Thêm người theo dõi"><option value="">Chọn người theo dõi…</option>${B().users.filter(u => u.active && !t.followers.includes(u.id)).map(u => `<option value="${u.id}">${esc(u.full_name)}</option>`).join('')}</select><button class="btn sm" data-act="tk-fadd">Thêm</button></div>` : ''}

      <h3 class="sec-t">Danh mục đầu việc (${t.checklist.filter(x => x.done).length}/${t.checklist.length})</h3>
      <div class="cl">${t.checklist.map(x => `<div class="cl-row ${x.done ? 'done' : ''}"><label><input type="checkbox" data-wcl="${x.id}" ${x.done ? 'checked' : ''} ${dis(c.progress)}><span>${esc(x.text)}</span></label>${c.progress ? `<button class="btn ghost sm" data-act="tk-cldel" data-id="${x.id}" aria-label="Xóa đầu việc">×</button>` : ''}</div>`).join('') || '<span class="hint">Chưa có đầu việc.</span>'}</div>
      ${c.progress ? '<div class="inline-add"><input id="tk-cl" placeholder="Thêm đầu việc" aria-label="Thêm đầu việc"><button class="btn sm" data-act="tk-cladd">Thêm</button></div>' : ''}

      <h3 class="sec-t">Trao đổi (${t.comments.length})</h3>
      <div class="cmts">${t.comments.map(m => `<div class="cmt">${av(m.user_id)}<div><b>${esc(U(m.user_id).full_name)}</b><time>${fmtDT(m.created_at)}</time><p>${esc(m.body)}</p></div></div>`).join('') || '<span class="hint">Chưa có trao đổi.</span>'}</div>
      <div class="inline-add"><input id="tk-cm" placeholder="Viết ý kiến…" aria-label="Viết ý kiến"><button class="btn sm" data-act="tk-cmadd">Gửi</button></div>

      <details class="stat-box"><summary>Lịch sử hoạt động (${t.logs.length})</summary><div class="cmts" style="margin-top:8px">${t.logs.map(l => `<div class="t-sub">${fmtDT(l.created_at)} · <b>${esc(U(l.user_id).full_name)}</b> ${LOG[l.action] || esc(l.action)}${l.detail ? ': ' + esc(l.detail) : ''}</div>`).join('')}</div></details>
    </div>
    <div class="modal-f">${c.del ? '<button class="btn danger" data-act="tk-del" style="margin-right:auto">Xóa</button>' : ''}${t.project.status !== 'closed' ? '<button class="btn" data-act="tk-clone">Nhân bản</button>' : ''}<button class="btn" data-act="close">Đóng</button></div>`);
    /* Vẽ lại tại chỗ khi đang mở đúng công việc này: giữ vị trí cuộn và tiêu điểm (không nhảy về đầu hộp thoại). */
    const box = $('#modal .modal-b');
    if (keep && box && box.dataset.wtask === String(t.id) && !$('#overlay').hidden) {
      const top = box.scrollTop, fid = document.activeElement && document.activeElement.id;
      $('#modal').innerHTML = html; const nb = $('#modal .modal-b'); nb.dataset.wtask = t.id; nb.scrollTop = top;
      const f = fid && document.getElementById(fid); if (f) f.focus();
    } else { openModal(html, H); $('#modal .modal-b').dataset.wtask = t.id; }
  };
  const err = e => showErr('#tk-err', e);
  const H = {
    'tk-save': btn => busy(btn, async () => {
      const c = t.can, b = {};
      if (c.editInfo) Object.assign(b, { title: $('#tk-t').value, group_id: $('#tk-g').value || null, priority: $('#tk-pr').value, urgent: $('#tk-u').checked, important: $('#tk-i').checked, est_hours: $('#tk-h').value || 0, description: $('#tk-desc').value, tags: $('#tk-tags').value, goal_id: $('#tk-goal').value || null });
      if (c.editDeadline) Object.assign(b, { start_date: $('#tk-s').value, due_date: $('#tk-d').value || null }, $('#tk-dt') ? { due_time: $('#tk-dt').value || null } : {});
      if (c.edit && Number($('#tk-a').value) !== t.assignee_id) b.assignee_id = Number($('#tk-a').value);
      try { await after(await PUT('/api/tasks/' + t.id, b)); toast('Đã lưu công việc'); } catch (e) { err(e); }
    }),
    'tk-st': btn => busy(btn, async () => {
      const s = btn.dataset.s;
      try { await after(await POST(`/api/tasks/${t.id}/status`, { status: s })); toast(t.status === 'review' ? 'Đã gửi đánh giá hoàn thành' : 'Đã chuyển sang “' + ST[t.status] + '”'); }
      catch (e) {
        if (s === 'done' && /việc con/.test(e.message)) { if (!armed(btn, 'Vẫn hoàn thành? Bấm lần nữa')) return; try { await after(await POST(`/api/tasks/${t.id}/status`, { status: 'done', force: true })); } catch (e2) { err(e2); } }
        else err(e);
      }
    }),
    'tk-rv': btn => {
      const okv = btn.dataset.ok === '1';
      openModal(`${mh(okv ? 'Duyệt hoàn thành' : 'Trả lại công việc', esc(t.title))}<div class="modal-b"><div class="field"><label for="rv-n">Ý kiến ${okv ? '(không bắt buộc)' : '(bắt buộc)'}</label><textarea id="rv-n"></textarea></div><p class="err" id="rv-err" hidden></p></div>
        <div class="modal-f"><button class="btn" data-act="rv-back">Quay lại</button><button class="btn ${okv ? 'ok' : 'primary'}" data-act="rv-go">${okv ? 'Duyệt' : 'Trả lại'}</button></div>`, {
        'rv-back': () => draw(),
        'rv-go': b2 => busy(b2, async () => { try { await after(await POST(`/api/tasks/${t.id}/review`, { approve: okv, note: $('#rv-n').value })); toast(okv ? 'Đã duyệt hoàn thành' : 'Đã trả lại công việc'); } catch (e) { showErr('#rv-err', e); } })
      });
    },
    'tk-fail': () => {
      const R = t.project.settings.fail_reasons || [];
      openModal(`${mh('Đánh dấu thất bại', esc(t.title))}<div class="modal-b"><div class="field"><label for="fl-r">Lý do thất bại</label><select id="fl-r">${R.map(r => `<option>${esc(r)}</option>`).join('')}</select></div>
        <p class="hint">Công việc thất bại được lưu lại để thống kê, đánh giá; có thể mở lại khi cần.</p><p class="err" id="fl-err" hidden></p></div>
        <div class="modal-f"><button class="btn" data-act="fl-back">Quay lại</button><button class="btn danger" data-act="fl-go">Đánh dấu thất bại</button></div>`, {
        'fl-back': () => draw(),
        'fl-go': b2 => busy(b2, async () => { try { await after(await POST(`/api/tasks/${t.id}/status`, { status: 'failed', reason: $('#fl-r').value })); toast('Đã đánh dấu thất bại'); } catch (e) { showErr('#fl-err', e); } })
      });
    },
    'tk-res': btn => busy(btn, async () => { const p = $('#tk-rp'); try { await after(await POST(`/api/tasks/${t.id}/results`, { note: $('#tk-rn').value, progress: p ? p.value : undefined })); toast('Đã cập nhật kết quả'); } catch (e) { err(e); } }),
    'tk-fileup': btn => busy(btn, async () => {
      const fs = Array.from(($('#tk-file') || {}).files || []); if (!fs.length) return err('Vui lòng chọn tệp cần tải lên.');
      const errs = await attachAll([t.id], fs, []); await after();
      if (errs.length) err(errs.join('; ')); else toast(`Đã đính kèm ${fs.length} tệp`);
    }),
    'tk-doclink': btn => busy(btn, async () => { const v = Number($('#tk-doc').value); if (!v) return err('Vui lòng chọn tài liệu.'); try { await after(await POST(`/api/tasks/${t.id}/files`, { doc_id: v })); toast('Đã liên kết tài liệu'); } catch (e) { err(e); } }),
    'tk-filedel': async btn => { if (!armed(btn, 'Gỡ?')) return; try { await after(await DEL('/api/task-files/' + btn.dataset.id)); toast('Đã gỡ tệp'); } catch (e) { err(e); } },
    'tk-sub': () => newTask({ project_id: t.project.id, parent_id: t.id, group_id: t.group_id, onDone: () => { reload(); render(); } }),
    'tk-open': el => openTask(Number(el.dataset.id)),
    'tk-fadd': btn => busy(btn, async () => { const v = $('#tk-fa').value; if (!v) return; try { await reload(await POST(`/api/tasks/${t.id}/followers`, { user_ids: [Number(v)] })); } catch (e) { err(e); } }),
    'tk-fdel': btn => busy(btn, async () => { try { await reload(await DEL(`/api/tasks/${t.id}/followers/${btn.dataset.u}`)); } catch (e) { err(e); } }),
    'tk-cladd': async () => { const v = $('#tk-cl').value.trim(); if (!v) return $('#tk-cl').focus(); try { await reload(await POST(`/api/tasks/${t.id}/checklist`, { text: v })); } catch (e) { err(e); } },
    'tk-cldel': async btn => { try { await reload(await DEL('/api/checklist/' + btn.dataset.id)); } catch (e) { err(e); } },
    'tk-cmadd': async () => { const v = $('#tk-cm').value.trim(); if (!v) return $('#tk-cm').focus(); try { await reload(await POST(`/api/tasks/${t.id}/comments`, { body: v })); } catch (e) { err(e); } },
    'tk-clone': () => {
      openModal(`${mh('Nhân bản công việc', esc(t.title))}<div class="modal-b"><div class="field"><label for="cl-t">Tên công việc mới</label><input id="cl-t" maxlength="155" value="${esc(('Bản sao: ' + t.title).slice(0, 155))}"></div>
        <div class="w-sets">${[['assignee', 'Người nhận việc'], ['group', 'Nhóm công việc'], ['subtasks', 'Việc con (tối đa 3 cấp)'], ['checklist', 'Danh mục đầu việc'], ['followers', 'Người theo dõi'], ['description', 'Mô tả'], ['deadline', 'Thời hạn'], ['files', 'Tệp đính kèm']].map(([k, l]) => `<label class="check"><input type="checkbox" data-keep="${k}" checked> Giữ ${l.toLowerCase()}</label>`).join('')}</div>
        <p class="err" id="cl-err" hidden></p></div><div class="modal-f"><button class="btn" data-act="cl-back">Quay lại</button><button class="btn primary" data-act="cl-go">Nhân bản</button></div>`, {
        'cl-back': () => draw(),
        'cl-go': b2 => busy(b2, async () => { const keep = {}; $$('[data-keep]').forEach(x => { keep[x.dataset.keep] = x.checked; }); try { const n = await POST(`/api/tasks/${t.id}/clone`, { title: $('#cl-t').value, keep }); toast('Đã nhân bản công việc'); render(); t = n; draw(); } catch (e) { showErr('#cl-err', e); } })
      });
    },
    'tk-del': async btn => { if (!armed(btn, t.subtasks.length ? `Xóa cả ${t.subtasks.length} việc con? Bấm lần nữa` : 'Bấm lần nữa để xóa')) return; try { await DEL('/api/tasks/' + t.id); closeModal(); render(); refreshBoot(); toast('Đã xóa công việc'); } catch (e) { err(e); } },
    'wcl-toggle': async el => { try { await reload(await PUT('/api/checklist/' + el.dataset.wcl, { done: el.checked })); } catch (e) { err(e); } }
  };
  clToggle = H['wcl-toggle'];
  draw();
}

/* ================= Sự kiện ================= */
Object.assign(SO.ACTIONS, {
  'w-new-task': () => newTask({}),
  'w-new-project': () => newProject(),
  'w-more': async btn => busy(btn, async () => { const more = await GET(`/api/projects/${PJ.id}/tasks?` + new URLSearchParams({ status: listStatus, assignee: listAssignee, q: listQ, tag: listTag, limit: 200, offset: PT.rows.length })); PT.rows = PT.rows.concat(more.rows); const v = qp().get('v') || 'list'; const body = $('#w-body');
    const rest = PT.total > PT.rows.length ? `<p class="hint">Hiển thị ${PT.rows.length}/${PT.total} công việc. <button class="btn sm" data-act="w-more">Tải thêm</button></p>` : '';
    body.innerHTML = (v === 'kanban' ? kanban(PT.rows) : v === 'gantt' ? ganttView(PT.rows) : listView(PT.rows)) + rest; if (v === 'kanban') wireKanban(); }),
  'w-qadd': btn => quickAdd(btn.dataset.g),
  'w-ps-save': btn => busy(btn, async () => { try { PJ = await PUT('/api/projects/' + PJ.id, { name: $('#ps-n').value, kind: $('#ps-k').value, color: $('#ps-c').value, start_date: $('#ps-s').value || null, end_date: $('#ps-e').value || null, description: $('#ps-d').value }); await refreshBoot(); toast('Đã lưu thông tin'); render(); } catch (e) { showErr('#ps-err', e); } }),
  'w-pr-save': btn => busy(btn, async () => {
    const b = {}; $$('[data-wset]').forEach(x => { b[x.dataset.wset] = x.checked; });
    b.reviewer_mode = $('#ps-rm').value; b.reviewers = multiVals($('#ps-rl')); b.review_sla_h = Number($('#ps-sla').value) || 0;
    b.fail_roles = $$('[data-wfr]').filter(x => x.checked).map(x => x.dataset.wfr); b.fail_reasons = $('#ps-fr').value.split('\n').map(x => x.trim()).filter(Boolean);
    try { PJ = await PUT(`/api/projects/${PJ.id}/settings`, b); toast('Đã lưu quy tắc làm việc'); render(); } catch (e) { showErr('#pr-err', e); }
  }),
  'w-madd': btn => busy(btn, async () => { const ids = multiVals($('#pm-u')); if (!ids.length) return showErr('#pm-err', 'Vui lòng chọn người cần thêm.'); try { PJ = await POST(`/api/projects/${PJ.id}/members`, { user_ids: ids, role: $('#pm-r').value }); toast('Đã thêm thành viên'); render(); } catch (e) { showErr('#pm-err', e); } }),
  'w-mdel': async btn => { if (!armed(btn, 'Xóa?')) return; try { PJ = await DEL(`/api/projects/${PJ.id}/members/${btn.dataset.u}`); toast('Đã xóa khỏi dự án'); render(); } catch (e) { toast(e.message, true); } },
  'w-gadd': btn => busy(btn, async () => { try { PJ = await POST(`/api/projects/${PJ.id}/groups`, { name: $('#pg-n').value, std_hours: $('#pg-h').value || 0 }); toast('Đã thêm nhóm công việc'); render(); } catch (e) { showErr('#pg-err', e); } }),
  'w-gedit': btn => { const g = PJ.groups.find(x => x.id === Number(btn.dataset.g));
    openModal(`${mh('Sửa nhóm công việc')}<div class="modal-b"><div class="form"><div class="field full"><label for="ge-n">Tên nhóm</label><input id="ge-n" value="${esc(g.name)}" maxlength="120"></div>
      <div class="field"><label for="ge-h">Thời lượng định mức (giờ/việc)</label><input id="ge-h" type="number" min="0" step="0.5" value="${g.std_hours || ''}"></div><div class="field full"><label for="ge-d">Mô tả</label><textarea id="ge-d">${esc(g.description || '')}</textarea></div></div>
      <p class="hint">Đổi định mức sẽ áp dụng cho mọi công việc trong nhóm.</p><p class="err" id="ge-err" hidden></p></div><div class="modal-f"><button class="btn" data-act="close">Hủy</button><button class="btn primary" data-act="ge-save">Lưu</button></div>`, {
      'ge-save': b2 => busy(b2, async () => { try { PJ = await PUT('/api/groups/' + g.id, { name: $('#ge-n').value, std_hours: $('#ge-h').value || 0, description: $('#ge-d').value }); closeModal(); toast('Đã lưu nhóm công việc'); render(); } catch (e) { showErr('#ge-err', e); } }) }); },
  'w-gclose': async btn => { const g = PJ.groups.find(x => x.id === Number(btn.dataset.g)); try { PJ = await PUT('/api/groups/' + g.id, { closed: !g.closed }); toast(g.closed ? 'Đã mở nhóm' : 'Đã tạm đóng nhóm'); render(); } catch (e) { toast(e.message, true); } },
  'w-gdel': async btn => { if (!armed(btn, 'Xóa nhóm? Việc chuyển về Chưa phân loại')) return; try { PJ = await DEL('/api/groups/' + btn.dataset.g); toast('Đã xóa nhóm công việc'); render(); } catch (e) { toast(e.message, true); } },
  'w-gmove': async btn => { const ids = PJ.groups.map(g => g.id), i = ids.indexOf(Number(btn.dataset.g)), j = i + Number(btn.dataset.d); if (j < 0 || j >= ids.length) return; [ids[i], ids[j]] = [ids[j], ids[i]]; try { PJ = await PUT(`/api/projects/${PJ.id}/groups-order`, { ids }); render(); } catch (e) { toast(e.message, true); } },
  'w-close': () => openModal(`${mh('Đóng ' + KIND[PJ.kind].toLowerCase(), esc(PJ.name))}<div class="modal-b"><div class="field"><label for="pc-r">Kết quả</label><select id="pc-r">${Object.entries(CLOSE_RES).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div>
    <div class="field"><label for="pc-n">Ghi chú, nguyên nhân</label><textarea id="pc-n"></textarea></div><p class="hint">Sau khi đóng không thể thêm, sửa công việc cho đến khi mở lại.</p><p class="err" id="pc-err" hidden></p></div>
    <div class="modal-f"><button class="btn" data-act="close">Hủy</button><button class="btn primary" data-act="pc-go">Đóng</button></div>`, {
    'pc-go': b2 => busy(b2, async () => { try { PJ = await POST(`/api/projects/${PJ.id}/close`, { result: $('#pc-r').value, note: $('#pc-n').value }); closeModal(); await refreshBoot(); toast('Đã đóng'); render(); } catch (e) { showErr('#pc-err', e); } }) }),
  'w-reopen': () => openModal(`${mh('Mở lại ' + KIND[PJ.kind].toLowerCase(), esc(PJ.name))}<div class="modal-b"><div class="field"><label for="po-h">Tình trạng</label><select id="po-h">${Object.entries(HEALTH).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div>
    <div class="field"><label for="po-n">Ghi chú</label><textarea id="po-n"></textarea></div><p class="err" id="po-err" hidden></p></div>
    <div class="modal-f"><button class="btn" data-act="close">Hủy</button><button class="btn primary" data-act="po-go">Mở lại</button></div>`, {
    'po-go': b2 => busy(b2, async () => { try { PJ = await POST(`/api/projects/${PJ.id}/reopen`, { health: $('#po-h').value, note: $('#po-n').value }); closeModal(); await refreshBoot(); toast('Đã mở lại'); render(); } catch (e) { showErr('#po-err', e); } }) }),
  'w-pdel': () => openModal(`${mh('Xóa ' + KIND[PJ.kind].toLowerCase(), esc(PJ.name))}<div class="modal-b"><p class="notice">Thao tác này xóa vĩnh viễn ${KIND[PJ.kind].toLowerCase()} và toàn bộ ${PJ.stats.total || 0} công việc bên trong, không khôi phục được.</p>
    <div class="field"><label for="pd-n">Nhập đúng tên “${esc(PJ.name)}” để xác nhận</label><input id="pd-n" autocomplete="off"></div><p class="err" id="pd-err" hidden></p></div>
    <div class="modal-f"><button class="btn" data-act="close">Hủy</button><button class="btn danger" data-act="pd-go">Xóa vĩnh viễn</button></div>`, {
    'pd-go': b2 => busy(b2, async () => { if ($('#pd-n').value.trim() !== PJ.name) return showErr('#pd-err', 'Tên nhập chưa khớp.'); try { await DEL('/api/projects/' + PJ.id); closeModal(); await refreshBoot(); toast('Đã xóa'); go({ tab: 'projects' }); } catch (e) { showErr('#pd-err', e); } }) })
});
async function quickAdd(gid) {
  const inp = $(`[data-wqadd="${gid}"]`), title = inp && inp.value.trim(); if (!title) return inp && inp.focus();
  try { await POST('/api/tasks', { project_id: PJ.id, group_id: gid ? Number(gid) : null, title, assignee_id: B().me.id, due_date: addDays(TODAY(), 3) }); toast('Đã thêm công việc'); await render(); refreshBoot(); const n = $(`[data-wqadd="${gid}"]`); if (n) n.focus(); }
  catch (e) { toast(e.message, true); }
}
document.addEventListener('click', e => {
  const t = e.target.closest('[data-wtab],[data-wscope],[data-wpst],[data-wv],[data-wstaff]'); if (!t) return;
  if (t.dataset.wtab) go(t.dataset.wtab === 'mine' ? {} : { tab: t.dataset.wtab });
  else if (t.dataset.wscope) { homeScope = t.dataset.wscope; render(); }
  else if (t.dataset.wpst) { projStatus = t.dataset.wpst; render(); }
  else if (t.dataset.wv) go({ p: PJ.id, v: t.dataset.wv });
  else if (t.dataset.wstaff) staffList(Number(t.dataset.wstaff));
});
async function staffList(uid) {
  const d = await GET('/api/tasks?' + new URLSearchParams({ scope: 'staff', assignee: uid, status: 'open' }));
  const box = $('#w-staff-list'); if (!box) return;
  box.innerHTML = `<section class="card"><div class="card-h"><h2>Việc chưa kết thúc của ${esc(U(uid).full_name)} (${d.total})</h2></div>${d.rows.length ? `<div class="tbl-wrap"><table class="tbl w-tbl">${tableHead}<tbody>${d.rows.map(t => taskRow(t, { project: true })).join('')}</tbody></table></div>` : '<div class="empty">Không có việc chưa kết thúc.</div>'}</section>`;
}
document.addEventListener('change', e => { if (e.target.dataset && e.target.dataset.wcl && clToggle && e.target.closest('#modal')) clToggle(e.target); });
document.addEventListener('change', e => { if (e.target.id !== 'tk-file') return; const box = e.target.closest('.w-fadd'), sum = box && box.querySelector('.w-fsum'); if (sum) sum.textContent = Array.from(e.target.files || []).map(f => `${f.name} (${fmtSize(f.size)})`).join('; ') || 'Chưa chọn tệp.'; });
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const q = e.target.closest && e.target.closest('[data-wqadd]'); if (q) { e.preventDefault(); quickAdd(q.dataset.wqadd); return; }
  const map = { 'tk-cl': 'tk-cladd', 'tk-cm': 'tk-cmadd', 'tk-rn': 'tk-res' }; const act = map[e.target.id];
  if (act) { e.preventDefault(); const b = $(`[data-act="${act}"]`); if (b) b.click(); }
});
Object.assign(SO, { openTask, newTask, newProject });
})();
