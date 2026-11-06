// Mô phỏng ctx.storage của Durable Object bằng node:sqlite để kiểm thử worker/do-core.js
const { DatabaseSync } = require('node:sqlite');
function fakeStorage(file) {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys=ON');
  const conv = v => v instanceof ArrayBuffer ? new Uint8Array(v) : v;
  const out = r => { for (const k in r) if (r[k] instanceof Uint8Array) r[k] = r[k].buffer.slice(r[k].byteOffset, r[k].byteOffset + r[k].byteLength); return r; };
  let inTx = false;
  const st0 = { dead: false };
  const sql = {
    exec(q, ...b) {
      if (st0.dead) throw new Error('Cannot perform I/O on behalf of a different Durable Object (mô phỏng)');
      if (/^\s*(BEGIN|COMMIT|ROLLBACK|SAVEPOINT)/i.test(q)) throw new Error('DO: transaction statements not allowed');
      if (/^\s*PRAGMA\s+(journal_mode|busy_timeout)/i.test(q)) throw new Error('DO: pragma not allowed ' + q);
      const stmts = q.split(/;\s*(?:\n|$)/).map(s => s.trim()).filter(Boolean);
      if (stmts.length > 1) { db.exec(stmts.slice(0, -1).join(';\n')); q = stmts.at(-1); }
      const st = db.prepare(q);
      let rows = [], written = 0;
      if (st.columns().length) rows = st.all(...b.map(conv)).map(out); else written = Number(st.run(...b.map(conv)).changes);
      let i = 0;
      return { toArray: () => rows.slice(i), one: () => { if (rows.length !== 1) throw new Error('one(): ' + rows.length); return rows[0]; }, rowsWritten: written, rowsRead: rows.length };
    }
  };
  return { sql, kill() { st0.dead = true; }, transactionSync(fn) { if (st0.dead) throw new Error('Cannot perform I/O on behalf of a different Durable Object (mô phỏng)'); if (inTx) return fn(); inTx = true; db.exec('BEGIN'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } finally { inTx = false; } } };
}
module.exports = { fakeStorage };
