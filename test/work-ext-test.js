// Kiểm thử chức năng bổ sung đầy đủ theo Base Wework (bảng phân quyền, trường tùy chỉnh, thảo luận, tài liệu, mẫu, nhân bản, nhập/xuất, báo cáo, tác vụ hàng loạt).
// Chạy trên lõi Cloudflare với Durable Object mô phỏng (dùng chung mã nghiệp vụ với bản Node): node test/work-test.js
'use strict';
const path = require('path'), os = require('os'), fs = require('fs');
const { fakeStorage } = require('./fake-do.js');
const core = require(path.join(__dirname, '..', 'worker', 'do-core.js'));
const DBF = path.join(os.tmpdir(), 'so-work-ext-test.db');
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
  const U = {}; for (const u of ['thanh.nv', 'long.hd', 'mai.bt', 'quan.lm', 'huy.dq', 'huong.tt']) U[u] = (await call(u, 'GET', '/api/bootstrap')).b.me.id;
  const b64 = t => Buffer.from(t).toString('base64');
  let r;

  // A. Bảng phân quyền sử dụng (Base bài 63000277998)
  r = await call('long.hd', 'GET', '/api/projects/1');
  ok(r.s === 200 && r.b.perm && r.b.perm_labels && Object.keys(r.b.perm_labels.edit).length === 8 && Object.keys(r.b.perm_labels.account).length === 7 && Object.keys(r.b.perm_labels.restrict).length === 3, 'dự án trả bảng phân quyền đủ 7 + 8 + 3 mục', r.b.perm_labels);
  const perm = r.b.perm;
  perm.account.create_task.member = false; perm.account.view_report.member = false; perm.edit.rename.follower = true; perm.restrict.no_edit = true;
  r = await call('long.hd', 'PUT', '/api/projects/1/settings', { perm });
  ok(r.s === 200 && r.b.perm.account.create_task.member === false && r.b.perm.restrict.no_edit === true, 'quản lý lưu bảng phân quyền', r.b.perm);
  ok((await call('mai.bt', 'POST', '/api/tasks', { project_id: 1, title: 'x' })).s === 403, 'tắt "Thêm công việc mới" cho Thành viên: thành viên không tạo được');
  ok((await call('mai.bt', 'GET', '/api/projects/1/report')).s === 403, 'tắt "Xem báo cáo của dự án": thành viên không xem được báo cáo');
  const tA = (await call('long.hd', 'POST', '/api/tasks', { project_id: 1, title: 'Kiểm tra quyền', assignee_id: U['mai.bt'], followers: [U['huong.tt']] })).b;
  ok((await call('huong.tt', 'PUT', '/api/tasks/' + tA.id, { title: 'Người theo dõi đổi tên' })).s === 200, 'bật "Chỉnh sửa tên" cho Người theo dõi: người theo dõi đổi được tên');
  ok((await call('mai.bt', 'PUT', '/api/tasks/' + tA.id, { title: 'Người nhận đổi tên' })).s === 403, 'giới hạn đặc biệt: người được giao không sửa được công việc');
  ok((await call('mai.bt', 'PUT', '/api/tasks/' + tA.id, { assignee_id: U['quan.lm'] })).s === 403, 'mặc định: người được giao không chuyển giao được');
  ok((await call('mai.bt', 'POST', `/api/tasks/${tA.id}/results`, { note: 'Đang làm', progress: 30 })).s === 200, 'người được giao vẫn cập nhật kết quả');
  // Công việc chưa giao
  r = await call('long.hd', 'POST', '/api/tasks', { project_id: 1, title: 'Việc chưa giao', unassigned: true });
  const tU = r.b; ok(r.s === 200 && tU.assignee_id === null, 'tạo công việc chưa giao người thực hiện', r.b);
  perm.account.view_others.member = false; perm.account.view_unassigned.member = true; perm.account.create_task.member = true; perm.restrict.no_edit = false;
  await call('long.hd', 'PUT', '/api/projects/1/settings', { perm });
  r = await call('mai.bt', 'GET', '/api/tasks/' + tU.id);
  ok(r.s === 200 && r.b.can.claim === true, 'thành viên có quyền "xem và chỉ định công việc chưa giao" thấy và nhận được việc', r.b.can);
  r = await call('mai.bt', 'PUT', '/api/tasks/' + tU.id, { assignee_id: U['mai.bt'] });
  ok(r.s === 200 && r.b.assignee_id === U['mai.bt'], 'thành viên tự nhận công việc chưa giao', r.b.assignee_id);
  perm.account.view_others.member = true; await call('long.hd', 'PUT', '/api/projects/1/settings', { perm });

  // Cấu hình hệ thống: quyền tạo dự án (bài 63000270226), ủy quyền giao việc (63000254750), ưu tiên, Owner tự thêm làm quản lý
  ok((await call('mai.bt', 'PUT', '/api/work/config', { create_project: { mode: 'list', users: [] } })).s === 403, 'thành viên không đổi được cấu hình hệ thống');
  r = await call('thanh.nv', 'PUT', '/api/work/config', { create_project: { mode: 'list', users: [U['long.hd']] } });
  ok(r.s === 200 && r.b.create_project.mode === 'list', 'Owner giới hạn quyền tạo dự án theo danh sách', r.b);
  ok((await call('mai.bt', 'POST', '/api/projects', { name: 'Dự án không được phép', kind: 'project' })).s === 403, 'người ngoài danh sách không tạo được dự án');
  ok((await call('mai.bt', 'POST', '/api/projects', { name: 'Phòng ban của Mai', kind: 'team' })).s === 200, 'quyền tạo phòng ban tách riêng: vẫn tạo được phòng ban');
  await call('thanh.nv', 'PUT', '/api/work/config', { create_project: { mode: 'all' } });
  const allIds = (await call('thanh.nv', 'GET', '/api/bootstrap')).b.users.filter(x => x.active && x.id !== U['mai.bt']).map(x => x.id);
  if (allIds.length > 10) ok((await call('mai.bt', 'PUT', '/api/work/delegations', { delegate_ids: allIds })).s === 400, 'ủy quyền tối đa 10 người');
  r = await call('mai.bt', 'PUT', '/api/work/delegations', { delegate_ids: [U['mai.bt'], 999999] });
  ok(r.s === 200 && r.b.delegates.length === 0, 'bỏ qua tự ủy quyền cho chính mình và tài khoản không tồn tại', r.b);
  r = await call('mai.bt', 'PUT', '/api/work/delegations', { delegate_ids: [U['quan.lm']] });
  ok(r.s === 200 && r.b.delegates.length === 1, 'mai ủy quyền giao việc cho quân');
  await call('long.hd', 'POST', '/api/projects/1/members', { user_ids: [U['quan.lm']], role: 'member' });
  r = await call('quan.lm', 'POST', '/api/tasks', { project_id: 1, title: 'Việc giao thay', assignee_id: U['quan.lm'], creator_id: U['mai.bt'] });
  ok(r.s === 200 && r.b.creator_id === U['mai.bt'] && r.b.followers.includes(U['quan.lm']), 'người được ủy quyền tạo việc với người giao là người ủy quyền', r.b);
  ok((await call('huy.dq', 'POST', '/api/tasks', { project_id: 1, title: 'x', creator_id: U['mai.bt'] })).s === 403, 'không được ủy quyền thì không giao thay được');
  r = await call('mai.bt', 'POST', '/api/projects/1/favorite', { on: true });
  ok(r.s === 200 && (await call('mai.bt', 'GET', '/api/projects?scope=fav')).b.some(p => p.id === 1), 'đánh dấu dự án ưu tiên');
  ok((await call('long.hd', 'POST', '/api/projects/2/join-manager')).s === 403, 'chỉ Owner tự thêm mình làm quản lý');
  r = await call('thanh.nv', 'POST', '/api/projects/2/join-manager');
  ok(r.s === 200 && r.b.members.some(m => m.user_id === U['thanh.nv'] && m.role === 'manager'), 'Owner tự thêm mình làm quản lý (bài 63000252596)', r.b.members);
  ok((await call('long.hd', 'PUT', '/api/projects/1/settings', { managers_can_delete: false })).s === 403, 'chỉ Owner giới hạn quyền xóa của quản lý');
  await call('thanh.nv', 'POST', '/api/projects/1/join-manager');
  r = await call('thanh.nv', 'PUT', '/api/projects/1/settings', { managers_can_delete: false });
  ok(r.s === 200 && (await call('long.hd', 'DELETE', '/api/projects/1')).s === 403, 'Owner giới hạn: quản lý không xóa được dự án (bài 63000278278)');
  await call('thanh.nv', 'PUT', '/api/projects/1/settings', { managers_can_delete: true });

  await call('long.hd', 'POST', '/api/projects/1/groups', { name: 'Chuẩn bị', std_hours: 2 });
  // B. Trường dữ liệu tùy chỉnh (bài 63000252575)
  const F = async (b, who = 'long.hd') => call(who, 'POST', '/api/projects/1/fields', b);
  ok((await F({ name: 'x', type: 'int' }, 'mai.bt')).s === 403, 'thành viên không tạo được trường tùy chỉnh');
  await F({ name: 'Số lượng', type: 'int', input_key: 'so_luong' });
  await F({ name: 'Đơn giá', type: 'float', input_key: 'don_gia' });
  r = await F({ name: 'Thành tiền', type: 'formula', input_key: 'thanh_tien', options: { formula: '$so_luong * $don_gia' } });
  ok(r.s === 200 && r.b.fields.some(f => f.type === 'formula'), 'tạo trường công thức tham chiếu biến $', r.b);
  ok((await F({ name: 'Sai', type: 'formula', options: { formula: '$khong_co + 1' } })).s === 400, 'công thức dùng biến không tồn tại bị từ chối');
  ok((await F({ name: 'Nguy hiểm', type: 'formula', options: { formula: 'process.exit()' } })).s === 400, 'công thức chứa mã lạ bị từ chối (không dùng eval)');
  await F({ name: 'Hạng mục', type: 'select', input_key: 'hang_muc', options: { choices: 'Phần cứng, Phần mềm, Dịch vụ' } });
  await F({ name: 'Mã hợp đồng', type: 'text', input_key: 'ma_hd', required: true });
  r = await F({ name: 'Chi tiết vật tư', type: 'table', input_key: 'vat_tu', options: { columns: [{ name: 'Tên', type: 'text', required: true }, { name: 'SL', key: 'sl', type: 'int', sum: true }, { name: 'Giá', key: 'gia', type: 'float' }, { name: 'Tiền', key: 'tien', type: 'formula', formula: '$sl*$gia', sum: true }] } });
  ok(r.s === 200 && r.b.fields.find(f => f.type === 'table').options.columns.length === 4, 'tạo trường dạng bảng có cột công thức và tính tổng', r.b.fields.length);
  await F({ name: 'Thông tin bổ sung', type: 'heading' }); await F({ name: 'Biên bản', type: 'file', input_key: 'bien_ban' });
  ok((await call('long.hd', 'POST', '/api/tasks', { project_id: 1, title: 'Thiếu trường bắt buộc' })).s === 400, 'thiếu trường bắt buộc khi tạo công việc bị từ chối');
  r = await call('long.hd', 'POST', '/api/tasks', { project_id: 1, title: 'Mua thiết bị', fields: { ma_hd: 'HĐ-01', so_luong: 3, don_gia: 2.5, hang_muc: 'Phần cứng', vat_tu: [{ ten: 'Máy chủ', sl: 2, gia: 10 }, { ten: 'Ổ cứng', sl: 4, gia: 1.5 }] } });
  if (r.s !== 200) console.log('DBG tạo việc có trường:', r.s, JSON.stringify(r.b));
  { const q1 = await call('long.hd', 'POST', '/api/tasks', { project_id: 1, parent_id: r.b.id, title: 'Việc con tạo nhanh', quick: true });
    const q2 = await call('long.hd', 'POST', '/api/tasks', { project_id: 1, parent_id: r.b.id, title: 'Việc con dạng đầy đủ thiếu trường' });
    const q3 = await call('long.hd', 'POST', '/api/tasks', { project_id: 1, title: 'Việc cha gửi cờ quick', quick: true });
    ok(q1.s === 200 && q2.s === 400 && q3.s === 400, `tạo nhanh việc con được bỏ qua trường bắt buộc; dạng đầy đủ và việc cha vẫn kiểm tra (${q1.s}, ${q2.s}, ${q3.s})`); }
  const FD = r.b.fields || [], fv = r.b.field_values, fdef = k => FD.find(f => f.input_key === k) || {};
  ok(r.s === 200 && fv[fdef('thanh_tien').id] === 7.5 && fv[fdef('vat_tu').id].sums.tien === 26 && fv[fdef('vat_tu').id].sums.sl === 6, 'công thức và tổng cột của bảng được tính tại máy chủ', fv);
  const tF = r.b;
  ok((await call('long.hd', 'POST', '/api/tasks', { project_id: 1, title: 'x', fields: { ma_hd: 'a', hang_muc: 'Không có' } })).s === 400, 'giá trị lựa chọn ngoài danh sách bị từ chối');
  r = await call('long.hd', 'PUT', `/api/tasks/${tF.id}/fields`, { values: { so_luong: 10 } });
  ok(r.s === 200 && r.b.field_values[fdef('thanh_tien').id] === 25, 'sửa giá trị, công thức tính lại', r.b.field_values);
  r = await call('long.hd', 'POST', `/api/tasks/${tF.id}/files`, { field_id: fdef('bien_ban').id, file_name: 'bb.pdf', file_data: b64('BB') });
  ok(r.s === 200 && r.b.field_values[fdef('bien_ban').id].length === 1 && r.b.files.every(f => f.file_name !== 'bb.pdf'), 'trường dạng tập tin lưu tệp riêng, không lẫn vào tệp đính kèm');
  ok((await call('long.hd', 'DELETE', '/api/fields/' + fdef('so_luong').id)).s === 400, 'không xóa được trường đang dùng trong công thức');
  r = await call('long.hd', 'POST', '/api/projects/1/fields/bulk', { rows: [{ id: tF.id, values: { don_gia: 4, ma_hd: 'HĐ-02' } }] });
  ok(r.s === 200 && (await call('long.hd', 'GET', '/api/tasks/' + tF.id)).b.field_values[fdef('thanh_tien').id] === 40, 'cập nhật trường tùy chỉnh hàng loạt theo mã công việc (bài 63000278601)');
  ok((await call('long.hd', 'POST', '/api/projects/1/fields/bulk', { rows: [{ id: 999999, values: {} }] })).s === 400, 'mã công việc ngoài dự án bị từ chối');
  r = await call('long.hd', 'POST', '/api/projects/1/fields/import', { rows: [{ name: 'Ngày nghiệm thu', type: 'date' }, { name: 'Mức độ', type: 'Dropdown list', content: 'Thấp, Cao', required: '1' }] });
  ok(r.s === 200 && r.b.imported === 2 && r.b.fields.find(f => f.name === 'Mức độ').options.choices.length === 2, 'nhập định nghĩa trường từ Excel (bài 63000277992)', r.b);
  const cl = (await call('long.hd', 'POST', `/api/tasks/${tF.id}/clone`, { keep: {}, title: 'Mua thiết bị (bản sao)' })).b;
  ok(cl.field_values && cl.field_values[fdef('ma_hd').id] === 'HĐ-02', 'nhân bản giữ trường tùy chỉnh', cl.field_values);

  // Checklist có tên + todo giao người, kết quả kèm tệp, đánh dấu, iCalendar
  r = await call('long.hd', 'POST', `/api/tasks/${tF.id}/checklist`, { text: 'Kiểm tra hàng', section: 'Nghiệm thu', assignee_id: U['mai.bt'] });
  ok(r.s === 200 && r.b.checklist.some(c => c.section === 'Nghiệm thu' && c.assignee_id === U['mai.bt']), 'checklist có tên, việc cần làm giao cho người (bài 63000252605)', r.b.checklist);
  r = await call('long.hd', 'POST', `/api/tasks/${tF.id}/results`, { note: 'Đã nhận hàng', file_name: 'phieu.pdf', file_data: b64('PHIEU') });
  ok(r.s === 200 && r.b.results[0].files.length === 1 && r.b.files.every(f => f.file_name !== 'phieu.pdf'), 'cập nhật kết quả kèm tệp (bài 63000252611)', r.b.results[0]);
  r = await call('mai.bt', 'POST', `/api/tasks/${tF.id}/mark`, { on: true });
  ok(r.s === 200 && (await call('mai.bt', 'GET', '/api/tasks?scope=marked')).b.rows.some(t => t.id === tF.id), 'đánh dấu công việc và lọc "Đã đánh dấu"');
  r = await call('long.hd', 'GET', `/api/tasks/${tF.id}/ics`);
  ok(r.s === 200 && r.b.includes('BEGIN:VCALENDAR') && r.b.includes('SUMMARY:Mua thiết bị'), 'xuất tệp iCalendar (bài 63000252604)');
  ok((await call('huy.dq', 'GET', `/api/tasks/${tF.id}/ics`)).s === 403, 'người không xem được công việc không tải được iCalendar');

  // C. Thảo luận, tài liệu, hoạt động, thanh thông tin
  r = await call('mai.bt', 'POST', '/api/projects/1/posts', { title: 'Lịch họp tuần', body: 'Thứ Hai 8:00' });
  const post = r.b; ok(r.s === 200 && post.id, 'thành viên thêm thảo luận', r.b);
  r = await call('long.hd', 'POST', `/api/project-posts/${post.id}/comments`, { body: 'Đồng ý' });
  ok(r.s === 200 && r.b.comments.length === 1, 'bình luận thảo luận', r.b);
  ok((await call('huy.dq', 'GET', '/api/projects/1/posts')).s === 403, 'người ngoài dự án không xem được thảo luận');
  ok((await call('quan.lm', 'DELETE', '/api/project-posts/' + post.id)).s === 403, 'không phải người viết/quản lý thì không xóa được thảo luận');

  // C1. Lỗi 07/11/2026: Bảng tin và Thảo luận dự án từng dùng chung /api/posts/:id; route của Thảo luận đăng ký trước nên
  // mở, sửa, xóa bản tin lại thao tác trên thảo luận dự án trùng số hiệu. Tạo bản tin và thảo luận có CÙNG số hiệu rồi kiểm tra tách biệt.
  const btTitle = 'Bản tin kiểm thử trùng số hiệu';
  r = await call('thanh.nv', 'POST', '/api/posts', { title: btTitle, body: 'Nội dung bản tin', category: 'thongbao' });
  const btId = r.b.id; ok(r.s === 200 && btId, 'giám đốc đăng bản tin', r.b);
  let same = null;
  for (let i = 0; i < 20 && !same; i++) { const x = (await call('mai.bt', 'POST', '/api/projects/1/posts', { title: 'Thảo luận trùng số ' + i, body: 'x' })).b; if (x.id === btId) same = x; else if (x.id > btId) break; }
  ok(!!same, 'có thảo luận dự án trùng số hiệu với bản tin', { btId });
  if (same) {
    r = await call('thanh.nv', 'GET', '/api/posts/' + btId);
    ok(r.s === 200 && r.b.title === btTitle, 'mở bản tin trả đúng bản tin, không phải thảo luận dự án', r.b);
    r = await call('mai.bt', 'GET', '/api/project-posts/' + btId);
    ok(r.s === 200 && r.b.title === same.title && r.b.project_id === 1, 'mở thảo luận dự án theo đường dẫn riêng', r.b);
    r = await call('thanh.nv', 'POST', `/api/posts/${btId}/comments?kind=bulletin`, { body: 'Bình luận bản tin' });
    const nC = async (who, p) => ((await call(who, 'GET', p)).b.comments || { length: -1 }).length;
    ok(r.s === 200 && await nC('thanh.nv', '/api/posts/' + btId) === 1 && await nC('mai.bt', '/api/project-posts/' + btId) === 0, 'bình luận bản tin không ghi vào thảo luận dự án', r.b);
    ok((await call('thanh.nv', 'DELETE', '/api/posts/' + btId)).s === 409, 'giao diện cũ (thiếu kind=bulletin) không xóa được bản tin: tránh xóa nhầm khi trình duyệt còn bản cũ');
    r = await call('thanh.nv', 'DELETE', `/api/posts/${btId}?kind=bulletin`);
    const btLeft = (await call('thanh.nv', 'GET', '/api/posts')).b.posts.some(p => p.id === btId);
    ok(r.s === 200 && !btLeft && (await call('mai.bt', 'GET', '/api/project-posts/' + btId)).s === 200, 'xóa bản tin chỉ xóa bản tin, thảo luận dự án trùng số hiệu còn nguyên', { s: r.s, btLeft });
  }
  r = await call('mai.bt', 'POST', '/api/projects/1/files', { file_name: 'quy-trinh.pdf', file_data: b64('QUY TRINH') });
  ok(r.s === 200, 'tải lên tài liệu dự án');
  r = await call('mai.bt', 'GET', '/api/projects/1/files');
  const pf = r.b.files[0]; ok(r.s === 200 && pf.file_name === 'quy-trinh.pdf' && r.b.task_files.length >= 1, 'danh sách tài liệu dự án và tệp của công việc', r.b.files.length);
  r = await call('long.hd', 'GET', '/api/project-files/' + pf.id);
  ok(r.s === 200 && r.b === 'QUY TRINH', 'tải xuống tài liệu dự án');
  ok((await call('huy.dq', 'GET', '/api/project-files/' + pf.id)).s === 403, 'người ngoài không tải được tài liệu dự án');
  r = await call('long.hd', 'GET', '/api/projects/1/activity');
  ok(r.s === 200 && r.b.some(x => x.src === 'project' && x.action === 'post') && r.b.some(x => x.src === 'task'), 'hoạt động gộp lịch sử dự án và công việc', r.b.length);
  r = await call('mai.bt', 'GET', '/api/projects/1/sidebar');
  ok(r.s === 200 && 'my' in r.b && Array.isArray(r.b.attention) && Array.isArray(r.b.recent), 'thanh thông tin dự án', r.b);

  // D. Mẫu dự án (bài 63000286778, 63000272037)
  r = await call('long.hd', 'POST', '/api/projects/1/templates', { name: 'Mẫu triển khai hạ tầng', shared: { users: [U['quan.lm']] } });
  const tplId = r.b.id; ok(r.s === 200 && tplId, 'quản lý tạo mẫu từ dự án');
  r = await call('quan.lm', 'GET', '/api/work/templates');
  ok(r.b.mine.some(t => t.id === tplId) && r.b.builtin.length === 4, 'mẫu chia sẻ hiển thị với người được chia sẻ; có 4 mẫu dựng sẵn', r.b.mine.length);
  ok(!(await call('huy.dq', 'GET', '/api/work/templates')).b.mine.some(t => t.id === tplId), 'người không được chia sẻ không thấy mẫu');
  r = await call('quan.lm', 'POST', '/api/projects', { name: 'Dự án từ mẫu', kind: 'project', template_id: tplId });
  ok(r.s === 200 && r.b.groups.length >= 1 && r.b.fields.some(f => f.input_key === 'thanh_tien') && r.b.perm.account.view_unassigned.member === true, 'tạo dự án từ mẫu: có nhóm, trường tùy chỉnh, bảng quyền', [r.s, r.b.groups && r.b.groups.length, r.b.fields && r.b.fields.map(f => f.input_key), r.b.perm && r.b.perm.account.view_unassigned]);
  r = await call('quan.lm', 'POST', '/api/projects', { name: 'Phòng từ mẫu dựng sẵn', kind: 'team', template_id: 'b3' });
  ok(r.s === 200 && r.b.groups.length === 4, 'tạo phòng ban từ mẫu dựng sẵn', r.b.groups && r.b.groups.length);
  ok((await call('huy.dq', 'POST', '/api/projects', { name: 'x', kind: 'project', template_id: tplId })).s === 400, 'không dùng được mẫu không được chia sẻ');

  // E. Nhân bản dự án (bài 63000273296), nhân bản công việc sang dự án khác (63000273298)
  r = await call('long.hd', 'POST', '/api/projects/1/clone', { name: 'Dự án 1 – năm sau', tasks: 'all', keep_assignee: false, deadline: 'shift', shift_hours: 48, keep_members: false });
  const pc = r.b; ok(r.s === 200 && pc.name === 'Dự án 1 – năm sau' && pc.stats.total >= 5 && pc.members.every(m => m.role !== 'member'), 'nhân bản dự án kèm công việc, bỏ thành viên', pc.stats);
  const pcT = (await call('long.hd', 'GET', `/api/projects/${pc.id}/tasks?limit=200`)).b.rows;
  ok(pcT.every(t => t.assignee_id === null), 'tùy chọn "bỏ trống người nhận việc"');
  r = await call('long.hd', 'POST', '/api/projects/1/clone', { name: 'Chỉ nhóm', tasks: 'groups' });
  ok(r.s === 200 && r.b.stats.total === 0 && r.b.groups.length >= 1, 'nhân bản chỉ nhóm công việc', [r.s, r.b.stats, r.b.groups && r.b.groups.length, r.b.error]);
  ok((await call('mai.bt', 'POST', '/api/projects/1/clone', { name: 'x' })).s === 403, 'thành viên không nhân bản được dự án');
  r = await call('long.hd', 'POST', `/api/tasks/${tF.id}/clone-to`, { project_id: pc.id, due_date: T(5) });
  ok(r.s === 200 && r.b.project.id === pc.id && r.b.due_date === T(5), 'nhân bản công việc sang dự án khác', r.b.project);
  ok((await call('mai.bt', 'POST', `/api/tasks/${tA.id}/clone-to`, { project_id: 2 })).s === 403, 'không nhân bản được sang dự án không có quyền tạo việc');

  // F. Nhập từ Excel (bài 63000252615, 63000286215, 63000271425), xuất dữ liệu
  await call('long.hd', 'PUT', '/api/projects/1/settings', { deps: true });
  r = await call('long.hd', 'POST', '/api/projects/1/import', { with_deps: true, rows: [
    { group: 'Khởi động' },
    { title: 'Lập kế hoạch', assignee: 'mai.bt', start: '10/11/2026', due: '12/11/2026', tags: 'Kế hoạch', key: '1', fields: { ma_hd: 'HĐ-NK' } },
    { title: 'Phê duyệt kế hoạch', level: 1, assignee: 'long.hd', followers: 'quan.lm', urgent: 'Có', key: '2', deps: '1FS1d', fields: { ma_hd: 'x' } },
    { title: 'Mua sắm', due: '20/11/2026', key: '3', deps: '1SS2d12h, 2FF', fields: { ma_hd: 'x' } } ] });
  ok(r.s === 200 && r.b.tasks === 3 && r.b.groups === 1 && r.b.deps === 3, 'nhập công việc kèm nhóm, việc con "#", phụ thuộc từ Excel', r.b);
  const imp = (await call('long.hd', 'GET', '/api/projects/1/tasks?q=' + encodeURIComponent('Phê duyệt kế hoạch'))).b.rows[0];
  ok(imp && imp.parent_id && imp.urgent === 1 && imp.dep_in === 1, 'việc con và phụ thuộc được tạo đúng', imp);
  ok((await call('long.hd', 'POST', '/api/projects/1/import', { rows: [{ title: 'x', assignee: 'khong.ton.tai' }] })).s === 400, 'tài khoản không tồn tại: báo lỗi, không nhập dở dang');
  ok((await call('mai.bt', 'POST', '/api/projects/1/import', { rows: [{ title: 'x' }] })).s === 403, 'chỉ quản lý được nhập công việc');
  r = await call('long.hd', 'POST', '/api/projects/1/tasks/dates', { rows: [{ id: imp.id, start: '11/11/26', due: '15/11/26 16:30' }] });
  ok(r.s === 200 && r.b.updated === 1 && (await call('long.hd', 'GET', '/api/tasks/' + imp.id)).b.due_date === '2026-11-15', 'cập nhật thời gian từ Excel theo mã công việc', r.b);
  ok((await call('long.hd', 'POST', '/api/projects/1/tasks/dates', { rows: Array.from({ length: 301 }, () => ({ id: imp.id })) })).s === 400, 'tối đa 300 công việc mỗi lần cập nhật');
  r = await call('long.hd', 'GET', '/api/projects/1/export?sub=1&fields=all&basis=created');
  ok(r.s === 200 && r.b.rows.length >= 10 && r.b.fields.length >= 5 && r.b.rows.some(x => x.fields), 'xuất công việc dự án kèm trường tùy chỉnh', r.b.rows.length);
  ok((await call('mai.bt', 'GET', '/api/work/export?projects=1')).s === 403, 'chỉ Owner xuất nhiều dự án cùng lúc');
  r = await call('thanh.nv', 'GET', '/api/work/export?projects=1,2,3&sub=1');
  ok(r.s === 200 && new Set(r.b.rows.map(x => x.project_id)).size >= 2, 'Owner xuất công việc nhiều dự án', r.b.rows.length);

  // G. Báo cáo thành viên, báo cáo hệ thống
  r = await call('mai.bt', 'GET', `/api/work/members/${U['mai.bt']}/report`);
  ok(r.s === 200 && r.b.summary.total >= 1 && Array.isArray(r.b.series) && Array.isArray(r.b.by_project), 'thành viên tự xem báo cáo cá nhân (bài 63000271837)', r.b.summary);
  ok((await call('mai.bt', 'GET', `/api/work/members/${U['long.hd']}/report`)).s === 403, 'không xem được báo cáo của người khác');
  ok((await call('thanh.nv', 'GET', `/api/work/members/${U['mai.bt']}/report`)).s === 200, 'Owner xem báo cáo mọi thành viên');
  ok((await call('mai.bt', 'GET', '/api/work/system-report')).s === 403, 'thành viên không xem được báo cáo hệ thống');
  r = await call('thanh.nv', 'GET', `/api/work/system-report?from=${T(-30)}&to=${T(0)}&sub=1`);
  const sr = r.b;
  ok(r.s === 200 && sr.status.total > 0 && sr.days.length === 31 && sr.weeks.length === 5 && 'imp_urg' in sr.status && Array.isArray(sr.top_members) && Array.isArray(sr.tags) && sr.unit.comments >= 0, 'báo cáo hệ thống đủ các phần (bài 63000271457)', Object.keys(sr));
  ok(sr.status.done_ontime + sr.status.done_late + sr.status.in_progress + sr.status.overdue + (sr.status.failed || 0) === sr.status.total, 'tổng 4 trạng thái (+ thất bại) bằng tổng công việc', sr.status);

  // H. Tác vụ hàng loạt (bài 63000286115)
  ok((await call('long.hd', 'GET', `/api/work/bulk/tasks?user=${U['mai.bt']}`)).s === 403, 'chỉ Owner dùng tác vụ hàng loạt');
  r = await call('thanh.nv', 'GET', `/api/work/bulk/tasks?user=${U['mai.bt']}&role=assignee`);
  const bulkIds = r.b.rows.slice(0, 2).map(t => t.id); ok(r.s === 200 && bulkIds.length === 2, 'danh sách công việc của một người', r.b.total);
  r = await call('thanh.nv', 'POST', '/api/work/bulk/tasks', { task_ids: bulkIds, action: 'assignee', to_user: U['quan.lm'] });
  ok(r.s === 200 && r.b.updated === 2 && (await call('thanh.nv', 'GET', '/api/tasks/' + bulkIds[0])).b.assignee_id === U['quan.lm'], 'thay người nhận việc hàng loạt', r.b);
  ok((await call('thanh.nv', 'GET', '/api/tasks/' + bulkIds[0])).b.logs.some(l => l.detail.includes('tác vụ hàng loạt')), 'ghi lịch sử hoạt động');
  r = await call('thanh.nv', 'POST', '/api/work/bulk/tasks', { task_ids: bulkIds, action: 'add_follower', to_user: U['huy.dq'] });
  ok(r.s === 200 && (await call('thanh.nv', 'GET', '/api/tasks/' + bulkIds[1])).b.followers.includes(U['huy.dq']), 'thêm người theo dõi hàng loạt');
  r = await call('thanh.nv', 'GET', `/api/work/bulk/projects?user=${U['long.hd']}`);
  ok(r.s === 200 && r.b.some(p => p.id === 1 && p.role === 'manager'), 'danh sách dự án của một người');
  r = await call('thanh.nv', 'POST', '/api/work/bulk/projects', { user: U['long.hd'], project_ids: [1], action: 'demote' });
  ok(r.s === 200 && (await call('thanh.nv', 'GET', '/api/projects/1')).b.members.find(m => m.user_id === U['long.hd']).role === 'member', 'hạ quyền quản lý xuống thành viên', r.b);
  r = await call('thanh.nv', 'POST', '/api/work/bulk/projects', { user: U['long.hd'], project_ids: [1], action: 'replace', to_user: U['huy.dq'] });
  const mem1 = (await call('thanh.nv', 'GET', '/api/projects/1')).b.members;
  ok(r.s === 200 && !mem1.some(m => m.user_id === U['long.hd']) && mem1.some(m => m.user_id === U['huy.dq'] && m.role === 'member'), 'thay thế vai trò bằng người khác');

  // I. Xóa dự án dọn dữ liệu mở rộng
  r = await call('long.hd', 'DELETE', '/api/projects/' + pc.id);
  ok(r.s === 200, 'xóa dự án nhân bản (dọn trường tùy chỉnh, thảo luận, tài liệu)', r.b);

  console.log(`work-ext-test: ${pass} đạt, ${fail} không đạt`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
