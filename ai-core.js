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
const { BY_NAME, WEB_SEARCH_TOKENS } = require('./ai-tools');

D.db.exec(`
CREATE TABLE IF NOT EXISTS ai_pending (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, tool TEXT NOT NULL, args TEXT NOT NULL, method TEXT NOT NULL, path TEXT NOT NULL, body TEXT,
  summary TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', result TEXT, created_at TEXT, expires_at INTEGER NOT NULL, done_at TEXT);
CREATE INDEX IF NOT EXISTS idx_ai_pending_user ON ai_pending(user_id, status);
CREATE TABLE IF NOT EXISTS ai_log (id INTEGER PRIMARY KEY, user_id INTEGER, at TEXT, day TEXT, provider TEXT, model TEXT, tokens_in INTEGER DEFAULT 0, tokens_out INTEGER DEFAULT 0, tools TEXT, status TEXT);
CREATE INDEX IF NOT EXISTS idx_ai_log_user_day ON ai_log(user_id, day);
CREATE TABLE IF NOT EXISTS ai_user_config (user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, provider TEXT NOT NULL DEFAULT 'anthropic', model TEXT DEFAULT '',
  key_enc TEXT, key_hint TEXT, effort TEXT DEFAULT '', assistant_name TEXT DEFAULT '', instructions TEXT DEFAULT '', updated_at TEXT);
`);
const KEY = require('./ai-key');
D.addCol('ai_user_config', 'stt_model', "TEXT DEFAULT ''"); // mô hình chuyển giọng nói (OpenAI), bổ sung 07/11/2026
D.addCol('ai_log', 'web_requests', 'INTEGER DEFAULT 0');
D.addCol('ai_log', 'tokens_cached', 'INTEGER DEFAULT 0');
/* web_requests: số lượt TÌM Internet (có phí theo lượt); web_fetches: số lượt ĐỌC TRANG (chỉ tính token). Tách từ so-1.15.1; trước đó web_requests gộp cả hai. */
D.addCol('ai_log', 'web_fetches', 'INTEGER DEFAULT 0');
/* Lịch sử trò chuyện với trợ lý (07/11/2026, theo yêu cầu của chủ sở hữu): mỗi người chỉ xem, xóa được cuộc trò chuyện của mình.
 * Thời hạn lưu do quản trị viên đặt (ai_keep_days, mặc định 180 ngày); quá hạn tự xóa. */
D.db.exec(`
CREATE TABLE IF NOT EXISTS ai_threads (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, title TEXT NOT NULL DEFAULT '', created_at TEXT, updated_at TEXT);
CREATE INDEX IF NOT EXISTS idx_ai_threads_user ON ai_threads(user_id, updated_at);
CREATE TABLE IF NOT EXISTS ai_thread_items (id INTEGER PRIMARY KEY, thread_id INTEGER NOT NULL, kind TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT);
CREATE INDEX IF NOT EXISTS idx_ai_thread_items ON ai_thread_items(thread_id, id);
`);
const THREAD_KINDS = ['user', 'bot', 'act', 'ui', 'err'], MAX_THREADS = 200, MAX_ITEMS = 400, MAX_ITEM_TEXT = 20000, DEFAULT_KEEP_DAYS = 180; // token đọc từ bộ đệm lời nhắc (nhà cung cấp tính giá khoảng 10%), tách khỏi tokens_in
D.addCol('ai_user_config', 'auto_brief', 'INTEGER DEFAULT 0'); // tự báo cáo tình hình khi vào hệ thống lần đầu mỗi ngày (lãnh đạo) // số lần tìm kiếm/đọc trang Internet trong lượt (nhà cung cấp tính phí riêng)
/* Mỗi người dùng một cấu hình AI riêng (nhà cung cấp, mô hình, khóa API, cách trả lời). Khóa chỉ lưu dạng mã hóa. */
const PROVIDERS = { anthropic: 'Anthropic (Claude)', openai: 'OpenAI', gemini: 'Google Gemini' };
const MODEL_RE = /^[A-Za-z0-9._:\/@-]{1,80}$/;
const orgKeyAvailable = () => !!(process.env.AI_API_KEY || process.env.SO_AI_ORG_KEY === '1');
const myConfig = uid => get('SELECT * FROM ai_user_config WHERE user_id=?', uid);
const orgProvider = () => String(process.env.SO_AI_ORG_PROVIDER || process.env.AI_PROVIDER || 'anthropic').toLowerCase();
/* Nhà cung cấp thực dùng cho người dùng: khóa cá nhân → khóa chung; Anthropic không nhận âm thanh nên giao diện dùng nhận dạng của trình duyệt */
const effectiveProvider = c => c && c.key_enc ? c.provider : orgKeyAvailable() ? orgProvider() : null;
const publicConfig = c => ({ stt_model: c ? c.stt_model || '' : '', provider: c ? c.provider : 'anthropic', model: c ? c.model : '', effort: c ? c.effort : '', assistant_name: c ? c.assistant_name : '', instructions: c ? c.instructions : '', has_key: !!(c && c.key_enc), key_hint: c && c.key_enc ? c.key_hint : '', updated_at: c ? c.updated_at : null, auto_brief: !!(c && c.auto_brief) });

const PENDING_MS = 10 * 60e3;
const DEFAULT_QUOTA = 200000;
/* Tìm kiếm Internet (Anthropic web_search/web_fetch): chỉ trong danh sách tên miền do quản trị viên duyệt.
 * Danh sách mặc định theo chủ sở hữu ngày 07/11/2026. Tên miền tự bao gồm tên miền con (quy tắc của Anthropic). */
const DEFAULT_WEB_DOMAINS = ['chinhphu.vn', 'vanban.chinhphu.vn', 'congbao.chinhphu.vn', 'muasamcong.mof.gov.vn', 'dauthau.asia'];
const DOMAIN_RE = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
/** Chuẩn hóa danh sách tên miền: bỏ http(s)://, dấu / cuối; chỉ nhận tên miền ASCII (chống giả mạo ký tự Unicode), không ký tự đại diện. */
function parseDomains(v) {
  const raw = (Array.isArray(v) ? v : String(v == null ? '' : v).split(/[\s,;]+/)).map(x => String(x).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '')).filter(Boolean);
  const bad = raw.filter(d => !DOMAIN_RE.test(d));
  return { domains: [...new Set(raw.filter(d => DOMAIN_RE.test(d)))], bad };
}
function aiSettings() {
  const s = {}; for (const r of all("SELECT key, value FROM settings WHERE key IN ('ai_enabled','ai_allow_pii','ai_daily_tokens','ai_web_search','ai_web_domains','ai_keep_days')")) s[r.key] = r.value;
  const web_domains = s.ai_web_domains == null ? DEFAULT_WEB_DOMAINS.slice() : parseDomains(s.ai_web_domains).domains;
  return { enabled: s.ai_enabled === '1', allow_pii: s.ai_allow_pii === '1', daily_tokens: Number(s.ai_daily_tokens || DEFAULT_QUOTA), web_search: s.ai_web_search === '1', web_domains, keep_days: Number(s.ai_keep_days || DEFAULT_KEEP_DAYS) };
}
/* Token tính hạn mức: token vào + token ra + 10% token đọc từ bộ đệm lời nhắc (làm tròn lên mỗi lượt) + WEB_SEARCH_TOKENS mỗi lượt tìm Internet.
 * Lý do: mô tả công cụ và lời nhắc hệ thống lặp lại ở mọi bước, được lưu bộ đệm và tính giá thấp; tính đủ thì lãnh đạo hết hạn mức rất sớm.
 * Lượt tìm Internet bị tính phí riêng ngoài token (ADR-010 mục 2D) nên quy ra token tương đương. */
const BILLED = `(tokens_in + tokens_out + (COALESCE(tokens_cached,0) + 9) / 10 + COALESCE(web_requests,0) * ${WEB_SEARCH_TOKENS})`;
const usedToday = uid => get(`SELECT COALESCE(SUM(${BILLED}),0) n FROM ai_log WHERE user_id=? AND day=?`, uid, D.today()).n;
/** Token AI của chính người dùng: hôm nay (so với hạn mức) và 30 ngày gần nhất theo ngày. Chỉ trả số liệu của người đang đăng nhập. */
function myUsage(uid) {
  const s = aiSettings(), from = D.addDays(D.today(), -29);
  const days = all(`SELECT day, COUNT(*) turns, COALESCE(SUM(tokens_in),0) tokens_in, COALESCE(SUM(tokens_out),0) tokens_out, COALESCE(SUM(tokens_cached),0) tokens_cached, COALESCE(SUM(${BILLED}),0) billed, COALESCE(SUM(web_requests),0) web_requests, COALESCE(SUM(web_fetches),0) web_fetches FROM ai_log WHERE user_id=? AND day>=? GROUP BY day ORDER BY day DESC`, uid, from);
  const today = days.find(d => d.day === D.today()) || { day: D.today(), turns: 0, tokens_in: 0, tokens_out: 0, tokens_cached: 0, billed: 0, web_requests: 0, web_fetches: 0 };
  const sum = k => days.reduce((a, d) => a + Number(d[k] || 0), 0);
  const own = get('SELECT key_enc FROM ai_user_config WHERE user_id=?', uid), exempt = !!(own && own.key_enc);
  return { quota: s.daily_tokens, quota_exempt: exempt, used_today: Number(today.billed), quota_left: exempt ? null : Math.max(0, s.daily_tokens - Number(today.billed)), cache_weight: 0.1, web_search_tokens: WEB_SEARCH_TOKENS, today,
    total_30d: { turns: sum('turns'), tokens_in: sum('tokens_in'), tokens_out: sum('tokens_out'), tokens_cached: sum('tokens_cached'), billed: sum('billed'), web_requests: sum('web_requests'), web_fetches: sum('web_fetches') }, days };
}

/* Mô tả để người dùng xác nhận: sinh từ tham số và dữ liệu trong CSDL, KHÔNG dùng lời văn của mô hình (chống prompt injection). */
const ctxNames = () => ({
  user: x => { const u = get('SELECT full_name FROM users WHERE id=?', Number(x)); return u ? u.full_name : `người dùng #${x}`; },
  project: x => { const p = get('SELECT name, kind FROM projects WHERE id=?', Number(x)); return p ? `${p.kind === 'team' ? 'phòng ban' : 'dự án'} «${p.name}»` : `dự án #${x}`; },
  task: x => { const t = get('SELECT title FROM tasks WHERE id=?', Number(x)); return t ? `công việc #${x} «${t.title}»` : `công việc #${x}`; },
  request: x => { const r = get('SELECT code, title FROM requests WHERE id=?', Number(x)); return r ? `đề xuất ${r.code} «${r.title}»` : `đề xuất #${x}`; },
  room: x => { const r = get('SELECT name FROM rooms WHERE id=?', Number(x)); return r ? `phòng ${r.name}` : `phòng #${x}`; }
});

/* Xóa cuộc trò chuyện quá thời hạn lưu và vượt số lượng tối đa của một người */
function purgeThreads(uid) {
  const cut = D.addDays(D.today(), -aiSettings().keep_days) + ' 00:00';
  const old = all('SELECT id FROM ai_threads WHERE user_id=? AND (updated_at < ? OR id NOT IN (SELECT id FROM ai_threads WHERE user_id=? ORDER BY updated_at DESC, id DESC LIMIT ?))', uid, cut, uid, MAX_THREADS - 1).map(r => r.id);
  if (old.length) D.tx(() => { for (const id of old) { run('DELETE FROM ai_thread_items WHERE thread_id=?', id); run('DELETE FROM ai_threads WHERE id=?', id); } });
}
/** Chuẩn hóa một mục lịch sử: chỉ nhận loại đã biết, chỉ các trường cần hiển thị lại, cắt độ dài */
function cleanItem(it) {
  if (!it || !THREAD_KINDS.includes(it.kind)) return null;
  const d = it.data || {}, t = v => String(v == null ? '' : v).slice(0, MAX_ITEM_TEXT);
  if (it.kind === 'act') return { kind: 'act', data: { id: parseInt(d.id, 10) || 0, label: t(d.label).slice(0, 200), summary: t(d.summary).slice(0, 2000) } };
  const out = { text: t(d.text) };
  if (it.kind === 'bot' && Array.isArray(d.src)) out.src = d.src.slice(0, 20).map(x => ({ url: String(x && x.url || '').slice(0, 500), title: String(x && x.title || '').slice(0, 200) })).filter(x => /^https?:\/\//i.test(x.url));
  return out.text || out.src ? { kind: it.kind, data: out } : null;
}

function register({ route, bad, forbid, notFound, str, int, secLog, clientIp, HttpError, internalCall }) {
  /* ---------- Lịch sử trò chuyện: chỉ chủ sở hữu (điều kiện user_id ở mọi truy vấn) ---------- */
  const ownThread = (user, id) => get('SELECT * FROM ai_threads WHERE id=? AND user_id=?', int(id), user.id) || notFound('Không tìm thấy cuộc trò chuyện.');
  route('GET', '/api/ai/threads', ({ user, query }) => {
    purgeThreads(user.id);
    const w = ['t.user_id=?'], a = [user.id];
    if (query.q) { w.push('t.title LIKE ?'); a.push('%' + str(query.q, 100) + '%'); }
    return all(`SELECT t.id, t.title, t.created_at, t.updated_at, (SELECT COUNT(*) FROM ai_thread_items i WHERE i.thread_id=t.id AND i.kind IN ('user','bot')) n
      FROM ai_threads t WHERE ${w.join(' AND ')} ORDER BY t.updated_at DESC, t.id DESC LIMIT 100`, ...a);
  });
  route('POST', '/api/ai/threads', ({ user, body }) => {
    if (!aiSettings().enabled) forbid('Trợ lý AI chưa được quản trị viên bật.');
    purgeThreads(user.id);
    const title = str(body.title, 120) || 'Cuộc trò chuyện ' + now().slice(0, 16);
    const id = Number(run('INSERT INTO ai_threads(user_id,title,created_at,updated_at) VALUES(?,?,?,?)', user.id, title, now(), now()).lastInsertRowid);
    return { id, title };
  });
  route('GET', '/api/ai/threads/:id', ({ user, params }) => {
    const t = ownThread(user, params.id);
    const items = all('SELECT id, kind, data, created_at FROM ai_thread_items WHERE thread_id=? ORDER BY id', t.id).map(r => { let d = {}; try { d = JSON.parse(r.data); } catch (e) {} return { id: r.id, kind: r.kind, data: d, created_at: r.created_at }; });
    /* Trạng thái thẻ đề nghị lấy từ ai_pending (của chính người dùng), không lưu cứng trong lịch sử */
    const ids = items.filter(i => i.kind === 'act' && i.data.id).map(i => i.data.id);
    if (ids.length) {
      const st = {}; for (const p of all(`SELECT id, status, result, expires_at FROM ai_pending WHERE user_id=? AND id IN (${ids.map(() => '?').join(',')})`, user.id, ...ids)) st[p.id] = p;
      for (const i of items) if (i.kind === 'act') { const p = st[i.data.id]; i.data.st = !p ? 'expired' : p.status === 'pending' && p.expires_at < Date.now() ? 'expired' : p.status; i.data.msg = p ? p.result || '' : ''; }
    }
    return { id: t.id, title: t.title, created_at: t.created_at, updated_at: t.updated_at, items };
  });
  route('POST', '/api/ai/threads/:id/items', ({ user, params, body }) => {
    const t = ownThread(user, params.id);
    const list = (Array.isArray(body.items) ? body.items : []).slice(0, 50).map(cleanItem).filter(Boolean);
    const have = get('SELECT COUNT(*) n FROM ai_thread_items WHERE thread_id=?', t.id).n;
    if (have + list.length > MAX_ITEMS) bad('Cuộc trò chuyện đã quá dài. Vui lòng bắt đầu cuộc trò chuyện mới.');
    D.tx(() => { for (const it of list) run('INSERT INTO ai_thread_items(thread_id,kind,data,created_at) VALUES(?,?,?,?)', t.id, it.kind, JSON.stringify(it.data), now()); run('UPDATE ai_threads SET updated_at=? WHERE id=?', now(), t.id); });
    return { ok: true, n: list.length };
  });
  route('PUT', '/api/ai/threads/:id', ({ user, params, body }) => {
    const t = ownThread(user, params.id), title = str(body.title, 120); if (!title) bad('Vui lòng nhập tiêu đề.');
    run('UPDATE ai_threads SET title=? WHERE id=?', title, t.id); return { id: t.id, title };
  });
  route('DELETE', '/api/ai/threads/:id', ({ user, params }) => {
    const t = ownThread(user, params.id);
    D.tx(() => { run('DELETE FROM ai_thread_items WHERE thread_id=?', t.id); run('DELETE FROM ai_threads WHERE id=?', t.id); });
    return { ok: true };
  });

  /* Mở lượt hội thoại. Gọi bằng cookie của người dùng (qua cổng AI), nên đã qua kiểm tra phiên, Origin, ép đổi mật khẩu. */
  route('POST', '/api/ai/turn', ({ user, req }) => {
    const s = aiSettings();
    if (!s.enabled) forbid('Trợ lý AI chưa được quản trị viên bật.');
    const c = myConfig(user.id);
    /* Khóa đã giải mã CHỈ trả cho cổng AI: bản Node gọi nội bộ (req.soInternal), Cloudflare có mã nội bộ x-so-ai-internal do Worker tính từ AI_KEY_SECRET */
    const internal = req.soInternal === true || KEY.safeEqual(req.headers['x-so-ai-internal'], KEY.internalToken());
    const personalKey = internal && c && c.key_enc ? KEY.decrypt(c.key_enc) : '';
    /* Người dùng dùng khóa API riêng tự trả phí cho nhà cung cấp nên được miễn hạn mức của đơn vị (quyết định 07/11/2026, ADR-010).
     * Chỉ miễn khi cổng AI thực sự nhận được khóa riêng (mã nội bộ đúng và giải mã được); nếu không, cổng sẽ rơi về khóa chung của đơn vị nên vẫn tính hạn mức. */
    const exempt = !!personalKey;
    const used = usedToday(user.id);
    if (!exempt && used >= s.daily_tokens) throw new HttpError(429, 'Bạn đã dùng hết hạn mức trợ lý AI hôm nay.');
    const dept = get('SELECT name FROM departments WHERE id=?', user.dept_id);
    const out = { user: { id: user.id, full_name: user.full_name, title: user.title, dept: dept ? dept.name : '' }, org_name: D.getSettings().org_name, today: D.today(), now: D.now().slice(0, 16), allow_pii: s.allow_pii, quota_left: exempt ? null : s.daily_tokens - used, quota_exempt: exempt,
      web: s.web_search && s.web_domains.length ? { domains: s.web_domains } : null,
      personal: c ? { provider: c.provider, model: c.model, stt_model: c.stt_model || '', effort: c.effort, assistant_name: c.assistant_name, instructions: c.instructions, has_key: !!c.key_enc } : null };
    if (personalKey) out.personal.key = personalKey;
    return out;
  });
  route('GET', '/api/ai/status', ({ user }) => {
    const s = aiSettings(), c = myConfig(user.id);
    return { enabled: s.enabled, allow_pii: s.allow_pii, quota_exempt: !!(c && c.key_enc), quota_left: c && c.key_enc ? null : Math.max(0, s.daily_tokens - usedToday(user.id)), configured: !!(c && c.key_enc) || orgKeyAvailable(), personal: !!(c && c.key_enc), org_key: orgKeyAvailable(), assistant_name: c && c.assistant_name || '', provider: effectiveProvider(c), audio_server: ['openai', 'gemini'].includes(effectiveProvider(c)),
      web_search: s.web_search && s.web_domains.length > 0 && effectiveProvider(c) === 'anthropic', web_domains: s.web_search ? s.web_domains : [], auto_brief: !!(c && c.auto_brief), keep_days: s.keep_days };
  });

  /* Cấu hình AI cá nhân: mỗi người tự chọn nhà cung cấp, mô hình, khóa API, tên và cách trả lời của trợ lý. */
  route('GET', '/api/ai/me', ({ user }) => ({ ...publicConfig(myConfig(user.id)), providers: PROVIDERS, org_key: orgKeyAvailable(), enabled: aiSettings().enabled, can_store_key: !!KEY.getSecret() }));
  route('GET', '/api/ai/me/usage', ({ user }) => myUsage(user.id));
  route('PUT', '/api/ai/me', ({ user, body, req }) => {
    const provider = String(body.provider || 'anthropic'); if (!PROVIDERS[provider]) bad('Nhà cung cấp AI không hợp lệ.');
    const model = str(body.model, 80); if (model && !MODEL_RE.test(model)) bad('Tên mô hình chỉ gồm chữ, số và các ký tự . _ - : / @.');
    if (!model && provider !== 'anthropic') bad('Vui lòng nhập tên mô hình theo tài liệu của nhà cung cấp.');
    const effort = ['', 'low', 'medium', 'high'].includes(body.effort) ? body.effort : '';
    const stt = str(body.stt_model, 80); if (stt && !MODEL_RE.test(stt)) bad('Tên mô hình chuyển giọng nói không hợp lệ.');
    const old = myConfig(user.id);
    let keyEnc = old ? old.key_enc : null, keyHint = old ? old.key_hint : null, keyEvent = '';
    if (body.clear_key) { keyEnc = null; keyHint = null; keyEvent = 'ai_key_clear'; }
    else if (typeof body.api_key === 'string' && body.api_key.trim()) {
      const k = body.api_key.trim(); if (k.length < 10 || k.length > 400 || /\s/.test(k)) bad('Khóa API không hợp lệ.');
      try { keyEnc = KEY.encrypt(k); } catch (e) { throw new HttpError(503, 'Máy chủ chưa khai báo bí mật AI_KEY_SECRET để mã hóa khóa API. Vui lòng liên hệ quản trị hệ thống.'); }
      keyHint = KEY.hint(k); keyEvent = 'ai_key_set';
    }
    if (old && old.provider !== provider && keyEnc && !keyEvent) bad('Đổi nhà cung cấp thì cần nhập khóa API của nhà cung cấp mới (hoặc xóa khóa cũ).');
    run(`INSERT INTO ai_user_config(user_id,provider,model,key_enc,key_hint,effort,assistant_name,instructions,stt_model,auto_brief,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET provider=excluded.provider, model=excluded.model, key_enc=excluded.key_enc, key_hint=excluded.key_hint, effort=excluded.effort, assistant_name=excluded.assistant_name, instructions=excluded.instructions, stt_model=excluded.stt_model, auto_brief=excluded.auto_brief, updated_at=excluded.updated_at`,
      user.id, provider, model, keyEnc, keyHint, effort, str(body.assistant_name, 40), str(body.instructions, 1000), stt, body.auto_brief ? 1 : 0, now());
    if (keyEvent) secLog(keyEvent, { user_id: user.id, username: user.username, ip: clientIp(req), detail: keyEvent === 'ai_key_set' ? `${provider} ${keyHint}` : provider }); // không ghi khóa
    return { ...publicConfig(myConfig(user.id)), providers: PROVIDERS, org_key: orgKeyAvailable(), enabled: aiSettings().enabled, can_store_key: !!KEY.getSecret() };
  });
  route('POST', '/api/ai/usage', ({ user, body }) => {
    const n = v => Math.max(0, Math.min(5e6, int(v)));
    run('INSERT INTO ai_log(user_id,at,day,provider,model,tokens_in,tokens_out,tokens_cached,tools,status,web_requests,web_fetches) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)', user.id, now(), D.today(), str(body.provider, 30), str(body.model, 80), n(body.tokens_in), n(body.tokens_out), n(body.tokens_cached), str((Array.isArray(body.tools) ? body.tools : []).join(','), 500), str(body.status, 30), Math.max(0, Math.min(1000, int(body.web_requests))), Math.max(0, Math.min(1000, int(body.web_fetches))));
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
    const usage = all('SELECT l.user_id, u.full_name, SUM(l.tokens_in) tokens_in, SUM(l.tokens_out) tokens_out, COALESCE(SUM(l.tokens_cached),0) tokens_cached, SUM' + BILLED.replace(/tokens_|web_requests/g, m => 'l.' + m) + ' billed, COUNT(*) turns, COALESCE(SUM(l.web_requests),0) web_requests, COALESCE(SUM(l.web_fetches),0) web_fetches FROM ai_log l LEFT JOIN users u ON u.id=l.user_id WHERE l.day>=? GROUP BY l.user_id ORDER BY billed DESC LIMIT 50', D.addDays(D.today(), -30));
    return { ...s, usage_30d: usage };
  }, { admin: true });
  route('PUT', '/api/admin/ai-settings', ({ user, body, req }) => {
    const q = int(body.daily_tokens); if (q < 1000 || q > 5e6) bad('Hạn mức token mỗi người mỗi ngày phải từ 1.000 đến 5.000.000.');
    const before = aiSettings();
    let domains = null;
    if (body.web_domains !== undefined) {
      const p = parseDomains(body.web_domains);
      if (p.bad.length) bad('Tên miền không hợp lệ: ' + p.bad.slice(0, 5).join(', ') + '. Chỉ nhập tên miền (ví dụ chinhphu.vn), không có ký tự đại diện hay đường dẫn.');
      if (p.domains.length > 30) bad('Tối đa 30 tên miền.');
      domains = p.domains;
    }
    const web = body.web_search !== undefined ? !!body.web_search : before.web_search;
    if (web && !(domains || before.web_domains).length) bad('Cần ít nhất một tên miền được phép khi bật tìm kiếm Internet.');
    D.setSetting('ai_enabled', body.enabled ? '1' : '0'); D.setSetting('ai_allow_pii', body.allow_pii ? '1' : '0'); D.setSetting('ai_daily_tokens', q);
    D.setSetting('ai_web_search', web ? '1' : '0');
    if (domains) D.setSetting('ai_web_domains', domains.join('\n'));
    if (body.keep_days !== undefined) { const k = int(body.keep_days); if (k < 1 || k > 3650) bad('Thời hạn lưu lịch sử trò chuyện phải từ 1 đến 3.650 ngày.'); D.setSetting('ai_keep_days', k); }
    const after = aiSettings();
    secLog('ai_settings', { user_id: user.id, username: user.username, ip: clientIp(req), detail: `bật: ${before.enabled}→${after.enabled}; dữ liệu cá nhân: ${before.allow_pii}→${after.allow_pii}; hạn mức: ${before.daily_tokens}→${after.daily_tokens}; Internet: ${before.web_search}→${after.web_search}; lưu lịch sử: ${before.keep_days}→${after.keep_days} ngày; tên miền: ${after.web_domains.join(' ')}`.slice(0, 1000) });
    return after;
  }, { admin: true });
}

module.exports = { register, aiSettings, PROVIDERS, parseDomains, DEFAULT_WEB_DOMAINS };
