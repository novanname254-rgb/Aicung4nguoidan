const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

const DB_PATH = process.env.VERCEL 
  ? path.join('/tmp', 'lifecare.sqlite') 
  : path.join(__dirname, '..', 'data', 'lifecare.sqlite');

function initDatabase() {
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const db = new DatabaseSync(DB_PATH);

  // Enable foreign keys & WAL mode
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;

    -- 1. Users table
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

    -- 2. User Settings table
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

    -- 3. Tasks / Events table
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      category TEXT NOT NULL, -- 'Study', 'Work', 'Exercise', 'Personal', 'Rest', 'Other'
      priority TEXT NOT NULL, -- 'low', 'medium', 'high'
      date TEXT NOT NULL, -- 'YYYY-MM-DD'
      start_time TEXT, -- 'HH:mm'
      end_time TEXT, -- 'HH:mm'
      status TEXT DEFAULT 'pending', -- 'pending', 'completed'
      is_event INTEGER DEFAULT 0,
      reminder_time TEXT,
      recurring TEXT DEFAULT 'none', -- 'none', 'daily', 'weekly', 'monthly'
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- 4. Physical Health Check-ins
    CREATE TABLE IF NOT EXISTS health_checkins (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      checkin_date TEXT NOT NULL, -- 'YYYY-MM-DD'
      sleep_duration REAL, -- in hours
      sleep_quality TEXT, -- 'Very Good', 'Good', 'Average', 'Poor', 'Very Poor'
      physical_condition TEXT, -- 'Very Good', 'Good', 'Normal', 'Tired', 'Unwell'
      energy_level INTEGER, -- 1 to 5
      exercise_status TEXT, -- 'Yes', 'No'
      exercise_type TEXT, -- 'running', 'yoga', 'gym', 'walking', 'cycling', 'other'
      exercise_duration INTEGER DEFAULT 0, -- in minutes
      meals_summary TEXT, -- e.g. 'Breakfast: oatmeal, Lunch: salad, Dinner: fish'
      water_intake REAL, -- in liters
      discomfort TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- 5. Mental Health & Mood Check-ins
    CREATE TABLE IF NOT EXISTS mood_checkins (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      checkin_date TEXT NOT NULL, -- 'YYYY-MM-DD'
      mood TEXT NOT NULL, -- 'Happy', 'Excited', 'Relaxed', 'Normal', 'Tired', 'Stressed', 'Sad', 'Anxious', 'Overwhelmed'
      emoji TEXT,
      stress_level INTEGER, -- 1 to 5
      motivation_level INTEGER, -- 1 to 5
      connected_score INTEGER, -- 1 to 5
      relaxed_score INTEGER, -- 1 to 5
      anxiety_score INTEGER, -- 1 to 5
      emotional_notes TEXT,
      journal_entry TEXT, -- Detailed personal emotional journal reflection
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- 6. Notifications / Reminders log
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      notification_type TEXT NOT NULL, -- 'schedule', 'health', 'mental', 'system'
      notification_time TEXT NOT NULL,
      is_read INTEGER DEFAULT 0,
      is_enabled INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- 7. User Sessions table
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- 8. Password reset tokens
    CREATE TABLE IF NOT EXISTS password_resets (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- 9. AI Wellness Chat History
    CREATE TABLE IF NOT EXISTS ai_chats (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL, -- 'user', 'assistant'
      message TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Indices for fast querying
    CREATE INDEX IF NOT EXISTS idx_tasks_user_date ON tasks(user_id, date);
    CREATE INDEX IF NOT EXISTS idx_health_user_date ON health_checkins(user_id, checkin_date);
    CREATE INDEX IF NOT EXISTS idx_mood_user_date ON mood_checkins(user_id, checkin_date);
    CREATE INDEX IF NOT EXISTS idx_notifs_user ON notifications(user_id, is_read);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  `);

  // Run dynamic schema migrations for existing databases
  runMigrations(db);

  return db;
}

function runMigrations(db) {
  try {
    // Migration for tasks: recurring
    const taskCols = db.prepare("PRAGMA table_info(tasks)").all().map(c => c.name);
    if (!taskCols.includes('recurring')) {
      db.exec("ALTER TABLE tasks ADD COLUMN recurring TEXT DEFAULT 'none'");
    }

    // Migration for health_checkins: exercise_type, exercise_duration, meals_summary
    const healthCols = db.prepare("PRAGMA table_info(health_checkins)").all().map(c => c.name);
    if (!healthCols.includes('exercise_type')) {
      db.exec("ALTER TABLE health_checkins ADD COLUMN exercise_type TEXT");
    }
    if (!healthCols.includes('exercise_duration')) {
      db.exec("ALTER TABLE health_checkins ADD COLUMN exercise_duration INTEGER DEFAULT 0");
    }
    if (!healthCols.includes('meals_summary')) {
      db.exec("ALTER TABLE health_checkins ADD COLUMN meals_summary TEXT");
    }

    // Migration for mood_checkins: journal_entry
    const moodCols = db.prepare("PRAGMA table_info(mood_checkins)").all().map(c => c.name);
    if (!moodCols.includes('journal_entry')) {
      db.exec("ALTER TABLE mood_checkins ADD COLUMN journal_entry TEXT");
    }
  } catch (err) {
    console.error('Database migration note:', err.message);
  }
}

let _dbInstance = null;
function getDb() {
  if (!_dbInstance) {
    _dbInstance = initDatabase();
  }
  return _dbInstance;
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
  hashPassword,
  verifyPassword
};
