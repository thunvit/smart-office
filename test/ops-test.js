// Kiểm thử Vận hành tự chủ (ADR-012): cập nhật tiến độ tuần, giám sát – cảnh báo – leo thang.
// Chạy trên lõi Cloudflare với Durable Object mô phỏng (dùng chung mã nghiệp vụ với bản Node): node test/ops-test.js
'use strict';
const path = require('path'), os = require('os'), fs = require('fs');
const { fakeStorage } = require('./fake-do.js');
const core = require(path.join(__dirname, '..', 'worker', 'do-core.js'));
const DBF = path.join(os.tmpdir(), 'so-ops-test.db');
for (const f of [DBF, DBF + '-wal', DBF + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
const app = core.createApp(fakeStorage(DBF), { SO_DEMO: '1' });
const B = 'https://so.example.workers.dev';
let pass = 0, fail = 0;
const ok = (cond, name, extra) => { if (cond) { pass++; } else { fail++; console.log('  ✗ ' + name + (extra !== undefined ? ' → ' + JSON.stringify(extra).slice(0, 400) : '')); } };
const sessions = {};
async function call(who, method, p, body) {
  const h = { 'content-type': 'application/json', host: 'so.example.workers.dev', origin: B, 'cf-connecting-ip': '198.51.100.' + (Object.keys(sessions).indexOf(who) + 10) };
  if (sessions[who]) h.cookie = sessions[who];
  const r = await core.handleRequest(app, new Request(B + p, { method, headers: h, body: body ? JSON.stringify(body) : undefined }));
  const sc = r.headers.get('set-cookie'); if (sc) sessions[who] = sc.split(';')[0];
  const ct = r.headers.get('content-type') || '';
  return { s: r.status, b: ct.includes('json') ? await r.json() : await r.text() };
}
const login = async (u, pw = '123456') => { sessions[u] = ''; const r = await call(u, 'POST', '/api/login', { username: u, password: pw }); if (r.s !== 200) throw new Error('login ' + u + ' ' + r.s); return r.b.user; };

/* Ngày theo giờ Việt Nam, khớp db.js */
const T = n => new Date(Date.now() + 7 * 3600e3 + n * 864e5).toISOString().slice(0, 10);
const dow = s => { const d = new Date(s + 'T00:00:00Z').getUTCDay(); return d === 0 ? 7 : d; };
const addD = (s, n) => new Date(Date.parse(s + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const WEEK = addD(T(0), 1 - dow(T(0))), LAST = addD(WEEK, -7);

(async () => {
  const id = {};
  for (const u of ['thanh.nv', 'quan.lm', 'huy.dq', 'anh.vn', 'trang.pt', 'mai.bt', 'long.hd', 'huong.tt']) id[u] = (await login(u)).id;
  /* Quản trị viên: đổi mật khẩu lần đầu để dùng được API nghiệp vụ */
  await login('admin', 'Admin@123');
  let r = await call('admin', 'PUT', '/api/me/password', { old_password: 'Admin@123', new_password: 'Quan-tri#2026' });
  if (r.s !== 200) throw new Error('đổi mật khẩu admin ' + r.s);

  /* ---------- A. Cập nhật tiến độ tuần ---------- */
  r = await call('huy.dq', 'GET', '/api/ops/checkin');
  ok(r.s === 200 && r.b.week === WEEK && r.b.editable === true && r.b.checkin === null, 'A1 tuần mặc định là tuần hiện tại, chưa có cập nhật', r.b);
  ok(Array.isArray(r.b.suggest.open) && Array.isArray(r.b.suggest.done) && Array.isArray(r.b.suggest.goals), 'A2 có gợi ý từ dữ liệu công việc, mục tiêu', r.b.suggest);
  ok((await call('huy.dq', 'GET', '/api/ops/checkin?week=' + addD(WEEK, 1))).s === 400, 'A3 tuần không bắt đầu Thứ Hai bị từ chối');
  ok((await call('huy.dq', 'GET', '/api/ops/checkin?week=2026-02-30')).s === 400, 'A4 ngày không tồn tại bị từ chối');
  ok((await call('huy.dq', 'PUT', '/api/ops/checkin', { week: addD(WEEK, -14), done: 'x' })).s === 400, 'A5 không sửa được tuần cách 2 tuần');
  ok((await call('huy.dq', 'PUT', '/api/ops/checkin', { week: addD(WEEK, 7), done: 'x' })).s === 400, 'A6 không cập nhật trước tuần tương lai');
  ok((await call('huy.dq', 'PUT', '/api/ops/checkin', { week: WEEK })).s === 400, 'A7 phải nhập Đã làm hoặc Sẽ làm');
  ok((await call('huy.dq', 'PUT', '/api/ops/checkin', { week: WEEK, done: 'a', need_help: true })).s === 400, 'A8 cần hỗ trợ phải mô tả vướng mắc');
  r = await call('huy.dq', 'PUT', '/api/ops/checkin', { week: WEEK, done: 'Gặp 3 khách hàng', next: 'Chốt hợp đồng', blockers: 'Chưa có báo giá mới', need_help: true });
  ok(r.s === 200 && r.b.need_help === true && r.b.week === WEEK, 'A9 lưu cập nhật tuần hiện tại', r.b);
  const ckHuy = r.b.id;
  r = await call('huy.dq', 'PUT', '/api/ops/checkin', { week: LAST, done: '<script>x</script>', next: 'y' });
  ok(r.s === 200 && r.b.done === '<script>x</script>', 'A10 cập nhật bù tuần trước; lưu nguyên văn (giao diện thoát HTML)', r.b);
  r = await call('huy.dq', 'PUT', '/api/ops/checkin', { week: WEEK, done: 'x'.repeat(5000), next: 'b' });
  ok(r.s === 200 && r.b.done.length === 3000, 'A11 giới hạn 3000 ký tự', r.b.done && r.b.done.length);
  await call('huy.dq', 'PUT', '/api/ops/checkin', { week: WEEK, done: 'Gặp 3 khách hàng', next: 'Chốt hợp đồng', blockers: 'Chưa có báo giá mới', need_help: true });

  /* Phạm vi xem nhóm */
  ok((await call('huy.dq', 'GET', '/api/ops/checkins')).s === 403, 'A12 nhân viên không xem được cập nhật của nhóm');
  r = await call('quan.lm', 'GET', '/api/ops/checkins');
  ok(r.s === 200 && r.b.rows.length > 0 && r.b.rows.every(x => x.dept_id === r.b.rows[0].dept_id), 'A13 trưởng phòng KD chỉ thấy phòng mình', r.b.rows && r.b.rows.map(x => x.dept_id));
  const rowHuy = r.b.rows.find(x => x.user_id === id['huy.dq']);
  ok(rowHuy && rowHuy.checkin && rowHuy.checkin.need_help === true && r.b.summary.need_help >= 1, 'A14 thấy cập nhật và đề nghị hỗ trợ của huy', r.b.summary);
  ok(r.b.rows.some(x => x.user_id === id['anh.vn'] && x.checkin === null), 'A15 thấy người chưa cập nhật');
  ok(!r.b.rows.some(x => x.user_id === id['mai.bt']), 'A16 không thấy nhân sự phòng khác');
  ok((await call('quan.lm', 'GET', '/api/ops/checkins?dept_id=' + 4)).s === 403, 'A17 trưởng phòng không lọc được phòng khác');
  r = await call('thanh.nv', 'GET', '/api/ops/checkins');
  ok(r.s === 200 && new Set(r.b.rows.map(x => x.dept_id)).size >= 4 && !r.b.rows.some(x => x.user_id === 1), 'A18 giám đốc thấy toàn đơn vị, không gồm tài khoản quản trị', r.b.rows && r.b.rows.length);

  /* Ghi nhận của quản lý */
  ok((await call('anh.vn', 'POST', `/api/ops/checkins/${ckHuy}/ack`, { note: 'x' })).s === 403, 'A19 đồng nghiệp không ghi nhận được');
  ok((await call('trang.pt', 'POST', `/api/ops/checkins/${ckHuy}/ack`, { note: 'x' })).s === 403, 'A20 trưởng phòng khác không ghi nhận được');
  r = await call('huy.dq', 'POST', '/api/ops/checkins/' + ckHuy + '/ack', {});
  ok(r.s === 403, 'A21 không tự ghi nhận');
  ok((await call('quan.lm', 'POST', '/api/ops/checkins/999999/ack', {})).s === 404, 'A22 mã không tồn tại trả 404');

  /* ---------- B. Cảnh báo, leo thang ---------- */
  /* Dự án 1 do long.hd quản lý (dữ liệu mẫu). Tạo việc giao cho huy với các mức quá hạn. */
  const mk = async (who, b) => { const x = await call(who, 'POST', '/api/tasks', Object.assign({ project_id: 1, start_date: T(-30) }, b)); if (x.s !== 200) throw new Error('tạo việc ' + x.s + ' ' + JSON.stringify(x.b)); return x.b.id; };
  await call('long.hd', 'POST', '/api/projects/1/members', { user_id: id['huy.dq'], role: 'member' });
  const tLate1 = await mk('long.hd', { title: 'OPS quá hạn 1 ngày', assignee_id: id['huy.dq'], due_date: T(-1) });
  const tLate4 = await mk('long.hd', { title: 'OPS quá hạn 4 ngày', assignee_id: id['huy.dq'], due_date: T(-4) });
  const tLate9 = await mk('long.hd', { title: 'OPS quá hạn 9 ngày', assignee_id: id['huy.dq'], due_date: T(-9) });
  const tSoon = await mk('long.hd', { title: 'OPS sắp đến hạn', assignee_id: id['huy.dq'], due_date: T(1) });
  const tFree = await mk('long.hd', { title: 'OPS chưa có người nhận', unassigned: true, due_date: T(-2) });

  r = await call('huy.dq', 'GET', '/api/ops/alerts');
  const mine = r.b.items || [];
  const lv = tid => (mine.find(i => i.ref.kind === 'task' && i.ref.id === tid) || {}).level;
  ok(r.s === 200 && r.b.scope === 'mine', 'B1 xem cảnh báo của mình', r.s);
  ok(lv(tLate1) === 1 && lv(tLate4) === 2 && lv(tLate9) === 3, 'B2 mức leo thang theo số ngày quá hạn (1/3/7 ngày)', mine.filter(i => i.ref.kind === 'task').map(i => [i.title, i.level]));
  ok(mine.some(i => i.type === 'due_soon' && i.ref.id === tSoon), 'B3 cảnh báo sắp đến hạn cho người thực hiện');
  ok(mine[0].level >= mine[mine.length - 1].level, 'B4 sắp xếp mức cao trước');
  ok(!mine.some(i => i.ref.id === tFree), 'B5 việc chưa có người nhận không báo cho nhân viên');
  r = await call('long.hd', 'GET', '/api/ops/alerts');
  ok(r.b.items.some(i => i.type === 'unassigned' && i.ref.id === tFree && i.level === 2), 'B6 việc quá hạn chưa có người nhận báo người quản lý dự án (mức 2)', r.b.items.map(i => i.type));

  ok((await call('huy.dq', 'GET', '/api/ops/alerts?scope=team')).s === 403, 'B7 nhân viên không xem cảnh báo của nhóm');
  r = await call('quan.lm', 'GET', '/api/ops/alerts?scope=team');
  const team = r.b.items || [];
  ok(r.s === 200 && team.some(i => i.ref.id === tLate4) && team.some(i => i.ref.id === tLate1), 'B8 trưởng phòng thấy việc quá hạn của nhân viên', team.length);
  ok(!team.some(i => i.type === 'due_soon'), 'B9 chế độ nhóm không gồm việc sắp đến hạn');
  ok(team.some(i => i.type === 'need_help' && i.user_id === id['huy.dq'] && i.level === 2), 'B10 đề nghị hỗ trợ chưa ghi nhận báo trưởng phòng');
  ok(team.every(i => i.dept_id === 3 || i.dept_id == null), 'B11 không lộ cảnh báo phòng khác', [...new Set(team.map(i => i.dept_id))]);
  r = await call('quan.lm', 'GET', '/api/ops/alerts?scope=team&min_level=3');
  ok(r.b.items.length > 0 && r.b.items.every(i => i.level === 3) && r.b.counts['1'] > 0, 'B12 lọc theo mức, vẫn trả số lượng từng mức', r.b.counts);
  r = await call('trang.pt', 'GET', '/api/ops/alerts?scope=team');
  ok(r.s === 200 && !r.b.items.some(i => i.user_id === id['huy.dq']), 'B13 trưởng phòng khác không thấy cảnh báo của huy');
  r = await call('thanh.nv', 'GET', '/api/ops/alerts?scope=team');
  ok(r.b.items.some(i => i.ref.id === tLate9 && i.level === 3), 'B14 giám đốc thấy việc đã leo thang mức 3');

  /* Huy hiệu: trưởng phòng đếm mức ≥ 2 của nhân viên; giám đốc đếm mức 3 */
  const badge = async who => (await call(who, 'GET', '/api/bootstrap')).b.counts.ops;
  const bQuan0 = await badge('quan.lm'), bThanh0 = await badge('thanh.nv'), bAnh0 = await badge('anh.vn');
  ok(typeof bQuan0 === 'number' && bQuan0 >= 3, 'B15 huy hiệu trưởng phòng có cảnh báo leo thang', bQuan0);
  ok(bThanh0 >= 1, 'B16 huy hiệu giám đốc có cảnh báo mức 3', bThanh0);

  /* Ghi nhận đề nghị hỗ trợ thì cảnh báo hết */
  r = await call('quan.lm', 'POST', `/api/ops/checkins/${ckHuy}/ack`, { note: 'Chiều nay gửi báo giá mới' });
  ok(r.s === 200 && r.b.ack_note === 'Chiều nay gửi báo giá mới' && r.b.ack_name, 'B17 trưởng phòng ghi nhận, phản hồi', r.b);
  r = await call('quan.lm', 'GET', '/api/ops/alerts?scope=team');
  ok(!r.b.items.some(i => i.type === 'need_help' && i.user_id === id['huy.dq']), 'B18 đã ghi nhận thì hết cảnh báo cần hỗ trợ');
  ok(await badge('quan.lm') === bQuan0 - 1, 'B19 huy hiệu giảm 1');
  r = await call('huy.dq', 'PUT', '/api/ops/checkin', { week: WEEK, done: 'Gặp 3 khách hàng', next: 'Chốt hợp đồng', blockers: 'Vẫn chưa có báo giá', need_help: true });
  ok(r.s === 200 && r.b.ack_at === null, 'B20 sửa sau khi ghi nhận thì xóa ghi nhận cũ', r.b);
  r = await call('quan.lm', 'GET', '/api/ops/alerts?scope=team');
  ok(r.b.items.some(i => i.type === 'need_help' && i.user_id === id['huy.dq']), 'B21 cảnh báo cần hỗ trợ xuất hiện lại');

  /* Hoàn thành việc thì hết cảnh báo (người quản lý dự án đánh dấu hoàn thành; nếu dự án bật đánh giá thì duyệt) */
  r = await call('long.hd', 'POST', `/api/tasks/${tLate9}/status`, { status: 'done' });
  if (r.s === 200 && r.b.status === 'review') r = await call('long.hd', 'POST', `/api/tasks/${tLate9}/review`, { approve: true });
  ok(r.s === 200 && r.b.status === 'done', 'B22a việc quá hạn 9 ngày chuyển sang hoàn thành', [r.s, r.b && r.b.status]);
  r = await call('huy.dq', 'GET', '/api/ops/alerts');
  ok(!r.b.items.some(i => i.ref.kind === 'task' && i.ref.id === tLate9), 'B22b việc đã hoàn thành không còn cảnh báo');

  /* ---------- C. Tham số ---------- */
  ok((await call('quan.lm', 'PUT', '/api/ops/settings', { overload_open: 2 })).s === 403, 'C1 chỉ quản trị viên đổi tham số');
  ok((await call('admin', 'PUT', '/api/ops/settings', { overload_open: 0 })).s === 400, 'C2 tham số ngoài khoảng bị từ chối');
  ok((await call('admin', 'PUT', '/api/ops/settings', { lv2_days: 5, lv3_days: 5 })).s === 400, 'C3 mức 3 phải lớn hơn mức 2');
  ok((await call('admin', 'PUT', '/api/ops/settings', { lv2_days: 1.5 })).s === 400, 'C4 phải là số nguyên');
  r = await call('admin', 'PUT', '/api/ops/settings', { overload_open: 2, lv2_days: 5, lv3_days: 10 });
  ok(r.s === 200 && r.b.params.overload_open === 2 && r.b.params.lv2_days === 5, 'C5 quản trị viên đổi tham số', r.b);
  r = await call('huy.dq', 'GET', '/api/ops/alerts');
  ok(r.b.items.some(i => i.type === 'overload' && i.user_id === id['huy.dq']), 'C6 cảnh báo quá tải theo ngưỡng mới', r.b.items.map(i => i.type));
  ok((r.b.items.find(i => i.ref.id === tLate4) || {}).level === 1, 'C7 mức leo thang tính theo tham số mới (4 ngày < 5 ngày)');
  r = await call('huy.dq', 'GET', '/api/ops/settings');
  ok(r.s === 200 && r.b.can_edit === false && r.b.is_manager === false, 'C8 nhân viên đọc được tham số, không sửa được', r.b);

  /* Chưa cập nhật tiến độ tuần: chỉ tính từ ngày áp dụng */
  r = await call('anh.vn', 'GET', '/api/ops/alerts');
  ok(!r.b.items.some(i => i.type === 'checkin_missing' && i.ref.id === LAST), 'C9 không cảnh báo tuần trước ngày bắt đầu áp dụng', r.b.items.map(i => i.type));
  await call('admin', 'PUT', '/api/ops/settings', { since: addD(WEEK, -21) });
  r = await call('anh.vn', 'GET', '/api/ops/alerts');
  ok(r.b.items.some(i => i.type === 'checkin_missing' && i.ref.id === LAST && i.level === 2), 'C10 chưa cập nhật tuần trước: mức 2', r.b.items.map(i => [i.type, i.ref.id, i.level]));
  r = await call('huy.dq', 'GET', '/api/ops/alerts');
  ok(!r.b.items.some(i => i.type === 'checkin_missing' && i.ref.id === LAST), 'C11 người đã cập nhật bù không bị cảnh báo');
  ok((await call('admin', 'PUT', '/api/ops/settings', { since: '2026-13-01' })).s === 400, 'C12 ngày áp dụng sai định dạng bị từ chối');

  /* Mục tiêu chậm tiến độ: mục tiêu cá nhân 0% khi đã trôi qua phần lớn chu kỳ */
  /* Chu kỳ một ngày, bắt đầu hôm nay: là chu kỳ hiện hành (bắt đầu muộn nhất), thời gian đã trôi qua 100% */
  const cyc = await call('admin', 'POST', '/api/goals/cycles', { name: 'Kỳ thử OPS', start_date: T(0), end_date: T(0) });
  ok(cyc.s === 200 && cyc.b.id > 0, 'C13 quản trị viên tạo chu kỳ thử', cyc.b);
  const cid = cyc.b.id;
  r = await call('quan.lm', 'POST', '/api/goals', { cycle_id: cid, level: 'user', owner_id: id['anh.vn'], title: 'OPS doanh số thử', unit: 'triệu đồng', target: 100, current: 0 });
  ok(r.s === 200, 'C14 trưởng phòng giao mục tiêu cá nhân', r.b);
  r = await call('anh.vn', 'GET', '/api/ops/alerts');
  ok(r.b.items.some(i => i.type === 'goal_lag' && i.title === 'OPS doanh số thử' && i.level === 2), 'C15 mục tiêu chậm tiến độ (mức 2 khi chậm gấp đôi ngưỡng)', r.b.items.filter(i => i.type === 'goal_lag'));

  /* Trả lại tham số mặc định */
  await call('admin', 'PUT', '/api/ops/settings', { overload_open: 15, lv2_days: 3, lv3_days: 7 });

  /* ---------- D. Không đăng nhập ---------- */
  sessions.anon = '';
  ok((await call('anon', 'GET', '/api/ops/alerts')).s === 401, 'D1 chưa đăng nhập bị từ chối');
  ok((await call('anon', 'GET', '/api/ops/checkin')).s === 401, 'D2 chưa đăng nhập bị từ chối');

  console.log(`\nVận hành tự chủ: ${pass} đạt, ${fail} không đạt`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); console.log(`\nVận hành tự chủ: ${pass} đạt, ${fail + 1} không đạt`); process.exit(1); });
