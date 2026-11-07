/* SmartOffice — Phân hệ Công việc – Dự án: giao diện các chức năng bổ sung đầy đủ theo Base Wework.
 * Căn cứ: docs/05-ra-soat/2026-11-06-DOI-CHIEU-BASE-WEWORK.md; ADR-007. Nạp sau public/work.js, dùng điểm mở rộng SO.W.
 * Nội dung: trường tùy chỉnh (tạo, chi tiết), thanh công cụ chi tiết công việc, thanh thông tin dự án, Thảo luận, Tài liệu, Hoạt động,
 * Phân quyền sử dụng, Trường dữ liệu tùy chỉnh, Nhập & Xuất Excel, Mẫu dự án, Cài đặt nâng cao, Tùy chọn khác (nhân bản, lưu mẫu...),
 * Thành viên và báo cáo cá nhân, Báo cáo hệ thống, Quản trị (quyền tạo, mẫu, tác vụ hàng loạt). */
(function () {
'use strict';
const SO = window.SO, W = SO && SO.W; if (!W) return;
const { $, $$, esc, fmtD, fmtDT, GET, POST, PUT, DEL, U, av, who, userOpts, openModal, closeModal, toast, showErr, mh, busy, armed, render, refreshBoot, TODAY, addDays, dayNum, pad, PRIO, debounce } = SO;
const B = () => SO.B;
const X = () => window.XLSX_LITE;
const FM = () => window.WorkFormula;
const nf = (v, d = 2) => (v === null || v === undefined || v === '' ? '' : Number(v).toLocaleString('vi-VN', { maximumFractionDigits: d }));
const pct = (a, b) => (b ? Math.round(a / b * 1000) / 10 : 0);
const LOGP = { post: 'thêm thảo luận', file: 'tải lên tài liệu', file_del: 'xóa tài liệu', field: 'cập nhật trường tùy chỉnh', template: 'tạo mẫu', clone: 'nhân bản', import: 'nhập/cập nhật từ Excel', member: 'thay đổi thành viên' };
const LOGT = { create: 'tạo công việc', update: 'cập nhật', start: 'bắt đầu thực hiện', todo: 'chuyển về Cần làm', reopen: 'mở lại', done: 'hoàn thành', submit_review: 'gửi đánh giá', approve: 'duyệt hoàn thành', return: 'trả lại', failed: 'đánh dấu thất bại', result: 'cập nhật kết quả', followers: 'thêm người theo dõi', clone: 'nhân bản', shift: 'tự động dời lịch', dep: 'thiết lập phụ thuộc', dep_del: 'gỡ phụ thuộc', file: 'đính kèm', file_del: 'gỡ tệp' };
const userName = id => (U(id) || {}).full_name || '';
const dlName = s => String(s || 'du-lieu').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^\w-]+/g, '-').slice(0, 60);

/* ============ Trường dữ liệu tùy chỉnh: ô nhập và hiển thị ============ */
function fieldInput(f, v, opt = {}) {
  const id = `cf-${opt.prefix || ''}${f.id}`, req = f.required ? ' <span class="late" aria-hidden="true">*</span>' : '', dis = opt.disabled ? 'disabled' : '';
  const lab = `<label for="${id}">${esc(f.name)}${req}</label>`, help = f.description ? `<span class="t-sub">${esc(f.description)}</span>` : '';
  const attr = `id="${id}" data-cf="${f.id}" data-cft="${f.type}" ${dis} ${f.required ? 'aria-required="true"' : ''}`;
  switch (f.type) {
    case 'heading': return `<div class="field full"><h4 class="w-cfh">${esc(f.name)}</h4>${help}</div>`;
    case 'int': case 'float': return `<div class="field">${lab}<input type="number" ${attr} step="${f.type === 'int' ? 1 : 'any'}" value="${v ?? ''}">${help}</div>`;
    case 'text': return `<div class="field">${lab}<input ${attr} maxlength="500" value="${esc(v ?? '')}">${help}</div>`;
    case 'textarea': return `<div class="field full">${lab}<textarea ${attr} rows="3">${esc(v ?? '')}</textarea>${help}</div>`;
    case 'date': return `<div class="field">${lab}<input type="date" ${attr} value="${v || ''}">${help}</div>`;
    case 'datetime': return `<div class="field">${lab}<input type="datetime-local" ${attr} value="${v || ''}">${help}</div>`;
    case 'select': return `<div class="field">${lab}<select ${attr}><option value="">Chưa chọn</option>${(f.options.choices || []).map(c => `<option ${c === v ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>${help}</div>`;
    case 'mselect': return `<div class="field">${lab}<select ${attr} multiple size="${Math.min(5, (f.options.choices || []).length)}">${(f.options.choices || []).map(c => `<option ${(v || []).includes(c) ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select><span class="t-sub">Giữ Ctrl để chọn nhiều.</span>${help}</div>`;
    case 'checkbox': return `<div class="field"><span class="lbl">${esc(f.name)}</span><label class="check"><input type="checkbox" ${attr} ${v ? 'checked' : ''}> Có</label>${help}</div>`;
    case 'formula': return `<div class="field"><span class="lbl">${esc(f.name)}</span><div class="num w-cfv">${v === null || v === undefined ? (opt.create ? '<span class="t-sub">Tự tính sau khi lưu</span>' : '—') : nf(v, f.options.decimals ?? 2)}</div><span class="t-sub">= ${esc(f.options.formula)}</span></div>`;
    case 'file': return opt.create ? `<div class="field"><span class="lbl">${esc(f.name)}</span><span class="t-sub">Tải tệp sau khi tạo công việc, trong chi tiết công việc.</span></div>`
      : `<div class="field"><span class="lbl">${esc(f.name)}</span><div class="w-files">${(v || []).map(x => `<a href="/api/task-files/${x.id}" download>📎 ${esc(x.file_name)}</a>`).join('') || '<span class="hint">Chưa có tệp.</span>'}</div>
        ${opt.disabled ? '' : `<label class="btn sm w-filepick">Tải tệp…<input type="file" data-cffile="${f.id}" aria-label="Tải tệp cho ${esc(f.name)}"></label>`}</div>`;
    case 'table': {
      const cols = f.options.columns || [], rows = (v && v.rows) || (Array.isArray(v) ? v : []), sums = (v && v.sums) || {};
      const cell = (c, val, ri) => c.type === 'formula' ? `<td class="num">${nf(val)}</td>` : `<td>${c.type === 'select' ? `<select data-cfr="${f.id}" data-ri="${ri}" data-ck="${c.key}" ${dis} aria-label="${esc(c.name)}"><option value=""></option>${(c.choices || []).map(x => `<option ${x === val ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>`
        : `<input data-cfr="${f.id}" data-ri="${ri}" data-ck="${c.key}" ${dis} aria-label="${esc(c.name)}" type="${c.type === 'int' || c.type === 'float' ? 'number' : c.type === 'date' ? 'date' : c.type === 'datetime' ? 'datetime-local' : 'text'}" ${c.type === 'float' ? 'step="any"' : ''} value="${esc(Array.isArray(val) ? val.join(', ') : val ?? '')}">`}</td>`;
      const body = (rows.length ? rows : (opt.disabled ? [] : [{}])).map((r, ri) => `<tr>${cols.map(c => cell(c, r[c.key], ri)).join('')}${opt.disabled ? '' : `<td><button class="btn ghost sm" data-act="cf-rowdel" data-f="${f.id}" data-ri="${ri}" aria-label="Xóa dòng">×</button></td>`}</tr>`).join('');
      const foot = cols.some(c => c.sum) ? `<tfoot><tr>${cols.map(c => `<td class="num"><b>${c.sum ? nf(sums[c.key]) : ''}</b></td>`).join('')}${opt.disabled ? '' : '<td></td>'}</tr></tfoot>` : '';
      return `<div class="field full"><span class="lbl">${esc(f.name)}${req}</span><div class="tbl-wrap"><table class="tbl w-cft" data-cftable="${f.id}"><thead><tr>${cols.map(c => `<th style="width:${c.width * 10}%">${esc(c.name)}${c.required ? ' *' : ''}</th>`).join('')}${opt.disabled ? '' : '<th></th>'}</tr></thead><tbody>${body || `<tr><td colspan="${cols.length}" class="hint">Chưa có dữ liệu.</td></tr>`}</tbody>${foot}</table></div>
        ${opt.disabled ? '' : `<button class="btn ghost sm" data-act="cf-rowadd" data-f="${f.id}">+ Thêm dòng</button>`}${help}</div>`;
    }
  }
  return '';
}
function collectFields(root, fields) {
  const out = {};
  for (const f of fields) {
    if (['heading', 'formula', 'file'].includes(f.type)) continue;
    if (f.type === 'table') {
      const rows = {}; root.querySelectorAll(`[data-cfr="${f.id}"]`).forEach(el => { const ri = el.dataset.ri; (rows[ri] = rows[ri] || {})[el.dataset.ck] = el.value; });
      out[f.id] = Object.values(rows).filter(r => Object.values(r).some(x => x !== '')).map(r => { const o = {}; for (const c of f.options.columns) if (r[c.key] !== undefined) o[c.key] = c.type === 'mselect' ? r[c.key].split(',').map(x => x.trim()).filter(Boolean) : r[c.key]; return o; });
      continue;
    }
    const el = root.querySelector(`[data-cf="${f.id}"]`); if (!el) continue;
    out[f.id] = f.type === 'checkbox' ? el.checked : f.type === 'mselect' ? Array.from(el.selectedOptions).map(o => o.value) : el.value;
  }
  return out;
}
function tableAddRow(fid) {
  const tb = $(`[data-cftable="${fid}"] tbody`); if (!tb) return;
  const first = tb.querySelector('tr'); if (!first || !first.querySelector('[data-cfr]')) return;
  const ri = tb.querySelectorAll('tr').length, tr = first.cloneNode(true);
  tr.querySelectorAll('[data-cfr]').forEach(el => { el.dataset.ri = ri; el.value = ''; }); tr.querySelectorAll('td.num').forEach(td => { td.textContent = ''; });
  const del = tr.querySelector('[data-act="cf-rowdel"]'); if (del) del.dataset.ri = ri;
  tb.appendChild(tr);
}
/* Tạo công việc: ô nhập trường tùy chỉnh */
W.NTF.push(P => (P.fields || []).length ? `<div class="field full"><h3 class="sec-t">Trường dữ liệu tùy chỉnh</h3></div>${P.fields.map(f => fieldInput(f, null, { create: true, prefix: 'n' })).join('')}` : '');
W.NTC.push((body, P) => { if (!(P.fields || []).length) return; body.fields = collectFields($('#modal'), P.fields);
  for (const f of P.fields) if (f.required && !['heading', 'formula', 'file'].includes(f.type)) { const v = body.fields[f.id]; if (v === '' || v === undefined || (Array.isArray(v) && !v.length)) return `Vui lòng nhập trường bắt buộc “${f.name}”.`; } });
/* Chi tiết công việc: trường tùy chỉnh */
W.TSECT.push(t => {
  if (!(t.fields || []).length) return '';
  const dis = !t.can.editInfo;
  return `<h3 class="sec-t">Trường dữ liệu tùy chỉnh</h3><div class="form w-cfform">${t.fields.map(f => fieldInput(f, t.field_values[f.id], { disabled: dis && f.type !== 'file' ? true : dis })).join('')}</div>
    ${dis ? '' : '<div class="actions"><button class="btn sm primary" data-act="cf-save">Lưu trường tùy chỉnh</button></div>'}`;
});
W.THAND['cf-save'] = (btn, ctx) => busy(btn, async () => { try { await ctx.after(await PUT(`/api/tasks/${ctx.t.id}/fields`, { values: collectFields($('#modal'), ctx.t.fields) })); toast('Đã lưu trường tùy chỉnh'); } catch (e) { ctx.err(e); } });
W.THAND['cf-rowadd'] = btn => tableAddRow(btn.dataset.f);
W.THAND['cf-rowdel'] = btn => { const tr = btn.closest('tr'), tb = tr.parentNode; if (tb.querySelectorAll('tr').length > 1) tr.remove(); else tr.querySelectorAll('input,select').forEach(x => { x.value = ''; }); };
SO.ACTIONS['cf-rowadd'] = btn => tableAddRow(btn.dataset.f);
SO.ACTIONS['cf-rowdel'] = btn => W.THAND['cf-rowdel'](btn);
document.addEventListener('change', async e => {
  const inp = e.target.closest && e.target.closest('[data-cffile]'); if (!inp || !inp.files[0]) return;
  const f = inp.files[0], tid = Number(($('#modal .modal-b') || {}).dataset ? $('#modal .modal-b').dataset.wtask : 0); if (!tid) return;
  if (f.size > W.FILE_MAX) return toast(`Tệp “${f.name}” vượt quá 10 MB.`, true);
  try { await POST(`/api/tasks/${tid}/files`, { field_id: Number(inp.dataset.cffile), file_name: f.name, file_mime: f.type, file_data: await W.readB64(f) }); toast('Đã tải tệp'); W.openTask(tid); } catch (er) { toast(er.message, true); }
});

/* ============ Chi tiết công việc: đánh dấu, lịch, nhân bản sang dự án khác ============ */
const gcal = t => { const d = (t.due_date || t.start_date || TODAY()).replace(/-/g, ''), dates = t.due_time ? `${d}T${t.due_time.replace(':', '')}00/${d}T${t.due_time.replace(':', '')}00` : `${d}/${(addDays(t.due_date || t.start_date || TODAY(), 1)).replace(/-/g, '')}`;
  return 'https://calendar.google.com/calendar/render?' + new URLSearchParams({ action: 'TEMPLATE', text: t.title, dates, details: (t.description || '').slice(0, 800) + `\n\nSmartOffice – công việc #${t.id}`, ctz: 'Asia/Ho_Chi_Minh' }); };
W.THEAD.push(t => `<button class="btn ghost sm ${t.marked ? 'on' : ''}" data-act="tk-mark" aria-pressed="${!!t.marked}" title="${t.marked ? 'Bỏ đánh dấu' : 'Đánh dấu để theo dõi riêng'}">${t.marked ? '★ Đã đánh dấu' : '☆ Đánh dấu'}</button>
  <a class="btn ghost sm" href="${esc(gcal(t))}" target="_blank" rel="noopener noreferrer" title="Mở Google Calendar để thêm công việc">📅 Thêm vào Google Calendar</a>
  <a class="btn ghost sm" href="/api/tasks/${t.id}/ics" download title="Tải tệp lịch dùng cho iCalendar, Outlook">⬇ iCalendar (.ics)</a>
  ${t.project.status !== 'closed' ? '<button class="btn ghost sm" data-act="tk-cloneto">Nhân bản sang dự án khác</button>' : ''}`);
W.THAND['tk-mark'] = (btn, ctx) => busy(btn, async () => { try { await POST(`/api/tasks/${ctx.t.id}/mark`, { on: !ctx.t.marked }); await ctx.reload(); toast(ctx.t.marked ? 'Đã đánh dấu công việc' : 'Đã bỏ đánh dấu'); } catch (e) { ctx.err(e); } });
W.THAND['tk-cloneto'] = async (btn, ctx) => {
  const t = ctx.t; let list = [];
  try { list = (await GET('/api/projects')).filter(p => p.status !== 'closed' && p.id !== t.project.id); } catch (e) { return ctx.err(e); }
  openModal(`${mh('Nhân bản công việc sang dự án khác', esc(t.title))}<div class="modal-b"><div class="form">
    <div class="field full"><label for="ct-p">Chọn phòng ban hoặc dự án</label><select id="ct-p">${list.map(p => `<option value="${p.id}">${esc(p.name)} (${W.KIND[p.kind]})</option>`).join('') || '<option value="">Không có dự án/phòng ban phù hợp</option>'}</select></div>
    <div class="field"><label for="ct-g">Nhóm công việc</label><select id="ct-g"><option value="">Chưa phân loại</option></select></div>
    <div class="field"><label for="ct-d">Thời hạn của công việc</label><input type="date" id="ct-d" value="${t.due_date || ''}"></div>
    <div class="field full w-sets"><label class="check"><input type="checkbox" id="ct-sub" checked> Giữ lại công việc con</label><label class="check"><input type="checkbox" id="ct-scl" checked> Giữ lại checklist của công việc con</label><label class="check"><input type="checkbox" id="ct-sdl"> Giữ lại thời hạn của công việc con</label></div>
  </div><p class="err" id="ct-err" hidden></p></div><div class="modal-f"><button class="btn" data-act="ct-back">Quay lại</button><button class="btn primary" data-act="ct-go" ${list.length ? '' : 'disabled'}>Nhân bản công việc</button></div>`, {
    'ct-back': () => ctx.draw(),
    'ct-go': b2 => busy(b2, async () => { try { const n = await POST(`/api/tasks/${t.id}/clone-to`, { project_id: Number($('#ct-p').value), group_id: $('#ct-g').value || null, due_date: $('#ct-d').value || null, keep_subtasks: $('#ct-sub').checked, keep_sub_checklist: $('#ct-scl').checked, keep_sub_deadline: $('#ct-sdl').checked });
      toast(`Đã nhân bản sang “${n.project.name}”`); W.openTask(n.id); } catch (e) { showErr('#ct-err', e); } })
  });
  const loadG = async () => { const id = $('#ct-p').value; if (!id) return; try { const P = await GET('/api/projects/' + id); $('#ct-g').innerHTML = `<option value="">Chưa phân loại</option>${P.groups.filter(g => !g.closed).map(g => `<option value="${g.id}">${esc(g.name)}</option>`).join('')}`; } catch (e) {} };
  $('#ct-p').onchange = loadG; loadG();
};

/* ============ Thanh thông tin dự án (hình minh họa bài 63000266408) ============ */
W.sidebar = async (P, el) => {
  if (!el) return;
  const s = P.stats, p = s.total ? Math.round((s.done || 0) / s.total * 100) : 0;
  el.innerHTML = `<section class="card w-sidec"><h3>${esc(P.name)}</h3><p class="t-sub">${esc(P.description || 'Chưa có mô tả')}</p>
    <div class="w-side-r"><span>${s.done || 0}/${s.total || 0} hoàn thành</span><b class="num">${p}%</b></div><div class="prog ${p >= 70 ? 'ok' : ''}"><i style="width:${p}%"></i></div>
    ${P.kind === 'project' ? `<div class="t-sub">${P.start_date ? fmtD(P.start_date) : '—'} → ${P.end_date ? fmtD(P.end_date) : '—'}</div>` : ''}
    ${P.dept_name ? `<div class="t-sub">Department: ${esc(P.dept_name)}</div>` : ''}
    <div class="t-sub">${P.members.filter(m => m.role !== 'follower').length} thành viên</div><div class="w-avs">${P.members.filter(m => m.role !== 'follower').slice(0, 10).map(m => av(m.user_id)).join('')}</div>
    <div class="t-sub">Trạng thái: <b>${P.status === 'closed' ? 'Đã đóng' : W.HEALTH[P.health] || 'Đúng tiến độ'}</b></div></section>
    <section class="card w-sidec"><h3>Nhóm công việc</h3>${P.groups.filter(g => !g.closed).map(g => `<div class="t-sub">▸ ${esc(g.name)}</div>`).join('') || '<span class="hint">Chưa có nhóm.</span>'}</section>
    <section class="card w-sidec" id="w-side-my"><h3>Công việc của tôi</h3><div class="loading">Đang tải…</div></section>`;
  try {
    const d = await GET(`/api/projects/${P.id}/sidebar`), box = $('#w-side-my'); if (!box) return;
    box.innerHTML = `<h3>Công việc của tôi</h3><div class="w-mystat"><div><b class="num">${d.my.todo || 0}</b><span>Cần làm</span></div><div><b class="num">${d.my.doing || 0}</b><span>Đang làm</span></div><div><b class="num">${d.my.done || 0}</b><span>Hoàn thành</span></div></div>
      ${d.attention.length ? `<h4 class="late">Cần lưu ý</h4>${d.attention.map(t => `<div class="w-sidet" data-task="${t.id}"><span>${esc(t.title)}</span><span class="late num">${fmtD(t.due_date)}</span></div>`).join('')}` : ''}
      ${d.recent.length ? `<h4>Mới được giao</h4>${d.recent.map(t => `<div class="w-sidet" data-task="${t.id}"><span>${esc(t.title)}</span><span class="t-sub">${esc(userName(t.creator_id))}</span></div>`).join('')}` : ''}
      ${(P.milestones || []).length ? `<h4>Mốc dự án</h4>${P.milestones.slice(0, 5).map(m => `<div class="t-sub">◆ ${esc(m.title)} · ${m.done}/${m.total}</div>`).join('')}` : ''}
      ${d.activity.length ? `<h4>Hoạt động gần đây</h4>${d.activity.map(a => `<div class="t-sub">${esc(userName(a.user_id))} ${LOGP[a.action] || esc(a.action)}${a.detail ? ': ' + esc(a.detail) : ''}</div>`).join('')}` : ''}`;
  } catch (e) {}
};

/* ============ Thẻ dự án: Thảo luận, Tài liệu, Hoạt động ============ */
W.PTABS.push({ key: 'discuss', label: 'Thảo luận', show: () => true, render: async (body, P) => {
  const d = await GET(`/api/projects/${P.id}/posts`);
  body.innerHTML = `<section class="card"><div class="card-h"><h2>Thảo luận <span class="muted num">${d.total}</span></h2>${d.can_post ? '<button class="btn primary sm" data-act="ps-new">+ Thêm thảo luận mới</button>' : ''}</div>
    ${d.rows.length ? `<div class="w-posts">${d.rows.map(x => `<div class="w-post" data-act="ps-open" data-id="${x.id}" role="button" tabindex="0">${av(x.user_id)}<div><b>${x.pinned ? '📌 ' : ''}${esc(x.title)}</b><div class="t-sub">${esc(userName(x.user_id))} · ${fmtDT(x.created_at)} · ${x.cm_count} bình luận</div><p class="w-post-b">${esc((x.body || '').slice(0, 220))}</p></div></div>`).join('')}</div>`
      : '<div class="empty">Chưa có thảo luận. Thảo luận dùng để trao đổi chung, thông báo trong dự án/phòng ban.</div>'}</section>`;
} });
SO.ACTIONS['ps-new'] = () => openModal(`${mh('Thêm thảo luận mới', esc(W.pj().name))}<div class="modal-b"><div class="form"><div class="field full"><label for="pn-t">Tiêu đề</label><input id="pn-t" maxlength="200"></div><div class="field full"><label for="pn-b">Nội dung</label><textarea id="pn-b" rows="6"></textarea></div></div><p class="err" id="pn-err" hidden></p></div>
  <div class="modal-f"><button class="btn" data-act="close">Hủy</button><button class="btn primary" data-act="pn-go">Đăng</button></div>`, {
  'pn-go': b => busy(b, async () => { try { await POST(`/api/projects/${W.pj().id}/posts`, { title: $('#pn-t').value, body: $('#pn-b').value }); closeModal(); toast('Đã đăng thảo luận'); render(); } catch (e) { showErr('#pn-err', e); } }) });
async function openPost(id) {
  let x; try { x = await GET('/api/project-posts/' + id); } catch (e) { return toast(e.message, true); }
  const draw = () => openModal(`${mh(esc(x.title), `${esc(userName(x.user_id))} · ${fmtDT(x.created_at)}`)}<div class="modal-b"><p class="w-post-full">${esc(x.body || '')}</p>
    <h3 class="sec-t">Bình luận (${x.comments.length})</h3><div class="cmts">${x.comments.map(c => `<div class="cmt">${av(c.user_id)}<div><b>${esc(userName(c.user_id))}</b><time>${fmtDT(c.created_at)}</time><p>${esc(c.body)}</p>${c.user_id === B().me.id || x.can_edit ? `<button class="btn ghost sm" data-act="pc-del" data-id="${c.id}">Xóa</button>` : ''}</div></div>`).join('') || '<span class="hint">Chưa có bình luận.</span>'}</div>
    <div class="inline-add"><input id="pc-b" placeholder="Viết bình luận…" aria-label="Viết bình luận"><button class="btn sm" data-act="pc-add">Gửi</button></div><p class="err" id="pc-err" hidden></p></div>
    <div class="modal-f">${x.can_edit ? '<button class="btn danger" data-act="po-del" style="margin-right:auto">Xóa thảo luận</button>' : ''}${x.can_edit && W.pj() && W.pj().can_manage ? `<button class="btn" data-act="po-pin">${x.pinned ? 'Bỏ ghim' : 'Ghim lên đầu'}</button>` : ''}<button class="btn" data-act="close">Đóng</button></div>`, {
    'pc-add': b => busy(b, async () => { const v = $('#pc-b').value.trim(); if (!v) return; try { x = await POST(`/api/project-posts/${x.id}/comments`, { body: v }); draw(); } catch (e) { showErr('#pc-err', e); } }),
    'pc-del': async b => { if (!armed(b, 'Xóa?')) return; try { await DEL('/api/post-comments/' + b.dataset.id); x = await GET('/api/project-posts/' + x.id); draw(); } catch (e) { showErr('#pc-err', e); } },
    'po-pin': b => busy(b, async () => { try { x = await PUT('/api/project-posts/' + x.id, { pinned: !x.pinned }); draw(); render(); } catch (e) { showErr('#pc-err', e); } }),
    'po-del': async b => { if (!armed(b, 'Xóa thảo luận? Bấm lần nữa')) return; try { await DEL('/api/project-posts/' + x.id); closeModal(); toast('Đã xóa thảo luận'); render(); } catch (e) { showErr('#pc-err', e); } } });
  draw();
}
SO.ACTIONS['ps-open'] = el => openPost(Number(el.dataset.id));
W.PTABS.push({ key: 'docs', label: 'Tài liệu', show: () => true, render: async (body, P) => {
  const d = await GET(`/api/projects/${P.id}/files`);
  body.innerHTML = `<section class="card"><div class="card-h"><h2>Tài liệu của ${W.KIND[P.kind].toLowerCase()} <span class="muted num">${d.files.length}</span></h2></div>
    ${d.can_upload ? `<div class="inline-add w-fadd" style="padding:0 14px 10px"><label class="btn sm w-filepick">Chọn tệp…<input type="file" id="pf-f" multiple aria-label="Chọn tài liệu tải lên"></label><input id="pf-folder" placeholder="Thư mục (không bắt buộc)" aria-label="Thư mục" style="max-width:220px"><button class="btn sm primary" data-act="pf-up">Tải lên</button></div>` : ''}
    ${d.files.length ? `<div class="tbl-wrap"><table class="tbl w-tbl"><thead><tr><th>Tài liệu</th><th>Người tải lên</th><th>Ngày</th><th></th></tr></thead><tbody>${d.files.map(f => `<tr><td>${f.folder ? `<span class="tag">${esc(f.folder)}</span> ` : ''}<a href="/api/project-files/${f.id}" download>${esc(f.file_name)}</a> <span class="t-sub">${W.fmtSize(f.file_size)}</span></td><td>${who(f.uploaded_by)}</td><td class="num">${fmtD(f.created_at.slice(0, 10))}</td>
      <td class="r">${f.uploaded_by === B().me.id || P.can_manage ? `<button class="btn ghost sm" data-act="pf-del" data-id="${f.id}" aria-label="Xóa ${esc(f.file_name)}">Xóa</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Chưa có tài liệu chung.</div>'}</section>
    <section class="card"><div class="card-h"><h2>Tệp đính kèm trong công việc <span class="muted num">${d.task_files.length}</span></h2></div>
    ${d.task_files.length ? `<div class="tbl-wrap"><table class="tbl w-tbl"><thead><tr><th>Tệp</th><th>Công việc</th><th>Ngày</th></tr></thead><tbody>${d.task_files.map(f => `<tr><td>${f.kind === 'doc' ? `<span class="tag">Tài liệu</span> <a href="/api/docs/${f.doc_id}/file" download>${esc(f.file_name || 'Tài liệu')}</a>` : `<a href="/api/task-files/${f.id}" download>${esc(f.file_name)}</a> <span class="t-sub">${W.fmtSize(f.file_size)}</span>`}</td><td><span class="w-link" role="button" tabindex="0" data-task="${f.task_id}">${esc(f.task_title)}</span></td><td class="num">${fmtD(f.created_at.slice(0, 10))}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Chưa có tệp đính kèm.</div>'}</section>`;
} });
SO.ACTIONS['pf-up'] = btn => busy(btn, async () => { const fs = Array.from(($('#pf-f') || {}).files || []); if (!fs.length) return toast('Vui lòng chọn tệp.', true); let ok = 0;
  for (const f of fs) { if (f.size > W.FILE_MAX) { toast(`“${f.name}” vượt quá 10 MB.`, true); continue; } try { await POST(`/api/projects/${W.pj().id}/files`, { file_name: f.name, file_mime: f.type, file_data: await W.readB64(f), folder: $('#pf-folder').value }); ok++; } catch (e) { toast(e.message, true); } }
  if (ok) toast(`Đã tải lên ${ok} tài liệu`); render(); });
SO.ACTIONS['pf-del'] = async btn => { if (!armed(btn, 'Xóa?')) return; try { await DEL('/api/project-files/' + btn.dataset.id); toast('Đã xóa tài liệu'); render(); } catch (e) { toast(e.message, true); } };
let actOff = 0;
W.PTABS.push({ key: 'activity', label: 'Hoạt động', show: () => true, render: async (body, P) => {
  const rows = await GET(`/api/projects/${P.id}/activity?offset=${actOff}`);
  body.innerHTML = `<section class="card"><div class="card-h"><h2>Hoạt động</h2><div class="actions">${actOff ? '<button class="btn sm" data-act="ac-prev">‹ Mới hơn</button>' : ''}${rows.length === 50 ? '<button class="btn sm" data-act="ac-next">Cũ hơn ›</button>' : ''}</div></div>
    ${rows.length ? `<div class="w-acts">${rows.map(a => `<div class="w-act">${av(a.user_id)}<div><b>${esc(userName(a.user_id))}</b> ${(a.src === 'task' ? LOGT : LOGP)[a.action] || esc(a.action)}${a.task_id ? ` <span class="w-link" role="button" tabindex="0" data-task="${a.task_id}">${esc(a.task_title)}</span>` : ''}${a.detail ? `<span class="t-sub">: ${esc(a.detail)}</span>` : ''}<div class="t-sub">${fmtDT(a.created_at)}</div></div></div>`).join('')}</div>` : '<div class="empty">Chưa có hoạt động.</div>'}</section>`;
} });
SO.ACTIONS['ac-next'] = () => { actOff += 50; render(); };
SO.ACTIONS['ac-prev'] = () => { actOff = Math.max(0, actOff - 50); render(); };

/* ============ Biểu đồ SVG dùng chung (chỉ biến màu, có tiêu đề cho trình đọc màn hình) ============ */
function lineChart(series, keys, title) {
  if (!series.length) return '<div class="empty">Chưa có dữ liệu.</div>';
  const Wd = 640, Hd = 200, pl = 34, pb = 22, mx = Math.max(1, ...series.flatMap(s => keys.map(k => s[k.k] || 0)));
  const x = i => pl + (series.length < 2 ? 0 : i * (Wd - pl - 8) / (series.length - 1)), y = v => 8 + (Hd - pb - 8) * (1 - v / mx);
  const grid = [0, .5, 1].map(f => `<line x1="${pl}" x2="${Wd - 8}" y1="${y(mx * f)}" y2="${y(mx * f)}" class="w-ch-grid"/><text x="${pl - 6}" y="${y(mx * f) + 4}" class="w-ch-ax" text-anchor="end">${Math.round(mx * f)}</text>`).join('');
  const step = Math.max(1, Math.ceil(series.length / 8));
  const xl = series.map((s, i) => i % step ? '' : `<text x="${x(i)}" y="${Hd - 6}" class="w-ch-ax" text-anchor="middle">${fmtD(s.d || s.from).slice(0, 5)}</text>`).join('');
  const lines = keys.map(k => `<polyline fill="none" stroke="${k.c}" stroke-width="2" points="${series.map((s, i) => `${x(i)},${y(s[k.k] || 0)}`).join(' ')}"><title>${esc(k.l)}</title></polyline>`).join('');
  return `<figure class="w-chart"><svg viewBox="0 0 ${Wd} ${Hd}" role="img" aria-label="${esc(title)}">${grid}${xl}${lines}</svg>
    <figcaption class="w-legend">${keys.map(k => `<span><i style="background:${k.c}"></i>${esc(k.l)}</span>`).join('')}</figcaption></figure>`;
}
const hbars = (rows, lab, val, tot) => { const mx = Math.max(1, ...rows.map(r => tot ? r[tot] : r[val])); return rows.length ? `<div class="w-hbars">${rows.map(r => `<div class="w-hbar"><span class="w-hbar-l" title="${esc(lab(r))}">${esc(lab(r))}</span><span class="bar"><i class="b-open" style="width:${(r[val] || 0) / mx * 100}%"></i></span><b class="num">${nf(r[val] || 0)}${tot ? '/' + nf(r[tot] || 0) : ''}</b></div>`).join('')}</div>` : '<div class="empty">Chưa có dữ liệu.</div>'; };
const stat = (k, v, s, alert) => `<div class="card stat${alert ? ' alert' : ''}"><span class="k">${k}</span><span class="v num">${nf(v || 0, 1)}</span>${s ? `<span class="s">${s}</span>` : ''}</div>`;
const C = { a: 'var(--accent)', ok: 'var(--ok)', bad: 'var(--bad)', warn: 'var(--warn)', info: 'var(--info)' };
const rangeBar = (q, extra = '') => `<div class="toolbar w-rbar"><label class="t-sub" for="rp-basis">Căn cứ</label><select class="sel" id="rp-basis"><option value="created">Ngày tạo</option><option value="due" ${q.get('basis') === 'due' ? 'selected' : ''}>Thời hạn</option></select>
  <label class="t-sub" for="rp-from">Từ</label><input type="date" class="sel" id="rp-from" value="${q.get('from') || addDays(TODAY(), -30)}"><label class="t-sub" for="rp-to">đến</label><input type="date" class="sel" id="rp-to" value="${q.get('to') || TODAY()}">${extra}<button class="btn sm" data-act="rp-apply">Xem</button></div>`;
SO.ACTIONS['rp-apply'] = () => { const q = W.qp(); q.set('basis', $('#rp-basis').value); q.set('from', $('#rp-from').value); q.set('to', $('#rp-to').value);
  for (const id of ['rp-dept', 'rp-st', 'rp-pj', 'rp-sub']) { const el = $('#' + id); if (el) { const v = el.type === 'checkbox' ? (el.checked ? '1' : '') : el.value; if (v) q.set(id.slice(3), v); else q.delete(id.slice(3)); } }
  W.go(Object.fromEntries(q)); };
const rq = q => new URLSearchParams(['basis', 'from', 'to', 'dept', 'st', 'pj', 'sub'].filter(k => q.get(k)).map(k => [k === 'st' ? 'status' : k === 'pj' ? 'project' : k, q.get(k)])).toString();

/* ============ Trang chính: Thành viên – báo cáo cá nhân (Base bài 63000271837, 63000252592, 63000254750) ============ */
W.HOME.push({ key: 'members', label: 'Thành viên', show: () => true, render: async (main, head) => {
  const q = W.qp(), me = B().me.id, mid = Number(q.get('m')) || me;
  const [list, R] = await Promise.all([GET('/api/work/members' + (q.get('mq') ? '?q=' + encodeURIComponent(q.get('mq')) : '')), GET(`/api/work/members/${mid}/report?${rq(q)}`)]);
  const s = R.summary || {}, pdone = pct(s.done || 0, s.total || 0);
  main.innerHTML = `${head}<div class="w-mlayout"><aside class="card w-mlist" aria-label="Danh sách thành viên"><div class="card-h"><h2>Thành viên <span class="muted num">${list.length}</span></h2></div>
    <div style="padding:0 12px 8px"><input class="search" id="w-mq" placeholder="Tìm thành viên…" aria-label="Tìm thành viên" value="${esc(q.get('mq') || '')}"></div>
    ${list.map(u => `<a class="w-mrow" href="#cong-viec?tab=members&m=${u.id}" ${u.id === mid ? 'aria-current="page"' : ''}>${av(u.id)}<span><b>${esc(u.full_name)}</b><span class="t-sub">${u.open} đang mở · <span class="${u.late ? 'late' : ''}">${u.late} quá hạn</span></span></span></a>`).join('')}</aside>
  <div class="w-mmain"><section class="card"><div class="card-h"><h2>${av(R.user.id)} ${esc(R.user.full_name)} <span class="t-sub">${esc(R.user.title || '')} ${R.user.dept_id ? '· ' + esc(SO.Dp(R.user.dept_id).name) : ''}</span></h2>
    <div class="actions no-print"><button class="btn sm" data-act="mr-xlsx">Xuất Excel</button><button class="btn sm" data-act="mr-print">In báo cáo</button></div></div>
    ${rangeBar(q, `<select class="sel" id="rp-st" aria-label="Lọc trạng thái"><option value="">Mọi trạng thái</option><option value="late" ${q.get('st') === 'late' ? 'selected' : ''}>Quá hạn</option>${Object.entries(W.ST).map(([k, l]) => `<option value="${k}" ${q.get('st') === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <select class="sel" id="rp-pj" aria-label="Lọc dự án"><option value="">Mọi dự án/phòng ban</option>${R.by_project.map(p => `<option value="${p.project_id}" ${q.get('pj') == p.project_id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>`)}
    <p class="t-sub" style="padding:0 16px">Kỳ báo cáo: ${fmtD(R.from)} – ${fmtD(R.to)}</p></section>
    <div class="stats">${stat('Tổng công việc', s.total, `${s.todo || 0} cần làm · ${s.doing || 0} đang làm`)}${stat('Hoàn thành', s.done, `${pdone}% · ${s.done_late || 0} hoàn thành trễ`)}${stat('Quá hạn', s.late, `${s.urgent || 0} việc khẩn cấp đang mở`, s.late)}${stat('Giờ ước lượng', s.est_hours, 'Tổng giờ dự kiến')}</div>
    <section class="card"><div class="card-h"><h2>Biểu đồ tiến độ</h2></div><div class="card-b">${lineChart(R.series, [{ k: 'active', l: 'Đang thực hiện', c: C.a }, { k: 'done', l: 'Đã hoàn thành (tích lũy)', c: C.ok }, { k: 'overdue', l: 'Quá hạn', c: C.bad }], 'Biểu đồ tiến độ công việc của thành viên')}</div></section>
    <div class="grid2"><section class="card"><div class="card-h"><h2>Theo dự án/phòng ban</h2></div><div class="card-b">${hbars(R.by_project, r => r.name, 'n')}</div></section>
      <section class="card"><div class="card-h"><h2>Mục tiêu và mốc dự án</h2></div><div class="card-b">${R.goals.map(g => `<div class="w-side-r"><span>🎯 ${esc(g.title)}</span><b class="num">${g.done || 0}/${g.n}</b></div>`).join('')}${R.milestones.map(m => `<div class="w-side-r"><span>◆ ${esc(m.title)} <span class="t-sub">${m.due_date ? fmtD(m.due_date) : ''}</span></span><b class="num">${m.done || 0}/${m.n}</b></div>`).join('') || '<span class="hint">Chưa có công việc gắn mục tiêu hoặc mốc.</span>'}</div></section></div>
    <section class="card"><div class="card-h"><h2>Danh sách công việc <span class="muted num">${R.tasks.length}${R.tasks.length === 200 ? '+' : ''}</span></h2></div>
      ${R.tasks.length ? `<div class="tbl-wrap"><table class="tbl w-tbl"><thead><tr><th>Công việc</th><th>Dự án/phòng ban</th><th>Trạng thái</th><th>Thời hạn</th></tr></thead><tbody>${R.tasks.map(t => `<tr data-task="${t.id}" tabindex="0"><td>${esc(t.title)}</td><td><span class="w-pdot" style="background:${esc(t.project_color)}"></span> ${esc(t.project_name)}</td><td>${W.pill(t.status)}</td><td class="num ${W.late(t) ? 'late' : ''}">${W.dueTxt(t)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Không có công việc trong kỳ.</div>'}</section>
    ${R.staff.length ? `<section class="card"><div class="card-h"><h2>Nhân viên do ${mid === me ? 'tôi' : esc(R.user.full_name)} quản lý</h2></div><div class="card-b w-avs">${R.staff.map(x => `<a href="#cong-viec?tab=members&m=${x.id}" title="${esc(x.full_name)}">${av(x.id)}</a>`).join('')}</div></section>` : ''}
    ${mid === me ? `<section class="card no-print"><div class="card-h"><h2>Ủy quyền giao việc</h2></div><div class="card-b"><p class="t-sub">Người được ủy quyền có thể tạo công việc với người giao việc là bạn (tối đa 10 người).</p>
      <select id="dl-u" multiple size="5" aria-label="Người được ủy quyền">${B().users.filter(u => u.id !== me).map(u => `<option value="${u.id}" ${R.delegates.includes(u.id) ? 'selected' : ''}>${esc(u.full_name)}</option>`).join('')}</select>
      <div class="actions"><button class="btn sm primary" data-act="dl-save">Lưu ủy quyền</button></div></div></section>` : ''}
  </div></div>`;
  const mq = $('#w-mq'); if (mq) mq.oninput = debounce(() => { const p = Object.fromEntries(W.qp()); p.tab = 'members'; if (mq.value) p.mq = mq.value; else delete p.mq; W.go(p); }, 400);
  W._mr = R;
} });
SO.ACTIONS['mr-print'] = () => window.print();
SO.ACTIONS['dl-save'] = btn => busy(btn, async () => { const ids = Array.from($('#dl-u').selectedOptions).map(o => Number(o.value)); if (ids.length > 10) return toast('Tối đa 10 người được ủy quyền.', true);
  try { await PUT('/api/work/delegations', { delegate_ids: ids }); W.CFG = null; toast('Đã lưu ủy quyền giao việc'); } catch (e) { toast(e.message, true); } });
SO.ACTIONS['mr-xlsx'] = () => { const R = W._mr; if (!R) return; const s = R.summary;
  X().download(X().write([{ name: 'Tổng hợp', header: true, widths: [34, 16], rows: [['Chỉ tiêu', 'Giá trị'], ['Thành viên', R.user.full_name], ['Kỳ báo cáo', `${fmtD(R.from)} – ${fmtD(R.to)}`], ['Tổng công việc', s.total || 0], ['Cần làm', s.todo || 0], ['Đang làm', s.doing || 0], ['Hoàn thành', s.done || 0], ['Hoàn thành trễ hạn', s.done_late || 0], ['Quá hạn', s.late || 0], ['Khẩn cấp đang mở', s.urgent || 0], ['Giờ ước lượng', s.est_hours || 0]] },
    { name: 'Công việc', header: true, widths: [10, 44, 28, 16, 14], rows: [['Mã', 'Công việc', 'Dự án/phòng ban', 'Trạng thái', 'Thời hạn']].concat(R.tasks.map(t => [t.id, t.title, t.project_name, W.ST[t.status], t.due_date ? fmtD(t.due_date) : ''])) },
    { name: 'Tiến độ', header: true, widths: [14, 16, 16, 12], rows: [['Ngày', 'Đang thực hiện', 'Đã hoàn thành', 'Quá hạn']].concat(R.series.map(x => [fmtD(x.d), x.active, x.done, x.overdue])) }]), `bao-cao-${dlName(R.user.full_name)}-${R.to}.xlsx`); };

/* ============ Trang chính: Báo cáo hệ thống (Base bài 63000271457; chỉ quản trị) ============ */
W.HOME.push({ key: 'system', label: 'Báo cáo hệ thống', show: () => !!(W.CFG && W.CFG.is_owner), render: async (main, head) => {
  const q = W.qp(), R = await GET('/api/work/system-report?' + rq(q)), s = R.status || {}, o = R.overview;
  const um = (rows, k, l) => rows.map(r => ({ ...r, _n: userName(r.user_id) }));
  main.innerHTML = `${head}<section class="card"><div class="card-h"><h2>Báo cáo hệ thống</h2><div class="actions"><button class="btn sm" data-act="sr-xlsx">Xuất Excel</button><button class="btn sm" data-act="mr-print">In</button></div></div>
    ${rangeBar(q, `<select class="sel" id="rp-dept" aria-label="Lọc Department"><option value="">Mọi Department</option>${SO.deptOpts(Number(q.get('dept')) || null)}</select><label class="check t-sub"><input type="checkbox" id="rp-sub" ${q.get('sub') ? 'checked' : ''}> Gồm công việc con</label>`)}<p class="t-sub" style="padding:0 16px">Kỳ: ${fmtD(R.from)} – ${fmtD(R.to)}</p></section>
  <h3 class="sec-t">Tổng quan</h3><div class="stats">${stat('Dự án', o.projects.n, `${o.projects.internal || 0} nội bộ · ${o.projects.external || 0} khách hàng`)}${stat('Phòng ban', o.teams.n, `${o.teams.active || 0} hoạt động · ${o.teams.closed || 0} đã đóng`)}${stat('Mốc dự án', o.milestones.n, `${o.milestones.completed || 0} đã hoàn thành`)}${stat('Thành viên', o.members.n, `${o.members.guests || 0} khách`)}</div>
  <h3 class="sec-t">Trạng thái công việc</h3><div class="stats">${stat('Tổng công việc', s.total, `${s.active || 0} đang mở`)}${stat('Hoàn thành đúng hạn', s.done_ontime, `${pct(s.done_ontime || 0, s.total || 0)}%`)}${stat('Hoàn thành trễ hạn', s.done_late, `${pct(s.done_late || 0, s.total || 0)}%`)}${stat('Quá hạn', s.overdue, `${s.in_progress || 0} đang thực hiện trong hạn`, s.overdue)}</div>
  <div class="stats">${stat('Chờ đánh giá', s.review, `${s.review_late || 0} quá hạn đánh giá`)}${stat('Thất bại', s.failed)}${stat('Không có thời hạn', s.no_deadline)}${stat('Bình quân', R.unit.per_week, `việc/tuần · ${R.unit.per_user_week} việc/người/tuần`)}</div>
  <div class="grid2"><section class="card"><div class="card-h"><h2>Xu hướng theo tuần</h2></div><div class="card-b">${lineChart(R.weeks, [{ k: 'created', l: 'Tạo mới', c: C.a }, { k: 'done', l: 'Hoàn thành', c: C.ok }, { k: 'overdue', l: 'Quá hạn (theo thời hạn)', c: C.bad }], 'Xu hướng công việc theo tuần')}</div></section>
    <section class="card"><div class="card-h"><h2>Mức độ ưu tiên</h2></div><div class="card-b"><div class="w-matrix"><div><b class="num">${s.imp_urg || 0}</b><span>Quan trọng, khẩn cấp</span></div><div><b class="num">${s.imp || 0}</b><span>Quan trọng, không khẩn cấp</span></div><div><b class="num">${s.urg || 0}</b><span>Khẩn cấp, không quan trọng</span></div><div><b class="num">${s.none || 0}</b><span>Không quan trọng, không khẩn cấp</span></div></div></div></section></div>
  <div class="grid2"><section class="card"><div class="card-h"><h2>Top 5 thành viên hoàn thành nhiều nhất</h2></div><div class="card-b">${hbars(um(R.top_members), r => r._n, 'done', 'total')}</div></section>
    <section class="card"><div class="card-h"><h2>Nhiều việc quá hạn nhất</h2></div><div class="card-b">${hbars(um(R.most_late), r => r._n, 'late')}</div></section></div>
  <div class="grid2"><section class="card"><div class="card-h"><h2>Đang mở nhiều nhất</h2></div><div class="card-b">${hbars(um(R.most_open), r => r._n, 'open')}</div></section>
    <section class="card"><div class="card-h"><h2>Tình trạng dự án</h2></div><div class="card-b">${(() => { const p = R.project_summary || {}; return [['Đúng tiến độ', p.on_track], ['Chậm tiến độ', p.late], ['Có rủi ro', p.risk], ['Đóng – thành công', p.closed_success], ['Đóng – thất bại', p.closed_failed], ['Đóng – hủy', p.closed_cancelled]].map(([l, v]) => `<div class="w-side-r"><span>${l}</span><b class="num">${v || 0}</b></div>`).join(''); })()}</div></section></div>
  <section class="card"><div class="card-h"><h2>Chi tiết theo thành viên</h2></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Thành viên</th><th class="r">Tổng</th><th class="r">Đúng hạn</th><th class="r">Trễ hạn</th><th class="r">Quá hạn</th><th class="r">Chờ đánh giá</th></tr></thead><tbody>${R.member_detail.map(r => `<tr><td>${who(r.user_id)}</td><td class="r num">${r.total}</td><td class="r num">${r.ontime || 0}</td><td class="r num">${r.late_done || 0}</td><td class="r num ${r.overdue ? 'late' : ''}">${r.overdue || 0}</td><td class="r num">${r.review || 0}</td></tr>`).join('') || '<tr><td colspan="6" class="hint">Chưa có dữ liệu.</td></tr>'}</tbody></table></div></section>
  <section class="card"><div class="card-h"><h2>Theo dự án/phòng ban</h2></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Tên</th><th>Loại</th><th class="r">Tổng</th><th class="r">Hoàn thành</th><th class="r">Quá hạn</th><th class="r">Chờ đánh giá</th></tr></thead><tbody>${R.by_project.map(r => `<tr><td><a href="#cong-viec?p=${r.id}">${esc(r.name)}</a></td><td>${W.KIND[r.kind]}</td><td class="r num">${r.total}</td><td class="r num">${r.done || 0}</td><td class="r num ${r.overdue ? 'late' : ''}">${r.overdue || 0}</td><td class="r num">${r.review || 0}</td></tr>`).join('') || '<tr><td colspan="6" class="hint">Chưa có dữ liệu.</td></tr>'}</tbody></table></div></section>
  <section class="card"><div class="card-h"><h2>Theo Department</h2></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Department</th><th class="r">Tổng</th><th class="r">Đang làm</th><th class="r">Hoàn thành</th><th class="r">Quá hạn</th></tr></thead><tbody>${R.by_dept.map(r => `<tr><td>${r.dept_id ? esc(SO.Dp(r.dept_id).name) : 'Chưa gắn Department'}</td><td class="r num">${r.total}</td><td class="r num">${r.doing || 0}</td><td class="r num">${r.done || 0}</td><td class="r num ${r.overdue ? 'late' : ''}">${r.overdue || 0}</td></tr>`).join('') || '<tr><td colspan="5" class="hint">Chưa có dữ liệu.</td></tr>'}</tbody></table></div></section>
  <div class="grid2"><section class="card"><div class="card-h"><h2>Mốc dự án</h2></div><div class="card-b">${R.milestones.slice(0, 20).map(m => `<div class="w-side-r"><span>◆ ${esc(m.title)} <span class="t-sub">${esc(m.project_name)} · ${m.due_date ? fmtD(m.due_date) : '—'}</span></span><b class="num">${m.done}/${m.total}</b></div>`).join('') || '<span class="hint">Chưa có mốc.</span>'}</div></section>
    <section class="card"><div class="card-h"><h2>Thẻ (tags) sử dụng nhiều</h2></div><div class="card-b w-tagcloud">${R.tags.map(t => `<span class="tag">${esc(t.tag)} <b class="num">${t.n}</b></span>`).join('') || '<span class="hint">Chưa có thẻ.</span>'}</div></section></div>`;
  W._sr = R;
} });
SO.ACTIONS['sr-xlsx'] = () => { const R = W._sr; if (!R) return; const s = R.status;
  X().download(X().write([{ name: 'Trạng thái', header: true, widths: [34, 14], rows: [['Chỉ tiêu', 'Số lượng'], ['Tổng công việc', s.total || 0], ['Hoàn thành đúng hạn', s.done_ontime || 0], ['Hoàn thành trễ hạn', s.done_late || 0], ['Đang thực hiện trong hạn', s.in_progress || 0], ['Quá hạn', s.overdue || 0], ['Chờ đánh giá', s.review || 0], ['Thất bại', s.failed || 0], ['Không có thời hạn', s.no_deadline || 0]] },
    { name: 'Thành viên', header: true, widths: [30, 10, 12, 12, 12, 14], rows: [['Thành viên', 'Tổng', 'Đúng hạn', 'Trễ hạn', 'Quá hạn', 'Chờ đánh giá']].concat(R.member_detail.map(r => [userName(r.user_id), r.total, r.ontime || 0, r.late_done || 0, r.overdue || 0, r.review || 0])) },
    { name: 'Dự án', header: true, widths: [36, 12, 10, 12, 10, 14], rows: [['Tên', 'Loại', 'Tổng', 'Hoàn thành', 'Quá hạn', 'Chờ đánh giá']].concat(R.by_project.map(r => [r.name, W.KIND[r.kind], r.total, r.done || 0, r.overdue || 0, r.review || 0])) },
    { name: 'Theo ngày', header: true, widths: [14, 12, 12, 12], rows: [['Ngày', 'Tạo mới', 'Hoàn thành', 'Quá hạn']].concat(R.days.map(d => [fmtD(d.d), d.created, d.done, d.overdue])) }]), `bao-cao-he-thong-${R.to}.xlsx`); };

/* ============ Trang chính: Quản trị (quyền tạo dự án, mẫu, tác vụ hàng loạt, xuất nhiều dự án) ============ */
W.HOME.push({ key: 'admin', label: 'Quản trị', show: () => !!(W.CFG && W.CFG.is_owner), render: async (main, head) => {
  const cfg = await GET('/api/work/config'), tpl = await GET('/api/work/templates'), sec = W.qp().get('s') || 'perm';
  const secs = [['perm', 'Phân quyền tạo dự án, phòng ban'], ['tpl', 'Quản lý mẫu'], ['bulk', 'Tác vụ hàng loạt'], ['export', 'Xuất dữ liệu nhiều dự án']];
  const modeSel = (k, c) => `<div class="field"><label for="cf-${k}">${k === 'create_project' ? 'Ai được tạo dự án mới' : 'Ai được tạo phòng ban mới'}</label><select id="cf-${k}" data-cfmode="${k}"><option value="all" ${c.mode === 'all' ? 'selected' : ''}>Tất cả thành viên</option><option value="heads" ${c.mode === 'heads' ? 'selected' : ''}>Trưởng Department</option><option value="list" ${c.mode === 'list' ? 'selected' : ''}>Danh sách chỉ định</option></select>
    <select id="cf-${k}-u" multiple size="5" aria-label="Danh sách được phép" ${c.mode === 'list' ? '' : 'hidden'}>${B().users.map(u => `<option value="${u.id}" ${(c.users || []).includes(u.id) ? 'selected' : ''}>${esc(u.full_name)}</option>`).join('')}</select></div>`;
  const body = {
    perm: `<section class="card"><div class="card-h"><h2>Phân quyền tạo dự án, phòng ban</h2></div><div class="card-b"><p class="t-sub">Quản trị hệ thống luôn được tạo. Căn cứ Base Wework bài 63000270226.</p><div class="form">${modeSel('create_project', cfg.create_project)}${modeSel('create_team', cfg.create_team)}</div><div class="actions"><button class="btn primary" data-act="ad-cfg">Lưu</button></div></div></section>`,
    tpl: `<section class="card"><div class="card-h"><h2>Mẫu dựng sẵn</h2></div><div class="card-b">${tpl.builtin.map(t => `<div class="w-side-r"><span>${esc(t.name)} <span class="t-sub">${W.KIND[t.kind]} · ${t.groups} nhóm · ${t.fields} trường</span></span></div>`).join('')}</div></section>
      <section class="card"><div class="card-h"><h2>Mẫu đã lưu <span class="muted num">${tpl.mine.length}</span></h2></div>${tpl.mine.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Tên mẫu</th><th>Loại</th><th>Người tạo</th><th>Chia sẻ</th><th></th></tr></thead><tbody>${tpl.mine.map(t => `<tr><td>${esc(t.name)}</td><td>${W.KIND[t.kind]}</td><td>${who(t.owner_id)}</td><td class="t-sub">${(t.shared.users || []).length} người · ${(t.shared.depts || []).length} Department</td>
        <td class="r">${t.can_edit ? `<button class="btn ghost sm" data-act="tp-edit" data-id="${t.id}">Sửa</button><button class="btn ghost sm" data-act="tp-del" data-id="${t.id}">Xóa</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Chưa có mẫu. Quản lý dự án lưu mẫu tại “Tùy chọn khác → Lưu thành mẫu”.</div>'}</section>`,
    bulk: `<section class="card"><div class="card-h"><h2>Tác vụ hàng loạt trên công việc</h2></div><div class="card-b"><div class="form">
      <div class="field"><label for="bk-u">Người dùng</label><select id="bk-u"><option value="">Chọn người dùng</option>${userOpts(null)}</select></div>
      <div class="field"><label for="bk-r">Vai trò trong công việc</label><select id="bk-r"><option value="assignee">Người thực hiện</option><option value="creator">Người giao việc</option><option value="follower">Người theo dõi</option></select></div>
      <div class="field"><label for="bk-s">Trạng thái</label><select id="bk-s"><option value="open">Chưa kết thúc</option><option value="all">Tất cả</option></select></div>
      <div class="field"><span class="lbl">&nbsp;</span><button class="btn" data-act="bk-load">Tìm công việc</button></div></div><div id="bk-res"></div></div></section>
      <section class="card"><div class="card-h"><h2>Tác vụ hàng loạt trên dự án/phòng ban</h2></div><div class="card-b"><div class="form">
      <div class="field"><label for="bp-u">Người dùng</label><select id="bp-u"><option value="">Chọn người dùng</option>${userOpts(null)}</select></div><div class="field"><span class="lbl">&nbsp;</span><button class="btn" data-act="bp-load">Tìm dự án/phòng ban</button></div></div><div id="bp-res"></div></div></section>`,
    export: `<section class="card"><div class="card-h"><h2>Xuất công việc nhiều dự án/phòng ban</h2></div><div class="card-b"><p class="t-sub">Tối đa 500 dự án/phòng ban, 3.000 công việc và 5.000 công việc con mỗi lần.</p><div class="form">
      <div class="field full"><label for="mx-p">Dự án/phòng ban</label><select id="mx-p" multiple size="8">${B().projects ? '' : ''}</select></div>
      <div class="field"><label for="mx-d">Hoặc toàn bộ của Department</label><select id="mx-d"><option value="">Không chọn</option>${SO.deptOpts(null)}</select></div>
      ${exportOpts('mx')}</div><div class="actions"><button class="btn primary" data-act="mx-go">Xuất Excel</button></div></div></section>`
  };
  main.innerHTML = `${head}<div class="w-setwrap"><nav class="w-setnav" aria-label="Quản trị">${secs.map(([k, l]) => `<a href="#cong-viec?tab=admin&s=${k}" ${k === sec ? 'aria-current="page"' : ''}>${l}</a>`).join('')}</nav><div class="w-setbody">${body[sec] || body.perm}</div></div>`;
  $$('[data-cfmode]').forEach(s => { s.onchange = () => { $(`#cf-${s.dataset.cfmode}-u`).hidden = s.value !== 'list'; }; });
  if (sec === 'export') { try { const ps = await GET('/api/projects?scope=all&status=all'); $('#mx-p').innerHTML = ps.map(p => `<option value="${p.id}">${esc(p.name)} (${W.KIND[p.kind]})</option>`).join(''); } catch (e) {} }
  W._tpl = tpl;
} });
SO.ACTIONS['ad-cfg'] = btn => busy(btn, async () => { const v = k => ({ mode: $(`#cf-${k}`).value, users: Array.from($(`#cf-${k}-u`).selectedOptions).map(o => Number(o.value)) });
  try { await PUT('/api/work/config', { create_project: v('create_project'), create_team: v('create_team') }); W.CFG = null; toast('Đã lưu phân quyền'); } catch (e) { toast(e.message, true); } });
SO.ACTIONS['tp-del'] = async btn => { if (!armed(btn, 'Xóa mẫu?')) return; try { await DEL('/api/work/templates/' + btn.dataset.id); toast('Đã xóa mẫu'); render(); } catch (e) { toast(e.message, true); } };
SO.ACTIONS['tp-edit'] = btn => { const t = (W._tpl.mine || []).find(x => x.id === Number(btn.dataset.id)); if (t) tplForm(null, t); };
SO.ACTIONS['bk-load'] = btn => busy(btn, async () => {
  const u = $('#bk-u').value; if (!u) return toast('Vui lòng chọn người dùng.', true);
  try { const d = await GET(`/api/work/bulk/tasks?user=${u}&role=${$('#bk-r').value}&status=${$('#bk-s').value}&limit=200`);
    $('#bk-res').innerHTML = `<p class="t-sub">Tìm thấy ${d.total} công việc${d.total > d.rows.length ? `, hiển thị ${d.rows.length}` : ''}.</p>${d.rows.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th><input type="checkbox" id="bk-all" aria-label="Chọn tất cả" checked></th><th>Công việc</th><th>Dự án/phòng ban</th><th>Trạng thái</th></tr></thead><tbody>${d.rows.map(t => `<tr><td><input type="checkbox" class="bk-c" value="${t.id}" checked aria-label="Chọn ${esc(t.title)}"></td><td>${esc(t.title)}</td><td>${esc(t.project_name)}</td><td>${W.pill(t.status)}</td></tr>`).join('')}</tbody></table></div>
      <div class="form"><div class="field"><label for="bk-a">Thao tác</label><select id="bk-a"><option value="assignee">Thay người thực hiện</option><option value="creator">Thay người giao việc</option><option value="add_follower">Thêm người theo dõi</option></select></div><div class="field"><label for="bk-to">Người thay thế/thêm</label><select id="bk-to"><option value="">Chọn người</option>${userOpts(null)}</select></div><div class="field"><span class="lbl">&nbsp;</span><button class="btn primary" data-act="bk-go">Áp dụng</button></div></div>` : ''}`;
    const all = $('#bk-all'); if (all) all.onchange = () => $$('.bk-c').forEach(c => { c.checked = all.checked; });
  } catch (e) { toast(e.message, true); } });
SO.ACTIONS['bk-go'] = async btn => { const ids = $$('.bk-c').filter(c => c.checked).map(c => Number(c.value)), to = Number($('#bk-to').value);
  if (!ids.length || !to) return toast('Vui lòng chọn công việc và người thay thế.', true); if (!armed(btn, `Áp dụng cho ${ids.length} công việc?`)) return;
  try { const r = await POST('/api/work/bulk/tasks', { task_ids: ids, to_user: to, action: $('#bk-a').value }); toast(`Đã cập nhật ${r.updated} công việc`); SO.ACTIONS['bk-load']($('[data-act="bk-load"]')); } catch (e) { toast(e.message, true); } };
SO.ACTIONS['bp-load'] = btn => busy(btn, async () => {
  const u = $('#bp-u').value; if (!u) return toast('Vui lòng chọn người dùng.', true);
  try { const rows = await GET('/api/work/bulk/projects?user=' + u);
    $('#bp-res').innerHTML = rows.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th></th><th>Dự án/phòng ban</th><th>Vai trò</th><th>Trạng thái</th></tr></thead><tbody>${rows.map(p => `<tr><td><input type="checkbox" class="bp-c" value="${p.id}" aria-label="Chọn ${esc(p.name)}"></td><td>${esc(p.name)} <span class="t-sub">${W.KIND[p.kind]}</span></td><td>${W.ROLE[p.role] || p.role}</td><td>${p.status === 'closed' ? 'Đã đóng' : 'Đang hoạt động'}</td></tr>`).join('')}</tbody></table></div>
      <div class="form"><div class="field"><label for="bp-a">Thao tác</label><select id="bp-a"><option value="replace">Thay thế vai trò bằng người khác</option><option value="demote">Hạ quyền quản lý xuống thành viên</option><option value="remove">Xóa khỏi dự án/phòng ban</option></select></div><div class="field"><label for="bp-to">Người thay thế</label><select id="bp-to"><option value="">Chọn người</option>${userOpts(null)}</select></div><div class="field"><span class="lbl">&nbsp;</span><button class="btn primary" data-act="bp-go">Áp dụng</button></div></div>` : '<p class="hint">Người dùng không tham gia dự án/phòng ban nào với vai trò quản lý, thành viên hoặc khách.</p>';
  } catch (e) { toast(e.message, true); } });
SO.ACTIONS['bp-go'] = async btn => { const ids = $$('.bp-c').filter(c => c.checked).map(c => Number(c.value)); if (!ids.length) return toast('Vui lòng chọn dự án/phòng ban.', true);
  if (!armed(btn, `Áp dụng cho ${ids.length} dự án/phòng ban?`)) return;
  try { const r = await POST('/api/work/bulk/projects', { user: Number($('#bp-u').value), project_ids: ids, action: $('#bp-a').value, to_user: Number($('#bp-to').value) || null }); toast(`Đã cập nhật ${r.updated} dự án/phòng ban`); SO.ACTIONS['bp-load']($('[data-act="bp-load"]')); } catch (e) { toast(e.message, true); } };
SO.ACTIONS['mx-go'] = btn => busy(btn, async () => {
  const ids = Array.from($('#mx-p').selectedOptions).map(o => o.value), d = $('#mx-d').value; if (!ids.length && !d) return toast('Vui lòng chọn dự án/phòng ban hoặc Department.', true);
  try { const r = await GET(`/api/work/export?projects=${ids.join(',')}${d ? '&dept=' + d : ''}&${exportQS('mx')}`); X().download(X().write([taskSheet(r.rows, r.users, [], [], { project: true })]), `cong-viec-nhieu-du-an-${TODAY()}.xlsx`); toast(`Đã xuất ${r.rows.length} dòng`); } catch (e) { toast(e.message, true); } });

/* ============ Xuất Excel: tùy chọn và bảng công việc dùng chung ============ */
function exportOpts(p) {
  return `<div class="field"><label for="${p}-b">Lọc theo</label><select id="${p}-b"><option value="created">Ngày tạo công việc</option><option value="due">Thời hạn</option><option value="active">Thời gian thực hiện</option></select></div>
    <div class="field"><label for="${p}-f">Từ ngày</label><input type="date" id="${p}-f"></div><div class="field"><label for="${p}-t">Đến ngày</label><input type="date" id="${p}-t"></div>
    <div class="field"><span class="lbl">Phạm vi</span><label class="check"><input type="checkbox" id="${p}-s" checked> Gồm công việc con</label></div>`;
}
const exportQS = p => new URLSearchParams({ basis: $(`#${p}-b`).value, from: $(`#${p}-f`).value, to: $(`#${p}-t`).value, sub: $(`#${p}-s`).checked ? '1' : '' }).toString();
const uname = (users, id) => (id && users[id] ? users[id].username || users[id].full_name : '');
const yn = v => (v ? 'Có' : '');
const dmy = d => (d ? fmtD(String(d).slice(0, 10)) : '');
const cellOf = (f, v) => { if (v === null || v === undefined) return ''; if (f.type === 'checkbox') return v ? 'Có' : 'Không'; if (Array.isArray(v)) return f.type === 'file' ? v.map(x => x.file_name).join(', ') : v.join(', ');
  if (f.type === 'date') return dmy(v); if (f.type === 'table') return `${(v.rows || []).length} dòng`; return v; };
/* Cột theo mẫu nhập của Base (bài 63000252615) để tệp xuất nhập lại được; thêm Mã, Trạng thái, Tiến độ */
function taskSheet(rows, users, fields, milestones, o = {}) {
  const depth = {}, byId = {}; rows.forEach(r => { byId[r.id] = r; }); const dep = r => (r.parent_id && byId[r.parent_id] ? (depth[r.id] ??= dep(byId[r.parent_id]) + 1) : 0);
  const ms = Object.fromEntries((milestones || []).map(m => [m.id, m.title]));
  const vf = fields.filter(f => f.type !== 'heading');
  const head = ['Mã (ID)'].concat(o.project ? ['Dự án/phòng ban'] : [], ['Nhóm công việc', 'Tên công việc', 'Người giao', 'Người thực hiện', 'Người theo dõi', 'Khẩn cấp', 'Quan trọng', 'Tags', 'Ngày bắt đầu', 'Deadline', 'Hoàn thành thực tế', 'Trạng thái', 'Tiến độ (%)', 'Mô tả', 'Mốc dự án'], vf.map(f => f.name));
  const out = [head];
  for (const r of rows) out.push([r.id].concat(o.project ? [r.project_name] : [], [r.group_name || '', '#'.repeat(dep(r)) + (dep(r) ? ' ' : '') + r.title, uname(users, r.creator_id), uname(users, r.assignee_id), (r.followers || []).map(id => uname(users, id)).join(', '),
    yn(r.urgent), yn(r.important), (r.tags || []).join(', '), dmy(r.start_date), dmy(r.due_date) + (r.due_time ? ' ' + r.due_time : ''), r.status === 'done' ? dmy(r.done_at || r.completed_at) : '', W.ST[r.status] || r.status, r.progress || 0, r.description || '', ms[r.milestone_id] || ''],
    vf.map(f => cellOf(f, (r.fields || {})[f.id]))));
  return { name: 'Công việc', header: true, rows: out, widths: head.map((h, i) => (h === 'Tên công việc' || h === 'Mô tả' ? 40 : i === 0 ? 9 : 16)) };
}

/* ============ Tùy chỉnh dự án: Phân quyền sử dụng (Base bài 63000277998) ============ */
W.SET.push({ key: 'perm', label: 'Phân quyền sử dụng', show: P => P.can_manage, render: (el, P) => {
  const M = P.perm, L = P.perm_labels, cb = (g, k, r, v) => `<td class="c"><input type="checkbox" data-pm="${g}.${k}.${r}" ${v ? 'checked' : ''} aria-label="${esc(L[g][k])} – ${r}"></td>`;
  el.innerHTML = `<section class="card"><div class="card-h"><h2>Phân quyền theo loại tài khoản</h2></div><p class="t-sub" style="padding:0 16px">Quản lý luôn có toàn quyền. Khách là tài khoản bên ngoài được mời vào ${W.KIND[P.kind].toLowerCase()}.</p>
    <div class="tbl-wrap"><table class="tbl w-pm"><thead><tr><th>Quyền</th><th class="c">Quản lý</th><th class="c">Thành viên</th><th class="c">Khách</th></tr></thead><tbody>${Object.keys(L.account).map(k => `<tr><td>${esc(L.account[k])}</td><td class="c">✓</td>${cb('account', k, 'member', M.account[k].member)}${cb('account', k, 'guest', M.account[k].guest)}</tr>`).join('')}</tbody></table></div></section>
  <section class="card"><div class="card-h"><h2>Quyền chỉnh sửa công việc</h2></div><p class="t-sub" style="padding:0 16px">Người giao việc và người thực hiện có các quyền này theo mặc định (trừ các hạn chế bên dưới).</p>
    <div class="tbl-wrap"><table class="tbl w-pm"><thead><tr><th>Quyền</th><th class="c">Người theo dõi</th><th class="c">Thành viên khác</th></tr></thead><tbody>${Object.keys(L.edit).map(k => `<tr><td>${esc(L.edit[k])}</td>${cb('edit', k, 'follower', M.edit[k].follower)}${cb('edit', k, 'other', M.edit[k].other)}</tr>`).join('')}</tbody></table></div></section>
  <section class="card"><div class="card-h"><h2>Hạn chế quyền của người được giao việc</h2></div><div class="card-b">${Object.keys(L.restrict).map(k => `<label class="check w-set"><input type="checkbox" data-pm="restrict.${k}" ${M.restrict[k] ? 'checked' : ''}> <span>${esc(L.restrict[k])}</span></label>`).join('')}
    <div class="actions"><button class="btn primary" data-act="pm-save">Lưu phân quyền</button></div></div></section>`;
} });
SO.ACTIONS['pm-save'] = btn => busy(btn, async () => { const perm = { account: {}, edit: {}, restrict: {} };
  $$('[data-pm]').forEach(c => { const [g, k, r] = c.dataset.pm.split('.'); if (g === 'restrict') perm.restrict[k] = c.checked; else (perm[g][k] = perm[g][k] || {})[r] = c.checked; });
  try { W.setPJ(await PUT(`/api/projects/${W.pj().id}/settings`, { perm })); toast('Đã lưu phân quyền'); render(); } catch (e) { toast(e.message, true); } });

/* ============ Tùy chỉnh dự án: Trường dữ liệu tùy chỉnh (Base bài 63000252575, 63000277992, 63000278601) ============ */
let FD = null;
W.SET.push({ key: 'fields', label: 'Trường dữ liệu tùy chỉnh', show: P => P.can_manage, render: async (el, P) => {
  FD = await GET(`/api/projects/${P.id}/fields`);
  el.innerHTML = `<section class="card"><div class="card-h"><h2>Trường dữ liệu tùy chỉnh <span class="muted num">${FD.fields.length}/50</span></h2><div class="actions"><button class="btn sm" data-act="fd-import">Nhập từ Excel</button><button class="btn sm primary" data-act="fd-new">+ Thêm trường</button></div></div>
    <p class="t-sub" style="padding:0 16px">Các trường hiển thị khi tạo và xem chi tiết công việc. Dùng mũi tên để sắp xếp vị trí.</p>
    ${FD.fields.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Tên trường</th><th>Loại</th><th>Mã (Input key)</th><th class="c">Bắt buộc</th><th></th></tr></thead><tbody>${FD.fields.map((f, i) => `<tr><td>${f.type === 'heading' ? '<b>' + esc(f.name) + '</b>' : esc(f.name)}${f.description ? `<div class="t-sub">${esc(f.description)}</div>` : ''}</td><td>${FD.types[f.type]}${f.type === 'formula' ? `<div class="t-sub">= ${esc(f.options.formula)}</div>` : ''}${f.type === 'table' ? `<div class="t-sub">${f.options.columns.length} cột</div>` : ''}</td><td><code>$${esc(f.input_key)}</code></td><td class="c">${f.required ? '✓' : ''}</td>
      <td class="r"><button class="btn ghost sm" data-act="fd-mv" data-i="${i}" data-d="-1" ${i ? '' : 'disabled'} aria-label="Lên">↑</button><button class="btn ghost sm" data-act="fd-mv" data-i="${i}" data-d="1" ${i < FD.fields.length - 1 ? '' : 'disabled'} aria-label="Xuống">↓</button><button class="btn ghost sm" data-act="fd-edit" data-id="${f.id}">Sửa</button><button class="btn ghost sm" data-act="fd-del" data-id="${f.id}">Xóa</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Chưa có trường tùy chỉnh.</div>'}</section>`;
} });
const colRow = (c = {}) => `<tr><td><input data-cc="name" value="${esc(c.name || '')}" aria-label="Tên cột" maxlength="80"></td><td><select data-cc="type" aria-label="Loại cột">${FD.col_types.map(t => `<option value="${t}" ${t === (c.type || 'text') ? 'selected' : ''}>${FD.types[t]}</option>`).join('')}</select></td>
  <td><input data-cc="extra" value="${esc(c.type === 'formula' ? c.formula || '' : (c.choices || []).join(', '))}" placeholder="Lựa chọn (a, b) hoặc công thức ($a*$b)" aria-label="Lựa chọn hoặc công thức"></td><td><input type="number" data-cc="width" min="1" max="10" value="${c.width || 1}" aria-label="Độ rộng" style="width:60px"></td>
  <td class="c"><input type="checkbox" data-cc="required" ${c.required ? 'checked' : ''} aria-label="Bắt buộc"></td><td class="c"><input type="checkbox" data-cc="sum" ${c.sum ? 'checked' : ''} aria-label="Tính tổng"></td><td><input type="hidden" data-cc="key" value="${esc(c.key || '')}"><button class="btn ghost sm" data-act="cc-del" aria-label="Xóa cột">×</button></td></tr>`;
function fieldForm(f) {
  const P = W.pj(), type = f ? f.type : 'text', nums = FD.fields.filter(x => ['int', 'float', 'select'].includes(x.type) && (!f || x.id !== f.id));
  openModal(`${mh(f ? 'Sửa trường tùy chỉnh' : 'Thêm trường tùy chỉnh', esc(P.name))}<div class="modal-b"><div class="form">
    <div class="field"><label for="fd-type">Loại dữ liệu</label><select id="fd-type" ${f ? 'disabled' : ''}>${Object.entries(FD.types).map(([k, l]) => `<option value="${k}" ${k === type ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <div class="field"><label for="fd-name">Tên trường</label><input id="fd-name" maxlength="120" value="${esc(f ? f.name : '')}"></div>
    <div class="field"><label for="fd-key">Mã trường (Input key)</label><input id="fd-key" maxlength="40" value="${esc(f ? f.input_key : '')}" placeholder="Tự tạo từ tên nếu để trống"><span class="t-sub">Dùng trong công thức với ký hiệu $mã.</span></div>
    ${f ? '' : `<div class="field"><label for="fd-after">Vị trí</label><select id="fd-after"><option value="">Cuối danh sách</option><option value="0">Đầu tiên</option>${FD.fields.map(x => `<option value="${x.id}">Sau “${esc(x.name)}”</option>`).join('')}</select></div>`}
    <div class="field full"><label for="fd-desc">Mô tả, hướng dẫn nhập</label><input id="fd-desc" maxlength="500" value="${esc(f ? f.description : '')}"></div>
    <div class="field full" data-ft="select mselect"><label for="fd-ch">Các lựa chọn (cách nhau bởi dấu phẩy)</label><input id="fd-ch" value="${esc(f && f.options.choices ? f.options.choices.join(', ') : '')}"></div>
    <div class="field" data-ft="float formula"><label for="fd-dec">Số chữ số thập phân</label><input type="number" id="fd-dec" min="0" max="6" value="${f && f.options.decimals !== undefined ? f.options.decimals : 2}"></div>
    <div class="field full" data-ft="formula"><label for="fd-fx">Công thức</label><input id="fd-fx" value="${esc(f && f.options.formula || '')}" placeholder="Ví dụ: ROUND($don_gia * $so_luong, 0)" autocomplete="off">
      <span class="t-sub">Biến: ${nums.map(x => `<button type="button" class="btn ghost sm" data-act="fx-ins" data-v="$${esc(x.input_key)}">$${esc(x.input_key)}</button>`).join(' ') || 'chưa có trường số/lựa chọn'} · Hàm: ${FM().FUNCTIONS.join(', ')}</span><span class="t-sub" id="fd-fxc" aria-live="polite"></span></div>
    <div class="field full" data-ft="table"><span class="lbl">Các cột của bảng</span><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Tên cột</th><th>Loại</th><th>Lựa chọn/Công thức</th><th>Độ rộng</th><th>Bắt buộc</th><th>Tổng</th><th></th></tr></thead><tbody id="fd-cols">${(f && f.options.columns ? f.options.columns : [{}]).map(colRow).join('')}</tbody></table></div>
      <button type="button" class="btn ghost sm" data-act="cc-add">+ Thêm cột</button><span class="t-sub">Công thức cột dùng mã các cột số trong cùng bảng, ví dụ $so_luong*$don_gia.</span></div>
    <div class="field" data-ft="int float text textarea date datetime select mselect checkbox file table"><span class="lbl">Ràng buộc</span><label class="check"><input type="checkbox" id="fd-req" ${f && f.required ? 'checked' : ''}> Bắt buộc nhập</label></div>
  </div><p class="err" id="fd-err" hidden></p></div><div class="modal-f"><button class="btn" data-act="close">Hủy</button><button class="btn primary" data-act="fd-save">Lưu</button></div>`, {
    'fx-ins': b => { const i = $('#fd-fx'); i.setRangeText(b.dataset.v, i.selectionStart, i.selectionEnd, 'end'); i.focus(); i.dispatchEvent(new Event('input')); },
    'cc-add': () => $('#fd-cols').insertAdjacentHTML('beforeend', colRow()),
    'cc-del': b => { if ($$('#fd-cols tr').length > 1) b.closest('tr').remove(); },
    'fd-save': b => busy(b, async () => {
      const t = $('#fd-type').value, body = { type: t, name: $('#fd-name').value, input_key: $('#fd-key').value || undefined, description: $('#fd-desc').value, required: $('#fd-req').checked,
        options: { choices: $('#fd-ch').value, decimals: Number($('#fd-dec').value), formula: $('#fd-fx').value } };
      if (t === 'table') body.options.columns = $$('#fd-cols tr').map(tr => { const g = k => tr.querySelector(`[data-cc="${k}"]`); const ty = g('type').value;
        return { key: g('key').value || undefined, name: g('name').value, type: ty, width: Number(g('width').value), required: g('required').checked, sum: g('sum').checked, choices: ty === 'formula' ? undefined : g('extra').value, formula: ty === 'formula' ? g('extra').value : undefined }; });
      if (!f && $('#fd-after').value !== '') body.after = Number($('#fd-after').value);
      try { FD = Object.assign(FD, f ? await PUT('/api/fields/' + f.id, body) : await POST(`/api/projects/${P.id}/fields`, body)); closeModal(); toast('Đã lưu trường tùy chỉnh'); render(); } catch (e) { showErr('#fd-err', e); }
    })
  });
  const sync = () => { const t = $('#fd-type').value; $$('[data-ft]').forEach(x => { x.hidden = !x.dataset.ft.split(' ').includes(t); }); };
  $('#fd-type').onchange = sync; sync();
  $('#fd-fx').oninput = () => { const v = $('#fd-fx').value.trim(); if (!v) { $('#fd-fxc').textContent = ''; return; } const r = FM().check(v, nums.map(x => x.input_key));
    if (!r.ok) { $('#fd-fxc').textContent = '⚠ ' + r.error; return; } const vals = Object.fromEntries(nums.map(x => [x.input_key, 1])), e = FM().evaluate(v, vals); $('#fd-fxc').textContent = '✓ Công thức hợp lệ' + (e.ok ? ` (thử với mọi biến = 1: ${e.value})` : ''); };
  if (type === 'formula') $('#fd-fx').oninput();
}
SO.ACTIONS['fd-new'] = () => fieldForm(null);
SO.ACTIONS['fd-edit'] = btn => fieldForm(FD.fields.find(f => f.id === Number(btn.dataset.id)));
SO.ACTIONS['fd-del'] = async btn => { if (!armed(btn, 'Xóa trường và dữ liệu đã nhập?')) return; try { await DEL('/api/fields/' + btn.dataset.id); toast('Đã xóa trường'); render(); } catch (e) { toast(e.message, true); } };
SO.ACTIONS['fd-mv'] = async btn => { const i = Number(btn.dataset.i), j = i + Number(btn.dataset.d), ids = FD.fields.map(f => f.id); [ids[i], ids[j]] = [ids[j], ids[i]];
  try { await PUT(`/api/projects/${W.pj().id}/fields-order`, { ids }); render(); } catch (e) { toast(e.message, true); } };
SO.ACTIONS['fd-import'] = () => ioOpen('fields');

/* ============ Tùy chỉnh dự án: Mẫu và Cài đặt nâng cao ============ */
W.SET.push({ key: 'templates', label: 'Mẫu dự án', show: P => P.can_manage, render: async (el, P) => {
  const tpl = await GET('/api/work/templates'), mine = tpl.mine.filter(t => t.source_project_id === P.id);
  el.innerHTML = `<section class="card"><div class="card-h"><h2>Mẫu tạo từ ${W.KIND[P.kind].toLowerCase()} này</h2><button class="btn sm primary" data-act="tp-new">+ Lưu thành mẫu</button></div>
    <p class="t-sub" style="padding:0 16px">Mẫu lưu lại nhóm công việc, trường tùy chỉnh, phân quyền và thẻ (không gồm công việc) để tạo ${W.KIND[P.kind].toLowerCase()} mới nhanh. “Cập nhật” lấy lại cấu hình hiện tại.</p>
    ${mine.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Tên mẫu</th><th>Chia sẻ</th><th>Cập nhật</th><th></th></tr></thead><tbody>${mine.map(t => `<tr><td>${esc(t.name)}</td><td class="t-sub">${(t.shared.users || []).length} người · ${(t.shared.depts || []).length} Department</td><td class="num">${fmtDT(t.updated_at)}</td>
      <td class="r">${t.can_edit ? `<button class="btn ghost sm" data-act="tp-sync" data-id="${t.id}">Cập nhật</button><button class="btn ghost sm" data-act="tp-edit2" data-id="${t.id}">Sửa</button><button class="btn ghost sm" data-act="tp-del" data-id="${t.id}">Xóa</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Chưa có mẫu.</div>'}</section>`;
  W._tpl = tpl;
} });
SO.ACTIONS['tp-new'] = () => tplForm(W.pj(), null);
SO.ACTIONS['tp-edit2'] = btn => tplForm(W.pj(), (W._tpl.mine || []).find(x => x.id === Number(btn.dataset.id)));
SO.ACTIONS['tp-sync'] = btn => busy(btn, async () => { try { await PUT('/api/work/templates/' + btn.dataset.id, { source_project_id: W.pj().id }); toast('Đã cập nhật mẫu theo cấu hình hiện tại'); render(); } catch (e) { toast(e.message, true); } });
function tplForm(P, t) {
  const inc = t ? t.include : { groups: true, fields: true, perm: true, tags: true }, sh = t ? t.shared : { users: [], depts: [] };
  openModal(`${mh(t ? 'Sửa mẫu' : 'Lưu thành mẫu', P ? esc(P.name) : '')}<div class="modal-b"><div class="form">
    <div class="field full"><label for="tp-n">Tên mẫu</label><input id="tp-n" maxlength="120" value="${esc(t ? t.name : (P ? 'Mẫu ' + P.name : ''))}"></div>
    <div class="field full w-sets"><span class="lbl">Nội dung lưu</span>${[['groups', 'Nhóm công việc'], ['fields', 'Trường dữ liệu tùy chỉnh'], ['perm', 'Phân quyền và thiết lập'], ['tags', 'Thẻ (tags)']].map(([k, l]) => `<label class="check"><input type="checkbox" data-inc="${k}" ${inc[k] !== false ? 'checked' : ''}> ${l}</label>`).join('')}</div>
    <div class="field"><label for="tp-u">Chia sẻ cho thành viên</label><select id="tp-u" multiple size="5">${B().users.filter(u => u.active).map(u => `<option value="${u.id}" ${(sh.users || []).includes(u.id) ? 'selected' : ''}>${esc(u.full_name)}</option>`).join('')}</select></div>
    <div class="field"><label for="tp-d">Chia sẻ cho Department</label><select id="tp-d" multiple size="5">${B().departments.map(d => `<option value="${d.id}" ${(sh.depts || []).includes(d.id) ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></div>
  </div><p class="err" id="tp-err" hidden></p></div><div class="modal-f"><button class="btn" data-act="close">Hủy</button><button class="btn primary" data-act="tp-save">Lưu mẫu</button></div>`, {
    'tp-save': b => busy(b, async () => { const body = { name: $('#tp-n').value, include: Object.fromEntries($$('[data-inc]').map(c => [c.dataset.inc, c.checked])),
      shared: { users: Array.from($('#tp-u').selectedOptions).map(o => Number(o.value)), depts: Array.from($('#tp-d').selectedOptions).map(o => Number(o.value)) } };
      try { if (t) await PUT('/api/work/templates/' + t.id, body); else await POST(`/api/projects/${P.id}/templates`, body); closeModal(); toast('Đã lưu mẫu'); render(); } catch (e) { showErr('#tp-err', e); } }) });
}
W.SET.push({ key: 'advanced', label: 'Cài đặt nâng cao', show: P => !!P.is_owner, render: (el, P) => {
  el.innerHTML = `<section class="card"><div class="card-h"><h2>Cài đặt nâng cao (quản trị hệ thống)</h2></div><div class="card-b">
    <label class="check w-set"><input type="checkbox" id="adv-mcd" ${P.settings.managers_can_delete !== false ? 'checked' : ''}> <span>Cho phép quản lý xóa ${W.KIND[P.kind].toLowerCase()} này<small class="t-sub">Khi tắt, chỉ quản trị hệ thống xóa được (Base bài 63000252597).</small></span></label>
    <div class="actions"><button class="btn primary" data-act="adv-save">Lưu</button></div></div></section>`;
} });
SO.ACTIONS['adv-save'] = btn => busy(btn, async () => { try { W.setPJ(await PUT(`/api/projects/${W.pj().id}/settings`, { managers_can_delete: $('#adv-mcd').checked })); toast('Đã lưu cài đặt'); } catch (e) { toast(e.message, true); } });

/* ============ Nhập & Xuất dữ liệu dự án (Base bài 63000252615, 63000286215, 63000271425, 63000277992, 63000278601, 63000252614, 63000268365) ============ */
const IMPORT_COLS = { group: ['nhóm công việc', 'nhom cong viec', 'group'], title: ['tên công việc', 'ten cong viec', 'title', 'công việc'], creator: ['người giao', 'nguoi giao', 'creator'], assignee: ['người thực hiện', 'nguoi thuc hien', 'assignee'],
  followers: ['người theo dõi', 'nguoi theo doi', 'followers'], urgent: ['khẩn cấp', 'khan cap', 'urgent'], important: ['quan trọng', 'quan trong', 'important'], tags: ['tags', 'thẻ'], start: ['ngày bắt đầu', 'ngay bat dau', 'start'],
  due: ['deadline', 'thời hạn', 'thoi han', 'due'], done_at: ['hoàn thành thực tế', 'hoan thanh thuc te'], description: ['mô tả', 'mo ta', 'description'], milestone: ['mốc dự án', 'moc du an', 'milestone'], key: ['key'], deps: ['phụ thuộc', 'phu thuoc', 'dependencies'], id: ['mã (id)', 'mã', 'id', 'mã công việc'] };
const norm = s => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
function mapHeader(head, fields) {
  const m = {}; head.forEach((h, i) => { const n = norm(h); for (const [k, al] of Object.entries(IMPORT_COLS)) if (al.includes(n) && m[k] === undefined) m[k] = i;
    const f = (fields || []).find(x => norm(x.name) === n || norm('$' + x.input_key) === n || norm(x.input_key) === n); if (f && !['heading', 'formula', 'file', 'table'].includes(f.type)) (m.fields = m.fields || {})[f.id] = i; });
  return m;
}
const cellStr = v => (v === null || v === undefined ? '' : String(v).trim());
async function readSheet(input) { const f = input.files[0]; if (!f) throw new Error('Vui lòng chọn tệp Excel (.xlsx).'); if (!/\.xlsx$/i.test(f.name)) throw new Error('Chỉ hỗ trợ tệp .xlsx.'); return X().read(f); }
function parseTasks(sheet, fields) {
  const rows = sheet.rows.filter(r => r.some(c => cellStr(c))); if (rows.length < 2) throw new Error('Tệp không có dòng dữ liệu.');
  const m = mapHeader(rows[0], fields); if (m.title === undefined) throw new Error('Không tìm thấy cột “Tên công việc” ở dòng tiêu đề.');
  const out = []; let gcur = '';
  rows.slice(1).forEach((r, i) => {
    const g = m.group !== undefined ? cellStr(r[m.group]) : '', raw = cellStr(r[m.title]);
    if (g && g !== gcur) { gcur = g; out.push({ group: g, _line: i + 2 }); }
    if (!raw) return;
    const lv = (raw.match(/^#+/) || [''])[0].length, o = { _line: i + 2, level: lv, title: raw.replace(/^#+\s*/, '') };
    for (const k of ['creator', 'assignee', 'followers', 'urgent', 'important', 'tags', 'start', 'due', 'done_at', 'description', 'milestone', 'key', 'deps']) if (m[k] !== undefined) o[k] = cellStr(r[m[k]]);
    if (m.fields) { o.fields = {}; for (const [fid, ci] of Object.entries(m.fields)) { const v = cellStr(r[ci]); if (v) { const f = fields.find(x => x.id === Number(fid)); o.fields[fid] = f.type === 'checkbox' ? ['có', 'x', '1', 'true', 'yes'].includes(v.toLowerCase()) : f.type === 'date' ? v.split(' ')[0].split('/').reverse().join('-') : v; } } }
    out.push(o);
  });
  return { rows: out, map: m };
}
function templateXlsx(P, withDeps) {
  const fields = (P.fields || []).filter(f => !['heading', 'formula', 'file', 'table'].includes(f.type)), me = B().me.username || '';
  const head = ['Nhóm công việc', 'Tên công việc', 'Người giao', 'Người thực hiện', 'Người theo dõi', 'Khẩn cấp', 'Quan trọng', 'Tags', 'Ngày bắt đầu', 'Deadline', 'Hoàn thành thực tế', 'Mô tả', 'Mốc dự án'].concat(withDeps ? ['Key', 'Phụ thuộc'] : [], fields.map(f => f.name));
  const ex = [['Thiết kế', 'Khảo sát yêu cầu', me, me, '', 'Có', '', 'Khảo sát', fmtD(TODAY()), fmtD(addDays(TODAY(), 3)), '', 'Mô tả công việc', ''].concat(withDeps ? ['1', ''] : []), ['Thiết kế', '# Phỏng vấn người dùng', '', me, '', '', 'Có', '', fmtD(TODAY()), fmtD(addDays(TODAY(), 2)), '', '', ''].concat(withDeps ? ['2', ''] : []),
    ['Thiết kế', 'Thiết kế giao diện', me, me, '', '', '', '', fmtD(addDays(TODAY(), 4)), fmtD(addDays(TODAY(), 8)), '', '', ''].concat(withDeps ? ['3', '1FS1d'] : [])].map(r => r.concat(fields.map(() => '')));
  const guide = [['Hướng dẫn nhập công việc từ Excel'], ['1. Giữ nguyên dòng tiêu đề. Mỗi dòng là một công việc; cột “Nhóm công việc” tạo nhóm nếu chưa có.'], ['2. Công việc con: thêm dấu # trước tên (# cấp 1, ## cấp 2, ### cấp 3), đặt ngay dưới công việc cha.'],
    ['3. Người giao, người thực hiện, người theo dõi: nhập tên đăng nhập (username); nhiều người theo dõi cách nhau bởi dấu phẩy. Người giao để trống = người nhập.'], ['4. Ngày theo định dạng dd/mm/yyyy. Khẩn cấp/Quan trọng: nhập “Có” hoặc để trống. Hoàn thành thực tế: công việc được ghi nhận đã hoàn thành.'],
    ['5. Mốc dự án: nhập đúng tên mốc đã tạo trong dự án. Trường tùy chỉnh: tên cột trùng tên trường.'], withDeps ? ['6. Phụ thuộc: Key là mã tự đặt, duy nhất trong tệp. Cột Phụ thuộc theo dạng {Key}{Quan hệ}{Thời gian}, ví dụ 1FS1d2h; quan hệ FS, SS, FF, SF; nhiều phụ thuộc cách nhau bởi dấu phẩy.'] : ['6. Tối đa 2.000 dòng mỗi lần nhập.']];
  return X().write([{ name: 'Công việc', header: true, rows: [head].concat(ex), widths: head.map(h => (h === 'Tên công việc' || h === 'Mô tả' ? 36 : 16)) }, { name: 'Hướng dẫn', rows: guide, widths: [120], boldRows: new Set([0]) }]);
}
function ioOpen(start) {
  const P = W.pj(), man = P.can_manage, S = P.settings;
  const tabs = (man ? [['import', 'Nhập công việc'], ['dates', 'Cập nhật thời gian'], ['fvals', 'Cập nhật trường tùy chỉnh'], ['fields', 'Nhập định nghĩa trường']] : []).concat([['export', 'Xuất dữ liệu']]);
  let tab = tabs.some(t => t[0] === start) ? start : tabs[0][0], parsed = null;
  const pane = () => ({
    import: `<p class="t-sub">Tải tệp mẫu, điền công việc rồi chọn tệp để xem trước trước khi nhập (tối đa 2.000 dòng).</p>
      <div class="actions"><button class="btn sm" data-act="io-tpl">Tải tệp mẫu</button>${P.kind === 'project' && S.deps ? '<button class="btn sm" data-act="io-tpl-dep">Tải tệp mẫu có phụ thuộc</button>' : ''}</div>
      ${P.kind === 'project' ? `<label class="check"><input type="checkbox" id="io-dep" ${S.deps ? '' : 'disabled'}> Nhập kèm công việc phụ thuộc (cột Key, Phụ thuộc)${S.deps ? '' : ' — cần bật tính năng phụ thuộc trong Thiết lập'}</label>` : ''}
      <label class="btn sm w-filepick">Chọn tệp .xlsx…<input type="file" id="io-f" accept=".xlsx" aria-label="Chọn tệp Excel"></label><div id="io-prev"></div>`,
    dates: `<p class="t-sub">Tải danh sách công việc hiện tại, sửa cột Ngày bắt đầu/Deadline (dd/mm/yyyy hh:mm) rồi tải lên; khớp theo Mã (ID). Tối đa 300 công việc mỗi lần.</p>
      <div class="actions"><button class="btn sm" data-act="io-dtpl">Tải danh sách công việc</button></div><label class="check"><input type="checkbox" id="io-ds" checked> Cập nhật ngày bắt đầu</label><label class="check"><input type="checkbox" id="io-dd" checked> Cập nhật deadline</label>
      <label class="btn sm w-filepick">Chọn tệp .xlsx…<input type="file" id="io-f" accept=".xlsx" aria-label="Chọn tệp Excel"></label><div id="io-prev"></div>`,
    fvals: `<p class="t-sub">Tải tệp có Mã (ID) và các cột trường tùy chỉnh, sửa giá trị rồi tải lên. Ô trống sẽ xóa giá trị. Không áp dụng cho trường Bảng, Tập tin, Công thức. Tối đa 300 công việc.</p>
      <div class="actions"><button class="btn sm" data-act="io-ftpl">Tải tệp cập nhật</button></div><label class="btn sm w-filepick">Chọn tệp .xlsx…<input type="file" id="io-f" accept=".xlsx" aria-label="Chọn tệp Excel"></label><div id="io-prev"></div>`,
    fields: `<p class="t-sub">Sheet đầu: các cột Name, Type, Content, Required, Input key. Type: int, float, text, textarea, date, datetime, dropdown, m-select, checkbox, file, heading, input-table, input-formula. Content: lựa chọn (cách nhau dấu phẩy), công thức hoặc mô tả.
      Trường Bảng: thêm sheet đặt tên bằng Input key, các cột Name, Type, Width, Content, Required, Sum.</p><div class="actions"><button class="btn sm" data-act="io-fdtpl">Tải tệp mẫu</button></div>
      <label class="btn sm w-filepick">Chọn tệp .xlsx…<input type="file" id="io-f" accept=".xlsx" aria-label="Chọn tệp Excel"></label><div id="io-prev"></div>`,
    export: `<div class="form">${exportOpts('ex')}<div class="field"><span class="lbl">Trường tùy chỉnh</span><label class="check"><input type="checkbox" id="ex-fd" checked> Xuất kèm giá trị</label></div></div>
      <div class="actions"><button class="btn primary" data-act="ex-xlsx">Xuất danh sách công việc (.xlsx)</button><button class="btn" data-act="ex-csv">Xuất CSV</button>${(P.fields || []).some(f => f.type === 'table') ? '<button class="btn" data-act="ex-table">Xuất dữ liệu bảng</button>' : ''}${P.kind === 'project' ? '<button class="btn" data-act="ex-gantt">Xuất Gantt (.xlsx)</button>' : ''}</div>
      <p class="t-sub">Giới hạn: 3.000 công việc và 5.000 công việc con mỗi lần. Tệp xuất dùng cùng cột với tệp mẫu nhập, có thể nhập lại.</p>`
  })[tab];
  const draw = () => {
    openModal(`${mh('Nhập & Xuất dữ liệu', esc(P.name))}<div class="modal-b"><div class="seg" role="tablist">${tabs.map(([k, l]) => `<button data-act="io-tab" data-k="${k}" aria-pressed="${k === tab}">${l}</button>`).join('')}</div><div class="w-io">${pane()}</div><p class="err" id="io-err" hidden></p></div>
      <div class="modal-f"><button class="btn" data-act="close">Đóng</button><button class="btn primary" data-act="io-go" id="io-go" ${['export'].includes(tab) ? 'hidden' : ''} disabled>Thực hiện</button></div>`, H);
    const fi = $('#io-f'); if (fi) fi.onchange = () => preview().catch(e => showErr('#io-err', e));
  };
  const err = e => showErr('#io-err', e);
  async function preview() {
    $('#io-err').hidden = true; parsed = null; $('#io-go').disabled = true; const sheets = await readSheet($('#io-f')), sh = sheets[0];
    if (tab === 'import') {
      const r = parseTasks(sh, P.fields || []), tasks = r.rows.filter(x => !x.group);
      const cols = Object.keys(r.map).filter(k => k !== 'fields').map(k => (IMPORT_COLS[k] || [k])[0]).concat(Object.keys(r.map.fields || {}).map(id => (P.fields.find(f => f.id === Number(id)) || {}).name));
      $('#io-prev').innerHTML = `<p class="notice info">Nhận diện ${tasks.length} công việc (${tasks.filter(x => x.level).length} công việc con), ${r.rows.filter(x => x.group).length} nhóm. Cột: ${cols.map(esc).join(', ')}.</p>
        <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Dòng</th><th>Công việc</th><th>Người thực hiện</th><th>Bắt đầu</th><th>Deadline</th>${$('#io-dep') && $('#io-dep').checked ? '<th>Key</th><th>Phụ thuộc</th>' : ''}</tr></thead><tbody>${r.rows.slice(0, 30).map(x => x.group ? `<tr><td class="num">${x._line}</td><td colspan="4"><b>Nhóm: ${esc(x.group)}</b></td></tr>` : `<tr><td class="num">${x._line}</td><td style="padding-left:${8 + x.level * 18}px">${esc(x.title)}</td><td>${esc(x.assignee || '')}</td><td class="num">${esc(x.start || '')}</td><td class="num">${esc(x.due || '')}</td>${$('#io-dep') && $('#io-dep').checked ? `<td>${esc(x.key || '')}</td><td>${esc(x.deps || '')}</td>` : ''}</tr>`).join('')}</tbody></table></div>${r.rows.length > 30 ? `<p class="t-sub">… và ${r.rows.length - 30} dòng khác.</p>` : ''}`;
      if (tasks.length > 2000) throw new Error('Tệp vượt quá 2.000 dòng.');
      parsed = { url: `/api/projects/${P.id}/import`, body: () => ({ rows: r.rows, with_deps: !!($('#io-dep') && $('#io-dep').checked) }), ok: x => `Đã nhập ${x.tasks} công việc, ${x.groups} nhóm mới${x.deps ? `, ${x.deps} phụ thuộc` : ''}.` };
    } else if (tab === 'dates' || tab === 'fvals') {
      const rows = sh.rows.filter(r => r.some(c => cellStr(c))), m = mapHeader(rows[0], P.fields || []); if (m.id === undefined) throw new Error('Không tìm thấy cột “Mã (ID)”.');
      const data = rows.slice(1).filter(r => cellStr(r[m.id]));
      if (tab === 'dates') { if (m.start === undefined && m.due === undefined) throw new Error('Không tìm thấy cột Ngày bắt đầu hoặc Deadline.');
        const out = data.map(r => ({ id: Number(cellStr(r[m.id])), start: m.start !== undefined ? cellStr(r[m.start]) : '', due: m.due !== undefined ? cellStr(r[m.due]) : '' }));
        $('#io-prev').innerHTML = `<p class="notice info">${out.length} công việc sẽ được cập nhật thời gian.</p>`;
        parsed = { url: `/api/projects/${P.id}/tasks/dates`, body: () => ({ rows: out, start: $('#io-ds').checked, due: $('#io-dd').checked }), ok: x => `Đã cập nhật thời gian ${x.updated} công việc.` };
      } else { const fm = m.fields || {}; if (!Object.keys(fm).length) throw new Error('Không có cột nào trùng tên trường tùy chỉnh.');
        const out = data.map(r => { const values = {}; for (const [fid, ci] of Object.entries(fm)) { const f = P.fields.find(x => x.id === Number(fid)), v = cellStr(r[ci]); values[fid] = !v ? '' : f.type === 'checkbox' ? ['có', 'x', '1', 'true', 'yes'].includes(v.toLowerCase()) : f.type === 'date' ? v.split(' ')[0].split('/').reverse().join('-') : v; } return { id: Number(cellStr(r[m.id])), values }; });
        $('#io-prev').innerHTML = `<p class="notice info">${out.length} công việc, ${Object.keys(fm).length} trường: ${Object.keys(fm).map(id => esc(P.fields.find(f => f.id === Number(id)).name)).join(', ')}.</p>`;
        parsed = { url: `/api/projects/${P.id}/fields/bulk`, body: () => ({ rows: out }), ok: x => `Đã cập nhật trường tùy chỉnh ${x.updated} công việc.` }; }
    } else if (tab === 'fields') {
      const rows = sh.rows.filter(r => r.some(c => cellStr(c))), h = rows[0].map(norm), ix = k => h.indexOf(k);
      if (ix('name') < 0 || ix('type') < 0) throw new Error('Sheet đầu cần các cột Name và Type.');
      const out = rows.slice(1).map(r => { const o = { name: cellStr(r[ix('name')]), type: cellStr(r[ix('type')]), content: ix('content') >= 0 ? cellStr(r[ix('content')]) : '', required: ix('required') >= 0 ? cellStr(r[ix('required')]) : '', input_key: ix('input key') >= 0 ? cellStr(r[ix('input key')]) : '' };
        if (/table/i.test(o.type)) { const cs = sheets.find(s => norm(s.name) === norm(o.input_key)); if (cs) { const ch = cs.rows[0].map(norm), ci = k => ch.indexOf(k);
          o.columns = cs.rows.slice(1).filter(x => cellStr(x[ci('name')])).map(x => { const t = (cellStr(x[ci('type')]) || 'text').toLowerCase().replace('dropdown', 'select').replace('m-select', 'mselect').replace('input-formula', 'formula'), c = ci('content') >= 0 ? cellStr(x[ci('content')]) : '';
            return { name: cellStr(x[ci('name')]), type: t, width: Number(cellStr(x[ci('width')])) || 1, choices: t === 'formula' ? undefined : c, formula: t === 'formula' ? c : undefined, required: /^(1|true|có|required)$/i.test(cellStr(x[ci('required')])), sum: /^(1|true|có)$/i.test(cellStr(x[ci('sum')])) }; }); } }
        return o; });
      $('#io-prev').innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Name</th><th>Type</th><th>Content</th><th>Input key</th></tr></thead><tbody>${out.map(o => `<tr><td>${esc(o.name)}</td><td>${esc(o.type)}${o.columns ? ` (${o.columns.length} cột)` : ''}</td><td>${esc(o.content)}</td><td>${esc(o.input_key)}</td></tr>`).join('')}</tbody></table></div>`;
      parsed = { url: `/api/projects/${P.id}/fields/import`, body: () => ({ rows: out }), ok: x => `Đã nhập ${x.imported} trường tùy chỉnh.` };
    }
    $('#io-go').disabled = !parsed;
  }
  const exp = async (fields) => GET(`/api/projects/${P.id}/export?${exportQS('ex')}${fields ? '&fields=all' : ''}`);
  const H = {
    'io-tab': b => { tab = b.dataset.k; parsed = null; draw(); },
    'io-tpl': () => X().download(templateXlsx(P, false), `mau-nhap-cong-viec.xlsx`),
    'io-tpl-dep': () => X().download(templateXlsx(P, true), `mau-nhap-cong-viec-phu-thuoc.xlsx`),
    'io-dtpl': b => busy(b, async () => { try { const r = await GET(`/api/projects/${P.id}/export?sub=1`); X().download(X().write([{ name: 'Thời gian', header: true, widths: [10, 44, 20, 20], rows: [['Mã (ID)', 'Tên công việc', 'Ngày bắt đầu', 'Deadline']].concat(r.rows.slice(0, 300).map(t => [t.id, t.title, dmy(t.start_date), dmy(t.due_date) + (t.due_time ? ' ' + t.due_time : '')])) }]), `cap-nhat-thoi-gian-${dlName(P.name)}.xlsx`); } catch (e) { err(e); } }),
    'io-ftpl': b => busy(b, async () => { try { const r = await GET(`/api/projects/${P.id}/export?sub=1&fields=all`), fs = r.fields.filter(f => !['heading', 'formula', 'file', 'table'].includes(f.type)); if (!fs.length) return err(new Error('Dự án chưa có trường tùy chỉnh nhập được.'));
      X().download(X().write([{ name: 'Trường tùy chỉnh', header: true, widths: [10, 40].concat(fs.map(() => 18)), rows: [['Mã (ID)', 'Tên công việc'].concat(fs.map(f => f.name))].concat(r.rows.slice(0, 300).map(t => [t.id, t.title].concat(fs.map(f => cellOf(f, t.fields[f.id]))))) }]), `cap-nhat-truong-${dlName(P.name)}.xlsx`); } catch (e) { err(e); } }),
    'io-fdtpl': () => X().download(X().write([{ name: 'Fields', header: true, widths: [28, 16, 40, 10, 16], rows: [['Name', 'Type', 'Content', 'Required', 'Input key'], ['Khách hàng', 'text', 'Tên khách hàng', '1', 'khach_hang'], ['Mức độ', 'dropdown', 'Cao, Trung bình, Thấp', '', 'muc_do'], ['Số lượng', 'int', '', '', 'so_luong'], ['Đơn giá', 'float', '', '', 'don_gia'], ['Thành tiền', 'input-formula', '$so_luong*$don_gia', '', 'thanh_tien'], ['Chi tiết hàng', 'input-table', '', '', 'chi_tiet']] },
      { name: 'chi_tiet', header: true, widths: [20, 12, 8, 30, 10, 8], rows: [['Name', 'Type', 'Width', 'Content', 'Required', 'Sum'], ['Mặt hàng', 'text', 3, '', 1, ''], ['SL', 'int', 1, '', '', ''], ['Đơn giá', 'float', 2, '', '', ''], ['Thành tiền', 'input-formula', 2, '$sl*$don_gia', '', 1]] }]), 'mau-truong-tuy-chinh.xlsx'),
    'io-go': b => busy(b, async () => { if (!parsed) return; try { const x = await POST(parsed.url, parsed.body()); closeModal(); toast(parsed.ok(x)); if (x.errors && x.errors.length) toast(x.errors.slice(0, 3).join(' '), true); W.setPJ(await GET('/api/projects/' + P.id)); render(); } catch (e) { err(e); } }),
    'ex-xlsx': b => busy(b, async () => { try { const r = await exp($('#ex-fd').checked); X().download(X().write([taskSheet(r.rows, r.users, r.fields, r.milestones)]), `${dlName(P.name)}-${TODAY()}.xlsx`); toast(`Đã xuất ${r.rows.length} dòng`); } catch (e) { err(e); } }),
    'ex-csv': b => busy(b, async () => { try { const r = await exp($('#ex-fd').checked), s = taskSheet(r.rows, r.users, r.fields, r.milestones), q = v => { const t = String(v ?? ''); return /[",\n;]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
      X().download(new Blob(['﻿' + s.rows.map(row => row.map(q).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }), `${dlName(P.name)}-${TODAY()}.csv`); } catch (e) { err(e); } }),
    'ex-table': b => busy(b, async () => { try { const r = await exp(true), sheets = r.fields.filter(f => f.type === 'table').map(f => { const cols = f.options.columns, rows = [['Mã (ID)', 'Công việc'].concat(cols.map(c => c.name))];
      for (const t of r.rows) { const v = t.fields[f.id]; for (const x of (v && v.rows) || []) rows.push([t.id, t.title].concat(cols.map(c => Array.isArray(x[c.key]) ? x[c.key].join(', ') : x[c.key] ?? ''))); if (v && v.rows && v.rows.length && cols.some(c => c.sum)) rows.push(['', 'Tổng'].concat(cols.map(c => (c.sum ? v.sums[c.key] : '')))); }
      return { name: f.name, header: true, rows, widths: [10, 36].concat(cols.map(c => 8 + c.width * 4)) }; }); X().download(X().write(sheets), `bang-du-lieu-${dlName(P.name)}.xlsx`); } catch (e) { err(e); } }),
    'ex-gantt': b => busy(b, async () => { try { const r = await exp(false), ts = r.rows.filter(t => t.start_date || t.due_date); if (!ts.length) return err(new Error('Không có công việc có thời gian.'));
      const d0 = ts.reduce((m, t) => ((t.start_date || t.due_date) < m ? t.start_date || t.due_date : m), '9999'), d1 = ts.reduce((m, t) => ((t.due_date || t.start_date) > m ? t.due_date || t.start_date : m), '0000'), n = Math.min(dayNum(d1) - dayNum(d0) + 1, 180);
      const days = Array.from({ length: n }, (_, i) => addDays(d0, i)), rows = [['Mã', 'Công việc', 'Người thực hiện', 'Bắt đầu', 'Deadline', 'Trạng thái'].concat(days.map(d => d.slice(8) + '/' + d.slice(5, 7)))], fill = {};
      ts.forEach((t, ri) => { const s = t.start_date || t.due_date, e = t.due_date || t.start_date; rows.push([t.id, (t.parent_id ? '  ' : '') + t.title, (r.users[t.assignee_id] || {}).full_name || '', dmy(t.start_date), dmy(t.due_date), W.ST[t.status]].concat(days.map(() => '')));
        days.forEach((d, ci) => { if (d >= s && d <= e) fill[`${ri + 1},${ci + 6}`] = t.status === 'done' ? '#2E8B57' : W.late(t) ? '#C0392B' : '#3A7BD5'; }); });
      X().download(X().write([{ name: 'Gantt', header: true, rows, fill, widths: [8, 36, 20, 12, 12, 12].concat(days.map(() => 4)) }]), `gantt-${dlName(P.name)}.xlsx`); if (n === 180) toast('Biểu đồ giới hạn 180 ngày đầu.'); } catch (e) { err(e); } })
  };
  draw();
}
SO.ACTIONS['w-io'] = () => ioOpen();

/* ============ Tùy chọn khác của dự án (Base bài 63000273296: nhân bản; lưu mẫu; chuyển loại; đóng; xóa) ============ */
SO.ACTIONS['w-pmenu'] = () => {
  const P = W.pj(), cfg = W.CFG || {}, canClone = P.can_manage && (P.kind === 'team' ? cfg.can_create_team : cfg.can_create_project) !== false;
  const item = (act, t, d, cls = '') => `<button class="w-menu-i ${cls}" data-act="${act}"><b>${t}</b><span class="t-sub">${d}</span></button>`;
  openModal(`${mh('Tùy chọn khác', esc(P.name))}<div class="modal-b"><div class="w-menu">
    ${canClone ? item('pm-clone', 'Nhân bản ' + W.KIND[P.kind].toLowerCase(), 'Tạo bản sao gồm thành viên, nhóm, công việc theo tùy chọn') : ''}
    ${P.can_manage ? item('pm-tpl', 'Lưu thành mẫu', 'Lưu cấu hình để tạo nhanh dự án/phòng ban mới') : ''}
    ${P.can_manage ? item('pm-kind', 'Chuyển thành ' + (P.kind === 'project' ? 'phòng ban' : 'dự án'), 'Đổi loại; thời gian dự án bị bỏ khi chuyển sang phòng ban') : ''}
    ${P.can_manage ? item('pm-status', P.status === 'closed' ? 'Mở lại' : 'Đóng ' + W.KIND[P.kind].toLowerCase(), 'Đến mục Trạng thái trong Tùy chỉnh') : ''}
    ${P.can_delete ? item('pm-del', 'Xóa ' + W.KIND[P.kind].toLowerCase(), 'Xóa vĩnh viễn cùng toàn bộ công việc', 'danger') : ''}
  </div></div><div class="modal-f"><button class="btn" data-act="close">Đóng</button></div>`, {
    'pm-clone': () => cloneForm(P), 'pm-tpl': () => tplForm(P, null),
    'pm-kind': () => { closeModal(); W.go({ p: P.id, v: 'settings', s: 'status' }); },
    'pm-status': () => { closeModal(); W.go({ p: P.id, v: 'settings', s: 'status' }); },
    'pm-del': () => { closeModal(); SO.ACTIONS['w-pdel'](); } });
};
function cloneForm(P) {
  const ck = (id, l, on = true) => `<label class="check"><input type="checkbox" id="${id}" ${on ? 'checked' : ''}> ${l}</label>`;
  openModal(`${mh('Nhân bản ' + W.KIND[P.kind].toLowerCase(), esc(P.name))}<div class="modal-b"><div class="form">
    <div class="field full"><label for="pc-n">Tên mới</label><input id="pc-n" maxlength="120" value="${esc(('Bản sao ' + P.name).slice(0, 120))}"></div>
    <div class="field full w-sets"><span class="lbl">Thành viên và cấu hình</span>${ck('pc-mg', 'Giữ quản lý')}${ck('pc-mb', 'Giữ thành viên')}${ck('pc-st', 'Giữ thiết lập')}${ck('pc-pm', 'Giữ phân quyền')}${ck('pc-fd', 'Giữ trường tùy chỉnh và giá trị')}${ck('pc-tg', 'Giữ thẻ (tags)')}</div>
    <div class="field"><label for="pc-t">Công việc</label><select id="pc-t"><option value="all">Nhân bản nhóm và công việc</option><option value="groups">Chỉ nhân bản nhóm công việc</option><option value="none">Không nhân bản công việc</option></select></div>
    <div class="field"><label for="pc-dl">Thời hạn công việc</label><select id="pc-dl"><option value="keep">Giữ nguyên thời hạn</option><option value="shift">Dời thời hạn</option><option value="none">Bỏ thời hạn</option></select></div>
    <div class="field" id="pc-shw" hidden><label for="pc-sh">Dời thêm (giờ, 24 giờ = 1 ngày)</label><input type="number" id="pc-sh" value="168" step="24"></div>
    <div class="field full w-sets" id="pc-tk"><span class="lbl">Trong công việc</span>${ck('pc-as', 'Giữ người thực hiện')}${ck('pc-cr', 'Giữ người giao việc')}${ck('pc-fl', 'Giữ người theo dõi')}${ck('pc-cl', 'Giữ checklist')}${ck('pc-sb', 'Giữ công việc con')}${ck('pc-sd', 'Giữ thời hạn công việc con')}</div>
  </div><p class="t-sub">Công việc nhân bản ở trạng thái Cần làm, tiến độ 0%. Phụ thuộc và mốc dự án được sao chép theo.</p><p class="err" id="pc-err" hidden></p></div>
  <div class="modal-f"><button class="btn" data-act="close">Hủy</button><button class="btn primary" data-act="pc-go">Nhân bản</button></div>`, {
    'pc-go': b => busy(b, async () => { const v = id => $('#' + id).checked;
      try { const n = await POST(`/api/projects/${P.id}/clone`, { name: $('#pc-n').value, tasks: $('#pc-t').value, deadline: $('#pc-dl').value, shift_hours: Number($('#pc-sh').value) || 0, keep_managers: v('pc-mg'), keep_members: v('pc-mb'), keep_settings: v('pc-st'), keep_perm: v('pc-pm'), keep_fields: v('pc-fd'), keep_tags: v('pc-tg'),
        keep_assignee: v('pc-as'), keep_creator: v('pc-cr'), keep_followers: v('pc-fl'), keep_checklist: v('pc-cl'), keep_subtasks: v('pc-sb'), keep_sub_deadline: v('pc-sd') });
        closeModal(); await refreshBoot(); toast(`Đã nhân bản thành “${n.name}”`); W.go({ p: n.id }); } catch (e) { showErr('#pc-err', e); } }) });
  $('#pc-dl').onchange = () => { $('#pc-shw').hidden = $('#pc-dl').value !== 'shift'; };
  $('#pc-t').onchange = () => { $('#pc-tk').hidden = $('#pc-t').value !== 'all'; };
}

/* ============ Tạo từ mẫu; Xuất công việc của tôi ============ */
SO.ACTIONS['w-from-tpl'] = async () => {
  let tpl; try { tpl = await GET('/api/work/templates'); } catch (e) { return toast(e.message, true); }
  const cfg = W.CFG || {}, ok = t => (t.kind === 'team' ? cfg.can_create_team : cfg.can_create_project) !== false;
  const card = (t, b) => `<button class="w-menu-i" data-act="ft-pick" data-id="${t.id}" ${ok(t) ? '' : 'disabled'}><b>${esc(t.name)}</b><span class="t-sub">${W.KIND[t.kind]}${b ? ` · ${t.groups} nhóm · ${t.fields} trường` : ` · ${esc(userName(t.owner_id))}`}</span></button>`;
  openModal(`${mh('Tạo dự án / phòng ban từ mẫu')}<div class="modal-b"><h3 class="sec-t">Mẫu dựng sẵn</h3><div class="w-menu">${tpl.builtin.map(t => card(t, true)).join('')}</div>
    <h3 class="sec-t">Mẫu của tôi và được chia sẻ</h3><div class="w-menu">${tpl.mine.map(t => card(t, false)).join('') || '<p class="hint">Chưa có mẫu. Quản lý dự án lưu mẫu tại “Tùy chọn khác → Lưu thành mẫu”.</p>'}</div></div><div class="modal-f"><button class="btn" data-act="close">Đóng</button></div>`, {
    'ft-pick': b => { const id = b.dataset.id, t = tpl.builtin.concat(tpl.mine).find(x => String(x.id) === id); W.newProject({ template_id: id, kind: t && t.kind, template_name: t && t.name }); } });
};
SO.ACTIONS['w-export-mine'] = () => openModal(`${mh('Xuất công việc của tôi', 'Công việc tôi là người thực hiện')}<div class="modal-b"><div class="form">${exportOpts('em')}</div><p class="t-sub">Giới hạn 3.000 công việc và 5.000 công việc con.</p><p class="err" id="em-err" hidden></p></div>
  <div class="modal-f"><button class="btn" data-act="close">Hủy</button><button class="btn primary" data-act="em-go">Xuất Excel</button></div>`, {
  'em-go': b => busy(b, async () => { try { const r = await GET('/api/work/export-mine?' + exportQS('em')); X().download(X().write([taskSheet(r.rows, r.users, [], [], { project: true })]), `cong-viec-cua-toi-${TODAY()}.xlsx`); closeModal(); toast(`Đã xuất ${r.rows.length} dòng`); } catch (e) { showErr('#em-err', e); } }) });
})();
