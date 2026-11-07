'use strict';
/**
 * Trợ lý AI – phần chạy trong máy chủ ứng dụng (Durable Object trên Cloudflare, hoặc tiến trình Node) (ADR-010).
 * Không gọi nhà cung cấp AI ở đây; khóa API chỉ nằm ở cổng AI (ai.js, chạy tại Worker).
 * Nhiệm vụ:
 *  - cấu hình (bật/tắt, cho phép dữ liệu cá nhân, hạn mức token/người/ngày) – mặc định TẮT;
 *  - mở lượt hội thoại: xác thực người dùng, kiểm tra bật và hạn mức (POST /api/ai/turn);
 *  - ghi nhận token đã dùng (POST /api/ai/usage) vào ai_log (không lưu nội dung hội thoại);
 *  - thao tác ghi chờ xác nhận (ai_pending): tạo, liệt kê, xác nhận (thực hiện qua API thường của người dùng), hủy.
 */
const D = require('./db');
const { all, get, run, now } = D;
const { BY_NAME } = require('./ai-tools');

D.db.exec(`
CREATE TABLE IF NOT EXISTS ai_pending (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, tool TEXT NOT NULL, args TEXT NOT NULL, method TEXT NOT NULL, path TEXT NOT NULL, body TEXT,
  summary TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', result TEXT, created_at TEXT, expires_at INTEGER NOT NULL, done_at TEXT);
CREATE INDEX IF NOT EXISTS idx_ai_pending_user ON ai_pending(user_id, status);
CREATE TABLE IF NOT EXISTS ai_log (id INTEGER PRIMARY KEY, user_id INTEGER, at TEXT, day TEXT, provider TEXT, model TEXT, tokens_in INTEGER DEFAULT 0, tokens_out INTEGER DEFAULT 0, tools TEXT, status TEXT);
CREATE INDEX IF NOT EXISTS idx_ai_log_user_day ON ai_log(user_id, day);
`);

const PENDING_MS = 10 * 60e3;
const DEFAULT_QUOTA = 200000;
function aiSettings() {
  const s = {}; for (const r of all("SELECT key, value FROM settings WHERE key IN ('ai_enabled','ai_allow_pii','ai_daily_tokens')")) s[r.key] = r.value;
  return { enabled: s.ai_enabled === '1', allow_pii: s.ai_allow_pii === '1', daily_tokens: Number(s.ai_daily_tokens || DEFAULT_QUOTA) };
}
const usedToday = uid => get('SELECT COALESCE(SUM(tokens_in + tokens_out),0) n FROM ai_log WHERE user_id=? AND day=?', uid, D.today()).n;

/* Mô tả để người dùng xác nhận: sinh từ tham số và dữ liệu trong CSDL, KHÔNG dùng lời văn của mô hình (chống prompt injection). */
const ctxNames = () => ({
  user: x => { const u = get('SELECT full_name FROM users WHERE id=?', Number(x)); return u ? u.full_name : `người dùng #${x}`; },
  project: x => { const p = get('SELECT name, kind FROM projects WHERE id=?', Number(x)); return p ? `${p.kind === 'team' ? 'phòng ban' : 'dự án'} «${p.name}»` : `dự án #${x}`; },
  task: x => { const t = get('SELECT title FROM tasks WHERE id=?', Number(x)); return t ? `công việc #${x} «${t.title}»` : `công việc #${x}`; },
  request: x => { const r = get('SELECT code, title FROM requests WHERE id=?', Number(x)); return r ? `đề xuất ${r.code} «${r.title}»` : `đề xuất #${x}`; },
  room: x => { const r = get('SELECT name FROM rooms WHERE id=?', Number(x)); return r ? `phòng ${r.name}` : `phòng #${x}`; }
});

function register({ route, bad, forbid, notFound, str, int, secLog, clientIp, HttpError, internalCall }) {
  /* Mở lượt hội thoại. Gọi bằng cookie của người dùng (qua cổng AI), nên đã qua kiểm tra phiên, Origin, ép đổi mật khẩu. */
  route('POST', '/api/ai/turn', ({ user }) => {
    const s = aiSettings();
    if (!s.enabled) forbid('Trợ lý AI chưa được quản trị viên bật.');
    const used = usedToday(user.id);
    if (used >= s.daily_tokens) throw new HttpError(429, 'Bạn đã dùng hết hạn mức trợ lý AI hôm nay.');
    const dept = get('SELECT name FROM departments WHERE id=?', user.dept_id);
    return { user: { id: user.id, full_name: user.full_name, title: user.title, dept: dept ? dept.name : '' }, org_name: D.getSettings().org_name, today: D.today(), now: D.now().slice(0, 16), allow_pii: s.allow_pii, quota_left: s.daily_tokens - used };
  });
  route('GET', '/api/ai/status', ({ user }) => { const s = aiSettings(); return { enabled: s.enabled, allow_pii: s.allow_pii, quota_left: Math.max(0, s.daily_tokens - usedToday(user.id)) }; });
  route('POST', '/api/ai/usage', ({ user, body }) => {
    const n = v => Math.max(0, Math.min(5e6, int(v)));
    run('INSERT INTO ai_log(user_id,at,day,provider,model,tokens_in,tokens_out,tools,status) VALUES(?,?,?,?,?,?,?,?,?)', user.id, now(), D.today(), str(body.provider, 30), str(body.model, 80), n(body.tokens_in), n(body.tokens_out), str((Array.isArray(body.tools) ? body.tools : []).join(','), 500), str(body.status, 30));
    return { ok: true };
  });

  /* Thao tác ghi chờ xác nhận. Đường dẫn và thân yêu cầu được dựng lại từ danh mục công cụ, không nhận đường dẫn tùy ý. */
  route('POST', '/api/ai/pending', ({ user, body }) => {
    if (!aiSettings().enabled) forbid('Trợ lý AI chưa được quản trị viên bật.');
    const t = BY_NAME[body.tool]; if (!t || t.risk !== 'write') bad('Công cụ không hợp lệ.');
    const args = body.args && typeof body.args === 'object' ? body.args : {};
    let r, summary; try { r = t.req(args); summary = t.summary(args, ctxNames()); } catch (e) { bad(e.message || 'Tham số không hợp lệ.'); }
    run("UPDATE ai_pending SET status='expired' WHERE user_id=? AND status='pending' AND expires_at<?", user.id, Date.now());
    if (get("SELECT COUNT(*) n FROM ai_pending WHERE user_id=? AND status='pending'", user.id).n >= 20) bad('Có quá nhiều thao tác đang chờ xác nhận. Vui lòng xử lý bớt.');
    const id = Number(run('INSERT INTO ai_pending(user_id,tool,args,method,path,body,summary,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?)',
      user.id, t.name, JSON.stringify(args).slice(0, 20000), r.method, r.path, r.body ? JSON.stringify(r.body).slice(0, 20000) : null, summary.slice(0, 1000), now(), Date.now() + PENDING_MS).lastInsertRowid);
    return { id, tool: t.name, label: t.label, summary, expires_in: PENDING_MS / 1000 };
  });
  route('GET', '/api/ai/pending', ({ user }) =>
    all("SELECT id, tool, summary, created_at FROM ai_pending WHERE user_id=? AND status='pending' AND expires_at>=? ORDER BY id DESC LIMIT 20", user.id, Date.now()));
  route('POST', '/api/ai/pending/:id/cancel', ({ user, params }) => {
    const p = get('SELECT * FROM ai_pending WHERE id=? AND user_id=?', int(params.id), user.id) || notFound('Không tìm thấy thao tác chờ xác nhận.');
    if (p.status !== 'pending') throw new HttpError(409, 'Thao tác này đã được xử lý.');
    run("UPDATE ai_pending SET status='cancelled', done_at=? WHERE id=?", now(), p.id); return { ok: true, status: 'cancelled' };
  });
  route('POST', '/api/ai/pending/:id/confirm', async ({ user, params, req }) => {
    const p = get('SELECT * FROM ai_pending WHERE id=? AND user_id=?', int(params.id), user.id) || notFound('Không tìm thấy thao tác chờ xác nhận.');
    if (p.status !== 'pending') throw new HttpError(409, 'Thao tác này đã được xử lý.');
    if (p.expires_at < Date.now()) { run("UPDATE ai_pending SET status='expired' WHERE id=?", p.id); throw new HttpError(410, 'Đề nghị đã hết hạn (10 phút). Vui lòng yêu cầu trợ lý lập lại.'); }
    /* Đánh dấu trước khi thực hiện để không thể xác nhận hai lần */
    const claim = run("UPDATE ai_pending SET status='running' WHERE id=? AND status='pending'", p.id);
    if (!Number(claim.changes)) throw new HttpError(409, 'Thao tác này đã được xử lý.');
    const r = await internalCall(req, p.method, p.path, p.body ? JSON.parse(p.body) : undefined);
    const okRes = r.status >= 200 && r.status < 300;
    const msg = okRes ? 'Đã thực hiện.' : String((r.json && r.json.error) || ('Lỗi ' + r.status)).slice(0, 300);
    run('UPDATE ai_pending SET status=?, result=?, done_at=? WHERE id=?', okRes ? 'done' : 'failed', msg, now(), p.id);
    secLog('ai_action', { user_id: user.id, username: user.username, ip: clientIp(req), detail: `${p.tool} #${p.id} ${okRes ? 'thành công' : 'lỗi ' + r.status}: ${p.summary}` });
    const ref = okRes && r.json && (r.json.id || (Array.isArray(r.json.ids) && r.json.ids[0])) || null;
    return { ok: okRes, status: okRes ? 'done' : 'failed', message: msg, http_status: r.status, ref, tool: p.tool };
  });

  /* Quản trị: cấu hình trợ lý AI và thống kê sử dụng */
  route('GET', '/api/admin/ai-settings', () => {
    const s = aiSettings();
    const usage = all('SELECT l.user_id, u.full_name, SUM(l.tokens_in) tokens_in, SUM(l.tokens_out) tokens_out, COUNT(*) turns FROM ai_log l LEFT JOIN users u ON u.id=l.user_id WHERE l.day>=? GROUP BY l.user_id ORDER BY SUM(l.tokens_in+l.tokens_out) DESC LIMIT 50', D.addDays(D.today(), -30));
    return { ...s, usage_30d: usage };
  }, { admin: true });
  route('PUT', '/api/admin/ai-settings', ({ user, body, req }) => {
    const q = int(body.daily_tokens); if (q < 1000 || q > 5e6) bad('Hạn mức token mỗi người mỗi ngày phải từ 1.000 đến 5.000.000.');
    const before = aiSettings();
    D.setSetting('ai_enabled', body.enabled ? '1' : '0'); D.setSetting('ai_allow_pii', body.allow_pii ? '1' : '0'); D.setSetting('ai_daily_tokens', q);
    const after = aiSettings();
    secLog('ai_settings', { user_id: user.id, username: user.username, ip: clientIp(req), detail: `bật: ${before.enabled}→${after.enabled}; dữ liệu cá nhân: ${before.allow_pii}→${after.allow_pii}; hạn mức: ${before.daily_tokens}→${after.daily_tokens}` });
    return after;
  }, { admin: true });
}

module.exports = { register, aiSettings };
