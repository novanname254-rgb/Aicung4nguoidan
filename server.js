const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const url = require('node:url');
const crypto = require('node:crypto');

const { getDb, initDatabase, hashPassword, verifyPassword } = require('./server/db');
const P = require('./server/planning');
const { ensureDemoUser, createGuestUser, isGuestId, createSession, getUserFromSession, deleteSession } = require('./server/auth');
const { checkCrisisOrEmergency, generateAIWellnessReply, analyzeScheduleBalance, buildWeeklyReportData } = require('./server/ai-engine');
const { generateLLMReply, isLLMConfigured } = require('./server/llm-assistant');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// MIME types for static files
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json'
};

// Response helper
function sendJSON(res, statusCode, data, headers = {}) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Timezone, X-Data-Version',
    'Access-Control-Expose-Headers': 'X-Data-Version',
    ...headers
  });
  res.end(JSON.stringify(data));
}

// Parse request body
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      if (body.length > 5 * 1024 * 1024) { // 5MB limit
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

// Authentication middleware helper
async function getAuthUser(req) {
  const authHeader = req.headers['authorization'] || '';
  let token = '';
  if (authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (req.headers['cookie']) {
    const match = req.headers['cookie'].match(/lifecare_session=([^;]+)/);
    if (match) token = match[1];
  }
  // Không còn tự dùng chung tài khoản demo: phải đăng nhập hoặc chọn tài khoản khách.
  let user = token ? await getUserFromSession(token) : null;
  // Đọc-sau-khi-ghi: trình duyệt gửi phiên bản dữ liệu nó đã thấy (X-Data-Version). Nếu instance này
  // đang giữ bản cũ hơn (vì lần ghi vừa rồi chạy ở instance khác), cập nhật từ Sheet trước khi trả lời.
  const seen = getDb().versionTs(req.headers['x-data-version']);
  // Phiên chưa biết mà trình duyệt đã thấy một phiên bản dữ liệu: chắc chắn instance này đang cũ.
  const localTs = user ? getDb().versionTs(getDb().dataVersion(user.id)) : 0;
  if (token && seen && seen > localTs) {
    try {
      await getDb().syncFromStore({ immediate: true });
      user = await getUserFromSession(token);
    } catch (err) {
      console.warn('[LifeCare Auth] Version re-sync failed:', err.message);
    }
  }
  if (token && !user) {
    // Trên Vercel có nhiều instance: phiên có thể vừa được tạo ở instance khác và đã ghi lên
    // Google Sheet, còn instance này đang giữ bản cũ. Buộc kiểm tra Sheet rồi thử lại một lần.
    try {
      await getDb().syncFromStore({ force: true, unknownSession: true });
      user = await getUserFromSession(token);
    } catch (err) {
      console.warn('[LifeCare Auth] Session re-sync failed:', err.message);
    }
  }
  if (user) req._authUserId = user.id; // để gửi kèm phiên bản dữ liệu trong phản hồi
  return user ? { ...user, is_guest: isGuestId(user.id) } : null;
}

// Múi giờ của người dùng: trình duyệt gửi header X-Timezone (VD Asia/Ho_Chi_Minh).
function getRequestTz(req) {
  return P.validTimezone(req.headers['x-timezone']) || P.DEFAULT_TZ;
}

const intOrNull = (v, min, max) => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : NaN;
};

/**
 * Bọc router: với /api, đồng bộ dữ liệu từ Google Sheet trước khi xử lý, giữ lại phản hồi cho tới khi
 * thay đổi đã được ghi (mã hoá) ra Google Sheet / JSON, rồi mới gửi cho trình duyệt.
 */
async function handleRequest(req, res) {
  const isApi = (req.url || '').startsWith('/api/') && req.method !== 'OPTIONS';
  if (!isApi) return routeRequest(req, res);

  try {
    await ensureServerInit();
  } catch (err) {
    console.error('[LifeCare Server] Storage error:', err.message);
    return sendJSON(res, 503, { success: false, message: 'Không kết nối được nơi lưu dữ liệu: ' + err.message });
  }
  try {
    await getDb().syncFromStore({ force: req.method !== 'GET' });
  } catch (err) {
    // Sheet tạm bận (VD vượt hạn mức đọc): vẫn phục vụ bằng dữ liệu đang có trong bộ nhớ.
    console.warn('[LifeCare Server] Sync skipped:', err.message);
  }

  let pending = null;
  const realRes = res;
  const proxy = Object.create(res);
  proxy.writeHead = (...args) => { pending = pending || {}; pending.head = args; return proxy; };
  proxy.setHeader = (...args) => realRes.setHeader(...args);
  proxy.end = (...args) => { pending = pending || {}; pending.body = args; return proxy; };

  await routeRequest(req, proxy);

  try {
    if (getDb().isDirty()) await getDb().persist();
  } catch (err) {
    console.error('[LifeCare Server] Persist failed:', err.message);
    return sendJSON(realRes, 503, { success: false, message: 'Đã xử lý nhưng chưa lưu được dữ liệu: ' + err.message + '. Thử lại nhé.' });
  }
  if (req._authUserId) {
    const v = getDb().dataVersion(req._authUserId);
    if (v) realRes.setHeader('X-Data-Version', v);
  }
  if (pending && pending.head) realRes.writeHead(...pending.head);
  realRes.end(...((pending && pending.body) || []));
}

/**
 * Chuyển dữ liệu của một tài khoản khách sang tài khoản thật vừa đăng ký, rồi xoá tài khoản khách.
 * Sau bước này dữ liệu không còn mang mã "guest_" nên sẽ được lưu (mã hoá) ra Google Sheet / JSON.
 */
async function migrateGuestData(guest, newUserId) {
  const db = getDb();
  const tables = ['user_settings', 'goals', 'tasks', 'progress_logs', 'routine_blocks', 'disruptions',
    'health_checkins', 'mood_checkins', 'notifications', 'ai_chats'];
  await db.prepare('DELETE FROM sessions WHERE user_id = ?').run(guest.id);
  await db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(guest.id);
  for (const t of tables) {
    await db.prepare(`UPDATE ${t} SET user_id = ? WHERE user_id = ?`).run(newUserId, guest.id);
  }
  await db.prepare('UPDATE user_settings SET id = ? WHERE user_id = ?').run('set_' + newUserId, newUserId);
  // Giữ tâm lý nền khách đã đặt (nếu người dùng chưa điền gì khi đăng ký)
  await db.prepare('UPDATE users SET psych_profile = COALESCE(psych_profile, ?) WHERE id = ?').run(guest.psych_profile || null, newUserId);
  await db.prepare('DELETE FROM users WHERE id = ?').run(guest.id);
}

let _serverInitialized = false;
async function ensureServerInit() {
  if (_serverInitialized) return;
  await initDatabase();
  await ensureDemoUser();
  if (getDb().isDirty()) await getDb().persist();
  _serverInitialized = true;
}

async function routeRequest(req, res) {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method.toUpperCase();
  const tz = getRequestTz(req);

  // Handle CORS Preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Timezone, X-Data-Version',
      'Access-Control-Max-Age': '86400'
    });
    return res.end();
  }

  const db = getDb();

  // ==========================================
  // API ROUTING (/api/...)
  // ==========================================
  if (pathname.startsWith('/api/')) {
    try {
      // ----------------------------------------
      // 1. AUTHENTICATION & PROFILE APIS
      // ----------------------------------------

      // POST /api/auth/register
      if (pathname === '/api/auth/register' && method === 'POST') {
        const body = await parseBody(req);
        const { email, password, full_name, dob, gender, personal_goals } = body;

        if (!email || !password || !full_name) {
          return sendJSON(res, 400, { success: false, message: 'Email, password and full name are required.' });
        }

        const cleanEmail = email.trim().toLowerCase();
        const existing = await db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
        if (existing) {
          return sendJSON(res, 409, { success: false, message: 'An account with this email already exists.' });
        }

        const userId = 'usr_' + crypto.randomUUID();
        const { hash, salt } = hashPassword(password);
        const now = new Date().toISOString();

        await db.prepare(`
          INSERT INTO users (id, email, password_hash, salt, full_name, avatar, dob, gender, personal_goals, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          userId,
          cleanEmail,
          hash,
          salt,
          full_name.trim(),
          body.avatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(cleanEmail)}`,
          dob || null,
          gender || null,
          personal_goals || '',
          now,
          now
        );

        // Đang là tài khoản khách và muốn giữ dữ liệu: chuyển toàn bộ dữ liệu khách sang tài khoản mới.
        let migrated = false;
        const current = await getAuthUser(req);
        if (current && current.is_guest && body.keep_guest_data !== false) {
          await migrateGuestData(current, userId);
          migrated = true;
        }

        // Create default settings (nếu chưa có từ dữ liệu khách)
        if (!(await db.prepare('SELECT id FROM user_settings WHERE user_id = ?').get(userId))) {
          await db.prepare(`
            INSERT INTO user_settings (id, user_id, theme, language, updated_at)
            VALUES (?, ?, 'light', 'vi', ?)
          `).run('set_' + crypto.randomUUID(), userId, now);
        }

        const { token } = await createSession(userId);
        req._authUserId = userId;
        const user = await db.prepare('SELECT id, email, full_name, avatar, dob, gender, personal_goals, psych_profile, created_at FROM users WHERE id = ?').get(userId);

        return sendJSON(res, 201, {
          success: true,
          message: migrated ? 'Đăng ký thành công! Dữ liệu khách đã được chuyển sang và từ giờ sẽ được lưu.' : 'Registration successful! Welcome to LifeCare.',
          token,
          user: { ...user, is_guest: false },
          migratedGuestData: migrated
        });
      }

      // POST /api/auth/login
      if (pathname === '/api/auth/login' && method === 'POST') {
        const body = await parseBody(req);
        const { email, password } = body;

        if (!email || !password) {
          return sendJSON(res, 400, { success: false, message: 'Please provide both email and password.' });
        }

        const cleanEmail = email.trim().toLowerCase();
        const user = await db.prepare('SELECT * FROM users WHERE email = ?').get(cleanEmail);
        if (!user || !verifyPassword(password, user.password_hash, user.salt)) {
          return sendJSON(res, 401, { success: false, message: 'Invalid email or password.' });
        }

        const { token } = await createSession(user.id);
        req._authUserId = user.id;
        const safeUser = {
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          avatar: user.avatar,
          dob: user.dob,
          gender: user.gender,
          personal_goals: user.personal_goals,
          psych_profile: user.psych_profile,
          created_at: user.created_at,
          is_guest: isGuestId(user.id)
        };

        return sendJSON(res, 200, {
          success: true,
          message: `Welcome back, ${safeUser.full_name}!`,
          token,
          user: safeUser
        });
      }

      // POST /api/auth/guest – tài khoản khách: dùng ngay, KHÔNG lưu dữ liệu (xem server/auth.js)
      if (pathname === '/api/auth/guest' && method === 'POST') {
        const body = await parseBody(req);
        const guestId = await createGuestUser({ withSampleData: body.sample_data !== false });
        const { token } = await createSession(guestId);
        req._authUserId = guestId;
        const user = await db.prepare('SELECT id, email, full_name, avatar, dob, gender, personal_goals, psych_profile, created_at FROM users WHERE id = ?').get(guestId);
        return sendJSON(res, 201, { success: true, message: 'Đang dùng tài khoản khách. Dữ liệu sẽ không được lưu.', token, user: { ...user, is_guest: true } });
      }

      // POST /api/auth/logout
      if (pathname === '/api/auth/logout' && method === 'POST') {
        const authHeader = req.headers['authorization'] || '';
        const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : '';
        const user = token ? await getUserFromSession(token) : null;
        if (user && isGuestId(user.id)) {
          await db.prepare('DELETE FROM users WHERE id = ?').run(user.id); // xoá sạch dữ liệu khách
        } else if (token) {
          await deleteSession(token);
        }
        return sendJSON(res, 200, { success: true, message: 'Logged out successfully.' });
      }

      // POST /api/auth/forgot-password
      if (pathname === '/api/auth/forgot-password' && method === 'POST') {
        const body = await parseBody(req);
        const { email } = body;
        if (!email) return sendJSON(res, 400, { success: false, message: 'Email is required.' });

        const user = await db.prepare('SELECT id, full_name FROM users WHERE email = ?').get(email.trim().toLowerCase());
        if (!user) {
          // Standard security response: don't reveal email existence
          return sendJSON(res, 200, { success: true, message: 'If this email exists in our records, password reset instructions have been generated.' });
        }

        const resetToken = 'rst_' + crypto.randomBytes(24).toString('hex');
        const expiresAt = Date.now() + 60 * 60 * 1000; // 1 hour
        await db.prepare('INSERT INTO password_resets (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)').run(
          resetToken, user.id, expiresAt, new Date().toISOString()
        );

        return sendJSON(res, 200, {
          success: true,
          message: 'Password reset token generated successfully. In production, this would be delivered via verified email.',
          demoResetToken: resetToken
        });
      }

      // POST /api/auth/reset-password
      if (pathname === '/api/auth/reset-password' && method === 'POST') {
        const body = await parseBody(req);
        const { token, new_password } = body;
        if (!token || !new_password) {
          return sendJSON(res, 400, { success: false, message: 'Token and new password are required.' });
        }

        const resetRecord = await db.prepare('SELECT user_id, expires_at FROM password_resets WHERE token = ?').get(token);
        if (!resetRecord || Date.now() > resetRecord.expires_at) {
          return sendJSON(res, 400, { success: false, message: 'Reset token is invalid or has expired.' });
        }

        const { hash, salt } = hashPassword(new_password);
        await db.prepare('UPDATE users SET password_hash = ?, salt = ?, updated_at = ? WHERE id = ?').run(
          hash, salt, new Date().toISOString(), resetRecord.user_id
        );
        await db.prepare('DELETE FROM password_resets WHERE token = ?').run(token);

        return sendJSON(res, 200, { success: true, message: 'Password updated successfully. You may now log in.' });
      }

      // GET /api/auth/me
      if (pathname === '/api/auth/me' && method === 'GET') {
        const user = await getAuthUser(req);
        if (!user) return sendJSON(res, 401, { success: false, message: 'Chưa đăng nhập.' });
        return sendJSON(res, 200, { success: true, user });
      }

      // PUT /api/user/profile
      if (pathname === '/api/user/profile' && method === 'PUT') {
        const user = await getAuthUser(req);
        if (!user) return sendJSON(res, 401, { success: false, message: 'Unauthorized.' });

        const body = await parseBody(req);
        const { full_name, dob, gender, personal_goals, avatar } = body;
        const now = new Date().toISOString();

        // Tâm lý & ý chí nền cố định (AI dùng làm mốc so sánh với check-in hằng ngày).
        let psych = null;
        if (body.psych_profile && typeof body.psych_profile === 'object') {
          const pp = body.psych_profile;
          const lvl = v => { const n = Number(v); return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null; };
          psych = JSON.stringify({
            willpower: lvl(pp.willpower),
            stress_tolerance: lvl(pp.stress_tolerance),
            motivation_source: String(pp.motivation_source || '').slice(0, 100) || null,
            best_focus_time: ['morning', 'afternoon', 'evening', 'night'].includes(pp.best_focus_time) ? pp.best_focus_time : null,
            max_focus_minutes: (Number(pp.max_focus_minutes) >= 10 && Number(pp.max_focus_minutes) <= 240) ? Math.round(Number(pp.max_focus_minutes)) : null,
            notes: String(pp.notes || '').slice(0, 500) || null
          });
        }

        await db.prepare(`
          UPDATE users
          SET full_name = COALESCE(?, full_name),
              dob = COALESCE(?, dob),
              gender = COALESCE(?, gender),
              personal_goals = COALESCE(?, personal_goals),
              avatar = COALESCE(?, avatar),
              psych_profile = COALESCE(?, psych_profile),
              updated_at = ?
          WHERE id = ?
        `).run(full_name, dob, gender, personal_goals, avatar, psych, now, user.id);

        const updated = await db.prepare('SELECT id, email, full_name, avatar, dob, gender, personal_goals, psych_profile, created_at, updated_at FROM users WHERE id = ?').get(user.id);
        return sendJSON(res, 200, { success: true, message: 'Profile updated successfully.', user: updated });
      }

      // PUT /api/user/password
      if (pathname === '/api/user/password' && method === 'PUT') {
        const user = await getAuthUser(req);
        if (!user) return sendJSON(res, 401, { success: false, message: 'Unauthorized.' });

        const body = await parseBody(req);
        const { current_password, new_password } = body;
        if (!current_password || !new_password) {
          return sendJSON(res, 400, { success: false, message: 'Current and new password are required.' });
        }

        const fullUser = await db.prepare('SELECT password_hash, salt FROM users WHERE id = ?').get(user.id);
        if (!verifyPassword(current_password, fullUser.password_hash, fullUser.salt)) {
          return sendJSON(res, 400, { success: false, message: 'Incorrect current password.' });
        }

        const { hash, salt } = hashPassword(new_password);
        await db.prepare('UPDATE users SET password_hash = ?, salt = ?, updated_at = ? WHERE id = ?').run(
          hash, salt, new Date().toISOString(), user.id
        );

        return sendJSON(res, 200, { success: true, message: 'Password changed successfully.' });
      }

      // GET & PUT /api/user/settings
      if (pathname === '/api/user/settings') {
        const user = await getAuthUser(req);
        if (!user) return sendJSON(res, 401, { success: false, message: 'Unauthorized.' });

        if (method === 'GET') {
          let settings = await db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(user.id);
          if (!settings) {
            await db.prepare('INSERT INTO user_settings (id, user_id, updated_at) VALUES (?, ?, ?)').run('set_' + crypto.randomUUID(), user.id, new Date().toISOString());
            settings = await db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(user.id);
          }
          return sendJSON(res, 200, { success: true, settings });
        }

        if (method === 'PUT') {
          const body = await parseBody(req);
          const now = new Date().toISOString();
          await db.prepare(`
            UPDATE user_settings
            SET theme = COALESCE(?, theme),
                language = COALESCE(?, language),
                quiet_hours_start = COALESCE(?, quiet_hours_start),
                quiet_hours_end = COALESCE(?, quiet_hours_end),
                remind_water = COALESCE(?, remind_water),
                remind_break = COALESCE(?, remind_break),
                remind_health = COALESCE(?, remind_health),
                remind_mood = COALESCE(?, remind_mood),
                remind_tasks = COALESCE(?, remind_tasks),
                notification_frequency = COALESCE(?, notification_frequency),
                remind_repeat_minutes = COALESCE(?, remind_repeat_minutes),
                remind_overdue = COALESCE(?, remind_overdue),
                updated_at = ?
            WHERE user_id = ?
          `).run(
            body.theme, body.language, body.quiet_hours_start, body.quiet_hours_end,
            body.remind_water !== undefined ? (body.remind_water ? 1 : 0) : null,
            body.remind_break !== undefined ? (body.remind_break ? 1 : 0) : null,
            body.remind_health !== undefined ? (body.remind_health ? 1 : 0) : null,
            body.remind_mood !== undefined ? (body.remind_mood ? 1 : 0) : null,
            body.remind_tasks !== undefined ? (body.remind_tasks ? 1 : 0) : null,
            body.notification_frequency,
            [5, 10, 15, 20, 30, 45, 60].includes(Number(body.remind_repeat_minutes)) ? Number(body.remind_repeat_minutes) : null,
            body.remind_overdue !== undefined ? (body.remind_overdue ? 1 : 0) : null,
            now,
            user.id
          );

          const settings = await db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(user.id);
          return sendJSON(res, 200, { success: true, message: 'Settings saved successfully.', settings });
        }
      }

      // ----------------------------------------
      // 2. DASHBOARD DATA AGGREGATION API
      // ----------------------------------------
      if (pathname === '/api/dashboard' && method === 'GET') {
        const user = await getAuthUser(req);
        if (!user) return sendJSON(res, 401, { success: false, message: 'Unauthorized.' });

        const todayStr = (P.isRealDate(parsedUrl.query.date) ? parsedUrl.query.date : P.localNow(tz).date);

        // Tasks for today
        const todayTasks = await db.prepare('SELECT * FROM tasks WHERE user_id = ? AND date = ? ORDER BY start_time ASC').all(user.id, todayStr);
        const completedTasks = todayTasks.filter(t => t.status === 'completed').length;
        const remainingTasks = todayTasks.length - completedTasks;

        // Upcoming events/tasks
        const upcomingTasks = await db.prepare('SELECT * FROM tasks WHERE user_id = ? AND date >= ? ORDER BY date ASC, start_time ASC LIMIT 5').all(user.id, todayStr);

        // Daily health check-in status
        const todayHealth = await db.prepare('SELECT * FROM health_checkins WHERE user_id = ? AND checkin_date = ?').get(user.id, todayStr);

        // Latest emotional status & past 7 days mood
        const latestMood = await db.prepare('SELECT * FROM mood_checkins WHERE user_id = ? ORDER BY checkin_date DESC LIMIT 1').get(user.id);
        const pastWeekMoods = await db.prepare('SELECT mood, emoji, checkin_date, stress_level FROM mood_checkins WHERE user_id = ? ORDER BY checkin_date DESC LIMIT 7').all(user.id);

        // Health reminders count
        const unreadNotifsRow = await db.prepare('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0').get(user.id);
        const unreadNotifs = unreadNotifsRow ? unreadNotifsRow.count : 0;

        return sendJSON(res, 200, {
          success: true,
          data: {
            user,
            currentDate: todayStr,
            taskStats: {
              total: todayTasks.length,
              completed: completedTasks,
              remaining: remainingTasks,
              completionRate: todayTasks.length > 0 ? Math.round((completedTasks / todayTasks.length) * 100) : 0
            },
            todayTasks,
            upcomingTasks,
            healthStatus: {
              todayCheckinCompleted: !!todayHealth,
              latestPhysical: todayHealth || null
            },
            emotionalStatus: {
              latestMood: latestMood || null,
              weeklyOverview: pastWeekMoods.reverse()
            },
            unreadNotifs
          }
        });
      }

      // ----------------------------------------
      // 3. SMART PLANNER & TASK MANAGEMENT APIS
      // ----------------------------------------

      // GET /api/tasks (Filter by date, category, priority, search)
      if (pathname === '/api/tasks' && method === 'GET') {
        const user = await getAuthUser(req);
        if (!user) return sendJSON(res, 401, { success: false, message: 'Unauthorized.' });

        const { date, month, startDate, endDate, category, priority, search, status } = parsedUrl.query;
        let query = 'SELECT * FROM tasks WHERE user_id = ?';
        const params = [user.id];

        if (date) {
          query += ' AND date = ?';
          params.push(date);
        } else if (startDate && endDate) {
          query += ' AND date >= ? AND date <= ?';
          params.push(startDate, endDate);
        } else if (month) {
          // 'YYYY-MM'
          query += ' AND date LIKE ?';
          params.push(`${month}%`);
        }

        if (category && category !== 'all') {
          query += ' AND category = ?';
          params.push(category);
        }

        if (priority && priority !== 'all') {
          query += ' AND priority = ?';
          params.push(priority);
        }

        if (status && status !== 'all') {
          query += ' AND status = ?';
          params.push(status);
        }

        if (search) {
          query += ' AND (title LIKE ? OR description LIKE ?)';
          params.push(`%${search}%`, `%${search}%`);
        }

        query += ' ORDER BY date ASC, start_time ASC';
        const tasks = await db.prepare(query).all(...params);

        // Check for schedule overlaps
        const overlaps = [];
        const timedTasks = tasks.filter(t => t.start_time && t.end_time);
        for (let i = 0; i < timedTasks.length; i++) {
          for (let j = i + 1; j < timedTasks.length; j++) {
            const a = timedTasks[i];
            const b = timedTasks[j];
            if (a.date === b.date && a.start_time < b.end_time && a.end_time > b.start_time) {
              overlaps.push({ task1Id: a.id, task2Id: b.id, task1Title: a.title, task2Title: b.title, date: a.date });
            }
          }
        }

        return sendJSON(res, 200, { success: true, tasks, overlaps });
      }

      // POST /api/tasks
      if (pathname === '/api/tasks' && method === 'POST') {
        const user = await getAuthUser(req);
        if (!user) return sendJSON(res, 401, { success: false, message: 'Unauthorized.' });

        const body = await parseBody(req);
        const { title, description, category, priority, date, start_time, end_time, is_event, reminder_time, recurring } = body;

        if (!title || !category || !date) {
          return sendJSON(res, 400, { success: false, message: 'Title, category, and date are required.' });
        }
        const duration_minutes = intOrNull(body.duration_minutes, 1, 1440);
        if (Number.isNaN(duration_minutes)) return sendJSON(res, 400, { success: false, message: 'Thời lượng phải từ 1 đến 1440 phút.' });
        const deadline = P.isRealDate(body.deadline) ? body.deadline : null;
        const goal_id = body.goal_id && (await db.prepare('SELECT id FROM goals WHERE id = ? AND user_id = ?').get(body.goal_id, user.id)) ? body.goal_id : null;

        // Detect overlapping schedule with existing tasks on same date
        let overlapWarning = null;
        if (start_time && end_time) {
          const sameDayTasks = await db.prepare('SELECT id, title, start_time, end_time FROM tasks WHERE user_id = ? AND date = ? AND start_time IS NOT NULL AND end_time IS NOT NULL').all(user.id, date);
          for (const t of sameDayTasks) {
            if (start_time < t.end_time && end_time > t.start_time) {
              overlapWarning = `Schedule overlap detected with "${t.title}" (${t.start_time} - ${t.end_time})`;
              break;
            }
          }
        }

        const taskId = 'task_' + crypto.randomUUID();
        const now = new Date().toISOString();

        await db.prepare(`
          INSERT INTO tasks (id, user_id, title, description, category, priority, date, start_time, end_time, status, is_event, reminder_time, recurring, goal_id, duration_minutes, deadline, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          taskId,
          user.id,
          title.trim(),
          description || '',
          category,
          priority || 'medium',
          date,
          start_time || null,
          end_time || null,
          is_event ? 1 : 0,
          reminder_time || null,
          recurring || 'none',
          goal_id,
          duration_minutes,
          deadline,
          now,
          now
        );

        // If reminder_time is provided, create a reminder notification
        if (reminder_time) {
          await db.prepare(`
            INSERT INTO notifications (id, user_id, title, message, notification_type, notification_time, is_read, is_enabled, created_at)
            VALUES (?, ?, ?, ?, 'schedule', ?, 0, 1, ?)
          `).run('notif_' + crypto.randomUUID(), user.id, `Reminder: ${title.trim()}`, `Scheduled at ${start_time || date}. Don't forget!`, reminder_time, now);
        }

        const created = await db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
        return sendJSON(res, 201, { success: true, message: 'Task created successfully.', task: created, overlapWarning });
      }

      // PUT /api/tasks/:id
      if (pathname.startsWith('/api/tasks/') && method === 'PUT') {
        const user = await getAuthUser(req);
        if (!user) return sendJSON(res, 401, { success: false, message: 'Unauthorized.' });

        const taskId = pathname.replace('/api/tasks/', '');
        const body = await parseBody(req);
        const now = new Date().toISOString();

        const existing = await db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(taskId, user.id);
        if (!existing) {
          return sendJSON(res, 404, { success: false, message: 'Task not found or unauthorized.' });
        }
        const duration_minutes = intOrNull(body.duration_minutes, 1, 1440);
        if (Number.isNaN(duration_minutes)) return sendJSON(res, 400, { success: false, message: 'Thời lượng phải từ 1 đến 1440 phút.' });
        // goal_id: "" = bỏ liên kết, undefined = giữ nguyên
        let goalId = existing.goal_id;
        if (body.goal_id !== undefined) {
          goalId = body.goal_id && (await db.prepare('SELECT id FROM goals WHERE id = ? AND user_id = ?').get(body.goal_id, user.id)) ? body.goal_id : null;
        }
        let deadline = existing.deadline;
        if (body.deadline !== undefined) deadline = P.isRealDate(body.deadline) ? body.deadline : null;

        await db.prepare(`
          UPDATE tasks
          SET title = COALESCE(?, title),
              description = COALESCE(?, description),
              category = COALESCE(?, category),
              priority = COALESCE(?, priority),
              date = COALESCE(?, date),
              start_time = COALESCE(?, start_time),
              end_time = COALESCE(?, end_time),
              status = COALESCE(?, status),
              is_event = COALESCE(?, is_event),
              reminder_time = COALESCE(?, reminder_time),
              recurring = COALESCE(?, recurring),
              duration_minutes = COALESCE(?, duration_minutes),
              goal_id = ?,
              deadline = ?,
              updated_at = ?
          WHERE id = ? AND user_id = ?
        `).run(
          body.title, body.description, body.category, body.priority,
          body.date, body.start_time, body.end_time, body.status,
          body.is_event !== undefined ? (body.is_event ? 1 : 0) : null,
          body.reminder_time,
          body.recurring,
          duration_minutes,
          goalId,
          deadline,
          now,
          taskId,
          user.id
        );

        const updated = await db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
        // Đánh dấu xong / bỏ đánh dấu: ghi lại tiến độ (để tính % mục tiêu và dự báo).
        if (updated.status !== existing.status || updated.goal_id !== existing.goal_id) {
          await P.syncTaskProgress(db, user.id, updated, tz);
        }
        return sendJSON(res, 200, { success: true, message: 'Task updated successfully.', task: updated });
      }

      // DELETE /api/tasks/:id
      if (pathname.startsWith('/api/tasks/') && method === 'DELETE') {
        const user = await getAuthUser(req);
        if (!user) return sendJSON(res, 401, { success: false, message: 'Unauthorized.' });

        const taskId = pathname.replace('/api/tasks/', '');
        const resDelete = await db.prepare('DELETE FROM tasks WHERE id = ? AND user_id = ?').run(taskId, user.id);
        if (resDelete.changes === 0) {
          return sendJSON(res, 404, { success: false, message: 'Task not found or unauthorized.' });
        }
        await db.prepare("DELETE FROM progress_logs WHERE user_id = ? AND task_id = ? AND kind = 'task_done'").run(user.id, taskId);

        return sendJSON(res, 200, { success: true, message: 'Task deleted successfully.' });
      }

      // ----------------------------------------
      // 4. PHYSICAL HEALTH CHECK-INS APIS
      // ----------------------------------------

      // GET /api/health
      if (pathname === '/api/health' && method === 'GET') {
        const user = await getAuthUser(req);
        if (!user) return sendJSON(res, 401, { success: false, message: 'Unauthorized.' });

        const limit = parseInt(parsedUrl.query.limit) || 30;
        const records = await db.prepare('SELECT * FROM health_checkins WHERE user_id = ? ORDER BY checkin_date DESC LIMIT ?').all(user.id, limit);
        return sendJSON(res, 200, { success: true, records });
      }

      // POST /api/health
      if (pathname === '/api/health' && method === 'POST') {
        const user = await getAuthUser(req);
        if (!user) return sendJSON(res, 401, { success: false, message: 'Unauthorized.' });

        const body = await parseBody(req);
        let { checkin_date, sleep_duration, sleep_quality, physical_condition, energy_level, exercise_status, exercise_type, exercise_duration, meals_summary, water_ml, discomfort, notes } = body;

        // Numerical input validation
        if (sleep_duration !== undefined && sleep_duration !== null && sleep_duration !== '') {
          sleep_duration = parseFloat(sleep_duration);
          if (isNaN(sleep_duration) || sleep_duration < 0 || sleep_duration > 24) {
            return sendJSON(res, 400, { success: false, message: 'Sleep duration must be a valid number between 0 and 24 hours.' });
          }
        } else {
          sleep_duration = null;
        }

        if (water_ml !== undefined && water_ml !== null && water_ml !== '') {
          water_ml = Math.round(Number(water_ml));
          if (isNaN(water_ml) || water_ml < 0 || water_ml > 10000) {
            return sendJSON(res, 400, { success: false, message: 'Lượng nước phải từ 0 đến 10000 ml.' });
          }
        } else {
          water_ml = null;
        }

        if (energy_level !== undefined && energy_level !== null && energy_level !== '') {
          energy_level = parseInt(energy_level);
          if (isNaN(energy_level) || energy_level < 1 || energy_level > 5) {
            return sendJSON(res, 400, { success: false, message: 'Energy level must be an integer between 1 and 5.' });
          }
        } else {
          energy_level = null;
        }

        if (exercise_duration !== undefined && exercise_duration !== null && exercise_duration !== '') {
          exercise_duration = parseInt(exercise_duration);
          if (isNaN(exercise_duration) || exercise_duration < 0 || exercise_duration > 1440) {
            return sendJSON(res, 400, { success: false, message: 'Exercise duration must be between 0 and 1440 minutes.' });
          }
        } else {
          exercise_duration = 0;
        }

        const date = P.isRealDate(checkin_date) ? checkin_date : P.localNow(tz).date;
        const existing = await db.prepare('SELECT id FROM health_checkins WHERE user_id = ? AND checkin_date = ?').get(user.id, date);

        let id = existing ? existing.id : ('hlth_' + crypto.randomUUID());
        const now = new Date().toISOString();

        if (existing) {
          await db.prepare(`
            UPDATE health_checkins
            SET sleep_duration = ?, sleep_quality = ?, physical_condition = ?, energy_level = ?, exercise_status = ?, exercise_type = ?, exercise_duration = ?, meals_summary = ?, water_ml = ?, discomfort = ?, notes = ?
            WHERE id = ? AND user_id = ?
          `).run(
            sleep_duration,
            sleep_quality || null,
            physical_condition || null,
            energy_level,
            exercise_status || null,
            exercise_type || null,
            exercise_duration,
            meals_summary || null,
            water_ml,
            discomfort || null,
            notes || null,
            id,
            user.id
          );
        } else {
          await db.prepare(`
            INSERT INTO health_checkins (id, user_id, checkin_date, sleep_duration, sleep_quality, physical_condition, energy_level, exercise_status, exercise_type, exercise_duration, meals_summary, water_ml, discomfort, notes, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            id,
            user.id,
            date,
            sleep_duration,
            sleep_quality || null,
            physical_condition || null,
            energy_level,
            exercise_status || null,
            exercise_type || null,
            exercise_duration,
            meals_summary || null,
            water_ml,
            discomfort || null,
            notes || null,
            now
          );
        }

        // Medical advisory notice check
        let adviceNotice = null;
        if (physical_condition === 'Unwell' || (discomfort && discomfort.length > 5)) {
          adviceNotice = "Friendly Health Note: If you feel unwell or experience persistent pain or acute distress, remember that LifeCare does not replace medical advice. Please consult a qualified physician or professional healthcare provider.";
        }

        const record = await db.prepare('SELECT * FROM health_checkins WHERE id = ?').get(id);
        return sendJSON(res, 200, { success: true, message: 'Daily physical check-in recorded!', record, adviceNotice });
      }

      // ----------------------------------------
      // 5. MENTAL HEALTH & EMOTIONAL WELLNESS APIS
      // ----------------------------------------

      // GET /api/mood
      if (pathname === '/api/mood' && method === 'GET') {
        const user = await getAuthUser(req);
        if (!user) return sendJSON(res, 401, { success: false, message: 'Unauthorized.' });

        const limit = parseInt(parsedUrl.query.limit) || 30;
        const records = await db.prepare('SELECT * FROM mood_checkins WHERE user_id = ? ORDER BY checkin_date DESC LIMIT ?').all(user.id, limit);
        return sendJSON(res, 200, { success: true, records });
      }

      // POST /api/mood
      if (pathname === '/api/mood' && method === 'POST') {
        const user = await getAuthUser(req);
        if (!user) return sendJSON(res, 401, { success: false, message: 'Unauthorized.' });

        const body = await parseBody(req);
        const { checkin_date, mood, emoji, stress_level, motivation_level, connected_score, relaxed_score, anxiety_score, emotional_notes, journal_entry } = body;

        if (!mood) {
          return sendJSON(res, 400, { success: false, message: 'Mood selection is required.' });
        }

        const date = P.isRealDate(checkin_date) ? checkin_date : P.localNow(tz).date;
        const existing = await db.prepare('SELECT id FROM mood_checkins WHERE user_id = ? AND checkin_date = ?').get(user.id, date);

        let id = existing ? existing.id : ('mood_' + crypto.randomUUID());
        const now = new Date().toISOString();

        if (existing) {
          await db.prepare(`
            UPDATE mood_checkins
            SET mood = ?, emoji = ?, stress_level = ?, motivation_level = ?, connected_score = ?, relaxed_score = ?, anxiety_score = ?, emotional_notes = ?, journal_entry = ?
            WHERE id = ? AND user_id = ?
          `).run(
            mood, emoji || null, stress_level || null, motivation_level || null,
            connected_score || null, relaxed_score || null, anxiety_score || null,
            emotional_notes || null, journal_entry || null, id, user.id
          );
        } else {
          await db.prepare(`
            INSERT INTO mood_checkins (id, user_id, checkin_date, mood, emoji, stress_level, motivation_level, connected_score, relaxed_score, anxiety_score, emotional_notes, journal_entry, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            id, user.id, date, mood, emoji || null, stress_level || null, motivation_level || null,
            connected_score || null, relaxed_score || null, anxiety_score || null,
            emotional_notes || null, journal_entry || null, now
          );
        }

        // Supportive message generation based on mood and feelings (never clinical diagnoses)
        let supportiveMessage = "Cảm ơn bạn đã dành thời gian lắng nghe chính mình. Mọi cảm xúc đều xứng đáng được tôn trọng.";
        if (mood === 'Tired') supportiveMessage = "Hãy cho phép bản thân nghỉ ngơi. Bạn xứng đáng có những giây phút thư giãn để tái tạo năng lượng.";
        else if (mood === 'Stressed' || mood === 'Overwhelmed') supportiveMessage = "Hãy hít một hơi thật chậm và sâu. Bạn không cần phải giải quyết mọi việc ngay bây giờ. Từng bước nhỏ thôi nhé.";
        else if (mood === 'Happy' || mood === 'Excited') supportiveMessage = "Thật tuyệt vời! Hãy trân trọng và tận hưởng trọn vẹn những năng lượng tích cực này.";
        else if (mood === 'Relaxed') supportiveMessage = "Bình yên trong tâm trí là món quà quý giá nhất. Hãy tận hưởng khoảnh khắc này.";
        else if (mood === 'Anxious') supportiveMessage = "Hãy thả lỏng vai và cơ hàm. Hít thở sâu và cảm nhận đôi chân vững chãi trên mặt đất. Cảm giác này rồi sẽ qua đi an toàn.";

        const record = await db.prepare('SELECT * FROM mood_checkins WHERE id = ?').get(id);
        return sendJSON(res, 200, { success: true, message: 'Emotional reflection saved.', record, supportiveMessage });
      }

      // ----------------------------------------
      // 6. 5 ADDED FEATURES (AI, TIMELINE, SCHEDULE REC, WEEKLY REPORT, DAILY QUICK CHECK-IN)
      // ----------------------------------------

      // Feature #1: Daily Quick Check-in prompt & bundle submit
      // GET /api/checkin/status - checks what has been submitted today
      if (pathname === '/api/checkin/status' && method === 'GET') {
        const user = await getAuthUser(req);
        if (!user) return sendJSON(res, 401, { success: false, message: 'Unauthorized.' });

        const todayStr = P.localNow(tz).date;
        const health = await db.prepare('SELECT * FROM health_checkins WHERE user_id = ? AND checkin_date = ?').get(user.id, todayStr);
        const mood = await db.prepare('SELECT * FROM mood_checkins WHERE user_id = ? AND checkin_date = ?').get(user.id, todayStr);

        return sendJSON(res, 200, {
          success: true,
          today: todayStr,
          hasHealth: !!health,
          hasMood: !!mood,
          isComplete: !!(health && mood),
          healthRecord: health || null,
          moodRecord: mood || null
        });
      }

      // POST /api/checkin/quick - single 30-60 second rapid checkin
      if (pathname === '/api/checkin/quick' && method === 'POST') {
        const user = await getAuthUser(req);
        if (!user) return sendJSON(res, 401, { success: false, message: 'Unauthorized.' });

        const body = await parseBody(req);
        const todayStr = P.localNow(tz).date;
        const now = new Date().toISOString();

        // 1. Health part
        if (body.physical_condition || body.sleep_duration !== undefined || body.energy_level !== undefined) {
          const existingHealth = await db.prepare('SELECT id FROM health_checkins WHERE user_id = ? AND checkin_date = ?').get(user.id, todayStr);
          if (existingHealth) {
            await db.prepare(`
              UPDATE health_checkins
              SET physical_condition = COALESCE(?, physical_condition),
                  sleep_duration = COALESCE(?, sleep_duration),
                  energy_level = COALESCE(?, energy_level)
              WHERE id = ?
            `).run(body.physical_condition || null, body.sleep_duration || null, body.energy_level || null, existingHealth.id);
          } else {
            await db.prepare(`
              INSERT INTO health_checkins (id, user_id, checkin_date, physical_condition, sleep_duration, energy_level, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run('hlth_' + crypto.randomUUID(), user.id, todayStr, body.physical_condition || 'Good', body.sleep_duration || null, body.energy_level || null, now);
          }
        }

        // 2. Mood part
        if (body.mood) {
          const existingMood = await db.prepare('SELECT id FROM mood_checkins WHERE user_id = ? AND checkin_date = ?').get(user.id, todayStr);
          if (existingMood) {
            await db.prepare(`
              UPDATE mood_checkins
              SET mood = ?, emoji = COALESCE(?, emoji), stress_level = COALESCE(?, stress_level), motivation_level = COALESCE(?, motivation_level)
              WHERE id = ?
            `).run(body.mood, body.emoji || null, body.stress_level || null, body.motivation_level || null, existingMood.id);
          } else {
            await db.prepare(`
              INSERT INTO mood_checkins (id, user_id, checkin_date, mood, emoji, stress_level, motivation_level, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run('mood_' + crypto.randomUUID(), user.id, todayStr, body.mood, body.emoji || '🙂', body.stress_level || 2, body.motivation_level || null, now);
          }
        }

        return sendJSON(res, 200, {
          success: true,
          message: 'Quick check-in completed in under a minute! Have a balanced day.'
        });
      }

      // Feature #2: AI Wellness Assistant Chat
      // GET /api/ai/messages - retrieve chat history
      if (pathname === '/api/ai/messages' && method === 'GET') {
        const user = await getAuthUser(req);
        if (!user) return sendJSON(res, 401, { success: false, message: 'Unauthorized.' });

        const history = await db.prepare('SELECT id, role, message, created_at FROM ai_chats WHERE user_id = ? ORDER BY created_at ASC LIMIT 50').all(user.id);
        return sendJSON(res, 200, { success: true, messages: history });
      }

      // POST /api/ai/chat - send prompt to assistant
      if (pathname === '/api/ai/chat' && method === 'POST') {
        const user = await getAuthUser(req);
        if (!user) return sendJSON(res, 401, { success: false, message: 'Unauthorized.' });

        const body = await parseBody(req);
        const userMessage = body.message || '';
        const mode = body.mode || 'general'; // 'general', 'schedule', 'wellness', 'insight'
        const language = body.language || 'vi';
        // Tình huống có sẵn: daily_adjust, disruption, goal_breakdown, allocate_free_time, behind_schedule
        const intent = typeof body.intent === 'string' ? body.intent : null;

        if (!userMessage.trim()) {
          return sendJSON(res, 400, { success: false, message: 'Message is required.' });
        }

        const now = new Date().toISOString();
        const userChatId = 'chat_' + crypto.randomUUID();
        await db.prepare('INSERT INTO ai_chats (id, user_id, role, message, created_at) VALUES (?, ?, ?, ?, ?)').run(
          userChatId, user.id, 'user', userMessage, now
        );

        // Khủng hoảng / tự hại: luôn trả lời ngay bằng thông tin hỗ trợ khẩn cấp, không qua LLM.
        let aiResult = checkCrisisOrEmergency(userMessage.toLowerCase());
        if (aiResult && !aiResult.isCrisis && isLLMConfigured()) aiResult = null; // câu hỏi y tế: để LLM trả lời có giới hạn

        if (!aiResult && isLLMConfigured()) {
          // Trợ lý LLM (Groq): đọc dữ liệu của người dùng và tự thêm / sửa / xoá việc trong lịch.
          aiResult = await generateLLMReply(db, user, userMessage, { mode, language, intent, tz });
        } else if (!aiResult) {
          // Chưa cấu hình GROQ_API_KEY: dùng bộ luật cũ.
          const recentHealth = await db.prepare('SELECT * FROM health_checkins WHERE user_id = ? ORDER BY checkin_date DESC LIMIT 7').all(user.id);
          const recentMood = await db.prepare('SELECT * FROM mood_checkins WHERE user_id = ? ORDER BY checkin_date DESC LIMIT 7').all(user.id);
          const tasks = await db.prepare('SELECT * FROM tasks WHERE user_id = ? ORDER BY date DESC LIMIT 30').all(user.id);
          aiResult = await generateAIWellnessReply(userMessage, { user, recentHealth, recentMood, tasks, mode, language });
        }

        // Thông báo lỗi không lưu vào lịch sử, để lượt sau model không đọc nhầm nó là câu trả lời.
        if (aiResult.type !== 'error') {
          const aiChatId = 'chat_' + crypto.randomUUID();
          await db.prepare('INSERT INTO ai_chats (id, user_id, role, message, created_at) VALUES (?, ?, ?, ?, ?)').run(
            aiChatId, user.id, 'assistant', aiResult.reply, new Date().toISOString()
          );
        }

        return sendJSON(res, 200, {
          success: true,
          reply: aiResult.reply,
          type: aiResult.type,
          suggestedTasks: aiResult.suggestedTasks || [],
          tasksChanged: aiResult.tasksChanged || null
        });
      }

      // Feature #3: Personal Health Timeline API
      // GET /api/timeline?range=7days|30days|year
      if (pathname === '/api/timeline' && method === 'GET') {
        const user = await getAuthUser(req);
        if (!user) return sendJSON(res, 401, { success: false, message: 'Unauthorized.' });

        const range = parsedUrl.query.range || '30days';
        let limitDays = 30;
        if (range === '7days') limitDays = 7;
        if (range === 'year') limitDays = 365;

        // Fetch health & mood records merged into chronological date cards
        const health = await db.prepare('SELECT * FROM health_checkins WHERE user_id = ? ORDER BY checkin_date DESC LIMIT ?').all(user.id, limitDays);
        const mood = await db.prepare('SELECT * FROM mood_checkins WHERE user_id = ? ORDER BY checkin_date DESC LIMIT ?').all(user.id, limitDays);
        const tasks = await db.prepare('SELECT * FROM tasks WHERE user_id = ? ORDER BY date DESC LIMIT 200').all(user.id);

        // Group by date
        const timelineMap = new Map();

        health.forEach(h => {
          if (!timelineMap.has(h.checkin_date)) timelineMap.set(h.checkin_date, { date: h.checkin_date });
          timelineMap.get(h.checkin_date).health = h;
        });

        mood.forEach(m => {
          if (!timelineMap.has(m.checkin_date)) timelineMap.set(m.checkin_date, { date: m.checkin_date });
          timelineMap.get(m.checkin_date).mood = m;
        });

        tasks.forEach(t => {
          if (timelineMap.has(t.date)) {
            const entry = timelineMap.get(t.date);
            if (!entry.tasks) entry.tasks = [];
            entry.tasks.push(t);
          }
        });

        const timelineList = Array.from(timelineMap.values()).sort((a, b) => b.date.localeCompare(a.date));

        return sendJSON(res, 200, {
          success: true,
          range,
          timeline: timelineList
        });
      }

      // Feature #4: Smart Schedule Recommendation API
      if (pathname === '/api/schedule/recommendations' && method === 'GET') {
        const user = await getAuthUser(req);
        if (!user) return sendJSON(res, 401, { success: false, message: 'Unauthorized.' });

        const tasks = await db.prepare('SELECT * FROM tasks WHERE user_id = ?').all(user.id);
        const recs = analyzeScheduleBalance(tasks);

        return sendJSON(res, 200, { success: true, ...recs });
      }

      // Feature #5: Weekly Personal Report API
      if (pathname === '/api/reports/weekly' && method === 'GET') {
        const user = await getAuthUser(req);
        if (!user) return sendJSON(res, 401, { success: false, message: 'Unauthorized.' });

        const tasks = await db.prepare('SELECT * FROM tasks WHERE user_id = ?').all(user.id);
        const recentHealth = await db.prepare('SELECT * FROM health_checkins WHERE user_id = ? ORDER BY checkin_date DESC LIMIT 7').all(user.id);
        const recentMood = await db.prepare('SELECT * FROM mood_checkins WHERE user_id = ? ORDER BY checkin_date DESC LIMIT 7').all(user.id);

        const report = buildWeeklyReportData(tasks, recentHealth, recentMood);

        return sendJSON(res, 200, {
          success: true,
          report: {
            ...report,
            generatedAt: new Date().toISOString()
          }
        });
      }

      // ----------------------------------------
      // 7. STATISTICS & CHARTS DATA APIS
      // ----------------------------------------
      if (pathname === '/api/statistics' && method === 'GET') {
        const user = await getAuthUser(req);
        if (!user) return sendJSON(res, 401, { success: false, message: 'Unauthorized.' });

        const days = parseInt(parsedUrl.query.days) || 7;
        const startDate = parsedUrl.query.startDate;
        const endDate = parsedUrl.query.endDate;

        let taskQuery = 'SELECT category, priority, status, date FROM tasks WHERE user_id = ?';
        const taskParams = [user.id];

        let healthQuery = 'SELECT checkin_date, sleep_duration, water_ml, energy_level, physical_condition, exercise_status, exercise_duration FROM health_checkins WHERE user_id = ?';
        const healthParams = [user.id];

        let moodQuery = 'SELECT checkin_date, mood, stress_level, motivation_level, relaxed_score, anxiety_score FROM mood_checkins WHERE user_id = ?';
        const moodParams = [user.id];

        if (startDate && endDate) {
          taskQuery += ' AND date >= ? AND date <= ?';
          taskParams.push(startDate, endDate);

          healthQuery += ' AND checkin_date >= ? AND checkin_date <= ? ORDER BY checkin_date ASC';
          healthParams.push(startDate, endDate);

          moodQuery += ' AND checkin_date >= ? AND checkin_date <= ? ORDER BY checkin_date ASC';
          moodParams.push(startDate, endDate);
        } else {
          healthQuery += ' ORDER BY checkin_date DESC LIMIT ?';
          healthParams.push(days);

          moodQuery += ' ORDER BY checkin_date DESC LIMIT ?';
          moodParams.push(days);
        }

        const tasks = await db.prepare(taskQuery).all(...taskParams);
        const health = await db.prepare(healthQuery).all(...healthParams);
        const mood = await db.prepare(moodQuery).all(...moodParams);

        // Productivity by category
        const categoryCounts = {};
        tasks.forEach(t => {
          categoryCounts[t.category] = (categoryCounts[t.category] || 0) + 1;
        });

        // Mood distribution
        const moodCounts = {};
        mood.forEach(m => {
          moodCounts[m.mood] = (moodCounts[m.mood] || 0) + 1;
        });

        const sortedHealth = startDate && endDate ? health : health.reverse();
        const sortedMood = startDate && endDate ? mood : mood.reverse();

        return sendJSON(res, 200, {
          success: true,
          stats: {
            categoryCounts,
            moodCounts,
            healthHistory: sortedHealth,
            moodHistory: sortedMood,
            totalTasks: tasks.length,
            completedTasks: tasks.filter(t => t.status === 'completed').length
          }
        });
      }

      // ----------------------------------------
      // 8. NOTIFICATIONS & REMINDERS APIS
      // ----------------------------------------
      if (pathname === '/api/notifications') {
        const user = await getAuthUser(req);
        if (!user) return sendJSON(res, 401, { success: false, message: 'Unauthorized.' });

        if (method === 'GET') {
          const notifs = await db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 30').all(user.id);
          return sendJSON(res, 200, { success: true, notifications: notifs });
        }

        if (method === 'POST') {
          const body = await parseBody(req);
          const { title, message, notification_type, notification_time } = body;
          if (!title || !message) return sendJSON(res, 400, { success: false, message: 'Title and message required.' });

          const id = 'notif_' + crypto.randomUUID();
          await db.prepare(`
            INSERT INTO notifications (id, user_id, title, message, notification_type, notification_time, is_read, is_enabled, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?)
          `).run(id, user.id, title, message, notification_type || 'schedule', notification_time || '12:00', new Date().toISOString());

          return sendJSON(res, 201, { success: true, id });
        }
      }

      // Mark notification as read
      if (pathname.startsWith('/api/notifications/') && pathname.endsWith('/read') && method === 'POST') {
        const user = await getAuthUser(req);
        if (!user) return sendJSON(res, 401, { success: false, message: 'Unauthorized.' });

        const notifId = pathname.split('/')[3];
        await db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(notifId, user.id);
        return sendJSON(res, 200, { success: true });
      }

      // ----------------------------------------
      // 9. DATA PRIVACY, EXPORT & CLEAR HISTORY APIS
      // ----------------------------------------
      if (pathname === '/api/user/export' && method === 'GET') {
        const user = await getAuthUser(req);
        if (!user) return sendJSON(res, 401, { success: false, message: 'Unauthorized.' });

        const tasks = await db.prepare('SELECT * FROM tasks WHERE user_id = ?').all(user.id);
        const health = await db.prepare('SELECT * FROM health_checkins WHERE user_id = ?').all(user.id);
        const mood = await db.prepare('SELECT * FROM mood_checkins WHERE user_id = ?').all(user.id);
        const settings = await db.prepare('SELECT * FROM user_settings WHERE user_id = ?').get(user.id);
        const goals = await db.prepare('SELECT * FROM goals WHERE user_id = ?').all(user.id);
        const progressLogs = await db.prepare('SELECT * FROM progress_logs WHERE user_id = ?').all(user.id);
        const routineBlocks = await db.prepare('SELECT * FROM routine_blocks WHERE user_id = ?').all(user.id);
        const disruptions = await db.prepare('SELECT * FROM disruptions WHERE user_id = ?').all(user.id);

        const exportPayload = {
          lifecare_export_version: '1.0',
          export_date: new Date().toISOString(),
          user: {
            id: user.id,
            email: user.email,
            full_name: user.full_name,
            dob: user.dob,
            gender: user.gender,
            personal_goals: user.personal_goals
          },
          settings,
          psych_profile: user.psych_profile ? JSON.parse(user.psych_profile) : null,
          tasks,
          goals,
          progress_logs: progressLogs,
          routine_blocks: routineBlocks,
          disruptions,
          health_checkins: health,
          mood_checkins: mood
        };

        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="lifecare-data-${user.id}.json"`
        });
        return res.end(JSON.stringify(exportPayload, null, 2));
      }

      // Clear health and mood history
      if (pathname === '/api/user/clear-health' && method === 'POST') {
        const user = await getAuthUser(req);
        if (!user) return sendJSON(res, 401, { success: false, message: 'Unauthorized.' });

        await db.prepare('DELETE FROM health_checkins WHERE user_id = ?').run(user.id);
        await db.prepare('DELETE FROM mood_checkins WHERE user_id = ?').run(user.id);

        return sendJSON(res, 200, { success: true, message: 'Health and mood history permanently cleared.' });
      }

      // Delete account permanently
      if (pathname === '/api/user/account' && method === 'DELETE') {
        const user = await getAuthUser(req);
        if (!user) return sendJSON(res, 401, { success: false, message: 'Unauthorized.' });

        await db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
        return sendJSON(res, 200, { success: true, message: 'Your account and all associated data have been permanently removed.' });
      }

      // ----------------------------------------
      // 10. THỜI GIAN BIỂU CỐ ĐỊNH (TIME BLOCKS) – thiết lập một lần, tự lặp theo tuần
      // ----------------------------------------
      if (pathname === '/api/routine' || pathname.startsWith('/api/routine/')) {
        const user = await getAuthUser(req);
        if (!user) return sendJSON(res, 401, { success: false, message: 'Unauthorized.' });
        const now = new Date().toISOString();

        const validateBlock = (b, partial) => {
          const out = {};
          if (b.block_type !== undefined || !partial) {
            if (!P.BLOCK_TYPES.includes(b.block_type)) return [null, 'Loại khung giờ không hợp lệ.'];
            out.block_type = b.block_type;
          }
          if (b.label !== undefined) out.label = String(b.label || '').trim().slice(0, 80) || null;
          for (const k of ['start_time', 'end_time']) {
            if (b[k] !== undefined || !partial) {
              if (!P.isTime(b[k])) return [null, 'Giờ phải có dạng HH:MM.'];
              out[k] = b[k];
            }
          }
          if (out.start_time && out.end_time && out.start_time === out.end_time) return [null, 'Giờ bắt đầu và kết thúc không được trùng nhau.'];
          if (b.days !== undefined || !partial) {
            const days = P.parseDays(b.days);
            if (!days.length) return [null, 'Chọn ít nhất một ngày trong tuần.'];
            out.days = days.join(',');
          }
          return [out, null];
        };

        if (pathname === '/api/routine' && method === 'GET') {
          const blocks = await db.prepare('SELECT * FROM routine_blocks WHERE user_id = ? ORDER BY start_time').all(user.id);
          return sendJSON(res, 200, { success: true, blocks, blockTypes: P.BLOCK_TYPES, blockLabels: P.BLOCK_LABELS, templates: Object.keys(P.ROUTINE_TEMPLATES) });
        }

        if (pathname === '/api/routine' && method === 'POST') {
          const body = await parseBody(req);
          const [b, problem] = validateBlock(body, false);
          if (problem) return sendJSON(res, 400, { success: false, message: problem });
          const id = 'blk_' + crypto.randomUUID();
          await db.prepare(`INSERT INTO routine_blocks (id, user_id, block_type, label, start_time, end_time, days, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, user.id, b.block_type, b.label || P.BLOCK_LABELS[b.block_type], b.start_time, b.end_time, b.days, now, now);
          return sendJSON(res, 201, { success: true, block: await db.prepare('SELECT * FROM routine_blocks WHERE id = ?').get(id) });
        }

        // POST /api/routine/template – áp dụng mẫu thời gian biểu cho cả tuần hoặc các ngày được chọn
        if (pathname === '/api/routine/template' && method === 'POST') {
          const body = await parseBody(req);
          const template = P.ROUTINE_TEMPLATES[body.template];
          if (!template) return sendJSON(res, 400, { success: false, message: 'Mẫu không tồn tại.' });
          const onlyDays = body.days ? P.parseDays(body.days) : null;
          if (body.replace) await db.prepare('DELETE FROM routine_blocks WHERE user_id = ?').run(user.id);
          let created = 0;
          for (const b of template) {
            const days = onlyDays ? b.days.filter(d => onlyDays.includes(d)) : b.days;
            if (!days.length) continue;
            await db.prepare(`INSERT INTO routine_blocks (id, user_id, block_type, label, start_time, end_time, days, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('blk_' + crypto.randomUUID(), user.id, b.block_type, b.label, b.start_time, b.end_time, days.join(','), now, now);
            created++;
          }
          return sendJSON(res, 200, { success: true, created });
        }

        const blockId = pathname.split('/')[3];
        if (blockId && method === 'PUT') {
          const body = await parseBody(req);
          const [b, problem] = validateBlock(body, true);
          if (problem) return sendJSON(res, 400, { success: false, message: problem });
          const keys = Object.keys(b);
          if (!keys.length) return sendJSON(res, 400, { success: false, message: 'Không có gì để cập nhật.' });
          const r = await db.prepare(`UPDATE routine_blocks SET ${keys.map(k => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ? AND user_id = ?`)
            .run(...keys.map(k => b[k]), now, blockId, user.id);
          if (!r.changes) return sendJSON(res, 404, { success: false, message: 'Không tìm thấy khung giờ.' });
          return sendJSON(res, 200, { success: true, block: await db.prepare('SELECT * FROM routine_blocks WHERE id = ?').get(blockId) });
        }
        if (blockId && method === 'DELETE') {
          const r = await db.prepare('DELETE FROM routine_blocks WHERE id = ? AND user_id = ?').run(blockId, user.id);
          if (!r.changes) return sendJSON(res, 404, { success: false, message: 'Không tìm thấy khung giờ.' });
          return sendJSON(res, 200, { success: true });
        }
      }

      // GET /api/schedule?start=YYYY-MM-DD&end=YYYY-MM-DD – lịch theo ngày: khung giờ cố định + công việc + gián đoạn + giờ trống
      if (pathname === '/api/schedule' && method === 'GET') {
        const user = await getAuthUser(req);
        if (!user) return sendJSON(res, 401, { success: false, message: 'Unauthorized.' });
        const today = P.localNow(tz).date;
        const start = P.isRealDate(parsedUrl.query.start) ? parsedUrl.query.start : today;
        let end = P.isRealDate(parsedUrl.query.end) ? parsedUrl.query.end : start;
        if (end < start) end = start;
        if (P.daysBetween(start, end) > 41) end = P.addDays(start, 41);

        const blocks = await db.prepare('SELECT * FROM routine_blocks WHERE user_id = ?').all(user.id);
        const tasks = await db.prepare('SELECT * FROM tasks WHERE user_id = ? AND date >= ? AND date <= ? ORDER BY start_time').all(user.id, start, end);
        const disruptions = await db.prepare('SELECT * FROM disruptions WHERE user_id = ? AND date >= ? AND date <= ?').all(user.id, start, end);
        const free = await P.findFreeSlots(db, user.id, start, end, { minMinutes: 30, tz });
        const days = [];
        for (let d = start; d <= end; d = P.addDays(d, 1)) {
          days.push({
            date: d,
            weekday: P.dayKey(d),
            blocks: P.blocksForDate(blocks, d).map(b => ({ id: b.id, block_type: b.block_type, label: b.label, start: P.toHM(b.start), end: b.end === 1440 ? '24:00' : P.toHM(b.end) })),
            tasks: tasks.filter(t => t.date === d),
            disruptions: disruptions.filter(x => x.date === d),
            free_slots: free.filter(f => f.date === d)
          });
        }
        return sendJSON(res, 200, { success: true, today, timezone: tz, days });
      }

      // ----------------------------------------
      // 11. MỤC TIÊU, TIẾN ĐỘ, CỘT MỐC & DỰ BÁO
      // ----------------------------------------
      if (pathname === '/api/goals' || pathname.startsWith('/api/goals/')) {
        const user = await getAuthUser(req);
        if (!user) return sendJSON(res, 401, { success: false, message: 'Unauthorized.' });
        const now = new Date().toISOString();
        const parts = pathname.split('/'); // ['', 'api', 'goals', id, 'progress']
        const goalId = parts[3];

        const readGoal = body => {
          const g = {};
          if (body.title !== undefined) {
            if (!String(body.title || '').trim()) return [null, 'Tên mục tiêu không được để trống.'];
            g.title = String(body.title).trim().slice(0, 200);
          }
          if (body.description !== undefined) g.description = String(body.description || '').slice(0, 2000);
          if (body.deadline !== undefined) {
            if (body.deadline && !P.isRealDate(body.deadline)) return [null, 'Hạn chót không hợp lệ.'];
            g.deadline = body.deadline || null;
          }
          if (body.estimated_minutes !== undefined) {
            const m = intOrNull(body.estimated_minutes, 1, 100000);
            if (Number.isNaN(m)) return [null, 'Thời lượng dự kiến không hợp lệ.'];
            g.estimated_minutes = m;
          }
          if (body.priority !== undefined) {
            if (!['low', 'medium', 'high'].includes(body.priority)) return [null, 'Mức ưu tiên không hợp lệ.'];
            g.priority = body.priority;
          }
          if (body.status !== undefined) {
            if (!['active', 'paused', 'done'].includes(body.status)) return [null, 'Trạng thái không hợp lệ.'];
            g.status = body.status;
          }
          return [g, null];
        };

        if (pathname === '/api/goals' && method === 'GET') {
          const goals = await P.goalsWithProgress(db, user.id, tz);
          const logs = await db.prepare('SELECT * FROM progress_logs WHERE user_id = ? ORDER BY log_date DESC, created_at DESC LIMIT 40').all(user.id);
          return sendJSON(res, 200, { success: true, today: P.localNow(tz).date, goals, recentLogs: logs });
        }

        if (pathname === '/api/goals' && method === 'POST') {
          const body = await parseBody(req);
          const [g, problem] = readGoal(body);
          if (problem || !g.title) return sendJSON(res, 400, { success: false, message: problem || 'Tên mục tiêu không được để trống.' });
          const id = 'goal_' + crypto.randomUUID();
          await db.prepare(`INSERT INTO goals (id, user_id, title, description, deadline, estimated_minutes, priority, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`)
            .run(id, user.id, g.title, g.description || '', g.deadline || null, g.estimated_minutes || null, g.priority || 'medium', now, now);
          const goal = await db.prepare('SELECT * FROM goals WHERE id = ?').get(id);
          return sendJSON(res, 201, { success: true, goal: { ...goal, progress: await P.goalProgress(db, user.id, goal, tz) } });
        }

        // POST /api/goals/:id/progress – ghi lại việc học/làm thêm ngoài kế hoạch
        if (goalId && parts[4] === 'progress' && method === 'POST') {
          const goal = await db.prepare('SELECT * FROM goals WHERE id = ? AND user_id = ?').get(goalId, user.id);
          if (!goal) return sendJSON(res, 404, { success: false, message: 'Không tìm thấy mục tiêu.' });
          const body = await parseBody(req);
          const minutes = intOrNull(body.minutes, 1, 1440);
          if (!minutes) return sendJSON(res, 400, { success: false, message: 'Số phút phải từ 1 đến 1440.' });
          const date = P.isRealDate(body.date) ? body.date : P.localNow(tz).date;
          await P.addProgressLog(db, user.id, { goal_id: goalId, minutes, note: String(body.note || '').slice(0, 300), log_date: date, kind: 'extra' });
          return sendJSON(res, 200, { success: true, goal: { ...goal, progress: await P.goalProgress(db, user.id, goal, tz) } });
        }

        if (goalId && !parts[4] && method === 'PUT') {
          const body = await parseBody(req);
          const [g, problem] = readGoal(body);
          if (problem) return sendJSON(res, 400, { success: false, message: problem });
          const keys = Object.keys(g);
          if (!keys.length) return sendJSON(res, 400, { success: false, message: 'Không có gì để cập nhật.' });
          const r = await db.prepare(`UPDATE goals SET ${keys.map(k => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ? AND user_id = ?`)
            .run(...keys.map(k => g[k]), now, goalId, user.id);
          if (!r.changes) return sendJSON(res, 404, { success: false, message: 'Không tìm thấy mục tiêu.' });
          const goal = await db.prepare('SELECT * FROM goals WHERE id = ?').get(goalId);
          return sendJSON(res, 200, { success: true, goal: { ...goal, progress: await P.goalProgress(db, user.id, goal, tz) } });
        }

        if (goalId && !parts[4] && method === 'DELETE') {
          const r = await db.prepare('DELETE FROM goals WHERE id = ? AND user_id = ?').run(goalId, user.id);
          if (!r.changes) return sendJSON(res, 404, { success: false, message: 'Không tìm thấy mục tiêu.' });
          // Giữ lại các công việc, chỉ bỏ liên kết.
          await db.prepare('UPDATE tasks SET goal_id = NULL WHERE goal_id = ? AND user_id = ?').run(goalId, user.id);
          await db.prepare('UPDATE progress_logs SET goal_id = NULL WHERE goal_id = ? AND user_id = ?').run(goalId, user.id);
          return sendJSON(res, 200, { success: true });
        }
      }

      // DELETE /api/progress/:id – xoá một lần ghi tiến độ thêm
      if (pathname.startsWith('/api/progress/') && method === 'DELETE') {
        const user = await getAuthUser(req);
        if (!user) return sendJSON(res, 401, { success: false, message: 'Unauthorized.' });
        const r = await db.prepare("DELETE FROM progress_logs WHERE id = ? AND user_id = ? AND kind = 'extra'").run(pathname.split('/')[3], user.id);
        if (!r.changes) return sendJSON(res, 404, { success: false, message: 'Không tìm thấy bản ghi.' });
        return sendJSON(res, 200, { success: true });
      }

      // ----------------------------------------
      // 12. GIÁN ĐOẠN LỊCH TRÌNH (sự cố, nghỉ học, việc phát sinh, không thể thực hiện)
      // ----------------------------------------
      if (pathname === '/api/disruptions' || pathname.startsWith('/api/disruptions/')) {
        const user = await getAuthUser(req);
        if (!user) return sendJSON(res, 401, { success: false, message: 'Unauthorized.' });

        if (pathname === '/api/disruptions' && method === 'GET') {
          const today = P.localNow(tz).date;
          const start = P.isRealDate(parsedUrl.query.start) ? parsedUrl.query.start : P.addDays(today, -7);
          const end = P.isRealDate(parsedUrl.query.end) ? parsedUrl.query.end : P.addDays(today, 60);
          const list = await db.prepare('SELECT * FROM disruptions WHERE user_id = ? AND date >= ? AND date <= ? ORDER BY date, start_time').all(user.id, start, end);
          return sendJSON(res, 200, { success: true, disruptions: list, kinds: P.DISRUPTION_LABELS });
        }

        if (pathname === '/api/disruptions' && method === 'POST') {
          const body = await parseBody(req);
          if (!P.DISRUPTION_KINDS.includes(body.kind)) return sendJSON(res, 400, { success: false, message: 'Loại gián đoạn không hợp lệ.' });
          if (!P.isRealDate(body.date)) return sendJSON(res, 400, { success: false, message: 'Ngày không hợp lệ.' });
          const allDay = !body.start_time && !body.end_time;
          if (!allDay && !(P.isTime(body.start_time) && P.isTime(body.end_time) && body.end_time > body.start_time)) {
            return sendJSON(res, 400, { success: false, message: 'Nhập đủ giờ bắt đầu và kết thúc (kết thúc sau bắt đầu), hoặc chọn cả ngày.' });
          }
          const id = 'dis_' + crypto.randomUUID();
          await db.prepare('INSERT INTO disruptions (id, user_id, kind, date, start_time, end_time, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
            .run(id, user.id, body.kind, body.date, allDay ? null : body.start_time, allDay ? null : body.end_time, String(body.note || '').slice(0, 500), new Date().toISOString());
          // Các việc chưa xong bị ảnh hưởng
          const dayTasks = await db.prepare("SELECT * FROM tasks WHERE user_id = ? AND date = ? AND status != 'completed'").all(user.id, body.date);
          const affected = dayTasks.filter(t => allDay || !t.start_time || !t.end_time || (t.start_time < body.end_time && t.end_time > body.start_time));
          const disruption = await db.prepare('SELECT * FROM disruptions WHERE id = ?').get(id);
          return sendJSON(res, 201, { success: true, disruption, affectedTasks: affected });
        }

        const disId = pathname.split('/')[3];
        if (disId && method === 'DELETE') {
          const r = await db.prepare('DELETE FROM disruptions WHERE id = ? AND user_id = ?').run(disId, user.id);
          if (!r.changes) return sendJSON(res, 404, { success: false, message: 'Không tìm thấy gián đoạn.' });
          return sendJSON(res, 200, { success: true });
        }
      }

      // If no API route matches
      return sendJSON(res, 404, { success: false, message: 'API route not found' });
    } catch (apiErr) {
      console.error('API Error:', apiErr);
      return sendJSON(res, 500, { success: false, message: 'Internal server error: ' + apiErr.message });
    }
  }

  // ==========================================
  // STATIC ASSET SERVING
  // ==========================================
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Fallback for SPA routing to index.html if not an explicit asset
      const ext = path.extname(pathname);
      if (!ext) {
        filePath = path.join(PUBLIC_DIR, 'index.html');
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('404 Not Found');
      }
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (readErr, content) => {
      if (readErr) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        return res.end('Error loading file');
      }
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=86400'
      });
      res.end(content);
    });
  });
}

// Start server if run directly
if (require.main === module) {
  // Tạo bảng trước rồi mới seed tài khoản demo (database mới chưa có bảng nào).
  ensureServerInit()
    .then(() => console.log(`💾 Lưu trữ: ${getDb().storeInfo()}`))
    .catch(err => console.error('[LifeCare Server] DB init failed:', err.message));
  const server = http.createServer(handleRequest);
  server.listen(PORT, () => {
    console.log('====================================================');
    console.log('🌿 LifeCare – Your Life, Your Balance server online!');
    console.log(`🌐 Server running at: http://localhost:${PORT}`);
    console.log('🔑 Demo account: alex.balance@lifecare.app / LifeCare2026!');
    console.log('====================================================');
  });
}

module.exports = handleRequest;
