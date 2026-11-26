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

async function seedInitialDemoData(userId, lang = 'vi') {
  const db = getDb();
  const S = (vi, en) => (lang === 'en' ? en : vi); // nội dung mẫu theo ngôn ngữ đang chọn
  // Mã bản ghi mẫu: tài khoản demo giữ mã cũ, tài khoản khách thêm hậu tố riêng để không trùng.
  const sid = base => (userId === DEFAULT_USER_ID ? base : `${base}_${userId.slice(-12)}`);
  const GOAL_ID = sid('goal_demo_1');
  // Ngày theo múi giờ người dùng (không dùng UTC, tránh lệch ngày trước 7h sáng ở Việt Nam)
  const todayStr = P.localNow().date;
  const getDateStr = (offsetDays) => P.addDays(todayStr, -offsetDays);

  // Seed tasks for today and upcoming
  const tasks = [
    {
      id: sid('task_demo_1'),
      title: S('Yoga buổi sáng & thiền thở', 'Morning Yoga & Breathing Meditation'),
      description: S('Giãn cơ nhẹ 20 phút và bài thở 4-7-8', 'Gentle 20-min vinyasa stretch and 4-7-8 deep breathing routine'),
      category: 'Exercise',
      priority: 'medium',
      date: getDateStr(0),
      start_time: '07:30',
      end_time: '08:00',
      status: 'completed'
    },
    {
      id: sid('task_demo_2'),
      title: S('Đọc bài báo về kiến trúc hệ thống', 'Review System Architecture Paper'),
      description: S('Phân tích đánh đổi của cơ sở dữ liệu phân tán và ghi tóm tắt', 'Analyze distributed database trade-offs and draft summary notes'),
      category: 'Study',
      priority: 'high',
      date: getDateStr(0),
      start_time: '09:00',
      end_time: '11:30',
      status: 'completed'
    },
    {
      id: sid('task_demo_3'),
      title: S('Ăn trưa chánh niệm & uống nước', 'Mindful Lunch & Hydration Break'),
      description: S('Ăn xa màn hình và uống một cốc nước lớn', 'Eat away from screens and drink a large glass of water'),
      category: 'Rest',
      priority: 'medium',
      date: getDateStr(0),
      start_time: '12:00',
      end_time: '13:00',
      status: 'completed'
    },
    {
      id: sid('task_demo_4'),
      title: S('Họp nhóm dự án', 'Team Product Sync & Standup'),
      description: S('Thống nhất việc cần giao trong tuần và gỡ vướng mắc', 'Align on sprint deliverables and unblock dependencies'),
      category: 'Work',
      priority: 'high',
      date: getDateStr(0),
      start_time: '14:00',
      end_time: '15:00',
      status: 'pending'
    },
    {
      id: sid('task_demo_5'),
      title: S('Đi dạo buổi tối ở công viên', 'Evening Walk in Community Park'),
      description: S('Thư giãn không điện thoại, hít thở không khí trong lành', 'Unwind without phone, get fresh air and sunshine'),
      category: 'Personal',
      priority: 'low',
      date: getDateStr(0),
      start_time: '17:30',
      end_time: '18:15',
      status: 'pending'
    },
    {
      id: sid('task_demo_6'),
      title: S('Viết nhật ký trên LifeCare', 'Reflect & Journal in LifeCare'),
      description: S('Ghi 3 điều biết ơn và ghi lại tâm trạng', 'Write down 3 things I am grateful for and log mood'),
      category: 'Rest',
      priority: 'low',
      date: getDateStr(0),
      start_time: '21:00',
      end_time: '21:20',
      status: 'pending'
    },
    {
      id: sid('task_demo_7'),
      title: S('Nộp báo cáo thí nghiệm', 'Submit Bi-weekly Lab Report'),
      description: S('Hoàn thiện tài liệu tham khảo và nộp PDF', 'Finalize references and submit PDF to portal'),
      category: 'Study',
      priority: 'high',
      date: getDateStr(1),
      start_time: '10:00',
      end_time: '12:00',
      status: 'completed'
    },
    {
      id: sid('task_demo_8'),
      title: S('Đạp xe 30 phút', '30-minute Cardio Cycling'),
      description: S('Tập trong nhà, giữ nhịp tim vùng 2', 'Indoor trainer session maintaining zone 2 cardio'),
      category: 'Exercise',
      priority: 'medium',
      date: getDateStr(1),
      start_time: '16:00',
      end_time: '16:40',
      status: 'completed'
    },
    {
      id: sid('task_demo_9'),
      title: S('Đi chợ: rau xanh & trái cây', 'Grocery Restock: Fresh Greens & Fruits'),
      description: S('Mua dâu, rau chân vịt, hạnh nhân và sữa yến mạch', 'Buy berries, spinach, almonds and oat milk'),
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
    { days: 0, sleep: 7.5, qual: 'Good', cond: 'Good', energy: 4, ex: 'Yes', water_ml: 2200, disc: '', notes: S('Ngủ đủ giấc, yoga buổi sáng rất sảng khoái.', 'Felt well rested, morning yoga felt invigorating.') },
    { days: 1, sleep: 7.0, qual: 'Good', cond: 'Good', energy: 4, ex: 'Yes', water_ml: 2400, disc: '', notes: S('Năng lượng tốt suốt buổi chiều.', 'Good energy throughout the afternoon.') },
    { days: 2, sleep: 6.5, qual: 'Average', cond: 'Normal', energy: 3, ex: 'No', water_ml: 1800, disc: S('Hơi cứng lưng dưới vì ngồi lâu', 'Slight lower back stiffness from sitting'), notes: S('Cần đứng dậy vận động thường xuyên hơn.', 'Need to stand up more frequently.') },
    { days: 3, sleep: 8.0, qual: 'Very Good', cond: 'Very Good', energy: 5, ex: 'Yes', water_ml: 2500, disc: '', notes: S('Rất nhiều năng lượng sau 8 tiếng ngủ ngon!', 'Super energized today after solid 8h sleep!') },
    { days: 4, sleep: 7.0, qual: 'Good', cond: 'Normal', energy: 4, ex: 'Yes', water_ml: 2100, disc: '', notes: S('Nhịp độ đều, uống nước đầy đủ.', 'Steady pace, hydrated regularly.') },
    { days: 5, sleep: 6.0, qual: 'Poor', cond: 'Tired', energy: 2, ex: 'No', water_ml: 1500, disc: S('Đau đầu nhẹ buổi tối', 'Mild headache in evening'), notes: S('Thức khuya đọc sách, thấy uể oải.', 'Stayed up reading late, felt sluggish.') },
    { days: 6, sleep: 7.5, qual: 'Good', cond: 'Good', energy: 4, ex: 'Yes', water_ml: 2000, disc: '', notes: S('Hồi phục tốt, đi bộ nhanh ngoài trời.', 'Recovered well, took a brisk outdoor walk.') }
  ];

  for (const h of healthData) {
    try {
      await db.prepare(`
        INSERT OR IGNORE INTO health_checkins (id, user_id, checkin_date, sleep_duration, sleep_quality, physical_condition, energy_level, exercise_status, water_ml, discomfort, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(
        sid(`health_demo_${h.days}`),
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
    { days: 0, mood: 'Relaxed', emoji: '😌', stress: 2, mot: 4, conn: 4, rel: 4, anx: 1, notes: S('Thấy cân bằng và vững vàng. Kế hoạch hôm nay rõ ràng.', 'Feeling centered and balanced. Clear plan for today.') },
    { days: 1, mood: 'Happy', emoji: '😊', stress: 2, mot: 5, conn: 5, rel: 3, anx: 1, notes: S('Nói chuyện vui với bạn bè và xong một cột mốc dự án.', 'Had great talk with friends and finished project milestone.') },
    { days: 2, mood: 'Tired', emoji: '🥱', stress: 3, mot: 3, conn: 3, rel: 2, anx: 2, notes: S('Hơi kiệt sức vì họp liên tục. Cần đi ngủ sớm.', 'A bit drained from back-to-back meetings. Need early bedtime.') },
    { days: 3, mood: 'Excited', emoji: '✨', stress: 1, mot: 5, conn: 4, rel: 4, anx: 1, notes: S('Nhận được góp ý tích cực về đề cương nghiên cứu.', 'Received positive feedback on research proposal.') },
    { days: 4, mood: 'Normal', emoji: '🙂', stress: 2, mot: 4, conn: 3, rel: 3, anx: 2, notes: S('Một ngày làm việc bình thường, giữ được bình tĩnh.', 'Standard productive day, kept calm.') },
    { days: 5, mood: 'Stressed', emoji: '😣', stress: 4, mot: 2, conn: 2, rel: 1, anx: 3, notes: S('Thấy hơi trễ hạn, tự nhắc mình hít thở sâu.', 'Felt a bit behind on deadlines, reminded myself to breathe.') },
    { days: 6, mood: 'Relaxed', emoji: '🌿', stress: 2, mot: 4, conn: 4, rel: 4, anx: 1, notes: S('Dành thời gian chất lượng ngoài thiên nhiên.', 'Spent quality time outdoors in nature.') }
  ];

  for (const m of moodData) {
    try {
      await db.prepare(`
        INSERT OR IGNORE INTO mood_checkins (id, user_id, checkin_date, mood, emoji, stress_level, motivation_level, connected_score, relaxed_score, anxiety_score, emotional_notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(
        sid(`mood_demo_${m.days}`),
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
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(sid(`blk_demo_${i}`), userId, b.block_type, b.label, b.start_time, b.end_time, b.days.join(','), now, now);
    }
    await db.prepare(`INSERT OR IGNORE INTO goals (id, user_id, title, description, deadline, estimated_minutes, priority, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'high', 'active', ?, ?)`)
      .run(GOAL_ID, userId, S('Hoàn thành báo cáo nghiên cứu', 'Finish the research report'), S('Báo cáo 20 trang về kiến trúc cơ sở dữ liệu phân tán', '20-page report on distributed database architecture'), getDateStr(-12), 900, getDateStr(5) + 'T08:00:00.000Z', now);
    const goalTasks = [
      [sid('task_goal_1'), S('Đọc và tóm tắt 3 bài báo chính', 'Read and summarize 3 key papers'), getDateStr(3), '20:00', '21:30', 90, 'completed'],
      [sid('task_goal_2'), S('Lập dàn ý báo cáo', 'Outline the report'), getDateStr(1), '20:00', '21:00', 60, 'completed'],
      [sid('task_goal_3'), S('Viết phần 1: Tổng quan', 'Write part 1: Overview'), getDateStr(-1), '20:00', '21:30', 90, 'pending'],
      [sid('task_goal_4'), S('Viết phần 2: So sánh kiến trúc', 'Write part 2: Architecture comparison'), getDateStr(-3), '19:45', '21:15', 90, 'pending']
    ];
    for (const [id, title, date, start, end, dur, status] of goalTasks) {
      await db.prepare(`INSERT OR IGNORE INTO tasks (id, user_id, title, description, category, priority, date, start_time, end_time, status, is_event, goal_id, duration_minutes, deadline, created_at, updated_at)
        VALUES (?, ?, ?, '', 'Study', 'high', ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`)
        .run(id, userId, title, date, start, end, status, GOAL_ID, dur, getDateStr(-12), now, now);
      if (status === 'completed') {
        await db.prepare(`INSERT OR IGNORE INTO progress_logs (id, user_id, goal_id, task_id, log_date, minutes, kind, note, created_at)
          VALUES (?, ?, ?, ?, ?, ?, 'task_done', ?, ?)`).run('log_' + id, userId, GOAL_ID, id, date, dur, title, now);
      }
    }
    await db.prepare(`INSERT OR IGNORE INTO progress_logs (id, user_id, goal_id, task_id, log_date, minutes, kind, note, created_at)
      VALUES (?, ?, ?, NULL, ?, 45, 'extra', ?, ?)`).run(sid('log_demo_extra'), userId, GOAL_ID, getDateStr(2), S('Đọc thêm tài liệu ngoài kế hoạch', 'Extra reading outside the plan'), now);
  } catch (e) {
    console.warn('[LifeCare Seed] Planning demo data:', e.message);
  }

  // Seed sample reminder notifications
  try {
    await db.prepare(`
      INSERT OR IGNORE INTO notifications (id, user_id, title, message, notification_type, notification_time, is_read, is_enabled, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, 1, datetime('now'))
    `).run(
      sid('notif_demo_1'),
      userId,
      S('Nhắc uống nước 💧', 'Daily Hydration Check 💧'),
      S('Uống một cốc nước để cơ thể tỉnh táo và tập trung.', 'Drink a fresh glass of water to keep your body vibrant and focused.'),
      'health',
      '14:30'
    );
    await db.prepare(`
      INSERT OR IGNORE INTO notifications (id, user_id, title, message, notification_type, notification_time, is_read, is_enabled, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, 1, datetime('now'))
    `).run(
      sid('notif_demo_2'),
      userId,
      S('Sắp tới: Họp nhóm dự án 📅', 'Upcoming: Team Product Sync 📅'),
      S('Bắt đầu sau 30 phút, lúc 14:00.', 'Starting in 30 minutes at 14:00.'),
      'schedule',
      '13:30'
    );
  } catch (e) {}
}

// ------------------------------------------------------------------
// Tài khoản khách: dùng thử ngay, KHÔNG lưu dữ liệu.
// Mã người dùng bắt đầu bằng "guest_"; db.js không bao giờ ghi các dòng này ra Google Sheet / JSON.
// Dữ liệu khách chỉ nằm trong bộ nhớ server và mất khi khách đăng xuất, sau 24 giờ, hoặc khi server khởi động lại.
// ------------------------------------------------------------------
const GUEST_PREFIX = 'guest_';
const GUEST_TTL_MS = 24 * 60 * 60 * 1000;
const isGuestId = id => typeof id === 'string' && id.startsWith(GUEST_PREFIX);

async function cleanupOldGuests() {
  const db = getDb();
  const cutoff = new Date(Date.now() - GUEST_TTL_MS).toISOString();
  await db.prepare("DELETE FROM users WHERE id LIKE 'guest\\_%' ESCAPE '\\' AND created_at < ?").run(cutoff);
}

async function createGuestUser({ withSampleData = true, lang = 'vi' } = {}) {
  const db = getDb();
  await cleanupOldGuests();
  const id = GUEST_PREFIX + crypto.randomUUID().replace(/-/g, '');
  const now = new Date().toISOString();
  const { hash, salt } = hashPassword(crypto.randomBytes(24).toString('hex')); // không ai đăng nhập lại bằng mật khẩu được
  await db.prepare(`
    INSERT INTO users (id, email, password_hash, salt, full_name, avatar, dob, gender, personal_goals, psych_profile, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?)
  `).run(
    id, `${id}@guest.lifecare.local`, hash, salt, lang === 'en' ? 'Guest' : 'Khách',
    `https://api.dicebear.com/7.x/thumbs/svg?seed=${id}`,
    'Dùng thử LifeCare',
    JSON.stringify({ willpower: 3, stress_tolerance: 3, motivation_source: 'Mục tiêu dài hạn', best_focus_time: 'morning', max_focus_minutes: 45, notes: null }),
    now, now
  );
  await db.prepare(`INSERT INTO user_settings (id, user_id, theme, language, updated_at) VALUES (?, ?, 'light', 'vi', ?)`)
    .run('set_' + id, id, now);
  if (withSampleData) await seedInitialDemoData(id, lang);
  return id;
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
  createGuestUser,
  isGuestId,
  GUEST_PREFIX,
  getDefaultUser,
  createSession,
  getUserFromSession,
  deleteSession
};
