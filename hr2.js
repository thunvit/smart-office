'use strict';
/**
 * Phân hệ Chấm công – Bảng công và Tiền lương.
 * Đăng ký API qua hàm register(ctx) do server.js gọi.
 */
const D = require('./db');
const { all, get, run, tx, today, now, addDays } = D;

const pad = n => String(n).padStart(2, '0');
const round = n => Math.round(n);
const monthDays = m => { const [y, mo] = m.split('-').map(Number); const n = new Date(y, mo, 0).getDate(); return Array.from({ length: n }, (_, i) => `${m}-${pad(i + 1)}`); };
const weekday = s => new Date(s + 'T00:00:00').getDay();
const toMin = t => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + (m || 0); };

function isWorkday(s, st) { const w = weekday(s); if (w === 0) return false; if (w === 6 && !st.work_saturday) return false; return true; }

/* ================= Thuế TNCN lũy tiến từng phần ================= */
function pitProgressive(income, brackets) {
  if (income <= 0) return 0;
  let tax = 0, prev = 0;
  for (const [cap, rate] of brackets) {
    const top = cap == null ? Infinity : cap;
    if (income > prev) tax += (Math.min(income, top) - prev) * rate / 100;
    if (income <= top) break;
    prev = top;
  }
  return round(tax);
}

/* ================= Bảng công tháng ================= */
/**
 * Mã công: X đủ công · M đi muộn/về sớm · GT đã giải trình · P nghỉ phép · P/2 nửa ngày phép
 *          CT công tác · L nghỉ lễ · V vắng không lý do · (trống) ngày nghỉ hoặc chưa đến
 */
function buildSheet(month, userIds) {
  const st = D.getSettings(), days = monthDays(month), T = today();
  const from = days[0], to = days[days.length - 1];
  const att = all(`SELECT * FROM attendance WHERE work_date BETWEEN ? AND ?`, from, to);
  const reqs = all(`SELECT * FROM requests WHERE status='approved' AND type IN ('nghiphep','congtac','giaitrinh','tangca')
    AND date_from <= ? AND COALESCE(date_to, date_from) >= ?`, to, from);
  const ws = toMin(st.work_start) + st.late_grace, we = toMin(st.work_end);
  const stdDays = days.filter(d => isWorkday(d, st)).length;
  const holidays = new Set(st.holidays);
  const rows = userIds.map(uid => {
    const cells = {}, tot = { work: 0, late: 0, leave: 0, trip: 0, holiday: 0, absent: 0, explained: 0, ot: 0, paid: 0 };
    const mine = reqs.filter(r => r.creator_id === uid);
    for (const d of days) {
      if (!isWorkday(d, st)) { cells[d] = ''; continue; }
      if (holidays.has(d)) { cells[d] = 'L'; tot.holiday++; tot.paid++; continue; }
      const a = att.find(x => x.user_id === uid && x.work_date === d);
      const leave = mine.find(r => r.type === 'nghiphep' && r.date_from <= d && r.date_to >= d);
      const trip = mine.find(r => r.type === 'congtac' && r.date_from <= d && r.date_to >= d);
      const expl = mine.find(r => r.type === 'giaitrinh' && r.date_from === d);
      if (trip) { cells[d] = 'CT'; tot.trip++; tot.paid++; continue; }
      if (leave && leave.days !== 0.5) { cells[d] = 'P'; tot.leave++; tot.paid++; continue; }
      if (leave && leave.days === 0.5) { cells[d] = 'P/2'; tot.leave += 0.5; tot.paid += 0.5; if (a && a.check_in) { tot.work += 0.5; tot.paid += 0.5; } continue; }
      if (a && a.check_in) {
        const late = toMin(a.check_in) > ws || (a.check_out && toMin(a.check_out) < we);
        if (late && expl) { cells[d] = 'GT'; tot.explained++; tot.work++; tot.paid++; }
        else if (late) { cells[d] = 'M'; tot.late++; tot.work++; tot.paid++; }
        else { cells[d] = 'X'; tot.work++; tot.paid++; }
        continue;
      }
      if (expl) { cells[d] = 'GT'; tot.explained++; tot.work++; tot.paid++; continue; }
      if (d < T) { cells[d] = 'V'; tot.absent++; } else cells[d] = '';
    }
    tot.ot = mine.filter(r => r.type === 'tangca' && r.date_from >= from && r.date_from <= to).reduce((s, r) => s + (r.hours || 0), 0);
    return { user_id: uid, cells, totals: tot };
  });
  return { month, days, std_days: stdDays, holidays: [...holidays].filter(h => h.startsWith(month)), rows, settings: { work_start: st.work_start, work_end: st.work_end, late_grace: st.late_grace, work_saturday: st.work_saturday } };
}

/* ================= Tính lương một người ================= */
function computeLine(user, prof, sheetRow, stdDays, pay, keep = {}) {
  const base = prof.base_salary || 0;
  const insSal = prof.insured ? (prof.insurance_salary || base) : 0;
  const t = sheetRow.totals;
  const paidDays = Math.min(t.paid, stdDays);
  const salaryByDays = stdDays ? round(base * paidDays / stdDays) : 0;
  const hourly = stdDays ? base / stdDays / pay.hours_per_day : 0;
  const otPay = round(hourly * t.ot * pay.ot_rate / 100);
  const otExempt = round(hourly * t.ot * Math.max(0, pay.ot_rate - 100) / 100); // phần trả cao hơn lương giờ bình thường được miễn thuế
  const bonus = keep.bonus || 0, other = keep.other_deduction || 0, advance = keep.advance || 0;
  const gross = salaryByDays + (prof.allowance_taxable || 0) + (prof.allowance_nontax || 0) + otPay + bonus;
  const capS = pay.ref_wage * 20, capU = pay.region_min * 20;
  const bS = Math.min(insSal, capS), bU = Math.min(insSal, capU);
  const insB = round(bS * pay.ee_bhxh / 100), insY = round(bS * pay.ee_bhyt / 100), insU = round(bU * pay.ee_bhtn / 100);
  const insTotal = insB + insY + insU;
  const dedFamily = pay.ded_self + (prof.dependents || 0) * pay.ded_dependent;
  let taxable = 0, pit = 0;
  const taxableGross = gross - (prof.allowance_nontax || 0) - otExempt;
  if (prof.tax_mode === 'flat10') { taxable = Math.max(0, taxableGross); pit = taxable >= 2000000 ? round(taxable * 0.1) : 0; }
  else if (prof.tax_mode === 'none') { taxable = 0; pit = 0; }
  else { taxable = Math.max(0, taxableGross - insTotal - dedFamily); pit = pitProgressive(taxable, pay.brackets); }
  const net = gross - insTotal - pit - other - advance;
  const erB = round(bS * pay.er_bhxh / 100), erY = round(bS * pay.er_bhyt / 100), erU = round(bU * pay.er_bhtn / 100), erK = round(bS * pay.er_kpcd / 100);
  return {
    user_id: user.id, full_name: user.full_name, title: user.title, dept_name: user.dept_name,
    base_salary: base, insurance_salary: insSal, std_days: stdDays, work_days: t.work + t.trip, paid_leave: t.leave, holiday_days: t.holiday, paid_days: paidDays,
    ot_hours: t.ot, salary_by_days: salaryByDays, allowance_taxable: prof.allowance_taxable || 0, allowance_nontax: prof.allowance_nontax || 0,
    ot_pay: otPay, ot_exempt: otExempt, bonus, gross, ins_bhxh: insB, ins_bhyt: insY, ins_bhtn: insU, ins_total: insTotal,
    dependents: prof.dependents || 0, deduction_family: prof.tax_mode === 'progressive' ? dedFamily : 0, taxable_income: taxable, pit,
    other_deduction: other, advance, net, er_bhxh: erB, er_bhyt: erY, er_bhtn: erU, er_kpcd: erK, er_total: erB + erY + erU + erK, note: keep.note || ''
  };
}
const LINE_COLS = ['user_id', 'full_name', 'title', 'dept_name', 'base_salary', 'insurance_salary', 'std_days', 'work_days', 'paid_leave', 'holiday_days', 'paid_days', 'ot_hours', 'salary_by_days', 'allowance_taxable', 'allowance_nontax', 'ot_pay', 'ot_exempt', 'bonus', 'gross', 'ins_bhxh', 'ins_bhyt', 'ins_bhtn', 'ins_total', 'dependents', 'deduction_family', 'taxable_income', 'pit', 'other_deduction', 'advance', 'net', 'er_bhxh', 'er_bhyt', 'er_bhtn', 'er_kpcd', 'er_total', 'note'];

function calcPeriod(periodId) {
  const p = get('SELECT * FROM payroll_periods WHERE id=?', periodId);
  const pay = D.getSettings().pay;
  const users = all(`SELECT u.id, u.full_name, u.title, d.name dept_name FROM users u LEFT JOIN departments d ON d.id=u.dept_id
    JOIN salary_profiles s ON s.user_id=u.id WHERE u.active=1 AND s.base_salary > 0 ORDER BY d.sort, d.id, u.full_name`);
  const sheet = buildSheet(p.month, users.map(u => u.id));
  const old = new Map(all('SELECT * FROM payroll_lines WHERE period_id=?', p.id).map(l => [l.user_id, l]));
  tx(() => {
    run('DELETE FROM payroll_lines WHERE period_id=?', p.id);
    users.forEach((u, i) => {
      const prof = get('SELECT * FROM salary_profiles WHERE user_id=?', u.id);
      const L = computeLine(u, prof, sheet.rows[i], sheet.std_days, pay, old.get(u.id) || {});
      run(`INSERT INTO payroll_lines(period_id,${LINE_COLS.join(',')}) VALUES(?,${LINE_COLS.map(() => '?').join(',')})`, p.id, ...LINE_COLS.map(c => L[c]));
    });
    run('UPDATE payroll_periods SET std_days=?, params=? WHERE id=?', sheet.std_days, JSON.stringify(pay), p.id);
  });
}

/* ================= Đăng ký API ================= */
function register({ route, bad, forbid, notFound, isAdmin, isHR, isDirector, log, esc, str, int, isDate, HttpError }) {
  const st = () => D.getSettings();
  const isPayroll = u => isAdmin(u) || isDirector(u) || isHR(u) || (st().accountant_id && get('SELECT dept_id d FROM users WHERE id=?', st().accountant_id)?.d === u.dept_id);
  const deptHeadOf = u => all('SELECT id FROM departments WHERE head_id=?', u.id).map(r => r.id);
  const scopeUsers = (u, deptFilter) => {
    let rows;
    if (isHR(u) || isDirector(u)) rows = all(`SELECT id, dept_id FROM users WHERE active=1 AND username<>'admin'`);
    else { const heads = deptHeadOf(u); rows = heads.length ? all(`SELECT id, dept_id FROM users WHERE active=1 AND username<>'admin' AND dept_id IN (${heads.map(() => '?').join(',')})`, ...heads) : [{ id: u.id, dept_id: u.dept_id }]; if (!rows.some(r => r.id === u.id)) rows.push({ id: u.id, dept_id: u.dept_id }); }
    if (deptFilter) rows = rows.filter(r => r.dept_id === int(deptFilter));
    return rows.map(r => r.id);
  };
  const validMonth = m => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(m || ''));

  /* ----- Chấm công ----- */
  route('GET', '/api/attendance/today', ({ user }) => {
    const s = st(), T = today();
    return { date: T, record: get('SELECT * FROM attendance WHERE user_id=? AND work_date=?', user.id, T) || null, work_start: s.work_start, work_end: s.work_end, workday: isWorkday(T, s) && !s.holidays.includes(T) };
  });
  route('POST', '/api/attendance/check', ({ user, req }) => {
    const T = today(), t = D.nowHM();
    const r = get('SELECT * FROM attendance WHERE user_id=? AND work_date=?', user.id, T);
    const ip = String((process.env.TRUST_PROXY === '1' && (req.headers['cf-connecting-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0].trim())) || req.socket.remoteAddress || '').replace('::ffff:', '');
    if (!r) { run(`INSERT INTO attendance(user_id,work_date,check_in,source,note,updated_at) VALUES(?,?,?,?,?,?)`, user.id, T, t, 'web', 'IP ' + ip, now()); return { action: 'in', time: t }; }
    run('UPDATE attendance SET check_out=?, updated_at=? WHERE id=?', t, now(), r.id);
    return { action: 'out', time: t, check_in: r.check_in };
  });
  route('GET', '/api/attendance/sheet', ({ user, query }) => {
    const m = validMonth(query.month) ? query.month : today().slice(0, 7);
    const ids = query.mine === '1' ? [user.id] : scopeUsers(user, query.dept);
    const sheet = buildSheet(m, ids);
    sheet.can_edit = isHR(user);
    sheet.scope = isHR(user) || isDirector(user) ? 'all' : deptHeadOf(user).length ? 'dept' : 'self';
    sheet.records = all(`SELECT * FROM attendance WHERE work_date LIKE ? AND user_id IN (${ids.map(() => '?').join(',') || 'NULL'})`, m + '%', ...ids);
    return sheet;
  });
  route('PUT', '/api/attendance/record', ({ user, body }) => {
    if (!isHR(user)) forbid('Chỉ Phòng Hành chính – Nhân sự được điều chỉnh dữ liệu chấm công.');
    const uid = int(body.user_id), d = body.work_date;
    if (!get('SELECT 1 FROM users WHERE id=?', uid) || !isDate(d)) bad('Dữ liệu không hợp lệ.');
    const tm = v => v === '' || v == null ? null : (/^\d{2}:\d{2}$/.test(v) ? v : bad('Giờ phải có dạng HH:MM.'));
    const ci = tm(body.check_in), co = tm(body.check_out), note = str(body.note, 300);
    if (!note) bad('Vui lòng ghi lý do điều chỉnh.');
    if (!ci && !co) run('DELETE FROM attendance WHERE user_id=? AND work_date=?', uid, d);
    else run(`INSERT INTO attendance(user_id,work_date,check_in,check_out,source,note,edited_by,updated_at) VALUES(?,?,?,?, 'hr', ?, ?, ?)
      ON CONFLICT(user_id, work_date) DO UPDATE SET check_in=excluded.check_in, check_out=excluded.check_out, source='hr', note=excluded.note, edited_by=excluded.edited_by, updated_at=excluded.updated_at`, uid, d, ci, co, note, user.id, now());
    log(user.id, `điều chỉnh chấm công ngày ${d.split('-').reverse().join('/')} của <b>${esc(get('SELECT full_name n FROM users WHERE id=?', uid).n)}</b>`);
    return { ok: true };
  });
  route('GET', '/api/export/attendance.csv', ({ user, query, res }) => {
    const m = validMonth(query.month) ? query.month : today().slice(0, 7);
    const ids = scopeUsers(user, query.dept), s = buildSheet(m, ids);
    const names = new Map(all('SELECT u.id, u.full_name, d.name dn FROM users u LEFT JOIN departments d ON d.id=u.dept_id').map(u => [u.id, u]));
    const head = ['STT', 'Họ và tên', 'Phòng ban', ...s.days.map(d => d.slice(8)), 'Công thực tế', 'Đi muộn/về sớm', 'Phép', 'Công tác', 'Lễ', 'Vắng', 'Tăng ca (giờ)', 'Công hưởng lương'];
    const rows = s.rows.map((r, i) => [i + 1, names.get(r.user_id).full_name, names.get(r.user_id).dn, ...s.days.map(d => r.cells[d]), r.totals.work, r.totals.late, r.totals.leave, r.totals.trip, r.totals.holiday, r.totals.absent, r.totals.ot, r.totals.paid]);
    const csv = '﻿' + [[`BẢNG CHẤM CÔNG THÁNG ${m.slice(5)}/${m.slice(0, 4)}`], [`Số ngày công chuẩn: ${s.std_days}`], head, ...rows].map(r => r.map(v => { const x = String(v ?? ''); return /[",\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; }).join(',')).join('\r\n');
    res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="bang-cham-cong-${m}.csv"` });
    res.end(csv);
  }, { raw: true });

  /* ----- Hồ sơ lương ----- */
  route('GET', '/api/payroll/profiles', ({ user }) => {
    if (!isPayroll(user)) forbid();
    return all(`SELECT u.id user_id, u.full_name, u.title, u.dept_id, COALESCE(s.base_salary,0) base_salary, COALESCE(s.insurance_salary,0) insurance_salary,
      COALESCE(s.insured,1) insured, COALESCE(s.allowance_taxable,0) allowance_taxable, COALESCE(s.allowance_nontax,0) allowance_nontax,
      COALESCE(s.dependents,0) dependents, COALESCE(s.tax_mode,'progressive') tax_mode, COALESCE(s.bank_account,'') bank_account, COALESCE(s.bank_name,'') bank_name, s.updated_at
      FROM users u LEFT JOIN salary_profiles s ON s.user_id=u.id WHERE u.active=1 ORDER BY u.dept_id, u.full_name`);
  });
  route('PUT', '/api/payroll/profiles/:id', ({ user, params, body }) => {
    if (!isPayroll(user)) forbid();
    const uid = int(params.id); if (!get('SELECT 1 FROM users WHERE id=?', uid)) notFound();
    const money = k => { const n = int(String(body[k] ?? 0).replace(/\D/g, '')); if (n < 0) bad('Số tiền không hợp lệ.'); return n; };
    const base = money('base_salary'), ins = money('insurance_salary');
    const pay = st().pay;
    if (base && base < pay.region_min && body.tax_mode !== 'flat10') bad(`Lương chính thấp hơn mức lương tối thiểu vùng (${pay.region_min.toLocaleString('vi-VN')} đồng). Vui lòng kiểm tra lại.`);
    const mode = ['progressive', 'flat10', 'none'].includes(body.tax_mode) ? body.tax_mode : 'progressive';
    run(`INSERT INTO salary_profiles(user_id,base_salary,insurance_salary,insured,allowance_taxable,allowance_nontax,dependents,tax_mode,bank_account,bank_name,updated_at,updated_by)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET base_salary=excluded.base_salary, insurance_salary=excluded.insurance_salary, insured=excluded.insured,
      allowance_taxable=excluded.allowance_taxable, allowance_nontax=excluded.allowance_nontax, dependents=excluded.dependents, tax_mode=excluded.tax_mode,
      bank_account=excluded.bank_account, bank_name=excluded.bank_name, updated_at=excluded.updated_at, updated_by=excluded.updated_by`,
      uid, base, ins || base, body.insured === false ? 0 : 1, money('allowance_taxable'), money('allowance_nontax'), Math.max(0, Math.min(20, int(body.dependents))), mode, str(body.bank_account, 40), str(body.bank_name, 80), now(), user.id);
    return { ok: true };
  });

  /* ----- Kỳ lương ----- */
  route('GET', '/api/payroll/periods', ({ user }) => {
    const rows = all(`SELECT p.*, (SELECT COUNT(*) FROM payroll_lines l WHERE l.period_id=p.id) n, (SELECT SUM(gross) FROM payroll_lines l WHERE l.period_id=p.id) gross,
      (SELECT SUM(net) FROM payroll_lines l WHERE l.period_id=p.id) net, (SELECT SUM(er_total) FROM payroll_lines l WHERE l.period_id=p.id) er,
      (SELECT SUM(pit) FROM payroll_lines l WHERE l.period_id=p.id) pit, (SELECT SUM(ins_total) FROM payroll_lines l WHERE l.period_id=p.id) ins FROM payroll_periods p ORDER BY month DESC`);
    if (!isPayroll(user)) return { can_manage: false, periods: [] };
    return { can_manage: true, periods: rows };
  });
  route('POST', '/api/payroll/periods', ({ user, body }) => {
    if (!isPayroll(user)) forbid();
    const m = body.month; if (!validMonth(m)) bad('Tháng không hợp lệ.');
    if (get('SELECT 1 FROM payroll_periods WHERE month=?', m)) bad('Bảng lương tháng này đã tồn tại.');
    if (!get('SELECT 1 FROM salary_profiles WHERE base_salary > 0')) bad('Chưa có hồ sơ lương. Vui lòng khai báo lương chính cho nhân sự trước.');
    const id = Number(run(`INSERT INTO payroll_periods(month,status,created_by,created_at) VALUES(?, 'draft', ?, ?)`, m, user.id, now()).lastInsertRowid);
    calcPeriod(id);
    log(user.id, `lập bảng lương tháng ${m.slice(5)}/${m.slice(0, 4)}`);
    return { id };
  });
  const periodOr404 = id => get('SELECT * FROM payroll_periods WHERE id=?', int(id)) || notFound('Kỳ lương không tồn tại.');
  route('GET', '/api/payroll/periods/:id', ({ user, params }) => {
    if (!isPayroll(user)) forbid();
    const p = periodOr404(params.id);
    p.params = JSON.parse(p.params || '{}');
    p.lines = all('SELECT * FROM payroll_lines WHERE period_id=? ORDER BY id', p.id);
    return p;
  });
  route('POST', '/api/payroll/periods/:id/:action', ({ user, params, body }) => {
    if (!isPayroll(user)) forbid();
    const p = periodOr404(params.id), a = params.action;
    if (a === 'recalc') { if (p.status !== 'draft') bad('Bảng lương đã chốt, không thể tính lại.'); calcPeriod(p.id); return { ok: true }; }
    if (a === 'lock') {
      if (p.status !== 'draft') bad('Bảng lương đã chốt.');
      if (!(isAdmin(user) || isDirector(user) || user.id === st().accountant_id)) forbid('Chỉ Giám đốc, Kế toán trưởng hoặc quản trị viên được chốt bảng lương.');
      run(`UPDATE payroll_periods SET status='locked', locked_by=?, locked_at=? WHERE id=?`, user.id, now(), p.id);
      log(user.id, `chốt bảng lương tháng ${p.month.slice(5)}/${p.month.slice(0, 4)}`); return { ok: true };
    }
    if (a === 'unlock') {
      if (!(isAdmin(user) || isDirector(user))) forbid('Chỉ Giám đốc hoặc quản trị viên được mở lại bảng lương đã chốt.');
      if (!str(body.note)) bad('Vui lòng ghi lý do mở lại bảng lương.');
      run(`UPDATE payroll_periods SET status='draft', locked_by=NULL, locked_at=NULL WHERE id=?`, p.id);
      log(user.id, `mở lại bảng lương tháng ${p.month.slice(5)}/${p.month.slice(0, 4)}: ${esc(str(body.note, 200))}`); return { ok: true };
    }
    if (a === 'delete') { if (p.status !== 'draft') bad('Không thể xóa bảng lương đã chốt.'); run('DELETE FROM payroll_periods WHERE id=?', p.id); return { ok: true }; }
    notFound();
  });
  route('PUT', '/api/payroll/lines/:id', ({ user, params, body }) => {
    if (!isPayroll(user)) forbid();
    const l = get('SELECT * FROM payroll_lines WHERE id=?', int(params.id)) || notFound();
    const p = periodOr404(l.period_id); if (p.status !== 'draft') bad('Bảng lương đã chốt, không thể chỉnh sửa.');
    const m = k => { const n = int(String(body[k] ?? l[k] ?? 0).replace(/\D/g, '')); return Math.max(0, n); };
    run('UPDATE payroll_lines SET bonus=?, other_deduction=?, advance=?, note=? WHERE id=?', m('bonus'), m('other_deduction'), m('advance'), str(body.note ?? l.note, 300), l.id);
    calcPeriod(p.id);
    return get('SELECT * FROM payroll_lines WHERE period_id=? AND user_id=?', p.id, l.user_id);
  });
  route('GET', '/api/payroll/my', ({ user }) => all(`SELECT l.*, p.month, p.locked_at FROM payroll_lines l JOIN payroll_periods p ON p.id=l.period_id
    WHERE l.user_id=? AND p.status='locked' ORDER BY p.month DESC`, user.id));
  route('GET', '/api/export/payroll.csv', ({ user, query, res }) => {
    if (!isPayroll(user)) forbid();
    const p = periodOr404(query.id), L = all('SELECT * FROM payroll_lines WHERE period_id=? ORDER BY id', p.id);
    const head = ['STT', 'Họ và tên', 'Chức danh', 'Phòng ban', 'Lương chính', 'Lương đóng BH', 'Công chuẩn', 'Công hưởng lương', 'Lương theo công', 'Phụ cấp chịu thuế', 'Phụ cấp không chịu thuế', 'Giờ tăng ca', 'Tiền tăng ca', 'Thưởng', 'Tổng thu nhập', 'BHXH 8%', 'BHYT 1,5%', 'BHTN 1%', 'Số NPT', 'Giảm trừ gia cảnh', 'Thu nhập tính thuế', 'Thuế TNCN', 'Khấu trừ khác', 'Tạm ứng', 'Thực lĩnh', 'ĐV đóng BHXH', 'ĐV đóng BHYT', 'ĐV đóng BHTN', 'KPCĐ', 'Ghi chú'];
    const rows = L.map((l, i) => [i + 1, l.full_name, l.title, l.dept_name, l.base_salary, l.insurance_salary, l.std_days, l.paid_days, l.salary_by_days, l.allowance_taxable, l.allowance_nontax, l.ot_hours, l.ot_pay, l.bonus, l.gross, l.ins_bhxh, l.ins_bhyt, l.ins_bhtn, l.dependents, l.deduction_family, l.taxable_income, l.pit, l.other_deduction, l.advance, l.net, l.er_bhxh, l.er_bhyt, l.er_bhtn, l.er_kpcd, l.note]);
    const sum = k => L.reduce((s, l) => s + (l[k] || 0), 0);
    rows.push(['', 'TỔNG CỘNG', '', '', sum('base_salary'), sum('insurance_salary'), '', '', sum('salary_by_days'), sum('allowance_taxable'), sum('allowance_nontax'), sum('ot_hours'), sum('ot_pay'), sum('bonus'), sum('gross'), sum('ins_bhxh'), sum('ins_bhyt'), sum('ins_bhtn'), '', '', sum('taxable_income'), sum('pit'), sum('other_deduction'), sum('advance'), sum('net'), sum('er_bhxh'), sum('er_bhyt'), sum('er_bhtn'), sum('er_kpcd'), '']);
    const csv = '﻿' + [[`BẢNG THANH TOÁN TIỀN LƯƠNG THÁNG ${p.month.slice(5)}/${p.month.slice(0, 4)}`], [`Tình trạng: ${p.status === 'locked' ? 'Đã chốt' : 'Bản nháp'}`], head, ...rows].map(r => r.map(v => { const x = String(v ?? ''); return /[",\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; }).join(',')).join('\r\n');
    res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="bang-luong-${p.month}.csv"` });
    res.end(csv);
  }, { raw: true });

  /* ----- Cấu hình chấm công, tiền lương ----- */
  route('PUT', '/api/admin/hr-settings', ({ body }) => {
    const t = v => /^\d{2}:\d{2}$/.test(v || '') ? v : bad('Giờ làm việc phải có dạng HH:MM.');
    D.setSetting('work_start', t(body.work_start)); D.setSetting('work_end', t(body.work_end));
    D.setSetting('late_grace', Math.max(0, Math.min(120, int(body.late_grace))));
    D.setSetting('work_saturday', body.work_saturday ? '1' : '0');
    D.setSetting('holidays', String(body.holidays || '').split(/[\s,;]+/).filter(x => isDate(x)).join(','));
    const p = body.pay || {}, num = (k, min = 0, max = 1e10) => { const n = Number(p[k]); if (!Number.isFinite(n) || n < min || n > max) bad('Tham số tính lương không hợp lệ: ' + k); return n; };
    const brackets = Array.isArray(p.brackets) ? p.brackets.map(b => [b[0] == null || b[0] === '' ? null : Number(b[0]), Number(b[1])]) : D.getSettings().pay.brackets;
    if (!brackets.length || brackets[brackets.length - 1][0] != null || brackets.some(b => !(b[1] >= 0 && b[1] <= 100))) bad('Biểu thuế không hợp lệ: bậc cuối cùng phải để trống mức trần.');
    D.setSetting('payroll_params', JSON.stringify({ ded_self: num('ded_self'), ded_dependent: num('ded_dependent'), ref_wage: num('ref_wage', 1), region_min: num('region_min', 1),
      ee_bhxh: num('ee_bhxh', 0, 50), ee_bhyt: num('ee_bhyt', 0, 50), ee_bhtn: num('ee_bhtn', 0, 50), er_bhxh: num('er_bhxh', 0, 50), er_bhyt: num('er_bhyt', 0, 50), er_bhtn: num('er_bhtn', 0, 50), er_kpcd: num('er_kpcd', 0, 50),
      ot_rate: num('ot_rate', 100, 400), hours_per_day: num('hours_per_day', 1, 12), brackets }));
    return D.getSettings();
  }, { admin: true });

  return { isPayroll };
}

/* ================= Dữ liệu mẫu bổ sung ================= */
function seedExtras() {
  if (get(`SELECT value v FROM settings WHERE key='extras_v2'`)) return;
  const demo = get(`SELECT id FROM users WHERE username='thanh.nv'`);
  D.setSetting('extras_v2', '1');
  if (!demo) return;
  const st = D.getSettings(), T = today();
  const users = all('SELECT id, username FROM users WHERE active=1 AND username<>?', 'admin');
  const sal = { 'thanh.nv': [45000000, 45000000, 5000000, 1, 1], 'huong.tt': [28000000, 28000000, 3000000, 1, 2], 'quan.lm': [25000000, 22000000, 3000000, 1, 1], 'trang.pt': [22000000, 20000000, 2000000, 1, 1],
    'huy.dq': [14000000, 12000000, 1000000, 1, 0], 'anh.vn': [13000000, 12000000, 1000000, 1, 0], 'long.hd': [18000000, 16000000, 1500000, 1, 1], 'mai.bt': [11000000, 10000000, 500000, 1, 0] };
  tx(() => {
    for (const u of users) {
      const s = sal[u.username]; if (!s) continue;
      run(`INSERT OR IGNORE INTO salary_profiles(user_id,base_salary,insurance_salary,insured,allowance_taxable,allowance_nontax,dependents,tax_mode,bank_name,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)`,
        u.id, s[0], s[1], 1, s[2], 730000, s[4], 'progressive', 'Vietcombank', now());
    }
    /* Chấm công 2 tháng gần nhất (dữ liệu giả lập, có xác định) */
    const first = addDays(T.slice(0, 8) + '01', -35);
    let seed = 7; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    for (let d = first; d < T; d = addDays(d, 1)) {
      if (!isWorkday(d, st) || st.holidays.includes(d)) continue;
      for (const u of users) {
        const r = rnd();
        if (r < 0.03) continue; // vắng
        const lateMin = r > 0.9 ? 10 + Math.floor(rnd() * 25) : -Math.floor(rnd() * 20);
        const inM = 8 * 60 + lateMin, outM = 17 * 60 + Math.floor(rnd() * 50);
        run('INSERT OR IGNORE INTO attendance(user_id,work_date,check_in,check_out,source,updated_at) VALUES(?,?,?,?,?,?)', u.id, d, `${pad(Math.floor(inM / 60))}:${pad(inM % 60)}`, `${pad(Math.floor(outM / 60))}:${pad(outM % 60)}`, 'web', now());
      }
    }
    /* Đề xuất tăng ca, công tác đã duyệt */
    const y = T.slice(0, 4), uid = n => users.find(u => u.username === n)?.id, ts = (n, h) => addDays(T, n) + ' ' + h + ':00';
    const mk = (code, type, title, creator, from, to, days, hours, approver) => {
      const id = Number(run(`INSERT OR IGNORE INTO requests(code,type,title,amount,date_from,date_to,days,hours,reason,creator_id,status,created_at,closed_at) VALUES(?,?,?,0,?,?,?,?,?,?, 'approved', ?, ?)`,
        code, type, title, from, to, days, hours, 'Theo kế hoạch công việc của phòng.', creator, ts(-20, '09:00'), ts(-19, '10:00')).lastInsertRowid);
      if (id) run(`INSERT INTO request_steps(request_id,seq,approver_id,label,status,acted_at) VALUES(?,1,?,?, 'approved', ?)`, id, approver, 'Lãnh đạo phòng', ts(-19, '10:00'));
    };
    const pm = addDays(T.slice(0, 8) + '01', -1).slice(0, 7);
    mk(`ĐX-${y}-0101`, 'tangca', 'Làm thêm giờ hoàn thiện hồ sơ thầu', uid('anh.vn'), pm + '-12', pm + '-12', 0, 3, uid('quan.lm'));
    mk(`ĐX-${y}-0102`, 'tangca', 'Làm thêm giờ chốt số liệu kinh doanh', uid('huy.dq'), pm + '-20', pm + '-20', 0, 4, uid('quan.lm'));
    mk(`ĐX-${y}-0103`, 'congtac', 'Công tác Hà Nội làm việc với đối tác', uid('quan.lm'), pm + '-14', pm + '-15', 2, 0, uid('thanh.nv'));
  });
  /* Bảng lương tháng trước, đã chốt */
  const pm = addDays(T.slice(0, 8) + '01', -1).slice(0, 7);
  const pid = Number(run(`INSERT OR IGNORE INTO payroll_periods(month,status,created_at) VALUES(?, 'draft', ?)`, pm, now()).lastInsertRowid);
  if (pid) { calcPeriod(pid); run(`UPDATE payroll_periods SET status='locked', locked_at=?, locked_by=? WHERE id=?`, now(), get(`SELECT id FROM users WHERE username='huong.tt'`)?.id || null, pid); }
}

module.exports = { register, seedExtras, buildSheet, pitProgressive, computeLine, isWorkday };
