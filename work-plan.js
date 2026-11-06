'use strict';
/**
 * SmartOffice — Hàm thuần cho lập kế hoạch công việc (không truy cập CSDL, không phụ thuộc môi trường).
 * Căn cứ nghiệp vụ: Base Wework "Cách tạo công việc lặp lại" (bài 63000268543, sửa đổi 21/3/2024).
 *
 * Quy tắc lặp (rule) theo chu kỳ freq:
 *  - day   : interval N ngày; days = các ngày thứ mấy trong chu kỳ (1..N), tính từ ngày bắt đầu.
 *  - week  : interval N tuần; weeks = tuần thứ mấy trong chu kỳ (1..N, tuần thứ 1 là tuần chứa ngày bắt đầu, tuần bắt đầu thứ Hai);
 *            weekdays = thứ trong tuần (1 = thứ Hai … 7 = Chủ nhật).
 *  - month : interval N tháng (tháng của ngày bắt đầu là tháng thứ 1); mode 'monthday' + monthdays (1..31, 'last')
 *            hoặc mode 'weekday' + weekdays + nth (1..5: lần thứ mấy của thứ đó trong tháng).
 *  - year  : interval N năm; months (1..12) + mode 'monthday' / 'weekday' như trên.
 *  Ngày 31 (hoặc 29, 30) không có trong tháng thì bỏ qua; 'last' là ngày cuối cùng của tháng.
 */
const DAY = 864e5;
const dn = s => Math.floor(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / DAY);
const ds = n => new Date(n * DAY).toISOString().slice(0, 10);
const addDaysStr = (s, k) => ds(dn(s) + k);
const isoWeekday = n => ((new Date(n * DAY).getUTCDay() + 6) % 7) + 1; // 1 = thứ Hai
const lastDayOfMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m: 1..12
const FREQS = ['day', 'week', 'month', 'year'];

const ints = (v, lo, hi) => [...new Set((Array.isArray(v) ? v : []).map(Number).filter(x => Number.isInteger(x) && x >= lo && x <= hi))].sort((a, b) => a - b);

/* Chuẩn hóa và kiểm tra quy tắc; trả về { rule } hoặc { error } */
function normalizeRule(input) {
  const r = input || {};
  const freq = FREQS.includes(r.freq) ? r.freq : null;
  if (!freq) return { error: 'Chu kỳ lặp không hợp lệ.' };
  const interval = Math.trunc(Number(r.interval) || 1);
  if (interval < 1 || interval > (freq === 'day' ? 366 : freq === 'week' ? 52 : freq === 'month' ? 24 : 10)) return { error: 'Vòng lặp không hợp lệ.' };
  const out = { freq, interval };
  if (freq === 'day') {
    out.days = ints(r.days, 1, interval); if (!out.days.length) out.days = [1];
  } else if (freq === 'week') {
    out.weeks = ints(r.weeks, 1, interval); if (!out.weeks.length) out.weeks = [1];
    out.weekdays = ints(r.weekdays, 1, 7); if (!out.weekdays.length) return { error: 'Vui lòng chọn thứ trong tuần.' };
  } else {
    if (freq === 'year') { out.months = ints(r.months, 1, 12); if (!out.months.length) return { error: 'Vui lòng chọn tháng trong năm.' }; }
    out.mode = r.mode === 'weekday' ? 'weekday' : 'monthday';
    if (out.mode === 'monthday') {
      out.monthdays = ints(r.monthdays, 1, 31);
      out.last = !!r.last || (Array.isArray(r.monthdays) && r.monthdays.includes('last'));
      if (!out.monthdays.length && !out.last) return { error: 'Vui lòng chọn ngày trong tháng.' };
    } else {
      out.weekdays = ints(r.weekdays, 1, 7); out.nth = ints(r.nth, 1, 5);
      if (!out.weekdays.length || !out.nth.length) return { error: 'Vui lòng chọn thứ và lần thứ mấy trong tháng.' };
    }
  }
  return { rule: out };
}

/* Ngày d (số ngày) có thỏa quy tắc không, tính từ ngày bắt đầu start (số ngày) */
function matches(rule, start, d) {
  if (d < start) return false;
  const dt = new Date(d * DAY), y = dt.getUTCFullYear(), m = dt.getUTCMonth() + 1, day = dt.getUTCDate();
  const st = new Date(start * DAY), sy = st.getUTCFullYear(), sm = st.getUTCMonth() + 1;
  if (rule.freq === 'day') return rule.days.includes(((d - start) % rule.interval) + 1);
  if (rule.freq === 'week') {
    const wk0 = start - (isoWeekday(start) - 1), w = Math.floor((d - wk0) / 7);
    return rule.weeks.includes((w % rule.interval) + 1) && rule.weekdays.includes(isoWeekday(d));
  }
  if (rule.freq === 'month') { if (((y - sy) * 12 + (m - sm)) % rule.interval !== 0) return false; }
  else { if ((y - sy) % rule.interval !== 0 || !rule.months.includes(m)) return false; }
  if (rule.mode === 'monthday') return rule.monthdays.includes(day) || (rule.last && day === lastDayOfMonth(y, m));
  return rule.weekdays.includes(isoWeekday(d)) && rule.nth.includes(Math.floor((day - 1) / 7) + 1);
}

/* Các lần lặp kế tiếp: ngày > after (hoặc ≥ from nếu after null), trong [start, end]; tối đa count lần, quét tối đa ~6 năm */
function nextOccurrences(rule, startStr, endStr, fromStr, count = 10, inclusive = true) {
  const start = dn(startStr), end = endStr ? dn(endStr) : Infinity, out = [];
  let d = Math.max(start, dn(fromStr) + (inclusive ? 0 : 1));
  for (let i = 0; i < 2200 && d <= end && out.length < count; i++, d++) if (matches(rule, start, d)) out.push(ds(d));
  return out;
}

/* Thời hạn của một lần lặp: tính bằng giờ từ 00:00 ngày lặp (Base: 15.5 = 15:30 cùng ngày; 39.5 = 15:30 ngày hôm sau) */
function dueFromHours(dateStr, hours) {
  const h = Math.max(0, Number(hours) || 0), days = Math.floor(h / 24), rest = h - days * 24;
  const hh = Math.floor(rest), mm = Math.round((rest - hh) * 60);
  return { due_date: addDaysStr(dateStr, days), due_time: `${String(hh).padStart(2, '0')}:${String(mm === 60 ? 59 : mm).padStart(2, '0')}` };
}

/* Phụ thuộc: loại quan hệ và điểm neo của công việc phụ thuộc (pred) */
const DEP_TYPES = ['FS', 'FF', 'SS', 'SF'];
const anchorIsEnd = type => type === 'FS' || type === 'FF';   // neo theo thời hạn của công việc phụ thuộc
const targetIsStart = type => type === 'FS' || type === 'SS'; // ràng buộc ngày bắt đầu của công việc bị phụ thuộc

module.exports = { dn, ds, addDaysStr, isoWeekday, normalizeRule, matches, nextOccurrences, dueFromHours, DEP_TYPES, anchorIsEnd, targetIsStart, FREQS };
