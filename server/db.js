/**
 * Tầng dữ liệu của LifeCare.
 *
 * Khi chạy: toàn bộ dữ liệu nằm trong một SQLite trong bộ nhớ (libSQL ":memory:"), nên mọi câu SQL
 * trong server.js vẫn dùng như cũ.
 * Lưu bền vững: sau mỗi request có thay đổi, server chụp lại các bảng, mã hoá các trường nhạy cảm
 * (server/crypto-fields.js) rồi ghi ra Google Sheet hoặc file JSON (server/store.js).
 * Khi khởi động (hoặc khi một instance khác vừa ghi), dữ liệu được nạp lại và giải mã.
 */

const { createClient } = require('@libsql/client');
const crypto = require('node:crypto');
const { createStore } = require('./store');
const { encryptRows, decryptRows } = require('./crypto-fields');

// Thứ tự bảng: bảng cha trước bảng con.
const TABLES = [
  'users', 'user_settings', 'sessions', 'password_resets',
  'goals', 'tasks', 'progress_logs', 'routine_blocks', 'disruptions',
  'health_checkins', 'mood_checkins', 'notifications', 'ai_chats'
];

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    full_name TEXT NOT NULL,
    avatar TEXT,
    dob TEXT,
    gender TEXT,
    personal_goals TEXT,
    psych_profile TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_settings (
    id TEXT PRIMARY KEY,
    user_id TEXT UNIQUE NOT NULL,
    theme TEXT DEFAULT 'light',
    language TEXT DEFAULT 'vi',
    quiet_hours_start TEXT DEFAULT '22:00',
    quiet_hours_end TEXT DEFAULT '07:00',
    remind_water INTEGER DEFAULT 1,
    remind_break INTEGER DEFAULT 1,
    remind_health INTEGER DEFAULT 1,
    remind_mood INTEGER DEFAULT 1,
    remind_tasks INTEGER DEFAULT 1,
    remind_repeat_minutes INTEGER DEFAULT 15,
    remind_overdue INTEGER DEFAULT 1,
    notification_frequency TEXT DEFAULT 'normal',
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS password_resets (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS goals (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    deadline TEXT,
    estimated_minutes INTEGER,
    priority TEXT DEFAULT 'medium',
    status TEXT DEFAULT 'active',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL,
    priority TEXT NOT NULL,
    date TEXT NOT NULL,
    start_time TEXT,
    end_time TEXT,
    status TEXT DEFAULT 'pending',
    is_event INTEGER DEFAULT 0,
    reminder_time TEXT,
    recurring TEXT DEFAULT 'none',
    goal_id TEXT,
    duration_minutes INTEGER,
    deadline TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS progress_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    goal_id TEXT,
    task_id TEXT,
    log_date TEXT NOT NULL,
    minutes INTEGER NOT NULL,
    kind TEXT NOT NULL DEFAULT 'task_done',
    note TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS routine_blocks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    block_type TEXT NOT NULL,
    label TEXT,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    days TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS disruptions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    date TEXT NOT NULL,
    start_time TEXT,
    end_time TEXT,
    note TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS health_checkins (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    checkin_date TEXT NOT NULL,
    sleep_duration REAL,
    sleep_quality TEXT,
    physical_condition TEXT,
    energy_level INTEGER,
    exercise_status TEXT,
    exercise_type TEXT,
    exercise_duration INTEGER DEFAULT 0,
    meals_summary TEXT,
    water_ml INTEGER,
    discomfort TEXT,
    notes TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS mood_checkins (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    checkin_date TEXT NOT NULL,
    mood TEXT NOT NULL,
    emoji TEXT,
    stress_level INTEGER,
    motivation_level INTEGER,
    connected_score INTEGER,
    relaxed_score INTEGER,
    anxiety_score INTEGER,
    emotional_notes TEXT,
    journal_entry TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    notification_type TEXT NOT NULL,
    notification_time TEXT NOT NULL,
    is_read INTEGER DEFAULT 0,
    is_enabled INTEGER DEFAULT 1,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS ai_chats (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_tasks_user_date ON tasks(user_id, date);
  CREATE INDEX IF NOT EXISTS idx_tasks_goal ON tasks(goal_id);
  CREATE INDEX IF NOT EXISTS idx_logs_user_goal ON progress_logs(user_id, goal_id);
  CREATE INDEX IF NOT EXISTS idx_blocks_user ON routine_blocks(user_id);
  CREATE INDEX IF NOT EXISTS idx_disruptions_user_date ON disruptions(user_id, date);
  CREATE INDEX IF NOT EXISTS idx_health_user_date ON health_checkins(user_id, checkin_date);
  CREATE INDEX IF NOT EXISTS idx_mood_user_date ON mood_checkins(user_id, checkin_date);
  CREATE INDEX IF NOT EXISTS idx_notifs_user ON notifications(user_id, is_read);
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
`;

const client = createClient({ url: ':memory:' });
const store = createStore();

const state = {
  initialized: false,
  initPromise: null,
  dirty: false,
  version: null,
  lastVersionCheck: 0,
  persistChain: Promise.resolve(),
  columns: {} // bảng -> danh sách cột hiện tại
};

const WRITE_RE = /^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/i;
// libSQL không nhận undefined: đổi thành NULL (COALESCE(?, cột) giữ nguyên giá trị cũ).
const flat = args => (args.length === 1 && Array.isArray(args[0]) ? args[0] : args).map(v => (v === undefined ? null : v));

// Adapter giữ nguyên giao diện prepare().get / .all / .run & exec() mà server.js đang dùng.
const db = {
  async exec(sql) {
    for (const stmt of sql.split(';').map(s => s.trim()).filter(Boolean)) {
      await client.execute(stmt);
      if (WRITE_RE.test(stmt)) state.dirty = true;
    }
  },

  prepare(sql) {
    return {
      async get(...args) {
        const rs = await client.execute({ sql, args: flat(args) });
        return rs.rows && rs.rows.length ? { ...rs.rows[0] } : null;
      },
      async all(...args) {
        const rs = await client.execute({ sql, args: flat(args) });
        return (rs.rows || []).map(r => ({ ...r }));
      },
      async run(...args) {
        const rs = await client.execute({ sql, args: flat(args) });
        if (WRITE_RE.test(sql) && rs.rowsAffected > 0) state.dirty = true;
        return { changes: rs.rowsAffected || 0, lastInsertRowid: rs.lastInsertRowid };
      }
    };
  },

  isDirty: () => state.dirty,
  persist: () => persist(),
  syncFromStore: opts => syncFromStore(opts),
  storeInfo: () => store.describe()
};

async function readColumns() {
  for (const t of TABLES) {
    const rs = await client.execute(`PRAGMA table_info(${t})`);
    state.columns[t] = rs.rows.map(r => r.name);
  }
}

// ---------------------------------------------------------------- nạp dữ liệu
function upgradeLegacyRows(table, columns, rows) {
  // Bản cũ lưu nước theo lít (water_intake); bản mới lưu ml (water_ml).
  if (table === 'health_checkins' && columns.includes('water_intake') && !columns.includes('water_ml')) {
    const i = columns.indexOf('water_intake');
    return {
      columns: [...columns, 'water_ml'],
      rows: rows.map(r => [...r, r[i] === null || r[i] === '' ? null : Math.round(Number(r[i]) * 1000)])
    };
  }
  return { columns, rows };
}

async function loadSnapshot(snapshot) {
  await client.execute('PRAGMA foreign_keys = OFF');
  for (const t of [...TABLES].reverse()) await client.execute(`DELETE FROM ${t}`);
  for (const t of TABLES) {
    const saved = snapshot?.tables?.[t];
    if (!saved || !saved.rows?.length) continue;
    const { columns, rows } = upgradeLegacyRows(t, saved.columns, saved.rows);
    const objects = decryptRows(t, rows.map(r => Object.fromEntries(columns.map((c, i) => [c, r[i] ?? null]))));
    const cols = columns.filter(c => state.columns[t].includes(c));
    const sql = `INSERT OR REPLACE INTO ${t} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`;
    for (let i = 0; i < objects.length; i += 200) {
      await client.batch(objects.slice(i, i + 200).map(o => ({ sql, args: cols.map(c => o[c] ?? null) })), 'write');
    }
  }
  await client.execute('PRAGMA foreign_keys = ON');
  state.version = snapshot?.version ?? null;
  state.dirty = false;
}

async function dumpSnapshot() {
  const tables = {};
  for (const t of TABLES) {
    const cols = state.columns[t];
    const rs = await client.execute(`SELECT ${cols.join(', ')} FROM ${t}`);
    const rows = encryptRows(t, rs.rows.map(r => ({ ...r })));
    tables[t] = { columns: cols, rows: rows.map(o => cols.map(c => o[c] ?? null)) };
  }
  return { version: `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`, savedAt: new Date().toISOString(), tables };
}

async function persist() {
  // Ghi tuần tự: hai request song song không ghi đè lẫn nhau.
  const run = state.persistChain.then(async () => {
    if (!state.dirty) return;
    state.dirty = false;
    try {
      const snapshot = await dumpSnapshot();
      await store.save(snapshot);
      state.version = snapshot.version;
      state.lastVersionCheck = Date.now();
    } catch (err) {
      state.dirty = true; // lần sau thử lại
      throw err;
    }
  });
  state.persistChain = run.catch(() => {});
  return run;
}

/** Nạp lại nếu một instance khác (Vercel) vừa ghi phiên bản mới. force = kiểm tra ngay, bỏ qua bộ đệm 15 giây. */
async function syncFromStore({ force = false } = {}) {
  if (store.kind !== 'google-sheet' || state.dirty) return;
  if (!force && Date.now() - state.lastVersionCheck < 15_000) return;
  const remote = await store.getVersion();
  state.lastVersionCheck = Date.now();
  if (remote && remote !== state.version) {
    console.log('[LifeCare DB] Phát hiện dữ liệu mới trên Google Sheet, đang nạp lại...');
    await loadSnapshot(await store.load(TABLES));
  }
}

async function initDatabase() {
  if (state.initialized) return db;
  if (!state.initPromise) {
    state.initPromise = (async () => {
      await client.execute('PRAGMA foreign_keys = ON');
      for (const stmt of SCHEMA.split(';').map(s => s.trim()).filter(Boolean)) await client.execute(stmt);
      await readColumns();
      const snapshot = await store.load(TABLES);
      if (snapshot) await loadSnapshot(snapshot);
      state.lastVersionCheck = Date.now();
      console.log(`[LifeCare DB] Lưu trữ: ${store.describe()} (${snapshot ? 'đã nạp dữ liệu' : 'chưa có dữ liệu'})`);
      state.initialized = true;
    })().catch(err => {
      state.initPromise = null; // cho phép thử lại ở request sau
      throw err;
    });
  }
  await state.initPromise;
  return db;
}

function getDb() {
  return db;
}

// Password hashing helper (PBKDF2 with salt)
function hashPassword(password, salt = null) {
  if (!salt) {
    salt = crypto.randomBytes(16).toString('hex');
  }
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return { hash, salt };
}

function verifyPassword(password, storedHash, salt) {
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(String(storedHash || ''), 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = {
  getDb,
  initDatabase,
  hashPassword,
  verifyPassword,
  TABLES
};
