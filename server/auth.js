const crypto = require('node:crypto');
const { getDb, hashPassword, verifyPassword } = require('./db');
const P = require('./planning');

// Default active user information for guest / no-login mode
const DEFAULT_USER_ID = 'usr_demo_1001';
const DEFAULT_USER_EMAIL = 'alex.balance@lifecare.app';

// Seed default user (Always ensured so guest/no-login mode works seamlessly)
async function ensureDemoUser() {
  const db = getDb();
  const existing = await db.prepare('SELECT id FROM users WHERE id = ? OR email = ?').get(DEFAULT_USER_ID, DEFAULT_USER_EMAIL);
  
  if (!existing) {
    const demoPassword = process.env.DEMO_USER_PASSWORD || 'LifeCare2026!';
    const { hash, salt } = hashPassword(demoPassword);
    const now = new Date().toISOString();
    
    await db.prepare(`
      INSERT OR REPLACE INTO users (id, email, password_hash, salt, full_name, avatar, dob, gender, personal_goals, psych_profile, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      DEFAULT_USER_ID,
      DEFAULT_USER_EMAIL,
      hash,
      salt,
      'Alex Rivera',
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=250&q=80',
      '1998-05-14',
      'Non-binary / Other',
      'Maintain mindful balance between graduate research, daily fitness, hydration, and emotional well-being.',
      JSON.stringify({ willpower: 3, stress_tolerance: 3, motivation_source: 'Mục tiêu dài hạn', best_focus_time: 'morning', max_focus_minutes: 50, notes: 'Dễ mất tập trung khi thiếu ngủ.' }),
      now,
      now
    );

    // Default settings
    await db.prepare(`
      INSERT OR REPLACE INTO user_settings (id, user_id, theme, language, quiet_hours_start, quiet_hours_end, remind_water, remind_break, remind_health, remind_mood, remind_tasks, notification_frequency, updated_at)
      VALUES (?, ?, 'light', 'vi', '22:00', '07:00', 1, 1, 1, 1, 1, 'normal', ?)
    `).run('set_demo_1001', DEFAULT_USER_ID, now);

    // Seed some initial realistic data across previous 7 days
    await seedInitialDemoData(DEFAULT_USER_ID);
  }
}

async function getDefaultUser() {
  const db = getDb();
  let user = null;
  try {
    user = await db.prepare('SELECT id, email, full_name, avatar, dob, gender, personal_goals, psych_profile, created_at, updated_at FROM users WHERE id = ?').get(DEFAULT_USER_ID);
  } catch (e) {
    console.warn('[LifeCare Auth] getDefaultUser query warning:', e.message);
  }
  
  if (!user) {
    await ensureDemoUser();
    try {
      user = await db.prepare('SELECT id, email, full_name, avatar, dob, gender, personal_goals, psych_profile, created_at, updated_at FROM users WHERE id = ?').get(DEFAULT_USER_ID);
    } catch (e) {}
  }

  return user || {
    id: DEFAULT_USER_ID,
    email: DEFAULT_USER_EMAIL,
    full_name: 'Alex Rivera (Khách)',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=250&q=80',
    dob: '1998-05-14',
    gender: 'Other',
    personal_goals: 'Lập kế hoạch & chăm sóc sức khỏe'
  };
}

async function seedInitialDemoData(userId) {
  const db = getDb();
  // Ngày theo múi giờ người dùng (không dùng UTC, tránh lệch ngày trước 7h sáng ở Việt Nam)
  const todayStr = P.localNow().date;
  const getDateStr = (offsetDays) => P.addDays(todayStr, -offsetDays);

  // Seed tasks for today and upcoming
  const tasks = [
    {
      id: 'task_demo_1',
      title: 'Morning Yoga & Breathing Meditation',
      description: 'Gentle 20-min vinyasa stretch and 4-7-8 deep breathing routine',
      category: 'Exercise',
      priority: 'medium',
      date: getDateStr(0),
      start_time: '07:30',
      end_time: '08:00',
      status: 'completed'
    },
    {
      id: 'task_demo_2',
      title: 'Review System Architecture Paper',
      description: 'Analyze distributed database trade-offs and draft summary notes',
      category: 'Study',
      priority: 'high',
      date: getDateStr(0),
      start_time: '09:00',
      end_time: '11:30',
      status: 'completed'
    },
    {
      id: 'task_demo_3',
      title: 'Mindful Lunch & Hydration Break',
      description: 'Eat away from screens and drink a large glass of water',
      category: 'Rest',
      priority: 'medium',
      date: getDateStr(0),
      start_time: '12:00',
      end_time: '13:00',
      status: 'completed'
    },
    {
      id: 'task_demo_4',
      title: 'Team Product Sync & Standup',
      description: 'Align on sprint deliverables and unblock dependencies',
      category: 'Work',
      priority: 'high',
      date: getDateStr(0),
      start_time: '14:00',
      end_time: '15:00',
      status: 'pending'
    },
    {
      id: 'task_demo_5',
      title: 'Evening Walk in Community Park',
      description: 'Unwind without phone, get fresh air and sunshine',
      category: 'Personal',
      priority: 'low',
      date: getDateStr(0),
      start_time: '17:30',
      end_time: '18:15',
      status: 'pending'
    },
    {
      id: 'task_demo_6',
      title: 'Reflect & Journal in LifeCare',
      description: 'Write down 3 things I am grateful for and log mood',
      category: 'Rest',
      priority: 'low',
      date: getDateStr(0),
      start_time: '21:00',
      end_time: '21:20',
      status: 'pending'
    },
    {
      id: 'task_demo_7',
      title: 'Submit Bi-weekly Lab Report',
      description: 'Finalize references and submit PDF to portal',
      category: 'Study',
      priority: 'high',
      date: getDateStr(1),
      start_time: '10:00',
      end_time: '12:00',
      status: 'completed'
    },
    {
      id: 'task_demo_8',
      title: '30-minute Cardio Cycling',
      description: 'Indoor trainer session maintaining zone 2 cardio',
      category: 'Exercise',
      priority: 'medium',
      date: getDateStr(1),
      start_time: '16:00',
      end_time: '16:40',
      status: 'completed'
    },
    {
      id: 'task_demo_9',
      title: 'Grocery Restock: Fresh Greens & Fruits',
      description: 'Buy berries, spinach, almonds and oat milk',
      category: 'Personal',
      priority: 'medium',
      date: getDateStr(2),
      start_time: '18:00',
      end_time: '19:00',
      status: 'completed'
    }
  ];

  for (const t of tasks) {
    try {
      await db.prepare(`
        INSERT OR IGNORE INTO tasks (id, user_id, title, description, category, priority, date, start_time, end_time, status, is_event, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'), datetime('now'))
      `).run(t.id, userId, t.title, t.description, t.category, t.priority, t.date, t.start_time, t.end_time, t.status);
    } catch (e) {}
  }

  // Seed 7 days of Health Check-ins
  const healthData = [
    { days: 0, sleep: 7.5, qual: 'Good', cond: 'Good', energy: 4, ex: 'Yes', water_ml: 2200, disc: '', notes: 'Felt well rested, morning yoga felt invigorating.' },
    { days: 1, sleep: 7.0, qual: 'Good', cond: 'Good', energy: 4, ex: 'Yes', water_ml: 2400, disc: '', notes: 'Good energy throughout the afternoon.' },
    { days: 2, sleep: 6.5, qual: 'Average', cond: 'Normal', energy: 3, ex: 'No', water_ml: 1800, disc: 'Slight lower back stiffness from sitting', notes: 'Need to stand up more frequently.' },
    { days: 3, sleep: 8.0, qual: 'Very Good', cond: 'Very Good', energy: 5, ex: 'Yes', water_ml: 2500, disc: '', notes: 'Super energized today after solid 8h sleep!' },
    { days: 4, sleep: 7.0, qual: 'Good', cond: 'Normal', energy: 4, ex: 'Yes', water_ml: 2100, disc: '', notes: 'Steady pace, hydrated regularly.' },
    { days: 5, sleep: 6.0, qual: 'Poor', cond: 'Tired', energy: 2, ex: 'No', water_ml: 1500, disc: 'Mild headache in evening', notes: 'Stayed up reading late, felt sluggish.' },
    { days: 6, sleep: 7.5, qual: 'Good', cond: 'Good', energy: 4, ex: 'Yes', water_ml: 2000, disc: '', notes: 'Recovered well, took a brisk outdoor walk.' }
  ];

  for (const h of healthData) {
    try {
      await db.prepare(`
        INSERT OR IGNORE INTO health_checkins (id, user_id, checkin_date, sleep_duration, sleep_quality, physical_condition, energy_level, exercise_status, water_ml, discomfort, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(
        `health_demo_${h.days}`,
        userId,
        getDateStr(h.days),
        h.sleep,
        h.qual,
        h.cond,
        h.energy,
        h.ex,
        h.water_ml,
        h.disc,
        h.notes
      );
    } catch (e) {}
  }

  // Seed 7 days of Mood Check-ins
  const moodData = [
    { days: 0, mood: 'Relaxed', emoji: '😌', stress: 2, mot: 4, conn: 4, rel: 4, anx: 1, notes: 'Feeling centered and balanced. Clear plan for today.' },
    { days: 1, mood: 'Happy', emoji: '😊', stress: 2, mot: 5, conn: 5, rel: 3, anx: 1, notes: 'Had great talk with friends and finished project milestone.' },
    { days: 2, mood: 'Tired', emoji: '🥱', stress: 3, mot: 3, conn: 3, rel: 2, anx: 2, notes: 'A bit drained from back-to-back meetings. Need early bedtime.' },
    { days: 3, mood: 'Excited', emoji: '✨', stress: 1, mot: 5, conn: 4, rel: 4, anx: 1, notes: 'Received positive feedback on research proposal.' },
    { days: 4, mood: 'Normal', emoji: '🙂', stress: 2, mot: 4, conn: 3, rel: 3, anx: 2, notes: 'Standard productive day, kept calm.' },
    { days: 5, mood: 'Stressed', emoji: '😣', stress: 4, mot: 2, conn: 2, rel: 1, anx: 3, notes: 'Felt a bit behind on deadlines, reminded myself to breathe.' },
    { days: 6, mood: 'Relaxed', emoji: '🌿', stress: 2, mot: 4, conn: 4, rel: 4, anx: 1, notes: 'Spent quality time outdoors in nature.' }
  ];

  for (const m of moodData) {
    try {
      await db.prepare(`
        INSERT OR IGNORE INTO mood_checkins (id, user_id, checkin_date, mood, emoji, stress_level, motivation_level, connected_score, relaxed_score, anxiety_score, emotional_notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(
        `mood_demo_${m.days}`,
        userId,
        getDateStr(m.days),
        m.mood,
        m.emoji,
        m.stress,
        m.mot,
        m.conn,
        m.rel,
        m.anx,
        m.notes
      );
    } catch (e) {}
  }

  // Thời gian biểu mẫu (thiết lập một lần, tự lặp mỗi tuần) + một mục tiêu lớn đã chia nhỏ
  try {
    const now = new Date().toISOString();
    for (const [i, b] of P.ROUTINE_TEMPLATES.university.entries()) {
      await db.prepare(`INSERT OR IGNORE INTO routine_blocks (id, user_id, block_type, label, start_time, end_time, days, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(`blk_demo_${i}`, userId, b.block_type, b.label, b.start_time, b.end_time, b.days.join(','), now, now);
    }
    await db.prepare(`INSERT OR IGNORE INTO goals (id, user_id, title, description, deadline, estimated_minutes, priority, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'high', 'active', ?, ?)`)
      .run('goal_demo_1', userId, 'Hoàn thành báo cáo nghiên cứu', 'Báo cáo 20 trang về kiến trúc cơ sở dữ liệu phân tán', getDateStr(-12), 900, getDateStr(5) + 'T08:00:00.000Z', now);
    const goalTasks = [
      ['task_goal_1', 'Đọc và tóm tắt 3 bài báo chính', getDateStr(3), '20:00', '21:30', 90, 'completed'],
      ['task_goal_2', 'Lập dàn ý báo cáo', getDateStr(1), '20:00', '21:00', 60, 'completed'],
      ['task_goal_3', 'Viết phần 1: Tổng quan', getDateStr(-1), '20:00', '21:30', 90, 'pending'],
      ['task_goal_4', 'Viết phần 2: So sánh kiến trúc', getDateStr(-3), '19:45', '21:15', 90, 'pending']
    ];
    for (const [id, title, date, start, end, dur, status] of goalTasks) {
      await db.prepare(`INSERT OR IGNORE INTO tasks (id, user_id, title, description, category, priority, date, start_time, end_time, status, is_event, goal_id, duration_minutes, deadline, created_at, updated_at)
        VALUES (?, ?, ?, '', 'Study', 'high', ?, ?, ?, ?, 0, 'goal_demo_1', ?, ?, ?, ?)`)
        .run(id, userId, title, date, start, end, status, dur, getDateStr(-12), now, now);
      if (status === 'completed') {
        await db.prepare(`INSERT OR IGNORE INTO progress_logs (id, user_id, goal_id, task_id, log_date, minutes, kind, note, created_at)
          VALUES (?, ?, 'goal_demo_1', ?, ?, ?, 'task_done', ?, ?)`).run('log_' + id, userId, id, date, dur, title, now);
      }
    }
    await db.prepare(`INSERT OR IGNORE INTO progress_logs (id, user_id, goal_id, task_id, log_date, minutes, kind, note, created_at)
      VALUES ('log_demo_extra', ?, 'goal_demo_1', NULL, ?, 45, 'extra', 'Đọc thêm tài liệu ngoài kế hoạch', ?)`).run(userId, getDateStr(2), now);
  } catch (e) {
    console.warn('[LifeCare Seed] Planning demo data:', e.message);
  }

  // Seed sample reminder notifications
  try {
    await db.prepare(`
      INSERT OR IGNORE INTO notifications (id, user_id, title, message, notification_type, notification_time, is_read, is_enabled, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, 1, datetime('now'))
    `).run(
      'notif_demo_1',
      userId,
      'Daily Hydration Check 💧',
      'Drink a fresh glass of water to keep your body vibrant and focused.',
      'health',
      '14:30'
    );
    await db.prepare(`
      INSERT OR IGNORE INTO notifications (id, user_id, title, message, notification_type, notification_time, is_read, is_enabled, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, 1, datetime('now'))
    `).run(
      'notif_demo_2',
      userId,
      'Upcoming: Team Product Sync 📅',
      'Starting in 30 minutes at 14:00.',
      'schedule',
      '13:30'
    );
  } catch (e) {}
}

// Session management
async function createSession(userId) {
  const db = getDb();
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days
  const now = new Date().toISOString();

  await db.prepare(`
    INSERT INTO sessions (token, user_id, expires_at, created_at)
    VALUES (?, ?, ?, ?)
  `).run(token, userId, expiresAt, now);

  return { token, expiresAt };
}

async function getUserFromSession(token) {
  if (!token) return null;
  const db = getDb();
  try {
    const session = await db.prepare('SELECT user_id, expires_at FROM sessions WHERE token = ?').get(token);
    if (!session) return null;
    if (Date.now() > session.expires_at) {
      await db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
      return null;
    }
    const user = await db.prepare(`
      SELECT id, email, full_name, avatar, dob, gender, personal_goals, psych_profile, created_at, updated_at
      FROM users WHERE id = ?
    `).get(session.user_id);
    return user || null;
  } catch (err) {
    console.warn('[LifeCare Auth] getUserFromSession error:', err.message);
    return null;
  }
}

async function deleteSession(token) {
  if (!token) return;
  const db = getDb();
  try {
    await db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  } catch (err) {}
}

module.exports = {
  ensureDemoUser,
  getDefaultUser,
  createSession,
  getUserFromSession,
  deleteSession
};
