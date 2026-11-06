const SRC = process.env.SRC; const { fakeStorage } = require(SRC + '/test/fake-do.js'); const core = require(SRC + '/worker/do-core.js');
const a = process.cpuUsage(); core.createApp(fakeStorage(process.env.DB), {ADMIN_PASSWORD: process.env.PW || ''}); const b = process.cpuUsage(a);
console.log('createApp khoi dong lai (CSDL da co)', process.env.PW ? 'CO bi mat ADMIN_PASSWORD (bam lai moi lan)' : 'khong co ADMIN_PASSWORD', 'CPU ms:', ((b.user + b.system) / 1000).toFixed(1));
