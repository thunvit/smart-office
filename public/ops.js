/* SmartOffice — Vận hành tự chủ (ADR-012): Cập nhật tiến độ tuần (phân hệ 26), Giám sát – Cảnh báo (phân hệ 30) */
(function () {
'use strict';
const S = window.SO;
const { $, $$, esc, TODAY, addDays, fmtD, GET, POST, PUT, U, Dp, who, toast, showErr, busy, VIEWS, ACTIONS, render, refreshBoot } = S;
const B = () => S.B;
const pad = n => String(n).padStart(2, '0');
const isoD = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const mondayOf = s => { const d = new Date(s + 'T00:00:00'); const w = d.getDay() || 7; d.setDate(d.getDate() - w + 1); return isoD(d); };
const weekLabel = w => `${fmtD(w).slice(0, 5)} – ${fmtD(addDays(w, 6))}`;
let ctx = null; // { is_manager, is_top, head_depts, params, can_edit }
const loadCtx = async () => (ctx = await GET('/api/ops/settings'));
const deptChoices = () => B().departments.filter(d => ctx.is_top || ctx.head_depts.includes(d.id));

/* ======================================================== CẬP NHẬT TIẾN ĐỘ TUẦN */
let ckWeek = null, ckTab = 'me', ckDept = '';
VIEWS['cap-nhat-tuan'] = async main => {
  await loadCtx();
  if (!ckWeek) ckWeek = mondayOf(TODAY());
  if (!ctx.is_manager) ckTab = 'me';
  const head = `<div class="page-head"><div><h1>Cập nhật tiến độ tuần</h1><p>Tuần ${weekLabel(ckWeek)}${ckWeek === mondayOf(TODAY()) ? ' (tuần này)' : ''} · nhân sự tự cập nhật, quản lý xem và phản hồi</p></div>
    <div class="actions">${ctx.is_manager ? `<div class="seg" role="group" aria-label="Phạm vi"><button data-act="ck-tab" data-v="me" aria-pressed="${ckTab === 'me'}">Của tôi</button><button data-act="ck-tab" data-v="team" aria-pressed="${ckTab === 'team'}">Nhóm của tôi</button></div>` : ''}</div></div>
    <div class="toolbar"><div class="seg"><button data-act="ck-week" data-v="-7">← Tuần trước</button><button data-act="ck-week" data-v="0">Tuần này</button><button data-act="ck-week" data-v="7">Tuần sau →</button></div>
    ${ckTab === 'team' && deptChoices().length > 1 ? `<select class="sel" id="ck-dept" aria-label="Phòng ban"><option value="">${ctx.is_top ? 'Toàn đơn vị' : 'Các phòng tôi phụ trách'}</option>${deptChoices().map(d => `<option value="${d.id}" ${String(d.id) === ckDept ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select>` : ''}</div>`;
  if (ckTab === 'team') return renderTeam(main, head);
  const d = await GET('/api/ops/checkin?week=' + ckWeek), c = d.checkin || {};
  const ro = !d.editable;
  const sg = d.suggest;
  main.innerHTML = head + `<div class="two-col">
    <section class="card"><div class="card-h"><h2>Báo cáo của tôi</h2>${d.checkin ? `<span class="muted" style="font-size:12.5px">Cập nhật lúc ${esc(String(c.updated_at || '').slice(11, 16))} ${fmtD(c.updated_at)}</span>` : ''}</div>
      <div class="card-b"><div class="form">
        <div class="field full"><label for="ck-done">Đã làm trong tuần</label><textarea id="ck-done" maxlength="3000" ${ro ? 'readonly' : ''} placeholder="Kết quả chính đã đạt được">${esc(c.done || '')}</textarea></div>
        <div class="field full"><label for="ck-next">Sẽ làm tuần tới</label><textarea id="ck-next" maxlength="3000" ${ro ? 'readonly' : ''} placeholder="Việc ưu tiên, gắn với mục tiêu được giao">${esc(c.next || '')}</textarea></div>
        <div class="field full"><label for="ck-blk">Vướng mắc</label><textarea id="ck-blk" maxlength="3000" ${ro ? 'readonly' : ''} placeholder="Khó khăn, việc cần phòng ban khác phối hợp">${esc(c.blockers || '')}</textarea></div>
        <label class="check full"><input type="checkbox" id="ck-help" ${c.need_help ? 'checked' : ''} ${ro ? 'disabled' : ''}> Đề nghị quản lý hỗ trợ</label>
      </div><p class="err" id="ck-err" hidden></p>
      ${c.ack_at ? `<div class="stat-box" style="margin-top:12px"><b>${esc(c.ack_name || '')}</b> đã ghi nhận ${fmtD(c.ack_at)}${c.ack_note ? `<p class="pre">${esc(c.ack_note)}</p>` : ''}</div>` : ''}
      ${ro ? '<p class="muted" style="margin-top:12px">Chỉ cập nhật được tuần này hoặc tuần liền trước.</p>' : `<div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end"><button class="btn primary" data-act="ck-save">${d.checkin ? 'Lưu thay đổi' : 'Gửi cập nhật'}</button></div>`}
      ${d.checkin && c.ack_at && !ro ? '<p class="t-sub" style="margin-top:6px">Sửa sau khi đã được ghi nhận thì quản lý cần ghi nhận lại.</p>' : ''}</div></section>
    <section class="card"><div class="card-h"><h2>Gợi ý từ dữ liệu công việc</h2></div><div class="card-b">
      <h3 class="sec-t">Việc đã hoàn thành trong tuần (${sg.done.length})</h3>
      ${sg.done.length ? `<ul class="ops-ul">${sg.done.map(t => `<li><a href="#cong-viec" data-task="${t.id}">${esc(t.title)}</a>${t.project_name ? ` <span class="t-sub">· ${esc(t.project_name)}</span>` : ''}</li>`).join('')}</ul>${ro ? '' : '<button class="btn sm" data-act="ck-fill" data-v="done">Chèn vào "Đã làm"</button>'}` : '<p class="muted">Chưa có việc hoàn thành trong tuần.</p>'}
      <h3 class="sec-t" style="margin-top:14px">Việc đang mở đến hạn trong 2 tuần (${sg.open.length})</h3>
      ${sg.open.length ? `<ul class="ops-ul">${sg.open.map(t => `<li><a href="#cong-viec" data-task="${t.id}">${esc(t.title)}</a> <span class="t-sub">· ${t.due_date ? 'hạn ' + fmtD(t.due_date) : 'chưa có hạn'}${t.progress ? ' · ' + t.progress + '%' : ''}</span></li>`).join('')}</ul>${ro ? '' : '<button class="btn sm" data-act="ck-fill" data-v="next">Chèn vào "Sẽ làm"</button>'}` : '<p class="muted">Không có việc đang mở.</p>'}
      <h3 class="sec-t" style="margin-top:14px">Mục tiêu cá nhân chu kỳ hiện hành</h3>
      ${sg.goals.length ? `<ul class="ops-ul">${sg.goals.map(g => `<li>${esc(g.title)} <span class="t-sub">· ${S.numFmt(g.current)}/${S.numFmt(g.target)} ${esc(g.unit)} (${Math.round(g.current / g.target * 100) || 0}%)</span></li>`).join('')}</ul>` : '<p class="muted">Chưa được giao mục tiêu cá nhân.</p>'}
    </div></section></div>`;
  main._ck = d;
};
async function renderTeam(main, head) {
  const d = await GET('/api/ops/checkins?' + new URLSearchParams(Object.assign({ week: ckWeek }, ckDept ? { dept_id: ckDept } : {})));
  const st = r => !r.checkin ? '<span class="pill s-todo">Chưa cập nhật</span>' : r.checkin.need_help && !r.checkin.ack_at ? '<span class="pill s-late">Cần hỗ trợ</span>'
    : r.checkin.ack_at ? '<span class="pill s-done">Đã ghi nhận</span>' : '<span class="pill s-doing">Đã cập nhật</span>';
  main.innerHTML = head + `<div class="stats">
    <div class="card stat"><span class="k">Nhân sự trong phạm vi</span><span class="v num">${d.summary.total}</span></div>
    <div class="card stat"><span class="k">Đã cập nhật</span><span class="v num">${d.summary.submitted}</span><span class="s">${d.summary.total ? Math.round(d.summary.submitted / d.summary.total * 100) : 0}%</span></div>
    <div class="card stat ${d.summary.total - d.summary.submitted ? 'alert' : ''}"><span class="k">Chưa cập nhật</span><span class="v num">${d.summary.total - d.summary.submitted}</span></div>
    <div class="card stat ${d.summary.need_help ? 'alert' : ''}"><span class="k">Cần hỗ trợ, chưa ghi nhận</span><span class="v num">${d.summary.need_help}</span></div></div>
    <section class="card"><div class="list">${d.rows.map(r => `<div class="ops-ck"><div class="ops-ck-h">${who(r.user_id)}<span class="t-sub">${esc(r.title || '')} · ${esc(Dp(r.dept_id).name)}</span>${st(r)}</div>
      ${r.checkin ? `<div class="ops-ck-b"><div><h3 class="sec-t">Đã làm</h3><p class="pre">${esc(r.checkin.done) || '—'}</p></div><div><h3 class="sec-t">Sẽ làm</h3><p class="pre">${esc(r.checkin.next) || '—'}</p></div><div><h3 class="sec-t">Vướng mắc</h3><p class="pre">${esc(r.checkin.blockers) || '—'}</p></div></div>
        ${r.checkin.ack_at ? `<p class="t-sub">${esc(r.checkin.ack_name || '')} ghi nhận ${fmtD(r.checkin.ack_at)}${r.checkin.ack_note ? ': ' + esc(r.checkin.ack_note) : ''}</p>`
          : r.user_id !== B().me.id ? `<div class="ops-ack"><label class="sr-only" for="ack-${r.checkin.id}">Phản hồi cho ${esc(r.full_name)}</label><input id="ack-${r.checkin.id}" maxlength="1000" placeholder="Phản hồi, hướng xử lý (không bắt buộc)"><button class="btn sm primary" data-act="ck-ack" data-id="${r.checkin.id}">Ghi nhận</button></div>` : ''}` : ''}</div>`).join('') || '<div class="empty">Không có nhân sự trong phạm vi.</div>'}</div></section>`;
}
ACTIONS['ck-tab'] = a => { ckTab = a.dataset.v; render(); };
ACTIONS['ck-week'] = a => { const n = Number(a.dataset.v); ckWeek = n ? addDays(ckWeek, n) : mondayOf(TODAY()); render(); };
ACTIONS['ck-fill'] = a => {
  const d = $('#main')._ck; if (!d) return;
  const el = a.dataset.v === 'done' ? $('#ck-done') : $('#ck-next');
  const lines = (a.dataset.v === 'done' ? d.suggest.done : d.suggest.open).map(t => '- ' + t.title + (a.dataset.v === 'next' && t.due_date ? ` (hạn ${fmtD(t.due_date)})` : ''));
  const have = new Set(el.value.split('\n').map(s => s.trim()));
  el.value = (el.value.trim() ? el.value.trim() + '\n' : '') + lines.filter(l => !have.has(l)).join('\n');
  el.focus();
};
ACTIONS['ck-save'] = btn => busy(btn, async () => {
  try {
    await PUT('/api/ops/checkin', { week: ckWeek, done: $('#ck-done').value, next: $('#ck-next').value, blockers: $('#ck-blk').value, need_help: $('#ck-help').checked });
    toast('Đã lưu cập nhật tiến độ tuần.'); refreshBoot(); render();
  } catch (e) { showErr('#ck-err', e); }
});
ACTIONS['ck-ack'] = btn => busy(btn, async () => {
  try { await POST(`/api/ops/checkins/${btn.dataset.id}/ack`, { note: ($('#ack-' + btn.dataset.id) || {}).value || '' }); toast('Đã ghi nhận.'); refreshBoot(); render(); }
  catch (e) { toast(e.message, true); }
});
document.addEventListener('change', e => { if (e.target.id === 'ck-dept') { ckDept = e.target.value; render(); } });

/* ======================================================== GIÁM SÁT – CẢNH BÁO */
const TYPE = { overdue: 'Quá hạn', due_soon: 'Sắp đến hạn', unassigned: 'Chưa có người nhận', overload: 'Quá tải', goal_lag: 'Mục tiêu chậm', checkin_missing: 'Chưa cập nhật tuần', need_help: 'Cần hỗ trợ' };
const LV = { 3: 'Mức 3 · Giám đốc', 2: 'Mức 2 · Trưởng phòng', 1: 'Mức 1 · Người thực hiện' };
let gsTab = 'mine', gsLv = 1, gsDept = '';
VIEWS['giam-sat'] = async main => {
  await loadCtx();
  if (!ctx.is_manager) gsTab = 'mine';
  const d = await GET('/api/ops/alerts?' + new URLSearchParams(Object.assign({ scope: gsTab, min_level: gsLv }, gsTab === 'team' && gsDept ? { dept_id: gsDept } : {})));
  const P = d.params;
  const open = it => it.ref.kind === 'task' ? `data-task="${it.ref.id}"` : it.ref.kind === 'goal' ? 'data-ops-go="muc-tieu"' : it.ref.kind === 'checkin' ? `data-ops-go="cap-nhat-tuan" data-ops-week="${esc(it.ref.id)}"` : '';
  main.innerHTML = `<div class="page-head"><div><h1>Giám sát – Cảnh báo</h1><p>Hệ thống tự phát hiện việc cần chú ý; quá hạn từ ${P.lv2_days} ngày chuyển trưởng phòng, từ ${P.lv3_days} ngày chuyển giám đốc</p></div>
    <div class="actions">${ctx.is_manager ? `<div class="seg" role="group" aria-label="Phạm vi"><button data-act="gs-tab" data-v="mine" aria-pressed="${gsTab === 'mine'}">Của tôi</button><button data-act="gs-tab" data-v="team" aria-pressed="${gsTab === 'team'}">Nhóm của tôi</button></div>` : ''}</div></div>
    <div class="stats">${[3, 2, 1].map(l => `<button class="card stat ops-stat lv-b${l}" data-act="gs-lv" data-v="${l}" aria-pressed="${gsLv === l}"><span class="k">${LV[l]}</span><span class="v num">${d.counts[l]}</span><span class="s">${gsLv === l ? 'đang lọc từ mức này' : 'bấm để lọc từ mức này'}</span></button>`).join('')}
      <div class="card stat"><span class="k">Tổng số cảnh báo</span><span class="v num">${d.total}</span><span class="s">${gsTab === 'team' ? 'nhân sự trong phạm vi phụ trách' : 'của tôi'}</span></div></div>
    ${gsTab === 'team' && deptChoices().length > 1 ? `<div class="toolbar"><select class="sel" id="gs-dept" aria-label="Phòng ban"><option value="">${ctx.is_top ? 'Toàn đơn vị' : 'Các phòng tôi phụ trách'}</option>${deptChoices().map(x => `<option value="${x.id}" ${String(x.id) === gsDept ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>` : ''}
    <section class="card"><div class="list">${d.items.map(it => `<div class="item ops-item" ${open(it)} tabindex="0">
      <div><div class="t-title"><span class="pill lv-${it.level}">${LV[it.level]}</span> <span class="tag">${TYPE[it.type] || esc(it.type)}</span> ${esc(it.title)}</div>
      <div class="t-sub">${esc(it.detail)}</div></div>
      <div>${gsTab === 'team' || it.user_id !== B().me.id ? who(it.user_id) : ''}</div></div>`).join('') || `<div class="empty">${d.total ? 'Không có cảnh báo từ mức đã chọn.' : 'Không có cảnh báo. Mọi việc đang đúng tiến độ.'}</div>`}</div></section>
    ${d.items.length < d.total && gsLv === 1 ? `<p class="t-sub">Hiển thị ${d.items.length}/${d.total} cảnh báo đầu tiên.</p>` : ''}
    ${ctx.can_edit ? settingsCard(P) : ''}`;
};
function settingsCard(P) {
  const f = (k, l, h) => `<div class="field"><label for="op-${k}">${l}</label><input id="op-${k}" type="number" inputmode="numeric" value="${P[k]}"><span class="t-sub">${h}</span></div>`;
  return `<section class="card" style="margin-top:16px"><div class="card-h"><h2>Tham số giám sát (quản trị viên)</h2></div><div class="card-b"><div class="form">
    ${f('due_soon_days', 'Báo trước hạn (ngày)', 'Cảnh báo người thực hiện trước thời hạn')}
    ${f('lv2_days', 'Chuyển trưởng phòng khi quá hạn (ngày)', 'Mức 2')}
    ${f('lv3_days', 'Chuyển giám đốc khi quá hạn (ngày)', 'Mức 3, phải lớn hơn mức 2')}
    ${f('overload_open', 'Ngưỡng quá tải (số việc đang mở)', 'Gấp đôi ngưỡng thì chuyển trưởng phòng')}
    ${f('goal_lag_pct', 'Mục tiêu chậm từ (điểm %)', 'So với phần thời gian đã qua của chu kỳ')}
    <div class="field"><label for="op-checkin_wd">Hạn cập nhật tuần</label><select id="op-checkin_wd">${[1, 2, 3, 4, 5, 6, 7].map(n => `<option value="${n}" ${P.checkin_wd === n ? 'selected' : ''}>${['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ nhật'][n - 1]}</option>`).join('')}</select><span class="t-sub">Chưa cập nhật tuần trước thì chuyển trưởng phòng</span></div>
    <div class="field"><label for="op-since">Áp dụng cập nhật tuần từ ngày</label><input id="op-since" type="date" value="${esc(P.since || '')}"><span class="t-sub">Không cảnh báo các tuần trước ngày này</span></div>
  </div><p class="err" id="op-err" hidden></p><div style="margin-top:12px;display:flex;justify-content:flex-end"><button class="btn primary" data-act="ops-save">Lưu tham số</button></div></div></section>`;
}
ACTIONS['gs-tab'] = a => { gsTab = a.dataset.v; render(); };
ACTIONS['gs-lv'] = a => { gsLv = Number(a.dataset.v) === gsLv ? 1 : Number(a.dataset.v); render(); };
ACTIONS['ops-save'] = btn => busy(btn, async () => {
  const b = {}; ['due_soon_days', 'lv2_days', 'lv3_days', 'overload_open', 'goal_lag_pct', 'checkin_wd'].forEach(k => { b[k] = Number($('#op-' + k).value); });
  b.since = $('#op-since').value;
  try { await PUT('/api/ops/settings', b); toast('Đã lưu tham số giám sát.'); refreshBoot(); render(); } catch (e) { showErr('#op-err', e); }
});
document.addEventListener('change', e => { if (e.target.id === 'gs-dept') { gsDept = e.target.value; render(); } });
const go = el => { if (el.dataset.opsWeek) { ckWeek = el.dataset.opsWeek; ckTab = gsTab === 'team' ? 'team' : 'me'; } location.hash = '#' + el.dataset.opsGo; };
document.addEventListener('click', e => { const el = e.target.closest('[data-ops-go]'); if (el && !e.target.closest('#modal')) go(el); });
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const el = e.target.closest && e.target.closest('.ops-item'); if (!el || e.target !== el) return;
  e.preventDefault(); el.click();
});
})();
