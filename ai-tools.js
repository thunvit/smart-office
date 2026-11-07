'use strict';
/**
 * Danh mục công cụ của trợ lý AI (ADR-010). Mỗi công cụ ánh xạ sang MỘT API sẵn có của SmartOffice và được gọi
 * dưới danh nghĩa người dùng (cookie phiên), nên đi qua đúng kiểm tra phân quyền hiện hành.
 *  - risk 'read' : gọi ngay, kết quả (đã che dữ liệu cá nhân, rút gọn) trả lại cho mô hình.
 *  - risk 'write': KHÔNG gọi ngay; máy chủ tạo bản ghi chờ xác nhận (ai_pending), người dùng bấm "Xác nhận" mới thực hiện.
 * Mô-đun thuần: không I/O, dùng chung cho Worker (cổng AI) và Durable Object/Node (xác nhận thao tác ghi).
 * Không thêm công cụ xóa dữ liệu, tiền lương, quản trị, sao lưu, khôi phục.
 */
const S = (description, extra = {}) => ({ type: 'string', description, ...extra });
const I = description => ({ type: 'integer', description });
const obj = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const DATE = 'Ngày dạng YYYY-MM-DD';
const DT = 'Thời điểm dạng "YYYY-MM-DD HH:MM" theo giờ Việt Nam';
const qs = o => { const u = new URLSearchParams(); for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== '') u.set(k, String(v)); const s = u.toString(); return s ? '?' + s : ''; };
const id = v => { const n = parseInt(v, 10); if (!(n > 0)) throw new Error('Thiếu hoặc sai mã số.'); return n; };
const fmtD = s => s ? String(s).slice(0, 10).split('-').reverse().join('/') : '';
const RTYPES = { thanhtoan: 'Đề nghị thanh toán', mua: 'Đề xuất mua sắm', tamung: 'Đề nghị tạm ứng', nghiphep: 'Đơn xin nghỉ phép', tangca: 'Đăng ký làm thêm giờ', congtac: 'Đề nghị đi công tác', giaitrinh: 'Giải trình chấm công', khac: 'Tờ trình khác' };
const TST = { todo: 'Cần làm', doing: 'Đang làm', done: 'Hoàn thành', failed: 'Thất bại' };
const PRIO = { cao: 'Cao', tb: 'Trung bình', thap: 'Thấp' };

const TOOLS = [
  /* ---------- Chỉ đọc ---------- */
  { name: 'xem_tong_quan', risk: 'read', label: 'Xem tổng quan',
    description: 'Tổng quan của người dùng hiện tại: công việc đang mở của tôi, đề xuất chờ tôi duyệt, hồ sơ quy trình chờ tôi xử lý, tải công việc theo người, hoạt động gần đây. Dùng khi người dùng hỏi "hôm nay tôi cần làm gì", "có gì mới".',
    input: obj({}), req: () => ({ method: 'GET', path: '/api/dashboard' }) },
  { name: 'danh_ba', risk: 'read', label: 'Tra danh bạ',
    description: 'Danh sách người dùng (mã, họ tên, chức danh, mã phòng ban), phòng ban và dự án mà người dùng hiện tại xem được. Dùng để tìm mã người, mã dự án trước khi giao việc, mời họp.',
    input: obj({}), req: () => ({ method: 'GET', path: '/api/bootstrap' }),
    out: r => ({ toi: r.me && { id: r.me.id, full_name: r.me.full_name, title: r.me.title, dept_id: r.me.dept_id }, users: (r.users || []).filter(u => u.active).map(u => ({ id: u.id, full_name: u.full_name, title: u.title, dept_id: u.dept_id })), departments: r.departments, projects: r.projects }) },
  { name: 'tim_cong_viec', risk: 'read', label: 'Tìm công việc',
    description: 'Tìm công việc. scope: assigned (giao cho tôi, mặc định), created (tôi giao cho người khác), following (tôi theo dõi), review (chờ tôi đánh giá), staff (của nhân viên tôi quản lý). status: open (chưa xong), late (quá hạn), todo, doing, review, done, failed.',
    input: obj({ scope: S('Phạm vi', { enum: ['assigned', 'created', 'following', 'review', 'staff'] }), status: S('Trạng thái', { enum: ['open', 'late', 'todo', 'doing', 'review', 'done', 'failed'] }), q: S('Từ khóa trong tên công việc') }),
    req: a => ({ method: 'GET', path: '/api/tasks' + qs({ scope: a.scope || 'assigned', status: a.status, q: a.q, limit: 50 }) }) },
  { name: 'chi_tiet_cong_viec', risk: 'read', label: 'Xem chi tiết công việc',
    description: 'Chi tiết một công việc theo mã: mô tả, người thực hiện, hạn, tiến độ, việc con, trao đổi.',
    input: obj({ task_id: I('Mã công việc') }, ['task_id']), req: a => ({ method: 'GET', path: '/api/tasks/' + id(a.task_id) }) },
  { name: 'cong_viec_du_an', risk: 'read', label: 'Xem công việc của dự án',
    description: 'Danh sách công việc của một dự án/phòng ban. status như tim_cong_viec.',
    input: obj({ project_id: I('Mã dự án'), status: S('Trạng thái', { enum: ['open', 'late', 'todo', 'doing', 'review', 'done', 'failed'] }), q: S('Từ khóa') }, ['project_id']),
    req: a => ({ method: 'GET', path: `/api/projects/${id(a.project_id)}/tasks` + qs({ status: a.status, q: a.q, limit: 50 }) }) },
  { name: 'de_xuat', risk: 'read', label: 'Tra cứu đề xuất',
    description: 'Danh sách đề xuất (phê duyệt). box: inbox (chờ tôi duyệt), sent (tôi gửi), done (tôi đã xử lý), all. type: thanhtoan, mua, tamung, nghiphep, tangca, congtac, giaitrinh, khac.',
    input: obj({ box: S('Hộp đề xuất', { enum: ['inbox', 'sent', 'done', 'all'] }), type: S('Loại đề xuất', { enum: Object.keys(RTYPES) }) }),
    req: a => ({ method: 'GET', path: '/api/requests' + qs({ box: a.box || 'inbox', type: a.type }) }) },
  { name: 'chi_tiet_de_xuat', risk: 'read', label: 'Xem chi tiết đề xuất',
    description: 'Chi tiết một đề xuất: nội dung, số tiền, các bước duyệt, ai đang chờ xử lý.',
    input: obj({ request_id: I('Mã đề xuất') }, ['request_id']), req: a => ({ method: 'GET', path: '/api/requests/' + id(a.request_id) }) },
  { name: 'lich_hop', risk: 'read', label: 'Xem lịch họp',
    description: 'Lịch họp trong khoảng ngày (mặc định 7 ngày từ hôm nay). mine=true chỉ lấy cuộc họp tôi chủ trì hoặc được mời.',
    input: obj({ from: S(DATE), to: S(DATE), mine: { type: 'boolean', description: 'Chỉ cuộc họp của tôi' } }),
    req: a => ({ method: 'GET', path: '/api/meetings' + qs({ from: a.from, to: a.to, mine: a.mine === false ? '' : '1' }) }) },
  { name: 'phong_hop', risk: 'read', label: 'Xem danh sách phòng họp',
    description: 'Danh sách phòng họp (mã, tên, sức chứa).', input: obj({}), req: () => ({ method: 'GET', path: '/api/rooms' }) },
  { name: 'tim_tai_lieu', risk: 'read', label: 'Tìm tài liệu',
    description: 'Tìm văn bản, quy chế, tài liệu nội bộ theo từ khóa (tiêu đề, số hiệu, cơ quan ban hành, nội dung).',
    input: obj({ q: S('Từ khóa') }, ['q']), req: a => ({ method: 'GET', path: '/api/docs' + qs({ q: a.q }) }),
    out: r => (r.docs || []).slice(0, 20).map(d => ({ id: d.id, title: d.title, number: d.number, issued_date: d.issued_date, issuer: d.issuer, description: d.description })) },
  { name: 'doc_tai_lieu', risk: 'read', label: 'Đọc tài liệu',
    description: 'Đọc nội dung văn bản của một tài liệu theo mã (để trả lời câu hỏi về quy chế, quy định). Trích dẫn số hiệu, tên tài liệu khi trả lời.',
    input: obj({ doc_id: I('Mã tài liệu') }, ['doc_id']), req: a => ({ method: 'GET', path: '/api/docs/' + id(a.doc_id) }),
    out: d => ({ id: d.id, title: d.title, number: d.number, issued_date: d.issued_date, issuer: d.issuer, description: d.description, body: String(d.body || '').slice(0, 12000), file_name: d.file_name }) },

  /* ---------- Ghi: cần người dùng xác nhận ---------- */
  { name: 'tao_cong_viec', risk: 'write', label: 'Tạo công việc',
    description: 'Đề nghị tạo công việc mới (người dùng phải bấm Xác nhận). Tra danh_ba để lấy project_id và mã người nhận trước. priority: cao, tb, thap.',
    input: obj({ project_id: I('Mã dự án/phòng ban'), title: S('Tên công việc'), description: S('Mô tả'), assignee_ids: { type: 'array', items: { type: 'integer' }, description: 'Mã người thực hiện; bỏ trống = giao cho chính tôi' }, start_date: S(DATE), due_date: S(DATE), priority: S('Mức ưu tiên', { enum: ['cao', 'tb', 'thap'] }) }, ['project_id', 'title']),
    req: a => ({ method: 'POST', path: '/api/tasks', body: { project_id: id(a.project_id), title: String(a.title || ''), description: a.description || '', assignee_ids: Array.isArray(a.assignee_ids) ? a.assignee_ids.map(Number) : undefined, start_date: a.start_date || undefined, due_date: a.due_date || undefined, priority: a.priority || 'tb' } }),
    summary: (a, c) => `Tạo công việc «${a.title}» trong ${c.project(a.project_id)}` + `, giao cho ${(Array.isArray(a.assignee_ids) && a.assignee_ids.length ? a.assignee_ids.map(c.user).join(', ') : 'chính bạn')}` + (a.due_date ? `, hạn ${fmtD(a.due_date)}` : '') + `, ưu tiên ${PRIO[a.priority] || 'Trung bình'}.` },
  { name: 'doi_trang_thai_cong_viec', risk: 'write', label: 'Đổi trạng thái công việc',
    description: 'Đề nghị đổi trạng thái công việc: todo, doing, done, failed (người dùng phải bấm Xác nhận).',
    input: obj({ task_id: I('Mã công việc'), status: S('Trạng thái mới', { enum: ['todo', 'doing', 'done', 'failed'] }) }, ['task_id', 'status']),
    req: a => ({ method: 'POST', path: `/api/tasks/${id(a.task_id)}/status`, body: { status: a.status } }),
    summary: (a, c) => `Chuyển ${c.task(a.task_id)} sang trạng thái «${TST[a.status] || a.status}».` },
  { name: 'binh_luan_cong_viec', risk: 'write', label: 'Gửi trao đổi trong công việc',
    description: 'Đề nghị gửi một trao đổi (bình luận) vào công việc (người dùng phải bấm Xác nhận).',
    input: obj({ task_id: I('Mã công việc'), body: S('Nội dung trao đổi') }, ['task_id', 'body']),
    req: a => ({ method: 'POST', path: `/api/tasks/${id(a.task_id)}/comments`, body: { body: String(a.body || '') } }),
    summary: (a, c) => `Gửi trao đổi vào ${c.task(a.task_id)}: «${String(a.body || '').slice(0, 300)}».` },
  { name: 'tao_de_xuat', risk: 'write', label: 'Gửi đề xuất',
    description: 'Đề nghị gửi một đề xuất phê duyệt (người dùng phải bấm Xác nhận). type: ' + Object.entries(RTYPES).map(([k, v]) => `${k} (${v})`).join(', ') + '. nghiphep/congtac cần date_from, date_to; tangca cần date_from, hours; giaitrinh cần date_from; thanhtoan/mua/tamung cần amount (đồng).',
    input: obj({ type: S('Loại đề xuất', { enum: Object.keys(RTYPES) }), title: S('Trích yếu'), reason: S('Lý do, căn cứ'), amount: I('Số tiền (đồng)'), date_from: S(DATE), date_to: S(DATE), hours: { type: 'number', description: 'Số giờ làm thêm' }, half_day: { type: 'boolean', description: 'Nghỉ nửa ngày' } }, ['type', 'title', 'reason']),
    req: a => ({ method: 'POST', path: '/api/requests', body: { type: a.type, title: String(a.title || ''), reason: String(a.reason || ''), amount: a.amount || 0, date_from: a.date_from, date_to: a.date_to || a.date_from, hours: a.hours, half_day: !!a.half_day } }),
    summary: a => `Gửi «${RTYPES[a.type] || a.type}»: ${a.title}` + (a.amount ? `, số tiền ${Number(a.amount).toLocaleString('vi-VN')} ₫` : '') + (a.date_from ? `, ${fmtD(a.date_from)}${a.date_to && a.date_to !== a.date_from ? '–' + fmtD(a.date_to) : ''}` : '') + (a.hours ? `, ${a.hours} giờ` : '') + `. Lý do: ${String(a.reason || '').slice(0, 300)}` },
  { name: 'xu_ly_de_xuat', risk: 'write', label: 'Duyệt hoặc từ chối đề xuất',
    description: 'Đề nghị duyệt (approve) hoặc từ chối (reject) MỘT đề xuất đang chờ tôi xử lý (người dùng phải bấm Xác nhận). Từ chối phải có note.',
    input: obj({ request_id: I('Mã đề xuất'), action: S('approve hoặc reject', { enum: ['approve', 'reject'] }), note: S('Ý kiến') }, ['request_id', 'action']),
    req: a => { if (!['approve', 'reject'].includes(a.action)) throw new Error('Thao tác không hợp lệ.'); return { method: 'POST', path: `/api/requests/${id(a.request_id)}/${a.action}`, body: { note: a.note || '' } }; },
    summary: (a, c) => `${a.action === 'approve' ? 'DUYỆT' : 'TỪ CHỐI'} ${c.request(a.request_id)}` + (a.note ? `. Ý kiến: ${String(a.note).slice(0, 300)}` : '.') },
  { name: 'dat_lich_hop', risk: 'write', label: 'Đặt lịch họp',
    description: 'Đề nghị lên lịch họp (người dùng phải bấm Xác nhận). Bắt đầu và kết thúc trong cùng ngày. Tra phong_hop để lấy room_id, danh_ba để lấy mã thành viên.',
    input: obj({ title: S('Nội dung cuộc họp'), start_at: S(DT), end_at: S(DT), room_id: I('Mã phòng họp (tùy chọn)'), members: { type: 'array', items: { type: 'integer' }, description: 'Mã người được mời' }, agenda: S('Chương trình họp') }, ['title', 'start_at', 'end_at']),
    req: a => ({ method: 'POST', path: '/api/meetings', body: { title: String(a.title || ''), start_at: a.start_at, end_at: a.end_at, room_id: a.room_id || null, members: Array.isArray(a.members) ? a.members.map(Number) : [], agenda: a.agenda || '' } }),
    summary: (a, c) => `Đặt lịch họp «${a.title}» ${String(a.start_at || '').slice(11)}–${String(a.end_at || '').slice(11)} ngày ${fmtD(a.start_at)}` + (a.room_id ? `, ${c.room(a.room_id)}` : '') + (Array.isArray(a.members) && a.members.length ? `, mời ${a.members.map(c.user).join(', ')}` : '') + '.' }
];
const BY_NAME = Object.fromEntries(TOOLS.map(t => [t.name, t]));

/* ---------- Che dữ liệu cá nhân, rút gọn kết quả ---------- */
const PII_KEYS = /^(email|phone|mobile|dob|birth|birthday|gender|id_?number|cccd|cmnd|passport|address|home_address|bank.*|account_no|tax_code|mst|salary.*|base_salary|gross|net|insurance.*|allowance.*|pass_hash|token|sid)$/i;
const PII_TEXT = [[/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[đã ẩn email]'], [/(?<!\d)(?:\+?84|0)(?:[\s.-]?\d){8,10}(?!\d)/g, '[đã ẩn số điện thoại]'], [/(?<!\d)\d{9}(?:\d{3})?(?!\d)/g, '[đã ẩn số giấy tờ]']];
function redactText(s) { let t = String(s); for (const [re, rep] of PII_TEXT) t = t.replace(re, rep); return t; }
function compact(v, pii, depth = 0) {
  if (v == null || v === '') return undefined;
  if (typeof v === 'string') { const t = v.length > 2000 ? v.slice(0, 2000) + '…' : v; return pii ? t : redactText(t); }
  if (typeof v !== 'object') return v;
  if (depth > 5) return undefined;
  if (Array.isArray(v)) { const a = v.slice(0, 40).map(x => compact(x, pii, depth + 1)).filter(x => x !== undefined); if (v.length > 40) a.push(`… còn ${v.length - 40} mục`); return a; }
  const o = {};
  for (const [k, x] of Object.entries(v)) { if (!pii && PII_KEYS.test(k)) continue; if (/color|_html$|stored_name/.test(k)) continue; const c = compact(x, pii, depth + 1); if (c !== undefined) o[k] = c; }
  return o;
}
/** Kết quả API → chuỗi gửi mô hình (giới hạn kích thước). */
function shapeResult(tool, data, allowPii) {
  let v = data; try { if (tool.out) v = tool.out(data); } catch (e) { v = data; }
  const s = JSON.stringify(compact(v, allowPii) ?? null);
  return s.length > 14000 ? s.slice(0, 14000) + '…(đã cắt bớt)' : s;
}

module.exports = { TOOLS, BY_NAME, shapeResult, compact, redactText, RTYPES };
