// Kiểm tra applyAdminSecret ghi đè mật khẩu admin sau khi quản trị viên khác đặt lại mật khẩu cho 'admin'
const SRC = process.env.SRC; const { fakeStorage } = require(SRC + '/test/fake-do.js'); const core = require(SRC + '/worker/do-core.js');
const crypto = require('crypto'); const salt = Buffer.alloc(16, 1);
const HASH = 'scrypt$' + salt.toString('hex') + '$' + crypto.scryptSync('Ban-dau#2026', salt, 64).toString('hex');
const [db, phase] = process.argv.slice(2); const app = core.createApp(fakeStorage(db), { ADMIN_PASSWORD_HASH: HASH });
const B = 'https://x.workers.dev'; const jar = {};
const call = async (w, m, p, body) => { const h = { 'content-type': 'application/json', origin: B, host: 'x.workers.dev' }; if (jar[w]) h.cookie = jar[w];
  const r = await core.handleRequest(app, new Request(B + p, { method: m, headers: h, body: body ? JSON.stringify(body) : undefined }));
  const sc = r.headers.get('set-cookie'); if (sc) jar[w] = sc.split(';')[0]; return r.status + ' ' + (await r.text()).slice(0, 90); };
(async () => {
  if (phase === '1') {
    console.log('[1] admin login mk ban dau     ', await call('a', 'POST', '/api/login', { username: 'admin', password: 'Ban-dau#2026' }));
    console.log('[1] admin doi mk               ', await call('a', 'PUT', '/api/me/password', { old_password: 'Ban-dau#2026', new_password: 'Admin-rieng#77' }));
    console.log('[1] tao qt2 (admin)            ', await call('a', 'POST', '/api/admin/users', { username: 'qt2', full_name: 'QT 2', dept_id: 1, role: 'admin', password: 'Qt2-tam#1234' }));
    console.log('[1] qt2 login                  ', await call('q', 'POST', '/api/login', { username: 'qt2', password: 'Qt2-tam#1234' }));
    console.log('[1] qt2 dat lai mk cho admin   ', await call('q', 'PUT', '/api/admin/users/1', { password: 'Dat-lai#5555' }));
  } else {
    console.log('[2 - sau khoi dong lai] login admin bang mk qt2 vua dat', await call('x', 'POST', '/api/login', { username: 'admin', password: 'Dat-lai#5555' }));
    console.log('[2 - sau khoi dong lai] login admin bang MK BAN DAU    ', await call('y', 'POST', '/api/login', { username: 'admin', password: 'Ban-dau#2026' }));
  }
})();
