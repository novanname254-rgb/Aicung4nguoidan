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
// Groq tính hạn mức token/phút RIÊNG cho từng model: hết hạn mức ở model chính thì chuyển sang model này.
// Đặt GROQ_FALLBACK_MODEL=none để tắt.
const FALLBACK_MODEL = process.env.GROQ_FALLBACK_MODEL === 'none' ? null : (process.env.GROQ_FALLBACK_MODEL || 'openai/gpt-oss-20b');
const RETRY_BUDGET_MS = 25000;   // tổng thời gian tối đa chờ hạn mức trong một tin nhắn
const MAX_SINGLE_WAIT_MS = 12000; // Groq bắt chờ lâu hơn mức này thì báo ngay để người dùng bấm "Thử lại"
const MAX_TOOL_TURNS = 8;
const HISTORY_LIMIT = 10;      // số tin nhắn cũ gửi kèm
const HISTORY_MSG_CHARS = 1200; // cắt bớt tin nhắn cũ quá dài

const CATEGORIES = ['Study', 'Work', 'Exercise', 'Personal', 'Rest', 'Other'];
const PRIORITIES = ['low', 'medium', 'high'];
const STATUSES = ['pending', 'completed'];

const MODE_HINTS = {
  schedule: 'The user opened the "Lịch Trình" (schedule) mode: focus on planning, balancing workload and breaks.',
  wellness: 'The user opened the "Thư Giãn" (wellness) mode: focus on stress relief, rest, sleep and gentle habits.',
  insight: 'The user opened the "Góc Nhìn" (insight) mode: focus on patterns in their sleep, mood, energy and task completion.'
};

const INTENT_HINTS = {
  daily_adjust: `The user just did today's quick check-in. Compare it with their psych baseline and recent days and adjust TODAY slightly (shorten or move one hard task, add a break, reorder; on a strong day pull one small task forward). Don't rebuild the schedule; if nothing needs changing say so briefly. Short and encouraging.`,
  disruption: `The user just declared a disruption (already saved). Re-plan the affected pending tasks by priority, deadline and time left: find free slots before each deadline, keep urgent/high-priority work, shorten or split long tasks, push or drop low-priority ones. Do NOT just move everything to tomorrow or overload one day. Explain briefly what moved and why.`,
  goal_breakdown: `Break the goal into concrete tasks (create_goal first if it doesn't exist) with duration_minutes, priority and deadline, in a sensible order, placed with find_free_slots before the goal deadline (prefer study slots and the best focus time, respect max focus minutes). If it doesn't fit, say so and propose options.`,
  allocate_free_time: `Allocate the user's free time in the given range (default rest of this week) with find_free_slots: fill a reasonable share, not all, with work toward active goals and habits, respecting energy, focus time and breaks.`,
  create_schedule: `The user is building a new schedule in the "Create" screen. Their answers (goal, deadline, daily time, intake form with sleep/wake and school/work hours) are in the message and <app_state>. FIRST check the goal is realistic (see Realism); if it is not, do not plan yet: explain in one or two sentences and offer a realistic target. Otherwise build a DRAFT for the requested period (default: the next 7 days): call find_free_slots, then add_tasks. In this mode add_tasks/update_task/delete_task only change the draft shown to the user (ids "draft_N"), nothing is saved until the user presses "Áp dụng". Include short breaks between long sessions. Then reply in 2-4 short lines: what the draft covers, and tell the user to check it and press "Áp dụng vào thời gian biểu" when it looks right, or tell you what to change.`,
  behind_schedule: `The user is behind. Using overdue/pending tasks and goal forecasts, adjust only what's needed (no full rebuild): re-slot missed tasks by priority and deadline, shrink or drop low-value items, and say honestly whether the deadline is still realistic.`
};

const SYSTEM_PROMPT = `You are the AI assistant in LifeCare, an app for planning days and tracking physical and emotional wellbeing.

Context: each request starts with a compact <app_state> (hidden from the user): today, profile, fixed psychological baseline (psych), weekly time blocks (repeat every week), tasks for -2..+7 days as "id|date|time|title|category|priority|status|duration|deadline|goal", goals with progress/forecast/feasibility, disruptions, recent health and mood.

Tools: list_tasks, find_free_slots ("study" = free time inside study blocks), add_tasks, update_task, delete_task, create_goal, update_goal, log_progress, add_disruption. Change data only when the user asks or clearly agrees (or the stated purpose implies it); ask if unclear. Never invent ids. Dates YYYY-MM-DD, times HH:MM 24h; categories Study, Work, Exercise, Personal, Rest, Other; priority low/medium/high.

Intake: <app_state> has an "intake" line with the user's saved sleep/wake time, school/work hours and days, best focus time, max focus minutes and daily minutes for goals. Use it; never ask the user to type these in the chat. If something is missing, say the app will show a short form and keep your question to one line.

Realism: before planning a goal, check it is possible and realistic. Examples: IELTS bands go 0-9.0 (no 10.0), TOEIC max 990, SAT max 1600; safe weight loss is about 0.5-1 kg per week; a beginner cannot become fluent in a month. If a goal is impossible or unrealistic for the deadline, say so plainly and propose a realistic target (e.g. "IELTS 9.0 is the maximum; from your level 6.5-7.0 in 3 months is realistic") before creating any task or goal.

Acting on requests: when the user asks to add, move, shorten, delete or change tasks, do it with the tools in this turn (list_tasks first if you need ids), then confirm in one line. Don't just describe what you would do.

Planning rules: never place tasks over time blocks (study work may go in study blocks), other tasks or disruptions; get free time from find_free_slots. Put hard work at the user's best focus time, keep sessions within their max focus minutes, add breaks, protect sleep. Lighten the load after poor sleep, high stress or low mood and say why. Be honest when something won't fit before its deadline and offer options. After changes, say briefly what changed and why; don't repeat the whole schedule. Base insights on the real numbers.

Language: always reply in the "reply language" given in <app_state> (vi = Vietnamese, en = English), even when the user's message, task titles or other data use the other language. Write titles of new tasks and goals in that language too.

Style: Warm, direct, concise; plain text, short paragraphs or "- " lists, **bold** allowed sparingly, no headings or tables.

Limits: not a doctor or therapist; general wellbeing advice only, no diagnosis or prescriptions; suggest a professional for persistent or serious problems. If the user mentions self-harm or seems in crisis, respond with care, set planning aside and urge them to contact someone they trust or emergency services (115 in Vietnam) now.`;

const TASK_PROPS = {
  title: { type: 'string' },
  date: { type: 'string' },
  start_time: { type: 'string' },
  end_time: { type: 'string' },
  duration_minutes: { type: 'integer' },
  deadline: { type: 'string' },
  goal_id: { type: 'string' },
  category: { type: 'string', enum: CATEGORIES },
  priority: { type: 'string', enum: PRIORITIES },
  description: { type: 'string' }
};

const fn = (name, description, properties, required = []) => ({
  type: 'function',
  function: { name, description, parameters: { type: 'object', properties, required } }
});

const TOOLS = [
  fn('list_tasks', "List the user's tasks between two dates (inclusive), with ids.",
    { start_date: { type: 'string' }, end_date: { type: 'string' } }, ['start_date', 'end_date']),
  fn('find_free_slots', 'Free time between two dates (inclusive), outside time blocks, tasks and disruptions.',
    { start_date: { type: 'string' }, end_date: { type: 'string' }, min_minutes: { type: 'integer' } },
    ['start_date', 'end_date']),
  fn('add_tasks', "Add one or more tasks to the user's planner.",
    { tasks: { type: 'array', items: { type: 'object', properties: TASK_PROPS, required: ['title', 'date', 'category'] } } }, ['tasks']),
  fn('update_task', 'Change only the given fields of a task (status "completed" ticks it off).',
    { id: { type: 'string' }, ...TASK_PROPS, status: { type: 'string', enum: STATUSES } }, ['id']),
  fn('delete_task', 'Delete a task from the planner.', { id: { type: 'string' } }, ['id']),
  fn('create_goal', 'Create a big goal; returns its id.', {
    title: { type: 'string' }, description: { type: 'string' }, deadline: { type: 'string' },
    estimated_minutes: { type: 'integer' }, priority: { type: 'string', enum: PRIORITIES }
  }, ['title']),
  fn('update_goal', 'Change a goal.', {
    id: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' }, deadline: { type: 'string' },
    estimated_minutes: { type: 'integer' }, priority: { type: 'string', enum: PRIORITIES }, status: { type: 'string', enum: ['active', 'paused', 'done'] }
  }, ['id']),
  fn('log_progress', 'Record extra work the user did toward a goal (date defaults to today).', {
    goal_id: { type: 'string' }, minutes: { type: 'integer' }, date: { type: 'string' }, note: { type: 'string' }
  }, ['minutes']),
  fn('add_disruption', 'Record a disruption; omit times for the whole day.', {
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
  // Model hay chỉ gửi giờ bắt đầu + thời lượng: tự tính giờ kết thúc, để việc hiện trên lưới và được kiểm tra trùng giờ.
  if (out.start_time && !out.end_time && out.duration_minutes) {
    const end = P.toMin(out.start_time) + out.duration_minutes;
    if (end > 24 * 60 - 1) return [null, 'start_time + duration_minutes must end before 24:00.'];
    out.end_time = P.toHM(end);
  }
  if (raw.goal_id !== undefined) out.goal_id = raw.goal_id ? String(raw.goal_id) : null;
  if (raw.description !== undefined) out.description = typeof raw.description === 'string' ? raw.description.trim().slice(0, 1000) : '';
  return [out, null];
}

// Một công việc trên một dòng: id|ngày|giờ|tiêu đề|loại|ưu tiên|trạng thái|thời lượng|hạn|mục tiêu
const taskLine = t => [t.id, t.date, t.start_time ? `${t.start_time}-${t.end_time || ''}` : 'allday', t.title, t.category, t.priority,
  t.status === 'completed' ? 'done' : 'todo', t.duration_minutes ? `${t.duration_minutes}m` : '', t.deadline || '', t.goal_id || ''].join('|').replace(/\|+$/, '');

// ---------------------------------------------------------------- thực thi tool
async function runTool(db, user, name, argsText, changes, tz, draft = null) {
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
    const rows = await db.prepare('SELECT * FROM tasks WHERE user_id = ? AND date >= ? AND date <= ? ORDER BY date ASC, start_time ASC LIMIT 80')
      .all(userId, args.start_date, args.end_date);
    return rows.length ? rows.map(taskLine).join('\n') : 'No tasks.';
  }

  if (name === 'find_free_slots') {
    if (!P.isRealDate(args.start_date) || !P.isRealDate(args.end_date)) return 'Error: start_date and end_date must be YYYY-MM-DD.';
    if (P.daysBetween(args.start_date, args.end_date) > 62) return 'Error: range must be at most 62 days.';
    const slots = await P.findFreeSlots(db, userId, args.start_date, args.end_date, {
      minMinutes: positiveInt(args.min_minutes, 600) || 30, tz,
      extraTasks: draft ? draft.tasks : [],
      fallbackBlocks: P.intakeBlocks(P.readIntake(user))
    });
    // Gọn để tiết kiệm token (gói miễn phí Groq ~8.000 token/phút): mỗi ngày một dòng "ngày: start-end, start-end*"
    // (* = trong khung Tự học). Tối đa 40 khoảng.
    const shown = slots.slice(0, 40);
    const byDay = {};
    shown.forEach(f => (byDay[f.date] = byDay[f.date] || []).push(`${f.start}-${f.end}${f.kind === 'study_block' ? '*' : ''}`));
    const lines = Object.entries(byDay).map(([d, list]) => `${d}: ${list.join(', ')}`);
    return lines.length ? lines.join('\n') + (slots.length > 40 ? `\n(+${slots.length - 40} more; narrow the range)` : '') + '\n(* = study block)' : 'No free slots.';
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
      // Không đè lên việc đã có, việc vừa thêm trong cùng lần gọi, bản nháp, hay khung giờ cố định
      if (task.start_time && task.end_time) {
        const conflict = await P.findConflict(db, userId, {
          date: task.date, start_time: task.start_time, end_time: task.end_time, checkBlocks: true,
          extraTasks: [...(draft ? draft.tasks : []), ...cleaned],
          fallbackBlocks: P.intakeBlocks(P.readIntake(user))
        });
        if (conflict) {
          return `Error in tasks[${i}] "${task.title}" ${task.date} ${task.start_time}-${task.end_time}: overlaps ${conflict.kind} "${conflict.title}" ${conflict.start}-${conflict.end}. Tasks must never overlap. Nothing was saved; use find_free_slots and call again.`;
        }
      }
      cleaned.push(task);
    }
    if (draft) {
      for (const t of cleaned) draft.tasks.push({ ...t, id: `draft_${++draft.seq}` });
      changes.draft = true;
      return `Draft now has ${draft.tasks.length} tasks (not saved until the user presses Apply): ` + cleaned.map(t => `${t.date} ${t.start_time || ''} ${t.title}`).join('; ');
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
    return `Added ${created.length}: ` + created.map(c => `${c.id} ${c.date} ${c.start_time || ''} ${c.title}`).join('; ');
  }

  if (draft && typeof args.id === 'string' && args.id.startsWith('draft_')) {
    const idx = draft.tasks.findIndex(t => t.id === args.id);
    if (idx < 0) return `Error: no draft task ${args.id}.`;
    if (name === 'delete_task') {
      draft.tasks.splice(idx, 1);
      changes.draft = true;
      return 'Removed from draft.';
    }
    if (name === 'update_task') {
      const { id, ...rest } = args;
      const [fields, problem] = cleanTaskFields(rest, true);
      if (problem) return `Error: ${problem}`;
      const merged = { ...draft.tasks[idx], ...fields };
      if (merged.start_time && merged.end_time) {
        if (merged.end_time <= merged.start_time) return 'Error: end_time must be after start_time.';
        const conflict = await P.findConflict(db, userId, {
          date: merged.date, start_time: merged.start_time, end_time: merged.end_time, checkBlocks: true,
          extraTasks: draft.tasks.filter(t => t.id !== id), fallbackBlocks: P.intakeBlocks(P.readIntake(user))
        });
        if (conflict) return `Error: overlaps ${conflict.kind} "${conflict.title}" ${conflict.start}-${conflict.end}. Pick a free slot.`;
      }
      draft.tasks[idx] = merged;
      changes.draft = true;
      return `Draft updated: ${draftLine(merged)}`;
    }
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
    if (merged.start_time && merged.end_time && ('date' in fields || 'start_time' in fields || 'end_time' in fields)) {
      const conflict = await P.findConflict(db, userId, { date: merged.date, start_time: merged.start_time, end_time: merged.end_time, excludeId: id, checkBlocks: true });
      if (conflict) return `Error: ${merged.date} ${merged.start_time}-${merged.end_time} overlaps ${conflict.kind} "${conflict.title}" ${conflict.start}-${conflict.end}. Tasks must never overlap; use find_free_slots.`;
    }
    const keys = Object.keys(fields);
    if (keys.length === 0) return 'Error: no fields to change.';
    await db.prepare(`UPDATE tasks SET ${keys.map(k => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ? AND user_id = ?`)
      .run(...keys.map(k => fields[k]), now, id, userId);
    if ('status' in fields || 'goal_id' in fields) await P.syncTaskProgress(db, userId, merged, tz);
    changes.updated += 1;
    return `Updated: ${taskLine(merged)}`;
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

function intakeLine(user) {
  const i = P.readIntake(user);
  if (!i) return 'intake: not filled';
  return `intake: role=${i.role || '-'} wake=${i.wake || '-'} sleep=${i.sleep || '-'} busy=${i.busy_start && i.busy_end ? `${i.busy_start}-${i.busy_end} ${(i.busy_days || []).join(',')}` : 'none'} focus=${i.focus_time || '-'} max_focus=${i.focus_minutes || '-'}m daily_for_goals=${i.daily_minutes || '-'}m`;
}

const draftLine = d => [d.id, d.date, d.start_time ? `${d.start_time}-${d.end_time || ''}` : 'allday', d.title, d.category, d.priority, d.duration_minutes ? `${d.duration_minutes}m` : ''].join('|');

async function buildAppState(db, user, language, tz) {
  const now = P.localNow(tz);
  const tasks = await db.prepare('SELECT * FROM tasks WHERE user_id = ? AND date >= ? AND date <= ? ORDER BY date ASC, start_time ASC LIMIT 80')
    .all(user.id, P.addDays(now.date, -2), P.addDays(now.date, 7));
  const blocks = await db.prepare('SELECT block_type, label, start_time, end_time, days FROM routine_blocks WHERE user_id = ? ORDER BY start_time').all(user.id);
  const disruptions = await db.prepare('SELECT kind, date, start_time, end_time, note FROM disruptions WHERE user_id = ? AND date >= ? AND date <= ? ORDER BY date LIMIT 15')
    .all(user.id, P.addDays(now.date, -1), P.addDays(now.date, 14));
  const goals = await P.goalsWithProgress(db, user.id, tz, { includeDone: false });
  const health = await db.prepare(`SELECT checkin_date, sleep_duration, sleep_quality, energy_level, exercise_duration, water_ml, discomfort
    FROM health_checkins WHERE user_id = ? ORDER BY checkin_date DESC LIMIT 5`).all(user.id);
  const mood = await db.prepare(`SELECT checkin_date, mood, stress_level, motivation_level, emotional_notes
    FROM mood_checkins WHERE user_id = ? ORDER BY checkin_date DESC LIMIT 5`).all(user.id);
  const daysText = d => (d === 'mon,tue,wed,thu,fri,sat,sun' ? 'every day' : d === 'mon,tue,wed,thu,fri' ? 'mon-fri' : d);
  const psych = parseJSON(user.psych_profile);
  return [
    `today: ${now.date} (${now.weekday}) ${now.time} ${now.timezone}; reply language: ${language}`,
    intakeLine(user),
    `profile: ${user.full_name}${user.personal_goals ? '; goals: ' + String(user.personal_goals).slice(0, 200) : ''}`,
    psych ? `psych: ${Object.entries(psych).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}=${v}`).join(', ')}` : 'psych: not set',
    `blocks:\n${blocks.map(b => `${b.block_type}${b.label ? ` "${b.label}"` : ''} ${b.start_time}-${b.end_time} ${daysText(b.days)}`).join('\n') || 'none'}`,
    `tasks (id|date|time|title|category|priority|status|duration|deadline|goal):\n${tasks.map(taskLine).join('\n') || 'none'}`,
    `goals:\n${goals.map(g => `${g.id} "${g.title}" deadline ${g.deadline || '-'} ${g.priority}; ${g.progress.percent}% (${g.progress.done_minutes}/${g.progress.planned_minutes}m), scheduled ahead ${g.progress.scheduled_minutes_ahead}m, forecast ${g.progress.forecast.projected_date || '-'}${g.progress.forecast.days_vs_deadline != null ? ` (${g.progress.forecast.days_vs_deadline} days vs deadline)` : ''}; feasibility ${g.progress.feasibility.level}`).join('\n') || 'none'}`,
    `disruptions:\n${disruptions.map(x => `${x.date} ${x.start_time ? `${x.start_time}-${x.end_time}` : 'all day'} ${x.kind}${x.note ? ': ' + String(x.note).slice(0, 120) : ''}`).join('\n') || 'none'}`,
    `health (date sleep quality energy exercise water):\n${health.map(h => `${h.checkin_date} ${h.sleep_duration ?? '-'}h ${h.sleep_quality || '-'} e${h.energy_level ?? '-'} ex${h.exercise_duration || 0}m ${h.water_ml ?? '-'}ml${h.discomfort ? ' pain:' + String(h.discomfort).slice(0, 60) : ''}`).join('\n') || 'none'}`,
    `mood (date mood stress motivation):\n${mood.map(m => `${m.checkin_date} ${m.mood} s${m.stress_level ?? '-'} m${m.motivation_level ?? '-'}${m.emotional_notes ? ' "' + String(m.emotional_notes).slice(0, 80) + '"' : ''}`).join('\n') || 'none'}`
  ].join('\n');
}

async function callGroq(messages, model) {
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({ model, messages, tools: TOOLS, tool_choice: 'auto', max_completion_tokens: 2000 }),
    signal: AbortSignal.timeout(50000)
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    const err = new Error(`Groq HTTP ${res.status} (${model}): ${detail.slice(0, 300)}`);
    err.status = res.status;
    // Groq cho biết cần đợi bao lâu: header retry-after hoặc "try again in 10.095s" trong nội dung
    const header = Number(res.headers?.get?.('retry-after'));
    const m = detail.match(/try again in ([\d.]+)(ms|s)/i);
    err.retryAfterMs = header > 0 ? header * 1000 : m ? Number(m[1]) * (m[2].toLowerCase() === 'ms' ? 1 : 1000) : 5000;
    throw err;
  }
  return res.json();
}

/**
 * Gọi Groq, tự xử lý giới hạn token/phút (429): chuyển sang model dự phòng, hoặc đợi đúng thời gian
 * Groq yêu cầu rồi thử lại, trong giới hạn RETRY_BUDGET_MS cho cả tin nhắn.
 */
async function callGroqResilient(messages, ctx) {
  for (;;) {
    try {
      return await callGroq(messages, ctx.model);
    } catch (err) {
      if (err.status !== 429) throw err;
      if (ctx.model !== FALLBACK_MODEL && FALLBACK_MODEL && !ctx.triedFallback) {
        console.warn(`[LifeCare AI] ${ctx.model} hết hạn mức, chuyển sang ${FALLBACK_MODEL}`);
        ctx.triedFallback = true;
        ctx.primaryBlockedUntil = Date.now() + err.retryAfterMs;
        ctx.model = FALLBACK_MODEL;
        continue;
      }
      // Cả hai model đều hết hạn mức: đợi model nào hồi sớm hơn
      const waitPrimary = ctx.primaryBlockedUntil ? Math.max(0, ctx.primaryBlockedUntil - Date.now()) : Infinity;
      const wait = Math.min(err.retryAfterMs, waitPrimary) + 300;
      if (wait > MAX_SINGLE_WAIT_MS || Date.now() - ctx.startedAt + wait > RETRY_BUDGET_MS) {
        err.retryAfterMs = wait;
        throw err;
      }
      if (waitPrimary < err.retryAfterMs) ctx.model = MODEL;
      console.warn(`[LifeCare AI] Hết hạn mức token, đợi ${Math.round(wait / 100) / 10}s rồi thử lại (${ctx.model})`);
      await new Promise(r => setTimeout(r, wait));
    }
  }
}

function describeError(err, language) {
  const vi = language !== 'en';
  if (err.status === 401) return vi ? 'API key của trợ lý AI không hợp lệ. Kiểm tra GROQ_API_KEY trên server.' : 'The AI API key is invalid. Check GROQ_API_KEY on the server.';
  if (err.status === 429) {
    const sec = Math.max(5, Math.ceil((err.retryAfterMs || 10000) / 1000));
    return vi
      ? `Trợ lý AI đang hết lượt dùng miễn phí trong phút này (giới hạn của Groq). Mình đã tự đợi và thử lại nhưng chưa được. Bấm "Thử lại" sau khoảng ${sec} giây nhé.`
      : `The AI hit Groq's free per-minute limit; automatic retries didn't succeed. Press "Retry" in about ${sec} seconds.`;
  }
  if (err.status === 413) return vi ? 'Yêu cầu quá dài so với giới hạn gói miễn phí của Groq. Hãy thử lập lịch cho ít ngày hơn.' : "The request is too long for Groq's free tier. Try planning fewer days.";
  if (err.name === 'TimeoutError') return vi ? 'Trợ lý AI phản hồi quá lâu, thử gửi lại nhé.' : 'The AI took too long to respond, please try again.';
  return vi ? 'Trợ lý AI đang gặp sự cố, thử lại sau ít phút nhé.' : 'The AI assistant hit a problem, please try again in a moment.';
}

/**
 * Trả lời một tin nhắn. Tin nhắn của người dùng phải đã được lưu vào ai_chats trước khi gọi.
 * @returns {{ reply: string, type: string, tasksChanged: object }}
 */
async function generateLLMReply(db, user, userMessage, { mode = 'general', language = 'vi', intent = null, tz, draftTasks = null, historySince = null } = {}) {
  const changes = { added: 0, updated: 0, deleted: 0, goals: 0, progress: 0, disruptions: 0 };
  // Màn hình "Tạo lịch trình": AI chỉ sửa bản nháp, người dùng bấm "Áp dụng" mới lưu.
  const draft = intent === 'create_schedule' ? cleanDraft(draftTasks) : null;

  // historySince: chỉ đọc tin nhắn từ mốc này (màn hình "Tạo lịch trình" mở lại thì bắt đầu sạch)
  const past = historySince
    ? await db.prepare('SELECT role, message FROM ai_chats WHERE user_id = ? AND created_at >= ? ORDER BY created_at DESC LIMIT ?')
      .all(user.id, historySince, HISTORY_LIMIT + 1)
    : await db.prepare('SELECT role, message FROM ai_chats WHERE user_id = ? ORDER BY created_at DESC LIMIT ?')
      .all(user.id, HISTORY_LIMIT + 1);
  past.reverse();
  past.pop(); // bỏ tin nhắn hiện tại (đã lưu), sẽ thêm lại kèm app_state
  while (past.length && past[0].role !== 'user') past.shift();

  let appState = await buildAppState(db, user, language, tz);
  if (draft) appState += `\ndraft (id|date|time|title|category|priority|duration), not saved yet:\n${draft.tasks.map(draftLine).join('\n') || 'empty'}`;
  let system = SYSTEM_PROMPT;
  if (MODE_HINTS[mode]) system += `\n\n${MODE_HINTS[mode]}`;
  if (INTENT_HINTS[intent]) system += `\n\nPurpose of this request: ${INTENT_HINTS[intent]}`;
  const messages = [
    { role: 'system', content: system },
    ...past.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.message).slice(0, HISTORY_MSG_CHARS) })),
    { role: 'user', content: `<app_state>\n${appState}\n</app_state>\n\n${userMessage.slice(0, 4000)}` }
  ];

  const ctx = { model: MODEL, startedAt: Date.now(), triedFallback: false, primaryBlockedUntil: 0 };
  try {
    let reply = '';
    for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
      const data = await callGroqResilient(messages, ctx);
      const msg = data.choices?.[0]?.message || {};
      if (msg.content) reply += (reply ? '\n\n' : '') + msg.content.trim();
      const calls = msg.tool_calls || [];
      messages.push({ role: 'assistant', content: msg.content || '', ...(calls.length ? { tool_calls: calls } : {}) });
      if (calls.length === 0) break;
      for (const call of calls) {
        const result = await runTool(db, user, call.function?.name, call.function?.arguments, changes, tz, draft);
        messages.push({ role: 'tool', tool_call_id: call.id, content: result });
      }
    }
    if (!reply) {
      reply = language === 'en' ? 'Done! I have updated your planner.' : 'Xong rồi! Mình đã cập nhật lịch của bạn.';
    }
    return { reply, type: 'llm_response', tasksChanged: changes, draftTasks: draft ? draft.tasks : undefined };
  } catch (err) {
    console.error('[LifeCare AI] Groq call failed:', err.message);
    // Bản nháp đã lập xong, chỉ lượt trả lời cuối bị giới hạn (thường là hết token/phút):
    // vẫn đưa bản nháp cho người dùng xem và áp dụng, không báo lỗi.
    if (draft && changes.draft && draft.tasks.length) {
      const n = draft.tasks.length;
      return {
        reply: language === 'en'
          ? `Your draft is ready: ${n} sessions, none overlapping your schedule. Check it on the right and press "Apply to timetable" when it looks right, or tell me what to change.`
          : `Bản nháp đã xong: ${n} buổi, không trùng lịch có sẵn. Xem bên phải, thấy ổn thì bấm "Áp dụng vào thời gian biểu", hoặc nhắn mình cần đổi gì.`,
        type: 'llm_response',
        draftTasks: draft.tasks,
        tasksChanged: changes
      };
    }
    // Có thể đã đổi một phần dữ liệu trước khi lỗi: vẫn báo để giao diện tải lại.
    return { reply: describeError(err, language), draftTasks: draft ? draft.tasks : undefined, type: 'error', retryable: err.status === 429 || err.name === 'TimeoutError' || err.status >= 500, tasksChanged: changes };
  }
}

/** Bản nháp người dùng gửi lại (đang xem trên màn hình): chỉ giữ việc hợp lệ, đánh lại id draft_N. */
function cleanDraft(list) {
  const draft = { tasks: [], seq: 0 };
  for (const raw of Array.isArray(list) ? list.slice(0, 120) : []) {
    const [t] = cleanTaskFields(raw, false);
    if (t) draft.tasks.push({ ...t, id: `draft_${++draft.seq}` });
  }
  return draft;
}

const isLLMConfigured = () => Boolean(process.env.GROQ_API_KEY);

module.exports = { generateLLMReply, isLLMConfigured, cleanTaskFields, INTENT_HINTS };
