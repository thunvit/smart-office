// Kiểm thử bản Node qua HTTP thật: node node-http.js <baseUrl> <dataDir> <mode: demo|empty>
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const [B, DATA, mode] = process.argv.slice(2);
const jar = {};
async function call(who, method, p, body, extra = {}) {
  const h = { 'content-type': 'application/json', ...extra };
  if (jar[who]) h.cookie = jar[who];
  const t = performance.now();
  const r = await fetch(B + p, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const ms = (performance.now() - t).toFixed(1);
  const sc = r.headers.get('set-cookie'); if (sc) jar[who] = sc.split(';')[0];
  const ct = r.headers.get('content-type') || '';
  const b = ct.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer());
  return { status: r.status, body: b, ms, sc, headers: r.headers };
}
const show = (l, r) => console.log(`${l}:`, r.status, `(${r.ms} ms)`, Buffer.isBuffer(r.body) ? `<${r.body.length} byte>` : JSON.stringify(r.body).slice(0, 150));
(async () => {
  if (mode === 'demo') {
    for (const u of ['thanh.nv', 'huong.tt', 'trang.pt', 'mai.bt']) show(`login ${u}/123456`, await call('x' + u, 'POST', '/api/login', { username: u, password: '123456' }));
    const r = await call('xthanh.nv', 'GET', '/api/bootstrap'); console.log('thanh.nv must_change_pw=', r.body.me.must_change_pw);
    return;
  }
  let r = await call('A', 'POST', '/api/login', { username: 'admin', password: 'Admin@123' }); show('login admin/Admin@123', r);
  console.log('  Set-Cookie:', r.sc);
  r = await call('A', 'GET', '/api/bootstrap'); console.log('bootstrap must_change_pw=', r.body.me.must_change_pw);
  show('API khác khi chưa đổi mk (/api/admin/users)', await call('A', 'GET', '/api/admin/users'));
  show('login phiên B', await call('B', 'POST', '/api/login', { username: 'admin', password: 'Admin@123' }));
  show('PUT /api/me/password', await call('A', 'PUT', '/api/me/password', { old_password: 'Admin@123', new_password: 'Moi-mat-khau#9' }));
  show('phiên B (tạo trước khi đổi mk) gọi bootstrap', await call('B', 'GET', '/api/bootstrap'));
  show('login mk cũ', await call('C', 'POST', '/api/login', { username: 'admin', password: 'Admin@123' }));
  show('login mk mới', await call('C', 'POST', '/api/login', { username: 'admin', password: 'Moi-mat-khau#9' }));
  const sid = jar.A; show('logout A', await call('A', 'POST', '/api/logout', {})); jar.A = sid;
  show('dùng lại cookie A sau logout', await call('A', 'GET', '/api/bootstrap'));
  show('origin lạ POST', await call('C', 'POST', '/api/projects', { name: 'x' }, { origin: 'https://evil.example' }));
  for (let i = 1; i <= 7; i++) { const x = await call('D', 'POST', '/api/login', { username: 'admin', password: 'sai' + i }); process.stdout.write(`sai ${i}: ${x.status}  `); }
  console.log();
  show('mk đúng ngay sau 7 lần sai', await call('D', 'POST', '/api/login', { username: 'admin', password: 'Moi-mat-khau#9' }));
  show('user không tồn tại', await call('D', 'POST', '/api/login', { username: 'khongco', password: 'x' }));
  for (const mb of [2.5, 20.5, 25]) {
    const data = crypto.randomBytes(Math.round(mb * 1024 * 1024));
    let x; try { x = await call("C", "POST", "/api/docs", { title: 'Tep ' + mb, category: 'khac', file_name: 't.pdf', file_mime: 'application/pdf', file_data: data.toString("base64") }); } catch (e) { console.log(`upload ${mb} MB: LOI KET NOI`, e.cause && e.cause.code); const h = await fetch(B + "/healthz").then(r => r.status).catch(e => "chet"); console.log("  healthz sau do:", h); continue; }
    let extra = '';
    if (x.body.id) { const f = await call('C', 'GET', `/api/docs/${x.body.id}/file`); extra = ` download=${f.status} khop=${Buffer.isBuffer(f.body) && f.body.equals(data)}`; }
    console.log(`upload ${mb} MB:`, x.status, `(${x.ms} ms)`, JSON.stringify(x.body).slice(0, 70) + extra);
  }
  console.log('thư mục tệp:', fs.readdirSync(path.join(DATA, 'files')).map(f => f + ' ' + fs.statSync(path.join(DATA, 'files', f)).size));
  const b = await call('C', 'GET', '/api/admin/backup');
  console.log('backup:', b.status, b.headers.get('content-disposition'), Buffer.isBuffer(b.body) ? b.body.length + ' byte, header=' + b.body.subarray(0, 15).toString() : JSON.stringify(b.body));
  const db = new (require('node:sqlite').DatabaseSync)(path.join(DATA, 'smartoffice.db'), { readOnly: true });
  console.log('mẫu sessions:', JSON.stringify(db.prepare('SELECT substr(token,1,16) tok16, length(token) len, user_id, expires FROM sessions LIMIT 2').all()));
  console.log('pass_hash admin:', db.prepare("SELECT pass_hash FROM users WHERE username='admin'").get().pass_hash.slice(0, 60) + '...');
})().catch(e => { console.error('FAIL', e); process.exit(1); });
