/* SmartOffice — Đợt 4: Tuyển dụng, Nhắn tin, Khách đến, Khen thưởng – Kỷ luật, Đào tạo, Đánh giá năng lực */
(function () {
'use strict';
const S = window.SO;
const { $, $$, esc, TODAY, addDays, fmtD, fmtDT, vnd, numFmt, WD, GET, POST, PUT, DEL, U, Dp, av, who, userOpts, deptOpts, openModal, closeModal, toast, showErr, mh, busy, armed, VIEWS, ACTIONS, render } = S;
const B = () => S.B;
const money = n => (Number(n) || 0).toLocaleString('vi-VN');
const opts = (obj, sel) => Object.entries(obj).map(([k, v]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${esc(v)}</option>`).join('');
const pick = (attr, fn) => document.addEventListener('click', e => { if (e.target.closest('#modal') || e.target.closest('[data-act]')) return; const el = e.target.closest('[' + attr + ']'); if (el) fn(el.getAttribute(attr), el); });
const stars = n => '★★★★★'.slice(0, n) + '<span class="faint">' + '★★★★★'.slice(0, 5 - n) + '</span>';
const dtLocal = s => s ? s.replace(' ', 'T') : '';
const fromLocal = s => s ? s.replace('T', ' ').slice(0, 16) : '';

/* ======================================================== TUYỂN DỤNG */
const CSTAGE = { moi: 'Hồ sơ mới', sangloc: 'Sàng lọc', phongvan: 'Phỏng vấn', denghi: 'Đề nghị tuyển', nhanviec: 'Nhận việc', loai: 'Không đạt' };
let tdJob = null;
VIEWS['tuyen-dung'] = async main => {
  const jobs = await GET('/api/recruit/jobs'), lead = B().me.is_lead;
  if (!tdJob || !jobs.some(j => j.id === tdJob)) tdJob = (jobs.find(j => j.status === 'open') || jobs[0] || {}).id || null;
  const job = tdJob ? await GET('/api/recruit/jobs/' + tdJob) : null;
  main.innerHTML = `<div class="page-head"><div><h1>Tuyển dụng</h1><p>${jobs.filter(j => j.status === 'open').length} vị trí đang tuyển · ${jobs.reduce((s, j) => s + j.n_cand, 0)} hồ sơ ứng viên</p></div><div class="actions">${lead ? '<button class="btn" data-act="job-new">+ Vị trí tuyển dụng</button>' : ''}${job ? '<button class="btn primary" data-act="cand-new">+ Ứng viên</button>' : ''}</div></div>
  <div class="split"><nav class="card side-list">${jobs.map(j => `<button data-job="${j.id}" aria-pressed="${j.id === tdJob}"><b>${esc(j.title)}</b><small>${esc(j.dept_name)} · cần ${j.quantity} · ${j.n_cand} hồ sơ${j.status === 'closed' ? ' · đã đóng' : j.deadline ? ' · hạn ' + fmtD(j.deadline) : ''}</small></button>`).join('') || '<p class="empty">Chưa có vị trí tuyển dụng.</p>'}</nav>
  <div style="min-width:0">${job ? `<section class="card" style="margin-bottom:12px"><div class="card-h"><div><h2>${esc(job.title)} <span class="mono muted" style="font-weight:400">${esc(job.code)}</span></h2><span class="muted" style="font-size:12.5px">${esc(job.dept_name)} · số lượng ${job.quantity} · ${esc(job.salary_range)} · hạn nhận hồ sơ ${fmtD(job.deadline)}</span></div>${lead ? '<button class="btn sm" data-act="job-edit">Sửa</button>' : ''}</div>
    <div class="card-b two-col"><div><h3 class="sec-t">Mô tả công việc</h3><p class="pre">${esc(job.description) || '—'}</p></div><div><h3 class="sec-t">Yêu cầu</h3><p class="pre">${esc(job.requirements) || '—'}</p></div></div></section>
    <div class="board cand-board">${Object.keys(CSTAGE).map(s => { const col = job.candidates.filter(c => c.stage === s); return `<div class="col" data-cstage="${s}"><div class="col-h"><span>${CSTAGE[s]}</span><span class="muted num">${col.length}</span></div>
      ${col.map(c => `<div class="kcard" draggable="true" data-cand="${c.id}"><div class="t-title">${esc(c.full_name)}</div><div class="t-sub">${esc(c.source)}${c.phone ? ' · ' + esc(c.phone) : ''}</div>${c.interview_at && s === 'phongvan' ? `<div class="t-sub ${c.interview_at < TODAY() ? 'late' : ''}">PV ${fmtDT(c.interview_at)}${c.interviewer_name ? ' · ' + esc(c.interviewer_name) : ''}</div>` : ''}${c.rating ? `<div class="stars">${stars(c.rating)}</div>` : ''}</div>`).join('')}</div>`; }).join('')}</div>` : '<section class="card"><div class="empty">Chọn hoặc tạo vị trí tuyển dụng.</div></section>'}</div></div>`;
  main._job = job;
  if (job) wireCand(job);
};
function wireCand(job) {
  let drag = null;
  $$('.cand-board .kcard').forEach(c => { c.addEventListener('dragstart', () => { drag = c.dataset.cand; c.classList.add('dragging'); }); c.addEventListener('dragend', () => c.classList.remove('dragging')); });
  $$('.cand-board .col').forEach(col => {
    col.addEventListener('dragover', e => { e.preventDefault(); col.classList.add('over'); });
    col.addEventListener('dragleave', () => col.classList.remove('over'));
    col.addEventListener('drop', async e => { e.preventDefault(); col.classList.remove('over'); if (!drag) return; try { await PUT('/api/recruit/candidates/' + drag, { stage: col.dataset.cstage }); toast('Đã chuyển sang “' + CSTAGE[col.dataset.cstage] + '”'); render(); } catch (er) { toast(er.message, true); } });
  });
}
function jobForm(j) {
  openModal(`${mh(j ? 'Sửa vị trí tuyển dụng' : 'Mở vị trí tuyển dụng')}<div class="modal-b"><div class="form">
    <div class="field full"><label for="jb-t">Vị trí</label><input id="jb-t" value="${esc(j ? j.title : '')}"></div>
    <div class="field"><label for="jb-d">Phòng ban</label><select id="jb-d">${deptOpts(j ? j.dept_id : null)}</select></div>
    <div class="field"><label for="jb-q">Số lượng cần tuyển</label><input id="jb-q" type="number" min="1" value="${j ? j.quantity : 1}"></div>
    <div class="field"><label for="jb-dl">Hạn nhận hồ sơ</label><input id="jb-dl" type="date" value="${j && j.deadline ? j.deadline : addDays(TODAY(), 30)}"></div>
    <div class="field"><label for="jb-s">Mức lương</label><input id="jb-s" value="${esc(j ? j.salary_range : '')}" placeholder="Ví dụ: 10 – 15 triệu đồng"></div>
    <div class="field full"><label for="jb-ds">Mô tả công việc</label><textarea id="jb-ds">${esc(j ? j.description : '')}</textarea></div>
    <div class="field full"><label for="jb-r">Yêu cầu ứng viên</label><textarea id="jb-r">${esc(j ? j.requirements : '')}</textarea></div>
    ${j ? `<div class="field"><label for="jb-st">Tình trạng</label><select id="jb-st"><option value="open">Đang tuyển</option><option value="closed" ${j.status === 'closed' ? 'selected' : ''}>Đã đóng</option></select></div>` : ''}</div><p class="err" id="jb-err" hidden></p></div>
  <div class="modal-f"><button class="btn" data-act="close">Hủy</button><button class="btn primary" data-act="m-save">Lưu</button></div>`, {
    'm-save': btn => busy(btn, async () => { const b = { title: $('#jb-t').value, dept_id: $('#jb-d').value, quantity: $('#jb-q').value, deadline: $('#jb-dl').value, salary_range: $('#jb-s').value, description: $('#jb-ds').value, requirements: $('#jb-r').value, status: j ? $('#jb-st').value : 'open' };
      try { if (j) await PUT('/api/recruit/jobs/' + j.id, b); else { const r = await POST('/api/recruit/jobs', b); tdJob = r.id; } closeModal(); render(); toast('Đã lưu vị trí tuyển dụng'); } catch (e) { showErr('#jb-err', e); } })
  });
}
function candForm() {
  openModal(`${mh('Thêm ứng viên', esc($('#main')._job.title))}<div class="modal-b"><div class="form">
    <div class="field full"><label for="cn-n">Họ và tên</label><input id="cn-n"></div>
    <div class="field"><label for="cn-p">Điện thoại</label><input id="cn-p"></div><div class="field"><label for="cn-e">Email</label><input id="cn-e"></div>
    <div class="field"><label for="cn-s">Nguồn hồ sơ</label><input id="cn-s" placeholder="Trang tuyển dụng, giới thiệu, trường đại học…"></div>
    <div class="field"><label for="cn-cv">Đường dẫn hồ sơ (CV)</label><input id="cn-cv" placeholder="https://…"></div>
    <div class="field full"><label for="cn-no">Ghi chú</label><textarea id="cn-no"></textarea></div></div><p class="err" id="cn-err" hidden></p></div>
  <div class="modal-f"><button class="btn" data-act="close">Hủy</button><button class="btn primary" data-act="m-save">Thêm ứng viên</button></div>`, {
    'm-save': btn => busy(btn, async () => { try { await POST('/api/recruit/candidates', { job_id: tdJob, full_name: $('#cn-n').value, phone: $('#cn-p').value, email: $('#cn-e').value, source: $('#cn-s').value, cv_link: $('#cn-cv').value, note: $('#cn-no').value }); closeModal(); render(); toast('Đã thêm ứng viên'); } catch (e) { showErr('#cn-err', e); } })
  });
}
async function candDetail(id) {
  const c = await GET('/api/recruit/candidates/' + id);
  openModal(`${mh(esc(c.full_name), CSTAGE[c.stage])}<div class="modal-b"><div class="form">
    <div class="field"><label for="cd-n">Họ và tên</label><input id="cd-n" value="${esc(c.full_name)}"></div>
    <div class="field"><label for="cd-st">Bước tuyển dụng</label><select id="cd-st">${opts(CSTAGE, c.stage)}</select></div>
    <div class="field"><label for="cd-p">Điện thoại</label><input id="cd-p" value="${esc(c.phone)}"></div><div class="field"><label for="cd-e">Email</label><input id="cd-e" value="${esc(c.email)}"></div>
    <div class="field"><label for="cd-iv">Lịch phỏng vấn</label><input type="datetime-local" id="cd-iv" value="${dtLocal(c.interview_at)}"></div>
    <div class="field"><label for="cd-ib">Người phỏng vấn</label><select id="cd-ib"><option value="">—</option>${userOpts(c.interviewer_id)}</select></div>
    <div class="field full"><label for="cd-cv">Đường dẫn hồ sơ (CV)</label><input id="cd-cv" value="${esc(c.cv_link)}">${/^https?:\/\//.test(c.cv_link) ? `<a href="${esc(c.cv_link)}" target="_blank" rel="noopener">Mở hồ sơ</a>` : ''}</div>
    <div class="field full"><label for="cd-no">Ghi chú</label><textarea id="cd-no">${esc(c.note)}</textarea></div></div>
    <h3 class="sec-t">Nhận xét, đánh giá ${c.rating ? `· trung bình <span class="stars">${stars(c.rating)}</span>` : ''}</h3>
    <div class="inline-add"><select id="cd-sc" class="sel" aria-label="Điểm"><option value="">Chấm điểm</option>${[5, 4, 3, 2, 1].map(n => `<option value="${n}">${n} sao</option>`).join('')}</select><input id="cd-cm" placeholder="Nhận xét sau phỏng vấn…"><button class="btn sm" data-act="m-note">Ghi nhận</button></div>
    <ul class="feed">${c.notes.map(n => `<li>${av(n.user_id)}<div><b>${esc(n.full_name)}</b>${n.score ? ` · <span class="stars">${stars(n.score)}</span>` : ''}<p style="margin:2px 0 0">${esc(n.content)}</p><time>${fmtDT(n.created_at)}</time></div></li>`).join('')}</ul><p class="err" id="cd-err" hidden></p></div>
  <div class="modal-f">${B().me.is_lead ? '<button class="btn danger" data-act="m-del" style="margin-right:auto">Xóa hồ sơ</button>' : ''}<button class="btn" data-act="close">Đóng</button><button class="btn primary" data-act="m-save">Lưu</button></div>`, {
    'm-save': btn => busy(btn, async () => { try { await PUT('/api/recruit/candidates/' + c.id, { full_name: $('#cd-n').value, stage: $('#cd-st').value, phone: $('#cd-p').value, email: $('#cd-e').value, interview_at: fromLocal($('#cd-iv').value), interviewer_id: $('#cd-ib').value, cv_link: $('#cd-cv').value, note: $('#cd-no').value }); closeModal(); render(); toast('Đã lưu hồ sơ ứng viên'); } catch (e) { showErr('#cd-err', e); } }),
    'm-note': btn => busy(btn, async () => { try { await POST(`/api/recruit/candidates/${c.id}/notes`, { score: $('#cd-sc').value, content: $('#cd-cm').value }); candDetail(c.id); render(); } catch (e) { showErr('#cd-err', e); } }),
    'm-del': async btn => { if (!armed(btn, 'Bấm lần nữa để xóa')) return; await DEL('/api/recruit/candidates/' + c.id); closeModal(); render(); }
  });
}
ACTIONS['job-new'] = () => jobForm(null);
ACTIONS['job-edit'] = () => jobForm($('#main')._job);
ACTIONS['cand-new'] = () => candForm();
pick('data-job', v => { tdJob = Number(v); render(); });
pick('data-cand', v => candDetail(v).catch(e => toast(e.message, true)));

/* ======================================================== NHẮN TIN NỘI BỘ */
let chatId = null, chatLast = 0, chatTimer = null, chatConvs = [];
const convName = c => c.kind === 'group' ? c.name : (String(c.member_ids || '').split(',').map(Number).filter(x => x !== B().me.id).map(x => U(x).full_name)[0] || 'Trò chuyện');
const convAv = c => c.kind === 'group' ? `<span class="av grp">${esc(c.name.slice(0, 1).toUpperCase())}</span>` : av(String(c.member_ids || '').split(',').map(Number).find(x => x !== B().me.id));
function stopChat() { if (chatTimer) { clearInterval(chatTimer); chatTimer = null; } }
window.addEventListener('hashchange', () => { if (location.hash !== '#nhan-tin') stopChat(); });
VIEWS['nhan-tin'] = async main => {
  stopChat();
  chatConvs = await GET('/api/chat/conversations');
  if (chatId && !chatConvs.some(c => c.id === chatId)) chatId = null;
  if (!chatId && chatConvs.length && window.innerWidth > 820) chatId = chatConvs[0].id;
  main.innerHTML = `<div class="page-head"><div><h1>Nhắn tin nội bộ</h1><p>Trao đổi nhanh giữa cá nhân và nhóm làm việc</p></div><div class="actions"><button class="btn primary" data-act="chat-new">+ Cuộc trò chuyện</button></div></div>
  <div class="chat ${chatId ? 'has-conv' : ''}"><aside class="card conv-list">${chatConvs.map(c => `<button data-conv="${c.id}" aria-pressed="${c.id === chatId}">${convAv(c)}<div><b>${esc(convName(c))}</b><small>${c.last_body ? esc((c.last_user === B().me.id ? 'Bạn: ' : '') + c.last_body.slice(0, 60)) : 'Chưa có tin nhắn'}</small></div>${c.unread ? `<span class="count">${c.unread}</span>` : ''}</button>`).join('') || '<p class="empty">Chưa có cuộc trò chuyện.</p>'}</aside>
  <section class="card conv-pane">${chatId ? `<header><button class="btn ghost sm back" data-act="chat-back" aria-label="Quay lại">←</button><b>${esc(convName(chatConvs.find(c => c.id === chatId)))}</b><small class="muted">${String(chatConvs.find(c => c.id === chatId).member_ids).split(',').length} thành viên</small><span class="spacer"></span><button class="btn ghost sm" data-act="chat-leave">Rời cuộc trò chuyện</button></header>
    <div class="msgs" id="msgs"></div><form class="composer" id="composer"><textarea id="msg-in" rows="1" placeholder="Nhập tin nhắn… (Enter để gửi, Shift + Enter để xuống dòng)" aria-label="Tin nhắn"></textarea><button class="btn primary">Gửi</button></form>` : '<div class="empty" style="margin:auto">Chọn một cuộc trò chuyện ở bên trái.</div>'}</section></div>`;
  if (!chatId) return;
  chatLast = 0; $('#msgs').innerHTML = '';
  await loadMsgs(true);
  chatTimer = setInterval(() => { if (location.hash === '#nhan-tin' && document.visibilityState === 'visible') loadMsgs(false); }, 4000);
  const inp = $('#msg-in');
  inp.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#composer').requestSubmit(); } });
  $('#composer').addEventListener('submit', async e => { e.preventDefault(); const v = inp.value.trim(); if (!v) return; inp.value = ''; try { await POST(`/api/chat/conversations/${chatId}/messages`, { body: v }); loadMsgs(false); } catch (er) { toast(er.message, true); inp.value = v; } });
  inp.focus();
  S.refreshBoot();
};
async function loadMsgs(first) {
  const box = $('#msgs'); if (!box || !chatId) return;
  const cid = chatId;
  try {
    const rows = await GET(`/api/chat/conversations/${cid}/messages${first ? '' : '?after=' + chatLast}`);
    if (cid !== chatId || !rows.length) return;
    const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
    let prevDay = box.dataset.day || '', prevUser = Number(box.dataset.user || 0);
    box.insertAdjacentHTML('beforeend', rows.map(m => { const day = m.created_at.slice(0, 10), mine = m.user_id === B().me.id; let h = '';
      if (day !== prevDay) { h += `<div class="day-sep"><span>${day === TODAY() ? 'Hôm nay' : fmtD(day)}</span></div>`; prevDay = day; prevUser = 0; }
      h += `<div class="msg ${mine ? 'mine' : ''} ${prevUser === m.user_id ? 'cont' : ''}">${mine || prevUser === m.user_id ? '' : av(m.user_id)}<div class="bubble">${!mine && prevUser !== m.user_id ? `<b>${esc(U(m.user_id).full_name)}</b>` : ''}<p>${esc(m.body)}</p><time>${m.created_at.slice(11, 16)}</time></div></div>`;
      prevUser = m.user_id; return h; }).join(''));
    box.dataset.day = prevDay; box.dataset.user = prevUser;
    chatLast = rows[rows.length - 1].id;
    if (first || atBottom) box.scrollTop = box.scrollHeight;
    if (!first) S.refreshBoot();
  } catch (e) {}
}
ACTIONS['chat-new'] = () => {
  openModal(`${mh('Cuộc trò chuyện mới')}<div class="modal-b"><p class="hint" style="margin:0">Chọn một người để nhắn tin riêng, hoặc nhiều người và đặt tên để tạo nhóm.</p>
    <div class="field"><label for="cv-n">Tên nhóm (bỏ trống nếu nhắn riêng)</label><input id="cv-n" placeholder="Ví dụ: Ban dự án Ninh Bình"></div>
    <div class="member-pick">${B().departments.map(d => { const us = B().users.filter(u => u.active && u.dept_id === d.id && u.id !== B().me.id); if (!us.length) return ''; return `<fieldset><legend>${esc(d.name)}</legend>${us.map(u => `<label class="check"><input type="checkbox" class="cv-u" value="${u.id}"> ${esc(u.full_name)}</label>`).join('')}</fieldset>`; }).join('')}</div><p class="err" id="cv-err" hidden></p></div>
  <div class="modal-f"><button class="btn" data-act="close">Hủy</button><button class="btn primary" data-act="m-save">Bắt đầu</button></div>`, {
    'm-save': btn => busy(btn, async () => { try { const r = await POST('/api/chat/conversations', { name: $('#cv-n').value, members: $$('.cv-u:checked').map(x => Number(x.value)) }); chatId = r.id; closeModal(); location.hash !== '#nhan-tin' ? (location.hash = 'nhan-tin') : render(); } catch (e) { showErr('#cv-err', e); } })
  });
};
ACTIONS['chat-back'] = () => { chatId = null; stopChat(); render(); };
ACTIONS['chat-leave'] = async btn => { if (!armed(btn, 'Bấm lần nữa để rời')) return; await POST(`/api/chat/conversations/${chatId}/leave`); chatId = null; render(); };
pick('data-conv', v => { chatId = Number(v); render(); });

/* ======================================================== KHÁCH ĐẾN */
let vsDate = TODAY();
const VST = { registered: 'Đã đăng ký', in: 'Đang ở cơ quan', out: 'Đã ra về', cancelled: 'Đã hủy' };
const VST_CLS = { registered: 's-pending', in: 's-doing', out: 's-done', cancelled: 's-cancelled' };
VIEWS['khach-den'] = async main => {
  const d = await GET('/api/visitors?' + new URLSearchParams({ from: vsDate, to: vsDate }));
  main.innerHTML = `<div class="page-head"><div><h1>Đăng ký khách đến</h1><p>${d.can_reception ? 'Bộ phận lễ tân xác nhận khách vào, ra' : 'Khách do bạn đăng ký đón tiếp'} · ${WD[new Date(vsDate + 'T00:00:00').getDay()]}, ${fmtD(vsDate)}</p></div><div class="actions"><button class="btn primary" data-act="vs-new">+ Đăng ký khách</button></div></div>
  <div class="toolbar"><div class="seg"><button data-act="vs-prev">← Ngày trước</button><button data-act="vs-today">Hôm nay</button><button data-act="vs-next">Ngày sau →</button></div><input type="date" class="sel" id="vs-d" value="${vsDate}" aria-label="Ngày"></div>
  ${d.can_reception ? `<div class="stats">${Object.entries(VST).map(([k, l]) => `<div class="card stat"><span class="k">${l}</span><span class="v num">${d.visitors.filter(v => v.status === k).length}</span></div>`).join('')}</div>` : ''}
  <section class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Giờ hẹn</th><th>Khách</th><th>Mục đích</th><th>Người tiếp</th><th>Vào / ra</th><th>Tình trạng</th><th></th></tr></thead><tbody>
  ${d.visitors.map(v => `<tr><td class="num"><b>${v.visit_at.slice(11)}</b></td><td><div class="t-title">${esc(v.full_name)}${v.guests > 1 ? ` <span class="muted">(+${v.guests - 1})</span>` : ''}</div><div class="t-sub">${esc(v.organization)}${v.phone ? ' · ' + esc(v.phone) : ''}</div></td><td>${esc(v.purpose)}</td><td>${who(v.host_id)}</td>
    <td class="num muted">${v.checkin_at ? v.checkin_at.slice(11, 16) : '—'} / ${v.checkout_at ? v.checkout_at.slice(11, 16) : '—'}${v.badge_no ? `<div class="t-sub">Thẻ ${esc(v.badge_no)}</div>` : ''}</td><td><span class="pill ${VST_CLS[v.status]}">${VST[v.status]}</span></td>
    <td class="r">${d.can_reception && v.status === 'registered' ? `<button class="btn sm primary" data-act="vs-in" data-id="${v.id}">Khách vào</button>` : ''}${d.can_reception && v.status === 'in' ? `<button class="btn sm" data-act="vs-out" data-id="${v.id}">Khách ra</button>` : ''}${v.status === 'registered' ? ` <button class="btn sm ghost" data-act="vs-cancel" data-id="${v.id}">Hủy</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">Không có khách đăng ký trong ngày.</td></tr>'}</tbody></table></div></section>`;
  $('#vs-d').addEventListener('change', e => { if (e.target.value) { vsDate = e.target.value; render(); } });
};
ACTIONS['vs-prev'] = () => { vsDate = addDays(vsDate, -1); render(); };
ACTIONS['vs-next'] = () => { vsDate = addDays(vsDate, 1); render(); };
ACTIONS['vs-today'] = () => { vsDate = TODAY(); render(); };
ACTIONS['vs-new'] = () => openModal(`${mh('Đăng ký khách đến')}<div class="modal-b"><div class="form">
  <div class="field"><label for="vf-n">Họ tên khách</label><input id="vf-n"></div><div class="field"><label for="vf-o">Cơ quan, đơn vị</label><input id="vf-o"></div>
  <div class="field"><label for="vf-p">Điện thoại</label><input id="vf-p"></div><div class="field"><label for="vf-g">Số người trong đoàn</label><input id="vf-g" type="number" min="1" value="1"></div>
  <div class="field"><label for="vf-t">Thời gian đến</label><input type="datetime-local" id="vf-t" value="${vsDate}T09:00"></div><div class="field"><label for="vf-h">Người tiếp</label><select id="vf-h">${userOpts(B().me.id)}</select></div>
  <div class="field full"><label for="vf-pu">Mục đích làm việc</label><input id="vf-pu"></div><div class="field full"><label for="vf-no">Ghi chú cho lễ tân</label><input id="vf-no" placeholder="Ví dụ: Bố trí nước uống, hướng dẫn lên phòng họp tầng 3"></div></div><p class="err" id="vf-err" hidden></p></div>
  <div class="modal-f"><button class="btn" data-act="close">Hủy</button><button class="btn primary" data-act="m-save">Đăng ký</button></div>`, {
  'm-save': btn => busy(btn, async () => { try { await POST('/api/visitors', { full_name: $('#vf-n').value, organization: $('#vf-o').value, phone: $('#vf-p').value, guests: $('#vf-g').value, visit_at: fromLocal($('#vf-t').value), host_id: $('#vf-h').value, purpose: $('#vf-pu').value, note: $('#vf-no').value }); vsDate = $('#vf-t').value.slice(0, 10); closeModal(); render(); toast('Đã đăng ký, lễ tân sẽ đón khách'); } catch (e) { showErr('#vf-err', e); } })
});
ACTIONS['vs-in'] = btn => openModal(`${mh('Xác nhận khách vào')}<div class="modal-b"><div class="field"><label for="vb-n">Số thẻ khách cấp (nếu có)</label><input id="vb-n"></div></div><div class="modal-f"><button class="btn" data-act="close">Hủy</button><button class="btn primary" data-act="m-save">Xác nhận</button></div>`, {
  'm-save': async () => { await POST(`/api/visitors/${btn.dataset.id}/checkin`, { badge_no: $('#vb-n').value }); closeModal(); render(); toast('Đã ghi nhận khách vào'); }
});
ACTIONS['vs-out'] = async btn => { await POST(`/api/visitors/${btn.dataset.id}/checkout`); render(); toast('Đã ghi nhận khách ra'); };
ACTIONS['vs-cancel'] = async btn => { if (!armed(btn, 'Hủy?')) return; await POST(`/api/visitors/${btn.dataset.id}/cancel`); render(); };

/* ======================================================== KHEN THƯỞNG – KỶ LUẬT */
const CK = { khenthuong: 'Khen thưởng', kyluat: 'Kỷ luật', suvu: 'Sự vụ' };
const CS = { new: 'Mới đề nghị', processing: 'Đang xử lý', decided: 'Đã quyết định', cancelled: 'Không xử lý' };
const CS_CLS = { new: 's-pending', processing: 's-doing', decided: 's-done', cancelled: 's-cancelled' };
let ckTab = '', CFORMS = null;
VIEWS['khen-thuong'] = async main => {
  const d = await GET('/api/cases?kind=' + ckTab); CFORMS = d.forms;
  main.innerHTML = `<div class="page-head"><div><h1>Khen thưởng – Kỷ luật</h1><p>Ghi nhận thành tích, sự vụ, vi phạm và quyết định xử lý</p></div>${d.can_report ? '<div class="actions"><button class="btn primary" data-act="case-new">+ Lập hồ sơ</button></div>' : ''}</div>
  <div class="toolbar"><div class="seg">${[['', 'Tất cả'], ...Object.entries(CK)].map(([k, l]) => `<button data-cktab="${k}" aria-pressed="${ckTab === k}">${l}</button>`).join('')}</div></div>
  <section class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Số hồ sơ</th><th>Loại</th><th>Nội dung</th><th>Nhân sự</th><th>Hình thức</th><th>Quyết định</th><th>Tình trạng</th></tr></thead><tbody>
  ${d.cases.map(c => `<tr class="click" data-case="${c.id}"><td class="mono">${esc(c.code)}</td><td><span class="tag">${CK[c.kind]}</span></td><td><div class="t-title">${esc(c.title)}</div><div class="t-sub">${fmtD(c.occurred_on)}</div></td><td>${who(c.user_id)}<div class="t-sub">${esc(c.dept_name)}</div></td><td>${esc(c.form) || '—'}${c.amount ? `<div class="t-sub num">${vnd(c.amount)}</div>` : ''}</td><td class="mono">${esc(c.decision_no) || '—'}</td><td><span class="pill ${CS_CLS[c.status]}">${CS[c.status]}</span></td></tr>`).join('') || '<tr><td colspan="7" class="empty">Chưa có hồ sơ.</td></tr>'}</tbody></table></div></section>
  <p class="notice info" style="margin-top:12px">Hình thức xử lý kỷ luật lao động gồm: khiển trách; kéo dài thời hạn nâng lương không quá 06 tháng; cách chức; sa thải (Điều 124 Bộ luật Lao động 2019). Việc xử lý kỷ luật phải tuân thủ trình tự, thủ tục theo Điều 122 Bộ luật Lao động và nội quy lao động của đơn vị.</p>`;
  main._cases = d.cases; main._canManage = d.can_manage;
};
ACTIONS['case-new'] = () => {
  const head = B().departments.filter(d => d.head_id === B().me.id).map(d => d.id);
  openModal(`${mh('Lập hồ sơ khen thưởng, kỷ luật, sự vụ')}<div class="modal-b"><div class="form">
    <div class="field"><label for="cs-k">Loại hồ sơ</label><select id="cs-k">${opts(CK, 'khenthuong')}</select></div>
    <div class="field"><label for="cs-u">Nhân sự liên quan</label><select id="cs-u">${userOpts(null, u => B().me.is_lead || head.includes(u.dept_id))}</select></div>
    <div class="field full"><label for="cs-t">Nội dung</label><input id="cs-t" placeholder="Ví dụ: Hoàn thành xuất sắc nhiệm vụ quý IV"></div>
    <div class="field"><label for="cs-d">Ngày xảy ra</label><input type="date" id="cs-d" value="${TODAY()}"></div>
    <div class="field"><label for="cs-f">Hình thức đề nghị</label><input id="cs-f" list="cs-fl"><datalist id="cs-fl"></datalist></div>
    <div class="field"><label for="cs-a">Số tiền thưởng/bồi thường (nếu có)</label><input id="cs-a" inputmode="numeric" class="money-in"></div>
    <div class="field full"><label for="cs-ds">Diễn biến, căn cứ, minh chứng</label><textarea id="cs-ds"></textarea></div></div><p class="err" id="cs-err" hidden></p></div>
  <div class="modal-f"><button class="btn" data-act="close">Hủy</button><button class="btn primary" data-act="m-save">Lập hồ sơ</button></div>`, {
    'm-save': btn => busy(btn, async () => { try { await POST('/api/cases', { kind: $('#cs-k').value, user_id: $('#cs-u').value, title: $('#cs-t').value, occurred_on: $('#cs-d').value, form: $('#cs-f').value, amount: $('#cs-a').value, description: $('#cs-ds').value }); closeModal(); render(); toast('Đã lập hồ sơ'); } catch (e) { showErr('#cs-err', e); } })
  });
  const fl = () => { const k = $('#cs-k').value; $('#cs-fl').innerHTML = ((CFORMS || {})[k] || []).map(f => `<option value="${esc(f)}">`).join(''); };
  $('#cs-k').addEventListener('change', fl); fl();
};
function caseDetail(id) {
  const c = $('#main')._cases.find(x => x.id === Number(id)), mg = $('#main')._canManage;
  const forms = (CFORMS || {})[c.kind] || [];
  openModal(`${mh(esc(c.title), esc(c.code) + ' · ' + CK[c.kind])}<div class="modal-b"><dl class="kv"><dt>Nhân sự</dt><dd>${who(c.user_id)} · ${esc(c.dept_name)}</dd><dt>Ngày xảy ra</dt><dd>${fmtD(c.occurred_on)}</dd><dt>Diễn biến, căn cứ</dt><dd>${esc(c.description) || '—'}</dd><dt>Người lập</dt><dd>${esc(U(c.created_by).full_name)} · ${fmtDT(c.created_at)}</dd>
    ${c.status === 'decided' ? `<dt>Quyết định</dt><dd><b class="mono">${esc(c.decision_no)}</b> · ${esc(c.form)}${c.amount ? ' · ' + vnd(c.amount) : ''}</dd>${c.result_note ? `<dt>Ghi chú</dt><dd>${esc(c.result_note)}</dd>` : ''}` : ''}</dl>
    ${mg && !['decided', 'cancelled'].includes(c.status) ? `<h3 class="sec-t">Xử lý hồ sơ</h3><div class="form">
      <div class="field"><label for="dc-s">Kết quả</label><select id="dc-s"><option value="decided">Ra quyết định</option><option value="processing">Đang xác minh, xử lý</option><option value="cancelled">Không xử lý</option></select></div>
      <div class="field"><label for="dc-f">Hình thức</label>${c.kind === 'kyluat' ? `<select id="dc-f">${forms.map(f => `<option ${f === c.form ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select>` : `<input id="dc-f" list="dc-fl" value="${esc(c.form)}"><datalist id="dc-fl">${forms.map(f => `<option value="${esc(f)}">`).join('')}</datalist>`}</div>
      <div class="field"><label for="dc-n">Số quyết định</label><input id="dc-n" placeholder="Ví dụ: 20/2026/QĐ-SO"></div>
      <div class="field"><label for="dc-a">Số tiền (nếu có)</label><input id="dc-a" class="money-in" inputmode="numeric" value="${c.amount ? money(c.amount) : ''}"></div>
      <div class="field full"><label for="dc-r">Ghi chú kết quả</label><textarea id="dc-r"></textarea></div></div>` : ''}<p class="err" id="dc-err" hidden></p></div>
  <div class="modal-f"><button class="btn" data-act="close">Đóng</button>${mg && !['decided', 'cancelled'].includes(c.status) ? '<button class="btn primary" data-act="m-save">Cập nhật</button>' : ''}</div>`, {
    'm-save': btn => busy(btn, async () => { try { await POST(`/api/cases/${c.id}/decide`, { status: $('#dc-s').value, form: $('#dc-f').value, decision_no: $('#dc-n').value, amount: $('#dc-a').value.replace(/\D/g, ''), result_note: $('#dc-r').value }); closeModal(); render(); toast('Đã cập nhật hồ sơ'); } catch (e) { showErr('#dc-err', e); } })
  });
}
pick('data-cktab', v => { ckTab = v; render(); });
pick('data-case', v => caseDetail(v));

/* ======================================================== ĐÀO TẠO */
const MST = { registered: 'Tự đăng ký', assigned: 'Được cử', completed: 'Hoàn thành', absent: 'Vắng' };
VIEWS['dao-tao'] = async main => {
  const d = await GET('/api/courses'), T = TODAY();
  const card = c => `<article class="card course" data-course="${c.id}"><div class="post-top"><span class="tag">${c.kind === 'benngoai' ? 'Bên ngoài' : 'Nội bộ'}</span>${c.my_status ? `<span class="pill ${c.my_status === 'completed' ? 's-done' : 's-active'}">${MST[c.my_status]}</span>` : ''}${c.status === 'closed' ? '<span class="pill s-cancelled">Đã đóng</span>' : ''}</div>
    <h3>${esc(c.title)}</h3><div class="meta"><span class="num">${fmtD(c.start_date)}${c.end_date !== c.start_date ? ' – ' + fmtD(c.end_date) : ''}</span><span>${numFmt(c.hours)} giờ</span><span>${esc(c.location)}</span></div>
    <div class="meta"><span>Giảng viên: ${esc(c.trainer) || '—'}</span><span>${c.n_members}${c.capacity ? '/' + c.capacity : ''} học viên</span></div>
    ${!c.my_status && c.open_register && c.status === 'open' && c.end_date >= T ? `<button class="btn sm primary" data-act="cr-reg" data-id="${c.id}" style="align-self:flex-start">Đăng ký tham gia</button>` : ''}</article>`;
  const up = d.courses.filter(c => c.end_date >= T), past = d.courses.filter(c => c.end_date < T);
  main.innerHTML = `<div class="page-head"><div><h1>Đào tạo</h1><p>Số giờ đào tạo đã hoàn thành của bạn năm ${T.slice(0, 4)}: <b class="num">${numFmt(d.my_hours)} giờ</b></p></div>${d.can_manage ? '<div class="actions"><button class="btn primary" data-act="cr-new">+ Khóa đào tạo</button></div>' : ''}</div>
  <h3 class="sec-t" style="margin-bottom:10px">Sắp diễn ra, đang diễn ra</h3><div class="feed-cards">${up.map(card).join('') || '<section class="card"><div class="empty">Chưa có khóa học sắp tới.</div></section>'}</div>
  <h3 class="sec-t" style="margin:20px 0 10px">Đã kết thúc</h3><div class="feed-cards">${past.map(card).join('') || '<p class="muted">—</p>'}</div>`;
};
function courseForm(c) {
  openModal(`${mh(c ? 'Sửa khóa đào tạo' : 'Tạo khóa đào tạo')}<div class="modal-b"><div class="form">
    <div class="field full"><label for="co-t">Tên khóa học</label><input id="co-t" value="${esc(c ? c.title : '')}"></div>
    <div class="field"><label for="co-k">Hình thức</label><select id="co-k"><option value="noibo">Nội bộ</option><option value="benngoai" ${c && c.kind === 'benngoai' ? 'selected' : ''}>Cử đi đào tạo bên ngoài</option></select></div>
    <div class="field"><label for="co-tr">Giảng viên, đơn vị đào tạo</label><input id="co-tr" value="${esc(c ? c.trainer : '')}"></div>
    <div class="field"><label for="co-s">Từ ngày</label><input type="date" id="co-s" value="${c ? c.start_date : addDays(TODAY(), 7)}"></div><div class="field"><label for="co-e">Đến ngày</label><input type="date" id="co-e" value="${c ? c.end_date : addDays(TODAY(), 7)}"></div>
    <div class="field"><label for="co-l">Địa điểm</label><input id="co-l" value="${esc(c ? c.location : '')}"></div><div class="field"><label for="co-h">Số giờ</label><input type="number" id="co-h" min="0" step="0.5" value="${c ? c.hours : 4}"></div>
    <div class="field"><label for="co-c">Số học viên tối đa (0: không giới hạn)</label><input type="number" id="co-c" min="0" value="${c ? c.capacity : 0}"></div><div class="field"><label for="co-cost">Chi phí (đồng)</label><input id="co-cost" class="money-in" inputmode="numeric" value="${c && c.cost ? money(c.cost) : ''}"></div>
    <div class="field"><label class="check"><input type="checkbox" id="co-o" ${!c || c.open_register ? 'checked' : ''}> Cho phép nhân sự tự đăng ký</label></div>
    ${c ? `<div class="field"><label for="co-st">Tình trạng</label><select id="co-st"><option value="open">Đang mở</option><option value="closed" ${c.status === 'closed' ? 'selected' : ''}>Đã đóng</option></select></div>` : ''}
    <div class="field full"><label for="co-d">Nội dung, mục tiêu</label><textarea id="co-d">${esc(c ? c.description : '')}</textarea></div>
    ${c ? '' : `<div class="field full"><label>Cử nhân sự tham gia</label><div class="member-pick">${B().departments.map(d => { const us = B().users.filter(u => u.active && u.dept_id === d.id); return us.length ? `<fieldset><legend>${esc(d.name)}</legend>${us.map(u => `<label class="check"><input type="checkbox" class="co-u" value="${u.id}"> ${esc(u.full_name)}</label>`).join('')}</fieldset>` : ''; }).join('')}</div></div>`}</div><p class="err" id="co-err" hidden></p></div>
  <div class="modal-f"><button class="btn" data-act="close">Hủy</button><button class="btn primary" data-act="m-save">Lưu</button></div>`, {
    'm-save': btn => busy(btn, async () => { const b = { title: $('#co-t').value, kind: $('#co-k').value, trainer: $('#co-tr').value, start_date: $('#co-s').value, end_date: $('#co-e').value, location: $('#co-l').value, hours: $('#co-h').value, capacity: $('#co-c').value, cost: $('#co-cost').value, open_register: $('#co-o').checked, description: $('#co-d').value };
      try { if (c) { b.status = $('#co-st').value; await PUT('/api/courses/' + c.id, b); } else { b.members = $$('.co-u:checked').map(x => Number(x.value)); await POST('/api/courses', b); } closeModal(); render(); toast('Đã lưu khóa đào tạo'); } catch (e) { showErr('#co-err', e); } })
  });
}
async function courseDetail(id) {
  const c = await GET('/api/courses/' + id), me = c.members.find(m => m.user_id === B().me.id);
  openModal(`${mh(esc(c.title), (c.kind === 'benngoai' ? 'Đào tạo bên ngoài' : 'Đào tạo nội bộ') + ' · ' + fmtD(c.start_date) + (c.end_date !== c.start_date ? ' – ' + fmtD(c.end_date) : ''))}<div class="modal-b">
    <dl class="kv"><dt>Giảng viên</dt><dd>${esc(c.trainer) || '—'}</dd><dt>Địa điểm</dt><dd>${esc(c.location) || '—'}</dd><dt>Thời lượng</dt><dd>${numFmt(c.hours)} giờ</dd>${c.cost ? `<dt>Chi phí</dt><dd class="num">${vnd(c.cost)}</dd>` : ''}${c.description ? `<dt>Nội dung</dt><dd>${esc(c.description)}</dd>` : ''}</dl>
    ${me && me.status === 'completed' ? `<div class="field"><label for="fb">Ý kiến đánh giá khóa học của bạn</label><textarea id="fb">${esc(me.feedback)}</textarea><button class="btn sm" data-act="m-fb" style="align-self:flex-start;margin-top:6px">Gửi ý kiến</button></div>` : ''}
    <h3 class="sec-t">Học viên (${c.members.length})</h3>
    <div class="tbl-wrap"><table class="tbl" style="min-width:520px"><thead><tr><th>Họ và tên</th><th>Tình trạng</th><th>Điểm</th>${c.can_manage ? '<th></th>' : '<th>Ý kiến</th>'}</tr></thead><tbody>
    ${c.members.map(m => `<tr data-mrow="${m.user_id}"><td>${who(m.user_id)}<div class="t-sub">${esc(Dp(m.dept_id).name)}</div></td>
      <td>${c.can_manage ? `<select class="sel m-st">${opts(MST, m.status)}</select>` : MST[m.status]}</td><td>${c.can_manage ? `<input class="sel m-sc" type="number" min="0" max="10" step="0.5" value="${m.score ?? ''}" style="width:80px">` : (m.score ?? '—')}</td>
      ${c.can_manage ? `<td><button class="btn ghost sm" data-act="m-rm" data-u="${m.user_id}">Bỏ</button></td>` : `<td class="t-sub">${esc(m.feedback)}</td>`}</tr>`).join('') || '<tr><td colspan="4" class="empty">Chưa có học viên.</td></tr>'}</tbody></table></div>
    ${c.can_manage ? `<div class="inline-add"><select id="add-u" class="sel" style="flex:1">${userOpts(null, u => !c.members.some(m => m.user_id === u.id))}</select><button class="btn sm" data-act="m-add">+ Cử tham gia</button></div>` : ''}<p class="err" id="cm-err" hidden></p></div>
  <div class="modal-f">${c.can_manage ? '<button class="btn" data-act="m-edit" style="margin-right:auto">Sửa khóa học</button>' : ''}${me && ['registered', 'assigned'].includes(me.status) && me.status === 'registered' ? '<button class="btn" data-act="m-unreg">Hủy đăng ký</button>' : ''}<button class="btn" data-act="close">Đóng</button>${c.can_manage ? '<button class="btn primary" data-act="m-save">Lưu kết quả</button>' : ''}</div>`, {
    'm-save': btn => busy(btn, async () => { try { await POST(`/api/courses/${c.id}/members`, { members: $$('[data-mrow]').map(r => ({ user_id: Number(r.dataset.mrow), status: $('.m-st', r).value, score: $('.m-sc', r).value })) }); closeModal(); render(); toast('Đã lưu kết quả đào tạo'); } catch (e) { showErr('#cm-err', e); } }),
    'm-add': async () => { await POST(`/api/courses/${c.id}/members`, { members: [{ user_id: $('#add-u').value, status: 'assigned' }] }); courseDetail(c.id); render(); },
    'm-rm': async btn => { await POST(`/api/courses/${c.id}/members`, { members: [{ user_id: btn.dataset.u, remove: true }] }); courseDetail(c.id); render(); },
    'm-fb': async () => { await POST(`/api/courses/${c.id}/feedback`, { feedback: $('#fb').value }); toast('Cảm ơn ý kiến của bạn'); },
    'm-unreg': async () => { await POST(`/api/courses/${c.id}/unregister`); closeModal(); render(); },
    'm-edit': () => courseForm(c)
  });
}
ACTIONS['cr-new'] = () => courseForm(null);
ACTIONS['cr-reg'] = async btn => { try { await POST(`/api/courses/${btn.dataset.id}/register`); toast('Đã đăng ký tham gia'); render(); } catch (e) { toast(e.message, true); } };
pick('data-course', v => courseDetail(v).catch(e => toast(e.message, true)));

/* ======================================================== ĐÁNH GIÁ NĂNG LỰC */
const RV = { pending: 'Chưa tự đánh giá', self: 'Chờ cấp trên đánh giá', done: 'Hoàn thành' };
const RV_CLS = { pending: 's-todo', self: 's-pending', done: 's-done' };
const RANK = { A: 'Hoàn thành xuất sắc nhiệm vụ', B: 'Hoàn thành tốt nhiệm vụ', C: 'Hoàn thành nhiệm vụ', D: 'Không hoàn thành nhiệm vụ' };
let rvCycle = '';
VIEWS['danh-gia'] = async main => {
  const [cs, d] = await Promise.all([GET('/api/reviews/cycles'), GET('/api/reviews?cycle=' + rvCycle)]);
  const cyc = d.cycle;
  if (!cyc) { main.innerHTML = `<div class="page-head"><div><h1>Đánh giá năng lực</h1><p>Chưa có kỳ đánh giá</p></div>${cs.can_manage ? '<div class="actions"><button class="btn primary" data-act="rv-new">+ Mở kỳ đánh giá</button></div>' : ''}</div><section class="card"><div class="empty">Phòng HC–NS mở kỳ đánh giá để bắt đầu.</div></section>`; return; }
  const m = d.mine, open = cyc.status === 'open';
  main.innerHTML = `<div class="page-head"><div><h1>Đánh giá năng lực</h1><p>${esc(cyc.name)} · ${fmtD(cyc.start_date)} – ${fmtD(cyc.end_date)}${open ? '' : ' · đã đóng'}</p></div><div class="actions"><select class="sel" id="rv-c" aria-label="Kỳ đánh giá">${cs.cycles.map(c => `<option value="${c.id}" ${c.id === cyc.id ? 'selected' : ''}>${esc(c.name)} (${c.n_done}/${c.n})</option>`).join('')}</select>${cs.can_manage ? `${open ? '<button class="btn" data-act="rv-close">Đóng kỳ</button>' : ''}<button class="btn primary" data-act="rv-new">+ Kỳ đánh giá</button>` : ''}</div></div>
  <div class="grid2"><div class="stack">
    ${m ? `<section class="card"><div class="card-h"><h2>Phiếu đánh giá của tôi</h2><span class="pill ${RV_CLS[m.status]}">${RV[m.status]}</span></div><div class="card-b">${m.status === 'done' ? `<div class="result"><b class="num">${numFmt(m.final_score)}</b><span>Xếp loại <b>${m.rank}</b> — ${RANK[m.rank]}</span></div>` : ''}
      ${reviewTable(cyc.criteria, m.self_scores, m.mgr_scores)}${m.self_comment ? `<p><b>Tự nhận xét:</b> ${esc(m.self_comment)}</p>` : ''}${m.mgr_comment ? `<p><b>Nhận xét của ${esc(m.reviewer_name || 'cấp trên')}:</b> ${esc(m.mgr_comment)}</p>` : ''}
      ${open && m.status !== 'done' ? `<button class="btn primary" data-act="rv-self" data-id="${m.id}">${m.status === 'pending' ? 'Tự đánh giá' : 'Sửa phiếu tự đánh giá'}</button>` : ''}</div></section>` : ''}
    ${d.to_review.length ? `<section class="card"><div class="card-h"><h2>Nhân sự tôi đánh giá (${d.to_review.filter(r => r.status === 'done').length}/${d.to_review.length})</h2></div><div class="list">${d.to_review.map(r => `<div class="item" data-rv="${r.id}"><div style="display:flex;gap:10px;align-items:center">${av(r.user_id)}<div><h3>${esc(r.full_name)}</h3><div class="meta">${esc(r.title)}</div></div></div><div class="right"><span class="pill ${RV_CLS[r.status]}">${RV[r.status]}</span>${r.final_score ? `<span class="num"><b>${numFmt(r.final_score)}</b> · loại ${r.rank}</span>` : ''}</div></div>`).join('')}</div></section>` : ''}
  </div><div class="stack">
    <section class="card"><div class="card-h"><h2>Tiêu chí và cách xếp loại</h2></div><div class="card-b"><table class="tbl" style="min-width:0"><tbody>${cyc.criteria.map(c => `<tr><td>${esc(c.name)}</td><td class="r num">${c.weight}%</td></tr>`).join('')}</tbody></table>
      <p class="hint">Mỗi tiêu chí chấm từ 1 đến 5 điểm. Điểm tổng = trung bình có trọng số theo điểm của cấp trên. Xếp loại: A ≥ 4,5 · B ≥ 3,5 · C ≥ 2,5 · D dưới 2,5.</p></div></section>
    ${d.all.length ? `<section class="card"><div class="card-h"><h2>Tổng hợp toàn đơn vị</h2><span class="muted num">${['A', 'B', 'C', 'D'].map(k => `${k}: ${d.all.filter(r => r.rank === k).length}`).join(' · ')}</span></div><div class="tbl-wrap"><table class="tbl" style="min-width:460px"><tbody>${d.all.map(r => `<tr class="click" data-rv="${r.id}"><td>${who(r.user_id)}</td><td class="t-sub">${esc(r.reviewer_name || '—')}</td><td><span class="pill ${RV_CLS[r.status]}">${RV[r.status]}</span></td><td class="r num">${r.final_score ? `<b>${numFmt(r.final_score)}</b> · ${r.rank}` : ''}</td></tr>`).join('')}</tbody></table></div></section>` : ''}
  </div></div>`;
  main._rv = d;
  $('#rv-c').addEventListener('change', e => { rvCycle = e.target.value; render(); });
};
function reviewTable(crit, self, mgr) {
  return `<div class="tbl-wrap"><table class="tbl" style="min-width:0"><thead><tr><th>Tiêu chí</th><th class="r">Trọng số</th><th class="r">Tự đánh giá</th><th class="r">Cấp trên</th></tr></thead><tbody>${crit.map((c, i) => `<tr><td>${esc(c.name)}</td><td class="r num">${c.weight}%</td><td class="r num">${self ? self[i] : '—'}</td><td class="r num">${mgr ? `<b>${mgr[i]}</b>` : '—'}</td></tr>`).join('')}</tbody></table></div>`;
}
function scoreForm(r, mode) {
  const crit = $('#main')._rv.cycle.criteria, base = (mode === 'manager' ? (r.mgr_scores || r.self_scores) : r.self_scores) || [];
  openModal(`${mh(mode === 'self' ? 'Tự đánh giá' : 'Đánh giá của cấp trên', esc(r.full_name))}<div class="modal-b">
    ${crit.map((c, i) => `<div class="score-row"><div><b>${esc(c.name)}</b><span class="muted"> · ${c.weight}%</span>${mode === 'manager' && r.self_scores ? `<div class="t-sub">Tự đánh giá: ${r.self_scores[i]}</div>` : ''}</div><div class="seg">${[1, 2, 3, 4, 5].map(n => `<button type="button" data-sc="${i}" data-v="${n}" aria-pressed="${base[i] === n}">${n}</button>`).join('')}</div></div>`).join('')}
    ${mode === 'manager' && r.self_comment ? `<p class="notice info">Tự nhận xét: ${esc(r.self_comment)}</p>` : ''}
    <div class="field"><label for="rv-cm">${mode === 'self' ? 'Tự nhận xét: kết quả nổi bật, hạn chế, đề xuất' : 'Nhận xét, định hướng phát triển'}</label><textarea id="rv-cm">${esc(mode === 'self' ? r.self_comment : r.mgr_comment)}</textarea></div>
    <p class="hint" style="margin:0">Thang điểm: 1 Không đạt · 2 Cần cải thiện · 3 Đạt yêu cầu · 4 Tốt · 5 Xuất sắc.</p><p class="err" id="rv-err" hidden></p></div>
  <div class="modal-f"><button class="btn" data-act="close">Hủy</button><button class="btn primary" data-act="m-save">${mode === 'self' ? 'Gửi tự đánh giá' : 'Hoàn thành đánh giá'}</button></div>`, {
    'm-save': btn => busy(btn, async () => { const sc = crit.map((_, i) => { const b = $(`[data-sc="${i}"][aria-pressed="true"]`); return b ? Number(b.dataset.v) : 0; });
      try { await POST(`/api/reviews/${r.id}/${mode}`, { scores: sc, comment: $('#rv-cm').value }); closeModal(); render(); S.refreshBoot(); toast('Đã lưu phiếu đánh giá'); } catch (e) { showErr('#rv-err', e); } })
  });
  $$('[data-sc]').forEach(b => b.addEventListener('click', () => { $$(`[data-sc="${b.dataset.sc}"]`).forEach(x => x.setAttribute('aria-pressed', 'false')); b.setAttribute('aria-pressed', 'true'); }));
}
ACTIONS['rv-self'] = () => scoreForm($('#main')._rv.mine, 'self');
ACTIONS['rv-close'] = async btn => { if (!armed(btn, 'Bấm lần nữa để đóng')) return; await POST(`/api/reviews/cycles/${$('#main')._rv.cycle.id}/close`); render(); };
ACTIONS['rv-new'] = () => {
  const y = new Date().getFullYear(), q = Math.floor(new Date().getMonth() / 3);
  openModal(`${mh('Mở kỳ đánh giá')}<div class="modal-b"><div class="form three"><div class="field"><label for="rc-n">Tên kỳ</label><input id="rc-n" value="Đánh giá Quý ${['I', 'II', 'III', 'IV'][q]}/${y}"></div><div class="field"><label for="rc-s">Từ ngày</label><input type="date" id="rc-s" value="${TODAY()}"></div><div class="field"><label for="rc-e">Đến ngày</label><input type="date" id="rc-e" value="${addDays(TODAY(), 20)}"></div></div>
    <h3 class="sec-t">Tiêu chí (tổng trọng số 100%)</h3><div id="rc-rows" class="stack" style="gap:8px">${[['Khối lượng, tiến độ hoàn thành nhiệm vụ', 35], ['Chất lượng, hiệu quả công việc', 30], ['Tinh thần trách nhiệm, chấp hành nội quy', 15], ['Phối hợp, làm việc nhóm', 10], ['Học tập, sáng kiến, cải tiến', 10]].map(([n, w]) => `<div class="step-edit" style="grid-template-columns:minmax(0,1fr) 90px"><input class="rc-n" value="${esc(n)}" aria-label="Tiêu chí"><input class="rc-w" type="number" min="0" max="100" value="${w}" aria-label="Trọng số"></div>`).join('')}</div>
    <p class="hint" style="margin:0">Hệ thống tạo phiếu cho toàn bộ nhân sự; người đánh giá mặc định là lãnh đạo phòng (lãnh đạo phòng do Giám đốc đánh giá).</p><p class="err" id="rc-err" hidden></p></div>
  <div class="modal-f"><button class="btn" data-act="close">Hủy</button><button class="btn primary" data-act="m-save">Mở kỳ đánh giá</button></div>`, {
    'm-save': btn => busy(btn, async () => { try { const r = await POST('/api/reviews/cycles', { name: $('#rc-n').value, start_date: $('#rc-s').value, end_date: $('#rc-e').value, criteria: $$('#rc-rows .step-edit').map(x => ({ name: $('.rc-n', x).value, weight: $('.rc-w', x).value })) }); rvCycle = String(r.id); closeModal(); render(); toast('Đã mở kỳ đánh giá'); } catch (e) { showErr('#rc-err', e); } })
  });
};
pick('data-rv', v => { const d = $('#main')._rv, r = d.to_review.find(x => x.id === Number(v)) || d.all.find(x => x.id === Number(v)); if (!r) return;
  if (d.cycle.status === 'open' && (d.to_review.includes(r) || B().me.is_lead)) scoreForm(r, 'manager');
  else openModal(`${mh(esc(r.full_name), RV[r.status])}<div class="modal-b">${reviewTable(d.cycle.criteria, r.self_scores, r.mgr_scores)}${r.final_score ? `<p><b>Điểm: ${numFmt(r.final_score)} · Xếp loại ${r.rank}</b></p>` : ''}</div><div class="modal-f"><button class="btn" data-act="close">Đóng</button></div>`); });
})();
