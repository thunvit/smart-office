'use strict';
/* Kiểm thử thể thức văn bản theo Nghị định 30/2020/NĐ-CP (ADR-013). Không gọi mạng, không gọi mô hình.
 * Mỗi điều kiện đối chiếu một quy định của Phụ lục I (thể thức, kỹ thuật trình bày) hoặc Phụ lục III (chữ viết tắt, mẫu).
 * Chạy: node test/nd30-test.js — phải in "0 không đạt". Mã thoát 1 khi có điều kiện sai. */
const path = require('path');
const ND = require(path.join(__dirname, '..', 'public', 'nd30.js'));
const CMP = require(path.join(__dirname, '..', 'ai-compose.js'));
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log('KHÔNG ĐẠT:', m, d !== undefined ? JSON.stringify(d).slice(0, 400) : ''); } };

const base = { org_parent: 'UBND tỉnh Ninh Bình', org_name: 'Sở Nội vụ', abbr: 'snv', dv: 'vp', place: 'Ninh Bình', date: '2026-01-05', ky: { quyen: 'KT. Giám đốc', chuc_vu: 'Phó Giám đốc', name: 'Nguyễn Văn A' } };
const cv = { ...base, loai: 'congvan', trich_yeu: 'Đề nghị hỗ trợ đào tạo', kinh_gui: ['Sở Thông tin và Truyền thông'], noi_dung: 'Đoạn một.\nĐoạn hai.', noi_nhan: ['Văn phòng UBND tỉnh'], soan: 'nvt (3)', so_ban: '3', dia_chi: ['Địa chỉ: 12 Đinh Tiên Hoàng'] };
const flat = bl => bl.flatMap(b => (b.k === 'tbl' ? b.rows.flat(2) : [b]));
const textOf = p => p.r.map(r => r.t).join('');
const allP = m => m.sections.flatMap(flatten).filter(b => b.k === 'p');
function flatten(bl) { return bl.flatMap(b => (b.k === 'tbl' ? b.rows.flat(2) : [b])); }
const find = (m, re) => allP(m).find(p => re.test(textOf(p)));

/* ---------- 1. Bảng chữ viết tắt tên loại (Phụ lục III, mục I) ---------- */
const ABBR = { nghiquyet: 'NQ', quyetdinh: 'QĐ', chithi: 'CT', quyche: 'QC', quydinh: 'QyĐ', thongcao: 'TC', thongbao: 'TB', huongdan: 'HD', chuongtrinh: 'CTr', kehoach: 'KH', phuongan: 'PA', dean: 'ĐA', duan: 'DA', baocao: 'BC', bienban: 'BB', totrinh: 'TTr', congdien: 'CĐ', giayuyquyen: 'GUQ', giaymoi: 'GM', giaygt: 'GGT', giaynghiphep: 'GNP', phieugui: 'PG', phieuchuyen: 'PC', phieubao: 'PB' };
ok(Object.entries(ABBR).every(([k, v]) => ND.TYPES[k] && ND.TYPES[k].ab === v), 'chữ viết tắt tên loại đúng bảng Phụ lục III', Object.entries(ABBR).filter(([k, v]) => !ND.TYPES[k] || ND.TYPES[k].ab !== v));
ok(ND.TYPES.congvan.ab === '' && ND.TYPES.quyetdinh_bh.ab === 'QĐ', 'công văn không có chữ viết tắt tên loại; quyết định ban hành, phê duyệt dùng QĐ');
ok(Object.keys(ND.TYPES).every(k => /^1\.(\d|10)$/.test(ND.TYPES[k].mau)), 'mỗi loại gắn một mẫu 1.1 đến 1.10');
ok(ND.GROUPS.flatMap(g => g[1]).sort().join() === Object.keys(ND.TYPES).sort().join(), 'mọi loại đều có trong danh sách chọn, không trùng');

/* ---------- 2. Số, ký hiệu, ngày tháng (Phụ lục I, II.3, II.4) ---------- */
ok(ND.soKy({ ...base, loai: 'quyetdinh', so: '5' }, ND.TYPES.quyetdinh) === 'Số: 05/QĐ-SNV', 'số nhỏ hơn 10 thêm số 0; ký hiệu in hoa, phân cách bằng gạch ngang, không cách chữ');
ok(ND.soKy({ ...base, loai: 'quyetdinh', so: '', abbr: 'ubnd tt' }, ND.TYPES.quyetdinh) === 'Số: …/QĐ-UBNDTT', 'chưa cấp số: để trống; chữ viết tắt bỏ khoảng trắng');
ok(ND.soKy({ ...base, loai: 'congvan', so: '12' }, ND.TYPES.congvan) === 'Số: 12/SNV-VP', 'công văn: ký hiệu gồm chữ viết tắt cơ quan và đơn vị soạn thảo');
ok(ND.soKy({ ...base, loai: 'congvan', dv: '' }, ND.TYPES.congvan) === 'Số: …/SNV', 'công văn không có đơn vị soạn thảo: chỉ chữ viết tắt cơ quan');
ok(ND.dateLine('Hà Nội', '2026-01-05') === 'Hà Nội, ngày 05 tháng 01 năm 2026' && ND.dateLine('Hà Nội', '2026-03-15') === 'Hà Nội, ngày 15 tháng 3 năm 2026' && ND.dateLine('Huế', '2026-02-09') === 'Huế, ngày 09 tháng 02 năm 2026', 'ngày nhỏ hơn 10 và tháng 1, 2 thêm số 0 (ví dụ Phụ lục I: "ngày 05 tháng 01 năm 2020")');

/* ---------- 3. Đầu văn bản: Quốc hiệu, Tiêu ngữ, tên cơ quan (Phụ lục I, II.1, II.2; bảng cỡ chữ mục V) ---------- */
let m = ND.compose(cv);
const hd = m.blocks[0], [lt, rt] = hd.rows[0];
ok(hd.k === 'tbl' && hd.rows.length === 2 && hd.rows[0].length === 2, 'đầu văn bản là bảng 2 cột x 2 hàng (cơ quan | Quốc hiệu; số ký hiệu | địa danh ngày tháng)');
ok(textOf(rt[0]) === 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM' && rt[0].b && rt[0].sz >= 12 && rt[0].sz <= 13 && rt[0].al === 'c', 'Quốc hiệu: in hoa, đậm, cỡ 12–13, canh giữa');
ok(textOf(rt[1]) === 'Độc lập - Tự do - Hạnh phúc' && rt[1].b && rt[1].sz >= 13 && rt[1].sz <= 14 && rt[1].rule === 1, 'Tiêu ngữ: chữ thường, đậm, cỡ 13–14, gạch nối có cách chữ, đường kẻ dài bằng dòng chữ');
ok(rt[1].sz - rt[0].sz === 1, 'cỡ chữ Quốc hiệu và Tiêu ngữ tăng, giảm thống nhất (13 và 14), theo chú thích bảng mục V');
ok(textOf(lt[0]) === 'UBND TỈNH NINH BÌNH' && !lt[0].b && textOf(lt[1]) === 'SỞ NỘI VỤ' && lt[1].b && lt[1].rule >= 1 / 3 && lt[1].rule <= 1 / 2, 'tên cơ quan chủ quản in hoa không đậm; tên cơ quan ban hành in hoa đậm, đường kẻ dài 1/3 đến 1/2 dòng chữ');
const dateP = hd.rows[1][1][0];
ok(textOf(dateP) === 'Ninh Bình, ngày 05 tháng 01 năm 2026' && dateP.i && !dateP.b && dateP.sz >= 13 && dateP.sz <= 14, 'địa danh, ngày tháng: chữ thường nghiêng, cỡ 13–14, cùng hàng với số ký hiệu');
ok(textOf(hd.rows[1][0][0]) === 'Số: …/SNV-VP' && hd.rows[1][0][0].sz === 13 && !hd.rows[1][0][0].b, 'số, ký hiệu: cỡ 13, kiểu đứng');
ok(textOf(hd.rows[1][0][1]) === 'V/v Đề nghị hỗ trợ đào tạo' && hd.rows[1][0][1].sz >= 12 && hd.rows[1][0][1].sz <= 13, 'công văn: trích yếu sau “V/v”, cỡ 12–13, đặt dưới số ký hiệu (ô 5b)');
ok(!(ND.compose({ ...cv, loai: 'bienban', bb: {} }).blocks[0].rows[1][1].length), 'biên bản (Mẫu 1.9): không có địa danh, ngày tháng ở đầu văn bản');

/* ---------- 4. Tên loại, trích yếu (II.5) ---------- */
m = ND.compose({ ...base, loai: 'thongbao', trich_yeu: 'Lịch nghỉ Tết', noi_dung: 'a', so: '3' });
const tl = find(m, /^THÔNG BÁO$/), ty = find(m, /^Lịch nghỉ Tết$/);
ok(tl && tl.b && tl.al === 'c' && tl.sz >= 13 && tl.sz <= 14 && ty && ty.b && ty.al === 'c' && ty.rule >= 1 / 3 && ty.rule <= 1 / 2, 'tên loại in hoa đậm; trích yếu chữ thường đậm ngay dưới, canh giữa, đường kẻ 1/3–1/2');
m = ND.compose({ ...base, loai: 'quyetdinh', trich_yeu: 'Thành lập Ban Chỉ đạo', can_cu: ['Căn cứ A;', 'Theo đề nghị của B.'], noi_dung: 'Điều 1. X\nNội dung' });
ok(find(m, /^Về việc thành lập Ban Chỉ đạo$/), 'quyết định trực tiếp (Mẫu 1.2): trích yếu có “Về việc”');
ok(find(ND.compose({ ...base, loai: 'quyetdinh', trich_yeu: 'UBND tỉnh giao nhiệm vụ', can_cu: ['Căn cứ A'], noi_dung: 'Điều 1. X' }), /^Về việc UBND tỉnh giao nhiệm vụ$/), 'quyết định: trích yếu bắt đầu bằng chữ viết tắt giữ nguyên chữ hoa (lỗi “uBND” khi dựng thử)');
m = ND.compose({ ...base, loai: 'quyetdinh_bh', trich_yeu: 'Ban hành Quy chế X', can_cu: ['Căn cứ A'], noi_dung: 'Điều 1. X' });
ok(find(m, /^Ban hành Quy chế X$/) && !find(m, /Về việc/), 'quyết định ban hành (Mẫu 1.3): trích yếu bắt đầu bằng “Ban hành”, không thêm “Về việc”');

/* ---------- 5. Căn cứ ban hành (II.6.a) ---------- */
m = ND.compose({ ...base, loai: 'quyetdinh', trich_yeu: 'X', can_cu: ['Căn cứ Luật A ngày 19 tháng 6 năm 2015;', 'Căn cứ Nghị định B.', 'Theo đề nghị của Chánh Văn phòng'], noi_dung: 'Điều 1. X', tham_quyen: 'Giám đốc Sở Nội vụ' });
const cc = allP(m).filter(p => /^(Căn cứ|Theo đề nghị)/.test(textOf(p)));
ok(cc.length === 3 && cc.every(p => p.i && !p.b), 'căn cứ: chữ thường, kiểu nghiêng');
ok(textOf(cc[0]).endsWith('2015;') && textOf(cc[1]).endsWith('Nghị định B;') && textOf(cc[2]).endsWith('Văn phòng.'), 'cuối mỗi căn cứ có dấu chấm phẩy, dòng cuối cùng kết thúc bằng dấu chấm');
ok(find(m, /^GIÁM ĐỐC SỞ NỘI VỤ$/) && find(m, /^QUYẾT ĐỊNH:$/).b, 'thẩm quyền ban hành in hoa; “QUYẾT ĐỊNH:” đậm');
ok(find(ND.compose({ ...base, loai: 'nghiquyet', trich_yeu: 'X', can_cu: ['Căn cứ A'], noi_dung: '1. Thông qua' }), /^QUYẾT NGHỊ:$/), 'nghị quyết (Mẫu 1.1): “QUYẾT NGHỊ:”');

/* ---------- 6. Bố cục nội dung: phần, chương, mục, điều, khoản, điểm (II.6.d, đ, e) ---------- */
let bl = ND.bodyBlocks('Chương I\nQUY ĐỊNH CHUNG\nĐiều 1. Phạm vi điều chỉnh\nVăn bản này quy định.\n1. Đối tượng áp dụng\nNội dung khoản.\na) Điểm a;\n- Gạch đầu dòng\nMục 2. TỔ CHỨC\nI. MỤC LỚN');
const T = i => textOf(bl[i]);
ok(T(0) === 'Chương I' && bl[0].al === 'c' && bl[0].b && T(1) === 'QUY ĐỊNH CHUNG' && bl[1].al === 'c' && bl[1].b, 'chương: “Chương I” một dòng riêng canh giữa đậm, tiêu đề in hoa đậm ngay dưới');
ok(T(2) === 'Điều 1. Phạm vi điều chỉnh' && bl[2].b && bl[2].fi >= 1 && bl[2].fi <= 1.27 && bl[2].keep, 'điều: chữ thường đậm, thụt đầu dòng 1 cm, số Ả Rập kèm dấu chấm, đi liền nội dung');
ok(T(3) === 'Văn bản này quy định.' && !bl[3].b && bl[3].fi >= 1 && bl[3].al === 'j', 'nội dung: canh đều hai lề, đầu dòng lùi 1 cm');
ok(T(4) === '1. Đối tượng áp dụng' && bl[4].b, 'khoản có tiêu đề (đứng riêng một dòng): chữ đậm');
ok(!bl[6].b && !bl[7].b && bl[6].fi >= 1, 'điểm a), gạch đầu dòng: chữ đứng thường');
ok(T(8) === 'Mục 2' && T(9) === 'TỔ CHỨC' && T(10) === 'I. MỤC LỚN' && bl[10].b, 'mục: “Mục 2” rồi tiêu đề in hoa; mục lớn số La Mã đậm');
bl = ND.bodyBlocks('1. Nguyễn Văn A\n2. Trần Thị B\n3. Công tác tham mưu\nNội dung chi tiết.');
ok(!bl[0].b && !bl[1].b && bl[2].b && !bl[3].b, 'dãy khoản ngắn liên tiếp (danh sách) không in đậm; chỉ khoản có tiêu đề riêng dòng mới đậm (lỗi gặp khi dựng thử phụ lục)');
ok(ND.endMark('Nội dung.') === 'Nội dung./.' && ND.endMark('Nội dung./.') === 'Nội dung./.' && ND.endMark('Nội dung') === 'Nội dung./.' && ND.endMark('Trân trọng;') === 'Trân trọng./.', 'kết thúc nội dung bằng “./.” (không lặp khi đã có)');
bl = ND.bodyBlocks('A.', { end: true }); ok(textOf(bl[0]) === 'A./.', 'bodyBlocks end: dòng cuối có “./.”');

/* ---------- 7. Kính gửi, nơi nhận (II.9) ---------- */
m = ND.compose({ ...cv, kinh_gui: ['Sở A'] });
ok(find(m, /^Kính gửi: Sở A$/), 'một nơi nhận: “Kính gửi” và tên trên cùng một dòng');
m = ND.compose({ ...cv, kinh_gui: ['Sở A', 'Sở B', 'Sở C'] });
ok(find(m, /^Kính gửi:$/) && textOf(find(m, /^- Sở A;$/)) && find(m, /^- Sở B;$/) && find(m, /^- Sở C\.$/), 'từ hai nơi trở lên: mỗi nơi một dòng, gạch đầu dòng, cuối dòng “;”, dòng cuối “.”');
const nn = ND.noiNhanList(ND.normDoc(cv), ND.TYPES.congvan);
ok(nn[0] === 'Như trên' && nn[nn.length - 1] === 'Lưu: VT, VP, 3', 'nơi nhận: có kính gửi thì thêm “Như trên”; dòng cuối “Lưu: VT, đơn vị soạn thảo, số lượng bản lưu”', nn);
const nl = allP(ND.compose(cv)).filter(p => /^- /.test(textOf(p)) && p.sz === 11).map(textOf);
ok(nl[0] === '- Như trên;' && nl[nl.length - 1].endsWith('.') && nl.slice(0, -1).every(x => x.endsWith(';')), 'nơi nhận: gạch đầu dòng cỡ 11, cuối dòng “;”, dòng cuối “.”', nl);
const nh = find(ND.compose(cv), /^Nơi nhận:$/);
ok(nh.sz === 12 && nh.b && nh.i, '“Nơi nhận:” cỡ 12, đậm, nghiêng');
ok(find(ND.compose(cv), /^NVT \(3\)$/) && find(ND.compose(cv), /^NVT \(3\)$/).sz === 11, 'ký hiệu người soạn và số lượng bản phát hành: in hoa, cỡ 11 (ô 12)');
ok(ND.noiNhanList(ND.normDoc({ ...cv, noi_nhan: ['Lưu: VT, hồ sơ'], kinh_gui: [] }), ND.TYPES.congvan).filter(x => /^Lưu/.test(x)).length === 1, 'đã có dòng “Lưu:” thì không thêm dòng Lưu thứ hai');

/* ---------- 8. Quyền hạn, chức vụ, họ tên người ký (II.7) ---------- */
let sg = ND.signerBlocks(ND.normDoc(cv)).map(textOf);
ok(sg[0] === 'KT. GIÁM ĐỐC' && sg[1] === 'PHÓ GIÁM ĐỐC' && sg[2] === 'Nguyễn Văn A', 'ký thay: “KT.” trước chức vụ người đứng đầu; chức vụ người ký in hoa; họ tên');
const sb = ND.signerBlocks(ND.normDoc(cv));
ok(sb[0].b && sb[0].sz >= 13 && sb[0].sz <= 14 && sb[2].b && sb[2].al === 'c' && sb[2].before >= 40, 'quyền hạn, chức vụ: in hoa đậm cỡ 13–14, canh giữa; họ tên đậm, chừa chỗ ký phía trên');
for (const q of ['TM. ỦY BAN NHÂN DÂN', 'Q. GIÁM ĐỐC', 'TL. GIÁM ĐỐC', 'TUQ. GIÁM ĐỐC']) ok(ND.check({ ...cv, ky: { ...cv.ky, quyen: q } }, '2026-01-05').every(x => !/Quyền hạn người ký/.test(x.msg)), 'quyền hạn hợp lệ: ' + q);
ok(ND.check({ ...cv, ky: { ...cv.ky, quyen: 'KT Giám đốc' } }, '2026-01-05').some(x => /TM\., Q\., KT\./.test(x.msg)), 'quyền hạn thiếu dấu chấm sau chữ viết tắt bị báo lỗi');
ok(ND.check({ ...cv, ky: { ...cv.ky, name: 'TS. Nguyễn Văn A' } }, '2026-01-05').some(x => /học hàm/.test(x.msg)), 'họ tên người ký có học hàm, học vị bị báo lỗi');
sg = ND.signerBlocks(ND.normDoc({ ...cv, ky: { quyen: '', chuc_vu: '', name: '' } })).map(textOf);
ok(/cần bổ sung: chức vụ/.test(sg[0]) && /cần bổ sung: họ tên/.test(sg[1]), 'chưa nhập người ký: đánh dấu [cần bổ sung] để không bỏ sót');

/* ---------- 9. Phụ lục (III.1; Mẫu 2.1) ---------- */
m = ND.compose({ ...cv, loai: 'quyetdinh', trich_yeu: 'X', can_cu: ['Căn cứ A'], noi_dung: 'Điều 1. X\nXem phụ lục.', so: '7', phu_luc: [{ ten: 'Danh sách', noi_dung: '1. A' }, { ten: 'Kế hoạch', noi_dung: '1. B' }] });
ok(m.sections.length === 3 && textOf(m.sections[1][0]) === 'Phụ lục I' && textOf(m.sections[2][0]) === 'Phụ lục II' && textOf(m.sections[1][1]) === 'DANH SÁCH', 'từ hai phụ lục: đánh số La Mã; tên phụ lục in hoa; mỗi phụ lục một trang');
ok(textOf(m.sections[1][2]) === '(Kèm theo Quyết định số 07/QĐ-SNV ngày 05 tháng 01 năm 2026 của Sở Nội vụ)' && m.sections[1][2].i && m.sections[1][2].al === 'c', 'chỉ dẫn “(Kèm theo … số …/… ngày … của …)” nghiêng, canh giữa');
m = ND.compose({ ...cv, phu_luc: [{ ten: '', noi_dung: 'X' }] });
ok(textOf(m.sections[1][0]) === 'Phụ lục', 'một phụ lục: không đánh số');

/* ---------- 10. Độ khẩn, phạm vi lưu hành, địa chỉ (III.2, III.4) ---------- */
m = ND.compose({ ...cv, khan: 'hoa_toc', pham_vi: 'LƯU HÀNH NỘI BỘ' });
ok(allP(m).filter(p => p.box).map(textOf).join('|') === 'HỎA TỐC|LƯU HÀNH NỘI BỘ' && allP(m).filter(p => p.box).every(p => p.b), 'dấu độ khẩn, chỉ dẫn phạm vi lưu hành: in hoa đậm trong khung viền đơn');
ok(m.footer.length === 1 && m.footer[0].sz >= 11 && m.footer[0].sz <= 12 && m.footer[0].topRule, 'địa chỉ cơ quan: cỡ 11–12, dưới đường kẻ nét liền hết chiều ngang');

/* ---------- 11. Các mẫu còn lại dựng đủ thành phần ---------- */
const forms = {
  giaymoi: { gm: { moi: 'Ông A', du: 'Hội nghị', chu_tri: 'GĐ', thoi_gian: '08 giờ', dia_diem: 'Hội trường', luu_y: 'Đến sớm' }, expect: [/trân trọng kính mời: Ông A/, /^Tới dự Hội nghị$/, /^Chủ trì: GĐ$/, /^Thời gian: 08 giờ$/, /^Địa điểm: Hội trường$/, /Đến sớm\.\/\.$/] },
  giaygt: { ggt: { ho_ten: 'Trần B', chuc_vu: 'CV', den: 'Sở X', ve_viec: 'làm việc', het_ngay: '2026-02-01' }, expect: [/trân trọng giới thiệu:/, /^Ông \(bà\): Trần B$/, /^Được cử đến: Sở X$/, /đến hết ngày 01\/02\/2026\.\/\.$/] },
  giaynghiphep: { gnp: { don_ngay: '2026-01-02', ho_ten: 'Trần B', chuc_vu: 'CV', thoi_gian: '05 ngày', tu_ngay: '2026-01-10', den_ngay: '2026-01-14', tai: 'Huế', tinh_vao: 'năm 2026' }, expect: [/Xét Đơn đề nghị nghỉ phép ngày 02\/01\/2026 của ông \(bà\) Trần B/, /kể từ ngày 10\/01\/2026 đến hết ngày 14\/01\/2026 tại Huế/, /năm 2026\.\/\.$/, /^Xác nhận của cơ quan/] },
  congdien: { cd: { nguoi_dien: 'Giám đốc Sở', gui: ['Phòng A', 'Phòng B'] }, noi_dung: 'Khẩn trương triển khai.', trich_yeu: 'Phòng chống bão', expect: [/^Giám đốc Sở điện:$/, /^- Phòng A;$/, /^- Phòng B\.$/, /triển khai\.\/\.$/] },
  bienban: { trich_yeu: 'Họp giao ban', bb: { bat_dau: '2026-01-12T08:00', dia_diem: 'P1', thanh_phan: 'A; B', chu_toa: 'GĐ', thu_ky: 'Mai', ket_thuc: '09:15' }, noi_dung: '1. A: ý kiến', expect: [/^Thời gian bắt đầu: 08 giờ 00, ngày 12\/01\/2026$/, /^Nội dung \(theo diễn biến/, /Cuộc họp kết thúc vào 09 giờ 15, ngày 12 tháng 01 năm 2026\.\/\.$/, /^THƯ KÝ$/] }
};
for (const [loai, f] of Object.entries(forms)) {
  const { expect, ...rest } = f, mm = ND.compose({ ...base, loai, ...rest });
  ok(expect.every(re => find(mm, re)), `mẫu ${ND.TYPES[loai].mau} (${ND.TYPES[loai].ten}): đủ thành phần`, expect.filter(re => !find(mm, re)).map(String));
  ok(find(mm, new RegExp('^' + ND.TYPES[loai].tl + '$')), `mẫu ${ND.TYPES[loai].mau}: có tên loại in hoa`);
}
ok(ND.FIELDS.bb && Object.keys(ND.FIELDS).every(k => ND.FIELDS[k].every(([p]) => { const [g, f] = p.split('.'); const d = ND.normDoc({}); return d[g] && f in d[g]; })), 'mọi trường riêng của biểu mẫu (FIELDS) đều có trong dữ liệu chuẩn hóa');

/* ---------- 12. Kiểm tra thể thức (Điều 12 khoản 2) ---------- */
const empty = ND.check(ND.emptyDoc('congvan'), '2026-01-05').filter(x => x.level === 'loi').map(x => x.msg);
ok(['tên cơ quan', 'viết tắt', 'địa danh', 'ngày, tháng, năm', 'trích yếu', 'Kính gửi', 'nội dung', 'chức vụ người ký', 'họ tên người ký'].every(w => empty.some(x => x.includes(w))), 'văn bản trống: báo đủ các thành phần bắt buộc còn thiếu', empty);
ok(ND.check({ ...cv }, '2026-01-05').filter(x => x.level === 'loi').length === 0, 'công văn đủ thành phần: không có lỗi thể thức', ND.check({ ...cv }, '2026-01-05'));
ok(ND.check({ ...cv, noi_dung: 'Cần [cần bổ sung: số liệu].' }, '2026-01-05').some(x => /cần bổ sung/.test(x.msg) && x.level === 'loi'), 'còn [cần bổ sung] bị báo lỗi');
ok(ND.check({ ...base, loai: 'quyetdinh', trich_yeu: 'X', noi_dung: 'Điều 1.\nA' }, '2026-01-05').some(x => /căn cứ/i.test(x.msg)) && ND.check({ ...base, loai: 'quyetdinh', trich_yeu: 'X', noi_dung: 'Điều 1.\nA', can_cu: ['Căn cứ A'] }, '2026-01-05').some(x => /Điều chưa có tiêu đề/.test(x.msg)), 'quyết định thiếu căn cứ; Điều không có tiêu đề bị báo lỗi');
ok(ND.check({ ...cv, loai: 'baocao', kinh_gui: [] }, '2026-01-05').some(x => /Kính gửi/.test(x.msg)), 'báo cáo, tờ trình gửi cấp trên thiếu “Kính gửi” bị báo lỗi');
ok(ND.check(cv, '2026-01-05').every(x => x.ref), 'mỗi mục kiểm tra kèm căn cứ (Điều, khoản, mục Phụ lục)');
ok(ND.check({ ...cv, so: '' }, '2026-01-05').some(x => x.level === 'luu-y' && /Văn thư cấp số/.test(x.msg)), 'chưa có số: lưu ý Văn thư cấp số sau khi ký');

/* ---------- 13. Chuẩn hóa dữ liệu, an toàn ---------- */
const nd = ND.normDoc({ loai: 'khong-co', date: '31/12/2026', khan: 'x', pham_vi: 'khác', so: '12a', kinh_gui: 'A\n\nB', noi_nhan: Array(100).fill('x'), phu_luc: Array(30).fill({ ten: 't', noi_dung: 'n' }), trich_yeu: 'a\nb\tc', ky: { name: 'x'.repeat(500) } });
ok(nd.loai === 'congvan' && nd.date === '' && nd.khan === '' && nd.pham_vi === '' && nd.so === '' && nd.kinh_gui.length === 2 && nd.noi_nhan.length === 30 && nd.phu_luc.length === 10 && nd.trich_yeu === 'a b c' && nd.ky.name.length === 100, 'normDoc: loại lạ → công văn; ngày sai, số sai, mức khẩn lạ bị bỏ; cắt độ dài; bỏ xuống dòng trong trích yếu', nd);
m = ND.compose({ ...cv, noi_dung: '<script>alert(1)</script> & "x"', trich_yeu: '<b>x</b>' });
const html = ND.toHtml(m);
ok(!/<script>|<b>x<\/b>/.test(html) && html.includes('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;x&quot;'), 'HTML xem trước thoát ký tự đặc biệt (chống chèn mã)');
ok(html.includes('background:#fff2a8') === false && ND.toHtml(ND.compose({ ...cv, noi_dung: 'A [cần bổ sung: x]' })).includes('background:#fff2a8'), 'chỗ [cần bổ sung] được tô vàng trong bản xem trước');
ok(ND.compose({ ...cv, noi_dung: 'Dòng một\nDòng hai' }).text.includes('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM') && ND.compose(cv).text.includes('Nơi nhận:'), 'văn bản thuần để sao chép, lưu vào Tài liệu có đủ thể thức');

/* ---------- 14. Tệp .docx ---------- */
const u8 = ND.docx(ND.compose({ ...cv, loai: 'quyetdinh', trich_yeu: 'A & B < C', can_cu: ['Căn cứ A'], noi_dung: 'Điều 1. X "y"\nNội dung', phu_luc: [{ ten: 'PL', noi_dung: '1. a' }], khan: 'khan' }), 'Thử');
function unzip(u) {
  const dv = new DataView(u.buffer, u.byteOffset, u.length), out = {}; let p = 0;
  while (dv.getUint32(p, true) === 0x04034b50) {
    const meth = dv.getUint16(p + 8, true), crc = dv.getUint32(p + 14, true), size = dv.getUint32(p + 18, true), nl = dv.getUint16(p + 26, true), el = dv.getUint16(p + 28, true);
    const name = Buffer.from(u.subarray(p + 30, p + 30 + nl)).toString('utf8'), data = u.subarray(p + 30 + nl + el, p + 30 + nl + el + size);
    out[name] = { meth, crc, data, text: Buffer.from(data).toString('utf8') }; p += 30 + nl + el + size;
  }
  const eocd = u.length - 22; return { files: out, entries: dv.getUint16(eocd + 10, true), cdOff: dv.getUint32(eocd + 16, true), end: p, eocdSig: dv.getUint32(eocd, true) };
}
function wellFormed(xml) {
  if (/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;)/.test(xml.replace(/<[^>]*>/g, ''))) return 'ký tự & chưa thoát';
  const st = []; const re = /<(\/?)([\w:.-]+)((?:\s+[\w:.-]+="[^"]*")*)\s*(\/?)>|<\?[^?]*\?>/g; let last = 0, mt;
  while ((mt = re.exec(xml))) { if (/[<>]/.test(xml.slice(last, mt.index).replace(/&[a-z]+;/g, ''))) return 'ký tự < > lạc'; last = re.lastIndex; if (!mt[2]) continue; if (mt[4]) continue; if (mt[1]) { if (st.pop() !== mt[2]) return 'thẻ đóng sai ' + mt[2]; } else st.push(mt[2]); }
  return st.length ? 'thẻ chưa đóng ' + st.join() : '';
}
const Z = unzip(u8), names = Object.keys(Z.files);
ok(Z.entries === names.length && Z.cdOff === Z.end && Z.eocdSig === 0x06054b50, 'docx: cấu trúc ZIP hợp lệ (số mục, vị trí thư mục trung tâm)', { e: Z.entries, n: names.length });
ok(Object.values(Z.files).every(f => f.meth === 0 && ND.crc32(f.data) === f.crc), 'docx: CRC32 từng tệp trong ZIP khớp');
ok(['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/styles.xml', 'word/header1.xml', 'word/footer1.xml', 'word/footer2.xml', 'word/_rels/document.xml.rels'].every(n => Z.files[n]), 'docx: đủ các phần bắt buộc');
ok(names.every(n => !n.endsWith('.xml') && !n.endsWith('.rels') || wellFormed(Z.files[n].text) === ''), 'docx: mọi tệp XML đúng cú pháp, thoát đúng ký tự', names.map(n => [n, wellFormed(Z.files[n].text)]).filter(x => x[1]));
const dx = Z.files['word/document.xml'].text;
ok(dx.includes('<w:pgSz w:w="11906" w:h="16838"/>') && dx.includes('w:top="1134"') && dx.includes('w:bottom="1134"') && dx.includes('w:left="1701"') && dx.includes('w:right="851"'), 'docx: khổ A4 (210 x 297 mm); lề trên, dưới 20 mm, trái 30 mm, phải 15 mm');
ok(dx.includes('<w:titlePg/>') && /PAGE/.test(Z.files['word/header1.xml'].text) && /w:jc w:val="center"/.test(Z.files['word/header1.xml'].text), 'docx: số trang canh giữa lề trên, không hiện ở trang đầu (titlePg)');
ok((dx.match(/<w:sectPr>/g) || []).length === 2 && /<w:pgNumType w:start="1"\/>/.test(dx), 'docx: phụ lục là phần riêng, đánh lại số trang từ 1');
ok(Z.files['word/footer1.xml'].text.includes('Địa chỉ: 12 Đinh Tiên Hoàng') && Z.files['word/footer1.xml'].text.includes('w:top w:val="single"') && !Z.files['word/footer2.xml'].text.includes('Địa chỉ'), 'docx: địa chỉ cơ quan ở chân trang đầu, dưới đường kẻ; phụ lục không lặp lại');
ok(Z.files['word/styles.xml'].text.includes('Times New Roman') && Z.files['word/styles.xml'].text.includes('w:val="28"'), 'docx: phông Times New Roman, cỡ mặc định 14');
ok(dx.includes('Về việc a &amp; B &lt; C') && dx.includes('&quot;y&quot;') && !/undefined|NaN|\[object/.test(dx), 'docx: thoát ký tự XML; không lọt “undefined”, “NaN”');
ok(dx.includes('<w:tbl>') && dx.includes('w:cantSplit') && dx.includes('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM') && dx.includes('w:highlight') === false, 'docx: đầu văn bản và chữ ký là bảng không viền, không tách trang giữa chừng');
ok(ND.docx(ND.compose({ ...cv, noi_dung: 'A [cần bổ sung: x]' })).length > 0 && unzip(ND.docx(ND.compose({ ...cv, noi_dung: 'A [cần bổ sung: x]' }))).files['word/document.xml'].text.includes('<w:highlight w:val="yellow"/>'), 'docx: chỗ [cần bổ sung] được tô vàng');
const bb = ND.bienBan({ org_name: 'Sở A', abbr: 'a', trich_yeu: 'Họp', start_at: '2026-01-12 08:00', end_time: '09:00', chu_tri: { name: 'X', title: 'GĐ' }, thu_ky: { name: 'Y' }, present: [{ name: 'Z' }], dien_bien: [{ ten: 'Z', y_kien: 'Ý kiến' }], ket_luan: ['Thống nhất'], nhiem_vu: ['A chủ trì'] });
ok(wellFormed(unzip(ND.docx(bb, 'bb')).files['word/document.xml'].text) === '' && bb.html.includes('BIÊN BẢN'), 'biên bản cuộc họp (trợ lý cuộc họp) cũng xuất được .docx đúng cú pháp');

/* ---------- 15. Đồng bộ với danh mục phía máy chủ (ai-compose.js) ---------- */
const aiTypes = Object.keys(ND.TYPES).filter(k => ND.TYPES[k].ai).sort().join();
ok(Object.keys(ND.TYPES).every(k => CMP.DOC_TYPES[k]) && Object.keys(CMP.DOC_TYPES).filter(k => !ND.TYPES[k]).sort().join() === 'khac,thu', 'danh mục loại văn bản máy chủ = trình duyệt (cộng thư, văn bản khác)');
ok(Object.keys(CMP.KIND).sort().join() === aiTypes && Object.keys(CMP.KIND).every(k => CMP.KIND[k] === ND.TYPES[k].k), 'kiểu bố cục phía máy chủ khớp trình duyệt; giấy giới thiệu, giấy nghỉ phép không soạn bằng AI', { a: aiTypes, b: Object.keys(CMP.KIND).sort().join() });
ok(['gm', 'bb'].every(g => JSON.stringify(CMP.SUB[g]) === JSON.stringify(ND.FIELDS[g].map(x => x[0].split('.')[1]).sort((a, b) => 0)) || CMP.SUB[g].slice().sort().join() === ND.FIELDS[g].map(x => x[0].split('.')[1]).sort().join()), 'trường riêng giấy mời, biên bản khớp giữa máy chủ và trình duyệt');

console.log(`nd30-test: ${pass} đạt, ${fail} không đạt`);
process.exit(fail ? 1 : 0);
