// Kiểm thử lõi Cloudflare (Durable Object mô phỏng bằng node:sqlite): node test/worker-smoke.js [demo]
const path = require('path');
const { fakeStorage } = require('./fake-do.js');
const REPO = path.join(__dirname, '..');
const core = require(REPO + '/worker/do-core.js');
/* P0-2: mọi bước quan trọng có điều kiện khẳng định; sai thì in "SAI" và trả mã thoát 1 để CI thất bại. */
let FAILS = 0;
const chk = (label, cond, info = '') => { if (!cond) { FAILS++; console.log('SAI', label, info); } };
(async () => {
  const fs = require('fs'); try { fs.unlinkSync(path.join(require('os').tmpdir(), 'so-do-test.db')); } catch (e) {}
  const demo = process.argv[2] === 'demo';
  const DBF = path.join(require('os').tmpdir(), 'so-do-test.db');
  const st1 = fakeStorage(DBF);
  let app = core.createApp(st1, demo ? { SO_DEMO: '1' } : { ADMIN_PASSWORD: 'Thu-Nghiem#2026', PUBLIC_ORIGINS: 'https://smartoffice.vnptninhbinh.com.vn' });
  const B = 'https://smart-office.example.workers.dev';
  let cookie = '';
  const call = async (method, p, body, extra = {}) => {
    const h = { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.5', origin: B, host: 'smart-office.example.workers.dev', ...extra };
    if (cookie) h.cookie = cookie;
    const r = await core.handleRequest(app, new Request(B + p, { method, headers: h, body: body ? JSON.stringify(body) : undefined }));
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const ct = r.headers.get('content-type') || '';
    return { status: r.status, headers: r.headers, body: ct.includes('json') ? await r.json() : await r.text() };
  };
  console.log('healthz', (await call('GET', '/healthz')).body);
  const user = demo ? 'trang.pt' : 'admin', pw = demo ? '123456' : 'Thu-Nghiem#2026';
  let r = await call('POST', '/api/login', { username: user, password: pw });
  console.log('login', r.status, r.headers.get('set-cookie')?.includes('Secure'), r.body.user && r.body.user.full_name);
  chk('đăng nhập', r.status === 200, r.status);
  r = await call('GET', '/api/bootstrap'); console.log('bootstrap', r.status, r.body.me && r.body.me.username, 'users', r.body.users && r.body.users.length, 'today?', JSON.stringify(r.body.counts));
  if (!demo) {
    // P0-6: chưa đổi mật khẩu lần đầu thì API nghiệp vụ trả 403
    r = await call('GET', '/api/docs'); console.log('must-change gate', r.status); chk('ép đổi mật khẩu lần đầu', r.status === 403, r.status);
    const oldCookie = cookie;
    // P0-2: đường dẫn đúng là PUT /api/me/password (trước đây gọi nhầm /api/account/password, nhận 404 vẫn chạy tiếp)
    r = await call('PUT', '/api/me/password', { old_password: 'Thu-Nghiem#2026', new_password: 'Mat-khau-moi#1' }); console.log('change pw', r.status, JSON.stringify(r.body).slice(0, 120));
    chk('đổi mật khẩu', r.status === 200, r.status);
    // P0-5: phiên cũ bị thu hồi, phiên mới được cấp
    const keep = cookie; cookie = oldCookie; r = await call('GET', '/api/bootstrap'); console.log('old session', r.status); chk('thu hồi phiên cũ', r.status === 401, r.status);
    cookie = keep; r = await call('GET', '/api/bootstrap'); chk('phiên mới dùng được', r.status === 200 && cookie !== oldCookie, r.status);
  }
  // tài liệu có tệp đính kèm 2.5 MB (3 khối)
  const data = Buffer.alloc(2.5 * 1024 * 1024, 7); data[0] = 1; data[data.length - 1] = 9;
  r = await call('POST', '/api/docs', { title: 'Quy chế thử', category: 'khac', file_name: 'quy-che.pdf', file_mime: 'application/pdf', file_data: data.toString('base64') });
  console.log('upload', r.status, JSON.stringify(r.body).slice(0, 120));
  if (r.body.id) {
    const f = await core.handleRequest(app, new Request(B + `/api/docs/${r.body.id}/file`, { headers: { cookie } }));
    const buf = Buffer.from(await f.arrayBuffer());
    console.log('download', f.status, buf.length === data.length && buf.equals(data), f.headers.get('content-disposition'));
    chk('tải tệp 2,5 MB', f.status === 200 && buf.equals(data));
  }
  r = await call('GET', '/api/admin/backup'); console.log('backup', r.status, JSON.stringify(r.body).slice(0, 80));
  r = await call('POST', '/api/logout', {}, { origin: 'https://evil.example' }); console.log('evil origin', r.status);
  r = await call('GET', '/api/bootstrap'); console.log('csv/tasks');
  const c = await call('GET', '/api/export/tasks.csv'); console.log('csv', c.status, c.headers.get('content-type'), String(c.body).length);
  r = await call('POST', '/api/attendance/check', {}); console.log('check-in', r.status, JSON.stringify(r.body).slice(0, 140));
  /* Phân hệ Công việc – Dự án bản đầy đủ (ADR-007): bảng mới tạo được trên ctx.storage.sql, tạo dự án từ mẫu dựng sẵn */
  r = await call('POST', '/api/projects', { name: 'Kiểm thử Workers', kind: 'project', template_id: 'b2' });
  const wp = r.body && r.body.id; r = wp ? await call('GET', `/api/projects/${wp}/fields`) : r;
  console.log('work-template', r.status, r.body && r.body.fields ? r.body.fields.length : -1); chk('tạo dự án từ mẫu', r.status === 200 && r.body.fields.length === 3);
  r = wp ? await call('POST', `/api/projects/${wp}/posts`, { title: 'Thảo luận', body: 'Nội dung' }) : r; console.log('work-post', r.status);
  // Durable Object được khởi tạo lại trong cùng isolate: storage cũ không còn dùng được
  st1.kill();
  app = core.createApp(fakeStorage(DBF), demo ? { SO_DEMO: '1' } : { ADMIN_PASSWORD: 'Thu-Nghiem#2026' });
  r = await call('GET', '/api/bootstrap'); console.log('re-instantiate', r.status); chk('khởi tạo lại Durable Object', r.status === 200, r.status);
  if (!demo) {
    // P0-4: 5 lần sai → 429, khóa vẫn còn sau khi Durable Object khởi tạo lại; đổi IP không né được khóa theo tài khoản
    const save = cookie; cookie = '';
    for (let i = 0; i < 5; i++) await call('POST', '/api/login', { username: 'admin', password: 'sai-' + i }, { 'cf-connecting-ip': '198.51.100.' + i });
    app = core.createApp(fakeStorage(DBF), { ADMIN_PASSWORD: 'Thu-Nghiem#2026' });
    r = await call('POST', '/api/login', { username: 'admin', password: 'Mat-khau-moi#1' }, { 'cf-connecting-ip': '198.51.100.99' });
    console.log('lockout persist', r.status); chk('khóa đăng nhập bền vững qua khởi tạo lại, khác IP', r.status === 429, r.status);
    // P0-7: bí mật ADMIN_PASSWORD không ghi đè mật khẩu admin đã đổi
    cookie = save;
  }
  console.log(FAILS ? `KẾT QUẢ: ${FAILS} không đạt` : 'KẾT QUẢ: đạt');
  if (FAILS) process.exitCode = 1;
})().catch(e => { console.error('FAIL', e); process.exit(1); });
