// Kịch bản kiểm thử xác thực trên mô phỏng Durable Object (test/fake-do.js)
// node do-auth.js <dbfile> <phase>   phase: first | restart
const SRC = process.env.SRC;
const { fakeStorage } = require(SRC + '/test/fake-do.js');
const core = require(SRC + '/worker/do-core.js');
const crypto = require('crypto');
const [dbfile, phase] = process.argv.slice(2);
// Mã băm giả lập ADMIN_PASSWORD_HASH (mật khẩu thử "Ban-dau#2026")
const salt = Buffer.from('d8678fc782c5557fbcc4183f9ab710a0', 'hex');
const HASH = 'scrypt$' + salt.toString('hex') + '$' + crypto.scryptSync('Ban-dau#2026', salt, 64).toString('hex');
const env = { ADMIN_PASSWORD_HASH: HASH, PUBLIC_ORIGINS: 'https://smartoffice.vnptninhbinh.com.vn', SO_DEBUG: '1' };
const B = 'https://smart-office.example.workers.dev';
(async () => {
  const t0 = performance.now();
  const app = core.createApp(fakeStorage(dbfile), env);
  console.log(`[${phase}] createApp ms=`, (performance.now() - t0).toFixed(1));
  const jar = {};
  const call = async (who, method, p, body, extra = {}) => {
    const h = { 'content-type': 'application/json', 'cf-connecting-ip': extra.ip || '203.0.113.5', origin: B, host: 'smart-office.example.workers.dev' };
    if (jar[who]) h.cookie = jar[who];
    const t = performance.now();
    const r = await core.handleRequest(app, new Request(B + p, { method, headers: h, body: body ? JSON.stringify(body) : undefined }));
    const ms = (performance.now() - t).toFixed(1);
    const sc = r.headers.get('set-cookie'); if (sc) jar[who] = sc.split(';')[0];
    const ct = r.headers.get('content-type') || '';
    const b = ct.includes('json') ? await r.json() : await r.text();
    return { status: r.status, body: b, ms, sc };
  };
  const show = (label, r) => console.log(`[${phase}] ${label}:`, r.status, `(${r.ms} ms)`, JSON.stringify(r.body).slice(0, 160));
  if (phase === 'first') {
    show('login mat khau ban dau (hash)', await call('A', 'POST', '/api/login', { username: 'admin', password: 'Ban-dau#2026' }));
    let r = await call('A', 'GET', '/api/bootstrap'); console.log(`[${phase}] bootstrap`, r.status, 'must_change_pw=', r.body.me && r.body.me.must_change_pw);
    show('login phien thu 2 (B)', await call('B', 'POST', '/api/login', { username: 'admin', password: 'Ban-dau#2026' }));
    show('PUT /api/me/password sai mk cu', await call('A', 'PUT', '/api/me/password', { old_password: 'x', new_password: 'Moi-mat-khau#9' }));
    show('PUT /api/me/password mk yeu', await call('A', 'PUT', '/api/me/password', { old_password: 'Ban-dau#2026', new_password: 'abc' }));
    show('PUT /api/me/password hop le', await call('A', 'PUT', '/api/me/password', { old_password: 'Ban-dau#2026', new_password: 'Moi-mat-khau#9' }));
    r = await call('A', 'GET', '/api/bootstrap'); console.log(`[${phase}] bootstrap sau doi mk`, r.status, 'must_change_pw=', r.body.me && r.body.me.must_change_pw);
    r = await call('B', 'GET', '/api/bootstrap'); console.log(`[${phase}] phien B (tao TRUOC khi doi mk) con dung duoc?`, r.status);
    show('login mk cu sau doi', await call('C', 'POST', '/api/login', { username: 'admin', password: 'Ban-dau#2026' }));
    show('login mk moi', await call('C', 'POST', '/api/login', { username: 'admin', password: 'Moi-mat-khau#9' }));
    const sidA = jar.A;
    show('logout A', await call('A', 'POST', '/api/logout', {}));
    jar.A = sidA; r = await call('A', 'GET', '/api/bootstrap'); console.log(`[${phase}] dung lai cookie A sau logout`, r.status);
    // khoá khi sai nhiều lần
    for (let i = 1; i <= 6; i++) { const x = await call('D', 'POST', '/api/login', { username: 'admin', password: 'sai' + i }); console.log(`[${phase}] sai lan ${i}:`, x.status); }
    show('mk dung sau khi bi khoa (cung IP)', await call('D', 'POST', '/api/login', { username: 'admin', password: 'Moi-mat-khau#9' }));
    show('mk dung, IP khac', await call('E', 'POST', '/api/login', { username: 'admin', password: 'Moi-mat-khau#9' }, { ip: '198.51.100.7' }));
    show('sai tiep voi IP khac (doi IP de ne khoa)', await call('F', 'POST', '/api/login', { username: 'admin', password: 'sai' }, { ip: '198.51.100.8' }));
    // tệp
    for (const mb of [2.5, 19.9, 20.5, 23]) {
      const data = crypto.randomBytes(Math.round(mb * 1024 * 1024));
      const r2 = await call('C', 'POST', '/api/docs', { title: 'Tep ' + mb, category: 'khac', file_name: 't.pdf', file_mime: 'application/pdf', file_data: data.toString('base64') });
      let extra = '';
      if (r2.body.id) {
        const f = await core.handleRequest(app, new Request(B + `/api/docs/${r2.body.id}/file`, { headers: { cookie: jar.C } }));
        const buf = Buffer.from(await f.arrayBuffer()); extra = ' download=' + f.status + ' khop=' + buf.equals(data);
      }
      console.log(`[${phase}] upload ${mb} MB:`, r2.status, `(${r2.ms} ms)`, JSON.stringify(r2.body).slice(0, 80) + extra);
    }
    const db = new (require('node:sqlite').DatabaseSync)(dbfile);
    console.log(`[${phase}] file_chunks:`, JSON.stringify(db.prepare('SELECT stored_name, COUNT(*) n, MAX(length(data)) maxlen FROM file_chunks GROUP BY stored_name').all()));
    console.log(`[${phase}] sessions trong CSDL:`, db.prepare('SELECT COUNT(*) n FROM sessions').get().n);
  } else {
    // Mô phỏng Durable Object khởi động lại (tiến trình mới -> loginFails trong bộ nhớ bị xoá)
    for (let i = 1; i <= 5; i++) await call('D', 'POST', '/api/login', { username: 'admin', password: 'sai' + i });
    show('sau 5 lan sai (truoc khoi dong lai)', await call('D', 'POST', '/api/login', { username: 'admin', password: 'Moi-mat-khau#9' }));
  }
})().catch(e => { console.error('FAIL', e); process.exit(1); });
