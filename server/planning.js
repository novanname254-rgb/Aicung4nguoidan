/**
 * Lõi lập lịch dùng chung cho API và trợ lý AI:
 * - Ngày giờ theo múi giờ người dùng.
 * - Thời gian biểu cố định (routine_blocks): thiết lập một lần, tự lặp theo thứ trong tuần.
 * - Tìm khoảng trống (trừ time block, công việc đã xếp, gián đoạn).
 * - Ghi nhận tiến độ (progress_logs), % hoàn thành, cột mốc, dự báo xong sớm/trễ, cảnh báo tính khả thi.
 */

const crypto = require('node:crypto');

const DEFAULT_TZ = process.env.APP_TIMEZONE || 'Asia/Ho_Chi_Minh';
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const BLOCK_TYPES = ['sleep', 'meal', 'school', 'extra_class', 'leisure', 'exercise', 'study'];
const BLOCK_LABELS = {
  sleep: 'Ngủ nghỉ', meal: 'Ăn uống', school: 'Đi học', extra_class: 'Học thêm',
  leisure: 'Giải trí', exercise: 'Tập luyện', study: 'Tự học'
};
const DISRUPTION_KINDS = ['incident', 'class_off', 'new_work', 'unavailable'];
const DISRUPTION_LABELS = {
  incident: 'Sự cố', class_off: 'Nghỉ học', new_work: 'Công việc phát sinh', unavailable: 'Không thể thực hiện'
};
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// ---------------------------------------------------------------- thời gian
function validTimezone(tz) {
  if (!tz || typeof tz !== 'string') return null;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return null;
  }
}

function localNow(tz = DEFAULT_TZ) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: validTimezone(tz) || DEFAULT_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'long'
    }).formatToParts(new Date()).map(p => [p.type, p.value])
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}`, weekday: parts.weekday, timezone: validTimezone(tz) || DEFAULT_TZ };
}

const isRealDate = s => {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z'); // tháng 13 / ngày 32 cho Invalid Date, toISOString() sẽ ném lỗi
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};
const isTime = s => typeof s === 'string' && TIME_RE.test(s);
const toMin = hm => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
const toHM = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const daysBetween = (a, b) => Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000);
const dayKey = dateStr => DAY_KEYS[new Date(dateStr + 'T00:00:00Z').getUTCDay()];

function parseDays(value) {
  const list = Array.isArray(value) ? value : String(value || '').split(',');
  const days = [...new Set(list.map(d => String(d).trim().toLowerCase()).filter(d => DAY_KEYS.includes(d)))];
  return DAY_KEYS.filter(d => days.includes(d)); // giữ thứ tự cố định
}

function taskMinutes(t) {
  if (t.duration_minutes) return Number(t.duration_minutes);
  if (isTime(t.start_time) && isTime(t.end_time) && t.end_time > t.start_time) return toMin(t.end_time) - toMin(t.start_time);
  return 30;
}

// ---------------------------------------------------------------- time block
/** Các khoảng [start, end) (phút) của time block trong ngày `date`. Block qua đêm (23:00-06:30) được tách đôi. */
function blocksForDate(blocks, date) {
  const today = dayKey(date);
  const yesterday = dayKey(addDays(date, -1));
  const out = [];
  for (const b of blocks) {
    const days = parseDays(b.days);
    const s = toMin(b.start_time);
    const e = toMin(b.end_time);
    if (e > s) {
      if (days.includes(today)) out.push({ ...b, start: s, end: e });
    } else {
      if (days.includes(today)) out.push({ ...b, start: s, end: 24 * 60 });
      if (days.includes(yesterday) && e > 0) out.push({ ...b, start: 0, end: e });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

function subtract(ranges, busy) {
  let free = ranges.map(r => ({ ...r }));
  for (const b of busy) {
    const next = [];
    for (const f of free) {
      if (b.end <= f.start || b.start >= f.end) next.push(f);
      else {
        if (b.start > f.start) next.push({ ...f, end: b.start });
        if (b.end < f.end) next.push({ ...f, start: b.end });
      }
    }
    free = next;
  }
  return free;
}

/**
 * Khoảng trống từ startDate đến endDate.
 * kind "free": ngoài mọi time block; kind "study_block": phần còn trống trong khung "Tự học".
 */
async function findFreeSlots(db, userId, startDate, endDate, { minMinutes = 30, tz, extraTasks = [], fallbackBlocks = [] } = {}) {
  const now = localNow(tz);
  let blocks = await db.prepare('SELECT * FROM routine_blocks WHERE user_id = ?').all(userId);
  if (!blocks.length) blocks = fallbackBlocks; // chưa có thời gian biểu: dùng giờ ngủ / giờ học từ phiếu thông tin
  const tasks = [
    ...await db.prepare('SELECT date, start_time, end_time FROM tasks WHERE user_id = ? AND date >= ? AND date <= ? AND start_time IS NOT NULL AND end_time IS NOT NULL').all(userId, startDate, endDate),
    ...extraTasks
  ];
  const disruptions = await db.prepare('SELECT * FROM disruptions WHERE user_id = ? AND date >= ? AND date <= ?').all(userId, startDate, endDate);
  const slots = [];
  for (let d = startDate, guard = 0; d <= endDate && guard < 92; d = addDays(d, 1), guard++) {
    const dayBlocks = blocksForDate(blocks, d);
    const busy = [
      ...tasks.filter(t => t.date === d && isTime(t.start_time) && isTime(t.end_time)).map(t => ({ start: toMin(t.start_time), end: toMin(t.end_time) })),
      ...disruptions.filter(x => x.date === d).map(x => (x.start_time && x.end_time ? { start: toMin(x.start_time), end: toMin(x.end_time) } : { start: 0, end: 1440 }))
    ];
    if (d === now.date) busy.push({ start: 0, end: toMin(now.time) }); // không xếp vào quá khứ
    if (d < now.date) continue;
    const outside = subtract([{ start: 0, end: 1440, kind: 'free' }], dayBlocks);
    const study = dayBlocks.filter(b => b.block_type === 'study').map(b => ({ start: b.start, end: b.end, kind: 'study_block' }));
    for (const f of subtract([...outside, ...study], busy)) {
      if (f.end - f.start >= minMinutes) {
        slots.push({ date: d, start: toHM(f.start), end: f.end === 1440 ? '24:00' : toHM(f.end), minutes: f.end - f.start, kind: f.kind });
      }
    }
  }
  return slots;
}

// ---------------------------------------------------------------- tiến độ
/** Ghi / gỡ tiến độ khi một công việc được đánh dấu xong / bỏ đánh dấu. */
async function syncTaskProgress(db, userId, task, tz) {
  await db.prepare("DELETE FROM progress_logs WHERE user_id = ? AND task_id = ? AND kind = 'task_done'").run(userId, task.id);
  if (task.status === 'completed') {
    await db.prepare(`INSERT INTO progress_logs (id, user_id, goal_id, task_id, log_date, minutes, kind, note, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'task_done', ?, ?)`)
      .run('log_' + crypto.randomUUID(), userId, task.goal_id || null, task.id, localNow(tz).date, taskMinutes(task), task.title, new Date().toISOString());
  }
}

async function addProgressLog(db, userId, { goal_id = null, task_id = null, minutes, note = '', log_date, kind = 'extra' }) {
  const id = 'log_' + crypto.randomUUID();
  await db.prepare(`INSERT INTO progress_logs (id, user_id, goal_id, task_id, log_date, minutes, kind, note, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, userId, goal_id, task_id, log_date, minutes, kind, note, new Date().toISOString());
  return id;
}

/** % hoàn thành, cột mốc, dự báo và mức khả thi của một mục tiêu. */
async function goalProgress(db, userId, goal, tz, lang = 'vi') {
  const T = (vi, en) => (lang === 'en' ? en : vi);
  const today = localNow(tz).date;
  const tasks = await db.prepare('SELECT * FROM tasks WHERE user_id = ? AND goal_id = ?').all(userId, goal.id);
  const logs = await db.prepare('SELECT log_date, minutes, kind FROM progress_logs WHERE user_id = ? AND goal_id = ? ORDER BY log_date ASC').all(userId, goal.id);

  const doneMinutes = logs.reduce((s, l) => s + Number(l.minutes || 0), 0);
  const extraMinutes = logs.filter(l => l.kind === 'extra').reduce((s, l) => s + Number(l.minutes || 0), 0);
  const taskTotal = tasks.reduce((s, t) => s + taskMinutes(t), 0);
  const planned = Math.max(Number(goal.estimated_minutes) || taskTotal || 0, 1);
  const pct = Math.min(100, Math.round((doneMinutes / planned) * 100));
  const remaining = Math.max(0, planned - doneMinutes);

  // Cột mốc 25/50/75/100%
  const milestones = [25, 50, 75, 100].map(p => ({ percent: p, reached_on: null }));
  let cumulative = 0;
  for (const l of logs) {
    cumulative += Number(l.minutes || 0);
    for (const m of milestones) if (!m.reached_on && cumulative >= (planned * m.percent) / 100) m.reached_on = l.log_date;
  }

  const scheduledAhead = tasks.filter(t => t.status !== 'completed' && t.date >= today)
    .sort((a, b) => (a.date + (a.start_time || '')).localeCompare(b.date + (b.start_time || '')));
  const scheduledMinutes = scheduledAhead.reduce((s, t) => s + taskMinutes(t), 0);

  // Dự báo: nhịp làm thực tế 14 ngày gần nhất; chưa có nhịp thì dựa vào lịch đã xếp.
  const since = addDays(today, -13);
  const startedOn = (goal.created_at || '').slice(0, 10) || since;
  const windowDays = Math.max(1, Math.min(14, daysBetween(startedOn > since ? startedOn : since, today) + 1));
  const recentMinutes = logs.filter(l => l.log_date >= since).reduce((s, l) => s + Number(l.minutes || 0), 0);
  const pacePerDay = recentMinutes / windowDays;

  let projectedDate = null;
  let basis = null;
  if (remaining === 0) {
    projectedDate = logs.length ? logs[logs.length - 1].log_date : today;
    basis = 'done';
  } else if (pacePerDay > 0) {
    projectedDate = addDays(today, Math.ceil(remaining / pacePerDay));
    basis = 'pace';
  } else if (scheduledMinutes >= remaining) {
    let acc = 0;
    for (const t of scheduledAhead) {
      acc += taskMinutes(t);
      if (acc >= remaining) { projectedDate = t.date; break; }
    }
    basis = 'schedule';
  }
  const daysVsDeadline = projectedDate && goal.deadline ? daysBetween(projectedDate, goal.deadline) : null; // >0: sớm hơn hạn

  // Tính khả thi: thời gian còn lại có đủ không?
  let feasibility = { level: 'ok', message: null, free_minutes_until_deadline: null };
  if (goal.status !== 'done' && remaining > 0 && goal.deadline) {
    if (goal.deadline < today) {
      feasibility = { level: 'overdue', message: T(`Đã quá hạn ${goal.deadline}, còn khoảng ${Math.round(remaining / 60 * 10) / 10} giờ chưa xong.`, `Past the deadline ${goal.deadline}, about ${Math.round(remaining / 60 * 10) / 10} hours still unfinished.`), free_minutes_until_deadline: 0 };
    } else {
      const free = await findFreeSlots(db, userId, today, goal.deadline, { minMinutes: 30, tz });
      const freeMinutes = free.reduce((s, f) => s + f.minutes, 0);
      const usable = Math.round(freeMinutes * 0.5); // không nên lấp kín mọi khoảng trống
      const unscheduled = Math.max(0, remaining - scheduledMinutes);
      if (unscheduled > usable) {
        feasibility = { level: 'infeasible', message: T(`Còn ${Math.round(remaining / 6) / 10} giờ việc nhưng chỉ có khoảng ${Math.round(usable / 6) / 10} giờ trống hợp lý trước hạn. Nên lùi hạn, giảm khối lượng hoặc bỏ bớt việc khác.`, `${Math.round(remaining / 6) / 10} hours of work left but only about ${Math.round(usable / 6) / 10} reasonable free hours before the deadline. Consider moving the deadline, reducing the scope or dropping other tasks.`), free_minutes_until_deadline: freeMinutes };
      } else if (unscheduled > 0) {
        feasibility = { level: 'needs_scheduling', message: T(`Còn khoảng ${Math.round(unscheduled / 6) / 10} giờ chưa được xếp vào lịch trước hạn.`, `About ${Math.round(unscheduled / 6) / 10} hours are not yet scheduled before the deadline.`), free_minutes_until_deadline: freeMinutes };
      } else if (daysVsDeadline !== null && daysVsDeadline < 0 && basis === 'pace') {
        feasibility = { level: 'behind', message: T(`Theo nhịp hiện tại sẽ xong trễ khoảng ${-daysVsDeadline} ngày so với hạn.`, `At the current pace you will finish about ${-daysVsDeadline} days after the deadline.`), free_minutes_until_deadline: freeMinutes };
      } else {
        feasibility.free_minutes_until_deadline = freeMinutes;
      }
    }
  }

  return {
    percent: pct,
    done_minutes: doneMinutes,
    extra_minutes: extraMinutes,
    planned_minutes: planned,
    remaining_minutes: remaining,
    tasks_total: tasks.length,
    tasks_done: tasks.filter(t => t.status === 'completed').length,
    scheduled_minutes_ahead: scheduledMinutes,
    pace_minutes_per_day: Math.round(pacePerDay),
    milestones,
    forecast: { projected_date: projectedDate, basis, days_vs_deadline: daysVsDeadline },
    feasibility
  };
}

async function goalsWithProgress(db, userId, tz, { includeDone = true, lang = 'vi' } = {}) {
  const goals = await db.prepare(`SELECT * FROM goals WHERE user_id = ? ${includeDone ? '' : "AND status != 'done'"} ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, deadline ASC`).all(userId);
  const out = [];
  for (const g of goals) out.push({ ...g, progress: await goalProgress(db, userId, g, tz, lang) });
  return out;
}

// ---------------------------------------------------------------- mẫu thời gian biểu
const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri'];
const ALL_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const ROUTINE_TEMPLATES = {
  student: [
    { block_type: 'sleep', label: 'Ngủ', start_time: '22:30', end_time: '06:00', days: ALL_DAYS },
    { block_type: 'meal', label: 'Ăn sáng', start_time: '06:15', end_time: '06:45', days: ALL_DAYS },
    { block_type: 'school', label: 'Học trên lớp', start_time: '07:00', end_time: '11:30', days: WEEKDAYS },
    { block_type: 'meal', label: 'Ăn trưa & nghỉ', start_time: '11:30', end_time: '13:00', days: ALL_DAYS },
    { block_type: 'extra_class', label: 'Học thêm', start_time: '17:30', end_time: '19:00', days: ['tue', 'thu'] },
    { block_type: 'exercise', label: 'Vận động', start_time: '16:30', end_time: '17:15', days: ['mon', 'wed', 'fri', 'sat'] },
    { block_type: 'meal', label: 'Ăn tối', start_time: '19:00', end_time: '19:45', days: ALL_DAYS },
    { block_type: 'study', label: 'Tự học', start_time: '20:00', end_time: '21:30', days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sun'] },
    { block_type: 'leisure', label: 'Giải trí', start_time: '21:30', end_time: '22:15', days: ALL_DAYS }
  ],
  university: [
    { block_type: 'sleep', label: 'Ngủ', start_time: '23:30', end_time: '07:00', days: ALL_DAYS },
    { block_type: 'meal', label: 'Ăn sáng', start_time: '07:15', end_time: '07:45', days: ALL_DAYS },
    { block_type: 'school', label: 'Lên lớp', start_time: '08:00', end_time: '11:30', days: WEEKDAYS },
    { block_type: 'meal', label: 'Ăn trưa', start_time: '11:45', end_time: '12:45', days: ALL_DAYS },
    { block_type: 'exercise', label: 'Tập luyện', start_time: '17:30', end_time: '18:30', days: ['mon', 'wed', 'fri'] },
    { block_type: 'meal', label: 'Ăn tối', start_time: '18:45', end_time: '19:30', days: ALL_DAYS },
    { block_type: 'study', label: 'Tự học', start_time: '19:45', end_time: '22:00', days: ALL_DAYS },
    { block_type: 'leisure', label: 'Giải trí', start_time: '22:00', end_time: '23:00', days: ALL_DAYS }
  ],
  worker: [
    { block_type: 'sleep', label: 'Ngủ', start_time: '23:00', end_time: '06:30', days: ALL_DAYS },
    { block_type: 'meal', label: 'Ăn sáng', start_time: '06:45', end_time: '07:15', days: ALL_DAYS },
    { block_type: 'school', label: 'Giờ làm việc', start_time: '08:00', end_time: '17:00', days: WEEKDAYS },
    { block_type: 'meal', label: 'Ăn tối', start_time: '18:30', end_time: '19:15', days: ALL_DAYS },
    { block_type: 'exercise', label: 'Tập luyện', start_time: '17:45', end_time: '18:30', days: ['tue', 'thu', 'sat'] },
    { block_type: 'study', label: 'Học / phát triển bản thân', start_time: '20:00', end_time: '21:30', days: ['mon', 'tue', 'wed', 'thu', 'sun'] },
    { block_type: 'leisure', label: 'Giải trí & gia đình', start_time: '21:30', end_time: '22:45', days: ALL_DAYS }
  ]
};

// ---------------------------------------------------------------- phiếu thông tin lập lịch (hỏi một lần, lưu lại)
// Lưu trong users.psych_profile dưới khoá "intake":
// { role, wake, sleep, busy_start, busy_end, busy_days[], focus_time, focus_minutes, daily_minutes, updated_at }
const INTAKE_ROLES = ['student', 'university', 'worker', 'other'];
const FOCUS_TIMES = ['morning', 'afternoon', 'evening', 'night'];

function cleanIntake(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const time = v => (isTime(v) ? v : null);
  const num = (v, lo, hi) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };
  const out = {
    role: INTAKE_ROLES.includes(raw.role) ? raw.role : null,
    wake: time(raw.wake),
    sleep: time(raw.sleep),
    busy_start: time(raw.busy_start),
    busy_end: time(raw.busy_end),
    busy_days: parseDays(raw.busy_days),
    focus_time: FOCUS_TIMES.includes(raw.focus_time) ? raw.focus_time : null,
    focus_minutes: num(raw.focus_minutes, 10, 240),
    daily_minutes: num(raw.daily_minutes, 10, 720),
    updated_at: new Date().toISOString()
  };
  if (out.busy_start && out.busy_end && out.busy_end <= out.busy_start) { out.busy_start = null; out.busy_end = null; }
  return out;
}

function readIntake(user) {
  try {
    const p = JSON.parse((user && user.psych_profile) || '{}') || {};
    return p.intake && typeof p.intake === 'object' ? p.intake : null;
  } catch {
    return null;
  }
}

/** Khung giờ suy ra từ phiếu thông tin: ngủ, đi học/đi làm, ba bữa ăn. Dùng khi người dùng chưa có thời gian biểu. */
function intakeBlocks(intake) {
  if (!intake) return [];
  const out = [];
  const shift = (hm, m) => toHM(Math.max(0, Math.min(1439, toMin(hm) + m)));
  if (intake.sleep && intake.wake) out.push({ id: 'intake_sleep', block_type: 'sleep', label: 'Ngủ', start_time: intake.sleep, end_time: intake.wake, days: ALL_DAYS.join(',') });
  if (intake.busy_start && intake.busy_end && intake.busy_days && intake.busy_days.length) {
    const label = intake.role === 'worker' ? 'Giờ làm việc' : 'Học trên lớp';
    out.push({ id: 'intake_busy', block_type: 'school', label, start_time: intake.busy_start, end_time: intake.busy_end, days: intake.busy_days.join(',') });
  }
  if (intake.wake) out.push({ id: 'intake_breakfast', block_type: 'meal', label: 'Ăn sáng', start_time: shift(intake.wake, 15), end_time: shift(intake.wake, 45), days: ALL_DAYS.join(',') });
  out.push({ id: 'intake_lunch', block_type: 'meal', label: 'Ăn trưa', start_time: '11:45', end_time: '12:30', days: ALL_DAYS.join(',') });
  out.push({ id: 'intake_dinner', block_type: 'meal', label: 'Ăn tối', start_time: '18:45', end_time: '19:30', days: ALL_DAYS.join(',') });
  return out;
}

// ---------------------------------------------------------------- chống trùng giờ
const overlaps = (a, b) => a.start < b.end && b.start < a.end;

/**
 * Tìm thứ đang chiếm khung giờ [start_time, end_time) của ngày `date`.
 * - Công việc khác cùng ngày (trừ excludeId) và các bản nháp trong extraTasks: luôn bị chặn.
 * - checkBlocks: khung giờ cố định (trừ "Tự học", nơi được xếp việc học) cũng bị chặn.
 * Trả về null nếu trống, hoặc { kind: 'task' | 'block', title, start, end }.
 */
async function findConflict(db, userId, { date, start_time, end_time, excludeId = null, extraTasks = [], checkBlocks = false, fallbackBlocks = [] }) {
  if (!isRealDate(date) || !isTime(start_time) || !isTime(end_time) || end_time <= start_time) return null;
  const me = { start: toMin(start_time), end: toMin(end_time) };
  const rows = await db.prepare('SELECT id, title, start_time, end_time FROM tasks WHERE user_id = ? AND date = ? AND start_time IS NOT NULL AND end_time IS NOT NULL').all(userId, date);
  for (const t of [...rows.filter(r => r.id !== excludeId), ...extraTasks.filter(x => x.date === date)]) {
    if (!isTime(t.start_time) || !isTime(t.end_time)) continue;
    if (overlaps(me, { start: toMin(t.start_time), end: toMin(t.end_time) })) return { kind: 'task', title: t.title, start: t.start_time, end: t.end_time };
  }
  if (checkBlocks) {
    let blocks = await db.prepare('SELECT * FROM routine_blocks WHERE user_id = ?').all(userId);
    if (!blocks.length) blocks = fallbackBlocks;
    for (const b of blocksForDate(blocks, date)) {
      if (b.block_type === 'study') continue;
      if (overlaps(me, b)) return { kind: 'block', title: b.label || BLOCK_LABELS[b.block_type], start: toHM(b.start), end: b.end === 1440 ? '24:00' : toHM(b.end) };
    }
  }
  return null;
}

// Một tuần mẫu (2024-01-01 là thứ Hai) để so khung giờ lặp theo thứ.
const REFERENCE_WEEK = ['2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04', '2024-01-05', '2024-01-06', '2024-01-07'];

/** Khung giờ cố định `candidate` có đè lên khung giờ khác không (xét cả khung qua đêm)? Trả về khung bị đè hoặc null. */
function findBlockConflict(blocks, candidate, excludeId = null) {
  const others = blocks.filter(b => b.id !== excludeId);
  const cand = { ...candidate, id: '__candidate__' };
  for (const date of REFERENCE_WEEK) {
    const ranges = blocksForDate([...others, cand], date);
    const mine = ranges.filter(r => r.id === '__candidate__');
    for (const m of mine) {
      const hit = ranges.find(r => r.id !== '__candidate__' && overlaps(m, r));
      if (hit) return { title: hit.label || BLOCK_LABELS[hit.block_type], start: hit.start_time, end: hit.end_time, day: dayKey(date) };
    }
  }
  return null;
}

// ---------------------------------------------------------------- kiểm tra mục tiêu thực tế + bản nháp đơn giản (khi chưa có AI)
/** Trả về câu giải thích nếu mục tiêu bất khả thi (VD: IELTS 10.0), ngược lại null. */
function unrealisticGoal(text) {
  const s = String(text || '').toLowerCase().replace(',', '.');
  const num = re => { const m = s.match(re); return m ? Number(m[1]) : null; };
  const ielts = num(/ielts[^0-9]{0,12}(\d+(?:\.\d+)?)/);
  if (ielts != null && ielts > 9) return `IELTS tối đa là 9.0 nên không có ${ielts.toFixed(1)}. Hãy chọn mức thực tế hơn, ví dụ tăng 0.5–1.0 band so với hiện tại trong 2–3 tháng.`;
  const toeic = num(/toeic[^0-9]{0,12}(\d{3,4})/);
  if (toeic != null && toeic > 990) return `TOEIC tối đa là 990 điểm. Hãy đặt mục tiêu trong khoảng đó, ví dụ tăng 100–150 điểm sau 2 tháng.`;
  const sat = num(/\bsat[^0-9]{0,12}(\d{3,4})/);
  if (sat != null && sat > 1600) return `SAT tối đa là 1600 điểm. Hãy đặt mục tiêu trong khoảng đó.`;
  const kg = s.match(/giảm\s*(\d+(?:\.\d+)?)\s*kg[^0-9]{0,20}(\d+)\s*(ngày|tuần|tháng)/);
  if (kg) {
    const weeks = Number(kg[2]) * (kg[3] === 'ngày' ? 1 / 7 : kg[3] === 'tháng' ? 4.3 : 1);
    if (weeks > 0 && Number(kg[1]) / weeks > 1.2) return `Giảm ${kg[1]} kg trong ${kg[2]} ${kg[3]} là quá nhanh và không an toàn. Mức hợp lý là khoảng 0,5–1 kg mỗi tuần.`;
  }
  return null;
}

const FOCUS_ORDER = { morning: [6, 12], afternoon: [12, 17], evening: [17, 22], night: [20, 24] };

/**
 * Bản nháp đơn giản khi chưa có LLM: mỗi ngày một phiên làm mục tiêu (dài theo thời gian/ngày và
 * giới hạn tập trung), đặt vào khoảng trống gần giờ tập trung tốt nhất. Không bao giờ đè lên lịch khác.
 */
async function simpleDraft(db, user, plan, tz) {
  const intake = readIntake(user) || {};
  const today = localNow(tz).date;
  const days = Math.max(1, Math.min(14, Number(plan.period_days) || 7));
  const end = plan.deadline && isRealDate(plan.deadline) && plan.deadline >= today ? (plan.deadline < addDays(today, days - 1) ? plan.deadline : addDays(today, days - 1)) : addDays(today, days - 1);
  const daily = Math.max(15, Math.min(240, Number(plan.daily_minutes) || intake.daily_minutes || 60));
  const focusMax = Math.max(15, Math.min(120, intake.focus_minutes || 45));
  // Chia thời gian mỗi ngày thành các phiên không dài quá sức tập trung (bước 15 phút, tối đa 3 phiên)
  const sessionsPerDay = Math.max(1, Math.min(3, Math.ceil(daily / focusMax)));
  const session = Math.max(15, Math.round(daily / sessionsPerDay / 15) * 15);
  const [fromH, toH] = FOCUS_ORDER[intake.focus_time] || [17, 22];
  const title = String(plan.goal || 'Mục tiêu').trim().slice(0, 80);
  const slots = await findFreeSlots(db, user.id, today, end, { minMinutes: session, tz, fallbackBlocks: intakeBlocks(intake) });
  const tasks = [];
  for (let d = today; d <= end; d = addDays(d, 1)) {
    const daySlots = slots.filter(x => x.date === d)
      .map(x => ({ ...x, s: toMin(x.start), e: x.end === '24:00' ? 1440 : toMin(x.end) }))
      .sort((a, b) => {
        const score = x => (x.s >= fromH * 60 && x.s < toH * 60 ? 0 : 1) + (x.kind === 'study_block' ? -0.5 : 0);
        return score(a) - score(b) || a.s - b.s;
      });
    let placed = 0;
    for (const sl of daySlots) {
      // Bắt đầu từ giờ tập trung tốt nhất nếu khoảng trống còn đủ chỗ, không thì từ đầu khoảng trống
      const fromFocus = Math.max(sl.s, fromH * 60);
      let cursor = Math.ceil((fromFocus + session <= sl.e ? fromFocus : sl.s) / 15) * 15;
      while (placed < sessionsPerDay && cursor + session <= sl.e) {
        tasks.push({ title: placed ? `${title} (phiên ${placed + 1})` : title, date: d, start_time: toHM(cursor), end_time: toHM(cursor + session), duration_minutes: session, category: 'Study', priority: 'high', description: plan.goal ? `Làm cho mục tiêu: ${plan.goal}` : '' });
        placed++;
        cursor += session + 15; // nghỉ 15 phút giữa hai phiên
      }
      if (placed >= sessionsPerDay) break;
    }
  }
  return tasks;
}

function conflictMessage(c, lang = 'vi') {
  if (!c) return '';
  if (lang === 'en') return `This time overlaps "${c.title}" (${c.start}–${c.end}). Pick a free time.`;
  return `Khung giờ này trùng với "${c.title}" (${c.start}–${c.end}). Hãy chọn giờ còn trống.`;
}

module.exports = {
  DEFAULT_TZ, DAY_KEYS, BLOCK_TYPES, BLOCK_LABELS, DISRUPTION_KINDS, DISRUPTION_LABELS, ROUTINE_TEMPLATES,
  validTimezone, localNow, isRealDate, isTime, toMin, toHM, addDays, daysBetween, dayKey, parseDays, taskMinutes,
  blocksForDate, findFreeSlots, syncTaskProgress, addProgressLog, goalProgress, goalsWithProgress,
  cleanIntake, readIntake, intakeBlocks, findConflict, findBlockConflict, conflictMessage, unrealisticGoal, simpleDraft
};
