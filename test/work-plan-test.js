// Kiểm thử hàm thuần lập kế hoạch (work-plan.js) theo các ví dụ trong bài Base Wework "Cách tạo công việc lặp lại" (63000268543).
'use strict';
const P = require('../work-plan.js');
let pass = 0, fail = 0;
const eq = (got, want, name) => { const g = JSON.stringify(got), w = JSON.stringify(want); if (g === w) pass++; else { fail++; console.log('  ✗ ' + name + '\n    nhận: ' + g + '\n    cần : ' + w); } };
const R = r => { const x = P.normalizeRule(r); if (x.error) throw new Error(x.error); return x.rule; };

// a. Theo ngày: vòng lặp 7, ngày thứ 2 và 5 của chu kỳ; bắt đầu thứ Hai 30/10/2023
eq(P.nextOccurrences(R({ freq: 'day', interval: 7, days: [2, 5] }), '2023-10-30', null, '2023-10-30', 4), ['2023-10-31', '2023-11-03', '2023-11-07', '2023-11-10'], 'lặp theo ngày (ví dụ a của Base)');
// b. Theo tuần: 2 tuần 1 lần, tuần thứ 1, thứ Bảy
eq(P.nextOccurrences(R({ freq: 'week', interval: 2, weeks: [1], weekdays: [6] }), '2023-10-30', null, '2023-10-30', 3), ['2023-11-04', '2023-11-18', '2023-12-02'], 'lặp theo tuần (ví dụ b của Base)');
// c1. Theo tháng: ngày 15 và ngày cuối cùng; năm nhuận 2024; ngày 31 bị bỏ qua ở tháng 30 ngày
eq(P.nextOccurrences(R({ freq: 'month', interval: 1, mode: 'monthday', monthdays: [15], last: true }), '2024-01-01', null, '2024-01-01', 6), ['2024-01-15', '2024-01-31', '2024-02-15', '2024-02-29', '2024-03-15', '2024-03-31'], 'lặp theo tháng, ngày 15 và ngày cuối (ví dụ c1)');
eq(P.nextOccurrences(R({ freq: 'month', interval: 1, mode: 'monthday', monthdays: [31] }), '2024-01-01', null, '2024-01-01', 3), ['2024-01-31', '2024-03-31', '2024-05-31'], 'ngày 31 bỏ qua tháng không có ngày 31');
// c2. Theo tháng: thứ Hai lần 1 và lần 3
eq(P.nextOccurrences(R({ freq: 'month', interval: 1, mode: 'weekday', weekdays: [1], nth: [1, 3] }), '2024-01-01', null, '2024-01-01', 4), ['2024-01-01', '2024-01-15', '2024-02-05', '2024-02-19'], 'lặp theo tháng, thứ Hai lần 1 và 3 (ví dụ c2)');
// Hàng quý = tháng, vòng lặp 3
eq(P.nextOccurrences(R({ freq: 'month', interval: 3, mode: 'monthday', monthdays: [10] }), '2024-02-01', null, '2024-02-01', 3), ['2024-02-10', '2024-05-10', '2024-08-10'], 'lặp hàng quý');
// d. Theo năm: ngày 5 các tháng 1, 4, 7, 10
eq(P.nextOccurrences(R({ freq: 'year', interval: 1, months: [1, 4, 7, 10], mode: 'monthday', monthdays: [5] }), '2024-01-01', null, '2024-01-01', 5), ['2024-01-05', '2024-04-05', '2024-07-05', '2024-10-05', '2025-01-05'], 'lặp theo năm (ví dụ d của Base)');
// Ngày kết thúc chặn sinh thêm; "sau ngày" không bao gồm chính ngày đó
eq(P.nextOccurrences(R({ freq: 'week', interval: 1, weekdays: [1, 3] }), '2024-01-01', '2024-01-10', '2024-01-01', 10), ['2024-01-01', '2024-01-03', '2024-01-08', '2024-01-10'], 'ngày kết thúc');
eq(P.nextOccurrences(R({ freq: 'week', interval: 1, weekdays: [1, 3] }), '2024-01-01', null, '2024-01-03', 1, false), ['2024-01-08'], 'lần kế tiếp sau một ngày cho trước');
// Thời hạn tính theo giờ từ 00:00 (Base: 15.5 cùng ngày; 39.5 ngày hôm sau)
eq(P.dueFromHours('2024-01-01', 15.5), { due_date: '2024-01-01', due_time: '15:30' }, 'thời hạn 15.5 giờ');
eq(P.dueFromHours('2024-01-01', 39.5), { due_date: '2024-01-02', due_time: '15:30' }, 'thời hạn 39.5 giờ');
// Quy tắc sai bị từ chối
eq(!!P.normalizeRule({ freq: 'week', interval: 1, weekdays: [] }).error, true, 'thiếu thứ trong tuần bị từ chối');
eq(!!P.normalizeRule({ freq: 'hour' }).error, true, 'chu kỳ không hợp lệ bị từ chối');
eq(!!P.normalizeRule({ freq: 'year', months: [], monthdays: [1] }).error, true, 'thiếu tháng trong năm bị từ chối');
// Bộ tính công thức trường tùy chỉnh (public/work-formula.js): không dùng eval, thứ tự phép tính như Excel
const FM = require('../public/work-formula.js');
eq(FM.evaluate('ROUND($a/3,2)+IF($a>2,10,0)', { a: 4 }), { ok: true, value: 11.33 }, 'công thức ROUND, IF, so sánh');
eq(FM.evaluate('2^3^2', {}).value, 64, 'lũy thừa tính từ trái sang phải như Excel');
eq(FM.evaluate('-$a+AVERAGE(2;4)*2', { a: 1 }).value, 5, 'dấu âm, dấu ; phân cách đối số, ưu tiên nhân');
eq(FM.evaluate('SUM($x,1)', {}).value, 1, 'biến chưa có giá trị tính là 0');
eq(FM.check('SUM($a,$x)', ['a']).ok, false, 'biến không tồn tại bị từ chối');
eq(FM.check('constructor.constructor("x")()', []).ok, false, 'mã lạ bị từ chối');
eq(FM.evaluate('1/0', {}).ok, false, 'chia cho 0 báo không xác định');
console.log(`work-plan-test: ${pass} đạt, ${fail} không đạt`);
process.exit(fail ? 1 : 0);
