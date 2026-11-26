/**
 * LifeCare – giao diện lập lịch theo khung giờ:
 * - Kế hoạch tháng / tuần / ngày có điều hướng, mật độ hiển thị tự co giãn theo số việc và kích thước màn hình.
 * - Thời gian biểu cố định (time block) thiết lập một lần, tự lặp mỗi tuần.
 * - Mục tiêu lớn: % hoàn thành, cột mốc, ghi tiến độ thêm, dự báo xong sớm/trễ, cảnh báo khả thi.
 * - Khai báo gián đoạn để AI xếp lại lịch.
 * - Nhắc việc khi đến giờ mà chưa xác nhận hoàn thành, nhắc lại sau khoảng thời gian tuỳ chỉnh.
 * Dùng chung các hàm của app.js: apiRequest, showToast, escapeHTML, openTaskModal, toggleTaskStatus,
 * sendAiMessage, navigateToView, todayLocal, localDateStr, L.
 */

const DAY_KEYS_UI = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
// Nhãn hai ngôn ngữ: { key: [tiếng Việt, English] } -> đọc ra theo ngôn ngữ đang chọn.
const bilingual = table => new Proxy(table, {
  get: (obj, key) => (Array.isArray(obj[key]) ? L(obj[key][0], obj[key][1]) : obj[key])
});
const DAY_SHORT = bilingual({ mon: ['T2', 'Mon'], tue: ['T3', 'Tue'], wed: ['T4', 'Wed'], thu: ['T5', 'Thu'], fri: ['T6', 'Fri'], sat: ['T7', 'Sat'], sun: ['CN', 'Sun'] });
const DAY_LONG = bilingual({ mon: ['Thứ Hai', 'Monday'], tue: ['Thứ Ba', 'Tuesday'], wed: ['Thứ Tư', 'Wednesday'], thu: ['Thứ Năm', 'Thursday'], fri: ['Thứ Sáu', 'Friday'], sat: ['Thứ Bảy', 'Saturday'], sun: ['Chủ Nhật', 'Sunday'] });
const metaEntry = (icon, vi, en) => ({ icon, get label() { return L(vi, en); } });
const BLOCK_META = {
  sleep: metaEntry('😴', 'Ngủ nghỉ', 'Sleep'),
  meal: metaEntry('🍽️', 'Ăn uống', 'Meals'),
  school: metaEntry('🏫', 'Đi học / đi làm', 'School / work'),
  extra_class: metaEntry('📘', 'Học thêm', 'Extra class'),
  leisure: metaEntry('🎮', 'Giải trí', 'Leisure'),
  exercise: metaEntry('🏃', 'Tập luyện', 'Exercise'),
  study: metaEntry('📚', 'Tự học', 'Self-study')
};
const DISRUPTION_META = {
  incident: metaEntry('🚑', 'Sự cố', 'Incident'),
  class_off: metaEntry('🏖️', 'Nghỉ học', 'Class cancelled'),
  new_work: metaEntry('📥', 'Việc phát sinh', 'New work'),
  unavailable: metaEntry('⛔', 'Không thể thực hiện', 'Unavailable')
};
const CATEGORY_VI = bilingual({ Study: ['Học tập', 'Study'], Work: ['Công việc', 'Work'], Exercise: ['Thể thao', 'Exercise'], Personal: ['Cá nhân', 'Personal'], Rest: ['Nghỉ ngơi', 'Rest'], Other: ['Khác', 'Other'] });
const PRIORITY_VI = bilingual({ high: ['Cao', 'High'], medium: ['Vừa', 'Medium'], low: ['Thấp', 'Low'] });

// ---------------------------------------------------------------- tiện ích ngày giờ
function addDaysStr(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return localDateStr(new Date(y, m - 1, d + n));
}
function dayKeyOf(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date(y, m - 1, d).getDay()];
}
function mondayOf(dateStr) {
  return addDaysStr(dateStr, -DAY_KEYS_UI.indexOf(dayKeyOf(dateStr)));
}
const fmtDM = s => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : '');
const fmtDMY = s => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '');
const hmToMin = hm => (hm ? Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5)) : null);
const minToHM = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const nowHM = () => minToHM(new Date().getHours() * 60 + new Date().getMinutes());
const hoursText = min => {
  const h = Math.round((min / 60) * 10) / 10;
  return `${h} ${L('giờ', 'h')}`;
};
function daysUntil(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.round((new Date(y, m - 1, d) - t) / 86400000);
}

function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

// ---------------------------------------------------------------- chọn ngày trong tuần
function renderDayPicker(container, selected = DAY_KEYS_UI) {
  container.innerHTML = `
    <div class="day-toggle-row">
      ${DAY_KEYS_UI.map(d => `<button type="button" class="day-toggle ${selected.includes(d) ? 'active' : ''}" data-day="${d}">${DAY_SHORT[d]}</button>`).join('')}
    </div>
    <div class="day-quick">
      <button type="button" data-quick="all">${L('Cả tuần', 'All week')}</button>
      <button type="button" data-quick="weekdays">${L('T2–T6', 'Mon–Fri')}</button>
      <button type="button" data-quick="weekend">${L('T7–CN', 'Sat–Sun')}</button>
    </div>`;
  container.querySelectorAll('.day-toggle').forEach(b => b.addEventListener('click', () => b.classList.toggle('active')));
  container.querySelectorAll('[data-quick]').forEach(b => b.addEventListener('click', () => {
    const set = { all: DAY_KEYS_UI, weekdays: DAY_KEYS_UI.slice(0, 5), weekend: ['sat', 'sun'] }[b.dataset.quick];
    container.querySelectorAll('.day-toggle').forEach(t => t.classList.toggle('active', set.includes(t.dataset.day)));
  }));
}
const pickedDays = container => [...container.querySelectorAll('.day-toggle.active')].map(b => b.dataset.day);

// ================================================================ KẾ HOẠCH: THÁNG / TUẦN / NGÀY
let calendarRenderToken = 0;

function shiftCalendar(dir) {
  const a = AppState.calendarAnchor || todayLocal();
  if (AppState.calendarView === 'month') {
    const [y, m] = a.split('-').map(Number);
    AppState.calendarAnchor = localDateStr(new Date(y, m - 1 + dir, 1));
  } else {
    AppState.calendarAnchor = addDaysStr(a, AppState.calendarView === 'week' ? 7 * dir : dir);
  }
  renderCalendar();
}

function setCalendarView(view, date) {
  AppState.calendarView = view;
  if (date) AppState.calendarAnchor = date;
  document.querySelectorAll('.calendar-view-tabs .view-tab-btn').forEach(b => b.classList.toggle('active', b.getAttribute('data-cal-view') === view));
  renderCalendar();
}

async function renderCalendar() {
  const area = document.getElementById('calendarDisplayArea');
  if (!area) return;
  const token = ++calendarRenderToken;
  const view = AppState.calendarView;
  const anchor = AppState.calendarAnchor || (AppState.calendarAnchor = todayLocal());
  area.dataset.view = view;
  const label = document.getElementById('calPeriodLabel');
  renderCalendarLegend(view);

  if (view === 'month') {
    const [y, m] = anchor.split('-').map(Number);
    label.textContent = L(`Tháng ${m}/${y}`, `${m}/${y}`);
    renderMonth(area, y, m - 1);
    return;
  }

  const start = view === 'week' ? mondayOf(anchor) : anchor;
  const end = view === 'week' ? addDaysStr(start, 6) : anchor;
  label.textContent = view === 'week'
    ? `${fmtDM(start)} – ${fmtDMY(end)}`
    : `${DAY_LONG[dayKeyOf(anchor)]}, ${fmtDMY(anchor)}${anchor === todayLocal() ? L(' · hôm nay', ' · today') : ''}`;
  area.innerHTML = `<div class="cal-loading">⌛ ${L('Đang tải lịch...', 'Loading...')}</div>`;
  try {
    const res = await apiRequest(`/api/schedule?start=${start}&end=${end}`);
    if (token !== calendarRenderToken) return; // người dùng đã chuyển sang khoảng khác
    if (view === 'week') renderWeek(area, res.days);
    else renderDay(area, res.days[0]);
  } catch (err) {
    area.innerHTML = `<div class="cal-error">⚠️ ${escapeHTML(err.message)}</div>`;
  }
}

function renderCalendarLegend(view) {
  const el = document.getElementById('calLegend');
  if (!el) return;
  if (view === 'month') { el.innerHTML = ''; return; }
  const show = localStorage.getItem('lifecare_show_blocks') !== '0';
  el.innerHTML = `<label class="inline-check"><input type="checkbox" id="toggleBlocks" ${show ? 'checked' : ''}/> ${L('Hiện khung giờ cố định', 'Show time blocks')}</label>`;
  document.getElementById('toggleBlocks').addEventListener('change', e => {
    localStorage.setItem('lifecare_show_blocks', e.target.checked ? '1' : '0');
    renderCalendar();
  });
}

// Mật độ hiển thị theo số việc nhiều nhất trong một ngày.
function densityFor(maxTasks) {
  if (maxTasks > 8) return 'dense';
  if (maxTasks > 4) return 'compact';
  return 'comfy';
}

function renderMonth(area, year, monthIdx) {
  const first = new Date(year, monthIdx, 1);
  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7; // tuần bắt đầu từ thứ Hai
  const today = todayLocal();
  const byDate = {};
  AppState.tasks.forEach(t => (byDate[t.date] = byDate[t.date] || []).push(t));
  // Số dòng việc hiện trong ô tuỳ theo độ rộng màn hình
  const cellWidth = (area.clientWidth || 700) / 7;
  const maxPills = cellWidth >= 150 ? 3 : cellWidth >= 100 ? 2 : 0;

  let html = `<div class="month-grid">${DAY_KEYS_UI.map(d => `<div class="month-day-header">${DAY_SHORT[d]}</div>`).join('')}`;
  for (let i = 0; i < lead; i++) html += `<div class="month-day-cell empty"></div>`;
  for (let day = 1; day <= daysInMonth; day++) {
    const ds = `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const list = (byDate[ds] || []).sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
    const done = list.filter(t => t.status === 'completed').length;
    html += `
      <button type="button" class="month-day-cell ${ds === today ? 'today' : ''}" data-goto-day="${ds}" title="${L('Xem ngày', 'Open day')} ${fmtDM(ds)}">
        <div class="day-num">${day}${list.length ? `<span class="day-count">${done}/${list.length}</span>` : ''}</div>
        ${maxPills ? list.slice(0, maxPills).map(t => `<div class="day-tasks-pill ${t.status === 'completed' ? 'done' : ''} cat-${t.category.toLowerCase()}">${t.start_time ? t.start_time + ' ' : ''}${escapeHTML(t.title)}</div>`).join('')
          : `<div class="day-dots">${list.slice(0, 6).map(t => `<i class="cat-dot cat-${t.category.toLowerCase()} ${t.status === 'completed' ? 'done' : ''}"></i>`).join('')}</div>`}
        ${maxPills && list.length > maxPills ? `<div class="day-more">+${list.length - maxPills}</div>` : ''}
      </button>`;
  }
  area.innerHTML = html + `</div>`;
  area.querySelectorAll('[data-goto-day]').forEach(c => c.addEventListener('click', () => setCalendarView('day', c.dataset.gotoDay)));
}

function taskBadges(t, compact) {
  const today = todayLocal();
  const overdue = t.status !== 'completed' && (t.date < today || (t.date === today && t.end_time && t.end_time < nowHM()));
  const goal = t.goal_id && AppState.goals.find(g => g.id === t.goal_id);
  return [
    overdue ? `<span class="badge badge-overdue">${L('Trễ', 'Late')}</span>` : '',
    compact ? '' : `<span class="badge badge-${t.category.toLowerCase()}">${CATEGORY_VI[t.category] || t.category}</span>`,
    !compact && t.priority === 'high' ? `<span class="priority-high">${L('Ưu tiên cao', 'High')}</span>` : '',
    !compact && goal ? `<span class="badge badge-goal">🎯 ${escapeHTML(goal.title)}</span>` : '',
    !compact && t.duration_minutes ? `<span class="muted-text">⏱ ${t.duration_minutes}′</span>` : '',
    !compact && t.deadline ? `<span class="muted-text">⏳ ${L('hạn', 'due')} ${fmtDM(t.deadline)}</span>` : ''
  ].join('');
}

function taskRowHTML(t, compact) {
  return `
    <div class="sched-item task ${t.status === 'completed' ? 'done' : ''} cat-border-${t.category.toLowerCase()}" data-task-id="${t.id}">
      <input type="checkbox" class="task-checkbox" ${t.status === 'completed' ? 'checked' : ''} data-toggle-task="${t.id}" aria-label="${L('Hoàn thành', 'Done')}" />
      <button type="button" class="sched-body" data-edit-task="${t.id}">
        <span class="sched-time">${t.start_time ? `${t.start_time}${t.end_time ? '–' + t.end_time : ''}` : L('Cả ngày', 'All day')}</span>
        <span class="sched-title">${escapeHTML(t.title)}</span>
        <span class="sched-badges">${taskBadges(t, compact)}</span>
      </button>
    </div>`;
}

function bindScheduleItemEvents(root, tasks) {
  root.querySelectorAll('[data-toggle-task]').forEach(cb => cb.addEventListener('change', () => toggleTaskStatus(cb.dataset.toggleTask, cb.checked)));
  root.querySelectorAll('[data-edit-task]').forEach(b => b.addEventListener('click', () => {
    const t = tasks.find(x => x.id === b.dataset.editTask);
    if (t) openTaskModal(t);
  }));
  root.querySelectorAll('[data-add-slot]').forEach(b => b.addEventListener('click', () => {
    const [date, start, end] = b.dataset.addSlot.split('|');
    const endMin = Math.min(hmToMin(start) + 60, end === '24:00' ? 1439 : hmToMin(end));
    openTaskModal(null, date, start, minToHM(endMin));
  }));
  root.querySelectorAll('[data-del-disruption]').forEach(b => b.addEventListener('click', () => deleteDisruption(b.dataset.delDisruption)));
}

function renderWeek(area, days) {
  const today = todayLocal();
  const showBlocks = localStorage.getItem('lifecare_show_blocks') !== '0';
  const maxTasks = Math.max(0, ...days.map(d => d.tasks.length));
  const density = densityFor(maxTasks);
  const compact = density !== 'comfy';
  const allTasks = days.flatMap(d => d.tasks);

  area.innerHTML = `
    <div class="week-grid density-${density}">
      ${days.map(d => {
        const items = [
          // Chế độ tuần: khung giờ cố định gọn một dòng, bỏ "ngủ" cho đỡ rối (chế độ ngày vẫn hiện đủ)
          ...(showBlocks && density !== 'dense' ? d.blocks.filter(b => b.block_type !== 'sleep').map(b => ({ start: b.start, html: `<div class="sched-item block blk-${b.block_type}" title="${escapeHTML(b.label || '')} ${b.start}–${b.end}"><span class="sched-time">${b.start}</span><span class="sched-title">${BLOCK_META[b.block_type]?.icon || ''} ${escapeHTML(b.label || BLOCK_META[b.block_type]?.label || '')}</span></div>` })) : []),
          ...d.disruptions.map(x => ({ start: x.start_time || '00:00', html: `<div class="sched-item disruption"><span class="sched-time">${x.start_time ? `${x.start_time}–${x.end_time}` : L('Cả ngày', 'All day')}</span><span class="sched-title">${DISRUPTION_META[x.kind]?.icon} ${DISRUPTION_META[x.kind]?.label}${x.note && !compact ? ': ' + escapeHTML(x.note) : ''}</span></div>` })),
          ...d.tasks.map(t => ({ start: t.start_time || '00:00', html: taskRowHTML(t, compact) }))
        ].sort((a, b) => a.start.localeCompare(b.start));
        const done = d.tasks.filter(t => t.status === 'completed').length;
        const freeMin = d.free_slots.reduce((s, f) => s + f.minutes, 0);
        return `
          <div class="week-col ${d.date === today ? 'today' : ''} ${d.date < today ? 'past' : ''}">
            <button type="button" class="week-col-head" data-goto-day="${d.date}">
              <strong>${DAY_SHORT[d.weekday]} ${fmtDM(d.date)}</strong>
              <span>${d.tasks.length ? `${done}/${d.tasks.length}` : ''}</span>
            </button>
            <div class="week-col-body">
              ${items.length ? items.map(i => i.html).join('') : `<div class="sched-empty">${L('Trống', 'Free')}</div>`}
            </div>
            ${d.date >= today && freeMin ? `<div class="week-col-free" title="${L('Thời gian trống ngoài khung giờ cố định', 'Free time outside blocks')}">🟢 ${L('Trống', 'Free')} ${hoursText(freeMin)}</div>` : ''}
          </div>`;
      }).join('')}
    </div>`;
  area.querySelectorAll('[data-goto-day]').forEach(b => b.addEventListener('click', () => setCalendarView('day', b.dataset.gotoDay)));
  bindScheduleItemEvents(area, allTasks);
}

function renderDay(area, d) {
  const showBlocks = localStorage.getItem('lifecare_show_blocks') !== '0';
  const density = densityFor(d.tasks.length);
  const items = [
    ...(showBlocks ? d.blocks.map(b => ({ start: b.start, kind: 'block', html: `<div class="sched-item block blk-${b.block_type}"><span class="sched-time">${b.start}–${b.end}</span><span class="sched-title">${BLOCK_META[b.block_type]?.icon || ''} ${escapeHTML(b.label || BLOCK_META[b.block_type]?.label || '')}</span></div>` })) : []),
    ...d.disruptions.map(x => ({ start: x.start_time || '00:00', html: `<div class="sched-item disruption"><span class="sched-time">${x.start_time ? `${x.start_time}–${x.end_time}` : L('Cả ngày', 'All day')}</span><span class="sched-title">${DISRUPTION_META[x.kind]?.icon} ${DISRUPTION_META[x.kind]?.label}${x.note ? ': ' + escapeHTML(x.note) : ''}</span><button type="button" class="btn-icon small" data-del-disruption="${x.id}" title="${L('Xoá gián đoạn', 'Remove')}">✕</button></div>` })),
    ...d.free_slots.map(f => ({ start: f.start, html: `<div class="sched-item free"><span class="sched-time">${f.start}–${f.end}</span><span class="sched-title">${f.kind === 'study_block' ? '📚 ' + L('Còn trống trong giờ tự học', 'Open study time') : '🟢 ' + L('Thời gian trống', 'Free time')} · ${f.minutes}′</span><button type="button" class="btn btn-secondary small" data-add-slot="${d.date}|${f.start}|${f.end}">+ ${L('Thêm việc', 'Add task')}</button></div>` })),
    ...d.tasks.map(t => ({ start: t.start_time || '00:00', html: taskRowHTML(t, density === 'dense') }))
  ].sort((a, b) => a.start.localeCompare(b.start) || (a.kind === 'block' ? -1 : 1));
  const done = d.tasks.filter(t => t.status === 'completed').length;
  area.innerHTML = `
    <div class="day-agenda density-${density}">
      <div class="day-agenda-head">
        <span>${d.tasks.length ? L(`${done}/${d.tasks.length} việc đã xong`, `${done}/${d.tasks.length} done`) : L('Chưa có việc nào', 'No tasks yet')}</span>
        <div class="btn-row">
          <button type="button" class="btn btn-secondary small" id="dayAddTask">+ ${L('Thêm việc', 'Add task')}</button>
          <button type="button" class="btn btn-secondary small" id="dayReportDisruption">⚠️ ${L('Báo gián đoạn ngày này', 'Report disruption')}</button>
        </div>
      </div>
      ${items.length ? items.map(i => i.html).join('') : `<div class="sched-empty">${L('Ngày trống. Thêm việc hoặc nhờ AI phân bổ.', 'Empty day.')}</div>`}
    </div>`;
  document.getElementById('dayAddTask').addEventListener('click', () => openTaskModal(null, d.date));
  document.getElementById('dayReportDisruption').addEventListener('click', () => openDisruptionModal(d.date));
  bindScheduleItemEvents(area, d.tasks);
}

// ================================================================ THỜI GIAN BIỂU (TIME BLOCKS)
let routineBlocks = [];
const PX_PER_MIN = 0.5; // chiều cao lưới tuần: 24h = 720px

async function loadRoutine() {
  AppState.routineAnchor = AppState.routineAnchor || mondayOf(todayLocal());
  const start = AppState.routineAnchor;
  const end = addDaysStr(start, 6);
  document.getElementById('routineWeekLabel').textContent = `${fmtDM(start)} – ${fmtDMY(end)}`;
  document.getElementById('routineTzLabel').textContent = L(`Múi giờ: ${USER_TZ}.`, `Timezone: ${USER_TZ}.`);
  const grid = document.getElementById('routineWeekGrid');
  grid.innerHTML = `<div class="cal-loading">⌛ ${L('Đang tải...', 'Loading...')}</div>`;
  try {
    const [r, sch] = await Promise.all([apiRequest('/api/routine'), apiRequest(`/api/schedule?start=${start}&end=${end}`)]);
    routineBlocks = r.blocks || [];
    renderBlockLegend();
    renderRoutineGrid(grid, sch.days);
    renderBlockList();
  } catch (err) {
    grid.innerHTML = `<div class="cal-error">⚠️ ${escapeHTML(err.message)}</div>`;
  }
}

function renderBlockLegend() {
  document.getElementById('blockLegend').innerHTML = Object.entries(BLOCK_META)
    .map(([k, v]) => `<span class="legend-chip blk-${k}">${v.icon} ${v.label}</span>`).join('') +
    `<span class="legend-chip free-chip">🟢 ${L('Trống (AI phân bổ)', 'Free (AI fills)')}</span><span class="legend-chip task-chip">✓ ${L('Công việc', 'Task')}</span>`;
}

function renderRoutineGrid(grid, days) {
  const today = todayLocal();
  const H = 24 * 60 * PX_PER_MIN;
  const pos = (s, e) => `top:${hmToMin(s) * PX_PER_MIN}px;height:${Math.max(10, ((e === '24:00' ? 1440 : hmToMin(e)) - hmToMin(s)) * PX_PER_MIN)}px`;
  const hours = Array.from({ length: 13 }, (_, i) => i * 2);
  const nowTop = (new Date().getHours() * 60 + new Date().getMinutes()) * PX_PER_MIN;

  grid.innerHTML = `
    <div class="rw-scroll">
      <div class="rw-grid" style="--rw-h:${H}px">
        <div class="rw-axis">${hours.map(h => `<span style="top:${h * 60 * PX_PER_MIN}px">${String(h).padStart(2, '0')}:00</span>`).join('')}</div>
        ${days.map(d => `
          <div class="rw-col ${d.date === today ? 'today' : ''}">
            <div class="rw-head">${DAY_SHORT[d.weekday]}<small>${fmtDM(d.date)}</small></div>
            <div class="rw-body">
              ${d.blocks.map(b => `<div class="rw-block blk-${b.block_type}" style="${pos(b.start, b.end)}" title="${escapeHTML(b.label || '')} ${b.start}–${b.end}"><span>${BLOCK_META[b.block_type]?.icon || ''} ${escapeHTML(b.label || '')}</span></div>`).join('')}
              ${d.disruptions.map(x => `<div class="rw-disruption" style="${x.start_time ? pos(x.start_time, x.end_time) : `top:0;height:${H}px`}" title="${DISRUPTION_META[x.kind]?.label}"></div>`).join('')}
              ${d.tasks.filter(t => t.start_time && t.end_time).map(t => `<button type="button" class="rw-task ${t.status === 'completed' ? 'done' : ''}" style="${pos(t.start_time, t.end_time)}" data-edit-task="${t.id}" title="${escapeHTML(t.title)} ${t.start_time}–${t.end_time}"><span>${escapeHTML(t.title)}</span></button>`).join('')}
              ${d.date === today ? `<div class="rw-now" style="top:${nowTop}px"></div>` : ''}
            </div>
          </div>`).join('')}
      </div>
    </div>`;
  const allTasks = days.flatMap(d => d.tasks);
  grid.querySelectorAll('[data-edit-task]').forEach(b => b.addEventListener('click', () => {
    const t = allTasks.find(x => x.id === b.dataset.editTask);
    if (t) openTaskModal(t);
  }));
  // Cuộn tới khoảng 6h sáng để thấy phần ngày hoạt động
  const sc = grid.querySelector('.rw-scroll');
  if (sc) sc.scrollTop = 6 * 60 * PX_PER_MIN - 10;
}

function renderBlockList() {
  const box = document.getElementById('routineBlockList');
  if (!routineBlocks.length) {
    box.innerHTML = `<p class="muted-text">${L('Chưa có khung giờ nào. Chọn một mẫu ở trên để thiết lập nhanh, hoặc bấm "+ Thêm khung giờ".', 'No blocks yet.')}</p>`;
    return;
  }
  const sorted = [...routineBlocks].sort((a, b) => Object.keys(BLOCK_META).indexOf(a.block_type) - Object.keys(BLOCK_META).indexOf(b.block_type) || a.start_time.localeCompare(b.start_time));
  box.innerHTML = `<div class="block-list">${sorted.map(b => {
    const days = b.days.split(',');
    const overnight = b.end_time <= b.start_time;
    return `
      <div class="block-row blk-border-${b.block_type}">
        <div class="block-row-main">
          <strong>${BLOCK_META[b.block_type]?.icon || ''} ${escapeHTML(b.label || BLOCK_META[b.block_type]?.label)}</strong>
          <span class="muted-text">${b.start_time} → ${b.end_time}${overnight ? L(' (qua đêm)', ' (overnight)') : ''}</span>
        </div>
        <div class="block-days">${DAY_KEYS_UI.map(d => `<span class="${days.includes(d) ? 'on' : ''}">${DAY_SHORT[d]}</span>`).join('')}</div>
        <div class="btn-row">
          <button type="button" class="btn-icon small" data-edit-block="${b.id}" title="${L('Sửa', 'Edit')}">✎</button>
          <button type="button" class="btn-icon small danger" data-del-block="${b.id}" title="${L('Xoá', 'Delete')}">✕</button>
        </div>
      </div>`;
  }).join('')}</div>`;
  box.querySelectorAll('[data-edit-block]').forEach(b => b.addEventListener('click', () => openBlockModal(routineBlocks.find(x => x.id === b.dataset.editBlock))));
  box.querySelectorAll('[data-del-block]').forEach(b => b.addEventListener('click', async () => {
    if (!confirm(L('Xoá khung giờ này khỏi mọi tuần?', 'Delete this block from every week?'))) return;
    try {
      await apiRequest(`/api/routine/${b.dataset.delBlock}`, { method: 'DELETE' });
      loadRoutine();
    } catch (err) { showToast(err.message, 'error'); }
  }));
}

// ---------------------------------------------------------------- xoá kế hoạch trong tuần đang xem
// "Kế hoạch" = công việc đã lập trong tuần (bảng tasks). Khung giờ cố định không bị xoá.
let deletePlansTasks = [];

async function openDeletePlansModal() {
  const start = AppState.routineAnchor || mondayOf(todayLocal());
  const end = addDaysStr(start, 6);
  document.getElementById('deletePlansWeekLabel').textContent = L(`Tuần ${fmtDM(start)} – ${fmtDMY(end)}`, `Week ${fmtDM(start)} – ${fmtDMY(end)}`);
  showDeletePlansStep('choice');
  document.getElementById('deleteAllPlansHint').textContent = L('Đang tải...', 'Loading...');
  openModal('deletePlansModal');
  try {
    const sch = await apiRequest(`/api/schedule?start=${start}&end=${end}`);
    deletePlansTasks = sch.days.flatMap(d => d.tasks.map(t => ({ ...t, date: t.date || d.date })));
  } catch (err) {
    deletePlansTasks = [];
    showToast(err.message, 'error');
  }
  const n = deletePlansTasks.length;
  document.getElementById('deleteAllPlansHint').textContent = n
    ? L(`Xóa ${n} kế hoạch đã lập trong tuần này.`, `Delete all ${n} plans made for this week.`)
    : L('Tuần này chưa có kế hoạch nào.', 'There are no plans this week.');
  document.getElementById('btnDeleteAllPlans').disabled = !n;
  document.getElementById('btnDeleteSomePlans').disabled = !n;
}

function showDeletePlansStep(step) {
  document.getElementById('deletePlansChoice').hidden = step !== 'choice';
  document.getElementById('deletePlansPicker').hidden = step !== 'picker';
}

function renderDeletePlansList() {
  const box = document.getElementById('deletePlansList');
  const byDate = {};
  for (const t of deletePlansTasks) (byDate[t.date] = byDate[t.date] || []).push(t);
  const dates = Object.keys(byDate).sort();
  box.innerHTML = dates.length ? dates.map(date => {
    const dayName = DAY_LONG[dayKeyOf(date)];
    const items = byDate[date].sort((a, b) => (a.start_time || '99').localeCompare(b.start_time || '99'));
    return `<div class="delete-plan-day">${dayName} · ${fmtDM(date)}</div>` + items.map(t => `
      <label class="delete-plan-item ${t.status === 'completed' ? 'done' : ''}">
        <input type="checkbox" value="${escapeHTML(t.id)}" />
        <span class="dp-title">${escapeHTML(t.title)}</span>
        <span class="dp-meta">${t.start_time ? `${t.start_time}${t.end_time ? '–' + t.end_time : ''}` : L('Cả ngày', 'All day')}</span>
      </label>`).join('');
  }).join('') : `<p class="muted-text delete-plans-empty">${L('Tuần này chưa có kế hoạch nào.', 'There are no plans this week.')}</p>`;
  box.querySelectorAll('input[type=checkbox]').forEach(c => c.addEventListener('change', updateDeletePlansCount));
  document.getElementById('deletePlansSelectAll').checked = false;
  updateDeletePlansCount();
}

function selectedDeletePlanIds() {
  return [...document.querySelectorAll('#deletePlansList input[type=checkbox]:checked')].map(c => c.value);
}

function updateDeletePlansCount() {
  const n = selectedDeletePlanIds().length;
  const total = deletePlansTasks.length;
  document.getElementById('deletePlansCount').textContent = L(`Đã chọn ${n}/${total}`, `${n}/${total} selected`);
  document.getElementById('deletePlansSelectAll').checked = total > 0 && n === total;
  const btn = document.getElementById('btnDeleteSelectedPlans');
  btn.disabled = !n;
  btn.textContent = n ? L(`Xóa ${n} mục đã chọn`, `Delete ${n} selected`) : L('Xóa mục đã chọn', 'Delete selected');
}

async function deletePlans(ids) {
  if (!ids.length) return;
  try {
    const res = await apiRequest('/api/tasks/bulk-delete', { method: 'POST', body: JSON.stringify({ ids }) });
    closeModal('deletePlansModal');
    showToast(L(`Đã xóa ${res.deleted} kế hoạch.`, `Deleted ${res.deleted} plans.`), 'success');
    loadRoutine();
  } catch (err) { showToast(err.message, 'error'); }
}

function bindDeletePlansUI() {
  document.getElementById('btnDeletePlans').addEventListener('click', openDeletePlansModal);
  document.getElementById('btnDeleteAllPlans').addEventListener('click', () => {
    const n = deletePlansTasks.length;
    if (!n) return;
    if (!confirm(L(`Xóa tất cả ${n} kế hoạch trong tuần này? Không thể hoàn tác.`, `Delete all ${n} plans this week? This cannot be undone.`))) return;
    deletePlans(deletePlansTasks.map(t => t.id));
  });
  document.getElementById('btnDeleteSomePlans').addEventListener('click', () => {
    renderDeletePlansList();
    showDeletePlansStep('picker');
  });
  document.getElementById('btnDeletePlansBack').addEventListener('click', () => showDeletePlansStep('choice'));
  document.getElementById('deletePlansSelectAll').addEventListener('change', e => {
    document.querySelectorAll('#deletePlansList input[type=checkbox]').forEach(c => { c.checked = e.target.checked; });
    updateDeletePlansCount();
  });
  document.getElementById('btnDeleteSelectedPlans').addEventListener('click', () => {
    const ids = selectedDeletePlanIds();
    if (!ids.length) return;
    if (!confirm(L(`Xóa ${ids.length} kế hoạch đã chọn? Không thể hoàn tác.`, `Delete ${ids.length} selected plans? This cannot be undone.`))) return;
    deletePlans(ids);
  });
}

function openBlockModal(block = null) {
  document.getElementById('blockModalTitle').textContent = block ? L('Sửa khung giờ', 'Edit block') : L('Thêm khung giờ', 'Add block');
  document.getElementById('blockIdInput').value = block ? block.id : '';
  document.getElementById('blockType').value = block ? block.block_type : 'study';
  document.getElementById('blockLabel').value = block ? (block.label || '') : '';
  document.getElementById('blockStart').value = block ? block.start_time : '19:30';
  document.getElementById('blockEnd').value = block ? block.end_time : '21:00';
  renderDayPicker(document.getElementById('blockDayPicker'), block ? block.days.split(',') : DAY_KEYS_UI.slice(0, 5));
  openModal('blockModal');
}

// ================================================================ MỤC TIÊU & TIẾN ĐỘ
let goalOptionsPromise = null;

/** Nạp danh sách mục tiêu cho ô "Thuộc mục tiêu" trong form công việc. */
function refreshGoalOptions(force = false) {
  if (!goalOptionsPromise || force) {
    goalOptionsPromise = apiRequest('/api/goals').then(res => {
      AppState.goals = res.goals || [];
      const sel = document.getElementById('taskGoal');
      const keep = sel.value;
      sel.innerHTML = `<option value="">${L('— Không thuộc mục tiêu nào —', '— No goal —')}</option>` +
        AppState.goals.filter(g => g.status !== 'done').map(g => `<option value="${g.id}">${escapeHTML(g.title)}</option>`).join('');
      sel.value = keep;
    }).catch(() => {});
  }
  return goalOptionsPromise;
}

function forecastHTML(g) {
  const p = g.progress;
  const f = p.forecast;
  if (f.basis === 'done') return `<div class="forecast good">🎉 ${L('Đã hoàn thành khối lượng dự kiến', 'Planned work completed')}${f.projected_date ? ` (${fmtDM(f.projected_date)})` : ''}</div>`;
  if (!f.projected_date) return `<div class="forecast neutral">🔮 ${L('Chưa đủ dữ liệu để dự báo. Hoàn thành vài việc hoặc ghi tiến độ để có dự báo.', 'Not enough data to forecast yet.')}</div>`;
  let cls = 'neutral';
  let rel = '';
  if (f.days_vs_deadline !== null) {
    if (f.days_vs_deadline > 0) { cls = 'good'; rel = L(` — sớm ${f.days_vs_deadline} ngày so với hạn`, ` — ${f.days_vs_deadline} days early`); }
    else if (f.days_vs_deadline === 0) { cls = 'good'; rel = L(' — đúng hạn', ' — on time'); }
    else { cls = 'bad'; rel = L(` — trễ ${-f.days_vs_deadline} ngày so với hạn`, ` — ${-f.days_vs_deadline} days late`); }
  }
  const basis = f.basis === 'pace'
    ? L(`theo nhịp thực tế ~${p.pace_minutes_per_day} phút/ngày trong 14 ngày qua`, `based on ~${p.pace_minutes_per_day} min/day over 14 days`)
    : L('theo các việc đã xếp lịch', 'based on scheduled tasks');
  return `<div class="forecast ${cls}">🔮 ${L('Dự kiến xong', 'Projected finish')}: <strong>${fmtDMY(f.projected_date)}</strong>${rel}<small> (${basis})</small></div>`;
}

function feasibilityHTML(g) {
  const fz = g.progress.feasibility;
  if (!fz || fz.level === 'ok' || !fz.message) return '';
  const icon = { infeasible: '⛔', overdue: '⏰', behind: '🐢', needs_scheduling: '📅' }[fz.level] || '⚠️';
  return `<div class="feasibility lvl-${fz.level}">${icon} ${escapeHTML(fz.message)}</div>`;
}

function goalCardHTML(g, tasks) {
  const p = g.progress;
  const left = g.deadline ? daysUntil(g.deadline) : null;
  const goalTasks = tasks.filter(t => t.goal_id === g.id).sort((a, b) => (a.date + (a.start_time || '')).localeCompare(b.date + (b.start_time || '')));
  return `
    <div class="card goal-card status-${g.status}">
      <div class="goal-head">
        <div>
          <h3>${escapeHTML(g.title)}</h3>
          <div class="goal-meta">
            <span class="priority-${g.priority}">${L('Ưu tiên', 'Priority')}: ${PRIORITY_VI[g.priority] || g.priority}</span>
            ${g.deadline ? `<span>⏳ ${L('Hạn', 'Due')} ${fmtDMY(g.deadline)} ${left !== null ? (left >= 0 ? L(`(còn ${left} ngày)`, `(${left} days left)`) : L(`(quá ${-left} ngày)`, `(${-left} days over)`)) : ''}</span>` : `<span>${L('Chưa đặt hạn', 'No deadline')}</span>`}
            ${g.status !== 'active' ? `<span class="badge">${g.status === 'done' ? L('Đã xong', 'Done') : L('Tạm dừng', 'Paused')}</span>` : ''}
          </div>
        </div>
        <div class="goal-percent">${p.percent}%</div>
      </div>

      <div class="goal-bar" role="progressbar" aria-valuenow="${p.percent}" aria-valuemin="0" aria-valuemax="100">
        <div class="goal-bar-fill" style="width:${p.percent}%"></div>
        ${p.milestones.filter(m => m.percent < 100).map(m => `<span class="goal-tick ${m.reached_on ? 'reached' : ''}" style="left:${m.percent}%"></span>`).join('')}
      </div>
      <div class="milestones">
        ${p.milestones.map(m => `<span class="milestone ${m.reached_on ? 'reached' : ''}">${m.reached_on ? '🏁' : '○'} ${m.percent}%${m.reached_on ? ' · ' + fmtDM(m.reached_on) : ''}</span>`).join('')}
      </div>

      <div class="goal-stats">
        <div><b>${hoursText(p.done_minutes)}</b><span>/ ${hoursText(p.planned_minutes)} ${L('đã làm', 'done')}</span></div>
        <div><b>${p.tasks_done}/${p.tasks_total}</b><span>${L('việc hoàn thành', 'tasks done')}</span></div>
        <div><b>${hoursText(p.extra_minutes)}</b><span>${L('làm thêm ngoài lịch', 'extra beyond plan')}</span></div>
        <div><b>${hoursText(p.scheduled_minutes_ahead)}</b><span>${L('đã xếp lịch phía trước', 'scheduled ahead')}</span></div>
      </div>

      ${forecastHTML(g)}
      ${feasibilityHTML(g)}

      <div class="btn-row goal-actions">
        <button type="button" class="btn btn-primary small" data-goal-progress="${g.id}">+ ${L('Ghi thêm tiến độ', 'Log extra work')}</button>
        <button type="button" class="btn btn-accent small" data-goal-ai="${g.id}">✨ ${L('AI chia nhỏ & xếp lịch', 'AI breakdown')}</button>
        <button type="button" class="btn btn-secondary small" data-goal-behind="${g.id}">🐢 ${L('Mình đang bị trễ', "I'm behind")}</button>
        <button type="button" class="btn btn-secondary small" data-goal-edit="${g.id}">✎ ${L('Sửa', 'Edit')}</button>
        <button type="button" class="btn-icon small danger" data-goal-del="${g.id}" title="${L('Xoá mục tiêu', 'Delete goal')}">✕</button>
      </div>

      <details class="goal-tasks" ${goalTasks.length && goalTasks.length <= 6 ? 'open' : ''}>
        <summary>${L('Các việc của mục tiêu', 'Goal tasks')} (${goalTasks.length})</summary>
        ${goalTasks.length ? goalTasks.map(t => `
          <div class="sched-item task ${t.status === 'completed' ? 'done' : ''}">
            <input type="checkbox" class="task-checkbox" ${t.status === 'completed' ? 'checked' : ''} data-toggle-task="${t.id}" />
            <button type="button" class="sched-body" data-edit-task="${t.id}">
              <span class="sched-time">${fmtDM(t.date)} ${t.start_time || ''}</span>
              <span class="sched-title">${escapeHTML(t.title)}</span>
              <span class="sched-badges">${t.duration_minutes ? `⏱ ${t.duration_minutes}′` : ''} ${t.deadline ? `⏳ ${fmtDM(t.deadline)}` : ''} <span class="priority-${t.priority}">${PRIORITY_VI[t.priority] || ''}</span></span>
            </button>
          </div>`).join('') : `<p class="muted-text">${L('Chưa có việc nào. Bấm "AI chia nhỏ & xếp lịch".', 'No tasks yet.')}</p>`}
      </details>
    </div>`;
}

async function loadGoals() {
  const list = document.getElementById('goalsList');
  list.innerHTML = `<div class="card cal-loading">⌛ ${L('Đang tải mục tiêu...', 'Loading goals...')}</div>`;
  try {
    const [res, tasksRes] = await Promise.all([apiRequest('/api/goals'), apiRequest('/api/tasks')]);
    const goals = res.goals || [];
    AppState.goals = goals;
    AppState.tasks = tasksRes.tasks || AppState.tasks;
    const active = goals.filter(g => g.status === 'active');
    const avg = active.length ? Math.round(active.reduce((s, g) => s + g.progress.percent, 0) / active.length) : 0;
    const alerts = active.filter(g => g.progress.feasibility.level !== 'ok').length;
    const extra = goals.reduce((s, g) => s + g.progress.extra_minutes, 0);
    document.getElementById('goalsSummary').innerHTML = `
      <div class="summary-tile"><b>${active.length}</b><span>${L('mục tiêu đang làm', 'active goals')}</span></div>
      <div class="summary-tile"><b>${avg}%</b><span>${L('hoàn thành trung bình', 'average progress')}</span></div>
      <div class="summary-tile ${alerts ? 'warn' : ''}"><b>${alerts}</b><span>${L('cần chú ý', 'need attention')}</span></div>
      <div class="summary-tile"><b>${hoursText(extra)}</b><span>${L('đã làm thêm ngoài lịch', 'extra work logged')}</span></div>`;
    list.innerHTML = goals.length ? goals.map(g => goalCardHTML(g, AppState.tasks)).join('')
      : `<div class="card"><p class="muted-text">${L('Chưa có mục tiêu nào. Tạo một mục tiêu lớn (VD: "Ôn thi IELTS 6.5 trong 2 tháng"), AI sẽ chia nhỏ thành các việc cụ thể.', 'No goals yet.')}</p></div>`;

    list.querySelectorAll('[data-goal-progress]').forEach(b => b.addEventListener('click', () => openProgressModal(b.dataset.goalProgress)));
    list.querySelectorAll('[data-goal-edit]').forEach(b => b.addEventListener('click', () => openGoalModal(goals.find(g => g.id === b.dataset.goalEdit))));
    list.querySelectorAll('[data-goal-ai]').forEach(b => b.addEventListener('click', () => {
      const g = goals.find(x => x.id === b.dataset.goalAi);
      sendAiMessage(L(
        `Hãy chia nhỏ mục tiêu "${g.title}" (id: ${g.id}${g.deadline ? `, hạn ${g.deadline}` : ''}) thành các công việc cụ thể có thời lượng, mức ưu tiên và hạn, rồi xếp vào thời gian trống. Giữ lại các việc đã có.`,
        `Break the goal "${g.title}" (id: ${g.id}${g.deadline ? `, deadline ${g.deadline}` : ''}) into concrete tasks with duration, priority and deadline, then schedule them in free time. Keep existing tasks.`
      ), { intent: 'goal_breakdown' });
    }));
    list.querySelectorAll('[data-goal-behind]').forEach(b => b.addEventListener('click', () => {
      const g = goals.find(x => x.id === b.dataset.goalBehind);
      sendAiMessage(L(
        `Mình đang bị trễ tiến độ mục tiêu "${g.title}" (id: ${g.id}). Hãy điều chỉnh phần còn lại cho hợp lý mà không cần tạo lại toàn bộ lịch.`,
        `I'm behind on the goal "${g.title}" (id: ${g.id}). Please adjust the remaining work sensibly without rebuilding the whole schedule.`
      ), { intent: 'behind_schedule' });
    }));
    list.querySelectorAll('[data-goal-del]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm(L('Xoá mục tiêu này? Các công việc vẫn được giữ lại trong lịch.', 'Delete this goal? Its tasks stay in your planner.'))) return;
      try {
        await apiRequest(`/api/goals/${b.dataset.goalDel}`, { method: 'DELETE' });
        refreshGoalOptions(true);
        loadGoals();
      } catch (err) { showToast(err.message, 'error'); }
    }));
    bindScheduleItemEvents(list, AppState.tasks);
    renderProgressLogs(res.recentLogs || [], goals);
  } catch (err) {
    list.innerHTML = `<div class="card cal-error">⚠️ ${escapeHTML(err.message)}</div>`;
  }
}

function renderProgressLogs(logs, goals) {
  const box = document.getElementById('progressLogList');
  if (!logs.length) { box.innerHTML = `<p class="muted-text">${L('Chưa có ghi nhận nào.', 'Nothing logged yet.')}</p>`; return; }
  box.innerHTML = logs.map(l => {
    const g = goals.find(x => x.id === l.goal_id);
    return `
      <div class="log-row">
        <span class="log-date">${fmtDM(l.log_date)}</span>
        <span class="log-kind ${l.kind}">${l.kind === 'extra' ? L('Làm thêm', 'Extra') : L('Hoàn thành', 'Done')}</span>
        <span class="log-text">${escapeHTML(l.note || '')}${g ? ` <span class="muted-text">· 🎯 ${escapeHTML(g.title)}</span>` : ''}</span>
        <strong>${l.minutes}′</strong>
        ${l.kind === 'extra' ? `<button type="button" class="btn-icon small danger" data-del-log="${l.id}" title="${L('Xoá', 'Delete')}">✕</button>` : '<span></span>'}
      </div>`;
  }).join('');
  box.querySelectorAll('[data-del-log]').forEach(b => b.addEventListener('click', async () => {
    try {
      await apiRequest(`/api/progress/${b.dataset.delLog}`, { method: 'DELETE' });
      loadGoals();
    } catch (err) { showToast(err.message, 'error'); }
  }));
}

function openGoalModal(goal = null) {
  document.getElementById('goalModalTitle').textContent = goal ? L('Sửa mục tiêu', 'Edit goal') : L('Mục tiêu mới', 'New goal');
  document.getElementById('goalIdInput').value = goal ? goal.id : '';
  document.getElementById('goalTitle').value = goal ? goal.title : '';
  document.getElementById('goalDesc').value = goal ? (goal.description || '') : '';
  document.getElementById('goalDeadline').value = goal ? (goal.deadline || '') : '';
  document.getElementById('goalHours').value = goal && goal.estimated_minutes ? Math.round((goal.estimated_minutes / 60) * 10) / 10 : '';
  document.getElementById('goalPriority').value = goal ? goal.priority : 'medium';
  document.getElementById('goalStatus').value = goal ? goal.status : 'active';
  document.getElementById('goalStatusGroup').style.display = goal ? '' : 'none';
  document.getElementById('goalAiRow').style.display = goal ? 'none' : '';
  openModal('goalModal');
}

function openProgressModal(goalId) {
  document.getElementById('progressGoalId').value = goalId;
  document.getElementById('progressMinutes').value = 30;
  document.getElementById('progressDate').value = todayLocal();
  document.getElementById('progressNote').value = '';
  openModal('progressModal');
}

// Dashboard: cảnh báo tính khả thi + tiến độ các mục tiêu đang làm
async function loadGoalAlerts() {
  const box = document.getElementById('dashGoalAlerts');
  if (!box) return;
  try {
    const res = await apiRequest('/api/goals');
    AppState.goals = res.goals || [];
    const active = AppState.goals.filter(g => g.status === 'active');
    if (!active.length) { box.innerHTML = ''; return; }
    const alerts = active.filter(g => g.progress.feasibility.level !== 'ok');
    box.innerHTML = `
      <div class="card goal-alert-card ${alerts.length ? 'has-alert' : ''}">
        <div class="section-head">
          <h4>🎯 ${L('Tiến độ mục tiêu', 'Goal progress')}</h4>
          <button type="button" class="btn btn-secondary small" id="dashOpenGoals">${L('Xem chi tiết →', 'Details →')}</button>
        </div>
        ${active.slice(0, 3).map(g => `
          <div class="mini-goal">
            <span>${escapeHTML(g.title)}</span>
            <div class="goal-bar small"><div class="goal-bar-fill" style="width:${g.progress.percent}%"></div></div>
            <strong>${g.progress.percent}%</strong>
          </div>`).join('')}
        ${alerts.map(g => `<div class="feasibility lvl-${g.progress.feasibility.level}">⚠️ <strong>${escapeHTML(g.title)}:</strong> ${escapeHTML(g.progress.feasibility.message)} <button type="button" class="link-btn" data-fix-goal="${g.id}">${L('Nhờ AI xử lý', 'Ask AI')}</button></div>`).join('')}
      </div>`;
    document.getElementById('dashOpenGoals').addEventListener('click', () => navigateToView('goals'));
    box.querySelectorAll('[data-fix-goal]').forEach(b => b.addEventListener('click', () => {
      const g = active.find(x => x.id === b.dataset.fixGoal);
      sendAiMessage(L(
        `Mục tiêu "${g.title}" (id: ${g.id}) đang có cảnh báo: ${g.progress.feasibility.message} Hãy giúp mình điều chỉnh cho khả thi.`,
        `The goal "${g.title}" (id: ${g.id}) has a warning: ${g.progress.feasibility.message} Please help me make it feasible.`
      ), { intent: 'behind_schedule' });
    }));
    notifyFeasibilityOncePerDay(alerts);
  } catch (e) {
    box.innerHTML = '';
  }
}

// ================================================================ GIÁN ĐOẠN
async function openDisruptionModal(date) {
  document.getElementById('disDate').value = date || AppState.calendarAnchor || todayLocal();
  document.getElementById('disKind').value = 'incident';
  document.getElementById('disAllDay').checked = false;
  document.getElementById('disTimeRow').style.display = '';
  const now = new Date();
  document.getElementById('disStart').value = minToHM(Math.min(now.getHours() * 60, 22 * 60));
  document.getElementById('disEnd').value = minToHM(Math.min(now.getHours() * 60 + 120, 23 * 60 + 59));
  document.getElementById('disNote').value = '';
  openModal('disruptionModal');
  const box = document.getElementById('disUpcomingList');
  box.innerHTML = '';
  try {
    const res = await apiRequest(`/api/disruptions?start=${todayLocal()}`);
    const list = res.disruptions || [];
    if (list.length) {
      box.innerHTML = `<div class="muted-text" style="margin-bottom:6px;">${L('Gián đoạn sắp tới:', 'Upcoming disruptions:')}</div>` + list.map(x => `
        <div class="sched-item disruption">
          <span class="sched-time">${fmtDM(x.date)} ${x.start_time ? `${x.start_time}–${x.end_time}` : L('cả ngày', 'all day')}</span>
          <span class="sched-title">${DISRUPTION_META[x.kind]?.icon} ${DISRUPTION_META[x.kind]?.label}${x.note ? ': ' + escapeHTML(x.note) : ''}</span>
          <button type="button" class="btn-icon small" data-del-disruption="${x.id}" title="${L('Xoá', 'Remove')}">✕</button>
        </div>`).join('');
      box.querySelectorAll('[data-del-disruption]').forEach(b => b.addEventListener('click', async () => {
        await deleteDisruption(b.dataset.delDisruption);
        b.closest('.sched-item').remove();
      }));
    }
  } catch (e) {}
}

async function deleteDisruption(id) {
  try {
    await apiRequest(`/api/disruptions/${id}`, { method: 'DELETE' });
    showToast(L('Đã xoá gián đoạn.', 'Disruption removed.'));
    if (AppState.activeView === 'planner') renderCalendar();
    if (AppState.activeView === 'routine') loadRoutine();
  } catch (err) { showToast(err.message, 'error'); }
}

// ================================================================ TÂM LÝ NỀN
function loadPsychForm() {
  let p = {};
  try { p = JSON.parse((AppState.user && AppState.user.psych_profile) || '{}') || {}; } catch (e) {}
  document.getElementById('psyWillpower').value = String(p.willpower || 3);
  document.getElementById('psyStress').value = String(p.stress_tolerance || 3);
  if (p.motivation_source) document.getElementById('psyMotivation').value = p.motivation_source;
  document.getElementById('psyFocusTime').value = p.best_focus_time || 'morning';
  document.getElementById('psyFocusMinutes').value = p.max_focus_minutes || 45;
  document.getElementById('psyNotes').value = p.notes || '';
}

// ================================================================ CHECK-IN TRẠNG THÁI MỖI NGÀY
function maybePromptDailyCheckin(doneToday) {
  if (doneToday) return;
  const key = 'lifecare_checkin_prompted';
  if (localStorage.getItem(key) === todayLocal()) return; // mỗi ngày chỉ tự hỏi một lần
  localStorage.setItem(key, todayLocal());
  setTimeout(() => {
    if (!document.querySelector('.modal-overlay.active')) openModal('rapidCheckinModal');
  }, 900);
}

// ================================================================ NHẮC VIỆC
const Reminders = {
  tasks: [],
  timer: null,
  state: null // { date, entries: { taskId: { last, snoozeUntil } } }
};

function reminderState() {
  if (!Reminders.state || Reminders.state.date !== todayLocal()) {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem('lifecare_reminders') || 'null'); } catch (e) {}
    Reminders.state = saved && saved.date === todayLocal() ? saved : { date: todayLocal(), entries: {} };
  }
  return Reminders.state;
}
const saveReminderState = () => localStorage.setItem('lifecare_reminders', JSON.stringify(Reminders.state));

async function loadReminderSettings() {
  try {
    const res = await apiRequest('/api/user/settings');
    AppState.settings = res.settings;
  } catch (e) {}
}

async function refreshReminderTasks() {
  try {
    const res = await apiRequest(`/api/tasks?date=${todayLocal()}`);
    Reminders.tasks = res.tasks || [];
    checkReminders();
  } catch (e) {}
}

function inQuietHours(s) {
  if (!s || !s.quiet_hours_start || !s.quiet_hours_end) return false;
  const now = nowHM();
  const a = s.quiet_hours_start, b = s.quiet_hours_end;
  return a <= b ? now >= a && now < b : now >= a || now < b;
}

function checkReminders() {
  const s = AppState.settings || {};
  if (s.remind_tasks === 0 || inQuietHours(s)) return;
  const repeatMs = (s.remind_repeat_minutes || 15) * 60000;
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const st = reminderState();
  for (const t of Reminders.tasks) {
    if (t.status === 'completed' || !t.start_time || t.date !== todayLocal()) continue;
    const start = hmToMin(t.start_time);
    const end = t.end_time ? hmToMin(t.end_time) : start + (t.duration_minutes || 30);
    if (nowMin < start || nowMin > end + 60) continue; // chỉ nhắc từ lúc bắt đầu tới 1 giờ sau khi kết thúc
    const e = st.entries[t.id] || (st.entries[t.id] = {});
    if (e.snoozeUntil && Date.now() < e.snoozeUntil) continue;
    if (e.last && Date.now() - e.last < repeatMs) continue;
    e.last = Date.now();
    saveReminderState();
    showTaskReminder(t, nowMin > end);
  }
}

function showTaskReminder(t, overdue) {
  const stack = document.getElementById('reminderStack');
  const repeat = (AppState.settings && AppState.settings.remind_repeat_minutes) || 15;
  stack.querySelector(`[data-reminder="${t.id}"]`)?.remove();
  const title = overdue ? L('Đã qua giờ, bạn làm xong chưa?', 'Time is up — done yet?') : L('Đến giờ thực hiện', "It's time");
  const card = document.createElement('div');
  card.className = `reminder-card ${overdue ? 'overdue' : ''}`;
  card.dataset.reminder = t.id;
  card.innerHTML = `
    <div class="reminder-title">⏰ ${title}</div>
    <div class="reminder-task">${escapeHTML(t.title)} <span class="muted-text">${t.start_time}${t.end_time ? '–' + t.end_time : ''}</span></div>
    <div class="btn-row">
      <button type="button" class="btn btn-primary small" data-r="done">✓ ${L('Đã xong', 'Done')}</button>
      <button type="button" class="btn btn-secondary small" data-r="snooze">${L(`Nhắc lại sau ${repeat}′`, `Remind in ${repeat}′`)}</button>
      <button type="button" class="btn-icon small" data-r="close" title="${L('Đóng', 'Close')}">✕</button>
    </div>`;
  card.querySelector('[data-r="done"]').addEventListener('click', () => { toggleTaskStatus(t.id, true); card.remove(); });
  card.querySelector('[data-r="snooze"]').addEventListener('click', () => {
    const st = reminderState();
    st.entries[t.id] = { ...(st.entries[t.id] || {}), snoozeUntil: Date.now() + repeat * 60000, last: Date.now() };
    saveReminderState();
    card.remove();
  });
  card.querySelector('[data-r="close"]').addEventListener('click', () => card.remove());
  stack.prepend(card);
  while (stack.children.length > 3) stack.lastChild.remove();
  browserNotify(`⏰ ${title}`, `${t.title} (${t.start_time}${t.end_time ? '–' + t.end_time : ''})`, `task-${t.id}`);
}

function notifyFeasibilityOncePerDay(alerts) {
  const s = AppState.settings || {};
  if (!alerts.length || s.remind_overdue === 0) return;
  const key = 'lifecare_feasibility_notified';
  if (localStorage.getItem(key) === todayLocal()) return;
  localStorage.setItem(key, todayLocal());
  const g = alerts[0];
  browserNotify(L('⚠️ Mục tiêu có nguy cơ không kịp', '⚠️ Goal at risk'), `${g.title}: ${g.progress.feasibility.message}`, 'feasibility');
}

async function browserNotify(title, body, tag) {
  if (!('Notification' in window) || Notification.permission !== 'granted' || !document.hidden) return;
  const opts = { body, tag, icon: '/icons/icon-192.svg' };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) return reg.showNotification(title, opts);
  } catch (e) {}
  try { new Notification(title, opts); } catch (e) {}
}

function updateNotifPermissionText() {
  const el = document.getElementById('notifPermissionText');
  const btn = document.getElementById('btnEnableBrowserNotif');
  if (!el) return;
  if (!('Notification' in window)) {
    el.textContent = L('Trình duyệt này không hỗ trợ thông báo. Nhắc nhở vẫn hiện trong ứng dụng.', 'Notifications not supported; reminders still show in the app.');
    btn.style.display = 'none';
  } else if (Notification.permission === 'granted') {
    el.textContent = L('✅ Đã bật thông báo trình duyệt (hiện khi bạn đang ở tab khác).', '✅ Browser notifications on.');
    btn.style.display = 'none';
  } else if (Notification.permission === 'denied') {
    el.textContent = L('Bạn đã chặn thông báo. Mở cài đặt trang web của trình duyệt để cho phép lại.', 'Notifications blocked in browser settings.');
    btn.style.display = 'none';
  } else {
    el.textContent = L('Thông báo trình duyệt đang tắt. Nhắc nhở chỉ hiện trong ứng dụng.', 'Browser notifications off.');
    btn.style.display = '';
  }
}

function startReminderEngine() {
  if (Reminders.timer) return;
  Reminders.timer = setInterval(checkReminders, 30000);
  setInterval(refreshReminderTasks, 5 * 60000); // lấy lại danh sách việc hôm nay định kỳ
}

function afterLoginInit() {
  loadReminderSettings().then(refreshReminderTasks);
  refreshGoalOptions(true);
}

// ================================================================ GẮN SỰ KIỆN
function bindPlanningUI() {
  // Đóng modal bằng nút ✕
  document.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => closeModal(b.dataset.closeModal)));

  // Kế hoạch: điều hướng
  document.getElementById('calPrevBtn').addEventListener('click', () => shiftCalendar(-1));
  document.getElementById('calNextBtn').addEventListener('click', () => shiftCalendar(1));
  document.getElementById('calTodayBtn').addEventListener('click', () => { AppState.calendarAnchor = todayLocal(); renderCalendar(); });
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (AppState.activeView === 'planner' && AppState.calendarView === 'month') renderCalendar(); }, 250);
  });

  // Gián đoạn
  document.getElementById('btnOpenDisruption').addEventListener('click', () => openDisruptionModal());
  document.getElementById('btnDashDisruption')?.addEventListener('click', () => openDisruptionModal(todayLocal()));
  document.getElementById('disAllDay').addEventListener('change', e => {
    document.getElementById('disTimeRow').style.display = e.target.checked ? 'none' : '';
  });
  document.getElementById('disruptionForm').addEventListener('submit', async e => {
    e.preventDefault();
    const allDay = document.getElementById('disAllDay').checked;
    const body = {
      kind: document.getElementById('disKind').value,
      date: document.getElementById('disDate').value,
      start_time: allDay ? null : document.getElementById('disStart').value,
      end_time: allDay ? null : document.getElementById('disEnd').value,
      note: document.getElementById('disNote').value.trim()
    };
    try {
      const res = await apiRequest('/api/disruptions', { method: 'POST', body: JSON.stringify(body) });
      closeModal('disruptionModal');
      const affected = res.affectedTasks || [];
      showToast(L(`Đã ghi gián đoạn. ${affected.length} việc bị ảnh hưởng.`, `Saved. ${affected.length} tasks affected.`));
      if (AppState.activeView === 'planner') renderCalendar();
      if (AppState.activeView === 'routine') loadRoutine();
      if (document.getElementById('disAiReplan').checked && (affected.length || body.kind === 'new_work')) {
        const when = allDay ? L('cả ngày', 'all day') : `${body.start_time}–${body.end_time}`;
        const affectedList = affected.map(t => `"${t.title}" (id ${t.id})`).join(', ');
        sendAiMessage(L(
          `Mình vừa khai báo gián đoạn: ${DISRUPTION_META[body.kind].label} ngày ${fmtDMY(body.date)} (${when})${body.note ? '. ' + body.note : ''}. ` +
          (affected.length ? `Các việc bị ảnh hưởng: ${affectedList}. ` : '') +
          'Hãy xếp lại giúp mình theo mức ưu tiên và hạn chót.',
          `I just reported a disruption: ${DISRUPTION_META[body.kind].label} on ${fmtDMY(body.date)} (${when})${body.note ? '. ' + body.note : ''}. ` +
          (affected.length ? `Affected tasks: ${affectedList}. ` : '') +
          'Please re-plan them by priority and deadline.'
        ), { intent: 'disruption' });
      }
    } catch (err) { showToast(err.message, 'error'); }
  });

  // Thời gian biểu
  bindDeletePlansUI();
  renderDayPicker(document.getElementById('templateDayPicker'));
  document.getElementById('btnAddBlock').addEventListener('click', () => openBlockModal());
  document.getElementById('routinePrevWeek').addEventListener('click', () => { AppState.routineAnchor = addDaysStr(AppState.routineAnchor, -7); loadRoutine(); });
  document.getElementById('routineNextWeek').addEventListener('click', () => { AppState.routineAnchor = addDaysStr(AppState.routineAnchor, 7); loadRoutine(); });
  document.getElementById('btnAiAllocate').addEventListener('click', () => {
    const start = AppState.routineAnchor || mondayOf(todayLocal());
    const from = start < todayLocal() ? todayLocal() : start;
    sendAiMessage(L(
      `Hãy phân bổ thời gian trống từ ${fmtDMY(from)} đến ${fmtDMY(addDaysStr(start, 6))} theo mục tiêu và thói quen của mình. Đừng lấp kín mọi khoảng trống.`,
      `Please fill my free time from ${fmtDMY(from)} to ${fmtDMY(addDaysStr(start, 6))} based on my goals and habits. Don't fill every gap.`
    ), { intent: 'allocate_free_time' });
  });
  document.getElementById('btnApplyTemplate').addEventListener('click', async () => {
    const days = pickedDays(document.getElementById('templateDayPicker'));
    if (!days.length) return showToast(L('Chọn ít nhất một ngày.', 'Pick at least one day.'), 'error');
    const replace = document.getElementById('routineTemplateReplace').checked;
    if (replace && !confirm(L('Thay toàn bộ thời gian biểu hiện tại bằng mẫu này?', 'Replace your current blocks with this template?'))) return;
    try {
      const res = await apiRequest('/api/routine/template', {
        method: 'POST',
        body: JSON.stringify({ template: document.getElementById('routineTemplateSelect').value, days, replace })
      });
      showToast(L(`Đã thêm ${res.created} khung giờ. Lịch sẽ tự lặp lại mỗi tuần.`, `${res.created} blocks added.`));
      loadRoutine();
    } catch (err) { showToast(err.message, 'error'); }
  });
  document.getElementById('blockForm').addEventListener('submit', async e => {
    e.preventDefault();
    const id = document.getElementById('blockIdInput').value;
    const body = {
      block_type: document.getElementById('blockType').value,
      label: document.getElementById('blockLabel').value.trim(),
      start_time: document.getElementById('blockStart').value,
      end_time: document.getElementById('blockEnd').value,
      days: pickedDays(document.getElementById('blockDayPicker'))
    };
    if (!body.days.length) return showToast(L('Chọn ít nhất một ngày.', 'Pick at least one day.'), 'error');
    try {
      await apiRequest(id ? `/api/routine/${id}` : '/api/routine', { method: id ? 'PUT' : 'POST', body: JSON.stringify(body) });
      closeModal('blockModal');
      loadRoutine();
    } catch (err) { showToast(err.message, 'error'); }
  });

  // Mục tiêu
  document.getElementById('btnNewGoal').addEventListener('click', () => openGoalModal());
  document.getElementById('goalForm').addEventListener('submit', async e => {
    e.preventDefault();
    const id = document.getElementById('goalIdInput').value;
    const hours = parseFloat(document.getElementById('goalHours').value);
    const body = {
      title: document.getElementById('goalTitle').value.trim(),
      description: document.getElementById('goalDesc').value.trim(),
      deadline: document.getElementById('goalDeadline').value || null,
      estimated_minutes: hours > 0 ? Math.round(hours * 60) : null,
      priority: document.getElementById('goalPriority').value
    };
    if (id) body.status = document.getElementById('goalStatus').value;
    try {
      const res = await apiRequest(id ? `/api/goals/${id}` : '/api/goals', { method: id ? 'PUT' : 'POST', body: JSON.stringify(body) });
      closeModal('goalModal');
      refreshGoalOptions(true);
      if (AppState.activeView === 'goals') loadGoals();
      if (!id && document.getElementById('goalAiBreakdown').checked) {
        const g = res.goal;
        sendAiMessage(L(
          `Mình vừa tạo mục tiêu "${g.title}" (id: ${g.id})${g.deadline ? `, hạn ${g.deadline}` : ''}${g.estimated_minutes ? `, ước tính ${Math.round(g.estimated_minutes / 60)} giờ` : ''}.` +
          `${g.description ? ' Chi tiết: ' + g.description + '.' : ''} Hãy chia nhỏ thành các công việc cụ thể (thời lượng, ưu tiên, hạn) và xếp vào thời gian trống.` +
          `${g.estimated_minutes ? '' : ' Ước lượng luôn tổng thời lượng và cập nhật cho mục tiêu.'}`,
          `I just created the goal "${g.title}" (id: ${g.id})${g.deadline ? `, deadline ${g.deadline}` : ''}${g.estimated_minutes ? `, estimated ${Math.round(g.estimated_minutes / 60)} hours` : ''}.` +
          `${g.description ? ' Details: ' + g.description + '.' : ''} Please break it into concrete tasks (duration, priority, deadline) and schedule them in free time.` +
          `${g.estimated_minutes ? '' : ' Also estimate the total time and update the goal.'}`
        ), { intent: 'goal_breakdown' });
      }
    } catch (err) { showToast(err.message, 'error'); }
  });
  document.getElementById('progressForm').addEventListener('submit', async e => {
    e.preventDefault();
    const goalId = document.getElementById('progressGoalId').value;
    try {
      const res = await apiRequest(`/api/goals/${goalId}/progress`, {
        method: 'POST',
        body: JSON.stringify({
          minutes: Number(document.getElementById('progressMinutes').value),
          date: document.getElementById('progressDate').value,
          note: document.getElementById('progressNote').value.trim()
        })
      });
      closeModal('progressModal');
      const p = res.goal.progress;
      showToast(L(`Đã ghi! Mục tiêu đạt ${p.percent}%.`, `Logged! Goal at ${p.percent}%.`));
      loadGoals();
    } catch (err) { showToast(err.message, 'error'); }
  });

  // Tâm lý nền
  document.getElementById('psychForm').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      const res = await apiRequest('/api/user/profile', {
        method: 'PUT',
        body: JSON.stringify({
          psych_profile: {
            willpower: Number(document.getElementById('psyWillpower').value),
            stress_tolerance: Number(document.getElementById('psyStress').value),
            motivation_source: document.getElementById('psyMotivation').value,
            best_focus_time: document.getElementById('psyFocusTime').value,
            max_focus_minutes: Number(document.getElementById('psyFocusMinutes').value),
            notes: document.getElementById('psyNotes').value.trim()
          }
        })
      });
      AppState.user = res.user;
      showToast(L('Đã lưu tâm lý nền.', 'Baseline saved.'));
    } catch (err) { showToast(err.message, 'error'); }
  });

  // Quyền thông báo trình duyệt
  document.getElementById('btnEnableBrowserNotif').addEventListener('click', async () => {
    if (!('Notification' in window)) return;
    await Notification.requestPermission();
    updateNotifPermissionText();
  });
}
