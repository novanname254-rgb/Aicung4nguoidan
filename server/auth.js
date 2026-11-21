const crypto = require('node:crypto');
const { getDb, hashPassword, verifyPassword } = require('./db');

// Seed default demo user if development or explicitly enabled
function ensureDemoUser() {
  // If in strict production without DEMO_MODE, do not seed demo credentials
  if (process.env.NODE_ENV === 'production' && !process.env.ENABLE_DEMO_SEED) {
    return;
  }
  const db = getDb();
  const demoEmail = 'alex.balance@lifecare.app';
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(demoEmail);
  if (!existing) {
    const userId = 'usr_demo_1001';
    const demoPassword = process.env.DEMO_USER_PASSWORD || 'LifeCare2026!';
    const { hash, salt } = hashPassword(demoPassword);
    const now = new Date().toISOString();
    
    db.prepare(`
      INSERT INTO users (id, email, password_hash, salt, full_name, avatar, dob, gender, personal_goals, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      demoEmail,
      hash,
      salt,
      'Alex Rivera',
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=250&q=80',
      '1998-05-14',
      'Non-binary / Other',
      'Maintain mindful balance between graduate research, daily fitness, hydration, and emotional well-being.',
      now,
      now
    );

    // Default settings
    db.prepare(`
      INSERT INTO user_settings (id, user_id, theme, language, quiet_hours_start, quiet_hours_end, remind_water, remind_break, remind_health, remind_mood, remind_tasks, notification_frequency, updated_at)
      VALUES (?, ?, 'light', 'en', '22:00', '07:00', 1, 1, 1, 1, 1, 'normal', ?)
    `).run('set_demo_1001', userId, now);

    // Seed some initial realistic data across previous 7 days
    seedInitialDemoData(userId);
  }
}

function seedInitialDemoData(userId) {
  const db = getDb();
  const today = new Date();

  // Helper date offset
  const getDateStr = (offsetDays) => {
    const d = new Date(today);
    d.setDate(d.getDate() - offsetDays);
    return d.toISOString().split('T')[0];
  };

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
    // Past days tasks
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

  const insertTask = db.prepare(`
    INSERT OR IGNORE INTO tasks (id, user_id, title, description, category, priority, date, start_time, end_time, status, is_event, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'), datetime('now'))
  `);
  for (const t of tasks) {
    insertTask.run(t.id, userId, t.title, t.description, t.category, t.priority, t.date, t.start_time, t.end_time, t.status);
  }

  // Seed 7 days of Health Check-ins
  const healthData = [
    { days: 0, sleep: 7.5, qual: 'Good', cond: 'Good', energy: 4, ex: 'Yes', water: 2.2, disc: '', notes: 'Felt well rested, morning yoga felt invigorating.' },
    { days: 1, sleep: 7.0, qual: 'Good', cond: 'Good', energy: 4, ex: 'Yes', water: 2.4, disc: '', notes: 'Good energy throughout the afternoon.' },
    { days: 2, sleep: 6.5, qual: 'Average', cond: 'Normal', energy: 3, ex: 'No', water: 1.8, disc: 'Slight lower back stiffness from sitting', notes: 'Need to stand up more frequently.' },
    { days: 3, sleep: 8.0, qual: 'Very Good', cond: 'Very Good', energy: 5, ex: 'Yes', water: 2.5, disc: '', notes: 'Super energized today after solid 8h sleep!' },
    { days: 4, sleep: 7.0, qual: 'Good', cond: 'Normal', energy: 4, ex: 'Yes', water: 2.1, disc: '', notes: 'Steady pace, hydrated regularly.' },
    { days: 5, sleep: 6.0, qual: 'Poor', cond: 'Tired', energy: 2, ex: 'No', water: 1.5, disc: 'Mild headache in evening', notes: 'Stayed up reading late, felt sluggish.' },
    { days: 6, sleep: 7.5, qual: 'Good', cond: 'Good', energy: 4, ex: 'Yes', water: 2.0, disc: '', notes: 'Recovered well, took a brisk outdoor walk.' }
  ];

  const insertHealth = db.prepare(`
    INSERT OR IGNORE INTO health_checkins (id, user_id, checkin_date, sleep_duration, sleep_quality, physical_condition, energy_level, exercise_status, water_intake, discomfort, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);
  for (const h of healthData) {
    insertHealth.run(
      `health_demo_${h.days}`,
      userId,
      getDateStr(h.days),
      h.sleep,
      h.qual,
      h.cond,
      h.energy,
      h.ex,
      h.water,
      h.disc,
      h.notes
    );
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

  const insertMood = db.prepare(`
    INSERT OR IGNORE INTO mood_checkins (id, user_id, checkin_date, mood, emoji, stress_level, motivation_level, connected_score, relaxed_score, anxiety_score, emotional_notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);
  for (const m of moodData) {
    insertMood.run(
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
  }

  // Seed a sample reminder notification
  const insertNotif = db.prepare(`
    INSERT OR IGNORE INTO notifications (id, user_id, title, message, notification_type, notification_time, is_read, is_enabled, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, 1, datetime('now'))
  `);
  insertNotif.run(
    'notif_demo_1',
    userId,
    'Daily Hydration Check 💧',
    'Drink a fresh glass of water to keep your body vibrant and focused.',
    'health',
    '14:30'
  );
  insertNotif.run(
    'notif_demo_2',
    userId,
    'Upcoming: Team Product Sync 📅',
    'Starting in 30 minutes at 14:00.',
    'schedule',
    '13:30'
  );
}

// Session management
function createSession(userId) {
  const db = getDb();
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO sessions (token, user_id, expires_at, created_at)
    VALUES (?, ?, ?, ?)
  `).run(token, userId, expiresAt, now);

  return { token, expiresAt };
}

function getUserFromSession(token) {
  if (!token) return null;
  const db = getDb();
  const session = db.prepare('SELECT user_id, expires_at FROM sessions WHERE token = ?').get(token);
  if (!session) return null;
  if (Date.now() > session.expires_at) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }
  const user = db.prepare(`
    SELECT id, email, full_name, avatar, dob, gender, personal_goals, created_at, updated_at
    FROM users WHERE id = ?
  `).get(session.user_id);
  return user || null;
}

function deleteSession(token) {
  if (!token) return;
  const db = getDb();
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

module.exports = {
  ensureDemoUser,
  createSession,
  getUserFromSession,
  deleteSession
};
