/**
 * Trợ lý AI LifeCare chạy bằng LLM thật (Groq, API tương thích OpenAI).
 *
 * - Đọc dữ liệu của chính người dùng: hồ sơ + tâm lý nền, thời gian biểu cố định, lịch, mục tiêu và
 *   tiến độ, gián đoạn, check-in sức khoẻ / tâm trạng.
 * - Tự thêm / sửa / xoá việc, tạo mục tiêu và chia nhỏ, ghi tiến độ, khai báo gián đoạn qua tool calling.
 * - "intent" cho các tình huống có sẵn: điều chỉnh sau check-in hằng ngày, xếp lại khi gián đoạn,
 *   chia nhỏ mục tiêu, phân bổ thời gian trống, xử lý trễ tiến độ.
 * Không có GROQ_API_KEY thì server.js dùng lại bộ luật cũ trong ai-engine.js.
 */

const crypto = require('node:crypto');
const P = require('./planning');

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
const MAX_TOOL_TURNS = 8;
const HISTORY_LIMIT = 20;

const CATEGORIES = ['Study', 'Work', 'Exercise', 'Personal', 'Rest', 'Other'];
const PRIORITIES = ['low', 'medium', 'high'];
const STATUSES = ['pending', 'completed'];

const MODE_HINTS = {
  schedule: 'The user opened the "Lịch Trình" (schedule) mode: focus on planning, balancing workload and breaks.',
  wellness: 'The user opened the "Thư Giãn" (wellness) mode: focus on stress relief, rest, sleep and gentle habits.',
  insight: 'The user opened the "Góc Nhìn" (insight) mode: focus on patterns in their sleep, mood, energy and task completion.'
};

const INTENT_HINTS = {
  daily_adjust: `The user just did today's quick state check-in. Compare today's check-in with their fixed baseline (psych_profile) and recent days. Adjust TODAY's plan only slightly: e.g. on a low-energy or high-stress day shorten or move one demanding task, add a short break, or swap order so the hardest work lands at their best time; on a strong day you may pull one small task forward. Do not rebuild the schedule. If nothing needs to change, say so in one or two sentences. Keep the reply short and encouraging.`,
  disruption: `The user just declared a schedule disruption (it is already saved in <app_state>.disruptions). Find the pending tasks it affects. Re-plan them by weighing priority, deadline and how much time is left: use find_free_slots before the relevant deadline, keep high-priority / near-deadline work, shorten or split long tasks, move low-priority work further out or suggest dropping it. Do NOT simply push everything to tomorrow, and do not overload any single day. Then explain briefly what moved where and why.`,
  goal_breakdown: `The user wants a big goal broken down. If the goal is not created yet, call create_goal first. Split it into concrete tasks with a realistic duration (duration_minutes), priority and a per-task deadline, ordered sensibly, then place them into free time with find_free_slots before the goal's deadline (prefer "study_block" slots for study work and the user's best focus time). Respect the user's max focus length from psych_profile. If the total does not fit before the deadline, say so clearly and propose options (extend deadline, reduce scope).`,
  allocate_free_time: `The user wants their free time allocated. Use find_free_slots for the requested range (default: rest of this week), then fill a reasonable share of it (not all of it) with work toward their active goals and habits, respecting energy, best focus time and breaks.`,
  behind_schedule: `The user says they are behind schedule or late on something. Look at overdue and pending tasks and goal forecasts. Adjust only what is needed (do not recreate the whole plan): re-slot missed tasks by priority and deadline, shrink or drop low-value items, and tell them honestly whether the deadline is still realistic.`
};

const SYSTEM_PROMPT = `You are the AI assistant inside LifeCare, a web app where people plan their days and track their physical and emotional wellbeing.

What you can see and do:
- Each request includes an <app_state> block: today's date/time and timezone, the user's profile and fixed psychological baseline (psych_profile: willpower, motivation source, stress tolerance, best focus time, max focus minutes), their fixed weekly time blocks (routine_blocks: sleep, meal, school, extra_class, leisure, exercise, study; they repeat every week on the listed days), tasks from 7 days ago to 14 days ahead (with ids), goals with progress, forecast and feasibility, upcoming disruptions, today's check-in and recent health / mood check-ins. The user does not see this block.
- Tools: list_tasks (other date ranges), find_free_slots (time outside the fixed blocks, minus tasks and disruptions; "study_block" slots are free time inside the user's study blocks), add_tasks, update_task (also to mark completed or reschedule), delete_task, create_goal, update_goal, log_progress (record extra work the user did beyond the plan), add_disruption.
- Only change data when the user asks for it or clearly agrees, or when the request's purpose (given below) implies it. If a request is ambiguous, ask first. Never invent ids.
- Task fields: date YYYY-MM-DD, start_time/end_time HH:MM (24h), duration_minutes, deadline YYYY-MM-DD, goal_id, category one of Study, Work, Exercise, Personal, Rest, Other, priority one of low, medium, high.

How to plan:
- Never put tasks on top of fixed time blocks (except study work inside "study" blocks), existing tasks or disruptions; get free time from find_free_slots.
- Shape the plan around the person: hardest work at their best focus time, sessions no longer than their max focus minutes, breaks between sessions, enough sleep. If recent check-ins show poor sleep, high stress or low mood, lighten the load and say why.
- Be honest about feasibility: if a goal does not fit before its deadline, say so and offer options instead of cramming.
- After changing data, briefly say what you changed and why; do not repeat the whole schedule.
- Ground insights in the actual numbers from <app_state>.

Style: reply in the user's language (Vietnamese by default; see the language field). Warm, direct, concise. Plain text with short paragraphs or "- " lists. You may use **bold** for a few key words; no headings, tables or other markdown, because the app shows only plain text and bold.

Limits: you are not a doctor or therapist. Give general wellbeing guidance only and never diagnose or prescribe. Suggest seeing a professional for persistent or serious physical or mental health problems. If the user expresses thoughts of self-harm or seems to be in crisis, respond with care, put planning aside, and urge them to contact someone they trust or local emergency services (115 in Vietnam) right away.`;

const TASK_PROPS = {
  title: { type: 'string' },
  date: { type: 'string', description: 'YYYY-MM-DD' },
  start_time: { type: 'string', description: 'HH:MM 24h; omit for all-day' },
  end_time: { type: 'string', description: 'HH:MM 24h; omit for all-day' },
  duration_minutes: { type: 'integer', description: 'Planned effort in minutes' },
  deadline: { type: 'string', description: 'YYYY-MM-DD; latest date this task must be done' },
  goal_id: { type: 'string', description: 'Id of the goal this task belongs to' },
  category: { type: 'string', enum: CATEGORIES },
  priority: { type: 'string', enum: PRIORITIES },
  description: { type: 'string', description: 'Short tip or detail; may be empty.' }
};

const fn = (name, description, properties, required = []) => ({
  type: 'function',
  function: { name, description, parameters: { type: 'object', properties, required } }
});

const TOOLS = [
  fn('list_tasks', "List the user's tasks between two dates (inclusive), with ids.",
    { start_date: { type: 'string' }, end_date: { type: 'string' } }, ['start_date', 'end_date']),
  fn('find_free_slots', 'Free time between two dates (inclusive), outside fixed time blocks and existing tasks/disruptions. Past time today is excluded.',
    { start_date: { type: 'string' }, end_date: { type: 'string' }, min_minutes: { type: 'integer', description: 'Ignore slots shorter than this (default 30)' } },
    ['start_date', 'end_date']),
  fn('add_tasks', "Add one or more tasks to the user's planner.",
    { tasks: { type: 'array', items: { type: 'object', properties: TASK_PROPS, required: ['title', 'date', 'category'] } } }, ['tasks']),
  fn('update_task', 'Change fields of an existing task. Only pass the fields to change. Use status "completed" to tick a task off.',
    { id: { type: 'string' }, ...TASK_PROPS, status: { type: 'string', enum: STATUSES } }, ['id']),
  fn('delete_task', 'Delete a task from the planner.', { id: { type: 'string' } }, ['id']),
  fn('create_goal', 'Create a big goal to break down into tasks. Returns its id.', {
    title: { type: 'string' }, description: { type: 'string' }, deadline: { type: 'string', description: 'YYYY-MM-DD' },
    estimated_minutes: { type: 'integer', description: 'Total effort the goal needs' }, priority: { type: 'string', enum: PRIORITIES }
  }, ['title']),
  fn('update_goal', 'Change a goal (deadline, estimate, priority, status active/paused/done).', {
    id: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' }, deadline: { type: 'string' },
    estimated_minutes: { type: 'integer' }, priority: { type: 'string', enum: PRIORITIES }, status: { type: 'string', enum: ['active', 'paused', 'done'] }
  }, ['id']),
  fn('log_progress', 'Record work the user did (e.g. extra study beyond the plan) toward a goal.', {
    goal_id: { type: 'string' }, minutes: { type: 'integer' }, date: { type: 'string', description: 'YYYY-MM-DD, default today' }, note: { type: 'string' }
  }, ['minutes']),
  fn('add_disruption', 'Record a disruption: incident, class_off (class cancelled), new_work (unexpected work) or unavailable time. Omit times for the whole day.', {
    kind: { type: 'string', enum: P.DISRUPTION_KINDS }, date: { type: 'string' }, start_time: { type: 'string' }, end_time: { type: 'string' }, note: { type: 'string' }
  }, ['kind', 'date'])
];

// ---------------------------------------------------------------- kiểm tra dữ liệu model gửi
function pickEnum(value, list) {
  if (typeof value !== 'string') return null;
  return list.find(x => x.toLowerCase() === value.trim().toLowerCase()) || null;
}

function positiveInt(v, max) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 && n <= max ? n : null;
}

/** Trả về [fields, null] hoặc [null, lỗi để model sửa]. partial = true cho update. */
function cleanTaskFields(raw, partial) {
  if (!raw || typeof raw !== 'object') return [null, 'Task must be an object.'];
  const out = {};
  if (raw.title !== undefined || !partial) {
    if (typeof raw.title !== 'string' || !raw.title.trim()) return [null, 'title is required.'];
    out.title = raw.title.trim().slice(0, 200);
  }
  if (raw.date !== undefined || !partial) {
    if (!P.isRealDate(raw.date)) return [null, 'date must be a real date in YYYY-MM-DD.'];
    out.date = raw.date;
  }
  if (raw.category !== undefined || !partial) {
    const c = pickEnum(raw.category, CATEGORIES);
    if (!c) return [null, `category must be one of ${CATEGORIES.join(', ')}.`];
    out.category = c;
  }
  if (raw.priority !== undefined) {
    const p = pickEnum(raw.priority, PRIORITIES);
    if (!p) return [null, `priority must be one of ${PRIORITIES.join(', ')}.`];
    out.priority = p;
  } else if (!partial) out.priority = 'medium';
  if (raw.status !== undefined) {
    const s = pickEnum(raw.status, STATUSES);
    if (!s) return [null, `status must be one of ${STATUSES.join(', ')}.`];
    out.status = s;
  }
  for (const key of ['start_time', 'end_time']) {
    if (raw[key] === undefined || raw[key] === null || raw[key] === '') continue;
    if (!P.isTime(raw[key])) return [null, `${key} must be HH:MM (24h, zero-padded).`];
    out[key] = raw[key];
  }
  if (raw.deadline !== undefined && raw.deadline !== null && raw.deadline !== '') {
    if (!P.isRealDate(raw.deadline)) return [null, 'deadline must be YYYY-MM-DD.'];
    out.deadline = raw.deadline;
  }
  if (raw.duration_minutes !== undefined && raw.duration_minutes !== null) {
    const d = positiveInt(raw.duration_minutes, 1440);
    if (!d) return [null, 'duration_minutes must be an integer between 1 and 1440.'];
    out.duration_minutes = d;
  }
  if (raw.goal_id !== undefined) out.goal_id = raw.goal_id ? String(raw.goal_id) : null;
  if (raw.description !== undefined) out.description = typeof raw.description === 'string' ? raw.description.trim().slice(0, 1000) : '';
  return [out, null];
}

const taskView = t => Object.fromEntries(Object.entries({
  id: t.id, date: t.date, start_time: t.start_time, end_time: t.end_time, title: t.title, category: t.category,
  priority: t.priority, status: t.status, duration_minutes: t.duration_minutes, deadline: t.deadline, goal_id: t.goal_id,
  description: t.description
}).filter(([, v]) => v !== null && v !== undefined && v !== ''));

// ---------------------------------------------------------------- thực thi tool
async function runTool(db, user, name, argsText, changes, tz) {
  let args;
  try {
    args = JSON.parse(argsText || '{}');
  } catch {
    return 'Error: arguments were not valid JSON.';
  }
  const userId = user.id;
  const now = new Date().toISOString();
  const today = P.localNow(tz).date;

  if (name === 'list_tasks') {
    if (!P.isRealDate(args.start_date) || !P.isRealDate(args.end_date)) return 'Error: start_date and end_date must be YYYY-MM-DD.';
    const rows = await db.prepare('SELECT * FROM tasks WHERE user_id = ? AND date >= ? AND date <= ? ORDER BY date ASC, start_time ASC LIMIT 200')
      .all(userId, args.start_date, args.end_date);
    return JSON.stringify(rows.map(taskView));
  }

  if (name === 'find_free_slots') {
    if (!P.isRealDate(args.start_date) || !P.isRealDate(args.end_date)) return 'Error: start_date and end_date must be YYYY-MM-DD.';
    if (P.daysBetween(args.start_date, args.end_date) > 62) return 'Error: range must be at most 62 days.';
    const slots = await P.findFreeSlots(db, userId, args.start_date, args.end_date, { minMinutes: positiveInt(args.min_minutes, 600) || 30, tz });
    return JSON.stringify(slots.slice(0, 150));
  }

  if (name === 'add_tasks') {
    if (!Array.isArray(args.tasks) || args.tasks.length === 0) return 'Error: tasks must be a non-empty array.';
    if (args.tasks.length > 60) return 'Error: add at most 60 tasks per call.';
    const cleaned = [];
    for (let i = 0; i < args.tasks.length; i++) {
      const [task, problem] = cleanTaskFields(args.tasks[i], false);
      if (problem) return `Error in tasks[${i}]: ${problem} Nothing was saved; fix and call again.`;
      if (task.start_time && task.end_time && task.end_time <= task.start_time) {
        return `Error in tasks[${i}]: end_time must be after start_time. Nothing was saved; fix and call again.`;
      }
      if (task.goal_id && !(await db.prepare('SELECT id FROM goals WHERE id = ? AND user_id = ?').get(task.goal_id, userId))) {
        return `Error in tasks[${i}]: unknown goal_id ${task.goal_id}. Nothing was saved.`;
      }
      cleaned.push(task);
    }
    const created = [];
    for (const t of cleaned) {
      const id = 'task_' + crypto.randomUUID();
      await db.prepare(`
        INSERT INTO tasks (id, user_id, title, description, category, priority, date, start_time, end_time, status, is_event, reminder_time, recurring, goal_id, duration_minutes, deadline, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, NULL, 'none', ?, ?, ?, ?, ?)
      `).run(id, userId, t.title, t.description || '', t.category, t.priority, t.date, t.start_time || null, t.end_time || null,
        t.goal_id || null, t.duration_minutes || null, t.deadline || null, now, now);
      created.push({ id, date: t.date, start_time: t.start_time || null, title: t.title });
    }
    changes.added += created.length;
    return `Added ${created.length} tasks: ${JSON.stringify(created)}`;
  }

  if (name === 'update_task') {
    if (typeof args.id !== 'string') return 'Error: id is required.';
    const existing = await db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(args.id, userId);
    if (!existing) return `Error: no task with id ${args.id}. Use list_tasks to find the right id.`;
    const { id, ...rest } = args;
    const [fields, problem] = cleanTaskFields(rest, true);
    if (problem) return `Error: ${problem}`;
    const merged = { ...existing, ...fields };
    if (merged.start_time && merged.end_time && merged.end_time <= merged.start_time) return 'Error: end_time must be after start_time.';
    const keys = Object.keys(fields);
    if (keys.length === 0) return 'Error: no fields to change.';
    await db.prepare(`UPDATE tasks SET ${keys.map(k => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ? AND user_id = ?`)
      .run(...keys.map(k => fields[k]), now, id, userId);
    if ('status' in fields || 'goal_id' in fields) await P.syncTaskProgress(db, userId, merged, tz);
    changes.updated += 1;
    return `Updated: ${JSON.stringify(taskView(merged))}`;
  }

  if (name === 'delete_task') {
    if (typeof args.id !== 'string') return 'Error: id is required.';
    const result = await db.prepare('DELETE FROM tasks WHERE id = ? AND user_id = ?').run(args.id, userId);
    if (!result.changes) return `Error: no task with id ${args.id}.`;
    changes.deleted += 1;
    return 'Deleted.';
  }

  if (name === 'create_goal' || name === 'update_goal') {
    const fields = {};
    if (args.title !== undefined) {
      if (typeof args.title !== 'string' || !args.title.trim()) return 'Error: title must be a non-empty string.';
      fields.title = args.title.trim().slice(0, 200);
    }
    if (args.description !== undefined) fields.description = String(args.description || '').slice(0, 2000);
    if (args.deadline !== undefined && args.deadline !== null && args.deadline !== '') {
      if (!P.isRealDate(args.deadline)) return 'Error: deadline must be YYYY-MM-DD.';
      fields.deadline = args.deadline;
    }
    if (args.estimated_minutes !== undefined && args.estimated_minutes !== null) {
      const m = positiveInt(args.estimated_minutes, 100000);
      if (!m) return 'Error: estimated_minutes must be a positive integer.';
      fields.estimated_minutes = m;
    }
    if (args.priority !== undefined) {
      const p = pickEnum(args.priority, PRIORITIES);
      if (!p) return 'Error: priority must be low, medium or high.';
      fields.priority = p;
    }
    if (name === 'create_goal') {
      if (!fields.title) return 'Error: title is required.';
      const id = 'goal_' + crypto.randomUUID();
      await db.prepare(`INSERT INTO goals (id, user_id, title, description, deadline, estimated_minutes, priority, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`)
        .run(id, userId, fields.title, fields.description || '', fields.deadline || null, fields.estimated_minutes || null, fields.priority || 'medium', now, now);
      changes.goals += 1;
      return `Created goal ${id}.`;
    }
    if (typeof args.id !== 'string') return 'Error: id is required.';
    if (args.status !== undefined) {
      const s = pickEnum(args.status, ['active', 'paused', 'done']);
      if (!s) return 'Error: status must be active, paused or done.';
      fields.status = s;
    }
    const keys = Object.keys(fields);
    if (!keys.length) return 'Error: no fields to change.';
    const r = await db.prepare(`UPDATE goals SET ${keys.map(k => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ? AND user_id = ?`)
      .run(...keys.map(k => fields[k]), now, args.id, userId);
    if (!r.changes) return `Error: no goal with id ${args.id}.`;
    changes.goals += 1;
    return 'Goal updated.';
  }

  if (name === 'log_progress') {
    const minutes = positiveInt(args.minutes, 1440);
    if (!minutes) return 'Error: minutes must be an integer between 1 and 1440.';
    const date = args.date || today;
    if (!P.isRealDate(date)) return 'Error: date must be YYYY-MM-DD.';
    if (args.goal_id && !(await db.prepare('SELECT id FROM goals WHERE id = ? AND user_id = ?').get(args.goal_id, userId))) {
      return `Error: unknown goal_id ${args.goal_id}.`;
    }
    await P.addProgressLog(db, userId, { goal_id: args.goal_id || null, minutes, note: String(args.note || '').slice(0, 300), log_date: date, kind: 'extra' });
    changes.progress += 1;
    return `Logged ${minutes} minutes.`;
  }

  if (name === 'add_disruption') {
    const kind = pickEnum(args.kind, P.DISRUPTION_KINDS);
    if (!kind) return `Error: kind must be one of ${P.DISRUPTION_KINDS.join(', ')}.`;
    if (!P.isRealDate(args.date)) return 'Error: date must be YYYY-MM-DD.';
    const hasTimes = args.start_time || args.end_time;
    if (hasTimes && !(P.isTime(args.start_time) && P.isTime(args.end_time) && args.end_time > args.start_time)) {
      return 'Error: give both start_time and end_time (HH:MM, end after start), or neither for the whole day.';
    }
    await db.prepare('INSERT INTO disruptions (id, user_id, kind, date, start_time, end_time, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run('dis_' + crypto.randomUUID(), userId, kind, args.date, hasTimes ? args.start_time : null, hasTimes ? args.end_time : null, String(args.note || '').slice(0, 500), now);
    changes.disruptions += 1;
    return 'Disruption recorded.';
  }

  return `Error: unknown tool ${name}.`;
}

// ---------------------------------------------------------------- ngữ cảnh gửi kèm mỗi lượt
function parseJSON(text) {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

async function buildAppState(db, user, language, tz) {
  const now = P.localNow(tz);
  const tasks = await db.prepare('SELECT * FROM tasks WHERE user_id = ? AND date >= ? AND date <= ? ORDER BY date ASC, start_time ASC LIMIT 150')
    .all(user.id, P.addDays(now.date, -7), P.addDays(now.date, 14));
  const blocks = await db.prepare('SELECT block_type, label, start_time, end_time, days FROM routine_blocks WHERE user_id = ? ORDER BY start_time').all(user.id);
  const disruptions = await db.prepare('SELECT kind, date, start_time, end_time, note FROM disruptions WHERE user_id = ? AND date >= ? ORDER BY date LIMIT 30')
    .all(user.id, P.addDays(now.date, -1));
  const goals = await P.goalsWithProgress(db, user.id, tz, { includeDone: false });
  const health = await db.prepare(`SELECT checkin_date, sleep_duration, sleep_quality, physical_condition, energy_level,
      exercise_status, exercise_type, exercise_duration, water_ml, discomfort, notes
    FROM health_checkins WHERE user_id = ? ORDER BY checkin_date DESC LIMIT 7`).all(user.id);
  const mood = await db.prepare(`SELECT checkin_date, mood, stress_level, motivation_level, anxiety_score, relaxed_score, emotional_notes
    FROM mood_checkins WHERE user_id = ? ORDER BY checkin_date DESC LIMIT 7`).all(user.id);
  const drop = rows => rows.map(r => Object.fromEntries(Object.entries(r).filter(([, v]) => v !== null && v !== '')));
  return {
    today: now.date, weekday: now.weekday, time_now: now.time, timezone: now.timezone, language,
    profile: { name: user.full_name, dob: user.dob || null, goals: user.personal_goals || null },
    psych_profile: parseJSON(user.psych_profile),
    routine_blocks: blocks,
    tasks: tasks.map(taskView),
    goals: goals.map(g => ({
      id: g.id, title: g.title, deadline: g.deadline, priority: g.priority, status: g.status, estimated_minutes: g.estimated_minutes,
      progress_percent: g.progress.percent, done_minutes: g.progress.done_minutes, remaining_minutes: g.progress.remaining_minutes,
      scheduled_minutes_ahead: g.progress.scheduled_minutes_ahead, forecast: g.progress.forecast, feasibility: g.progress.feasibility
    })),
    disruptions,
    today_checkin: {
      health: drop(health.filter(h => h.checkin_date === now.date))[0] || null,
      mood: drop(mood.filter(m => m.checkin_date === now.date))[0] || null
    },
    recent_health_checkins: drop(health),
    recent_mood_checkins: drop(mood)
  };
}

async function callGroq(messages) {
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({ model: MODEL, messages, tools: TOOLS, tool_choice: 'auto', max_completion_tokens: 8000 }),
    signal: AbortSignal.timeout(50000)
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    const err = new Error(`Groq HTTP ${res.status}: ${detail.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

function describeError(err, language) {
  const vi = language !== 'en';
  if (err.status === 401) return vi ? 'API key của trợ lý AI không hợp lệ. Kiểm tra GROQ_API_KEY trên server.' : 'The AI API key is invalid. Check GROQ_API_KEY on the server.';
  if (err.status === 429) return vi ? 'Trợ lý AI đang quá tải, chờ một chút rồi thử lại nhé.' : 'The AI is rate-limited right now, please try again shortly.';
  if (err.name === 'TimeoutError') return vi ? 'Trợ lý AI phản hồi quá lâu, thử gửi lại nhé.' : 'The AI took too long to respond, please try again.';
  return vi ? 'Trợ lý AI đang gặp sự cố, thử lại sau ít phút nhé.' : 'The AI assistant hit a problem, please try again in a moment.';
}

/**
 * Trả lời một tin nhắn. Tin nhắn của người dùng phải đã được lưu vào ai_chats trước khi gọi.
 * @returns {{ reply: string, type: string, tasksChanged: object }}
 */
async function generateLLMReply(db, user, userMessage, { mode = 'general', language = 'vi', intent = null, tz } = {}) {
  const changes = { added: 0, updated: 0, deleted: 0, goals: 0, progress: 0, disruptions: 0 };

  const past = await db.prepare('SELECT role, message FROM ai_chats WHERE user_id = ? ORDER BY created_at DESC LIMIT ?')
    .all(user.id, HISTORY_LIMIT + 1);
  past.reverse();
  past.pop(); // bỏ tin nhắn hiện tại (đã lưu), sẽ thêm lại kèm app_state
  while (past.length && past[0].role !== 'user') past.shift();

  const appState = await buildAppState(db, user, language, tz);
  let system = SYSTEM_PROMPT;
  if (MODE_HINTS[mode]) system += `\n\n${MODE_HINTS[mode]}`;
  if (INTENT_HINTS[intent]) system += `\n\nPurpose of this request: ${INTENT_HINTS[intent]}`;
  const messages = [
    { role: 'system', content: system },
    ...past.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.message).slice(0, 8000) })),
    { role: 'user', content: `<app_state>\n${JSON.stringify(appState)}\n</app_state>\n\n${userMessage.slice(0, 8000)}` }
  ];

  try {
    let reply = '';
    for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
      const data = await callGroq(messages);
      const msg = data.choices?.[0]?.message || {};
      if (msg.content) reply += (reply ? '\n\n' : '') + msg.content.trim();
      const calls = msg.tool_calls || [];
      messages.push({ role: 'assistant', content: msg.content || '', ...(calls.length ? { tool_calls: calls } : {}) });
      if (calls.length === 0) break;
      for (const call of calls) {
        const result = await runTool(db, user, call.function?.name, call.function?.arguments, changes, tz);
        messages.push({ role: 'tool', tool_call_id: call.id, content: result });
      }
    }
    if (!reply) {
      reply = language === 'en' ? 'Done! I have updated your planner.' : 'Xong rồi! Mình đã cập nhật lịch của bạn.';
    }
    return { reply, type: 'llm_response', tasksChanged: changes };
  } catch (err) {
    console.error('[LifeCare AI] Groq call failed:', err.message);
    // Có thể đã đổi một phần dữ liệu trước khi lỗi: vẫn báo để giao diện tải lại.
    return { reply: describeError(err, language), type: 'error', tasksChanged: changes };
  }
}

const isLLMConfigured = () => Boolean(process.env.GROQ_API_KEY);

module.exports = { generateLLMReply, isLLMConfigured, cleanTaskFields, INTENT_HINTS };
