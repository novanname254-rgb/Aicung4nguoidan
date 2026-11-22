const { createClient } = require('@libsql/client');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

// Turso / Turbo Database configuration
const TURSO_URL = process.env.TURSO_DATABASE_URL || process.env.TURBO_DATABASE_URL || process.env.TURSO_URL;
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN || process.env.TURBO_AUTH_TOKEN || process.env.TURSO_TOKEN;

let _clientInstance = null;
let _isInitialized = false;

function isTursoConfigured() {
  return Boolean(TURSO_URL);
}

function getClient() {
  if (_clientInstance) {
    return _clientInstance;
  }

  if (TURSO_URL) {
    console.log(`[LifeCare DB] Initializing Turso Cloud Database connection: ${TURSO_URL}`);
    _clientInstance = createClient({
      url: TURSO_URL,
      authToken: TURSO_AUTH_TOKEN || undefined
    });
  } else {
    const dbPath = process.env.VERCEL 
      ? path.join('/tmp', 'lifecare.sqlite') 
      : path.join(__dirname, '..', 'data', 'lifecare.sqlite');

    const dataDir = path.dirname(dbPath);
    if (!fs.existsSync(dataDir)) {
      try {
        fs.mkdirSync(dataDir, { recursive: true });
      } catch (e) {
        console.warn('[LifeCare DB] Note creating directory:', e.message);
      }
    }

    console.log(`[LifeCare DB] Using local SQLite database file: ${dbPath}`);
    _clientInstance = createClient({
      url: 'file:' + path.resolve(dbPath)
    });
  }

  return _clientInstance;
}

// Unified Database Adapter matching SQLite prepare().get / .all / .run & exec()
const db = {
  isTurso: () => isTursoConfigured(),
  
  async execute(stmt) {
    const client = getClient();
    return client.execute(stmt);
  },

  async exec(sql) {
    const client = getClient();
    // Split SQL into individual statements safely
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    for (const stmt of statements) {
      try {
        await client.execute(stmt);
      } catch (err) {
        // Log pragma or already exists warnings gracefully
        if (!stmt.toUpperCase().startsWith('PRAGMA')) {
          console.warn('[LifeCare DB] exec statement warning:', err.message, '| Statement:', stmt.substring(0, 80));
        }
      }
    }
  },

  prepare(sql) {
    const client = getClient();
    return {
      async get(...args) {
        const flatArgs = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
        const rs = await client.execute({ sql, args: flatArgs });
        return rs.rows && rs.rows.length > 0 ? rs.rows[0] : null;
      },
      async all(...args) {
        const flatArgs = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
        const rs = await client.execute({ sql, args: flatArgs });
        return rs.rows || [];
      },
      async run(...args) {
        const flatArgs = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
        const rs = await client.execute({ sql, args: flatArgs });
        return {
          changes: rs.rowsAffected || 0,
          lastInsertRowid: rs.lastInsertRowid
        };
      }
    };
  }
};

async function initDatabase() {
  if (_isInitialized) return db;

  // 1. Pragmas (if supported)
  try {
    await db.exec('PRAGMA foreign_keys = ON;');
  } catch (e) {}

  // 2. Base Schema Creation
  await db.exec(`
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
      notification_frequency TEXT DEFAULT 'normal',
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
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
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
      water_intake REAL,
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

    CREATE TABLE IF NOT EXISTS ai_chats (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_user_date ON tasks(user_id, date);
    CREATE INDEX IF NOT EXISTS idx_health_user_date ON health_checkins(user_id, checkin_date);
    CREATE INDEX IF NOT EXISTS idx_mood_user_date ON mood_checkins(user_id, checkin_date);
    CREATE INDEX IF NOT EXISTS idx_notifs_user ON notifications(user_id, is_read);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  `);

  // 3. Schema Migrations for legacy columns
  await runMigrations(db);

  _isInitialized = true;
  return db;
}

async function runMigrations(database) {
  try {
    const taskCols = (await database.prepare("PRAGMA table_info(tasks)").all()).map(c => c.name);
    if (!taskCols.includes('recurring')) {
      await database.exec("ALTER TABLE tasks ADD COLUMN recurring TEXT DEFAULT 'none'");
    }

    const healthCols = (await database.prepare("PRAGMA table_info(health_checkins)").all()).map(c => c.name);
    if (!healthCols.includes('exercise_type')) {
      await database.exec("ALTER TABLE health_checkins ADD COLUMN exercise_type TEXT");
    }
    if (!healthCols.includes('exercise_duration')) {
      await database.exec("ALTER TABLE health_checkins ADD COLUMN exercise_duration INTEGER DEFAULT 0");
    }
    if (!healthCols.includes('meals_summary')) {
      await database.exec("ALTER TABLE health_checkins ADD COLUMN meals_summary TEXT");
    }

    const moodCols = (await database.prepare("PRAGMA table_info(mood_checkins)").all()).map(c => c.name);
    if (!moodCols.includes('journal_entry')) {
      await database.exec("ALTER TABLE mood_checkins ADD COLUMN journal_entry TEXT");
    }
  } catch (err) {
    console.log('[LifeCare DB] Migration status:', err.message);
  }
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
  return hash === storedHash;
}

module.exports = {
  getDb,
  initDatabase,
  isTursoConfigured,
  hashPassword,
  verifyPassword
};
