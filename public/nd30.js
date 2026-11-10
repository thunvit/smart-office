/* SmartOffice — Dựng văn bản hành chính theo thể thức Nghị định 30/2020/NĐ-CP (ADR-011, ADR-013).
 * Căn cứ đã đối chiếu với bản Word do chủ sở hữu cung cấp ngày 10/11/2026 (tệp 30_2020_ND-CP.doc và 30_2020_ND-CP_Phu_luc_1.doc):
 *  - Điều 7 (các loại văn bản hành chính), Điều 8 (thành phần thể thức), Điều 9, Điều 13 (quyền hạn người ký), Điều 15 (cấp số).
 *  - Phụ lục I Phần I: khổ A4; lề trên, dưới 20–25 mm, trái 30–35 mm, phải 15–20 mm; Times New Roman; vị trí, cỡ chữ, kiểu chữ từng thành phần
 *    (Quốc hiệu, Tiêu ngữ, tên cơ quan, số – ký hiệu, địa danh – ngày tháng, tên loại – trích yếu, căn cứ, bố cục phần/chương/mục/điều/khoản/điểm,
 *    quyền hạn người ký TM., Q., KT., TL., TUQ., nơi nhận, phụ lục, dấu độ khẩn, chỉ dẫn phạm vi lưu hành, ký hiệu người soạn, địa chỉ cơ quan);
 *    số trang canh giữa lề trên, không hiện ở trang đầu; Phụ lục đánh số trang riêng.
 *  - Phụ lục III: bảng chữ viết tắt tên loại; Mẫu 1.1 đến 1.10 (nghị quyết, quyết định, văn bản có tên loại, công văn, công điện, giấy mời,
 *    giấy giới thiệu, biên bản, giấy nghỉ phép), Mẫu 2.1 (phụ lục).
 * Chưa làm: Mẫu 3.x (bản sao), phiên bản điện tử có chữ ký số, bản đồ đối chiếu viết hoa theo Phụ lục II (chỉ nhắc trong lời nhắc AI).
 * Chưa kiểm chứng: mở tệp .docx bằng Microsoft Word (đã kiểm tra bằng LibreOffice).
 * Thể thức do mã dựng (cố định); trợ lý AI chỉ cung cấp nội dung. Dùng được trong Node (kiểm thử) và trình duyệt (window.SO_ND30). */
(function (root) {
'use strict';
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const up = s => String(s || '').toLocaleUpperCase('vi-VN');
const p2 = n => String(n).padStart(2, '0');
const QH = 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', TN = 'Độc lập - Tự do - Hạnh phúc';
const BLANK = '…';
const cut = (s, n) => String(s == null ? '' : s).slice(0, n);
/* Bỏ ký tự điều khiển (giữ xuống dòng, tab) */
const clean = (s, n) => cut(s, n).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
const one = (s, n) => clean(s, n).replace(/[\r\n\t]+/g, ' ').trim();
const abbrN = a => up(a).replace(/\s+/g, '');

/** "Hà Nội, ngày 05 tháng 3 năm 2026": ngày nhỏ hơn 10 và tháng 1, 2 ghi thêm số 0 phía trước (Phụ lục I) */
function ntn(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return 'ngày … tháng … năm …';
  const mo = Number(m[2]);
  return `ngày ${p2(Number(m[3]))} tháng ${mo <= 2 ? p2(mo) : String(mo)} năm ${m[1]}`;
}
const dateLine = (place, iso) => `${place || BLANK}, ${ntn(iso)}`;
const hm = s => { const m = /(\d{1,2}):(\d{2})/.exec(String(s || '')); return m ? `${p2(Number(m[1]))} giờ ${m[2]}` : '… giờ …'; };
const dmy = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? `${m[3]}/${m[2]}/${m[1]}` : '…/…/…'; };
const soKyHieu = (loai, abbr) => `Số: ${BLANK}/${loai}${abbr ? '-' + abbrN(abbr) : '-' + BLANK}`;
const person = p => p ? [p.title, p.name].filter(Boolean).join(' ') : '';

/* ================= Danh mục loại văn bản (Điều 7; chữ viết tắt theo Phụ lục III; mẫu trình bày theo Phụ lục III) ================= */
/* k: kiểu bố cục (nq, qd, qdbh, tl = văn bản có tên loại, cv, cd, gm, ggt, bb, gnp); ab: chữ viết tắt; tl: tên loại in trên đầu văn bản; ai: có cho AI soạn nội dung */
const TYPES = {
  nghiquyet: { ten: 'Nghị quyết (cá biệt)', ab: 'NQ', mau: '1.1', k: 'nq', tl: 'NGHỊ QUYẾT', ai: true },
  quyetdinh: { ten: 'Quyết định (cá biệt) quy định trực tiếp', ab: 'QĐ', mau: '1.2', k: 'qd', tl: 'QUYẾT ĐỊNH', ai: true },
  quyetdinh_bh: { ten: 'Quyết định ban hành hoặc phê duyệt văn bản khác', ab: 'QĐ', mau: '1.3', k: 'qdbh', tl: 'QUYẾT ĐỊNH', ai: true },
  chithi: { ten: 'Chỉ thị', ab: 'CT', mau: '1.4', k: 'tl', tl: 'CHỈ THỊ', ai: true },
  quyche: { ten: 'Quy chế', ab: 'QC', mau: '1.4', k: 'tl', tl: 'QUY CHẾ', ai: true },
  quydinh: { ten: 'Quy định', ab: 'QyĐ', mau: '1.4', k: 'tl', tl: 'QUY ĐỊNH', ai: true },
  thongcao: { ten: 'Thông cáo', ab: 'TC', mau: '1.4', k: 'tl', tl: 'THÔNG CÁO', ai: true },
  thongbao: { ten: 'Thông báo', ab: 'TB', mau: '1.4', k: 'tl', tl: 'THÔNG BÁO', ai: true },
  huongdan: { ten: 'Hướng dẫn', ab: 'HD', mau: '1.4', k: 'tl', tl: 'HƯỚNG DẪN', ai: true },
  chuongtrinh: { ten: 'Chương trình', ab: 'CTr', mau: '1.4', k: 'tl', tl: 'CHƯƠNG TRÌNH', ai: true },
  kehoach: { ten: 'Kế hoạch', ab: 'KH', mau: '1.4', k: 'tl', tl: 'KẾ HOẠCH', ai: true },
  phuongan: { ten: 'Phương án', ab: 'PA', mau: '1.4', k: 'tl', tl: 'PHƯƠNG ÁN', ai: true },
  dean: { ten: 'Đề án', ab: 'ĐA', mau: '1.4', k: 'tl', tl: 'ĐỀ ÁN', ai: true },
  duan: { ten: 'Dự án', ab: 'DA', mau: '1.4', k: 'tl', tl: 'DỰ ÁN', ai: true },
  baocao: { ten: 'Báo cáo', ab: 'BC', mau: '1.4', k: 'tl', tl: 'BÁO CÁO', ai: true },
  totrinh: { ten: 'Tờ trình', ab: 'TTr', mau: '1.4', k: 'tl', tl: 'TỜ TRÌNH', ai: true },
  giayuyquyen: { ten: 'Giấy ủy quyền', ab: 'GUQ', mau: '1.4', k: 'tl', tl: 'GIẤY ỦY QUYỀN', ai: true },
  phieugui: { ten: 'Phiếu gửi', ab: 'PG', mau: '1.4', k: 'tl', tl: 'PHIẾU GỬI', ai: true },
  phieuchuyen: { ten: 'Phiếu chuyển', ab: 'PC', mau: '1.4', k: 'tl', tl: 'PHIẾU CHUYỂN', ai: true },
  phieubao: { ten: 'Phiếu báo', ab: 'PB', mau: '1.4', k: 'tl', tl: 'PHIẾU BÁO', ai: true },
  congvan: { ten: 'Công văn', ab: '', mau: '1.5', k: 'cv', tl: 'CÔNG VĂN', ai: true },
  congdien: { ten: 'Công điện', ab: 'CĐ', mau: '1.6', k: 'cd', tl: 'CÔNG ĐIỆN', ai: true },
  giaymoi: { ten: 'Giấy mời', ab: 'GM', mau: '1.7', k: 'gm', tl: 'GIẤY MỜI', ai: true },
  giaygt: { ten: 'Giấy giới thiệu', ab: 'GGT', mau: '1.8', k: 'ggt', tl: 'GIẤY GIỚI THIỆU', ai: false },
  bienban: { ten: 'Biên bản', ab: 'BB', mau: '1.9', k: 'bb', tl: 'BIÊN BẢN', ai: true },
  giaynghiphep: { ten: 'Giấy nghỉ phép', ab: 'GNP', mau: '1.10', k: 'gnp', tl: 'GIẤY NGHỈ PHÉP', ai: false }
};
/* Nhóm hiển thị trong danh sách chọn */
const GROUPS = [
  ['Công văn và văn bản có tên loại', ['congvan', 'thongbao', 'baocao', 'totrinh', 'kehoach', 'chuongtrinh', 'huongdan', 'phuongan', 'dean', 'duan', 'chithi', 'quyche', 'quydinh', 'thongcao', 'giayuyquyen', 'phieugui', 'phieuchuyen', 'phieubao']],
  ['Nghị quyết, quyết định', ['quyetdinh', 'quyetdinh_bh', 'nghiquyet']],
  ['Giấy, điện, biên bản', ['giaymoi', 'giaygt', 'giaynghiphep', 'congdien', 'bienban']]
];
/* Trường riêng theo kiểu bố cục: [đường dẫn trong văn bản, nhãn, gợi ý, ô nhiều dòng?, kiểu nhập] */
const FIELDS = {
  gm: [['gm.moi', 'Người được mời (cơ quan, họ tên, chức vụ)', 'Ví dụ: Ông Nguyễn Văn A, Giám đốc Công ty B', 0], ['gm.du', 'Tới dự (tên cuộc họp, hội nghị)', 'Ví dụ: Hội nghị tổng kết công tác năm 2026', 0], ['gm.chu_tri', 'Chủ trì', '', 0], ['gm.thoi_gian', 'Thời gian', 'Ví dụ: 08 giờ 00, ngày 20/11/2026', 0], ['gm.dia_diem', 'Địa điểm', '', 0], ['gm.luu_y', 'Các vấn đề cần lưu ý', 'Ví dụ: Đề nghị đại biểu có mặt trước 15 phút', 1]],
  ggt: [['ggt.ho_ten', 'Ông (bà) – họ và tên', '', 0], ['ggt.chuc_vu', 'Chức vụ, đơn vị công tác', '', 0], ['ggt.den', 'Được cử đến (cơ quan, tổ chức)', '', 0], ['ggt.ve_viec', 'Về việc', '', 1], ['ggt.het_ngay', 'Giấy có giá trị đến hết ngày', '', 0, 'date']],
  gnp: [['gnp.don_ngay', 'Đơn đề nghị nghỉ phép ngày', '', 0, 'date'], ['gnp.ho_ten', 'Cấp cho ông (bà) – họ và tên', '', 0], ['gnp.chuc_vu', 'Chức vụ, đơn vị công tác', '', 0], ['gnp.thoi_gian', 'Được nghỉ phép trong thời gian', 'Ví dụ: 05 ngày làm việc', 0], ['gnp.tu_ngay', 'Kể từ ngày', '', 0, 'date'], ['gnp.den_ngay', 'Đến hết ngày', '', 0, 'date'], ['gnp.tai', 'Nơi nghỉ phép', '', 0], ['gnp.tinh_vao', 'Số ngày nghỉ được tính vào thời gian', 'Ví dụ: nghỉ phép năm 2026', 0]],
  cd: [['cd.nguoi_dien', 'Chức danh, cơ quan của người điện', 'Ví dụ: Giám đốc Sở Nội vụ', 0], ['cd.gui', 'Cơ quan nhận điện (mỗi dòng một nơi)', '', 1]],
  bb: [['bb.bat_dau', 'Thời gian bắt đầu', '', 0, 'datetime'], ['bb.dia_diem', 'Địa điểm', '', 0], ['bb.thanh_phan', 'Thành phần tham dự', '', 1], ['bb.vang', 'Vắng mặt (nếu có)', '', 0], ['bb.chu_toa', 'Chủ trì (chủ tọa) – họ tên, chức vụ', '', 0], ['bb.thu_ky', 'Thư ký – họ tên', '', 0], ['bb.ket_thuc', 'Kết thúc lúc', '', 0, 'time']]
};

/* ================= Chuẩn hóa dữ liệu văn bản (dùng cho cả văn bản do AI trả về và người dùng sửa) ================= */
const lines = (v, n, max) => (Array.isArray(v) ? v : String(v == null ? '' : v).split(/\r?\n/)).map(x => one(x, n)).filter(Boolean).slice(0, max);
const isoOrEmpty = s => (/^\d{4}-\d{2}-\d{2}/.test(String(s || '')) ? String(s).slice(0, 10) : '');
function normDoc(o) {
  o = o && typeof o === 'object' ? o : {};
  const get = (k, n) => one(o[k], n), sub = (g, keys) => { const x = o[g] && typeof o[g] === 'object' ? o[g] : {}; const r = {}; keys.forEach(k => { r[k] = one(x[k], 2000); }); return r; };
  const ky = o.ky && typeof o.ky === 'object' ? o.ky : {};
  const gm = sub('gm', ['moi', 'du', 'chu_tri', 'thoi_gian', 'dia_diem', 'luu_y']);
  const cdSrc = o.cd && typeof o.cd === 'object' ? o.cd : {};
  const gnp = sub('gnp', ['don_ngay', 'ho_ten', 'chuc_vu', 'thoi_gian', 'tu_ngay', 'den_ngay', 'tai', 'tinh_vao']);
  const bb = sub('bb', ['bat_dau', 'dia_diem', 'thanh_phan', 'vang', 'chu_toa', 'thu_ky', 'ket_thuc']);
  const phu = (Array.isArray(o.phu_luc) ? o.phu_luc : []).slice(0, 10).map(x => ({ ten: one(x && x.ten, 200), noi_dung: clean(x && x.noi_dung, 40000).trim() })).filter(x => x.ten || x.noi_dung);
  return {
    loai: TYPES[o.loai] ? o.loai : 'congvan',
    org_parent: get('org_parent', 200), org_name: get('org_name', 200), abbr: get('abbr', 40), dv: get('dv', 40),
    so: /^\d{1,6}$/.test(String(o.so || '').trim()) ? String(o.so).trim() : '', place: get('place', 60), date: isoOrEmpty(o.date),
    trich_yeu: get('trich_yeu', 500), kinh_gui: lines(o.kinh_gui, 300, 20), tham_quyen: get('tham_quyen', 200),
    can_cu: lines(o.can_cu, 1000, 30), mo_dau: get('mo_dau', 1000), noi_dung: clean(o.noi_dung, 60000).trim(),
    ky: { quyen: one(ky.quyen, 100), chuc_vu: one(ky.chuc_vu, 100), name: one(ky.name, 100) },
    noi_nhan: lines(o.noi_nhan, 300, 30), luu: o.luu !== false, soan: get('soan', 40), so_ban: get('so_ban', 10),
    khan: ['khan', 'thuong_khan', 'hoa_toc'].includes(o.khan) ? o.khan : '', pham_vi: ['XEM XONG TRẢ LẠI', 'LƯU HÀNH NỘI BỘ'].includes(o.pham_vi) ? o.pham_vi : '',
    dia_chi: lines(o.dia_chi, 300, 3), gm, gnp, bb, cd: { nguoi_dien: one(cdSrc.nguoi_dien, 300), gui: lines(cdSrc.gui, 300, 20) },
    ggt: sub('ggt', ['ho_ten', 'chuc_vu', 'den', 've_viec', 'het_ngay']), phu_luc: phu
  };
}

/* ================= Mô hình khối ================= */
const AL = { l: 'left', c: 'center', j: 'justify', r: 'right' };
const PH = /(\[cần bổ sung[^\]]*\])/;
function runsOf(t) {
  if (Array.isArray(t)) return t.map(r => (typeof r === 'string' ? { t: r } : r)).filter(r => r.t);
  return String(t == null ? '' : t).split(PH).filter(x => x !== '').map(x => (x.startsWith('[cần bổ sung') ? { t: x, hl: true } : { t: x }));
}
/* Đoạn văn. o: al (l/c/j/r), sz (pt), b, i, fi (thụt đầu dòng, cm), li (thụt trái, cm), before/after (pt), rule (độ dài đường kẻ dưới, tỷ lệ so với dòng chữ; 1 = bằng dòng chữ),
 * emw (độ rộng dòng chữ tính theo em, nếu đã đo), keep, box (khung viền đơn) */
const P = (t, o = {}) => ({ k: 'p', r: runsOf(t), al: o.al || 'l', sz: o.sz || 14, b: !!o.b, i: !!o.i, fi: o.fi || 0, li: o.li || 0, before: o.before || 0, after: o.after == null ? 6 : o.after, rule: o.rule || 0, emw: o.emw || 0, keep: !!o.keep, box: !!o.box });
const TBL = (w, rows, mode) => ({ k: 'tbl', w, rows, mode: mode || 'seq' });
const plain = p => p.r.map(r => r.t).join('');

/* Nội dung văn bản thành các khối: phần, chương, mục, điều, khoản, điểm (Phụ lục I, Phần I, mục II.6) */
const RX = {
  pc: /^(Phần|PHẦN|Chương|CHƯƠNG)\s+(thứ\s+\S+|[IVXLC]+|\d+)(?:[.:]|\s)*(.*)$/i,
  mu: /^(Tiểu mục|TIỂU MỤC|Mục|MỤC)\s+(\d+)(?:[.:]|\s)*(.*)$/i,
  dieu: /^Điều\s+(\d+)\s*(?:[.:])?\s*(.*)$/,
  roman: /^([IVXLC]+)\.\s+(.+)$/,
  khoan: /^(\d+(?:\.\d+)*)[.)]\s+(.+)$/,
  diem: /^([a-zđ])\)\s+(.+)$/,
  dash: /^[-–•]\s+(.+)$/
};
const isStruct = l => RX.pc.test(l) || RX.mu.test(l) || RX.dieu.test(l);
function endMark(s) { s = String(s); if (/\.\/\.$/.test(s)) return s; return s.replace(/[\s.;,:]+$/, '') + './.'; }
function bodyBlocks(text, opt = {}) {
  const ls = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean), out = [];
  if (opt.end && ls.length) ls[ls.length - 1] = endMark(ls[ls.length - 1]);
  for (let i = 0; i < ls.length; i++) {
    const l = ls[i]; let m;
    if (opt.heads !== false && ((m = RX.pc.exec(l)) || (m = RX.mu.exec(l)))) {
      let title = m[3].trim();
      if (!title && ls[i + 1] && !isStruct(ls[i + 1]) && ls[i + 1].length <= 150 && !/[.;]$/.test(ls[i + 1])) title = ls[++i];
      const lab = /^(phần|chương|mục|tiểu mục)$/i.test(m[1]) ? m[1][0].toUpperCase() + m[1].slice(1).toLowerCase() : m[1], num = /^thứ/i.test(m[2]) ? m[2].toLowerCase() : m[2].toUpperCase();
      out.push(P(`${lab} ${num}`, { al: 'c', b: true, after: title ? 0 : 6, before: 6, keep: true }));
      if (title) out.push(P(up(title), { al: 'c', b: true, keep: true }));
    } else if (opt.heads !== false && (m = RX.dieu.exec(l))) {
      out.push(P(`Điều ${m[1]}.${m[2] ? ' ' + m[2] : ''}`, { b: true, fi: 1, al: 'j', keep: true }));
    } else if (l.startsWith('## ')) {
      out.push(P(l.slice(3), { b: true, fi: 1, keep: true, al: 'j' }));
    } else if (!opt.plain && (m = RX.roman.exec(l))) {
      out.push(P(l, { b: true, fi: 1, keep: true, al: 'j' }));
    } else if (!opt.plain && (m = RX.khoan.exec(l)) && ls[i + 1] && !RX.khoan.test(ls[i + 1]) && m[2].length <= 80 && m[2].split(/\s+/).length <= 12 && !/[.;:,]$/.test(m[2]) && !/^\[cần bổ sung/.test(m[2])) {
      /* khoản có tiêu đề (đứng riêng một dòng, nội dung ở dòng sau): chữ đậm (Phụ lục I, II.6.đ). Dãy khoản ngắn liên tiếp là danh sách, không in đậm */
      out.push(P(l, { b: true, fi: 1, keep: true, al: 'j' }));
    } else {
      out.push(P(l, { fi: 1, al: 'j' }));
    }
  }
  return out;
}
/* Căn cứ ban hành: chữ nghiêng, cuối mỗi dòng dấu chấm phẩy, dòng cuối dấu chấm (Phụ lục I, II.6.a) */
const canCu = list => list.map((x, i) => P(x.replace(/[\s.;,]+$/, '') + (i === list.length - 1 ? '.' : ';'), { i: true, fi: 1, al: 'j' }));
const labelP = (lab, val) => P([{ t: lab + ' ', b: true }].concat(runsOf(val || BLANK)), { fi: 1, al: 'j' });

/* ================= Các thành phần thể thức ================= */
const W = 9354; // bề rộng vùng trình bày: 210 − 30 − 15 = 165 mm = 9.354 twip
const COL = [3654, 5700]; // cột trái (cơ quan) và cột phải (Quốc hiệu, Tiêu ngữ); Quốc hiệu cỡ 13 đậm rộng ≈ 5.390 twip
function soKy(d, T) {
  const n = String(d.so || ''), so = n ? (n.length < 2 ? '0' + n : n) : BLANK, cq = abbrN(d.abbr) || BLANK;
  if (T.k === 'cv') return `Số: ${so}/${cq}${d.dv ? '-' + abbrN(d.dv) : ''}`;
  return `Số: ${so}/${T.ab}-${cq}`;
}
function headerTbl(d, T, withDate) {
  const lt = [], rt = [];
  if (d.org_parent) lt.push(P(up(d.org_parent), { al: 'c', sz: 13, after: 0 }));
  lt.push(P(up(d.org_name || BLANK), { al: 'c', sz: 13, b: true, after: 0, rule: 0.4 }));
  rt.push(P(QH, { al: 'c', sz: 13, b: true, after: 0 }), P(TN, { al: 'c', sz: 14, b: true, after: 0, rule: 1, emw: 12.22 }));
  const lb = [P(soKy(d, T), { al: 'c', sz: 13, after: 0, before: 8 })], rb = [];
  if (T.k === 'cv' && d.trich_yeu) lb.push(P('V/v ' + d.trich_yeu, { al: 'c', sz: 13, before: 6, after: 0 }));
  if (withDate) rb.push(P(dateLine(d.place, d.date), { al: 'c', sz: 14, i: true, after: 0, before: 8 }));
  const parts = [d.org_parent ? up(d.org_parent) : null, up(d.org_name || BLANK) + '        ' + QH, soKy(d, T) + '        ' + TN, withDate ? '                                        ' + dateLine(d.place, d.date) : null].filter(x => x != null);
  const t = TBL(COL, [[lt, rt], [lb, rb]], 'raw'); t.text = parts.join('\n') + (T.k === 'cv' && d.trich_yeu ? '\nV/v ' + d.trich_yeu : '');
  return t;
}
function titleBlocks(T, trich, o = {}) {
  const b = [P(T.tl, { al: 'c', b: true, before: 14, after: trich ? 0 : 8, keep: true })];
  if (trich) b.push(P(trich, { al: 'c', b: true, rule: 0.4, after: 10, keep: true }));
  return b;
}
function kinhGui(list) {
  if (!list.length) return [];
  if (list.length === 1) return [P([{ t: 'Kính gửi: ' }, { t: list[0] }], { al: 'c', after: 8 })];
  return [P('Kính gửi:', { li: 2.6, after: 0, keep: true })].concat(list.map((x, i) => P(`- ${x}${i === list.length - 1 ? '.' : ';'}`, { li: 3.4, after: i === list.length - 1 ? 8 : 0 })));
}
function boxes(d) {
  const out = [], K = { khan: 'KHẨN', thuong_khan: 'THƯỢNG KHẨN', hoa_toc: 'HỎA TỐC' };
  if (d.khan) out.push(P(K[d.khan], { b: true, box: true, al: 'l', after: 4, before: 4 }));
  if (d.pham_vi) out.push(P(d.pham_vi, { b: true, box: true, al: 'l', after: 4, before: 4 }));
  return out;
}
/* Quyền hạn người ký (Phụ lục I, II.7): TM., Q., KT., TL., TUQ. đặt trước chức vụ người đứng đầu hoặc tên tập thể */
function signerBlocks(d) {
  const k = d.ky, r = [];
  if (k.quyen) r.push(P(up(k.quyen), { al: 'c', b: true, after: 0, keep: true }));
  r.push(P(k.chuc_vu ? up(k.chuc_vu) : '[cần bổ sung: chức vụ người ký]', { al: 'c', b: true, after: 0, keep: true }));
  r.push(P(k.name || '[cần bổ sung: họ tên người ký]', { al: 'c', b: true, before: 56, after: 0 }));
  return r;
}
function noiNhanList(d, T) {
  const l = d.noi_nhan.slice();
  if (d.kinh_gui.length && !l.some(x => /^Như trên/i.test(x))) l.unshift('Như trên');
  if (d.luu && !l.some(x => /^Lưu\s*:/i.test(x))) l.push('Lưu: VT' + (d.dv ? ', ' + abbrN(d.dv) : '') + (d.so_ban ? ', ' + d.so_ban : ''));
  return l;
}
function nhanBlocks(d, T) {
  const nn = noiNhanList(d, T), l = [P('Nơi nhận:', { sz: 12, b: true, i: true, after: 0 })].concat(nn.map((x, i) => P(`- ${x}${i === nn.length - 1 ? '.' : ';'}`, { sz: 11, after: 0 })));
  if (d.soan) l.push(P(up(d.soan), { sz: 11, before: 4, after: 0 }));
  return l;
}
function signTbl(d, T, extraLeft) {
  const L = nhanBlocks(d, T).concat(extraLeft || []);
  return TBL([4200, 5154], [[L, signerBlocks(d)]], 'seq');
}
function footBlocks(d) { return d.dia_chi.map((x, i) => Object.assign(P(x, { sz: 11, after: 0 }), { topRule: i === 0 })); }
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
function phuLucBlocks(d, T, p, i, n) {
  const kem = `(Kèm theo ${T.k === 'cv' ? 'Văn bản' : T.tl[0] + T.tl.slice(1).toLowerCase()} số ${d.so ? (d.so.length < 2 ? '0' + d.so : d.so) : BLANK}/${T.k === 'cv' ? (abbrN(d.abbr) || BLANK) + (d.dv ? '-' + abbrN(d.dv) : '') : T.ab + '-' + (abbrN(d.abbr) || BLANK)} ${ntn(d.date)} của ${d.org_name || BLANK})`;
  const b = [P(n > 1 ? `Phụ lục ${ROMAN[i]}` : 'Phụ lục', { al: 'c', b: true, after: 0, keep: true })];
  if (p.ten) b.push(P(up(p.ten), { al: 'c', b: true, sz: 14, after: 0, keep: true }));
  b.push(P(kem, { al: 'c', i: true, rule: 0.35, after: 12, keep: true }));
  return b.concat(bodyBlocks(p.noi_dung, {}));
}

/** Dựng văn bản. Trả về { blocks, sections, footer, text, title } */
function compose(d0) {
  const d = normDoc(d0), T = TYPES[d.loai] || TYPES.congvan, k = T.k, bx = [];
  const hd = headerTbl(d, T, k !== 'bb'); bx.push(hd);
  bx.push(...boxes(d));
  const trich = d.trich_yeu || (k === 'ggt' || k === 'gnp' ? '' : BLANK);
  let leftExtra = null;
  if (k === 'cv') {
    bx.push(P('', { after: 8, sz: 8 }), ...kinhGui(d.kinh_gui), ...bodyBlocks(d.noi_dung || BLANK, { end: true }));
  } else if (k === 'nq' || k === 'qd' || k === 'qdbh') {
    const lower = t => (/^\p{Lu}{2,}/u.test(t) ? t : t.charAt(0).toLocaleLowerCase('vi-VN') + t.slice(1)); // giữ nguyên chữ viết tắt (UBND, HĐND…) ở đầu trích yếu
    const ty = k === 'qd' && trich && !/^(Về việc|V\/v)\b/i.test(trich) ? 'Về việc ' + lower(trich) : trich;
    bx.push(...titleBlocks(T, ty));
    bx.push(P(up(d.tham_quyen || d.org_name || BLANK), { al: 'c', b: true, before: 10, after: 6, keep: true }));
    bx.push(...canCu(d.can_cu.length ? d.can_cu : [`Căn cứ ${BLANK}`]));
    bx.push(P(k === 'nq' ? 'QUYẾT NGHỊ:' : 'QUYẾT ĐỊNH:', { al: 'c', b: true, before: 8, after: 8, keep: true }));
    bx.push(...bodyBlocks(d.noi_dung || BLANK, { end: true }));
  } else if (k === 'cd') {
    bx.push(...titleBlocks(T, trich));
    bx.push(P(`${d.cd.nguoi_dien ? d.cd.nguoi_dien : BLANK} điện:`, { al: 'c', after: 2, keep: true }));
    d.cd.gui.forEach((x, i) => bx.push(P(`- ${x}${i === d.cd.gui.length - 1 ? '.' : ';'}`, { li: 3.4, after: 0 })));
    bx.push(P('', { after: 4, sz: 8 }), ...bodyBlocks(d.noi_dung || BLANK, { end: true }));
  } else if (k === 'gm') {
    bx.push(...titleBlocks(T, trich));
    const g = d.gm;
    bx.push(P([{ t: (d.org_name || BLANK) + ' trân trọng kính mời: ', b: true }].concat(runsOf(g.moi || BLANK)), { fi: 1, al: 'j' }));
    bx.push(labelP('Tới dự', g.du), labelP('Chủ trì:', g.chu_tri), labelP('Thời gian:', g.thoi_gian), labelP('Địa điểm:', g.dia_diem));
    bx.push(P(endMark(g.luu_y || BLANK), { fi: 1, al: 'j' }));
  } else if (k === 'ggt') {
    bx.push(...titleBlocks(T, ''));
    const g = d.ggt;
    bx.push(P([{ t: (d.org_name || BLANK) + ' trân trọng giới thiệu:', b: true }], { fi: 1, al: 'j' }));
    bx.push(labelP('Ông (bà):', g.ho_ten), labelP('Chức vụ:', g.chuc_vu), labelP('Được cử đến:', g.den), labelP('Về việc:', g.ve_viec));
    bx.push(P('Đề nghị Quý cơ quan tạo điều kiện để ông (bà) có tên ở trên hoàn thành nhiệm vụ.', { fi: 1, al: 'j' }));
    bx.push(P(endMark('Giấy này có giá trị đến hết ngày ' + (g.het_ngay && isoOrEmpty(g.het_ngay) ? dmy(g.het_ngay) : BLANK)), { fi: 1, al: 'j' }));
  } else if (k === 'gnp') {
    bx.push(...titleBlocks(T, ''));
    const g = d.gnp, dt = s => (isoOrEmpty(s) ? dmy(s) : BLANK);
    bx.push(P(`Xét Đơn đề nghị nghỉ phép ngày ${dt(g.don_ngay)} của ông (bà) ${g.ho_ten || BLANK}, ${d.org_name || BLANK} cấp cho:`, { fi: 1, al: 'j' }));
    bx.push(labelP('Ông (bà):', g.ho_ten), labelP('Chức vụ:', g.chuc_vu));
    bx.push(P(`Được nghỉ phép trong thời gian ${g.thoi_gian || BLANK}, kể từ ngày ${dt(g.tu_ngay)} đến hết ngày ${dt(g.den_ngay)} tại ${g.tai || BLANK}.`, { fi: 1, al: 'j' }));
    bx.push(P(endMark('Số ngày nghỉ phép nêu trên được tính vào thời gian ' + (g.tinh_vao || BLANK)), { fi: 1, al: 'j' }));
    leftExtra = [P('Xác nhận của cơ quan (tổ chức) hoặc chính quyền địa phương nơi nghỉ phép (nếu cần)', { sz: 12, al: 'c', b: true, before: 10, after: 0 }), P('Họ và tên', { sz: 12, al: 'c', b: true, before: 40, after: 0 })];
  } else if (k === 'bb') {
    bx.push(...titleBlocks(T, trich));
    const g = d.bb, bd = /^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}:\d{2})/.exec(g.bat_dau || '');
    bx.push(labelP('Thời gian bắt đầu:', bd ? `${hm(bd[2])}, ngày ${dmy(bd[1])}` : g.bat_dau || BLANK), labelP('Địa điểm:', g.dia_diem), labelP('Thành phần tham dự:', g.thanh_phan));
    if (g.vang) bx.push(labelP('Vắng mặt:', g.vang));
    bx.push(labelP('Chủ trì (chủ tọa):', g.chu_toa), labelP('Thư ký (người ghi biên bản):', g.thu_ky));
    bx.push(P('Nội dung (theo diễn biến cuộc họp/hội nghị/hội thảo):', { b: true, fi: 1, keep: true }), ...bodyBlocks(d.noi_dung || BLANK, { plain: true, heads: false }));
    bx.push(P(`Cuộc họp kết thúc vào ${hm(g.ket_thuc)}, ${bd ? ntn(bd[1]) : 'ngày … tháng … năm …'}./.`, { b: true, fi: 1, al: 'j' }));
    const nn = nhanBlocks(d, T), ky = d.ky;
    const two = [[P('THƯ KÝ', { al: 'c', b: true, after: 0, keep: true }), P(g.thu_ky ? g.thu_ky.replace(/^(.*?)\s*[,–-].*$/, '$1') : '[cần bổ sung: họ tên thư ký]', { al: 'c', b: true, before: 56, after: 0 })],
      [].concat(ky.quyen ? [P(up(ky.quyen), { al: 'c', b: true, after: 0, keep: true })] : [], [P(ky.chuc_vu ? up(ky.chuc_vu) : 'CHỦ TỌA', { al: 'c', b: true, after: 0, keep: true }), P(ky.name || '[cần bổ sung: họ tên chủ tọa]', { al: 'c', b: true, before: 56, after: 0 })])];
    bx.push(Object.assign(TBL([4677, 4677], [two], 'zip'), { before: 10 }), P('', { after: 4, sz: 8 }), TBL([4200, 5154], [[nn, []]], 'seq'));
  } else { // tl: văn bản có tên loại (Mẫu 1.4)
    bx.push(...titleBlocks(T, trich), ...kinhGui(d.kinh_gui));
    if (d.can_cu.length) bx.push(...canCu(d.can_cu));
    if (d.mo_dau) bx.push(P(d.mo_dau, { fi: 1, al: 'j' }));
    bx.push(...bodyBlocks(d.noi_dung || BLANK, { end: true }));
  }
  if (k !== 'bb') bx.push(Object.assign(signTbl(d, T, leftExtra), { before: 10 }));
  const sections = [bx];
  d.phu_luc.forEach((p, i) => sections.push(phuLucBlocks(d, T, p, i, d.phu_luc.length)));
  const foot = footBlocks(d);
  const text = sections.map(s => blocksText(s)).join('\n\n') + (foot.length ? '\n\n' + foot.map(plain).join('\n') : '');
  return { blocks: bx, sections, footer: foot, text, title: `${T.ten}${d.trich_yeu ? ': ' + d.trich_yeu : ''}`.slice(0, 200), doc: d };
}
/* Văn bản thuần của các khối (dùng để sao chép, lưu vào Tài liệu) */
function blocksText(bl) {
  const o = [];
  for (const b of bl) {
    if (b.k === 'p') { const t = plain(b); if (b.before >= 10 && o.length) o.push(''); if (t || b.after >= 6) o.push(t); continue; }
    if (b.text) { o.push(b.text); continue; }
    if (b.before >= 10 && o.length) o.push('');
    if (b.mode === 'zip') { const cols = b.rows[0].map(c => c.map(plain)); const n = Math.max(...cols.map(c => c.length)); for (let i = 0; i < n; i++) o.push(cols.map((c, j) => (j < cols.length - 1 ? (c[i] || '').padEnd(44) : c[i] || '')).join('').replace(/\s+$/, '')); }
    else b.rows.forEach(r => r.forEach((c, j) => { const l = c.map(plain).filter(x => x !== ''); if (l.length) { if (j > 0 && o.length) o.push(''); o.push(...l); } }));
  }
  return o.join('\n');
}

/* ================= Xuất HTML (xem trước; tệp Word dạng HTML cho cách cũ) ================= */
function runHtml(r, p) {
  let s = esc(r.t); const st = [];
  if (r.b && !p.b) st.push('font-weight:bold'); if (r.i && !p.i) st.push('font-style:italic'); if (r.hl) st.push('background:#fff2a8');
  return st.length ? `<span style="${st.join(';')}">${s}</span>` : s;
}
function pHtml(p) {
  const css = [`font-size:${p.sz}pt`, `text-align:${AL[p.al]}`, `margin:${p.before}pt 0 ${p.after}pt`, 'line-height:1.15'];
  if (p.b) css.push('font-weight:bold'); if (p.i) css.push('font-style:italic');
  if (p.fi) css.push(`text-indent:${p.fi}cm`); if (p.li) css.push(`margin-left:${p.li}cm`);
  const inner = p.r.map(r => runHtml(r, p)).join('') || '&nbsp;';
  if (p.rule) return `<div style="text-align:center;margin:${p.before}pt 0 ${p.after}pt"><div style="display:inline-block;max-width:100%;font-size:${p.sz}pt;line-height:1.15;${p.b ? 'font-weight:bold;' : ''}${p.i ? 'font-style:italic;' : ''}">${inner}<div style="border-top:1px solid #000;width:${Math.round(p.rule * 100)}%;margin:2pt auto 0"></div></div></div>`;
  if (p.box) return `<div style="margin:${p.before}pt 0 ${p.after}pt"><span style="display:inline-block;border:1px solid #000;padding:1pt 8pt;font-size:${p.sz}pt;font-weight:bold">${inner}</span></div>`;
  const top = p.topRule ? 'border-top:1px solid #000;padding-top:3pt;margin-top:14pt;' : '';
  return `<p style="${css.join(';')};${top}">${inner}</p>`;
}
function blockHtml(b) {
  if (b.k === 'p') return pHtml(b);
  const tw = b.w.reduce((a, x) => a + x, 0);
  return `<table style="border-collapse:collapse;width:100%;table-layout:fixed;margin-top:${b.before || 0}pt"><colgroup>${b.w.map(x => `<col style="width:${(x / tw * 100).toFixed(2)}%">`).join('')}</colgroup>${b.rows.map(r => `<tr>${r.map(c => `<td style="vertical-align:top;padding:0">${c.map(blockHtml).join('')}</td>`).join('')}</tr>`).join('')}</table>`;
}
function toHtml(m) {
  const s0 = m.sections[0].map(blockHtml).join('') + m.footer.map(blockHtml).join('');
  const rest = m.sections.slice(1).map((s, i) => `<div style="border-top:1px dashed #888;margin:18pt 0 12pt;padding-top:6pt;color:#555;font-size:9pt;font-family:sans-serif">Trang mới — Phụ lục</div>` + s.map(blockHtml).join('')).join('');
  return s0 + rest;
}
const S = { doc: 'font-family:"Times New Roman",serif;font-size:14pt;line-height:1.25' };
/** Bọc thành tệp Word (HTML) khổ A4, lề theo Phụ lục I: trên/dưới 20 mm, trái 30 mm, phải 15 mm. Cách cũ; nên dùng docx() */
function wordDoc(html, title) {
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>@page WordSection1{size:210mm 297mm;margin:20mm 15mm 20mm 30mm}div.WordSection1{page:WordSection1}body{${S.doc}}p{margin:0 0 6pt}</style></head><body><div class="WordSection1">${html}</div></body></html>`;
}

/* ================= Xuất .docx (Office Open XML; không phụ thuộc thư viện) ================= */
const xe = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const CHW = { cap: 0.66, space: 0.25, digit: 0.5, low: 0.47, punct: 0.3 };
function estW(p, cw) { // ước độ rộng dòng chữ (twip) để vẽ đường kẻ ngắn hơn dòng chữ; Times New Roman đậm
  if (p.emw) return Math.round(p.emw * p.sz * 20);
  const t = plain(p); let em = 0;
  for (const c of t) em += c === ' ' ? CHW.space : /\d/.test(c) ? CHW.digit : /[.,;:\-–()/]/.test(c) ? CHW.punct : c === c.toLocaleUpperCase('vi-VN') && c !== c.toLocaleLowerCase('vi-VN') ? CHW.cap : CHW.low;
  return Math.min(cw, Math.round(em * p.sz * 20 * (p.b ? 1.04 : 1)));
}
const rpr = (r, p) => `<w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman"/>${r.b || p.b ? '<w:b/><w:bCs/>' : ''}${r.i || p.i ? '<w:i/><w:iCs/>' : ''}<w:sz w:val="${Math.round(p.sz * 2)}"/><w:szCs w:val="${Math.round(p.sz * 2)}"/>${r.hl ? '<w:highlight w:val="yellow"/>' : ''}</w:rPr>`;
function pXml(p, cw, extraPPr) {
  const body = p.r.length ? p.r.map(r => `<w:r>${rpr(r, p)}<w:t xml:space="preserve">${xe(r.t)}</w:t></w:r>`).join('') : '';
  let ppr = (p.keep ? '<w:keepNext/>' : '');
  let bdr = '', l = Math.round(p.li * 567), r = 0, f = Math.round(p.fi * 567);
  if (p.topRule) bdr = '<w:pBdr><w:top w:val="single" w:sz="4" w:space="4" w:color="000000"/></w:pBdr>';
  if (p.box) { const bw = Math.min(cw, estW(p, cw) + 500); r = Math.max(0, cw - bw); bdr = '<w:pBdr><w:top w:val="single" w:sz="6" w:space="1" w:color="000000"/><w:left w:val="single" w:sz="6" w:space="4" w:color="000000"/><w:bottom w:val="single" w:sz="6" w:space="1" w:color="000000"/><w:right w:val="single" w:sz="6" w:space="4" w:color="000000"/></w:pBdr>'; }
  ppr += bdr + `<w:spacing w:before="${Math.round(p.before * 20)}" w:after="${p.rule ? 0 : Math.round(p.after * 20)}" w:line="${p.line ? Math.round(p.line * 240) : 276}" w:lineRule="auto"/>`;
  ppr += `<w:ind w:left="${l}" w:right="${r}"${f ? ` w:firstLine="${f}"` : ''}/><w:jc w:val="${p.box ? 'left' : { l: 'left', c: 'center', j: 'both', r: 'right' }[p.al]}"/><w:rPr><w:sz w:val="${Math.round(p.sz * 2)}"/></w:rPr>`;
  let out = `<w:p><w:pPr>${ppr}${extraPPr || ''}</w:pPr>${body}</w:p>`;
  if (p.rule) { // đường kẻ là đoạn văn riêng có viền dưới, thụt hai bên để dài bằng tỷ lệ của dòng chữ
    const tw = estW(p, cw), len = Math.max(200, Math.round(tw * Math.min(1, p.rule))), side = Math.max(0, Math.round((cw - len) / 2));
    out += `<w:p><w:pPr><w:keepNext/><w:pBdr><w:bottom w:val="single" w:sz="4" w:space="0" w:color="000000"/></w:pBdr><w:spacing w:before="0" w:after="${Math.round(p.after * 20)}" w:line="40" w:lineRule="exact"/><w:ind w:left="${side}" w:right="${side}"/><w:jc w:val="center"/><w:rPr><w:sz w:val="2"/></w:rPr></w:pPr></w:p>`;
  }
  return out;
}
function blockXml(b, cw) {
  if (b.k === 'p') return pXml(b, cw);
  const tw = b.w.reduce((a, x) => a + x, 0), w = b.w.map(x => Math.round(x * cw / tw));
  const rows = b.rows.map(r => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${r.map((c, j) => `<w:tc><w:tcPr><w:tcW w:w="${w[j]}" w:type="dxa"/></w:tcPr>${(c.length ? c : [P('', { after: 0 })]).map(x => blockXml(x, w[j])).join('')}${c.length && c[c.length - 1].k === 'tbl' ? '<w:p/>' : ''}</w:tc>`).join('')}</w:tr>`).join('');
  const gap = b.before ? `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="${Math.round(b.before * 20)}" w:lineRule="exact"/><w:rPr><w:sz w:val="2"/></w:rPr></w:pPr></w:p>` : '';
  return gap + `<w:tbl><w:tblPr><w:tblW w:w="${cw}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="0" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${w.map(x => `<w:gridCol w:w="${x}"/>`).join('')}</w:tblGrid>${rows}</w:tbl>`;
}
const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const PG = { pgSz: '<w:pgSz w:w="11906" w:h="16838"/>', pgMar: '<w:pgMar w:top="1134" w:right="851" w:bottom="1134" w:left="1701" w:header="567" w:footer="567" w:gutter="0"/>' };
function sectPr(first, i) { // i = 0: văn bản chính (chân trang đầu có địa chỉ cơ quan); i > 0: phụ lục (đánh lại số trang từ 1)
  return `<w:sectPr><w:headerReference w:type="default" r:id="rIdH"/><w:footerReference w:type="first" r:id="${first ? 'rIdF' : 'rIdFE'}"/>${PG.pgSz}${PG.pgMar}${i ? '<w:pgNumType w:start="1"/>' : ''}<w:titlePg/></w:sectPr>`;
}
const CRCT = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = u8 => { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRCT[(c ^ u8[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function zipStore(entries) { // entries: [{ name, text }]; không nén (đủ dùng cho tệp văn bản nhỏ)
  const te = new TextEncoder(), parts = [], cd = []; let off = 0;
  for (const e of entries) {
    const name = te.encode(e.name), data = te.encode(e.text), crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30)); h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true); h.setUint16(10, 0, true); h.setUint16(12, 0x21, true);
    h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
    const c = new DataView(new ArrayBuffer(46)); c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true); c.setUint16(12, 0, true); c.setUint16(14, 0x21, true);
    c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
    parts.push(new Uint8Array(h.buffer), name, data); cd.push(new Uint8Array(c.buffer), name); off += 30 + name.length + data.length;
  }
  const cdSize = cd.reduce((a, x) => a + x.length, 0), end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true); end.setUint32(12, cdSize, true); end.setUint32(16, off, true);
  const all = parts.concat(cd, [new Uint8Array(end.buffer)]), out = new Uint8Array(all.reduce((a, x) => a + x.length, 0)); let p = 0;
  for (const x of all) { out.set(x, p); p += x.length; }
  return out;
}
/** Tệp .docx: A4, lề 20/15/20/30 mm, Times New Roman, số trang canh giữa lề trên từ trang 2, địa chỉ cơ quan ở chân trang đầu, phụ lục đánh số trang riêng */
function docx(m, title) {
  const sec = m.sections.map((bl, i) => {
    const xml = bl.map(b => blockXml(b, W)).join('');
    return i < m.sections.length - 1 ? xml + `<w:p><w:pPr><w:spacing w:before="0" w:after="0"/>${sectPr(i === 0, i)}</w:pPr></w:p>` : xml;
  }).join('') + sectPr(m.sections.length === 1, m.sections.length - 1);
  const rp = '<w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="28"/></w:rPr>';
  const fld = `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r>${rp}<w:fldChar w:fldCharType="begin"/></w:r><w:r>${rp}<w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r>${rp}<w:fldChar w:fldCharType="separate"/></w:r><w:r>${rp}<w:t>2</w:t></w:r><w:r>${rp}<w:fldChar w:fldCharType="end"/></w:r></w:p>`;
  const files = [
    { name: '[Content_Types].xml', text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/word/footer2.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>' },
    { name: '_rels/.rels', text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>' },
    { name: 'docProps/core.xml', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xe(title || m.title)}</dc:title><dc:creator>SmartOffice</dc:creator></cp:coreProperties>` },
    { name: 'word/_rels/document.xml.rels', text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdS" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdH" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rIdF" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/><Relationship Id="rIdFE" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer2.xml"/></Relationships>' },
    { name: 'word/styles.xml', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${NS}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman"/><w:color w:val="000000"/><w:sz w:val="28"/><w:szCs w:val="28"/><w:lang w:val="vi-VN" w:eastAsia="vi-VN" w:bidi="ar-SA"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style></w:styles>` },
    { name: 'word/header1.xml', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr ${NS}>${fld}</w:hdr>` },
    { name: 'word/footer1.xml', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ${NS}>${m.footer.length ? m.footer.map(b => pXml(b, W)).join('') : '<w:p/>'}</w:ftr>` },
    { name: 'word/footer2.xml', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ${NS}><w:p/></w:ftr>` },
    { name: 'word/document.xml', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${sec}</w:body></w:document>` }
  ];
  return zipStore(files);
}

/* ================= Kiểm tra thể thức (Điều 12 khoản 2: người được giao kiểm tra thể thức, kỹ thuật trình bày) ================= */
/** Trả về danh sách { level: 'loi' | 'luu-y', msg, ref } */
function check(d0, today) {
  const d = normDoc(d0), T = TYPES[d.loai] || TYPES.congvan, k = T.k, o = [];
  const add = (level, msg, ref) => o.push({ level, msg, ref });
  const all = JSON.stringify(d);
  if (!d.org_name) add('loi', 'Chưa nhập tên cơ quan, tổ chức ban hành văn bản.', 'Điều 8 khoản 2 điểm b; Phụ lục I, II.2');
  if (!d.abbr) add('loi', 'Chưa nhập chữ viết tắt tên cơ quan để lập ký hiệu văn bản.', 'Phụ lục I, II.3 điểm b');
  if (k === 'cv' && !d.dv) add('luu-y', 'Công văn: ký hiệu gồm chữ viết tắt tên cơ quan và tên đơn vị soạn thảo hoặc lĩnh vực (ví dụ UBND-VX).', 'Phụ lục I, II.3 điểm b');
  if (!d.so) add('luu-y', 'Số văn bản để trống để Văn thư cấp số sau khi có chữ ký (chậm nhất trong ngày làm việc tiếp theo).', 'Điều 15 khoản 2');
  if (k !== 'bb' && !d.place) add('loi', 'Chưa nhập địa danh ban hành.', 'Phụ lục I, II.4 điểm a');
  if (k !== 'bb' && !d.date) add('loi', 'Chưa nhập ngày, tháng, năm ban hành.', 'Phụ lục I, II.4 điểm b');
  if (!['ggt', 'gnp', 'gm'].includes(k) && !d.trich_yeu) add('loi', 'Chưa có trích yếu nội dung văn bản.', 'Điều 8 khoản 2 điểm đ; Phụ lục I, II.5');
  if (d.trich_yeu.length > 250) add('luu-y', 'Trích yếu nên là một câu ngắn gọn hoặc một cụm từ phản ánh khái quát nội dung.', 'Phụ lục I, II.5 điểm a');
  if (['nq', 'qd', 'qdbh'].includes(k) && !d.can_cu.length) add('loi', 'Chưa có căn cứ ban hành văn bản.', 'Phụ lục I, II.6 điểm a');
  if (['cv', 'tl'].includes(k) && ['totrinh', 'baocao'].includes(d.loai) && !d.kinh_gui.length) add('loi', 'Tờ trình, báo cáo gửi cấp trên cần có “Kính gửi”.', 'Phụ lục I, II.9 điểm b');
  if (k === 'cv' && !d.kinh_gui.length) add('loi', 'Công văn cần có “Kính gửi”.', 'Phụ lục I, II.9 điểm b');
  if (!d.noi_dung && !['gm', 'ggt', 'gnp'].includes(k)) add('loi', 'Chưa có nội dung văn bản.', 'Điều 8 khoản 2 điểm e');
  if (k !== 'bb' && !d.ky.chuc_vu) add('loi', 'Chưa nhập chức vụ người ký.', 'Điều 8 khoản 2 điểm g; Phụ lục I, II.7 điểm c');
  if (k !== 'bb' && !d.ky.name) add('loi', 'Chưa nhập họ tên người ký.', 'Phụ lục I, II.7 điểm c');
  if (/^(TS|PGS|GS|ThS|BS|Ông|Bà)\b\.?\s/i.test(d.ky.name)) add('loi', 'Trước họ tên người ký không ghi học hàm, học vị, danh hiệu (trừ trường hợp do người đứng đầu cơ quan quản lý ngành quy định).', 'Phụ lục I, II.7 điểm c');
  if (d.ky.quyen && !/^(TM|Q|KT|TL|TUQ)\.\s*\S/.test(d.ky.quyen)) add('loi', 'Quyền hạn người ký phải bắt đầu bằng TM., Q., KT., TL. hoặc TUQ.', 'Phụ lục I, II.7 điểm b');
  if (['KT.', 'TL.', 'TUQ.', 'Q.'].some(x => d.ky.quyen.startsWith(x)) && !d.ky.chuc_vu) add('loi', 'Ký thay, ký thừa lệnh, ký thừa ủy quyền, giao quyền: cần ghi cả chức vụ của người ký.', 'Phụ lục I, II.7 điểm b');
  if (!d.noi_nhan.length && !d.kinh_gui.length && k !== 'bb') add('luu-y', 'Chưa có nơi nhận ngoài nơi lưu văn bản.', 'Điều 8 khoản 2 điểm i; Phụ lục I, II.9');
  if (/\[cần bổ sung/.test(all)) add('loi', 'Còn chỗ đánh dấu “[cần bổ sung: …]” (tô vàng trong bản xem trước). Hãy bổ sung trước khi trình ký.', 'Điều 12 khoản 1');
  if (/^Điều\s+\d+\.?\s*$/m.test(d.noi_dung)) add('loi', 'Có Điều chưa có tiêu đề.', 'Phụ lục I, II.6 điểm d');
  if (d.abbr && /[a-zà-ỹ]/.test(d.abbr)) add('luu-y', 'Chữ viết tắt trong ký hiệu được in hoa, không cách chữ; hệ thống tự chuẩn hóa khi dựng văn bản.', 'Phụ lục I, II.3 điểm c');
  if (d.date && today && d.date < today) add('luu-y', 'Ngày ban hành đã qua so với hôm nay.', 'Phụ lục I, II.4 điểm b');
  if (d.so_ban && !/^\d+$/.test(d.so_ban)) add('luu-y', 'Số lượng bản phát hành ghi bằng chữ số Ả Rập.', 'Phụ lục I, III.3');
  if (d.phu_luc.some(p => !p.noi_dung)) add('luu-y', 'Có phụ lục chưa có nội dung.', 'Phụ lục I, III.1');
  if (d.phu_luc.length && !/phụ lục/i.test(d.noi_dung + d.mo_dau)) add('luu-y', 'Văn bản có phụ lục thì trong nội dung phải có chỉ dẫn về phụ lục đó.', 'Phụ lục I, III.1 điểm a');
  return o;
}

/* ================= Tương thích cũ: biên bản, thông báo kết luận cuộc họp (ADR-011) ================= */
/** Biên bản cuộc họp (Mẫu 1.9). o: { org_parent, org_name, abbr, trich_yeu, start_at, end_time, place, chu_tri{name,title}, thu_ky{name,title},
 *  present[{name,title}], absent[{name,title,reason}], dien_bien[{ten, y_kien}], ket_luan[], nhiem_vu[] (chuỗi), noi_nhan[] } */
function bienBan(o) {
  const tp = (o.present || []).map(person).filter(Boolean), vang = (o.absent || []).map(p => person(p) + (p.reason ? ` (${p.reason})` : '')).filter(Boolean), body = [];
  if ((o.dien_bien || []).length) o.dien_bien.forEach((x, i) => body.push(`${i + 1}. ${x.ten ? x.ten + ': ' : ''}${x.y_kien}`));
  if ((o.ket_luan || []).length) { body.push('## Kết luận của chủ trì cuộc họp:'); o.ket_luan.forEach((x, i) => body.push(`${i + 1}. ${x}`)); }
  if ((o.nhiem_vu || []).length) { body.push('## Phân công thực hiện:'); o.nhiem_vu.forEach(n => body.push('- ' + n)); }
  const st = /^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}:\d{2})/.exec(o.start_at || '');
  const d = {
    loai: 'bienban', org_parent: o.org_parent, org_name: o.org_name, abbr: o.abbr, trich_yeu: o.trich_yeu, noi_dung: body.join('\n'), noi_nhan: o.noi_nhan && o.noi_nhan.length ? o.noi_nhan : ['Thành phần dự họp', 'Lưu: VT, hồ sơ'],
    bb: { bat_dau: st ? `${st[1]} ${st[2]}` : '', dia_diem: o.place || '', thanh_phan: tp.join('; '), vang: vang.join('; '), chu_toa: person(o.chu_tri), thu_ky: o.thu_ky && o.thu_ky.name || '', ket_thuc: o.end_time || '' },
    ky: { quyen: '', chuc_vu: 'CHỦ TỌA', name: o.chu_tri && o.chu_tri.name || '' }, luu: false
  };
  const m = compose(d);
  return Object.assign(m, { html: toHtml(m) });
}
/** Thông báo kết luận cuộc họp (Mẫu 1.4 – văn bản có tên loại). o: { org_parent, org_name, abbr, place, date, trich_yeu, mo_dau,
 *  ket_luan[], nhiem_vu[], ky{quyen, chuc_vu, name}, noi_nhan[] } */
function thongBao(o) {
  const body = [];
  (o.ket_luan || []).forEach((x, i) => body.push(`${i + 1}. ${x}`));
  if ((o.nhiem_vu || []).length) { body.push(`${(o.ket_luan || []).length + 1}. Tổ chức thực hiện:`); o.nhiem_vu.forEach(n => body.push('- ' + n)); }
  body.push(`${o.org_name || BLANK} thông báo để các cơ quan, đơn vị, cá nhân liên quan biết, thực hiện./.`);
  const d = { loai: 'thongbao', org_parent: o.org_parent, org_name: o.org_name, abbr: o.abbr, place: o.place, date: o.date, trich_yeu: o.trich_yeu, mo_dau: o.mo_dau || BLANK, noi_dung: body.join('\n'), ky: o.ky || {}, noi_nhan: o.noi_nhan && o.noi_nhan.length ? o.noi_nhan : ['Thành phần dự họp', 'Lưu: VT'], luu: false };
  const m = compose(d);
  return Object.assign(m, { html: toHtml(m) });
}
/** Văn bản mới, các trường rỗng */
const emptyDoc = (loai, base) => normDoc(Object.assign({ loai }, base || {}));

const API = { dateLine, bienBan, thongBao, wordDoc, soKyHieu, QH, TN, TYPES, GROUPS, FIELDS, normDoc, emptyDoc, compose, toHtml, docx, zipStore, crc32, check, bodyBlocks, ntn, dmy, endMark, soKy, signerBlocks, noiNhanList, blocksText };
if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.SO_ND30 = API;
})(typeof window !== 'undefined' ? window : this);
