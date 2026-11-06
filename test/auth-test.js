// Kiểm thử xác thực theo CLAUDE.md mục 4.4 và các việc P0-4, P0-5, P0-6, P0-7 của báo cáo rà soát 06/11/2026.
// Phạm vi: đăng nhập đúng/sai, khóa khi sai nhiều lần (theo tài khoản, theo IP, bền vững qua khởi tạo lại), đổi mật khẩu,
// thu hồi phiên, ép đổi mật khẩu lần đầu phía máy chủ, quản trị đặt lại mật khẩu, khóa tài khoản, phân quyền quản trị,
// nhật ký an ninh, bí mật ADMIN_PASSWORD chỉ áp dụng một lần.
// Chạy trên lõi Cloudflare với Durable Object mô phỏng: node test/auth-test.js
'use strict';
const path = require('path'), os = require('os'), fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const { fakeStorage } = require('./fake-do.js');
const core = require(path.join(__dirname, '..', 'worker', 'do-core.js'));
const B = 'https://so.example.workers.dev';
let pass = 0, fail = 0;
const ok = (cond, name, extra) => { if (cond) pass++; else { fail++; console.log('  ✗ ' + name + (extra !== undefined ? ' → ' + JSON.stringify(extra).slice(0, 300) : '')); } };
const fresh = f => { for (const x of [f, f + '-wal', f + '-shm']) { try { fs.unlinkSync(x); } catch (e) {} } return f; };

function client(app, ip) {
  let cookie = '';
  const c = async (method, p, body, extra = {}) => {
    const h = { 'content-type': 'application/json', host: 'so.example.workers.dev', origin: B, 'cf-connecting-ip': extra.ip || ip };
    if (cookie) h.cookie = cookie;
    const r = await core.handleRequest(c.app, new Request(B + p, { method, headers: h, body: body ? JSON.stringify(body) : undefined }));
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0].replace(/^sid=$/, '');
    const ct = r.headers.get('content-type') || '';
    return { s: r.status, b: ct.includes('json') ? await r.json() : await r.text() };
  };
  c.app = app; c.cookie = () => cookie; c.setCookie = v => { cookie = v; };
  c.login = (u, pw, o) => c('POST', '/api/login', { username: u, password: pw }, o || {});
  return c;
}

const PART_B = /^b[1-6]$/.test(process.argv[2] || '');
(async () => {
  if (PART_B) return partB();
  /* ===== A. Dữ liệu mẫu ===== */
  const DBF = fresh(path.join(os.tmpdir(), 'so-auth-test.db'));
  let app = core.createApp(fakeStorage(DBF), { SO_DEMO: '1' });
  const a = client(app, '203.0.113.1'), b = client(app, '203.0.113.2'), adm = client(app, '203.0.113.3');

  // 1. Đăng nhập đúng, sai
  let r = await a.login('long.hd', '123456');
  ok(r.s === 200 && r.b.user && r.b.user.username === 'long.hd', 'đăng nhập đúng', r);
  ok(!JSON.stringify(r.b).includes('pass_hash'), 'phản hồi đăng nhập không chứa mã băm mật khẩu');
  r = await b.login('long.hd', 'sai-mat-khau');
  ok(r.s === 401 && /không đúng/.test(r.b.error), 'đăng nhập sai mật khẩu trả 401', r);
  r = await b.login('khong.ton.tai', '123456');
  ok(r.s === 401 && /không đúng/.test(r.b.error), 'tài khoản không tồn tại trả cùng thông báo 401 (không lộ tên đăng nhập)', r);
  r = await b.login('LONG.HD', '123456');
  ok(r.s === 200, 'tên đăng nhập không phân biệt hoa thường', r.s);
  r = await b('GET', '/api/bootstrap');
  ok(r.s === 200, 'phiên thứ hai (thiết bị khác) dùng được');

  // 2. Khóa theo tài khoản: 5 lần sai trong 15 phút → 429, kể cả đúng mật khẩu, kể cả khác IP
  const x = client(app, '203.0.113.50');
  for (let i = 0; i < 4; i++) { r = await x.login('mai.bt', 'sai' + i, { ip: '203.0.113.' + (60 + i) }); }
  ok(r.s === 401, 'lần sai thứ 4 vẫn 401', r.s);
  r = await x.login('mai.bt', 'sai4', { ip: '203.0.113.64' });
  ok(r.s === 401, 'lần sai thứ 5 trả 401 và kích hoạt khóa', r.s);
  r = await x.login('mai.bt', '123456', { ip: '203.0.113.99' });
  ok(r.s === 429, 'đang bị khóa: đúng mật khẩu, khác IP vẫn 429', r);
  // bền vững khi Durable Object khởi tạo lại
  app = core.createApp(fakeStorage(DBF), { SO_DEMO: '1' }); for (const c of [a, b, adm, x]) c.app = app;
  r = await x.login('mai.bt', '123456', { ip: '203.0.113.98' });
  ok(r.s === 429, 'khóa vẫn còn sau khi Durable Object khởi tạo lại', r.s);
  r = await x.login('trang.pt', '123456', { ip: '203.0.113.97' });
  ok(r.s === 200, 'khóa tài khoản này không ảnh hưởng tài khoản khác', r.s);
  // hết thời gian khóa → đăng nhập lại được (mô phỏng bằng cách lùi thời điểm khóa trong cơ sở dữ liệu)
  { const db = new DatabaseSync(DBF); db.prepare("UPDATE login_attempts SET until_at=?, first_at=? WHERE key='u:mai.bt'").run(Date.now() - 1000, Date.now() - 20 * 60e3); db.close(); }
  r = await x.login('mai.bt', '123456', { ip: '203.0.113.96' });
  ok(r.s === 200, 'hết 5 phút khóa thì đăng nhập đúng được', r.s);
  { const db = new DatabaseSync(DBF); const row = db.prepare("SELECT * FROM login_attempts WHERE key='u:mai.bt'").get(); db.close(); ok(!row, 'đăng nhập thành công xóa bộ đếm sai của tài khoản', row); }

  // 3. Khóa theo IP: 20 lần sai từ một IP (nhiều tài khoản) → IP bị khóa, IP khác không bị
  const ipx = client(app, '192.0.2.77');
  for (let i = 0; i < 20; i++) await ipx.login('khong.co.' + i, 'sai');
  r = await ipx.login('huy.dq', '123456');
  ok(r.s === 429, 'IP sai 20 lần bị khóa 5 phút', r.s);
  r = await client(app, '192.0.2.78').login('huy.dq', '123456');
  ok(r.s === 200, 'IP khác không bị ảnh hưởng', r.s);

  // 4. Đổi mật khẩu: kiểm tra đầu vào; thu hồi mọi phiên khác; cấp phiên mới
  r = await a('PUT', '/api/me/password', { old_password: 'sai', new_password: 'Moi-mat-khau1' });
  ok(r.s === 400 && /hiện tại không đúng/.test(r.b.error), 'sai mật khẩu hiện tại → 400', r);
  r = await a('PUT', '/api/me/password', { old_password: '123456', new_password: 'ngan1' });
  ok(r.s === 400, 'mật khẩu mới dưới 8 ký tự → 400', r.s);
  r = await a('PUT', '/api/me/password', { old_password: '123456', new_password: 'chicochu' });
  ok(r.s === 400, 'mật khẩu mới không có số → 400', r.s);
  const oldA = a.cookie();
  r = await a('PUT', '/api/me/password', { old_password: '123456', new_password: 'Moi-mat-khau1' });
  ok(r.s === 200, 'đổi mật khẩu hợp lệ', r);
  ok(a.cookie() && a.cookie() !== oldA, 'thiết bị đang dùng được cấp phiên mới');
  ok((await a('GET', '/api/bootstrap')).s === 200, 'phiên mới dùng được');
  r = await b('GET', '/api/bootstrap');
  ok(r.s === 401, 'phiên trên thiết bị khác bị thu hồi sau khi đổi mật khẩu', r.s);
  { const z = client(app, '203.0.113.9'); z.setCookie(oldA); ok((await z('GET', '/api/bootstrap')).s === 401, 'cookie phiên cũ của chính thiết bị không còn hiệu lực'); }
  ok((await b.login('long.hd', '123456')).s === 401, 'mật khẩu cũ không đăng nhập được');
  ok((await b.login('long.hd', 'Moi-mat-khau1')).s === 200, 'mật khẩu mới đăng nhập được');
  r = await b('PUT', '/api/me/password', { old_password: 'Moi-mat-khau1', new_password: 'Moi-mat-khau1' });
  ok(r.s === 400, 'mật khẩu mới trùng mật khẩu hiện tại → 400', r.s);

  // 5. Ép đổi mật khẩu lần đầu phía máy chủ (admin mẫu có must_change_pw = 1)
  r = await adm.login('admin', 'Admin@123');
  ok(r.s === 200 && r.b.user.must_change_pw === true, 'admin mẫu đăng nhập, được báo phải đổi mật khẩu', r.b.user);
  ok((await adm('GET', '/api/bootstrap')).s === 200, 'chưa đổi mật khẩu: /api/bootstrap vẫn dùng được');
  for (const [m, p] of [['GET', '/api/admin/users'], ['GET', '/api/tasks'], ['GET', '/api/projects'], ['POST', '/api/admin/departments'], ['GET', '/api/admin/security-log']]) {
    r = await adm(m, p, m === 'POST' ? { name: 'X' } : undefined);
    ok(r.s === 403 && /đổi mật khẩu lần đầu/.test(r.b.error), `chưa đổi mật khẩu: ${m} ${p} → 403`, r);
  }
  r = await adm('PUT', '/api/me/password', { old_password: 'Admin@123', new_password: 'Quan-tri#2026' });
  ok(r.s === 200, 'admin đổi mật khẩu lần đầu', r);
  r = await adm('GET', '/api/admin/users');
  ok(r.s === 200 && Array.isArray(r.b), 'sau khi đổi mật khẩu dùng được chức năng quản trị', r.s);

  // 6. Phân quyền quản trị
  r = await b('GET', '/api/admin/users'); ok(r.s === 403, 'người dùng thường không xem được danh sách tài khoản', r.s);
  r = await b('GET', '/api/admin/security-log'); ok(r.s === 403, 'người dùng thường không xem được nhật ký an ninh', r.s);
  r = await b('POST', '/api/admin/users/import', { rows: [{ username: 'hack', full_name: 'X', department: 'Y' }], password: 'Abcdef12' });
  ok(r.s === 403, 'người dùng thường không nhập được tài khoản', r.s);
  r = await client(app, '203.0.113.20')('GET', '/api/bootstrap'); ok(r.s === 401, 'chưa đăng nhập → 401', r.s);
  r = await b('POST', '/api/logout', {}, {}); // đăng xuất hợp lệ
  ok(r.s === 200 && (await b('GET', '/api/bootstrap')).s === 401, 'đăng xuất xóa phiên');

  // 7. Quản trị đặt lại mật khẩu: thu hồi phiên, bắt buộc đổi lại; khóa tài khoản
  const users = (await adm('GET', '/api/admin/users')).b, quan = users.find(u => u.username === 'quan.lm');
  const q = client(app, '203.0.113.30'); ok((await q.login('quan.lm', '123456')).s === 200, 'quan.lm đăng nhập');
  r = await adm('PUT', '/api/admin/users/' + quan.id, { password: 'Tam-thoi-2026' });
  ok(r.s === 200, 'quản trị đặt lại mật khẩu', r);
  ok((await q('GET', '/api/bootstrap')).s === 401, 'đặt lại mật khẩu thu hồi phiên của người dùng');
  r = await q.login('quan.lm', 'Tam-thoi-2026');
  ok(r.s === 200 && r.b.user.must_change_pw === true, 'đăng nhập bằng mật khẩu tạm, bị buộc đổi', r.b.user);
  ok((await q('GET', '/api/tasks')).s === 403, 'mật khẩu tạm: API nghiệp vụ bị chặn');
  r = await adm('PUT', '/api/admin/users/' + quan.id, { active: false });
  ok(r.s === 200 && (await q('GET', '/api/bootstrap')).s === 401, 'khóa tài khoản thu hồi phiên ngay');
  ok((await q.login('quan.lm', 'Tam-thoi-2026')).s === 401, 'tài khoản bị khóa không đăng nhập được');

  // 8a. Nhập tài khoản: mật khẩu khởi tạo phải có chữ và số; cột Lãnh đạo phòng gán trưởng phòng
  r = await adm('POST', '/api/admin/users/import', { rows: [{ username: 'yeu.mk', full_name: 'Yếu', department: 'P' }], password: 'abcdefgh' });
  ok(r.s === 400, 'nhập tài khoản: mật khẩu khởi tạo không có số bị từ chối', r);
  r = await adm('POST', '/api/admin/users/import', { rows: [
    { username: 'truong.gp9', full_name: 'Trưởng Phòng Chín', title: 'Quyền Giám đốc', department: 'Phòng Giải pháp 9', is_head: true },
    { username: 'nv.gp9', full_name: 'Nhân Viên Chín', title: 'Kỹ sư', department: 'Phòng Giải pháp 9' },
    { username: 'truong.gp9', full_name: 'Trùng Tên', department: 'Phòng Giải pháp 9' }], password: 'Khoi-tao-2026' });
  ok(r.s === 200 && r.b.ok === 2 && r.b.heads === 1 && r.b.errors.length === 1 && /đã tồn tại/.test(r.b.errors[0]), 'nhập 2 tài khoản, 1 lãnh đạo phòng, báo dòng trùng tên đăng nhập', r.b);
  { const bt = (await adm('GET', '/api/bootstrap')).b, d9 = bt.departments.find(d => d.name === 'Phòng Giải pháp 9'), tr = (await adm('GET', '/api/admin/users')).b.find(u => u.username === 'truong.gp9');
    ok(d9 && tr && d9.head_id === tr.id, 'phòng ban mới được tạo và gán lãnh đạo phòng', d9); }

  // 8. Tài khoản nhập từ tệp phải đổi mật khẩu lần đầu
  r = await adm('POST', '/api/admin/users/import', { rows: [{ username: 'nguoi.moi', full_name: 'Người Mới', title: 'Kỹ sư', department: 'Phòng Giải pháp 1' }], password: 'Ban-dau-2026' });
  ok(r.s === 200 && r.b.ok === 1, 'nhập tài khoản từ tệp', r.b);
  const nm = client(app, '203.0.113.40'); r = await nm.login('nguoi.moi', 'Ban-dau-2026');
  ok(r.s === 200 && r.b.user.must_change_pw === true && (await nm('GET', '/api/tasks')).s === 403, 'tài khoản nhập từ tệp bị buộc đổi mật khẩu lần đầu');

  // 9. Nhật ký an ninh
  r = await adm('GET', '/api/admin/security-log?limit=200');
  const ev = new Set(r.b.map(e => e.event));
  for (const e of ['login_ok', 'login_fail', 'login_locked', 'password_change', 'password_reset', 'account_disabled']) ok(ev.has(e), 'nhật ký an ninh ghi sự kiện ' + e, [...ev]);
  ok(r.b.some(e => e.event === 'login_fail' && e.username === 'khong.ton.tai' && e.ip === '203.0.113.2'), 'nhật ký ghi tên đăng nhập và IP của lần sai');
  ok(r.b.every(e => !/123456|Moi-mat-khau1|Tam-thoi/.test(JSON.stringify(e))), 'nhật ký không chứa mật khẩu');
  r = await adm('GET', '/api/admin/security-log?event=login_locked');
  ok(r.s === 200 && r.b.length >= 1 && r.b.every(e => e.event === 'login_locked'), 'lọc nhật ký theo sự kiện', r.b.length);

  /* Phần B: mỗi bước chạy trong một tiến trình riêng = một isolate mới trên Cloudflare (mã khởi tạo mô-đun chạy lại),
   * vì mỗi isolate chỉ phục vụ một Durable Object (CLAUDE.md 3.4) và applyAdminSecret chỉ chạy khi isolate nạp ứng dụng. */
  const { spawnSync } = require('child_process');
  const DB2 = fresh(path.join(os.tmpdir(), 'so-auth-test2.db'));
  for (const st of ['b1', 'b2', 'b3', 'b4', 'b5', 'b6']) {
    const sub = spawnSync(process.execPath, [__filename, st, DB2], { encoding: 'utf8' });
    const m = /bước \w+: (\d+) đạt, (\d+) không đạt/.exec(sub.stdout || '');
    process.stdout.write((sub.stdout || '').split('\n').filter(l => l.startsWith('  ✗')).map(l => l + '\n').join(''));
    ok(!!m, 'bước ' + st + ' chạy xong', (sub.stderr || '').slice(-300));
    if (m) { pass += Number(m[1]); fail += Number(m[2]); }
  }
  console.log(`auth-test: ${pass} đạt, ${fail} không đạt`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('LỖI', e); process.exit(1); });

async function partB() {
  const st = process.argv[2], DB2 = process.argv[3], SECRET = { b1: 'Bi-mat-ban-dau#1', b2: 'Bi-mat-khac#2' }[st] || 'Bi-mat-ban-dau#1';
  if (st === 'b4') { const db = new DatabaseSync(DB2); db.prepare("DELETE FROM settings WHERE key='admin_bootstrapped'").run(); db.close(); }
  const app2 = core.createApp(fakeStorage(DB2), { ADMIN_PASSWORD: SECRET });
  const c2 = client(app2, '203.0.113.70');
  let r;
  if (st === 'b1') { // CSDL trống: dùng bí mật ADMIN_PASSWORD, không có mật khẩu mặc định
    r = await c2.login('admin', 'Bi-mat-ban-dau#1');
    ok(r.s === 200 && r.b.user.must_change_pw === true, 'CSDL trống: admin đăng nhập bằng bí mật ADMIN_PASSWORD, phải đổi mật khẩu', r);
    ok((await c2.login('admin', 'Admin@123', { ip: '203.0.113.71' })).s === 401, 'CSDL trống: không có mật khẩu mặc định Admin@123');
  }
  if (st === 'b2') { // isolate mới với bí mật khác, admin CHƯA đổi mật khẩu: không ghi đè lần hai
    ok((await c2.login('admin', 'Bi-mat-khac#2')).s === 401, 'isolate mới, bí mật khác: không ghi đè mật khẩu ban đầu lần thứ hai');
    r = await c2.login('admin', 'Bi-mat-ban-dau#1'); ok(r.s === 200, 'mật khẩu ban đầu vẫn dùng được', r.s);
    ok((await c2('PUT', '/api/me/password', { old_password: 'Bi-mat-ban-dau#1', new_password: 'Mat-khau-that#9' })).s === 200, 'admin đổi mật khẩu');
  }
  if (st === 'b3') { // đã đổi mật khẩu: bí mật không đặt lại được
    ok((await c2.login('admin', 'Bi-mat-ban-dau#1')).s === 401, 'sau khi đã đổi, bí mật ADMIN_PASSWORD không đặt lại được mật khẩu');
    ok((await c2.login('admin', 'Mat-khau-that#9', { ip: '203.0.113.72' })).s === 200, 'mật khẩu đã đổi vẫn dùng được');
  }
  if (st === 'b4') { // CSDL đang chạy chưa có cờ (như hệ thống thật trước bản này), admin đã đổi mật khẩu
    ok((await c2.login('admin', 'Mat-khau-that#9')).s === 200, 'CSDL cũ chưa có cờ, admin đã đổi mật khẩu: không bị ghi đè');
    const db = new DatabaseSync(DB2); const f = db.prepare("SELECT value FROM settings WHERE key='admin_bootstrapped'").get(); db.close();
    ok(f && f.value === '1', 'ghi cờ admin_bootstrapped', f);
  }
  if (st === 'b5') { // 5 lần sai
    for (let i = 0; i < 5; i++) r = await c2.login('admin', 'sai' + i, { ip: '198.18.0.' + i });
    ok(r.s === 401, 'bước b5: 5 lần sai', r.s);
  }
  if (st === 'b6') { // isolate mới: khóa vẫn còn
    r = await c2.login('admin', 'Mat-khau-that#9', { ip: '198.18.0.99' });
    ok(r.s === 429, 'isolate mới (tiến trình mới): khóa đăng nhập vẫn còn, khác IP vẫn bị khóa', r.s);
  }
  console.log(`bước ${st}: ${pass} đạt, ${fail} không đạt`);
  process.exit(0);
}
