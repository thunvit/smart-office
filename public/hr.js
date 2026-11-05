/* SmartOffice — Phân hệ Chấm công – Bảng công và Tiền lương */
(function () {
'use strict';
const S = window.SO;
const { $, $$, esc, pad, TODAY, fmtD, fmtDT, vnd, numFmt, GET, POST, PUT, U, Dp, av, who, deptOpts, openModal, closeModal, toast, showErr, mh, busy, armed, VIEWS, ACTIONS, render } = S;
const B = () => S.B;
const WDS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const CODE = { X: 'Đủ công', M: 'Đi muộn / về sớm', GT: 'Đã giải trình', P: 'Nghỉ phép', 'P/2': 'Nghỉ phép nửa ngày', CT: 'Công tác', L: 'Nghỉ lễ, Tết', V: 'Vắng không lý do' };
const codeCls = c => ({ X: 'c-x', M: 'c-m', GT: 'c-gt', P: 'c-p', 'P/2': 'c-p', CT: 'c-ct', L: 'c-l', V: 'c-v' }[c] || '');
const money = n => (Number(n) || 0).toLocaleString('vi-VN');
const monthLabel = m => `tháng ${m.slice(5)}/${m.slice(0, 4)}`;
const moneyInput = (id, v) => `<input id="${id}" inputmode="numeric" class="money-in" value="${v ? money(v) : ''}" placeholder="0">`;
const readMoney = id => String(($('#' + id) || {}).value || '').replace(/\D/g, '');
document.addEventListener('input', e => { if (e.target.classList.contains('money-in')) { const n = e.target.value.replace(/\D/g, ''); e.target.value = n ? Number(n).toLocaleString('vi-VN') : ''; } });

/* ================= CHẤM CÔNG – BẢNG CÔNG ================= */
let ccMonth = TODAY().slice(0, 7), ccDept = '', ccMine = false;
VIEWS['cham-cong'] = async main => {
  const [today, sh] = await Promise.all([GET('/api/attendance/today'), GET('/api/attendance/sheet?' + new URLSearchParams({ month: ccMonth, dept: ccDept, mine: ccMine ? '1' : '' }))]);
  const r = today.record, me = B().me;
  const myRow = sh.rows.find(x => x.user_id === me.id);
  const rows = sh.rows.slice().sort((a, b) => (a.user_id === me.id ? -1 : b.user_id === me.id ? 1 : U(a.user_id).full_name.localeCompare(U(b.user_id).full_name, 'vi')));
  main.innerHTML = `
  <div class="page-head"><div><h1>Chấm công – Bảng công</h1><p>Giờ làm việc ${esc(sh.settings.work_start)} – ${esc(sh.settings.work_end)} · cho phép trễ ${sh.settings.late_grace} phút · ${sh.settings.work_saturday ? 'làm việc thứ Bảy' : 'nghỉ thứ Bảy, Chủ nhật'}</p></div>
  <div class="actions"><button class="btn" data-act="req-preset" data-type="giaitrinh">+ Giải trình</button><button class="btn" data-act="req-preset" data-type="tangca">+ Đăng ký làm thêm giờ</button><button class="btn" data-act="req-preset" data-type="congtac">+ Đề nghị công tác</button></div></div>
  <div class="grid2" style="margin-bottom:16px;grid-template-columns:minmax(0,1fr) minmax(0,2fr)">
    <section class="card today-card"><div class="card-b">
      <div class="muted" style="font-size:12.5px">Hôm nay, ${fmtD(today.date)}${today.workday ? '' : ' · ngày nghỉ'}</div>
      <div class="punch"><div><span>Vào ca</span><b class="num">${r && r.check_in ? esc(r.check_in) : '--:--'}</b></div><div><span>Ra ca</span><b class="num">${r && r.check_out ? esc(r.check_out) : '--:--'}</b></div></div>
      <button class="btn primary block" data-act="quick-check">${!r ? 'Chấm công vào ca' : 'Chấm công ra ca'}</button>
      <p class="hint" style="margin:8px 0 0">Mỗi lần bấm ra ca sẽ cập nhật giờ ra mới nhất trong ngày.</p></div></section>
    ${myRow ? `<section class="card"><div class="card-h"><h2>Tổng hợp công của tôi ${monthLabel(sh.month)}</h2></div><div class="card-b"><div class="sum-grid">
      ${[['Công chuẩn', sh.std_days], ['Công hưởng lương', myRow.totals.paid], ['Đi muộn/về sớm', myRow.totals.late, myRow.totals.late ? 'warn' : ''], ['Nghỉ phép', myRow.totals.leave], ['Công tác', myRow.totals.trip], ['Vắng', myRow.totals.absent, myRow.totals.absent ? 'bad' : ''], ['Làm thêm (giờ)', myRow.totals.ot]].map(([k, v, c]) => `<div class="${c || ''}"><b class="num">${numFmt(v)}</b><span>${k}</span></div>`).join('')}</div></div></section>` : ''}
  </div>
  <div class="toolbar"><input type="month" class="sel" id="cc-m" value="${sh.month}" aria-label="Tháng">
    ${sh.scope !== 'self' ? `<select class="sel" id="cc-d" aria-label="Phòng ban">${sh.scope === 'all' ? deptOpts(Number(ccDept) || null, 'Tất cả phòng ban') : '<option value="">Phòng tôi phụ trách</option>'}</select>
    <label class="check"><input type="checkbox" id="cc-mine" ${ccMine ? 'checked' : ''}> Chỉ bảng công của tôi</label>` : ''}
    <span class="spacer"></span><a class="btn" href="/api/export/attendance.csv?${new URLSearchParams({ month: sh.month, dept: ccDept })}">Xuất bảng công (CSV)</a></div>
  <section class="card"><div class="sheet-wrap"><table class="sheet">
    <thead><tr><th class="sticky">Họ và tên</th>${sh.days.map(d => { const w = new Date(d + 'T00:00:00').getDay(); return `<th class="${w === 0 || w === 6 ? 'we' : ''} ${d === TODAY() ? 'today' : ''}"><span>${WDS[w]}</span>${d.slice(8)}</th>`; }).join('')}
      <th class="tot">Công</th><th class="tot">Muộn</th><th class="tot">Phép</th><th class="tot">CT</th><th class="tot">Vắng</th><th class="tot">TC (giờ)</th><th class="tot">Hưởng lương</th></tr></thead>
    <tbody>${rows.map(row => `<tr><th class="sticky">${who(row.user_id)}</th>${sh.days.map(d => { const c = row.cells[d], w = new Date(d + 'T00:00:00').getDay(); return `<td class="${w === 0 || w === 6 ? 'we' : ''} ${codeCls(c)}" data-cell="${row.user_id}|${d}" title="${esc(CODE[c] || '')}">${c || ''}</td>`; }).join('')}
      <td class="tot num">${numFmt(row.totals.work)}</td><td class="tot num ${row.totals.late ? 'warn' : ''}">${row.totals.late || ''}</td><td class="tot num">${row.totals.leave || ''}</td><td class="tot num">${row.totals.trip || ''}</td><td class="tot num ${row.totals.absent ? 'bad' : ''}">${row.totals.absent || ''}</td><td class="tot num">${row.totals.ot || ''}</td><td class="tot num"><b>${numFmt(row.totals.paid)}</b></td></tr>`).join('')}</tbody></table></div></section>
  <div class="legend code-legend" style="margin-top:10px">${Object.entries(CODE).map(([k, v]) => `<span><i class="${codeCls(k)}">${k}</i>${v}</span>`).join('')}</div>
  <p class="notice info" style="margin-top:12px">Công chuẩn ${monthLabel(sh.month)}: <b>${sh.std_days} ngày</b>${sh.holidays.length ? `, gồm ${sh.holidays.length} ngày nghỉ lễ hưởng nguyên lương` : ''}. Bấm vào một ô để xem giờ vào/ra${sh.can_edit ? ' hoặc điều chỉnh (Phòng HC–NS)' : '; nếu đi muộn hoặc vắng, có thể gửi giải trình'}.</p>`;
  main._sheet = sh;
  $('#cc-m').addEventListener('change', e => { if (e.target.value) { ccMonth = e.target.value; render(); } });
  const dsel = $('#cc-d'); if (dsel) dsel.addEventListener('change', e => { ccDept = e.target.value; render(); });
  const mi = $('#cc-mine'); if (mi) mi.addEventListener('change', e => { ccMine = e.target.checked; render(); });
};
function cellModal(uid, d) {
  const sh = $('#main')._sheet; if (!sh) return;
  const rec = sh.records.find(r => r.user_id === uid && r.work_date === d) || {};
  const code = (sh.rows.find(r => r.user_id === uid) || { cells: {} }).cells[d];
  const mine = uid === B().me.id, ed = sh.can_edit;
  openModal(`${mh(`Chấm công ngày ${fmtD(d)}`, esc(U(uid).full_name))}<div class="modal-b">
    <dl class="kv"><dt>Ký hiệu</dt><dd>${code ? `<span class="code-chip ${codeCls(code)}">${code}</span> ${esc(CODE[code])}` : 'Ngày nghỉ hoặc chưa đến'}</dd>
    ${rec.source === 'hr' ? `<dt>Điều chỉnh</dt><dd>Phòng HC–NS điều chỉnh lúc ${fmtDT(rec.updated_at)}: ${esc(rec.note)}</dd>` : rec.note ? `<dt>Thiết bị</dt><dd>${esc(rec.note)}</dd>` : ''}</dl>
    <div class="form"><div class="field"><label for="ce-in">Giờ vào</label><input type="time" id="ce-in" value="${esc(rec.check_in || '')}" ${ed ? '' : 'disabled'}></div>
      <div class="field"><label for="ce-out">Giờ ra</label><input type="time" id="ce-out" value="${esc(rec.check_out || '')}" ${ed ? '' : 'disabled'}></div>
      ${ed ? `<div class="field full"><label for="ce-note">Lý do điều chỉnh</label><input id="ce-note" placeholder="Ví dụ: Quên chấm công, đã xác minh với trưởng phòng"><span class="hint">Để trống cả giờ vào và giờ ra để xóa dữ liệu chấm công của ngày này.</span></div>` : ''}</div>
    <p class="err" id="ce-err" hidden></p></div>
  <div class="modal-f">${mine && ['M', 'V'].includes(code) ? '<button class="btn" data-act="m-expl" style="margin-right:auto">Gửi giải trình</button>' : ''}<button class="btn" data-act="close">Đóng</button>${ed ? '<button class="btn primary" data-act="m-save">Lưu điều chỉnh</button>' : ''}</div>`, {
    'm-save': btn => busy(btn, async () => { try { await PUT('/api/attendance/record', { user_id: uid, work_date: d, check_in: $('#ce-in').value, check_out: $('#ce-out').value, note: $('#ce-note').value }); closeModal(); render(); toast('Đã điều chỉnh chấm công'); } catch (e) { showErr('#ce-err', e); } }),
    'm-expl': () => { closeModal(); S.reqForm({ type: 'giaitrinh', from: d, title: `Giải trình chấm công ngày ${fmtD(d)}` }); }
  });
}
ACTIONS['req-preset'] = btn => S.reqForm({ type: btn.dataset.type });
document.addEventListener('click', e => { const c = e.target.closest('[data-cell]'); if (!c || e.target.closest('#modal')) return; const [u, d] = c.dataset.cell.split('|'); cellModal(Number(u), d); });

/* ================= TIỀN LƯƠNG ================= */
let plTab = 'my', plPeriod = null;
VIEWS['tien-luong'] = async main => {
  const me = B().me, mgr = me.is_payroll;
  if (!mgr) plTab = 'my';
  const tabs = mgr ? `<div class="toolbar"><div class="seg">${[['my', 'Phiếu lương của tôi'], ['periods', 'Bảng lương'], ['profiles', 'Hồ sơ lương']].map(([k, l]) => `<button data-pltab="${k}" aria-pressed="${plTab === k}">${l}</button>`).join('')}</div></div>` : '';
  const head = (t, p, act = '') => `<div class="page-head"><div><h1>${t}</h1><p>${p}</p></div>${act ? `<div class="actions">${act}</div>` : ''}</div>` + tabs;
  if (plTab === 'my') {
    const slips = await GET('/api/payroll/my');
    main.innerHTML = head('Tiền lương', 'Phiếu lương các tháng đã được chốt') + `<section class="card"><div class="list">${slips.length ? slips.map(l => `<div class="item" data-slip="${l.id}"><div style="display:flex;flex-direction:column;gap:4px"><h3>Phiếu lương ${monthLabel(l.month)}</h3><div class="meta"><span>Công hưởng lương ${numFmt(l.paid_days)}/${numFmt(l.std_days)}</span><span>Chốt ${fmtDT(l.locked_at)}</span></div></div><div class="right"><span class="amt mono">${vnd(l.net)}</span><span class="muted" style="font-size:12px">Thực lĩnh</span></div></div>`).join('') : '<div class="empty">Chưa có phiếu lương nào được chốt.</div>'}</div></section>`;
    main._slips = slips;
    return;
  }
  if (plTab === 'profiles') {
    const ps = await GET('/api/payroll/profiles');
    main.innerHTML = head('Hồ sơ lương', `${ps.filter(p => p.base_salary > 0).length}/${ps.length} nhân sự đã khai báo lương`) + `<section class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Họ và tên</th><th class="r">Lương chính</th><th class="r">Lương đóng BH</th><th class="r">Phụ cấp chịu thuế</th><th class="r">Phụ cấp không chịu thuế</th><th class="r">Người phụ thuộc</th><th>Cách tính thuế</th></tr></thead><tbody>
      ${ps.map(p => `<tr class="click" data-prof="${p.user_id}"><td>${who(p.user_id)}<div class="t-sub">${esc(Dp(p.dept_id).name)}</div></td><td class="r num">${p.base_salary ? money(p.base_salary) : '<span class="late">Chưa khai báo</span>'}</td><td class="r num">${p.insured ? money(p.insurance_salary) : '<span class="faint">Không tham gia</span>'}</td><td class="r num">${money(p.allowance_taxable)}</td><td class="r num">${money(p.allowance_nontax)}</td><td class="r num">${p.dependents}</td><td>${{ progressive: 'Lũy tiến từng phần', flat10: 'Khấu trừ 10%', none: 'Không khấu trừ' }[p.tax_mode]}</td></tr>`).join('')}</tbody></table></div></section>
      <p class="notice" style="margin-top:14px">Đơn vị tính: đồng. Lương đóng bảo hiểm để trống sẽ lấy bằng lương chính. Khoản phụ cấp không chịu thuế (ví dụ tiền ăn giữa ca) cần đối chiếu mức được miễn theo quy định thuế hiện hành.</p>`;
    main._profiles = ps;
    return;
  }
  if (plPeriod) return periodDetail(main, head);
  const d = await GET('/api/payroll/periods');
  main.innerHTML = head('Bảng lương', 'Lập bảng lương từ bảng công và hồ sơ lương; chốt để phát hành phiếu lương', '<button class="btn primary" data-act="pl-new">+ Lập bảng lương</button>') +
    `<section class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Kỳ lương</th><th>Tình trạng</th><th class="r">Số người</th><th class="r">Tổng thu nhập</th><th class="r">BH người LĐ</th><th class="r">Thuế TNCN</th><th class="r">Thực lĩnh</th><th class="r">Đơn vị đóng BH, KPCĐ</th></tr></thead><tbody>
    ${d.periods.map(p => `<tr class="click" data-period="${p.id}"><td class="t-title">Tháng ${p.month.slice(5)}/${p.month.slice(0, 4)}</td><td>${p.status === 'locked' ? '<span class="pill s-done">Đã chốt</span>' : '<span class="pill s-pending">Bản nháp</span>'}</td><td class="r num">${p.n}</td><td class="r num">${money(p.gross)}</td><td class="r num">${money(p.ins)}</td><td class="r num">${money(p.pit)}</td><td class="r num"><b>${money(p.net)}</b></td><td class="r num">${money(p.er)}</td></tr>`).join('') || '<tr><td colspan="8" class="empty">Chưa có bảng lương. Bấm “Lập bảng lương” để bắt đầu.</td></tr>'}</tbody></table></div></section>`;
};
async function periodDetail(main, head) {
  const p = await GET('/api/payroll/periods/' + plPeriod), draft = p.status === 'draft', L = p.lines;
  const sum = k => L.reduce((s, l) => s + (l[k] || 0), 0);
  const me = B().me, st = B().settings;
  const canLock = me.role === 'admin' || me.is_director || me.id === st.accountant_id;
  main.innerHTML = head(`Bảng lương tháng ${p.month.slice(5)}/${p.month.slice(0, 4)}`, `${draft ? 'Bản nháp — có thể điều chỉnh thưởng, khấu trừ và tính lại' : `Đã chốt lúc ${fmtDT(p.locked_at)}`} · công chuẩn ${numFmt(p.std_days)} ngày`,
    `<button class="btn" data-act="pl-back">← Danh sách kỳ lương</button><a class="btn" href="/api/export/payroll.csv?id=${p.id}">Xuất Excel (CSV)</a>${draft ? `<button class="btn" data-act="pl-recalc">Tính lại theo bảng công</button>${canLock ? '<button class="btn primary" data-act="pl-lock">Chốt bảng lương</button>' : ''}<button class="btn danger" data-act="pl-del">Xóa</button>` : (me.role === 'admin' || me.is_director ? '<button class="btn" data-act="pl-unlock">Mở lại</button>' : '')}`) +
    `<div class="stats">${[['Tổng thu nhập', sum('gross')], ['Thuế TNCN khấu trừ', sum('pit')], ['Tổng thực lĩnh', sum('net')], ['Chi phí lương của đơn vị', sum('gross') + sum('er_total')]].map(([k, v]) => `<div class="card stat"><span class="k">${k}</span><span class="v num" style="font-size:20px">${money(v)}</span><span class="s">đồng</span></div>`).join('')}</div>
    <section class="card"><div class="tbl-wrap"><table class="tbl pay-tbl"><thead><tr><th>Họ và tên</th><th class="r">Lương chính</th><th class="r">Công</th><th class="r">Lương theo công</th><th class="r">Phụ cấp</th><th class="r">Tăng ca</th><th class="r">Thưởng</th><th class="r">Tổng thu nhập</th><th class="r">Bảo hiểm</th><th class="r">Thuế TNCN</th><th class="r">Khấu trừ, tạm ứng</th><th class="r">Thực lĩnh</th></tr></thead><tbody>
    ${L.map(l => `<tr class="click" data-pline="${l.id}"><td>${who(l.user_id)}<div class="t-sub">${esc(l.dept_name)}</div></td><td class="r num">${money(l.base_salary)}</td><td class="r num">${numFmt(l.paid_days)}/${numFmt(l.std_days)}</td><td class="r num">${money(l.salary_by_days)}</td><td class="r num">${money(l.allowance_taxable + l.allowance_nontax)}</td><td class="r num">${l.ot_pay ? money(l.ot_pay) : ''}</td><td class="r num">${l.bonus ? money(l.bonus) : ''}</td><td class="r num">${money(l.gross)}</td><td class="r num">${money(l.ins_total)}</td><td class="r num">${money(l.pit)}</td><td class="r num">${l.other_deduction + l.advance ? money(l.other_deduction + l.advance) : ''}</td><td class="r num"><b>${money(l.net)}</b></td></tr>`).join('')}
    <tr class="sum-row"><td><b>Tổng cộng</b></td><td class="r num">${money(sum('base_salary'))}</td><td></td><td class="r num">${money(sum('salary_by_days'))}</td><td class="r num">${money(sum('allowance_taxable') + sum('allowance_nontax'))}</td><td class="r num">${money(sum('ot_pay'))}</td><td class="r num">${money(sum('bonus'))}</td><td class="r num">${money(sum('gross'))}</td><td class="r num">${money(sum('ins_total'))}</td><td class="r num">${money(sum('pit'))}</td><td class="r num">${money(sum('other_deduction') + sum('advance'))}</td><td class="r num"><b>${money(sum('net'))}</b></td></tr></tbody></table></div></section>
    <p class="notice info" style="margin-top:12px">Tham số áp dụng: giảm trừ bản thân ${money(p.params.ded_self)} đ, người phụ thuộc ${money(p.params.ded_dependent)} đ/người; trần BHXH, BHYT ${money(p.params.ref_wage * 20)} đ; trần BHTN ${money(p.params.region_min * 20)} đ; làm thêm giờ ${p.params.ot_rate}%. Bấm vào từng dòng để xem chi tiết${draft ? ', nhập thưởng, khấu trừ' : ''}.</p>`;
  main._period = p;
}
function slipHtml(l, month) {
  const row = (k, v, cls = '') => `<tr class="${cls}"><td>${k}</td><td class="r num">${typeof v === 'number' ? money(v) : v}</td></tr>`;
  return `<div class="slip"><div class="slip-h"><div><b>${esc(B().settings.org_name)}</b><span>PHIẾU LƯƠNG ${monthLabel(month).toUpperCase()}</span></div><div class="r"><b>${esc(l.full_name)}</b><span>${esc(l.title || '')} · ${esc(l.dept_name || '')}</span></div></div>
  <table class="slip-t"><tbody>
    ${row('Lương chính', l.base_salary)}${row('Ngày công hưởng lương / công chuẩn', `${numFmt(l.paid_days)} / ${numFmt(l.std_days)}`)}
    ${row('<span class="muted">trong đó: công thực tế · phép · lễ</span>', `<span class="muted">${numFmt(l.work_days)} · ${numFmt(l.paid_leave)} · ${numFmt(l.holiday_days)}</span>`)}
    <tr class="grp"><td colspan="2">I. Thu nhập</td></tr>
    ${row('1. Lương theo ngày công', l.salary_by_days)}${row('2. Phụ cấp chịu thuế', l.allowance_taxable)}${row('3. Phụ cấp không chịu thuế', l.allowance_nontax)}
    ${row(`4. Làm thêm giờ (${numFmt(l.ot_hours)} giờ)`, l.ot_pay)}${row('5. Thưởng', l.bonus)}${row('Tổng thu nhập', l.gross, 'tot')}
    <tr class="grp"><td colspan="2">II. Các khoản khấu trừ</td></tr>
    ${row(`1. BHXH (trên lương đóng BH ${money(l.insurance_salary)})`, l.ins_bhxh)}${row('2. BHYT', l.ins_bhyt)}${row('3. BHTN', l.ins_bhtn)}
    ${row(`4. Thuế TNCN (thu nhập tính thuế ${money(l.taxable_income)}${l.deduction_family ? `; giảm trừ gia cảnh ${money(l.deduction_family)}, ${l.dependents} người phụ thuộc` : ''})`, l.pit)}
    ${row('5. Tạm ứng', l.advance)}${row('6. Khấu trừ khác', l.other_deduction)}${row('Tổng khấu trừ', l.ins_total + l.pit + l.advance + l.other_deduction, 'tot')}
    ${row('THỰC LĨNH', l.net, 'net')}
  </tbody></table>${l.note ? `<p class="note">${esc(l.note)}</p>` : ''}</div>`;
}
function lineModal(id) {
  const p = $('#main')._period, l = p.lines.find(x => x.id === id), draft = p.status === 'draft';
  openModal(`${mh('Chi tiết lương', esc(l.full_name))}<div class="modal-b">${slipHtml(l, p.month)}
    ${draft ? `<h3 class="sec-t">Điều chỉnh trong kỳ</h3><div class="form three"><div class="field"><label for="pl-b">Thưởng (đồng)</label>${moneyInput('pl-b', l.bonus)}</div><div class="field"><label for="pl-a">Tạm ứng (đồng)</label>${moneyInput('pl-a', l.advance)}</div><div class="field"><label for="pl-o">Khấu trừ khác (đồng)</label>${moneyInput('pl-o', l.other_deduction)}</div><div class="field full"><label for="pl-n">Ghi chú</label><input id="pl-n" value="${esc(l.note)}" placeholder="Ví dụ: Thưởng hoàn thành hợp đồng dự án Ninh Bình"></div></div>` : ''}
    <p class="err" id="pl-err" hidden></p></div>
    <div class="modal-f"><button class="btn" data-act="close">Đóng</button>${draft ? '<button class="btn primary" data-act="m-save">Lưu và tính lại</button>' : ''}</div>`, {
    'm-save': btn => busy(btn, async () => { try { await PUT('/api/payroll/lines/' + l.id, { bonus: readMoney('pl-b'), advance: readMoney('pl-a'), other_deduction: readMoney('pl-o'), note: $('#pl-n').value }); closeModal(); render(); toast('Đã cập nhật và tính lại'); } catch (e) { showErr('#pl-err', e); } })
  });
}
function profileModal(uid) {
  const p = $('#main')._profiles.find(x => x.user_id === uid), reg = B().settings.pay.region_min;
  openModal(`${mh('Hồ sơ lương', esc(p.full_name))}<div class="modal-b"><div class="form">
    <div class="field"><label for="sp-base">Lương chính theo hợp đồng (đồng/tháng)</label>${moneyInput('sp-base', p.base_salary)}<span class="hint">Không thấp hơn lương tối thiểu vùng ${money(reg)} đồng.</span></div>
    <div class="field"><label for="sp-ins">Lương đóng bảo hiểm (đồng/tháng)</label>${moneyInput('sp-ins', p.insurance_salary)}<span class="hint">Để trống: lấy bằng lương chính.</span></div>
    <div class="field"><label for="sp-at">Phụ cấp chịu thuế</label>${moneyInput('sp-at', p.allowance_taxable)}</div>
    <div class="field"><label for="sp-an">Phụ cấp không chịu thuế</label>${moneyInput('sp-an', p.allowance_nontax)}</div>
    <div class="field"><label for="sp-dep">Số người phụ thuộc đã đăng ký</label><input id="sp-dep" type="number" min="0" max="20" value="${p.dependents}"></div>
    <div class="field"><label for="sp-ins-on">Tham gia BHXH bắt buộc</label><select id="sp-ins-on"><option value="1">Có</option><option value="0" ${p.insured ? '' : 'selected'}>Không</option></select></div>
    <div class="field full"><label for="sp-tax">Cách khấu trừ thuế TNCN</label><select id="sp-tax"><option value="progressive">Lũy tiến từng phần (hợp đồng từ 03 tháng trở lên, cá nhân cư trú)</option><option value="flat10" ${p.tax_mode === 'flat10' ? 'selected' : ''}>Khấu trừ 10% (hợp đồng dưới 03 tháng, thu nhập từ 2 triệu đồng/lần)</option><option value="none" ${p.tax_mode === 'none' ? 'selected' : ''}>Không khấu trừ (có cam kết theo mẫu của cơ quan thuế)</option></select></div>
    <div class="field"><label for="sp-bank">Số tài khoản</label><input id="sp-bank" value="${esc(p.bank_account)}"></div>
    <div class="field"><label for="sp-bn">Ngân hàng</label><input id="sp-bn" value="${esc(p.bank_name)}"></div>
  </div><p class="err" id="sp-err" hidden></p></div>
  <div class="modal-f"><button class="btn" data-act="close">Hủy</button><button class="btn primary" data-act="m-save">Lưu hồ sơ lương</button></div>`, {
    'm-save': btn => busy(btn, async () => { try { await PUT('/api/payroll/profiles/' + uid, { base_salary: readMoney('sp-base'), insurance_salary: readMoney('sp-ins'), allowance_taxable: readMoney('sp-at'), allowance_nontax: readMoney('sp-an'), dependents: $('#sp-dep').value, insured: $('#sp-ins-on').value === '1', tax_mode: $('#sp-tax').value, bank_account: $('#sp-bank').value, bank_name: $('#sp-bn').value }); closeModal(); render(); toast('Đã lưu hồ sơ lương'); } catch (e) { showErr('#sp-err', e); } })
  });
}
ACTIONS['pl-new'] = () => {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - (d.getDate() < 25 ? 0 : 0));
  openModal(`${mh('Lập bảng lương')}<div class="modal-b"><div class="field"><label for="pn-m">Kỳ lương (tháng)</label><input type="month" id="pn-m" value="${TODAY().slice(0, 7)}"></div>
    <p class="hint" style="margin:0">Hệ thống lấy dữ liệu bảng công, đơn nghỉ phép, công tác, làm thêm giờ đã duyệt và hồ sơ lương để tính. Có thể tính lại nhiều lần trước khi chốt.</p><p class="err" id="pn-err" hidden></p></div>
    <div class="modal-f"><button class="btn" data-act="close">Hủy</button><button class="btn primary" data-act="m-save">Lập bảng lương</button></div>`, {
    'm-save': btn => busy(btn, async () => { try { const r = await POST('/api/payroll/periods', { month: $('#pn-m').value }); plPeriod = r.id; closeModal(); render(); toast('Đã lập bảng lương'); } catch (e) { showErr('#pn-err', e); } })
  });
};
ACTIONS['pl-back'] = () => { plPeriod = null; render(); };
const plAct = (a, msg, body) => async btn => busy(btn, async () => { try { await POST(`/api/payroll/periods/${plPeriod}/${a}`, body || {}); if (a === 'delete') plPeriod = null; render(); toast(msg); } catch (e) { toast(e.message, true); } });
ACTIONS['pl-recalc'] = plAct('recalc', 'Đã tính lại theo bảng công mới nhất');
ACTIONS['pl-lock'] = btn => { if (armed(btn, 'Bấm lần nữa để chốt')) plAct('lock', 'Đã chốt bảng lương, phiếu lương đã phát hành tới nhân sự')(btn); };
ACTIONS['pl-del'] = btn => { if (armed(btn, 'Bấm lần nữa để xóa')) plAct('delete', 'Đã xóa bảng lương nháp')(btn); };
ACTIONS['pl-unlock'] = () => openModal(`${mh('Mở lại bảng lương đã chốt')}<div class="modal-b"><p class="notice">Phiếu lương sẽ tạm ẩn với nhân sự cho đến khi chốt lại.</p><div class="field"><label for="ul-n">Lý do</label><input id="ul-n" placeholder="Ví dụ: Điều chỉnh công tác phí của Phòng Kinh doanh"></div><p class="err" id="ul-err" hidden></p></div><div class="modal-f"><button class="btn" data-act="close">Hủy</button><button class="btn primary" data-act="m-save">Mở lại</button></div>`, {
  'm-save': btn => busy(btn, async () => { try { await POST(`/api/payroll/periods/${plPeriod}/unlock`, { note: $('#ul-n').value }); closeModal(); render(); toast('Đã mở lại bảng lương'); } catch (e) { showErr('#ul-err', e); } })
});
document.addEventListener('click', e => {
  if (e.target.closest('#modal')) return;
  const t = e.target.closest('[data-pltab]'); if (t) { plTab = t.dataset.pltab; plPeriod = null; return render(); }
  const p = e.target.closest('[data-period]'); if (p) { plPeriod = Number(p.dataset.period); return render(); }
  const l = e.target.closest('[data-pline]'); if (l) return lineModal(Number(l.dataset.pline));
  const pr = e.target.closest('[data-prof]'); if (pr) return profileModal(Number(pr.dataset.prof));
  const sl = e.target.closest('[data-slip]'); if (sl) { const x = $('#main')._slips.find(s => s.id === Number(sl.dataset.slip)); openModal(`${mh('Phiếu lương')}<div class="modal-b">${slipHtml(x, x.month)}</div><div class="modal-f"><button class="btn" data-act="close">Đóng</button></div>`); }
});

/* ================= Cấu hình (Quản trị) ================= */
function hrSettingsHtml(s) {
  const p = s.pay, num = (id, v, step = 'any') => `<input id="${id}" type="number" step="${step}" value="${v}">`;
  return `<section class="card"><div class="card-h"><h2>Thời gian làm việc</h2></div><div class="card-b"><div class="form three">
    <div class="field"><label for="hs-ws">Giờ vào ca</label><input type="time" id="hs-ws" value="${esc(s.work_start)}"></div>
    <div class="field"><label for="hs-we">Giờ ra ca</label><input type="time" id="hs-we" value="${esc(s.work_end)}"></div>
    <div class="field"><label for="hs-g">Cho phép trễ (phút)</label>${num('hs-g', s.late_grace, '1')}</div>
    <div class="field"><label for="hs-sat">Thứ Bảy</label><select id="hs-sat"><option value="0">Nghỉ</option><option value="1" ${s.work_saturday ? 'selected' : ''}>Làm việc</option></select></div>
    <div class="field full"><label for="hs-h">Ngày nghỉ lễ, Tết hưởng nguyên lương (định dạng YYYY-MM-DD, cách nhau bởi dấu phẩy)</label><textarea id="hs-h">${esc(s.holidays.join(', '))}</textarea><span class="hint">Căn cứ Điều 112 Bộ luật Lao động 2019 và thông báo nghỉ lễ, nghỉ bù hằng năm. Đề nghị rà soát khi có thông báo chính thức.</span></div>
  </div></div></section>
  <section class="card" style="margin-top:16px"><div class="card-h"><h2>Tham số tính lương</h2></div><div class="card-b"><div class="form three">
    <div class="field"><label for="hp-ds">Giảm trừ bản thân (đồng/tháng)</label>${num('hp-ds', p.ded_self, '1')}</div>
    <div class="field"><label for="hp-dd">Giảm trừ mỗi người phụ thuộc</label>${num('hp-dd', p.ded_dependent, '1')}</div>
    <div class="field"><label for="hp-rw">Mức tham chiếu (trần BHXH, BHYT = 20 lần)</label>${num('hp-rw', p.ref_wage, '1')}</div>
    <div class="field"><label for="hp-rm">Lương tối thiểu vùng áp dụng (trần BHTN = 20 lần)</label>${num('hp-rm', p.region_min, '1')}</div>
    <div class="field"><label for="hp-ot">Tỷ lệ trả làm thêm giờ ngày thường (%)</label>${num('hp-ot', p.ot_rate, '1')}</div>
    <div class="field"><label for="hp-hd">Số giờ làm việc/ngày</label>${num('hp-hd', p.hours_per_day, '0.5')}</div>
  </div>
  <h3 class="sec-t" style="margin-top:14px">Tỷ lệ trích bảo hiểm, kinh phí công đoàn (%)</h3><div class="form three">
    <div class="field"><label for="hp-eb">Người LĐ – BHXH</label>${num('hp-eb', p.ee_bhxh)}</div><div class="field"><label for="hp-ey">Người LĐ – BHYT</label>${num('hp-ey', p.ee_bhyt)}</div><div class="field"><label for="hp-eu">Người LĐ – BHTN</label>${num('hp-eu', p.ee_bhtn)}</div>
    <div class="field"><label for="hp-rb">Đơn vị – BHXH</label>${num('hp-rb', p.er_bhxh)}</div><div class="field"><label for="hp-ry">Đơn vị – BHYT</label>${num('hp-ry', p.er_bhyt)}</div><div class="field"><label for="hp-ru">Đơn vị – BHTN</label>${num('hp-ru', p.er_bhtn)}</div>
    <div class="field"><label for="hp-rk">Đơn vị – Kinh phí công đoàn</label>${num('hp-rk', p.er_kpcd)}</div></div>
  <h3 class="sec-t" style="margin-top:14px">Biểu thuế lũy tiến từng phần (thu nhập tính thuế/tháng)</h3>
  <div class="tbl-wrap"><table class="tbl" style="min-width:420px"><thead><tr><th>Bậc</th><th>Đến mức (đồng) — để trống ở bậc cuối</th><th>Thuế suất (%)</th></tr></thead><tbody>
    ${p.brackets.map((b, i) => `<tr><td>${i + 1}</td><td><input class="br-cap sel" type="number" value="${b[0] == null ? '' : b[0]}" aria-label="Mức trần bậc ${i + 1}"></td><td><input class="br-rate sel" type="number" step="any" value="${b[1]}" aria-label="Thuế suất bậc ${i + 1}"></td></tr>`).join('')}</tbody></table></div>
  <p class="err" id="hs-err" hidden></p></div><div class="modal-f"><button class="btn primary" data-act="save-hrset">Lưu cấu hình</button></div></section>
  <p class="notice" style="margin-top:14px">Giá trị mặc định năm 2026: giảm trừ gia cảnh theo Nghị quyết 110/2025/UBTVQH15; biểu thuế 5 bậc theo Luật Thuế TNCN (sửa đổi) năm 2025 áp dụng cho tiền lương từ kỳ tính thuế 2026; lương tối thiểu vùng I theo Nghị định 293/2025/NĐ-CP; tỷ lệ trích theo Luật BHXH 2024, Luật Việc làm, Luật Công đoàn. Thay đổi chỉ áp dụng cho bảng lương lập hoặc tính lại sau thời điểm lưu.</p>`;
}
ACTIONS['save-hrset'] = btn => busy(btn, async () => {
  const v = id => $('#' + id).value;
  const brackets = $$('.br-cap').map((c, i) => [c.value === '' ? null : Number(c.value), Number($$('.br-rate')[i].value)]);
  try {
    await PUT('/api/admin/hr-settings', { work_start: v('hs-ws'), work_end: v('hs-we'), late_grace: v('hs-g'), work_saturday: v('hs-sat') === '1', holidays: v('hs-h'),
      pay: { ded_self: v('hp-ds'), ded_dependent: v('hp-dd'), ref_wage: v('hp-rw'), region_min: v('hp-rm'), ot_rate: v('hp-ot'), hours_per_day: v('hp-hd'), ee_bhxh: v('hp-eb'), ee_bhyt: v('hp-ey'), ee_bhtn: v('hp-eu'), er_bhxh: v('hp-rb'), er_bhyt: v('hp-ry'), er_bhtn: v('hp-ru'), er_kpcd: v('hp-rk'), brackets } });
    await S.refreshBoot(); toast('Đã lưu cấu hình chấm công và tiền lương');
  } catch (e) { showErr('#hs-err', e); }
});
window.SO_HR = { hrSettingsHtml };
})();
