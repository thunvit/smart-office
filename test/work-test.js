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
const login0 = async (u, pw) => { sessions[u] = ''; const r = await call(u, 'POST', '/api/login', { username: u, password: pw }); if (r.s !== 200) throw new Error('login ' + u + ' ' + r.s); };
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

  // 14. Tạo công việc đầy đủ theo Base Wework: nhãn, mục tiêu, tệp đính kèm, tài liệu liên kết
  const goals = (await call('long.hd', 'GET', '/api/goals')).b.goals;
  ok(Array.isArray(goals) && goals.length > 0, 'có mục tiêu mẫu để liên kết', goals && goals.length);
  const goalId = goals[0].id;
  r = await call('long.hd', 'POST', '/api/tasks', { project_id: 1, title: 'Rà soát hạ tầng mạng', assignee_id: 9,
    tags: [' Hạ tầng ', 'hạ tầng', 'Bảo mật', 'a,b', 't4', 't5', 't6', 't7', 't8', 't9', 't10', 't11'], goal_id: goalId });
  ok(r.s === 200 && r.b.tags[0] === 'Hạ tầng' && r.b.tags[1] === 'Bảo mật' && r.b.tags[2] === 'a b' && r.b.tags.length === 10, 'nhãn được chuẩn hóa, bỏ trùng, tối đa 10', r.b.tags);
  ok(r.b.goal && r.b.goal.id === goalId, 'liên kết mục tiêu khi tạo công việc', r.b.goal);
  const ft = r.b.id;
  ok((await call('long.hd', 'POST', '/api/tasks', { project_id: 1, title: 'x', goal_id: 999999 })).s === 400, 'mục tiêu không tồn tại bị từ chối');
  r = await call('long.hd', 'GET', '/api/projects/1/tasks?tag=' + encodeURIComponent('Bảo mật'));
  ok(r.s === 200 && r.b.rows.some(t => t.id === ft) && r.b.rows.every(t => t.tags.includes('Bảo mật')), 'lọc công việc theo nhãn', r.b.total);
  r = await call('long.hd', 'GET', '/api/projects/1/tasks?tag=' + encodeURIComponent('Bảo'));
  ok(!r.b.rows.some(t => t.id === ft), 'lọc nhãn khớp chính xác, không khớp một phần');
  ok((await call('long.hd', 'GET', '/api/projects/1')).b.tags.includes('Bảo mật'), 'dự án trả danh sách nhãn đang dùng');
  r = await call('long.hd', 'PUT', '/api/tasks/' + ft, { tags: 'Bảo mật, Ưu tiên quý IV', goal_id: null });
  ok(r.s === 200 && r.b.tags.join('|') === 'Bảo mật|Ưu tiên quý IV' && r.b.goal === null, 'sửa nhãn, gỡ liên kết mục tiêu', r.b.tags);

  const b64 = t => Buffer.from(t).toString('base64');
  r = await call('long.hd', 'POST', `/api/tasks/${ft}/files`, { file_name: 'biên bản khảo sát.pdf', file_mime: 'application/pdf', file_data: b64('NOI DUNG BIEN BAN') });
  ok(r.s === 200 && r.b.files.length === 1 && r.b.files[0].kind === 'file' && r.b.files[0].file_size === 17, 'đính kèm tệp vào công việc', r.b.files || r.b);
  const fid = r.b.files[0].id;
  r = await call('mai.bt', 'GET', '/api/task-files/' + fid);
  ok(r.s === 200 && r.b === 'NOI DUNG BIEN BAN', 'người nhận việc tải được tệp', r.s);
  ok((await call('huong.tt', 'GET', '/api/task-files/' + fid)).s === 403, 'người ngoài không tải được tệp của công việc');
  ok((await call('huong.tt', 'POST', `/api/tasks/${ft}/files`, { file_name: 'x.txt', file_data: b64('x') })).s === 403, 'người ngoài không đính kèm được');
  ok((await call('long.hd', 'POST', `/api/tasks/${ft}/files`, { file_name: 'cai-dat.exe', file_data: b64('MZ') })).s === 400, 'chặn tệp chương trình .exe');
  r = await call('long.hd', 'POST', `/api/tasks/${ft}/files`, { file_name: 'lon.bin', file_data: Buffer.alloc(10 * 1024 * 1024 + 10).toString('base64') });
  ok(r.s === 400 && /10 MB/.test(r.b.error), 'tệp quá 10 MB bị từ chối', r.s);
  r = await call('long.hd', 'GET', '/api/projects/1/tasks?tag=' + encodeURIComponent('Bảo mật'));
  ok(r.b.rows.find(t => t.id === ft).file_count === 1, 'danh sách hiển thị số tệp đính kèm');

  // Tài liệu từ kho Tài liệu: giữ quyền xem của tài liệu
  const deptOther = (await call('thanh.nv', 'GET', '/api/bootstrap')).b.departments.find(d => d.name.includes('Kinh doanh')).id;
  const dPublic = (await call('thanh.nv', 'POST', '/api/docs', { title: 'Quy chế dùng chung', body: 'Nội dung quy chế' })).b.id;
  const dPrivate = (await call('thanh.nv', 'POST', '/api/docs', { title: 'Tài liệu nội bộ phòng Kinh doanh', body: 'Mật', dept_id: deptOther })).b.id;
  r = await call('long.hd', 'POST', `/api/tasks/${ft}/files`, { doc_id: dPublic });
  ok(r.s === 200 && r.b.files.some(f => f.kind === 'doc' && f.doc_id === dPublic && f.doc_title === 'Quy chế dùng chung'), 'liên kết tài liệu từ kho Tài liệu', r.b.files || r.b);
  ok((await call('long.hd', 'POST', `/api/tasks/${ft}/files`, { doc_id: dPrivate })).s === 403, 'không liên kết được tài liệu mình không có quyền xem');

  // Giao nhiều người: một tệp gắn vào nhiều công việc; người ngoài không chèn được vào việc không thuộc quyền
  r = await call('long.hd', 'POST', '/api/tasks', { project_id: 1, title: 'Báo cáo tuần', assignee_ids: [8, 9] });
  const [m1, m2] = r.b.ids;
  r = await call('long.hd', 'POST', `/api/tasks/${m1}/files`, { also_task_ids: [m2], file_name: 'mau-bao-cao.docx', file_data: b64('MAU') });
  ok(r.s === 200 && (await call('long.hd', 'GET', '/api/tasks/' + m2)).b.files.length === 1, 'một tệp gắn cho mọi công việc khi giao nhiều người');
  ok((await call('mai.bt', 'POST', `/api/tasks/${m2}/files`, { also_task_ids: [someTask.id], file_name: 'x.txt', file_data: b64('x') })).s === 403, 'không gắn tệp sang công việc không có quyền');

  // Nhân bản giữ tệp; xóa bản gốc không làm mất tệp của bản sao
  r = await call('long.hd', 'POST', `/api/tasks/${ft}/clone`, { keep: {} });
  ok(r.s === 200 && r.b.files.length === 2 && r.b.tags.includes('Bảo mật'), 'nhân bản giữ tệp và nhãn', r.b.files && r.b.files.length);
  const cloneFile = r.b.files.find(f => f.kind === 'file').id, cloneId = r.b.id;
  ok((await call('long.hd', 'DELETE', '/api/tasks/' + ft)).s === 200, 'xóa công việc gốc');
  r = await call('long.hd', 'GET', '/api/task-files/' + cloneFile);
  ok(r.s === 200 && r.b === 'NOI DUNG BIEN BAN', 'tệp dùng chung vẫn còn ở bản sao sau khi xóa bản gốc', r.s);
  ok((await call('huong.tt', 'DELETE', '/api/task-files/' + cloneFile)).s === 403, 'người ngoài không gỡ được tệp');
  r = await call('long.hd', 'DELETE', '/api/task-files/' + cloneFile);
  ok(r.s === 200 && r.b.files.length === 1, 'quản lý gỡ tệp khỏi công việc', r.b.files && r.b.files.length);
  ok((await call('long.hd', 'GET', '/api/task-files/' + cloneFile)).s === 404, 'tệp đã gỡ không còn tải được');
  r = await call('long.hd', 'GET', '/api/projects/1/export.csv');
  ok(r.s === 200 && r.b.includes('Nhãn') && r.b.includes('Bảo mật; Ưu tiên quý IV'), 'CSV có cột Nhãn');
  void cloneId;

  // 15. Lỗi kỳ mục tiêu: mặc định phải là kỳ chứa ngày hôm nay, không phải kỳ có ngày bắt đầu muộn nhất
  await login0('admin', 'Admin@123');
  const curCycle = (await call('long.hd', 'GET', '/api/goals')).b.cycle;
  r = await call('admin', 'POST', '/api/goals/cycles', { name: 'Kỳ tương lai kiểm thử', start_date: T(200), end_date: T(290) });
  ok(r.s === 200, 'quản trị tạo kỳ mục tiêu tương lai', r.b);
  r = await call('long.hd', 'GET', '/api/goals');
  ok(r.b.cycle && r.b.cycle.start_date <= T(0) && r.b.cycle.end_date >= T(0) && r.b.cycle.id === curCycle.id, 'mặc định chọn kỳ chứa ngày hôm nay', r.b.cycle);

  // 16. Công việc phụ thuộc (Base bài 63000283721, 63000283724)
  const mk = async (title, st, du) => (await call('long.hd', 'POST', '/api/tasks', { project_id: 1, title, assignee_id: 8, start_date: T(st), due_date: T(du) })).b;
  const A = await mk('PT-A Xây dựng', 0, 2), Bt = await mk('PT-B Sơn', 0, 1), C = await mk('PT-C Bàn giao', 5, 6);
  ok((await call('long.hd', 'POST', `/api/tasks/${A.id}/deps`, { other_id: Bt.id, type: 'FS' })).s === 400, 'chưa bật phụ thuộc thì không tạo được');
  r = await call('long.hd', 'PUT', '/api/projects/1/settings', { deps: true, deps_mode: 'keep' });
  ok(r.s === 200 && r.b.settings.deps === true && r.b.settings.deps_mode === 'keep', 'quản lý bật phụ thuộc, chế độ giữ nguyên thời gian', r.b.settings);
  r = await call('long.hd', 'POST', `/api/tasks/${A.id}/deps`, { other_id: Bt.id, direction: 'blocks', type: 'FS', lag_days: 1 });
  let Bn = (await call('long.hd', 'GET', '/api/tasks/' + Bt.id)).b;
  ok(r.s === 200 && r.b.shifted === 1 && Bn.start_date === T(4) && Bn.due_date === T(5), 'FS + 1 ngày: B bắt đầu sau khi A kết thúc 1 ngày, giữ thời lượng', [r.b.shifted, Bn.start_date, Bn.due_date]);
  r = await call('long.hd', 'POST', `/api/tasks/${C.id}/deps`, { other_id: Bt.id, direction: 'blocked_by', type: 'FS' });
  let Cn = (await call('long.hd', 'GET', '/api/tasks/' + C.id)).b;
  ok(r.s === 200 && Cn.start_date === T(6) && Cn.due_date === T(7), '"bị chặn bởi": C bắt đầu sau B', [Cn.start_date, Cn.due_date]);
  ok(Cn.deps.blocked_by.length === 1 && Cn.deps.blocked_by[0].id === Bt.id && Cn.deps.warnings.some(w => w.includes('FS')), 'chi tiết hiển thị bị chặn bởi và cảnh báo FS', Cn.deps);
  r = await call('long.hd', 'POST', `/api/tasks/${C.id}/deps`, { other_id: A.id, direction: 'blocks', type: 'SS' });
  ok(r.s === 400 && /vòng lặp/.test(r.b.error), 'chặn phụ thuộc vòng lặp C → A', r.b);
  ok((await call('long.hd', 'POST', `/api/tasks/${A.id}/deps`, { other_id: A.id })).s === 400, 'không tự phụ thuộc chính nó');
  ok((await call('long.hd', 'POST', `/api/tasks/${Bt.id}/deps`, { other_id: A.id, direction: 'blocks' })).s === 400, 'không tạo trùng hoặc ngược chiều quan hệ đã có');
  ok((await call('huong.tt', 'POST', `/api/tasks/${A.id}/deps`, { other_id: C.id })).s === 403, 'người ngoài không tạo được phụ thuộc');
  r = await call('long.hd', 'PUT', '/api/tasks/' + A.id, { due_date: T(5) });
  Bn = (await call('long.hd', 'GET', '/api/tasks/' + Bt.id)).b; Cn = (await call('long.hd', 'GET', '/api/tasks/' + C.id)).b;
  ok(r.b.shifted === 2 && Bn.start_date === T(7) && Cn.start_date === T(9), 'dời thời hạn A +3 ngày: B và C dời theo, giữ khoảng cách', [r.b.shifted, Bn.start_date, Cn.start_date]);
  r = await call('long.hd', 'GET', `/api/projects/1/tasks?from=${T(9)}&to=${T(9)}`);
  ok(r.s === 200 && r.b.rows.some(t => t.id === C.id) && !r.b.rows.some(t => t.id === A.id), 'lọc theo khoảng ngày cho chế độ xem Lịch', r.b.total);
  await call('long.hd', 'PUT', '/api/projects/1/settings', { deps_mode: 'none' });
  r = await call('long.hd', 'PUT', '/api/tasks/' + A.id, { due_date: T(6) });
  ok(r.b.shifted === 0 && (await call('long.hd', 'GET', '/api/tasks/' + Bt.id)).b.start_date === T(7), 'chế độ "Không": dời A không ảnh hưởng B');
  r = await call('long.hd', 'DELETE', '/api/task-deps/' + Cn.deps.blocked_by[0].dep_id + '?view=' + C.id);
  ok(r.s === 200 && r.b.id === C.id && r.b.deps.blocked_by.length === 0, 'gỡ phụ thuộc', r.b.deps);
  const team = (await call('huy.dq', 'GET', '/api/projects')).b.find(p => p.kind === 'team');
  await call('huy.dq', 'PUT', `/api/projects/${team.id}/settings`, { deps: true });
  const tm1 = (await call('huy.dq', 'POST', '/api/tasks', { project_id: team.id, title: 'x1' })).b, tm2 = (await call('huy.dq', 'POST', '/api/tasks', { project_id: team.id, title: 'x2' })).b;
  ok((await call('huy.dq', 'POST', `/api/tasks/${tm1.id}/deps`, { other_id: tm2.id })).s === 400, 'phòng ban không dùng phụ thuộc (chỉ Dự án)');

  // 17. Mốc dự án (milestone)
  r = await call('long.hd', 'POST', '/api/projects/1/milestones', { title: 'Nghiệm thu giai đoạn 1', due_date: T(10), owner_id: 9 });
  ok(r.s === 200 && r.b.milestones.length === 1 && r.b.milestones[0].total === 0, 'quản lý tạo mốc dự án', r.b.milestones);
  const msId = r.b.milestones[0].id;
  ok((await call('mai.bt', 'POST', '/api/projects/1/milestones', { title: 'x' })).s === 403, 'thành viên không tạo được mốc');
  r = await call('long.hd', 'PUT', '/api/tasks/' + A.id, { milestone_id: msId });
  ok(r.s === 200 && r.b.milestone && r.b.milestone.id === msId, 'gắn công việc vào mốc', r.b.milestone);
  r = await call('long.hd', 'GET', '/api/projects/1');
  ok(r.b.milestones[0].total === 1 && r.b.milestones[0].done === 0, 'tiến độ mốc tính theo công việc gắn mốc', r.b.milestones[0]);
  const ms2 = (await call('huy.dq', 'POST', `/api/projects/${team.id}/milestones`, { title: 'mốc khác' })).b.milestones[0].id;
  ok((await call('long.hd', 'PUT', '/api/tasks/' + A.id, { milestone_id: ms2 })).s === 400, 'không gắn mốc của dự án khác');
  r = await call('long.hd', 'DELETE', '/api/milestones/' + msId);
  ok(r.s === 200 && r.b.milestones.length === 0 && (await call('long.hd', 'GET', '/api/tasks/' + A.id)).b.milestone === null, 'xóa mốc, công việc bỏ gắn mốc');

  // 18. Công việc lặp lại (Base bài 63000268543)
  r = await call('long.hd', 'POST', '/api/recurrences/preview', { start_date: T(0), rule: { freq: 'week', interval: 1, weekdays: [1, 2, 3, 4, 5, 6, 7] } });
  ok(r.s === 200 && r.b.dates.length === 10 && r.b.dates[0] === T(0), 'xem trước 10 lần lặp gần nhất', r.b.dates);
  ok((await call('long.hd', 'POST', '/api/projects/1/recurrences', { title: 'x', assignee_id: 8, start_date: T(0), rule: { freq: 'week', weekdays: [] }, due_hours: 17 })).s === 400, 'quy tắc thiếu thứ trong tuần bị từ chối');
  r = await call('long.hd', 'POST', '/api/projects/1/recurrences', { title: 'Kiểm tra sao lưu hằng ngày', assignee_id: 8, start_date: T(0), rule: { freq: 'week', interval: 1, weekdays: [1, 2, 3, 4, 5, 6, 7] }, due_hours: 15.5, subtasks: 'Kiểm tra tệp\nGhi sổ', checklist: 'Đối chiếu dung lượng', tags: 'Vận hành', followers: [9] });
  ok(r.s === 200 && r.b.rule.freq === 'week' && r.b.gen_count >= 1 && r.b.gen_count <= 2, 'tạo công việc lặp lại, sinh ngay lần gần nhất (và lần kế tiếp nếu đã qua 7:00)', r.b);
  const recId = r.b.id, gen1 = r.b.gen_count;
  let occ = (await call('long.hd', 'GET', '/api/projects/1/tasks?q=' + encodeURIComponent('Kiểm tra sao lưu hằng ngày'))).b.rows.filter(t => t.recurrence_id === recId);
  ok(occ.length === gen1 && occ.some(t => t.start_date === T(0)) && occ.every(t => t.start_date <= T(1)), 'lần lặp được sinh đúng ngày, không sinh trước quá 1 lần', occ.map(t => t.start_date));
  const occFull = (await call('long.hd', 'GET', '/api/tasks/' + occ.find(t => t.start_date === T(0)).id)).b;
  ok(occFull.subtasks.length === 2 && occFull.checklist.length === 1 && occFull.followers.includes(9) && occFull.tags.includes('Vận hành') && occFull.recurrence.id === recId, 'lần lặp kèm việc con, đầu việc, người theo dõi, nhãn', occFull);
  r = await call('long.hd', 'PUT', '/api/recurrences/' + recId, { title: 'Kiểm tra sao lưu hằng ngày' });
  ok(r.s === 200 && r.b.gen_count === gen1, 'sửa không sinh trùng lần lặp', r.b.gen_count);
  ok((await call('huong.tt', 'GET', '/api/projects/1/recurrences')).s === 403, 'người theo dõi dự án không xem được danh sách công việc lặp lại');
  ok((await call('mai.bt', 'PUT', '/api/recurrences/' + recId, { title: 'y' })).s === 403, 'thành viên không phải người thiết lập không sửa được');
  const wd = ((new Date(T(3) + 'T00:00:00Z').getUTCDay() + 6) % 7) + 1;
  r = await call('long.hd', 'POST', '/api/projects/1/recurrences', { title: 'Họp giao ban tương lai', assignee_id: 8, start_date: T(3), rule: { freq: 'week', interval: 1, weekdays: [wd] }, due_hours: 10 });
  ok(r.s === 200 && r.b.gen_count === 1 && r.b.last_gen === T(3), 'bắt đầu trong tương lai: chỉ sinh lần đầu tiên, chưa sinh lần tiếp theo', [r.b.gen_count, r.b.last_gen]);
  r = await call('long.hd', 'GET', '/api/projects/1/recurrences');
  ok(r.s === 200 && r.b.length === 2 && r.b.every(x => Array.isArray(x.preview)), 'danh sách công việc lặp lại kèm lịch xem trước', r.b.length);
  r = await call('long.hd', 'DELETE', '/api/recurrences/' + recId);
  occ = (await call('long.hd', 'GET', '/api/projects/1/tasks?q=' + encodeURIComponent('Kiểm tra sao lưu hằng ngày'))).b.rows.filter(t => !t.parent_id);
  ok(r.s === 200 && occ.length === gen1 && occ.every(t => t.recurrence_id === null), 'xóa thiết lập lặp lại, giữ các công việc đã sinh', occ.length);

  console.log(`work-test: ${pass} đạt, ${fail} không đạt`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
