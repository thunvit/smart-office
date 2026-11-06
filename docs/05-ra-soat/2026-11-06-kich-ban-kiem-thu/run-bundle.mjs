// Chạy bản đóng gói esbuild của worker/index.js dưới Node, mô phỏng 2 phiên bản Durable Object trong cùng isolate
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
globalThis.require = require;
const { fakeStorage } = require(process.env.SRC + '/test/fake-do.js');
const crypto = require('crypto');
const salt = crypto.randomBytes(16);
const HASH = 'scrypt$' + salt.toString('hex') + '$' + crypto.scryptSync('Ban-dau#2026', salt, 64).toString('hex');
const env = { ADMIN_PASSWORD_HASH: HASH, SO_DEBUG: '1' };
const mod = await import('./worker-node.mjs');
const B = 'https://smart-office.example.workers.dev';
let cookie = '';
const call = async (obj, method, p, body) => {
  const h = { 'content-type': 'application/json', origin: B, host: 'smart-office.example.workers.dev', 'cf-connecting-ip': '203.0.113.9' };
  if (cookie) h.cookie = cookie;
  try {
    const r = await obj.fetch(new Request(B + p, { method, headers: h, body: body ? JSON.stringify(body) : undefined }));
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    return r.status + ' ' + (await r.text()).slice(0, 220).replace(/\n/g, ' | ');
  } catch (e) { return 'NEM NGOAI LE ra khoi DO.fetch: ' + e.message; }
};
// Phiên bản DO thứ nhất
const st1 = fakeStorage(process.env.DB1);
const do1 = new mod.SmartOffice({ storage: st1 }, env);
console.log('DO#1 login        ', await call(do1, 'POST', '/api/login', { username: 'admin', password: 'Ban-dau#2026' }));
console.log('DO#1 doi mat khau ', await call(do1, 'PUT', '/api/me/password', { old_password: 'Ban-dau#2026', new_password: 'Moi-mat-khau#9' }));
console.log('DO#1 bootstrap    ', await call(do1, 'GET', '/api/bootstrap'));
// Giả lập: runtime tạo lại đối tượng DO (ctx.storage MỚI) nhưng giữ nguyên isolate (biến toàn cục APP, db.js còn nguyên)
const st2 = fakeStorage(process.env.DB2);
const do2 = new mod.SmartOffice({ storage: st2 }, env);
console.log('DO#2 bootstrap (storage moi, isolate cu)', await call(do2, 'GET', '/api/bootstrap'));
// storage cũ bị vô hiệu (mô phỏng bằng cách thay sql.exec ném lỗi như khi đối tượng DO cũ đã bị huỷ)
st1.sql.exec = () => { throw new Error('Durable Object storage is no longer valid (mo phong)'); };
console.log('DO#2 bootstrap sau khi storage cu bi huy', await call(do2, 'GET', '/api/bootstrap'));
console.log('DO#2 login                              ', await call(do2, 'POST', '/api/login', { username: 'admin', password: 'Moi-mat-khau#9' }));
