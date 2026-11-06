import { createRequire } from 'node:module';
const require = createRequire(import.meta.url); globalThis.require = require;
const { fakeStorage } = require(process.env.SRC + '/test/fake-do.js');
const mod = await import(process.argv[2]);
const st = fakeStorage(process.env.DB1);
const orig = st.sql.exec; let failOnce = true;
// Lỗi tạm thời một lần khi biz.js tạo bảng file_chunks (giữa quá trình require('../server.js'))
st.sql.exec = (q, ...b) => { if (failOnce && /file_chunks/.test(q)) { failOnce = false; throw new Error('loi tam thoi (mo phong)'); } return orig(q, ...b); };
const B = 'https://x.workers.dev';
const DOi = new mod.SmartOffice({ storage: st }, { SO_DEBUG: '1' });
for (let i = 1; i <= 3; i++) {
  try { const r = await DOi.fetch(new Request(B + '/api/bootstrap')); console.log('lan', i, r.status, (await r.text()).slice(0, 110)); }
  catch (e) { console.log('lan', i, 'NEM NGOAI LE:', e.message); }
}
