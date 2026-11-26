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

const isRealDate = s => typeof s === 'string' && DATE_RE.test(s) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
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
async function findFreeSlots(db, userId, startDate, endDate, { minMinutes = 30, tz } = {}) {
  const now = localNow(tz);
  const blocks = await db.prepare('SELECT * FROM routine_blocks WHERE user_id = ?').all(userId);
  const tasks = await db.prepare('SELECT date, start_time, end_time FROM tasks WHERE user_id = ? AND date >= ? AND date <= ? AND start_time IS NOT NULL AND end_time IS NOT NULL').all(userId, startDate, endDate);
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
async function goalProgress(db, userId, goal, tz) {
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
      feasibility = { level: 'overdue', message: `Đã quá hạn ${goal.deadline}, còn khoảng ${Math.round(remaining / 60 * 10) / 10} giờ chưa xong.`, free_minutes_until_deadline: 0 };
    } else {
      const free = await findFreeSlots(db, userId, today, goal.deadline, { minMinutes: 30, tz });
      const freeMinutes = free.reduce((s, f) => s + f.minutes, 0);
      const usable = Math.round(freeMinutes * 0.5); // không nên lấp kín mọi khoảng trống
      const unscheduled = Math.max(0, remaining - scheduledMinutes);
      if (unscheduled > usable) {
        feasibility = { level: 'infeasible', message: `Còn ${Math.round(remaining / 6) / 10} giờ việc nhưng chỉ có khoảng ${Math.round(usable / 6) / 10} giờ trống hợp lý trước hạn. Nên lùi hạn, giảm khối lượng hoặc bỏ bớt việc khác.`, free_minutes_until_deadline: freeMinutes };
      } else if (unscheduled > 0) {
        feasibility = { level: 'needs_scheduling', message: `Còn khoảng ${Math.round(unscheduled / 6) / 10} giờ chưa được xếp vào lịch trước hạn.`, free_minutes_until_deadline: freeMinutes };
      } else if (daysVsDeadline !== null && daysVsDeadline < 0 && basis === 'pace') {
        feasibility = { level: 'behind', message: `Theo nhịp hiện tại sẽ xong trễ khoảng ${-daysVsDeadline} ngày so với hạn.`, free_minutes_until_deadline: freeMinutes };
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

async function goalsWithProgress(db, userId, tz, { includeDone = true } = {}) {
  const goals = await db.prepare(`SELECT * FROM goals WHERE user_id = ? ${includeDone ? '' : "AND status != 'done'"} ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, deadline ASC`).all(userId);
  const out = [];
  for (const g of goals) out.push({ ...g, progress: await goalProgress(db, userId, g, tz) });
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

module.exports = {
  DEFAULT_TZ, DAY_KEYS, BLOCK_TYPES, BLOCK_LABELS, DISRUPTION_KINDS, DISRUPTION_LABELS, ROUTINE_TEMPLATES,
  validTimezone, localNow, isRealDate, isTime, toMin, toHM, addDays, daysBetween, dayKey, parseDays, taskMinutes,
  blocksForDate, findFreeSlots, syncTaskProgress, addProgressLog, goalProgress, goalsWithProgress
};
