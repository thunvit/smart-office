const crypto = require('crypto');
const cpu = f => { const a = process.cpuUsage(); f(); const b = process.cpuUsage(a); return ((b.user + b.system) / 1000).toFixed(1); };
const s = crypto.randomBytes(16);
const t = []; for (let i = 0; i < 10; i++) t.push(+cpu(() => crypto.scryptSync('Mat-khau#1', s, 64)));
console.log('scryptSync N=16384,r=8,p=1 (mac dinh Node) CPU ms/lan: min', Math.min(...t), 'max', Math.max(...t), 'tb', (t.reduce((a, b) => a + b) / t.length).toFixed(1));
const SRC = process.env.SRC; const { fakeStorage } = require(SRC + '/test/fake-do.js'); const core = require(SRC + '/worker/do-core.js');
const fs = require('fs'); try { fs.unlinkSync(process.env.DB); } catch (e) {}
console.log('createApp lan dau (CSDL trong, tao luoc do + seedEmpty co 1 lan scrypt) CPU ms:', cpu(() => core.createApp(fakeStorage(process.env.DB), {})));
