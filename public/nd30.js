/* SmartOffice — Dựng văn bản hành chính theo thể thức Nghị định 30/2020/NĐ-CP (ADR-011).
 * Căn cứ đã đối chiếu (thuvienphapluat.vn, 07/11/2026):
 *  - Điều 8 khoản 2: thành phần thể thức chính (Quốc hiệu và Tiêu ngữ; tên cơ quan ban hành; số, ký hiệu; địa danh và thời gian;
 *    tên loại và trích yếu; nội dung; chức vụ, họ tên, chữ ký người có thẩm quyền; dấu, chữ ký số; nơi nhận).
 *  - Phụ lục I Phần I: khổ A4; lề trên, dưới 20–25 mm, trái 30–35 mm, phải 15–20 mm; Times New Roman; Quốc hiệu in hoa cỡ 12–13 đứng đậm;
 *    Tiêu ngữ cỡ 13–14 đứng đậm, gạch nối có cách chữ, đường kẻ dưới bằng độ dài dòng chữ; tên cơ quan chủ quản in hoa cỡ 12–13 đứng;
 *    tên cơ quan ban hành in hoa cỡ 12–13 đứng đậm, đường kẻ dưới 1/3–1/2 dòng chữ; "Số:" cỡ 13, số nhỏ hơn 10 thêm 0, ký hiệu in hoa.
 *  - Phụ lục III: chữ viết tắt Thông báo = TB, Biên bản = BB; Mẫu 1.4 (văn bản có tên loại), Mẫu 1.9 (biên bản).
 * Chưa đối chiếu từng chữ với tệp Word mẫu 1.4, 1.9 gốc (trang tải mẫu yêu cầu tài khoản): bố cục dựng theo các thành phần trên.
 * Thể thức do mã dựng (cố định); trợ lý AI chỉ cung cấp nội dung. Dùng được trong Node (kiểm thử) và trình duyệt (window.SO_ND30). */
(function (root) {
'use strict';
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const up = s => String(s || '').toLocaleUpperCase('vi-VN');
const p2 = n => String(n).padStart(2, '0');
const QH = 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', TN = 'Độc lập - Tự do - Hạnh phúc';
const BLANK = '…';

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
const soKyHieu = (loai, abbr) => `Số: ${BLANK}/${loai}${abbr ? '-' + up(abbr).replace(/\s+/g, '') : '-' + BLANK}`;
const person = p => p ? [p.title, p.name].filter(Boolean).join(' ') : '';

/* ---------- Khối HTML dùng chung (tệp Word mở từ HTML) ---------- */
const S = {
  doc: 'font-family:"Times New Roman",serif;font-size:14pt;line-height:1.25',
  t: 'border-collapse:collapse;width:100%', c: 'vertical-align:top;text-align:center;padding:0',
  rule: w => `<div style="margin:2pt auto 0;border-top:1px solid #000;width:${w}"></div>`
};
function headerHtml(o, kyHieu, withDate) {
  return `<table style="${S.t}"><tr>
<td style="${S.c};width:42%">${o.org_parent ? `<div style="font-size:13pt">${esc(up(o.org_parent))}</div>` : ''}<div style="font-size:13pt;font-weight:bold">${esc(up(o.org_name || BLANK))}</div>${S.rule('40%')}<div style="font-size:13pt;margin-top:6pt">${esc(kyHieu)}</div></td>
<td style="${S.c};width:58%"><div style="font-size:13pt;font-weight:bold">${QH}</div><div style="font-size:14pt;font-weight:bold">${TN}</div>${S.rule('62%')}${withDate ? `<div style="font-size:14pt;font-style:italic;margin-top:6pt">${esc(withDate)}</div>` : ''}</td>
</tr></table>`;
}
const titleHtml = (loai, trichYeu) => `<div style="text-align:center;margin-top:18pt;font-size:14pt;font-weight:bold">${esc(loai)}</div>${trichYeu ? `<div style="text-align:center;font-size:14pt;font-weight:bold">${esc(trichYeu)}</div>` : ''}${S.rule('25%')}`;
const para = (t, extra = '') => `<p style="margin:0 0 6pt;text-indent:1cm;text-align:justify;${extra}">${esc(t)}</p>`;
const signHtml = (left, right) => `<table style="${S.t};margin-top:12pt"><tr><td style="vertical-align:top;width:50%;padding:0">${left}</td><td style="${S.c};width:50%">${right}</td></tr></table>`;
const signer = (quyen, chucVu, name, note) => `${quyen ? `<div style="font-weight:bold;font-size:14pt">${esc(up(quyen))}</div>` : ''}<div style="font-weight:bold;font-size:14pt">${esc(up(chucVu || ''))}</div>${note === null ? '' : `<div style="font-style:italic;font-size:13pt">${esc(note || '(Ký, ghi rõ họ tên)')}</div>`}<div style="height:60pt"></div><div style="font-weight:bold;font-size:14pt">${esc(name || '')}</div>`;
const noiNhanHtml = list => `<div style="font-size:12pt;font-weight:bold;font-style:italic">Nơi nhận:</div>${list.map((x, i) => `<div style="font-size:11pt">- ${esc(x)}${i === list.length - 1 ? '.' : ';'}</div>`).join('')}`;
const noiNhanText = list => 'Nơi nhận:\n' + list.map((x, i) => `- ${x}${i === list.length - 1 ? '.' : ';'}`).join('\n');
function headerText(o, kyHieu, withDate) {
  return [o.org_parent ? up(o.org_parent) : null, up(o.org_name || BLANK) + '        ' + QH, kyHieu + '        ' + TN, withDate ? '                                        ' + withDate : null].filter(x => x != null).join('\n');
}

/** Biên bản cuộc họp (Mẫu 1.9). o: { org_parent, org_name, abbr, trich_yeu, start_at, end_time, place, chu_tri{name,title}, thu_ky{name,title},
 *  present[{name,title}], absent[{name,title,reason}], dien_bien[{ten, y_kien}], ket_luan[], nhiem_vu[] (chuỗi), noi_nhan[] } */
function bienBan(o) {
  const ky = soKyHieu('BB', o.abbr), tp = (o.present || []).map(person).filter(Boolean), vang = (o.absent || []).map(p => person(p) + (p.reason ? ` (${p.reason})` : '')).filter(Boolean);
  const head = [
    ['Thời gian bắt đầu', `${hm(o.start_at)}, ngày ${dmy(o.start_at)}`],
    ['Địa điểm', o.place || BLANK],
    ['Thành phần tham dự', tp.length ? tp.join('; ') : BLANK],
    ...(vang.length ? [['Vắng mặt', vang.join('; ')]] : []),
    ['Chủ trì (chủ tọa)', person(o.chu_tri) || BLANK],
    ['Thư ký (người ghi biên bản)', person(o.thu_ky) || BLANK]
  ];
  const body = [];
  if ((o.dien_bien || []).length) { body.push('Nội dung (theo diễn biến cuộc họp):'); o.dien_bien.forEach((d, i) => body.push(`${i + 1}. ${d.ten ? d.ten + ': ' : ''}${d.y_kien}`)); }
  else body.push('Nội dung (theo diễn biến cuộc họp): ' + BLANK);
  if ((o.ket_luan || []).length) { body.push('Kết luận của chủ trì cuộc họp:'); o.ket_luan.forEach((k, i) => body.push(`${i + 1}. ${k}`)); }
  if ((o.nhiem_vu || []).length) { body.push('Phân công thực hiện:'); o.nhiem_vu.forEach(n => body.push('- ' + n)); }
  const end = `Cuộc họp kết thúc vào ${hm(o.end_time)}, ${ntn(o.start_at)}./.`;
  const nn = o.noi_nhan && o.noi_nhan.length ? o.noi_nhan : ['Thành phần dự họp', 'Lưu: VT, hồ sơ'];
  const text = [headerText(o, ky), '', 'BIÊN BẢN', o.trich_yeu || '', '', ...head.map(([k, v]) => `${k}: ${v}`), '', ...body, '', end, '',
    'THƯ KÝ                                        CHỦ TỌA', '(Ký, ghi rõ họ tên)                    (Ký, ghi rõ họ tên, đóng dấu nếu có)', '',
    `${o.thu_ky && o.thu_ky.name || ''}                                        ${o.chu_tri && o.chu_tri.name || ''}`, '', noiNhanText(nn)].join('\n');
  const html = headerHtml(o, ky) + titleHtml('BIÊN BẢN', o.trich_yeu) + '<div style="margin-top:12pt"></div>' +
    head.map(([k, v]) => para(`${k}: ${v}`)).join('') +
    body.map(l => para(l, /:$/.test(l) ? 'font-weight:bold' : '')).join('') + para(end) +
    signHtml(`<div style="text-align:center">${signer('', 'THƯ KÝ', o.thu_ky && o.thu_ky.name)}</div>`, signer('', 'CHỦ TỌA', o.chu_tri && o.chu_tri.name, '(Ký, ghi rõ họ tên, đóng dấu nếu có)')) +
    `<div style="margin-top:12pt">${noiNhanHtml(nn)}</div>`;
  return { text, html };
}

/** Thông báo kết luận cuộc họp (Mẫu 1.4 – văn bản có tên loại). o: { org_parent, org_name, abbr, place, date, trich_yeu, mo_dau,
 *  ket_luan[], nhiem_vu[], ky{quyen, chuc_vu, name}, noi_nhan[] } */
function thongBao(o) {
  const ky = soKyHieu('TB', o.abbr), date = dateLine(o.place, o.date);
  const body = [o.mo_dau || BLANK];
  (o.ket_luan || []).forEach((k, i) => body.push(`${i + 1}. ${k}`));
  if ((o.nhiem_vu || []).length) { body.push(`${(o.ket_luan || []).length + 1}. Tổ chức thực hiện:`); o.nhiem_vu.forEach(n => body.push('- ' + n)); }
  body.push(`${o.org_name || BLANK} thông báo để các cơ quan, đơn vị, cá nhân liên quan biết, thực hiện./.`);
  const k = o.ky || {}, nn = o.noi_nhan && o.noi_nhan.length ? o.noi_nhan : ['Thành phần dự họp', 'Lưu: VT'];
  const text = [headerText(o, ky, date), '', 'THÔNG BÁO', o.trich_yeu || '', '', ...body, '', noiNhanText(nn), '', [up(k.quyen), up(k.chuc_vu)].filter(Boolean).join('\n'), '', k.name || ''].join('\n');
  const html = headerHtml(o, ky, date) + titleHtml('THÔNG BÁO', o.trich_yeu) + '<div style="margin-top:12pt"></div>' +
    body.map(l => para(l)).join('') + signHtml(noiNhanHtml(nn), signer(k.quyen, k.chuc_vu, k.name, null)) ;
  return { text, html };
}

/** Bọc thành tệp Word (HTML) khổ A4, lề theo Phụ lục I: trên/dưới 20 mm, trái 30 mm, phải 15 mm */
function wordDoc(html, title) {
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>@page WordSection1{size:210mm 297mm;margin:20mm 15mm 20mm 30mm}div.WordSection1{page:WordSection1}body{${S.doc}}p{margin:0 0 6pt}</style></head><body><div class="WordSection1">${html}</div></body></html>`;
}

const API = { dateLine, bienBan, thongBao, wordDoc, soKyHieu, QH, TN };
if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.SO_ND30 = API;
})(typeof window !== 'undefined' ? window : this);
