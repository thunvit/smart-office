/* SmartOffice — Nhóm Thông tin (Bảng tin, Lịch họp, Tài liệu) và Kinh doanh (Khách hàng, Thu chi, Tài sản) */
(function () {
'use strict';
const S = window.SO;
const { $, $$, esc, pad, iso, TODAY, addDays, fmtD, fmtDT, vnd, numFmt, WD, debounce, GET, POST, PUT, DEL, U, Dp, av, who, userOpts, deptOpts, openModal, closeModal, toast, showErr, mh, busy, armed, VIEWS, ACTIONS, render } = S;
const B = () => S.B;
const money = n => (Number(n) || 0).toLocaleString('vi-VN');
const moneyIn = (id, v, ph = '0') => `<input id="${id}" inputmode="numeric" class="money-in" value="${v ? money(v) : ''}" placeholder="${ph}">`;
const readMoney = id => String(($('#' + id) || {}).value || '').replace(/\D/g, '');
const opts = (obj, sel) => Object.entries(obj).map(([k, v]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${esc(v)}</option>`).join('');
const fmtSize = n => n > 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
const shortVnd = n => n >= 1e9 ? (n / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 2 }) + ' tỷ' : n >= 1e6 ? (n / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) + ' tr' : money(n);
const pickHandler = (attr, fn) => document.addEventListener('click', e => { if (e.target.closest('#modal')) return; const el = e.target.closest('[' + attr + ']'); if (el && !e.target.closest('[data-act]')) fn(el.getAttribute(attr), el, e); });
const searchBox = (id, val, ph, onInput) => { const el = $('#' + id); if (!el) return; el.addEventListener('input', debounce(e => { onInput(e.target.value); render().then(() => { const q = $('#' + id); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }); }, 350)); };

/* ======================================================== BẢNG TIN */
const POST_CAT = { thongbao: 'Thông báo', chinhsach: 'Chính sách', sukien: 'Sự kiện', tintuc: 'Tin nội bộ' };
let ptCat = '', ptQ = '';
VIEWS['bang-tin'] = async main => {
  const d = await GET('/api/posts?' + new URLSearchParams({ category: ptCat, q: ptQ }));
  main.innerHTML = `<div class="page-head"><div><h1>Bảng tin nội bộ</h1><p>Thông báo, chính sách, sự kiện của đơn vị</p></div>${d.can_post ? '<div class="actions"><button class="btn primary" data-act="post-new">+ Đăng bản tin</button></div>' : ''}</div>
  <div class="toolbar"><div class="chips">${[['', 'Tất cả'], ...Object.entries(POST_CAT)].map(([k, l]) => `<button class="chip" data-ptcat="${k}" aria-pressed="${ptCat === k}">${l}</button>`).join('')}</div><span class="spacer"></span><input class="search" id="ptq" type="search" placeholder="Tìm bản tin…" value="${esc(ptQ)}" aria-label="Tìm bản tin"></div>
  <div class="feed-cards">${d.posts.map(p => `<article class="card post-card ${p.read_at ? '' : 'unread'}" data-post="${p.id}">
    <div class="post-top">${p.pinned ? '<span class="pill s-review">Ghim</span>' : ''}<span class="tag">${POST_CAT[p.category] || ''}</span>${p.read_at ? '' : '<span class="pill s-active">Chưa đọc</span>'}${p.require_ack && !p.ack_at ? '<span class="pill s-pending">Cần xác nhận</span>' : ''}</div>
    <h3>${esc(p.title)}</h3><p class="excerpt">${esc(p.body.slice(0, 220))}${p.body.length > 220 ? '…' : ''}</p>
    <div class="meta">${who(p.author_id)}<span>${fmtDT(p.created_at)}</span><span>${p.reads}/${d.active_users} đã đọc</span>${p.require_ack ? `<span>${p.acks} đã xác nhận</span>` : ''}${p.comments ? `<span>${p.comments} bình luận</span>` : ''}</div></article>`).join('') || '<section class="card"><div class="empty">Chưa có bản tin.</div></section>'}</div>`;
  searchBox('ptq', ptQ, '', v => ptQ = v);
};
async function postDetail(id) {
  const p = await GET('/api/posts/' + id); S.refreshBoot();
  openModal(`${mh(esc(p.title), (POST_CAT[p.category] || '') + ' · ' + esc(p.author_name) + ' · ' + fmtDT(p.created_at))}<div class="modal-b">
    <div class="post-body">${esc(p.body)}</div>
    ${p.require_ack ? (p.me && p.me.ack_at ? `<p class="notice info">Bạn đã xác nhận đọc lúc ${fmtDT(p.me.ack_at)}.</p>` : '<button class="btn ok" data-act="m-ack" style="align-self:flex-start">Xác nhận đã đọc và thực hiện</button>') : ''}
    ${p.can_edit ? `<details class="stat-box"><summary><b>Tình hình tiếp nhận</b>: ${p.not_read.length} người chưa đọc${p.require_ack ? `, ${p.not_ack.length} người chưa xác nhận` : ''}</summary><p class="hint">${p.not_ack.length ? 'Chưa xác nhận: ' + p.not_ack.map(u => esc(u.full_name)).join(', ') : p.not_read.length ? 'Chưa đọc: ' + p.not_read.map(u => esc(u.full_name)).join(', ') : 'Toàn bộ nhân sự đã tiếp nhận.'}</p></details>` : ''}
    <h3 class="sec-t">Bình luận (${p.comments.length})</h3>
    <div class="cmts">${p.comments.map(c => `<div class="cmt">${av(c.user_id)}<div><b>${esc(c.full_name)}</b><time>${fmtDT(c.created_at)}</time><p>${esc(c.body)}</p></div></div>`).join('') || '<span class="hint">Chưa có bình luận.</span>'}</div>
    <div class="inline-add"><input id="pc-new" placeholder="Viết bình luận…" aria-label="Viết bình luận"><button class="btn sm" data-act="m-cmt">Gửi</button></div><p class="err" id="pd-err" hidden></p></div>
  <div class="modal-f">${p.can_edit ? '<button class="btn danger" data-act="m-del" style="margin-right:auto">Xóa</button><button class="btn" data-act="m-edit">Sửa</button>' : ''}<button class="btn" data-act="close">Đóng</button></div>`, {
    'm-ack': btn => busy(btn, async () => { await POST(`/api/posts/${p.id}/ack`); toast('Đã xác nhận đọc'); postDetail(p.id); render(); }),
    'm-cmt': async () => { const v = $('#pc-new').value.trim(); if (!v) return; try { await POST(`/api/posts/${p.id}/comments?kind=bulletin`, { body: v }); postDetail(p.id); } catch (e) { showErr('#pd-err', e); } },
    'm-edit': () => postForm(p),
    'm-del': async btn => { if (!armed(btn, 'Bấm lần nữa để xóa')) return; await DEL('/api/posts/' + p.id + '?kind=bulletin'); closeModal(); render(); toast('Đã xóa bản tin'); }
  });
  render();
}
function postForm(p) {
  openModal(`${mh(p ? 'Sửa bản tin' : 'Đăng bản tin')}<div class="modal-b"><div class="form">
    <div class="field full"><label for="po-t">Tiêu đề</label><input id="po-t" value="${esc(p ? p.title : '')}"></div>
    <div class="field"><label for="po-c">Chuyên mục</label><select id="po-c">${opts(POST_CAT, p ? p.category : 'thongbao')}</select></div>
    <div class="field" style="justify-content:flex-end;gap:6px"><label class="check"><input type="checkbox" id="po-pin" ${p && p.pinned ? 'checked' : ''}> Ghim lên đầu</label><label class="check"><input type="checkbox" id="po-ack" ${p && p.require_ack ? 'checked' : ''}> Yêu cầu xác nhận đã đọc</label></div>
    <div class="field full"><label for="po-b">Nội dung</label><textarea id="po-b" style="min-height:220px">${esc(p ? p.body : '')}</textarea></div></div><p class="err" id="po-err" hidden></p></div>
  <div class="modal-f"><button class="btn" data-act="close">Hủy</button><button class="btn primary" data-act="m-save">${p ? 'Lưu' : 'Đăng'}</button></div>`, {
    'm-save': btn => busy(btn, async () => { const b = { title: $('#po-t').value, category: $('#po-c').value, pinned: $('#po-pin').checked, require_ack: $('#po-ack').checked, body: $('#po-b').value };
      try { p ? await PUT('/api/posts/' + p.id + '?kind=bulletin', b) : await POST('/api/posts', b); closeModal(); render(); S.refreshBoot(); toast(p ? 'Đã lưu bản tin' : 'Đã đăng bản tin'); } catch (e) { showErr('#po-err', e); } })
  });
}
ACTIONS['post-new'] = () => postForm(null);
pickHandler('data-post', id => postDetail(id).catch(e => toast(e.message, true)));
pickHandler('data-ptcat', v => { ptCat = v; render(); });

/* ======================================================== LỊCH HỌP */
const monday = s => { const d = new Date(s + 'T00:00:00'); const w = (d.getDay() + 6) % 7; d.setDate(d.getDate() - w); return iso(d); };
let mtWeek = monday(TODAY()), mtMine = false;
const RESP = { yes: 'Tham dự', no: 'Vắng', pending: 'Chưa phản hồi' };
VIEWS['lich-hop'] = async main => {
  const to = addDays(mtWeek, 6);
  const ms = await GET('/api/meetings?' + new URLSearchParams({ from: mtWeek, to, mine: mtMine ? '1' : '' }));
  const days = Array.from({ length: 7 }, (_, i) => addDays(mtWeek, i));
  main.innerHTML = `<div class="page-head"><div><h1>Lịch họp</h1><p>Tuần ${fmtD(mtWeek)} – ${fmtD(to)}</p></div><div class="actions">${B().me.role === 'admin' ? '<button class="btn" data-act="rooms">Danh mục phòng họp</button>' : ''}<button class="btn primary" data-act="mt-new">+ Đặt lịch họp</button></div></div>
  <div class="toolbar"><div class="seg"><button data-act="mt-prev" aria-label="Tuần trước">← Tuần trước</button><button data-act="mt-today">Tuần này</button><button data-act="mt-next" aria-label="Tuần sau">Tuần sau →</button></div><span class="spacer"></span><label class="check"><input type="checkbox" id="mt-mine" ${mtMine ? 'checked' : ''}> Chỉ cuộc họp tôi tham dự</label></div>
  <div class="week">${days.map(dd => { const list = ms.filter(m => m.start_at.slice(0, 10) === dd), w = new Date(dd + 'T00:00:00').getDay();
    return `<section class="day ${dd === TODAY() ? 'today' : ''} ${w === 0 || w === 6 ? 'we' : ''}"><header><b>${WD[w]}</b><span class="num">${fmtD(dd).slice(0, 5)}</span></header>
      ${list.map(m => `<button class="mt ${m.status}" data-meeting="${m.id}"><span class="num">${m.start_at.slice(11)}–${m.end_at.slice(11)}</span><b>${esc(m.title)}</b><small>${esc(m.room_name || m.place || 'Chưa có địa điểm')}</small>${m.my_response === 'pending' ? '<i>Mời bạn</i>' : ''}${m.status === 'cancelled' ? '<i>Đã hủy</i>' : ''}</button>`).join('') || '<p class="faint">—</p>'}</section>`; }).join('')}</div>`;
  $('#mt-mine').addEventListener('change', e => { mtMine = e.target.checked; render(); });
};
ACTIONS['mt-prev'] = () => { mtWeek = addDays(mtWeek, -7); render(); };
ACTIONS['mt-next'] = () => { mtWeek = addDays(mtWeek, 7); render(); };
ACTIONS['mt-today'] = () => { mtWeek = monday(TODAY()); render(); };
async function meetingForm(m) {
  const rooms = (await GET('/api/rooms')).filter(r => r.active);
  const sel = new Set(m ? m.members.map(x => x.user_id) : [B().me.id]);
  const day = m ? m.start_at.slice(0, 10) : (TODAY() >= mtWeek && TODAY() <= addDays(mtWeek, 6) ? TODAY() : mtWeek);
  openModal(`${mh(m ? 'Sửa lịch họp' : 'Đặt lịch họp')}<div class="modal-b"><div class="form three">
    <div class="field full" style="grid-column:1/-1"><label for="mf-t">Nội dung cuộc họp</label><input id="mf-t" value="${esc(m ? m.title : '')}" placeholder="Ví dụ: Họp triển khai kế hoạch quý I"></div>
    <div class="field"><label for="mf-d">Ngày</label><input type="date" id="mf-d" value="${day}"></div>
    <div class="field"><label for="mf-s">Từ</label><input type="time" id="mf-s" value="${m ? m.start_at.slice(11) : '09:00'}"></div>
    <div class="field"><label for="mf-e">Đến</label><input type="time" id="mf-e" value="${m ? m.end_at.slice(11) : '10:00'}"></div>
    <div class="field"><label for="mf-r">Phòng họp</label><select id="mf-r"><option value="">— Không dùng phòng —</option>${rooms.map(r => `<option value="${r.id}" ${m && m.room_id === r.id ? 'selected' : ''}>${esc(r.name)} (${r.capacity} chỗ)</option>`).join('')}</select></div>
    <div class="field"><label for="mf-p">Địa điểm khác / trực tuyến</label><input id="mf-p" value="${esc(m ? m.place : '')}"></div>
    <div class="field"><label for="mf-h">Chủ trì</label><select id="mf-h">${userOpts(m ? m.host_id : B().me.id)}</select></div>
    <div class="field" style="grid-column:1/-1"><label for="mf-a">Chương trình, tài liệu cần chuẩn bị</label><textarea id="mf-a">${esc(m ? m.agenda : '')}</textarea></div></div>
    <h3 class="sec-t">Thành phần tham dự (<span id="mf-n">${sel.size}</span>)</h3>
    <div class="member-pick">${B().departments.map(d => { const us = B().users.filter(u => u.active && u.dept_id === d.id); if (!us.length) return ''; return `<fieldset><legend><label class="check"><input type="checkbox" data-deptall="${d.id}"> ${esc(d.name)}</label></legend>${us.map(u => `<label class="check"><input type="checkbox" class="mf-u" value="${u.id}" data-dept="${d.id}" ${sel.has(u.id) ? 'checked' : ''}> ${esc(u.full_name)}</label>`).join('')}</fieldset>`; }).join('')}</div>
    <p class="err" id="mf-err" hidden></p></div>
  <div class="modal-f"><button class="btn" data-act="close">Hủy</button><button class="btn primary" data-act="m-save">${m ? 'Lưu' : 'Đặt lịch'}</button></div>`, {
    'm-save': btn => busy(btn, async () => {
      const d = $('#mf-d').value, b = { title: $('#mf-t').value, start_at: `${d} ${$('#mf-s').value}`, end_at: `${d} ${$('#mf-e').value}`, room_id: $('#mf-r').value, place: $('#mf-p').value, host_id: $('#mf-h').value, agenda: $('#mf-a').value, members: $$('.mf-u:checked').map(x => Number(x.value)) };
      try { const r = m ? await PUT('/api/meetings/' + m.id, b) : await POST('/api/meetings', b); closeModal(); mtWeek = monday(d); location.hash !== '#lich-hop' ? (location.hash = 'lich-hop') : render(); S.refreshBoot(); toast(m ? 'Đã cập nhật lịch họp' : 'Đã đặt lịch họp, gửi mời ' + (r.members.length - 1) + ' người'); } catch (e) { showErr('#mf-err', e); }
    })
  });
  const cnt = () => $('#mf-n').textContent = $$('.mf-u:checked').length;
  $$('[data-deptall]').forEach(c => c.addEventListener('change', () => { $$(`.mf-u[data-dept="${c.dataset.deptall}"]`).forEach(x => x.checked = c.checked); cnt(); }));
  $$('.mf-u').forEach(c => c.addEventListener('change', cnt));
}
async function meetingDetail(id) {
  const m = await GET('/api/meetings/' + id), me = B().me;
  const isMember = m.members.some(x => x.user_id === me.id);
  openModal(`${mh(esc(m.title), `${fmtD(m.start_at)} · ${m.start_at.slice(11)}–${m.end_at.slice(11)}${m.status === 'cancelled' ? ' · ĐÃ HỦY' : ''}`)}<div class="modal-b">
    <dl class="kv"><dt>Địa điểm</dt><dd>${esc([m.room_name, m.place].filter(Boolean).join(' · ') || '—')}</dd><dt>Chủ trì</dt><dd>${who(m.host_id)}</dd>${m.agenda ? `<dt>Chương trình</dt><dd>${esc(m.agenda)}</dd>` : ''}</dl>
    <h3 class="sec-t">Thành phần (${m.members.length})</h3>
    <div class="member-list">${m.members.map(x => `<span class="who">${av(x.user_id)}<span>${esc(x.full_name)}</span><i class="pill ${x.response === 'yes' ? 's-done' : x.response === 'no' ? 's-rejected' : 's-todo'}">${RESP[x.response]}</i></span>`).join('')}</div>
    ${isMember && m.status === 'scheduled' ? `<div class="actions"><span class="muted">Phản hồi của bạn: <b>${RESP[m.my_response]}</b></span><button class="btn sm ok" data-act="m-yes">Tham dự</button><button class="btn sm" data-act="m-no">Vắng mặt</button></div>` : ''}
    <h3 class="sec-t">Biên bản, kết luận</h3>
    ${m.can_edit && m.status !== 'cancelled' ? `<textarea id="mm-min" class="sel" style="min-height:140px;width:100%" placeholder="Nội dung kết luận, phân công thực hiện">${esc(m.minutes)}</textarea>` : `<div class="post-body">${esc(m.minutes) || '<span class="hint">Chưa có biên bản.</span>'}</div>`}
    ${m.can_edit && m.status !== 'cancelled' ? `<details class="stat-box"><summary><b>Giao việc từ kết luận cuộc họp</b></summary><div class="form three" style="margin-top:10px">
      <div class="field" style="grid-column:1/-1"><label for="mt-tt">Nội dung công việc</label><input id="mt-tt"></div>
      <div class="field"><label for="mt-ta">Người thực hiện</label><select id="mt-ta">${userOpts(null, u => m.members.some(x => x.user_id === u.id))}</select></div>
      <div class="field"><label for="mt-td">Hạn hoàn thành</label><input type="date" id="mt-td" value="${addDays(TODAY(), 7)}"></div>
      <div class="field"><label for="mt-tp">Dự án</label><select id="mt-tp">${B().projects.filter(p => !p.archived).map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></div>
      <div class="field" style="justify-content:flex-end"><button class="btn sm" data-act="m-task">Giao việc</button></div></div></details>` : ''}
    <p class="err" id="md-err" hidden></p></div>
  <div class="modal-f">${m.can_edit && m.status === 'scheduled' ? '<button class="btn danger" data-act="m-cancel" style="margin-right:auto">Hủy cuộc họp</button><button class="btn" data-act="m-edit">Sửa</button>' : ''}<button class="btn" data-act="close">Đóng</button>${m.can_edit && m.status !== 'cancelled' ? '<button class="btn primary" data-act="m-min">Lưu biên bản</button>' : ''}</div>`, {
    'm-yes': btn => busy(btn, async () => { await POST(`/api/meetings/${m.id}/respond`, { response: 'yes' }); meetingDetail(m.id); render(); }),
    'm-no': btn => busy(btn, async () => { await POST(`/api/meetings/${m.id}/respond`, { response: 'no' }); meetingDetail(m.id); render(); }),
    'm-min': btn => busy(btn, async () => { try { await POST(`/api/meetings/${m.id}/minutes`, { minutes: $('#mm-min').value }); toast('Đã lưu biên bản'); closeModal(); render(); } catch (e) { showErr('#md-err', e); } }),
    'm-cancel': async btn => { if (!armed(btn, 'Bấm lần nữa để hủy')) return; await POST(`/api/meetings/${m.id}/cancel`); closeModal(); render(); toast('Đã hủy cuộc họp'); },
    'm-edit': () => meetingForm(m),
    'm-task': btn => busy(btn, async () => { try { const d = $('#mt-td').value; await POST('/api/tasks', { title: $('#mt-tt').value, assignee_id: $('#mt-ta').value, project_id: $('#mt-tp').value, start_date: TODAY(), due_date: d, priority: 'tb', status: 'todo', description: 'Theo kết luận cuộc họp: ' + m.title + ' (' + fmtD(m.start_at) + ')' }); $('#mt-tt').value = ''; toast('Đã giao việc'); S.refreshBoot(); } catch (e) { showErr('#md-err', e); } })
  });
}
async function roomsModal() {
  const rooms = await GET('/api/rooms');
  openModal(`${mh('Danh mục phòng họp')}<div class="modal-b"><div class="tbl-wrap"><table class="tbl" style="min-width:520px"><thead><tr><th>Phòng</th><th>Vị trí</th><th class="r">Sức chứa</th><th>Trang thiết bị</th><th></th></tr></thead><tbody>
    ${rooms.map(r => `<tr><td class="t-title">${esc(r.name)}${r.active ? '' : ' <span class="faint">(ngừng)</span>'}</td><td>${esc(r.location)}</td><td class="r num">${r.capacity}</td><td>${esc(r.equipment)}</td><td><button class="btn ghost sm" data-act="r-toggle" data-id="${r.id}">${r.active ? 'Ngừng dùng' : 'Dùng lại'}</button></td></tr>`).join('')}</tbody></table></div>
    <div class="form three" style="background:var(--sunken);padding:12px;border-radius:8px"><div class="field"><label for="rm-n">Tên phòng</label><input id="rm-n"></div><div class="field"><label for="rm-l">Vị trí</label><input id="rm-l"></div><div class="field"><label for="rm-c">Sức chứa</label><input id="rm-c" type="number" min="1" value="10"></div><div class="field" style="grid-column:1/3"><label for="rm-e">Trang thiết bị</label><input id="rm-e"></div><div class="field" style="justify-content:flex-end"><button class="btn sm" data-act="r-add">+ Thêm phòng</button></div></div><p class="err" id="rm-err" hidden></p></div>
    <div class="modal-f"><button class="btn" data-act="close">Đóng</button></div>`, {
    'r-add': btn => busy(btn, async () => { try { await POST('/api/rooms', { name: $('#rm-n').value, location: $('#rm-l').value, capacity: $('#rm-c').value, equipment: $('#rm-e').value }); roomsModal(); } catch (e) { showErr('#rm-err', e); } }),
    'r-toggle': async btn => { const r = rooms.find(x => x.id === Number(btn.dataset.id)); await PUT('/api/rooms/' + r.id, Object.assign({}, r, { active: !r.active })); roomsModal(); }
  });
}
ACTIONS['mt-new'] = () => meetingForm(null).catch(e => toast(e.message, true));
ACTIONS['rooms'] = () => roomsModal().catch(e => toast(e.message, true));
pickHandler('data-meeting', id => meetingDetail(id).catch(e => toast(e.message, true)));

/* ======================================================== TÀI LIỆU */
const DOC_CAT = { phapquy: 'Văn bản quy phạm pháp luật', quyche: 'Quy chế, quy định nội bộ', vbden: 'Văn bản đến', vbdi: 'Văn bản đi', bieumau: 'Biểu mẫu', huongdan: 'Hướng dẫn, tri thức', hopdong: 'Hợp đồng', khac: 'Khác' };
let dcCat = '', dcQ = '';
VIEWS['tai-lieu'] = async main => {
  const d = await GET('/api/docs?' + new URLSearchParams({ category: dcCat, q: dcQ }));
  main.innerHTML = `<div class="page-head"><div><h1>Tài liệu – Tri thức</h1><p>Kho văn bản, quy chế, biểu mẫu và hướng dẫn nội bộ</p></div>${d.can_upload ? '<div class="actions"><button class="btn primary" data-act="doc-new">+ Thêm tài liệu</button></div>' : ''}</div>
  <div class="doc-layout"><nav class="doc-cats card">${[['', 'Tất cả tài liệu'], ...Object.entries(DOC_CAT)].map(([k, l]) => `<button data-dccat="${k}" aria-pressed="${dcCat === k}">${l}</button>`).join('')}</nav>
  <div style="min-width:0"><div class="toolbar"><input class="search" style="width:100%;max-width:440px" id="dcq" type="search" placeholder="Tìm theo trích yếu, số ký hiệu, cơ quan ban hành, nội dung…" value="${esc(dcQ)}" aria-label="Tìm tài liệu"></div>
  <section class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Số, ký hiệu</th><th>Trích yếu</th><th>Ngày ban hành</th><th>Cơ quan ban hành</th><th>Loại</th></tr></thead><tbody>
  ${d.docs.map(x => `<tr class="click" data-doc="${x.id}"><td class="mono">${esc(x.number) || '—'}</td><td><div class="t-title">${esc(x.title)}</div><div class="t-sub">${x.file_name ? '📎 ' + esc(x.file_name) + ' · ' + fmtSize(x.file_size) : 'Bài viết'}${x.dept_id ? ' · Nội bộ ' + esc(Dp(x.dept_id).name) : ''}</div></td><td class="num">${fmtD(x.issued_date)}</td><td>${esc(x.issuer)}</td><td><span class="tag">${DOC_CAT[x.category]}</span></td></tr>`).join('') || '<tr><td colspan="5" class="empty">Không có tài liệu phù hợp.</td></tr>'}</tbody></table></div></section></div></div>`;
  searchBox('dcq', dcQ, '', v => dcQ = v);
};
async function docDetail(id) {
  const x = await GET('/api/docs/' + id);
  openModal(`${mh(esc(x.title), DOC_CAT[x.category])}<div class="modal-b"><dl class="kv">
    ${x.number ? `<dt>Số, ký hiệu</dt><dd class="mono">${esc(x.number)}</dd>` : ''}${x.issued_date ? `<dt>Ngày ban hành</dt><dd>${fmtD(x.issued_date)}</dd>` : ''}${x.issuer ? `<dt>Cơ quan ban hành</dt><dd>${esc(x.issuer)}</dd>` : ''}
    <dt>Phạm vi</dt><dd>${x.dept_id ? 'Nội bộ ' + esc(Dp(x.dept_id).name) : 'Toàn đơn vị'}</dd>${x.description ? `<dt>Tóm tắt</dt><dd>${esc(x.description)}</dd>` : ''}
    <dt>Người cập nhật</dt><dd>${esc(x.uploader)} · ${fmtDT(x.created_at)} · ${x.views} lượt xem</dd></dl>
    ${x.file_name ? `<a class="btn primary" style="align-self:flex-start" href="/api/docs/${x.id}/file">Tải tệp: ${esc(x.file_name)} (${fmtSize(x.file_size)})</a>` : ''}
    ${x.body ? `<div class="post-body">${esc(x.body)}</div>` : ''}</div>
  <div class="modal-f">${x.can_edit ? '<button class="btn danger" data-act="m-del" style="margin-right:auto">Xóa</button><button class="btn" data-act="m-edit">Sửa</button>' : ''}<button class="btn" data-act="close">Đóng</button></div>`, {
    'm-edit': () => docForm(x),
    'm-del': async btn => { if (!armed(btn, 'Bấm lần nữa để xóa')) return; await DEL('/api/docs/' + x.id); closeModal(); render(); toast('Đã xóa tài liệu'); }
  });
}
function docForm(x) {
  let file = null;
  openModal(`${mh(x ? 'Sửa tài liệu' : 'Thêm tài liệu')}<div class="modal-b"><div class="form">
    <div class="field full"><label for="df-t">Trích yếu / tên tài liệu</label><input id="df-t" value="${esc(x ? x.title : '')}"></div>
    <div class="field"><label for="df-c">Loại tài liệu</label><select id="df-c">${opts(DOC_CAT, x ? x.category : 'quyche')}</select></div>
    <div class="field"><label for="df-n">Số, ký hiệu</label><input id="df-n" value="${esc(x ? x.number : '')}" placeholder="Ví dụ: 12/2026/QĐ-SO"></div>
    <div class="field"><label for="df-d">Ngày ban hành</label><input type="date" id="df-d" value="${x && x.issued_date ? x.issued_date : ''}"></div>
    <div class="field"><label for="df-i">Cơ quan, đơn vị ban hành</label><input id="df-i" value="${esc(x ? x.issuer : '')}"></div>
    <div class="field"><label for="df-s">Phạm vi xem</label><select id="df-s">${deptOpts(x ? x.dept_id : null, 'Toàn đơn vị')}</select></div>
    <div class="field"><label for="df-f">Tệp đính kèm (tối đa 20 MB)</label><input type="file" id="df-f">${x && x.file_name ? `<span class="hint">Tệp hiện tại: ${esc(x.file_name)}. Chọn tệp mới để thay thế.</span>` : ''}</div>
    <div class="field full"><label for="df-ds">Tóm tắt</label><input id="df-ds" value="${esc(x ? x.description : '')}"></div>
    <div class="field full"><label for="df-b">Nội dung bài viết (dùng cho hướng dẫn, tri thức; không bắt buộc nếu đã đính kèm tệp)</label><textarea id="df-b" style="min-height:160px">${esc(x ? x.body : '')}</textarea></div>
  </div><p class="err" id="df-err" hidden></p></div>
  <div class="modal-f"><button class="btn" data-act="close">Hủy</button><button class="btn primary" data-act="m-save">Lưu tài liệu</button></div>`, {
    'm-save': btn => busy(btn, async () => {
      const b = { title: $('#df-t').value, category: $('#df-c').value, number: $('#df-n').value, issued_date: $('#df-d').value, issuer: $('#df-i').value, dept_id: $('#df-s').value, description: $('#df-ds').value, body: $('#df-b').value };
      if (file) Object.assign(b, file);
      try { x ? await PUT('/api/docs/' + x.id, b) : await POST('/api/docs', b); closeModal(); render(); toast('Đã lưu tài liệu'); } catch (e) { showErr('#df-err', e); }
    })
  });
  $('#df-f').addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return (file = null);
    if (f.size > 20 * 1024 * 1024) { e.target.value = ''; return showErr('#df-err', 'Tệp vượt quá 20 MB.'); }
    const r = new FileReader();
    r.onload = () => { file = { file_name: f.name, file_mime: f.type, file_data: String(r.result).split(',')[1] }; if (!$('#df-t').value) $('#df-t').value = f.name.replace(/\.[^.]+$/, ''); };
    r.readAsDataURL(f);
  });
}
ACTIONS['doc-new'] = () => docForm(null);
pickHandler('data-doc', id => docDetail(id).catch(e => toast(e.message, true)));
pickHandler('data-dccat', v => { dcCat = v; render(); });

/* ======================================================== KHÁCH HÀNG (CRM) */
const CST = { tiemnang: 'Tiềm năng', chamsoc: 'Đang chăm sóc', khachhang: 'Đã mua hàng', ngung: 'Ngừng giao dịch' };
const CST_CLS = { tiemnang: 's-todo', chamsoc: 's-doing', khachhang: 's-done', ngung: 's-cancelled' };
const STAGE = { moi: 'Mới', tiepcan: 'Tiếp cận', baogia: 'Đã báo giá', damphan: 'Đàm phán', thang: 'Thành công', thua: 'Thất bại' };
const AK = { goidien: 'Gọi điện', gapmat: 'Gặp mặt', email: 'Email', baogia: 'Gửi báo giá', ghichu: 'Ghi chú', lichhen: 'Lịch hẹn' };
let crTab = 'cus', crQ = '', crSt = '';
VIEWS['khach-hang'] = async main => {
  const tabs = `<div class="toolbar"><div class="seg">${[['cus', 'Khách hàng'], ['deals', 'Cơ hội bán hàng'], ['agenda', 'Lịch hẹn của tôi']].map(([k, l]) => `<button data-crtab="${k}" aria-pressed="${crTab === k}">${l}</button>`).join('')}</div><span class="spacer"></span>${crTab === 'cus' ? `<select class="sel" id="cr-st" aria-label="Tình trạng"><option value="">Mọi tình trạng</option>${opts(CST, crSt)}</select><input class="search" id="crq" type="search" placeholder="Tìm tên, điện thoại, MST…" value="${esc(crQ)}" aria-label="Tìm khách hàng">` : ''}</div>`;
  const head = `<div class="page-head"><div><h1>Khách hàng</h1><p>Quản lý khách hàng, cơ hội bán hàng và lịch sử chăm sóc</p></div><div class="actions"><button class="btn" data-act="deal-new">+ Cơ hội</button><button class="btn primary" data-act="cus-new">+ Khách hàng</button></div></div>` + tabs;
  if (crTab === 'deals') {
    const ds = await GET('/api/crm/deals');
    const openVal = ds.filter(d => !['thang', 'thua'].includes(d.stage)).reduce((s, d) => s + d.value, 0);
    main.innerHTML = head + `<p class="muted" style="margin:0 0 10px">Giá trị cơ hội đang theo đuổi: <b class="num">${vnd(openVal)}</b> · Kéo thả thẻ để chuyển giai đoạn.</p>
    <div class="board pipe">${Object.keys(STAGE).map(s => { const col = ds.filter(d => d.stage === s); return `<div class="col" data-stage="${s}"><div class="col-h"><span>${STAGE[s]}</span><span class="muted num">${col.length} · ${shortVnd(col.reduce((a, d) => a + d.value, 0))}</span></div>
      ${col.map(d => `<div class="kcard" draggable="true" data-deal="${d.id}"><div class="t-title">${esc(d.title)}</div><div class="t-sub">${esc(d.customer_name)}</div><div class="row"><b class="num">${shortVnd(d.value)}</b><span class="num ${d.expected_close && d.expected_close < TODAY() && !['thang', 'thua'].includes(d.stage) ? 'late' : 'muted'}">${fmtD(d.expected_close).slice(0, 5)}</span>${av(d.owner_id)}</div></div>`).join('')}</div>`; }).join('')}</div>`;
    main._deals = ds; wirePipe(ds); return;
  }
  if (crTab === 'agenda') {
    const ag = await GET('/api/crm/agenda');
    main.innerHTML = head + `<section class="card"><div class="list">${ag.map(a => `<div class="item" data-cus="${a.customer_id}"><div style="display:flex;flex-direction:column;gap:4px"><h3>${esc(a.customer_name)}</h3><div class="meta">${esc(a.content)}</div></div><div class="right"><span class="num ${a.due_at < TODAY() ? 'late' : ''}">${fmtDT(a.due_at)}</span><button class="btn sm" data-act="ag-done" data-id="${a.id}">Đã thực hiện</button></div></div>`).join('') || '<div class="empty">Không có lịch hẹn sắp tới.</div>'}</div></section>`;
    return;
  }
  const cs = await GET('/api/crm/customers?' + new URLSearchParams({ q: crQ, status: crSt }));
  main.innerHTML = head + `<section class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Khách hàng</th><th>Liên hệ</th><th>Phụ trách</th><th>Tình trạng</th><th class="r">Cơ hội mở</th><th class="r">Doanh số đã chốt</th><th>Chăm sóc gần nhất</th></tr></thead><tbody>
    ${cs.map(c => `<tr class="click" data-cus="${c.id}"><td><div class="t-title">${esc(c.name)}</div><div class="t-sub mono">${esc(c.code)}${c.tax_code ? ' · MST ' + esc(c.tax_code) : ''}</div></td><td><div>${esc(c.contact_name)}</div><div class="t-sub num">${esc(c.phone)}</div></td><td>${who(c.owner_id)}</td><td><span class="pill ${CST_CLS[c.status]}">${CST[c.status]}</span></td><td class="r num">${c.open_deals || ''}</td><td class="r num">${c.won_value ? money(c.won_value) : ''}</td><td class="num ${c.last_activity && c.last_activity < addDays(TODAY(), -30) ? 'late' : 'muted'}">${c.last_activity ? fmtD(c.last_activity) : '—'}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">Chưa có khách hàng.</td></tr>'}</tbody></table></div></section>`;
  searchBox('crq', crQ, '', v => crQ = v);
  $('#cr-st').addEventListener('change', e => { crSt = e.target.value; render(); });
};
function wirePipe(ds) {
  let drag = null;
  $$('.pipe .kcard').forEach(c => { c.addEventListener('dragstart', () => { drag = c.dataset.deal; c.classList.add('dragging'); }); c.addEventListener('dragend', () => c.classList.remove('dragging')); });
  $$('.pipe .col').forEach(col => {
    col.addEventListener('dragover', e => { e.preventDefault(); col.classList.add('over'); });
    col.addEventListener('dragleave', () => col.classList.remove('over'));
    col.addEventListener('drop', async e => { e.preventDefault(); col.classList.remove('over'); const d = ds.find(x => String(x.id) === drag); if (!d || d.stage === col.dataset.stage) return;
      try { await PUT('/api/crm/deals/' + d.id, { stage: col.dataset.stage }); toast(`Đã chuyển sang “${STAGE[col.dataset.stage]}”`); render(); } catch (er) { toast(er.message, true); } });
  });
}
async function cusDetail(id) {
  const c = await GET('/api/crm/customers/' + id);
  openModal(`${mh(esc(c.name), esc(c.code) + ' · ' + CST[c.status])}<div class="modal-b">
    <dl class="kv"><dt>Loại</dt><dd>${c.kind === 'canhan' ? 'Cá nhân' : 'Doanh nghiệp, tổ chức'}${c.tax_code ? ' · MST ' + esc(c.tax_code) : ''}</dd><dt>Người liên hệ</dt><dd>${esc(c.contact_name) || '—'}</dd><dt>Điện thoại, email</dt><dd class="num">${esc([c.phone, c.email].filter(Boolean).join(' · ')) || '—'}</dd><dt>Địa chỉ</dt><dd>${esc(c.address) || '—'}</dd><dt>Nguồn</dt><dd>${esc(c.source) || '—'}</dd><dt>Phụ trách</dt><dd>${who(c.owner_id)}</dd>${c.note ? `<dt>Ghi chú</dt><dd>${esc(c.note)}</dd>` : ''}</dl>
    <h3 class="sec-t">Cơ hội bán hàng (${c.deals.length})</h3>
    ${c.deals.length ? `<div class="tbl-wrap"><table class="tbl" style="min-width:480px"><tbody>${c.deals.map(d => `<tr class="click" data-deal="${d.id}"><td class="t-title">${esc(d.title)}</td><td class="r num">${money(d.value)}</td><td><span class="pill ${d.stage === 'thang' ? 's-done' : d.stage === 'thua' ? 's-rejected' : 's-doing'}">${STAGE[d.stage]}</span></td><td class="num muted">${fmtD(d.expected_close)}</td></tr>`).join('')}</tbody></table></div>` : '<span class="hint">Chưa có cơ hội.</span>'}
    <button class="btn sm" data-act="m-deal" style="align-self:flex-start">+ Thêm cơ hội</button>
    <h3 class="sec-t">Lịch sử chăm sóc</h3>
    <div class="form three" style="background:var(--sunken);padding:12px;border-radius:8px"><div class="field"><label for="ca-k">Hình thức</label><select id="ca-k">${opts(AK, 'goidien')}</select></div><div class="field" id="ca-dw" hidden><label for="ca-d">Thời gian hẹn</label><input type="datetime-local" id="ca-d"></div><div class="field" style="grid-column:1/-1"><label for="ca-c">Nội dung</label><input id="ca-c" placeholder="Kết quả trao đổi, nhu cầu của khách hàng, việc cần làm tiếp"></div><div class="field" style="justify-content:flex-end"><button class="btn sm primary" data-act="m-act">Ghi nhận</button></div></div>
    <ul class="feed">${c.activities.map(a => `<li>${av(a.user_id)}<div><b>${esc(a.full_name)}</b> · <span class="tag">${AK[a.kind]}</span>${a.kind === 'lichhen' ? ` <span class="pill ${a.done ? 's-done' : 's-pending'}">${a.done ? 'Đã thực hiện' : 'Hẹn ' + fmtDT(a.due_at)}</span>` : ''}<p style="margin:4px 0 0">${esc(a.content)}</p><time>${fmtDT(a.created_at)}</time></div></li>`).join('') || '<li class="muted">Chưa có hoạt động.</li>'}</ul>
    <p class="err" id="cd-err" hidden></p></div>
  <div class="modal-f"><button class="btn" data-act="m-edit" style="margin-right:auto">Sửa thông tin</button><button class="btn" data-act="close">Đóng</button></div>`, {
    'm-act': btn => busy(btn, async () => { const dv = $('#ca-d').value; try { await POST('/api/crm/activities', { customer_id: c.id, kind: $('#ca-k').value, content: $('#ca-c').value, due_at: dv ? dv.replace('T', ' ').slice(0, 16) : '' }); cusDetail(c.id); render(); } catch (e) { showErr('#cd-err', e); } }),
    'm-edit': () => cusForm(c), 'm-deal': () => dealForm(null, c.id)
  });
  $('#ca-k').addEventListener('change', e => { $('#ca-dw').hidden = e.target.value !== 'lichhen'; });
}
function cusForm(c) {
  openModal(`${mh(c ? 'Sửa thông tin khách hàng' : 'Thêm khách hàng')}<div class="modal-b"><div class="form">
    <div class="field full"><label for="cf-n">Tên khách hàng</label><input id="cf-n" value="${esc(c ? c.name : '')}"></div>
    <div class="field"><label for="cf-k">Loại</label><select id="cf-k"><option value="doanhnghiep">Doanh nghiệp, tổ chức</option><option value="canhan" ${c && c.kind === 'canhan' ? 'selected' : ''}>Cá nhân</option></select></div>
    <div class="field"><label for="cf-t">Mã số thuế</label><input id="cf-t" value="${esc(c ? c.tax_code : '')}"></div>
    <div class="field"><label for="cf-ct">Người liên hệ</label><input id="cf-ct" value="${esc(c ? c.contact_name : '')}"></div>
    <div class="field"><label for="cf-p">Điện thoại</label><input id="cf-p" value="${esc(c ? c.phone : '')}"></div>
    <div class="field"><label for="cf-e">Email</label><input id="cf-e" value="${esc(c ? c.email : '')}"></div>
    <div class="field"><label for="cf-s">Nguồn khách hàng</label><input id="cf-s" value="${esc(c ? c.source : '')}" placeholder="Giới thiệu, website, hội chợ…"></div>
    <div class="field full"><label for="cf-a">Địa chỉ</label><input id="cf-a" value="${esc(c ? c.address : '')}"></div>
    <div class="field"><label for="cf-o">Nhân viên phụ trách</label><select id="cf-o">${userOpts(c ? c.owner_id : B().me.id)}</select></div>
    <div class="field"><label for="cf-st">Tình trạng</label><select id="cf-st">${opts(CST, c ? c.status : 'tiemnang')}</select></div>
    <div class="field full"><label for="cf-no">Ghi chú</label><textarea id="cf-no">${esc(c ? c.note : '')}</textarea></div></div><p class="err" id="cf-err" hidden></p></div>
  <div class="modal-f">${c ? '<button class="btn danger" data-act="m-del" style="margin-right:auto">Xóa</button>' : ''}<button class="btn" data-act="close">Hủy</button><button class="btn primary" data-act="m-save">Lưu</button></div>`, {
    'm-save': btn => busy(btn, async () => { const b = { name: $('#cf-n').value, kind: $('#cf-k').value, tax_code: $('#cf-t').value, contact_name: $('#cf-ct').value, phone: $('#cf-p').value, email: $('#cf-e').value, source: $('#cf-s').value, address: $('#cf-a').value, owner_id: $('#cf-o').value, status: $('#cf-st').value, note: $('#cf-no').value };
      try { if (c) { await PUT('/api/crm/customers/' + c.id, b); cusDetail(c.id); } else { const r = await POST('/api/crm/customers', b); cusDetail(r.id); } render(); toast('Đã lưu khách hàng'); } catch (e) { showErr('#cf-err', e); } }),
    'm-del': async btn => { if (!armed(btn, 'Xóa cả cơ hội, lịch sử?')) return; try { await DEL('/api/crm/customers/' + c.id); closeModal(); render(); toast('Đã xóa khách hàng'); } catch (e) { showErr('#cf-err', e); } }
  });
}
async function dealForm(d, cusId) {
  const cs = await GET('/api/crm/customers');
  if (!cs.length) return toast('Vui lòng thêm khách hàng trước.', true);
  openModal(`${mh(d ? 'Cơ hội bán hàng' : 'Thêm cơ hội bán hàng')}<div class="modal-b"><div class="form">
    <div class="field full"><label for="dl-c">Khách hàng</label><select id="dl-c" ${d ? 'disabled' : ''}>${cs.map(c => `<option value="${c.id}" ${(d ? d.customer_id : cusId) === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
    <div class="field full"><label for="dl-t">Tên cơ hội</label><input id="dl-t" value="${esc(d ? d.title : '')}" placeholder="Ví dụ: Cung cấp 20 máy tính cho văn phòng"></div>
    <div class="field"><label for="dl-v">Giá trị dự kiến (đồng)</label>${moneyIn('dl-v', d && d.value)}</div>
    <div class="field"><label for="dl-s">Giai đoạn</label><select id="dl-s">${opts(STAGE, d ? d.stage : 'moi')}</select></div>
    <div class="field"><label for="dl-e">Dự kiến chốt</label><input type="date" id="dl-e" value="${d && d.expected_close ? d.expected_close : addDays(TODAY(), 30)}"></div>
    <div class="field"><label for="dl-o">Phụ trách</label><select id="dl-o">${userOpts(d ? d.owner_id : B().me.id)}</select></div>
    <div class="field full"><label for="dl-n">Ghi chú</label><textarea id="dl-n">${esc(d ? d.note : '')}</textarea></div></div><p class="err" id="dl-err" hidden></p></div>
  <div class="modal-f">${d ? '<button class="btn danger" data-act="m-del" style="margin-right:auto">Xóa</button>' : ''}<button class="btn" data-act="close">Hủy</button><button class="btn primary" data-act="m-save">Lưu</button></div>`, {
    'm-save': btn => busy(btn, async () => { const b = { customer_id: $('#dl-c').value, title: $('#dl-t').value, value: readMoney('dl-v'), stage: $('#dl-s').value, expected_close: $('#dl-e').value, owner_id: $('#dl-o').value, note: $('#dl-n').value };
      try { d ? await PUT('/api/crm/deals/' + d.id, b) : await POST('/api/crm/deals', b); closeModal(); render(); toast(b.stage === 'thang' ? 'Chúc mừng! Cơ hội đã chốt thành công' : 'Đã lưu cơ hội'); } catch (e) { showErr('#dl-err', e); } }),
    'm-del': async btn => { if (!armed(btn, 'Bấm lần nữa để xóa')) return; await DEL('/api/crm/deals/' + d.id); closeModal(); render(); }
  });
}
ACTIONS['cus-new'] = () => cusForm(null);
ACTIONS['deal-new'] = () => dealForm(null, null).catch(e => toast(e.message, true));
ACTIONS['ag-done'] = async btn => { await PUT('/api/crm/activities/' + btn.dataset.id, { done: true }); render(); toast('Đã đánh dấu thực hiện'); };
pickHandler('data-crtab', v => { crTab = v; render(); });
pickHandler('data-cus', id => cusDetail(id).catch(e => toast(e.message, true)));
document.addEventListener('click', e => { const el = e.target.closest('[data-deal]'); if (!el) return; const ds = ($('#main')._deals || []); const inModal = !!e.target.closest('#modal');
  const go = async () => { const d = ds.find(x => x.id === Number(el.dataset.deal)) || (await GET('/api/crm/deals')).find(x => x.id === Number(el.dataset.deal)); if (d) dealForm(d); };
  if (inModal || crTab === 'deals') go().catch(er => toast(er.message, true)); });

/* ======================================================== THU CHI – NGÂN SÁCH */
let fnYear = Number(TODAY().slice(0, 4)), fnMonth = TODAY().slice(0, 7), fnKind = '', FINCAT = null;
const RT = { thanhtoan: 'Đề nghị thanh toán', mua: 'Đề xuất mua sắm', tamung: 'Đề nghị tạm ứng' };
const REQ_CAT = { thanhtoan: 'dichvu', mua: 'muasam', tamung: 'tamung' };
VIEWS['thu-chi'] = async main => {
  const [s, txs] = await Promise.all([GET('/api/fin/summary?year=' + fnYear), GET('/api/fin/tx?' + new URLSearchParams({ month: fnMonth, kind: fnKind }))]);
  FINCAT = s.categories;
  const mx = Math.max(1, ...s.months.map(m => Math.max(m.thu, m.chi)));
  const catName = (k, c) => (FINCAT[k] || {})[c] || c;
  main.innerHTML = `<div class="page-head"><div><h1>Thu chi – Ngân sách</h1><p>Năm ${s.year} · số liệu theo chứng từ đã lập</p></div>
  <div class="actions"><select class="sel" id="fn-y" aria-label="Năm">${[fnYear - 1, fnYear, fnYear + 1].map(y => `<option ${y === fnYear ? 'selected' : ''}>${y}</option>`).join('')}</select><button class="btn" data-act="fin-budget">Lập ngân sách</button><button class="btn" data-act="fin-thu">+ Phiếu thu</button><button class="btn primary" data-act="fin-chi">+ Phiếu chi</button></div></div>
  <div class="stats">${[['Tồn quỹ (lũy kế)', s.balance_total], [`Tổng thu năm ${s.year}`, s.thu_year], [`Tổng chi năm ${s.year}`, s.chi_year], ['Đề xuất đã duyệt chờ chi', s.pending.reduce((a, p) => a + p.amount, 0), s.pending.length + ' đề xuất']].map(([k, v, sub]) => `<div class="card stat"><span class="k">${k}</span><span class="v num" style="font-size:20px">${money(v)}</span><span class="s">${sub || 'đồng'}</span></div>`).join('')}</div>
  <div class="grid2"><div class="stack">
    <section class="card"><div class="card-h"><h2>Thu – chi theo tháng</h2><div class="legend"><span><i style="background:var(--ok)"></i>Thu</span><span><i style="background:var(--bad)"></i>Chi</span></div></div>
      <div class="card-b"><div class="mbars">${s.months.map(m => `<div class="mb" title="Tháng ${m.month.slice(5)}: thu ${money(m.thu)}, chi ${money(m.chi)}"><div class="mb-cols"><i class="t" style="height:${m.thu / mx * 100}%"></i><i class="c" style="height:${m.chi / mx * 100}%"></i></div><span>T${Number(m.month.slice(5))}</span></div>`).join('')}</div></div></section>
    <section class="card"><div class="card-h"><h2>Sổ thu chi</h2><div class="actions"><input type="month" class="sel" id="fn-m" value="${fnMonth}" aria-label="Tháng"><select class="sel" id="fn-k" aria-label="Loại"><option value="">Thu và chi</option><option value="thu" ${fnKind === 'thu' ? 'selected' : ''}>Chỉ thu</option><option value="chi" ${fnKind === 'chi' ? 'selected' : ''}>Chỉ chi</option></select><a class="btn sm" href="/api/export/fin.csv?month=${fnMonth}">Xuất CSV</a></div></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Chứng từ</th><th>Diễn giải</th><th>Khoản mục</th><th class="r">Thu</th><th class="r">Chi</th></tr></thead><tbody>
      ${txs.map(t => `<tr class="click ${t.voided ? 'voided' : ''}" data-tx="${t.id}"><td><div class="mono">${esc(t.code)}</div><div class="t-sub num">${fmtD(t.tx_date)}</div></td><td><div>${esc(t.description)}</div><div class="t-sub">${esc(t.partner)}${t.request_code ? ' · theo ' + esc(t.request_code) : ''}${t.voided ? ' · ĐÃ HỦY' : ''}</div></td><td><span class="tag">${esc(catName(t.kind, t.category))}</span>${t.dept_name ? `<div class="t-sub">${esc(t.dept_name)}</div>` : ''}</td><td class="r num ok-t">${t.kind === 'thu' ? money(t.amount) : ''}</td><td class="r num bad-t">${t.kind === 'chi' ? money(t.amount) : ''}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">Không có chứng từ trong tháng.</td></tr>'}</tbody></table></div></section>
  </div><div class="stack">
    <section class="card"><div class="card-h"><h2>Đề xuất đã duyệt chờ chi</h2></div><div class="list">${s.pending.map(p => `<div class="item" data-req="${p.id}"><div style="display:flex;flex-direction:column;gap:3px;min-width:0"><span class="mono muted" style="font-size:12px">${esc(p.code)} · ${RT[p.type]}</span><h3>${esc(p.title)}</h3><div class="meta">${esc(p.creator_name)} · duyệt ${fmtD(p.closed_at)}</div></div><div class="right"><span class="amt mono">${money(p.amount)}</span><button class="btn sm primary" data-act="fin-pay" data-id="${p.id}">Lập phiếu chi</button></div></div>`).join('') || '<div class="empty">Không có đề xuất chờ chi.</div>'}</div></section>
    <section class="card"><div class="card-h"><h2>Ngân sách chi năm ${s.year}</h2></div><div class="card-b">${s.budgets.map(b => { const pc = b.amount ? b.spent / b.amount * 100 : 0; return `<div class="bud"><div class="bud-h"><span><b>${esc(catName('chi', b.category))}</b> · ${esc(b.dept_name)}</span><span class="num ${pc > 100 ? 'late' : 'muted'}">${shortVnd(b.spent)} / ${shortVnd(b.amount)}</span></div><div class="prog ${pc > 100 ? 'bad' : pc > 80 ? 'warn' : 'ok'}"><i style="width:${Math.min(100, pc)}%"></i></div></div>`; }).join('') || '<p class="muted">Chưa lập ngân sách. Bấm “Lập ngân sách”.</p>'}</div></section>
  </div></div>`;
  main._fin = s; main._txs = txs;
  $('#fn-y').addEventListener('change', e => { fnYear = Number(e.target.value); render(); });
  $('#fn-m').addEventListener('change', e => { if (e.target.value) { fnMonth = e.target.value; render(); } });
  $('#fn-k').addEventListener('change', e => { fnKind = e.target.value; render(); });
};
function txForm(kind, req) {
  const cats = FINCAT[kind];
  openModal(`${mh(kind === 'thu' ? 'Lập phiếu thu' : 'Lập phiếu chi', req ? 'Theo ' + esc(req.code) : '')}<div class="modal-b"><div class="form">
    <div class="field"><label for="tx-d">Ngày chứng từ</label><input type="date" id="tx-d" value="${TODAY()}"></div>
    <div class="field"><label for="tx-a">Số tiền (đồng)</label>${moneyIn('tx-a', req && req.amount)}</div>
    <div class="field"><label for="tx-c">Khoản mục</label><select id="tx-c">${opts(cats, req ? REQ_CAT[req.type] : Object.keys(cats)[0])}</select></div>
    <div class="field"><label for="tx-dp">Phòng ban</label><select id="tx-dp">${deptOpts(req ? req.dept_id : null, '— Không phân bổ —')}</select></div>
    <div class="field"><label for="tx-p">${kind === 'thu' ? 'Người nộp / đơn vị' : 'Người nhận / đơn vị'}</label><input id="tx-p" value="${esc(req ? req.creator_name : '')}"></div>
    <div class="field"><label for="tx-m">Hình thức</label><select id="tx-m"><option value="chuyenkhoan">Chuyển khoản</option><option value="tienmat">Tiền mặt</option></select></div>
    <div class="field full"><label for="tx-ds">Diễn giải</label><input id="tx-ds" value="${esc(req ? req.title : '')}"></div></div><p class="err" id="tx-err" hidden></p></div>
  <div class="modal-f"><button class="btn" data-act="close">Hủy</button><button class="btn primary" data-act="m-save">Lập phiếu</button></div>`, {
    'm-save': btn => busy(btn, async () => { try { await POST('/api/fin/tx', { kind, tx_date: $('#tx-d').value, amount: readMoney('tx-a'), category: $('#tx-c').value, dept_id: $('#tx-dp').value, partner: $('#tx-p').value, method: $('#tx-m').value, description: $('#tx-ds').value, request_id: req ? req.id : null }); closeModal(); fnMonth = $('#tx-d') ? fnMonth : fnMonth; render(); toast('Đã lập chứng từ'); } catch (e) { showErr('#tx-err', e); } })
  });
}
function txDetail(id) {
  const t = $('#main')._txs.find(x => x.id === id); if (!t) return;
  openModal(`${mh((t.kind === 'thu' ? 'Phiếu thu ' : 'Phiếu chi ') + esc(t.code), fmtD(t.tx_date))}<div class="modal-b"><dl class="kv">
    <dt>Số tiền</dt><dd class="mono" style="font-weight:700">${vnd(t.amount)}</dd><dt>Khoản mục</dt><dd>${esc((FINCAT[t.kind] || {})[t.category] || t.category)}</dd><dt>Phòng ban</dt><dd>${esc(t.dept_name || '—')}</dd>
    <dt>${t.kind === 'thu' ? 'Người nộp' : 'Người nhận'}</dt><dd>${esc(t.partner || '—')}</dd><dt>Diễn giải</dt><dd>${esc(t.description)}</dd><dt>Hình thức</dt><dd>${t.method === 'tienmat' ? 'Tiền mặt' : 'Chuyển khoản'}</dd>
    ${t.request_code ? `<dt>Căn cứ</dt><dd>${esc(t.request_code)}</dd>` : ''}<dt>Người lập</dt><dd>${esc(t.creator_name)} · ${fmtDT(t.created_at)}</dd>${t.voided ? `<dt>Tình trạng</dt><dd class="late">Đã hủy: ${esc(t.void_note)}</dd>` : ''}</dl>
    ${t.voided ? '' : '<div class="field"><label for="tv-n">Lý do hủy (nếu hủy chứng từ)</label><input id="tv-n"></div>'}<p class="err" id="tv-err" hidden></p></div>
  <div class="modal-f">${t.voided ? '' : '<button class="btn danger" data-act="m-void" style="margin-right:auto">Hủy chứng từ</button>'}<button class="btn" data-act="close">Đóng</button></div>`, {
    'm-void': btn => busy(btn, async () => { try { await POST(`/api/fin/tx/${t.id}/void`, { note: $('#tv-n').value }); closeModal(); render(); toast('Đã hủy chứng từ'); } catch (e) { showErr('#tv-err', e); } })
  });
}
function budgetForm() {
  const s = $('#main')._fin, cats = FINCAT.chi;
  const rows = s.budgets.map(b => ({ dept_id: b.dept_id, category: b.category, amount: b.amount }));
  const rowHtml = (r, i) => `<div class="step-edit" style="grid-template-columns:minmax(0,1fr) minmax(0,1fr) 160px auto"><select class="bg-d" aria-label="Phòng ban">${deptOpts(r.dept_id)}</select><select class="bg-c" aria-label="Khoản mục">${opts(cats, r.category)}</select><input class="bg-a money-in" inputmode="numeric" value="${r.amount ? money(r.amount) : ''}" aria-label="Số tiền"><button class="btn ghost sm" data-act="bg-del" data-i="${i}">×</button></div>`;
  const draw = () => { $('#bg-rows').innerHTML = rows.map(rowHtml).join('') || '<p class="hint">Chưa có dòng ngân sách.</p>'; };
  const collect = () => { $$('#bg-rows .step-edit').forEach((el, i) => { rows[i] = { dept_id: Number($('.bg-d', el).value), category: $('.bg-c', el).value, amount: Number($('.bg-a', el).value.replace(/\D/g, '')) }; }); };
  openModal(`${mh('Ngân sách chi năm ' + s.year)}<div class="modal-b"><p class="hint" style="margin:0">Mỗi dòng: phòng ban · khoản mục · số tiền kế hoạch năm (đồng). Chi phí thực hiện được tính từ phiếu chi có cùng phòng ban và khoản mục.</p><div id="bg-rows" class="stack" style="gap:8px"></div><button class="btn sm" data-act="bg-add" style="align-self:flex-start">+ Thêm dòng</button><p class="err" id="bg-err" hidden></p></div>
  <div class="modal-f"><button class="btn" data-act="close">Hủy</button><button class="btn primary" data-act="m-save">Lưu ngân sách</button></div>`, {
    'bg-add': () => { collect(); rows.push({ dept_id: B().departments[0].id, category: Object.keys(cats)[0], amount: 0 }); draw(); },
    'bg-del': btn => { collect(); rows.splice(Number(btn.dataset.i), 1); draw(); },
    'm-save': btn => busy(btn, async () => { collect(); try { await PUT('/api/fin/budgets', { year: s.year, rows }); closeModal(); render(); toast('Đã lưu ngân sách'); } catch (e) { showErr('#bg-err', e); } })
  });
  draw();
}
ACTIONS['fin-thu'] = () => txForm('thu');
ACTIONS['fin-chi'] = () => txForm('chi');
ACTIONS['fin-budget'] = () => budgetForm();
ACTIONS['fin-pay'] = btn => txForm('chi', $('#main')._fin.pending.find(p => p.id === Number(btn.dataset.id)));
pickHandler('data-tx', id => txDetail(Number(id)));

/* ======================================================== TÀI SẢN */
const ACAT = { maytinh: 'Máy tính, thiết bị CNTT', noithat: 'Nội thất, bàn ghế', phuongtien: 'Phương tiện vận tải', thietbi: 'Máy móc, thiết bị', khac: 'Khác' };
const AST = { dangdung: 'Đang sử dụng', kho: 'Trong kho', suachua: 'Đang sửa chữa', thanhly: 'Đã thanh lý' };
const AST_CLS = { dangdung: 's-done', kho: 's-todo', suachua: 's-pending', thanhly: 's-cancelled' };
const ALOG = { nhap: 'Ghi tăng', capphat: 'Cấp phát', thuhoi: 'Thu hồi', suachua: 'Chuyển sửa chữa', thanhly: 'Thanh lý' };
let asQ = '', asSt = '', asCat = '';
VIEWS['tai-san'] = async main => {
  const d = await GET('/api/assets?' + new URLSearchParams({ q: asQ, status: asSt, category: asCat }));
  const A = d.assets, tot = A.filter(a => a.status !== 'thanhly').reduce((s, a) => s + a.value, 0);
  main.innerHTML = `<div class="page-head"><div><h1>${d.can_manage ? 'Quản lý tài sản' : 'Tài sản tôi đang giữ'}</h1><p>${d.can_manage ? `${A.length} tài sản · nguyên giá đang theo dõi ${money(tot)} đồng` : 'Danh sách tài sản, thiết bị được cấp phát cho bạn'}</p></div>${d.can_manage ? '<div class="actions"><button class="btn primary" data-act="as-new">+ Ghi tăng tài sản</button></div>' : ''}</div>
  ${d.can_manage ? `<div class="stats">${Object.entries(AST).map(([k, l]) => `<div class="card stat"><span class="k">${l}</span><span class="v num">${A.filter(a => a.status === k).length}</span></div>`).join('')}</div>
  <div class="toolbar"><input class="search" id="asq" type="search" placeholder="Tìm mã, tên, số sê-ri…" value="${esc(asQ)}" aria-label="Tìm tài sản"><select class="sel" id="as-c" aria-label="Nhóm"><option value="">Mọi nhóm</option>${opts(ACAT, asCat)}</select><select class="sel" id="as-s" aria-label="Tình trạng"><option value="">Mọi tình trạng</option>${opts(AST, asSt)}</select></div>` : ''}
  <section class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Mã</th><th>Tài sản</th><th>Nhóm</th><th>Người sử dụng</th><th>Vị trí</th><th class="r">Nguyên giá</th><th>Bảo hành đến</th><th>Tình trạng</th></tr></thead><tbody>
  ${A.map(a => `<tr class="click" data-asset="${a.id}"><td class="mono">${esc(a.code)}</td><td><div class="t-title">${esc(a.name)}</div>${a.serial ? `<div class="t-sub mono">${esc(a.serial)}</div>` : ''}</td><td>${ACAT[a.category]}</td><td>${a.holder_id ? who(a.holder_id) : '<span class="faint">—</span>'}</td><td>${esc(a.location)}</td><td class="r num">${money(a.value)}</td><td class="num ${a.warranty_until && a.warranty_until < TODAY() ? 'faint' : ''}">${fmtD(a.warranty_until)}</td><td><span class="pill ${AST_CLS[a.status]}">${AST[a.status]}</span></td></tr>`).join('') || '<tr><td colspan="8" class="empty">Không có tài sản.</td></tr>'}</tbody></table></div></section>`;
  searchBox('asq', asQ, '', v => asQ = v);
  const c = $('#as-c'); if (c) c.addEventListener('change', e => { asCat = e.target.value; render(); });
  const s2 = $('#as-s'); if (s2) s2.addEventListener('change', e => { asSt = e.target.value; render(); });
};
async function assetDetail(id) {
  const a = await GET('/api/assets/' + id), live = a.status !== 'thanhly';
  openModal(`${mh(esc(a.name), esc(a.code) + ' · ' + AST[a.status])}<div class="modal-b"><dl class="kv">
    <dt>Nhóm</dt><dd>${ACAT[a.category]}</dd>${a.serial ? `<dt>Số sê-ri, biển số</dt><dd class="mono">${esc(a.serial)}</dd>` : ''}<dt>Ngày mua</dt><dd>${fmtD(a.purchase_date)}</dd><dt>Nguyên giá</dt><dd class="num">${vnd(a.value)}</dd>
    <dt>Bảo hành đến</dt><dd>${fmtD(a.warranty_until)}</dd><dt>Người sử dụng</dt><dd>${a.holder_id ? who(a.holder_id) : '—'}</dd><dt>Vị trí</dt><dd>${esc(a.location) || '—'}</dd>${a.note ? `<dt>Ghi chú</dt><dd>${esc(a.note)}</dd>` : ''}</dl>
    ${a.can_manage && live ? `<div class="form three" style="background:var(--sunken);padding:12px;border-radius:8px"><div class="field"><label for="ac-u">Cấp phát cho</label><select id="ac-u">${userOpts(a.holder_id)}</select></div><div class="field" style="grid-column:2/-1"><label for="ac-n">Ghi chú, căn cứ (biên bản bàn giao, quyết định…)</label><input id="ac-n"></div>
      <div class="actions" style="grid-column:1/-1"><button class="btn sm primary" data-act="m-cap">Cấp phát</button>${a.holder_id ? '<button class="btn sm" data-act="m-thu">Thu hồi về kho</button>' : ''}<button class="btn sm" data-act="m-sua">Chuyển sửa chữa</button><button class="btn sm danger" data-act="m-tl">Thanh lý</button></div></div>` : ''}
    <h3 class="sec-t">Lịch sử luân chuyển</h3>
    <ul class="feed">${a.logs.map(l => `<li>${av(l.user_id)}<div><b>${ALOG[l.action] || l.action}</b>${l.holder_name ? ` — ${esc(l.holder_name)}` : ''}${l.note ? `<div class="note">${esc(l.note)}</div>` : ''}<time>${esc(l.full_name)} · ${fmtDT(l.created_at)}</time></div></li>`).join('')}</ul><p class="err" id="ac-err" hidden></p></div>
  <div class="modal-f">${a.can_manage && live ? '<button class="btn" data-act="m-edit" style="margin-right:auto">Sửa thông tin</button>' : ''}<button class="btn" data-act="close">Đóng</button></div>`, {
    'm-cap': btn => act(btn, 'capphat'), 'm-thu': btn => act(btn, 'thuhoi'), 'm-sua': btn => act(btn, 'suachua'),
    'm-tl': btn => { if (armed(btn, 'Bấm lần nữa để thanh lý')) act(btn, 'thanhly'); }, 'm-edit': () => assetForm(a)
  });
  function act(btn, x) { return busy(btn, async () => { try { await POST(`/api/assets/${a.id}/${x}`, { holder_id: $('#ac-u').value, note: $('#ac-n').value }); assetDetail(a.id); render(); toast('Đã cập nhật tài sản'); } catch (e) { showErr('#ac-err', e); } }); }
}
function assetForm(a) {
  openModal(`${mh(a ? 'Sửa thông tin tài sản' : 'Ghi tăng tài sản')}<div class="modal-b"><div class="form">
    <div class="field full"><label for="af-n">Tên tài sản</label><input id="af-n" value="${esc(a ? a.name : '')}"></div>
    ${a ? '' : '<div class="field"><label for="af-c2">Mã tài sản</label><input id="af-c2" placeholder="Để trống để tự sinh"></div>'}
    <div class="field"><label for="af-c">Nhóm</label><select id="af-c">${opts(ACAT, a ? a.category : 'maytinh')}</select></div>
    <div class="field"><label for="af-s">Số sê-ri, biển số</label><input id="af-s" value="${esc(a ? a.serial : '')}"></div>
    <div class="field"><label for="af-v">Nguyên giá (đồng)</label>${moneyIn('af-v', a && a.value)}</div>
    <div class="field"><label for="af-p">Ngày mua</label><input type="date" id="af-p" value="${a && a.purchase_date ? a.purchase_date : TODAY()}"></div>
    <div class="field"><label for="af-w">Bảo hành đến</label><input type="date" id="af-w" value="${a && a.warranty_until ? a.warranty_until : ''}"></div>
    <div class="field"><label for="af-l">Vị trí</label><input id="af-l" value="${esc(a ? a.location : '')}"></div>
    <div class="field full"><label for="af-no">Ghi chú</label><input id="af-no" value="${esc(a ? a.note : '')}"></div></div><p class="err" id="af-err" hidden></p></div>
  <div class="modal-f"><button class="btn" data-act="close">Hủy</button><button class="btn primary" data-act="m-save">Lưu</button></div>`, {
    'm-save': btn => busy(btn, async () => { const b = { name: $('#af-n').value, category: $('#af-c').value, serial: $('#af-s').value, value: readMoney('af-v'), purchase_date: $('#af-p').value, warranty_until: $('#af-w').value, location: $('#af-l').value, note: $('#af-no').value, dept_id: a ? a.dept_id : null };
      try { if (a) { await PUT('/api/assets/' + a.id, b); assetDetail(a.id); } else { b.code = $('#af-c2').value; await POST('/api/assets', b); closeModal(); } render(); toast('Đã lưu tài sản'); } catch (e) { showErr('#af-err', e); } })
  });
}
ACTIONS['as-new'] = () => assetForm(null);
pickHandler('data-asset', id => assetDetail(id).catch(e => toast(e.message, true)));
})();
