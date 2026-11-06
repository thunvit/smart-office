// Kiểm thử phân hệ Công việc – Dự án v2 (phân quyền, luồng trạng thái, việc con, báo cáo).
// Chạy trên lõi Cloudflare với Durable Object mô phỏng (dùng chung mã nghiệp vụ với bản Node): node test/work-test.js
'use strict';
const path = require('path'), os = require('os'), fs = require('fs');
const { fakeStorage } = require('./fake-do.js');
const core = require(path.join(__dirname, '..', 'worker', 'do-core.js'));
const DBF = path.join(os.tmpdir(), 'so-work-test.db');
for (const f of [DBF, DBF + '-wal', DBF + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
const app = core.createApp(fakeStorage(DBF), { SO_DEMO: '1' });
const B = 'https://so.example.workers.dev';
let pass = 0, fail = 0;
const ok = (cond, name, extra) => { if (cond) { pass++; } else { fail++; console.log('  ✗ ' + name + (extra ? ' → ' + JSON.stringify(extra).slice(0, 300) : '')); } };
const sessions = {};
async function call(who, method, p, body) {
  const h = { 'content-type': 'application/json', host: 'so.example.workers.dev', origin: B, 'cf-connecting-ip': '198.51.100.' + (Object.keys(sessions).indexOf(who) + 10) };
  if (sessions[who]) h.cookie = sessions[who];
  const r = await core.handleRequest(app, new Request(B + p, { method, headers: h, body: body ? JSON.stringify(body) : undefined }));
  const sc = r.headers.get('set-cookie'); if (sc) sessions[who] = sc.split(';')[0];
  const ct = r.headers.get('content-type') || '';
  return { s: r.status, b: ct.includes('json') ? await r.json() : await r.text() };
}
const login = async u => { sessions[u] = ''; const r = await call(u, 'POST', '/api/login', { username: u, password: '123456' }); if (r.s !== 200) throw new Error('login ' + u + ' ' + r.s); };

(async () => {
  for (const u of ['thanh.nv', 'long.hd', 'mai.bt', 'quan.lm', 'huy.dq', 'trang.pt', 'huong.tt']) await login(u);
  const T = n => { const d = new Date(Date.now() + 7 * 3600e3 + n * 864e5); return d.toISOString().slice(0, 10); };

  // 1. Người ngoài dự án
  let r = await call('huong.tt', 'GET', '/api/projects');
  ok(r.s === 200 && r.b.length === 0, 'huong không thấy dự án nào', r.b);
  ok((await call('huong.tt', 'GET', '/api/projects/1')).s === 403, 'huong không mở được dự án 1');
  ok((await call('huong.tt', 'GET', '/api/projects/1/tasks')).s === 403, 'huong không xem được danh sách việc dự án 1');
  const p1 = (await call('long.hd', 'GET', '/api/projects/1/tasks')).b.rows;
  ok(p1.length >= 5, 'quản lý thấy toàn bộ việc dự án 1', p1.length);
  const someTask = p1.find(t => t.assignee_id !== 3 && t.creator_id !== 3);
  ok((await call('huong.tt', 'GET', '/api/tasks/' + someTask.id)).s === 403, 'huong không xem được chi tiết việc dự án 1');
  ok((await call('huong.tt', 'POST', `/api/tasks/${someTask.id}/comments`, { body: 'x' })).s === 403, 'huong không bình luận được');

  // 2. Thành viên, thiết lập xem việc người khác
  r = await call('mai.bt', 'GET', '/api/projects');
  ok(r.b.map(p => p.id).sort().join() === '1,3', 'mai thấy dự án 1 và 3', r.b.map(p => p.id));
  const mallBefore = (await call('mai.bt', 'GET', '/api/projects/1/tasks')).b.total;
  r = await call('long.hd', 'PUT', '/api/projects/1/settings', { member_view_all: false });
  ok(r.s === 200 && r.b.settings.member_view_all === false, 'quản lý tắt "thành viên xem việc người khác"');
  const mineOnly = (await call('mai.bt', 'GET', '/api/projects/1/tasks')).b;
  ok(mineOnly.total < mallBefore && mineOnly.rows.every(t => t.assignee_id === 9 || t.creator_id === 9), 'mai chỉ còn thấy việc của mình', mineOnly.total);
  ok((await call('mai.bt', 'PUT', '/api/projects/1/settings', { review: true })).s === 403, 'thành viên không đổi được thiết lập');

  // 3. Nhóm công việc, tạo việc có người theo dõi ngoài dự án
  r = await call('long.hd', 'POST', '/api/projects/1/groups', { name: 'Triển khai', std_hours: 4 });
  const g = r.b.groups.find(x => x.name === 'Triển khai');
  ok(r.s === 200 && g, 'tạo nhóm công việc');
  r = await call('long.hd', 'POST', '/api/tasks', { project_id: 1, group_id: g.id, title: 'Cài đặt máy chủ', assignee_id: 9, due_date: T(3), followers: [3] });
  const t1 = r.b;
  ok(r.s === 200 && t1.est_hours === 4 && t1.followers.includes(3), 'tạo việc, nhận thời lượng định mức nhóm, có người theo dõi', r.b);
  ok((await call('huong.tt', 'GET', '/api/tasks/' + t1.id)).s === 200, 'người theo dõi (ngoài dự án) xem được việc được gắn');
  ok((await call('huong.tt', 'GET', '/api/tasks/' + someTask.id)).s === 403, 'người theo dõi vẫn không xem được việc khác');
  ok((await call('huong.tt', 'PUT', '/api/tasks/' + t1.id, { title: 'đổi' })).s === 403, 'người theo dõi không sửa được');
  ok((await call('mai.bt', 'POST', '/api/tasks', { project_id: 2, title: 'x' })).s === 403, 'mai không tạo được việc ở dự án không tham gia');

  // 4. Giới hạn người nhận việc
  await call('long.hd', 'PUT', '/api/projects/1/settings', { assignee_edit_deadline: false });
  ok((await call('mai.bt', 'PUT', '/api/tasks/' + t1.id, { due_date: T(9) })).s === 403, 'người nhận không sửa được thời hạn khi bị giới hạn');
  ok((await call('mai.bt', 'PUT', '/api/tasks/' + t1.id, { title: 'Cài đặt máy chủ ứng dụng' })).s === 200, 'người nhận vẫn sửa được tên');
  ok((await call('mai.bt', 'PUT', '/api/tasks/' + t1.id, { assignee_id: 5 })).s === 403, 'người nhận không đổi được người nhận');
  ok((await call('mai.bt', 'PUT', '/api/tasks/' + t1.id, { due_time: '17:00' })).s === 403, 'giờ hạn bị chặn khi người nhận bị giới hạn');
  await call('long.hd', 'PUT', '/api/projects/1/settings', { deadline_time: true });
  r = await call('long.hd', 'PUT', '/api/tasks/' + t1.id, { due_time: '17:30' });
  ok(r.s === 200 && r.b.due_time === '17:30', 'quản lý đặt giờ hạn khi bật thời hạn theo giờ', r.b);

  // 5. Cập nhật kết quả, %
  r = await call('mai.bt', 'POST', `/api/tasks/${t1.id}/results`, { note: 'Đã cài hệ điều hành', progress: 50 });
  ok(r.s === 200 && r.b.progress === 50 && r.b.status === 'doing' && r.b.results.length === 1, 'cập nhật kết quả 50%', r.b);
  ok((await call('mai.bt', 'POST', `/api/tasks/${t1.id}/results`, { progress: 150 })).s === 400, 'chặn % > 100');

  // 6. Đánh giá trước khi hoàn thành
  await call('long.hd', 'PUT', '/api/projects/1/settings', { review: true, reviewer_mode: 'creator' });
  r = await call('mai.bt', 'POST', `/api/tasks/${t1.id}/status`, { status: 'done' });
  ok(r.s === 200 && r.b.status === 'review' && r.b.completed_at, 'người nhận bấm hoàn thành → chờ đánh giá', r.b.status);
  ok((await call('mai.bt', 'POST', `/api/tasks/${t1.id}/review`, { approve: true })).s === 403, 'người nhận không tự duyệt');
  ok((await call('mai.bt', 'POST', `/api/tasks/${t1.id}/status`, { status: 'failed', reason: 'x' })).s === 403, 'người nhận không đánh dấu thất bại (mặc định chỉ quản lý)');
  ok((await call('long.hd', 'POST', `/api/tasks/${t1.id}/status`, { status: 'failed', reason: 'Không đạt yêu cầu' })).s === 400, 'việc đang chờ đánh giá không chuyển thẳng sang thất bại');
  r = await call('long.hd', 'GET', '/api/tasks?scope=review');
  ok(r.b.rows.some(t => t.id === t1.id), 'việc xuất hiện trong "chờ tôi đánh giá" của người giao');
  ok((await call('long.hd', 'POST', `/api/tasks/${t1.id}/review`, { approve: false })).s === 400, 'trả lại phải có ý kiến');
  r = await call('long.hd', 'POST', `/api/tasks/${t1.id}/review`, { approve: false, note: 'Bổ sung cấu hình sao lưu' });
  ok(r.s === 200 && r.b.status === 'doing', 'trả lại → đang làm');
  await call('mai.bt', 'POST', `/api/tasks/${t1.id}/status`, { status: 'done' });
  r = await call('long.hd', 'POST', `/api/tasks/${t1.id}/review`, { approve: true, note: 'Đạt' });
  ok(r.s === 200 && r.b.status === 'done' && r.b.progress === 100, 'duyệt → hoàn thành', r.b.status);

  // 7. Thất bại
  r = await call('long.hd', 'POST', '/api/tasks', { project_id: 1, title: 'Mua bản quyền', assignee_id: 9 });
  const t2 = r.b;
  ok((await call('long.hd', 'POST', `/api/tasks/${t2.id}/status`, { status: 'failed' })).s === 400, 'thất bại bắt buộc lý do');
  r = await call('long.hd', 'POST', `/api/tasks/${t2.id}/status`, { status: 'failed', reason: 'Thay đổi kế hoạch' });
  ok(r.s === 200 && r.b.status === 'failed' && r.b.fail_reason === 'Thay đổi kế hoạch', 'quản lý đánh dấu thất bại');
  await call('long.hd', 'PUT', '/api/projects/1/settings', { fail_roles: ['assignee'] });
  r = await call('mai.bt', 'POST', `/api/tasks/${t2.id}/status`, { status: 'doing' });
  ok(r.s === 200 && r.b.status === 'doing' && !r.b.fail_reason, 'mở lại việc thất bại');
  ok((await call('mai.bt', 'POST', `/api/tasks/${t2.id}/status`, { status: 'failed', reason: 'Không còn nhu cầu thực hiện' })).s === 200, 'người nhận đánh dấu thất bại khi được cấp quyền');

  // 8. Việc con, giới hạn 3 cấp, xóa kèm việc con
  let parent = t2.id; const chain = [];
  for (let i = 1; i <= 3; i++) { r = await call('long.hd', 'POST', '/api/tasks', { project_id: 1, parent_id: parent, title: 'Cấp ' + i, assignee_id: 9 }); ok(r.s === 200, 'tạo việc con cấp ' + i, r.b); parent = r.b.id; chain.push(parent); }
  ok((await call('long.hd', 'POST', '/api/tasks', { project_id: 1, parent_id: parent, title: 'Cấp 4', assignee_id: 9 })).s === 400, 'chặn việc con cấp 4');
  r = await call('long.hd', 'GET', '/api/tasks/' + t2.id);
  ok(r.b.subtasks.length === 1 && r.b.subtasks[0].id === chain[0], 'chi tiết có danh sách việc con');
  r = await call('long.hd', 'POST', `/api/tasks/${chain[0]}/status`, { status: 'done' });
  ok(r.s === 400, 'không hoàn thành khi còn việc con chưa xong');
  r = await call('long.hd', 'POST', `/api/tasks/${t2.id}/clone`, { keep: { subtasks: true } });
  ok(r.s === 200 && r.b.subtasks.length === 1, 'nhân bản giữ việc con', r.b);
  ok((await call('mai.bt', 'DELETE', '/api/tasks/' + t2.id)).s === 403, 'người nhận (không phải người tạo) không xóa được');
  r = await call('long.hd', 'DELETE', '/api/tasks/' + t2.id);
  ok(r.s === 200 && r.b.deleted === 4, 'xóa việc kèm 3 cấp việc con', r.b);

  // 9. Giao nhiều người, giao người ngoài dự án
  r = await call('long.hd', 'POST', '/api/tasks', { project_id: 1, title: 'Đọc quy chế', assignee_ids: [9, 5] });
  ok(r.s === 200 && r.b.ids && r.b.ids.length === 2, 'giao cho nhiều người tạo mỗi người một việc', r.b);
  r = await call('long.hd', 'POST', '/api/tasks', { project_id: 1, title: 'Hỗ trợ kế toán', assignee_id: 3 });
  ok(r.s === 200, 'giao việc cho người ngoài dự án');
  const t3 = r.b;
  ok((await call('huong.tt', 'GET', '/api/tasks/' + t3.id)).s === 200, 'người ngoài xem được việc được giao');
  r = await call('huong.tt', 'GET', '/api/tasks?scope=assigned');
  ok(r.b.rows.some(t => t.id === t3.id), '"Việc của tôi" của người ngoài có việc được giao');

  // 10. Đóng, mở dự án
  ok((await call('mai.bt', 'POST', '/api/projects/1/close', { result: 'success' })).s === 403, 'thành viên không đóng được dự án');
  r = await call('long.hd', 'POST', '/api/projects/1/close', { result: 'success', note: 'Hoàn thành giai đoạn 1' });
  ok(r.s === 200 && r.b.status === 'closed', 'quản lý đóng dự án');
  ok((await call('long.hd', 'POST', '/api/tasks', { project_id: 1, title: 'x', assignee_id: 9 })).s === 400, 'không thêm việc khi dự án đã đóng');
  ok((await call('long.hd', 'PUT', '/api/tasks/' + t3.id, { title: 'y' })).s === 400, 'không sửa việc khi dự án đã đóng');
  r = await call('long.hd', 'POST', '/api/projects/1/reopen', { health: 'late' });
  ok(r.s === 200 && r.b.status === 'open' && r.b.health === 'late', 'mở lại dự án kèm tình trạng');

  // 11. Thành viên, vai trò, phải còn ít nhất một quản lý
  ok((await call('long.hd', 'PUT', '/api/projects/1/members/8', { role: 'member' })).s === 400, 'không hạ quyền quản lý cuối cùng');
  r = await call('long.hd', 'POST', '/api/projects/1/members', { user_ids: [4], role: 'manager' });
  ok(r.s === 200 && r.b.members.some(m => m.user_id === 4 && m.role === 'manager'), 'thêm quản lý');

  // 12. Tạo dự án, phòng ban, báo cáo, phân trang
  r = await call('huy.dq', 'POST', '/api/projects', { name: 'Chăm sóc khách hàng', kind: 'team', start_date: T(0), end_date: T(10) });
  ok(r.s === 200 && r.b.kind === 'team' && r.b.start_date === null && r.b.my_role === 'manager', 'tạo phòng ban, người tạo là quản lý, bỏ ngày', r.b);
  r = await call('long.hd', 'GET', '/api/projects/1/report');
  ok(r.s === 200 && r.b.summary.total > 0 && Array.isArray(r.b.by_member), 'báo cáo dự án', r.b.summary);
  r = await call('long.hd', 'GET', '/api/projects/1/tasks?limit=5000');
  ok(r.b.limit === 200, 'giới hạn phân trang tối đa 200 (HN-07)', r.b.limit);
  ok((await call('huong.tt', 'GET', '/api/projects/1/report')).s === 403, 'người ngoài không xem được báo cáo');
  r = await call('quan.lm', 'GET', '/api/work/staff');
  ok(r.s === 200 && r.b.some(x => x.user_id === 6), 'trưởng phòng xem "nhân viên của tôi"', r.b);
  r = await call('thanh.nv', 'GET', '/api/projects');
  ok(r.b.length >= 4, 'giám đốc thấy mọi dự án', r.b.length);

  // 13. Xuất CSV theo quyền
  r = await call('huong.tt', 'GET', '/api/export/tasks.csv');
  ok(typeof r.b === 'string' && !r.b.includes('Cài đặt máy chủ'), 'CSV tổng hợp của người ngoài không chứa việc dự án khác');
  r = await call('huong.tt', 'GET', '/api/projects/1/export.csv');
  ok(r.s === 200 && r.b.includes('Hỗ trợ kế toán') && !r.b.includes(someTask.title), 'CSV dự án của người theo dõi chỉ gồm việc được giao/gắn', r.s);
  ok((await call('huy.dq', 'GET', '/api/projects/1/export.csv')).s === 403, 'người không thuộc dự án không xuất được CSV dự án');

  console.log(`work-test: ${pass} đạt, ${fail} không đạt`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
