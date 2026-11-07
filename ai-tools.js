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

/* ---------- Danh mục API đọc nghiệp vụ cho công cụ doc_du_lieu ----------
 * Chỉ GET. Đường dẫn phải khớp đúng một mẫu dưới đây (mã số là số nguyên dương); tham số truy vấn chỉ nhận tên có trong danh mục, giá trị được dựng lại.
 * Theo yêu cầu của chủ sở hữu: chỉ cấm nghiệp vụ phân quyền. Không có trong danh mục: phân quyền, vai trò, ủy quyền (/api/work/config, /api/work/bulk/*),
 * tài khoản người dùng và nhật ký an ninh, sao lưu/khôi phục (/api/admin/*), cấu hình trợ lý AI; tệp tải về và CSV (trùng với API JSON, không đọc được bằng mô hình).
 * Tiền lương: đọc theo quyền hiện hành; số tiền vẫn bị che nếu đơn vị chưa cho phép gửi thông tin cá nhân. Quyền xem từng đối tượng do API nghiệp vụ kiểm tra. */
const CATALOG = [
  ['/api/dashboard', 'Tổng quan: việc của tôi, tải công việc theo người (lãnh đạo: toàn đơn vị; trưởng phòng: phòng mình), tổng số việc/quá hạn, đề xuất và hồ sơ quy trình chờ tôi, hoạt động gần đây, hợp đồng sắp hết hạn'],
  ['/api/activity', 'Lịch sử hoạt động trên hệ thống (lãnh đạo: toàn đơn vị; người khác: phòng mình). user=mã người, from/to=YYYY-MM-DD, q=từ khóa', 'user,from,to,q,limit,offset'],
  ['/api/tasks', 'Công việc. scope: assigned|created|marked|following|review|staff (nhân viên tôi quản lý); status: open|late|todo|doing|review|done|failed; assignee=mã người', 'scope,status,assignee,q,tag,limit,offset'],
  ['/api/tasks/:id', 'Chi tiết công việc: mô tả, người làm, hạn, việc con, trao đổi, lịch sử'],
  ['/api/work/staff', 'Nhân viên tôi quản lý và số việc của từng người'],
  ['/api/projects', 'Dự án/phòng ban. scope: mine|dept|fav|all (all chỉ với quản trị, giám đốc); status: open|closed|all; kind: project|team', 'scope,health,dept,status,kind,q'],
  ['/api/projects/:id', 'Thông tin dự án'],
  ['/api/projects/:id/tasks', 'Công việc của dự án', 'status,assignee,group,q,tag,milestone,from,to,sort,limit,offset'],
  ['/api/projects/:id/report', 'Báo cáo dự án: tiến độ, theo người, theo trạng thái'],
  ['/api/projects/:id/sidebar', 'Tóm tắt dự án: tiến độ, việc cần lưu ý, mốc, hoạt động gần đây'],
  ['/api/projects/:id/activity', 'Lịch sử hoạt động của dự án', 'offset'],
  ['/api/projects/:id/posts', 'Thảo luận của dự án'],
  ['/api/project-posts/:id', 'Chi tiết một thảo luận dự án'],
  ['/api/projects/:id/files', 'Danh sách tệp, tài liệu của dự án'],
  ['/api/projects/:id/recurrences', 'Công việc lặp lại của dự án'],
  ['/api/projects/:id/fields', 'Trường dữ liệu tùy chỉnh của dự án'],
  ['/api/work/templates', 'Mẫu dự án'],
  ['/api/work/members', 'Khối lượng công việc theo người: số dự án, việc đang mở, quá hạn, hoàn thành (lãnh đạo: toàn đơn vị; trưởng phòng: phòng mình)', 'dept,q'],
  ['/api/work/members/:id/report', 'Báo cáo công việc của một người. basis: due|created; status', 'from,to,project,basis,status'],
  ['/api/work/system-report', 'Báo cáo công việc toàn hệ thống (quản trị, giám đốc)', 'from,to,basis,dept,sub,status'],
  ['/api/requests', 'Đề xuất phê duyệt. box: inbox (chờ tôi duyệt)|sent|done|all; status: pending|approved|rejected; type', 'box,type,status'],
  ['/api/requests/:id', 'Chi tiết đề xuất, các bước duyệt'],
  ['/api/requests/route', 'Xem trước tuyến duyệt của một loại đề xuất', 'type,amount,from,to'],
  ['/api/wf/templates', 'Mẫu quy trình'],
  ['/api/wf/runs', 'Hồ sơ quy trình (văn bản đến/đi, xử lý theo bước). box: mine (chờ tôi)|involved|all; status: running|done|cancelled', 'box,status'],
  ['/api/wf/runs/:id', 'Chi tiết hồ sơ quy trình'],
  ['/api/hr/employees', 'Hồ sơ nhân sự. active: 1|0; dept=mã phòng', 'active,dept,q'],
  ['/api/hr/employees/:id', 'Hồ sơ một nhân viên: hợp đồng, ngày phép, quá trình'],
  ['/api/attendance/today', 'Chấm công hôm nay'],
  ['/api/attendance/sheet', 'Bảng công tháng. month=YYYY-MM', 'month,mine,dept'],
  ['/api/goals/cycles', 'Kỳ mục tiêu'],
  ['/api/goals', 'Mục tiêu – KPI', 'cycle'],
  ['/api/goals/:id/updates', 'Cập nhật tiến độ một mục tiêu'],
  ['/api/posts', 'Bảng tin nội bộ', 'category,q'],
  ['/api/posts/:id', 'Chi tiết bản tin', 'kind'],
  ['/api/rooms', 'Phòng họp'],
  ['/api/meetings', 'Lịch họp. from/to=YYYY-MM-DD; mine=1', 'from,to,mine'],
  ['/api/meetings/:id', 'Chi tiết cuộc họp, thành phần, biên bản'],
  ['/api/docs', 'Kho tài liệu, văn bản', 'category,q'],
  ['/api/docs/:id', 'Nội dung tài liệu'],
  ['/api/crm/customers', 'Khách hàng', 'status,q'],
  ['/api/crm/customers/:id', 'Chi tiết khách hàng, lịch sử chăm sóc'],
  ['/api/crm/deals', 'Cơ hội kinh doanh'],
  ['/api/crm/agenda', 'Lịch hẹn khách hàng sắp tới'],
  ['/api/fin/summary', 'Tổng hợp thu chi – ngân sách theo năm', 'year'],
  ['/api/fin/tx', 'Giao dịch thu chi. month=YYYY-MM; kind: thu|chi', 'month,kind,q'],
  ['/api/assets', 'Tài sản', 'mine,status,category,q'],
  ['/api/assets/:id', 'Chi tiết tài sản'],
  ['/api/visitors', 'Khách đến cơ quan', 'from,to,mine'],
  ['/api/recruit/jobs', 'Tin tuyển dụng'],
  ['/api/recruit/jobs/:id', 'Chi tiết tin tuyển dụng, ứng viên'],
  ['/api/recruit/candidates/:id', 'Chi tiết ứng viên'],
  ['/api/courses', 'Khóa đào tạo'],
  ['/api/courses/:id', 'Chi tiết khóa đào tạo'],
  ['/api/reviews/cycles', 'Kỳ đánh giá năng lực'],
  ['/api/reviews', 'Đánh giá năng lực', 'cycle'],
  ['/api/cases', 'Khen thưởng – kỷ luật', 'kind'],
  ['/api/chat/conversations', 'Danh sách cuộc trò chuyện của tôi và số tin chưa đọc'],
  ['/api/chat/conversations/:id/messages', 'Nội dung tin nhắn một cuộc trò chuyện tôi tham gia (200 tin gần nhất; trợ lý đọc không làm thay đổi trạng thái đã đọc)', 'after', { peek: '1' }],
  ['/api/payroll/my', 'Phiếu lương của tôi các kỳ đã khóa'],
  ['/api/payroll/periods', 'Các kỳ lương và tổng quỹ lương, thuế, bảo hiểm'],
  ['/api/payroll/periods/:id', 'Bảng lương chi tiết một kỳ (bộ phận tiền lương)'],
  ['/api/payroll/profiles', 'Hồ sơ lương, phụ cấp của nhân viên (bộ phận tiền lương)']
].map(([pattern, desc, params, fixed]) => ({ pattern, desc, params: params ? params.split(',') : [], fixed: fixed || null, re: new RegExp('^' + pattern.replace(/:id/g, '[1-9][0-9]{0,8}') + '$') }));
/** Kiểm tra và dựng lại đường dẫn API đọc: chỉ nhận đường dẫn trong danh mục; tham số truy vấn lọc theo danh mục. */
function safeApiPath(input) {
  const raw = String(input || '').trim();
  if (!raw || raw.length > 400 || /[\\#\s]|\.\.|%2e|%2f/i.test(raw)) throw new Error('Đường dẫn không hợp lệ.');
  const [p, q = ''] = raw.split('?');
  const path = p.replace(/\/+$/, '');
  const c = CATALOG.find(x => x.re.test(path));
  if (!c) throw new Error(`Đường dẫn ${path.slice(0, 80)} không có trong danh mục dữ liệu trợ lý được phép đọc.`);
  const src = new URLSearchParams(q), out = new URLSearchParams();
  for (const k of c.params) { const v = src.get(k); if (v != null && v !== '') out.set(k, v.slice(0, 100)); }
  if (c.params.includes('limit') && !out.get('limit')) out.set('limit', '50');
  if (c.fixed) for (const [k, v] of Object.entries(c.fixed)) out.set(k, v); // tham số cố định (ví dụ peek=1: đọc tin nhắn không đánh dấu đã đọc)
  const s = out.toString();
  return path + (s ? '?' + s : '');
}
const CATALOG_TEXT = CATALOG.map(c => `${c.pattern}${c.params.length ? ' ?' + c.params.join(',') : ''}: ${c.desc}`).join('\n');

/* ---------- Màn hình và loại chi tiết trợ lý được mở trên giao diện (không thay đổi dữ liệu) ---------- */
const SCREENS = { 'tong-quan': 'Tổng quan', 'quan-tri': 'Quản trị', 'cong-viec': 'Công việc – Dự án', 'phe-duyet': 'Phê duyệt', 'quy-trinh': 'Quy trình', 'nhan-su': 'Hồ sơ nhân sự', 'cham-cong': 'Chấm công – Bảng công', 'tien-luong': 'Tiền lương', 'muc-tieu': 'Mục tiêu – KPI', 'bang-tin': 'Bảng tin', 'lich-hop': 'Lịch họp', 'tai-lieu': 'Tài liệu', 'khach-hang': 'Khách hàng', 'thu-chi': 'Thu chi – Ngân sách', 'tai-san': 'Tài sản', 'nhan-tin': 'Nhắn tin', 'khach-den': 'Đăng ký khách đến', 'tuyen-dung': 'Tuyển dụng', 'dao-tao': 'Đào tạo', 'danh-gia': 'Đánh giá năng lực', 'khen-thuong': 'Khen thưởng – Kỷ luật', 'tai-khoan': 'Tài khoản' };
const DETAILS = { cong_viec: 'công việc', du_an: 'dự án', de_xuat: 'đề xuất', quy_trinh: 'hồ sơ quy trình', nhan_su: 'hồ sơ nhân sự', cuoc_hop: 'cuộc họp', tai_lieu: 'tài liệu', ban_tin: 'bản tin', khach_hang: 'khách hàng', tai_san: 'tài sản', ung_vien: 'ứng viên', khoa_hoc: 'khóa đào tạo' };

const TOOLS = [
  /* ---------- Chỉ đọc ---------- */
  { name: 'bao_cao_tinh_hinh', risk: 'read', label: 'Tổng hợp tình hình',
    description: 'Tổng hợp một lần toàn bộ tình hình nghiệp vụ người dùng được xem: tổng quan và tải công việc, đề xuất đang chờ duyệt, hồ sơ quy trình đang xử lý, báo cáo công việc toàn hệ thống (lãnh đạo), lịch họp hôm nay, hoạt động gần đây, thu chi, chấm công hôm nay, lịch hẹn khách hàng. Phần không có quyền sẽ bị bỏ qua. Dùng ĐẦU TIÊN khi được hỏi "tình hình", "báo cáo hôm nay", "có gì cần chỉ đạo".',
    input: obj({}),
    multi: (a, ctx) => [
      ['tong_quan', '/api/dashboard'], ['de_xuat_dang_cho', '/api/requests?box=all&status=pending'], ['quy_trinh_dang_xu_ly', '/api/wf/runs?box=all&status=running'],
      ['bao_cao_cong_viec_toan_he_thong', '/api/work/system-report'], ['lich_hop_hom_nay', `/api/meetings?from=${ctx.today}&to=${ctx.today}`],
      ['hoat_dong_gan_day', '/api/activity?limit=30'], ['thu_chi_nam', '/api/fin/summary'], ['cham_cong_hom_nay', '/api/attendance/today'], ['lich_hen_khach_hang', '/api/crm/agenda']
    ] },
  { name: 'doc_du_lieu', risk: 'read', label: 'Tra cứu dữ liệu',
    description: 'Gọi MỘT API ĐỌC bất kỳ trong danh mục dưới đây, theo đúng quyền của người dùng (không có quyền sẽ nhận lỗi 403). Dùng khi các công cụ khác chưa đủ. duong_dan dạng /api/... kèm tham số, ví dụ /api/requests?box=all&status=pending hoặc /api/projects/12/report. Thay :id bằng mã số. Danh mục:\n' + CATALOG_TEXT,
    input: obj({ duong_dan: S('Đường dẫn API trong danh mục, kèm tham số truy vấn nếu cần') }, ['duong_dan']),
    req: a => ({ method: 'GET', path: safeApiPath(a.duong_dan) }) },
  { name: 'lich_su_hoat_dong', risk: 'read', label: 'Xem lịch sử hoạt động',
    description: 'Lịch sử hoạt động trên hệ thống (ai làm gì, lúc nào): giao việc, hoàn thành, duyệt, gửi đề xuất, bình luận... Lãnh đạo xem toàn đơn vị, người khác xem phòng mình. Lọc theo người, khoảng ngày, từ khóa.',
    input: obj({ user_id: I('Mã người (tùy chọn)'), from: S(DATE), to: S(DATE), q: S('Từ khóa'), limit: I('Số dòng, tối đa 200') }),
    req: a => ({ method: 'GET', path: '/api/activity' + qs({ user: a.user_id, from: a.from, to: a.to, q: a.q, limit: Math.min(200, Number(a.limit) || 50) }) }) },
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

  /* ---------- Điều khiển giao diện: chỉ chuyển màn hình, mở chi tiết trên trình duyệt của người dùng; không thay đổi dữ liệu ---------- */
  { name: 'mo_man_hinh', risk: 'ui', label: 'Mở màn hình',
    description: 'Chuyển giao diện của người dùng tới một màn hình (khi người dùng bảo "mở", "chuyển đến", "cho tôi xem"). du_an_id: mở thẳng một dự án (chỉ với cong-viec). Màn hình: ' + Object.entries(SCREENS).map(([k, v]) => `${k} (${v})`).join(', ') + '.',
    input: obj({ man_hinh: S('Mã màn hình', { enum: Object.keys(SCREENS) }), du_an_id: I('Mã dự án (tùy chọn, với cong-viec)') }, ['man_hinh']),
    ui: a => { if (!SCREENS[a.man_hinh]) throw new Error('Màn hình không hợp lệ.'); const pid = a.man_hinh === 'cong-viec' && a.du_an_id ? id(a.du_an_id) : null; return { op: 'navigate', route: a.man_hinh, project: pid, label: SCREENS[a.man_hinh] + (pid ? ` › dự án #${pid}` : '') }; } },
  { name: 'mo_chi_tiet', risk: 'ui', label: 'Mở chi tiết',
    description: 'Mở cửa sổ chi tiết một đối tượng trên giao diện của người dùng (công việc, dự án, đề xuất, hồ sơ quy trình, hồ sơ nhân sự, cuộc họp, tài liệu, bản tin, khách hàng, tài sản, ứng viên, khóa đào tạo) theo mã. Dùng khi người dùng muốn xem tận mắt, xử lý tiếp. Giao diện vẫn kiểm tra quyền.',
    input: obj({ loai: S('Loại đối tượng', { enum: Object.keys(DETAILS) }), id: I('Mã đối tượng') }, ['loai', 'id']),
    ui: a => { if (!DETAILS[a.loai]) throw new Error('Loại đối tượng không hợp lệ.'); return { op: 'open', kind: a.loai, id: id(a.id), label: `${DETAILS[a.loai]} #${id(a.id)}` }; } },

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

/* Phí tìm kiếm Internet quy ra token để tính hạn mức (07/11/2026, theo yêu cầu của chủ sở hữu).
 * Anthropic tính 10 USD/1.000 lượt web_search (0,01 USD/lượt) ngoài token; giá token vào Opus 5.5 là 4 USD/1 triệu
 * → 0,01 USD ≈ 2.500 token vào. web_fetch không tính phí theo lượt (chỉ tính token nội dung trang) nên không quy đổi. */
const WEB_SEARCH_TOKENS = 2500;
module.exports = { WEB_SEARCH_TOKENS, TOOLS, BY_NAME, shapeResult, compact, redactText, RTYPES, CATALOG, safeApiPath, SCREENS, DETAILS };
