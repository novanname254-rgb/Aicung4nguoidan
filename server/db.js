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
const { encryptRows, decryptRows, encryptValue, decryptValue } = require('./crypto-fields');

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
  // Dữ liệu chính đang nằm trên Sheet ở phiên bản `version` (chưa mã hoá). So với bộ nhớ để biết
  // instance này đã đổi những dòng nào, và gộp đúng khi instance khác vừa ghi phiên bản mới.
  basePlain: emptyPlain(),
  sheetExtent: {},   // bảng -> { rows, cols } dữ liệu đang có trên Sheet (để ghi đè phủ hết phần cũ)
  syncPromise: null,
  guestVersions: {}, // guest_id -> phiên bản dữ liệu khách đã lưu tạm trên Sheet
  guestBase: {},     // guest_id -> dữ liệu khách ở phiên bản đó (để gộp như dữ liệu chính)
  instanceId: crypto.randomUUID(), // tên giữ khoá ghi trên Sheet
  columns: {} // bảng -> danh sách cột hiện tại
};

const GUEST_TTL_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------- gộp thay đổi theo từng dòng
// Mỗi bảng có khoá chính một cột. Gộp ba bên: base (bản trên Sheet mà instance này đã thấy),
// ours (bộ nhớ instance này), theirs (bản mới hơn do instance khác vừa ghi).
// Dòng mình thêm / sửa / xoá thắng; mọi dòng khác lấy theo theirs.
function emptyPlain() { return Object.fromEntries(TABLES.map(t => [t, []])); }
const pkOf = t => (t === 'sessions' || t === 'password_resets' ? 'token' : 'id');
// So sánh không phụ thuộc kiểu (Sheet trả số, SQLite trả chuỗi...): mọi giá trị đổi ra chuỗi, rỗng = null.
const canon = (t, r) => JSON.stringify(state.columns[t].map(c => (r[c] === null || r[c] === undefined || r[c] === '' ? null : String(r[c]))));
const indexRows = (t, rows) => new Map((rows || []).map(r => [String(r[pkOf(t)]), r]));

/** Khoá các dòng instance này đã thêm / sửa / xoá so với base. */
function touchedKeys(t, base, ours) {
  const b = indexRows(t, base[t]), o = indexRows(t, ours[t]);
  const touched = new Set();
  for (const [k, row] of o) if (!b.has(k) || canon(t, b.get(k)) !== canon(t, row)) touched.add(k);
  for (const k of b.keys()) if (!o.has(k)) touched.add(k);
  return touched;
}
const hasChanges = (base, ours) => TABLES.some(t => touchedKeys(t, base, ours).size > 0);

function mergePlain(base, ours, theirs) {
  const out = {};
  for (const t of TABLES) {
    const touched = touchedKeys(t, base, ours);
    const o = indexRows(t, ours[t]);
    const merged = indexRows(t, theirs[t]);
    for (const k of touched) {
      if (o.has(k)) merged.set(k, o.get(k)); else merged.delete(k);
    }
    out[t] = [...merged.values()];
  }
  return out;
}

/**
 * Đưa thay đổi của instance khác (theirs so với base) vào bộ nhớ, trừ các dòng instance này đã đổi.
 * Chỉ sửa đúng các dòng đó, không thay cả bảng, để không mất thay đổi của request khác đang chạy.
 * where: điều kiện giới hạn (dữ liệu chính hoặc đúng một khách).
 */
async function applyTheirChanges(base, ours, theirs) {
  await client.execute('PRAGMA foreign_keys = OFF');
  try {
    for (const t of TABLES) {
      const touched = touchedKeys(t, base, ours);
      const b = indexRows(t, base[t]);
      const th = indexRows(t, theirs[t]);
      const cols = state.columns[t];
      const upsert = `INSERT OR REPLACE INTO ${t} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`;
      const stmts = [];
      for (const [k, row] of th) {
        if (touched.has(k)) continue;
        if (!b.has(k) || canon(t, b.get(k)) !== canon(t, row)) stmts.push({ sql: upsert, args: cols.map(c => row[c] ?? null) });
      }
      for (const k of b.keys()) {
        if (!th.has(k) && !touched.has(k)) stmts.push({ sql: `DELETE FROM ${t} WHERE ${pkOf(t)} = ?`, args: [k] });
      }
      if (stmts.length) await client.batch(stmts, 'write');
    }
  } finally {
    await client.execute('PRAGMA foreign_keys = ON');
  }
}

/** Bản chụp đã nạp từ Sheet -> dữ liệu chưa mã hoá, đúng các cột hiện tại. */
function plainFromSnapshot(snapshot) {
  const out = emptyPlain();
  for (const t of TABLES) {
    const saved = snapshot?.tables?.[t];
    if (!saved || !saved.rows?.length) continue;
    const { columns, rows } = upgradeLegacyRows(t, saved.columns, saved.rows);
    out[t] = decryptRows(t, rows.map(r => Object.fromEntries(columns.map((c, i) => [c, r[i] ?? null]))))
      .map(o => Object.fromEntries(state.columns[t].map(c => [c, o[c] ?? null])));
  }
  return out;
}

/** Dữ liệu khách (object theo bảng) -> đủ mọi bảng. */
const guestPlain = data => Object.fromEntries(TABLES.map(t => [t, (data && data[t]) || []]));
const newVersion = () => `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
const versionTs = v => Number(String(v || '').split('-')[0]) || 0;

// Tài khoản khách (id bắt đầu "guest_") không bao giờ nằm trong dữ liệu chính trên Google Sheet / JSON.
// Trên Google Sheet, dữ liệu khách chỉ được giữ TẠM (mã hoá nguyên khối) ở tab "_guests" để mọi
// instance Vercel cùng thấy, và bị xoá khi khách đăng xuất hoặc sau 24 giờ.
const GUEST_FILTER = t => (t === 'users' ? "id NOT LIKE 'guest\\_%' ESCAPE '\\'" : "user_id NOT LIKE 'guest\\_%' ESCAPE '\\'");
const GUEST_ONLY = t => (t === 'users' ? "id LIKE 'guest\\_%' ESCAPE '\\'" : "user_id LIKE 'guest\\_%' ESCAPE '\\'");

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
  /** Phiên bản dữ liệu mà người dùng này đang thấy (khách: phiên bản riêng; người dùng thật: dữ liệu chính). */
  dataVersion: userId => (isGuest(userId) ? state.guestVersions[userId] || null : state.version),
  versionTs,
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
  // Giữ lại dữ liệu khách đang dùng (không có trong Sheet) rồi mới thay phần còn lại.
  const guestRows = {};
  for (const t of TABLES) {
    const rs = await client.execute(`SELECT * FROM ${t} WHERE ${GUEST_ONLY(t)}`);
    guestRows[t] = rs.rows.map(r => ({ ...r }));
  }
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
  for (const t of TABLES) {
    const rows = guestRows[t];
    if (!rows.length) continue;
    const cols = Object.keys(rows[0]);
    // OR IGNORE: dữ liệu trên Sheet thắng (VD dữ liệu khách vừa được chuyển sang tài khoản thật ở instance khác).
    const sql = `INSERT OR IGNORE INTO ${t} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`;
    await client.batch(rows.map(o => ({ sql, args: cols.map(c => o[c] ?? null) })), 'write');
  }
  await client.execute('PRAGMA foreign_keys = ON');
  state.version = snapshot?.version ?? null;
  state.basePlain = (await dumpPlain()).plain;
  state.sheetExtent = snapshot?.extent || {};
  state.dirty = false;
}

/** Dữ liệu cần lưu (chưa mã hoá, đã bỏ tài khoản khách) + mã băm để biết có thay đổi không. */
async function dumpPlain() {
  const plain = {};
  for (const t of TABLES) {
    const cols = state.columns[t];
    const rs = await client.execute(`SELECT ${cols.join(', ')} FROM ${t} WHERE ${GUEST_FILTER(t)} ORDER BY rowid`);
    plain[t] = rs.rows.map(r => ({ ...r }));
  }
  return { plain, hash: crypto.createHash('sha256').update(JSON.stringify(plain)).digest('hex') };
}

function encryptSnapshot(plain) {
  const tables = {};
  for (const t of TABLES) {
    const cols = state.columns[t];
    tables[t] = { columns: cols, rows: encryptRows(t, plain[t]).map(o => cols.map(c => o[c] ?? null)) };
  }
  return { version: `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`, savedAt: new Date().toISOString(), tables };
}

// ---------------------------------------------------------------- dữ liệu khách (lưu tạm)
const isGuest = id => typeof id === 'string' && id.startsWith('guest_');

async function localGuestIds() {
  const rs = await client.execute(`SELECT id FROM users WHERE ${GUEST_ONLY('users')}`);
  return rs.rows.map(r => r.id);
}

async function dumpGuest(gid) {
  const out = {};
  for (const t of TABLES) {
    const rs = await client.execute({ sql: `SELECT * FROM ${t} WHERE ${t === 'users' ? 'id' : 'user_id'} = ? ORDER BY rowid`, args: [gid] });
    if (rs.rows.length) out[t] = rs.rows.map(r => ({ ...r }));
  }
  return out;
}

async function removeGuestLocally(gid) {
  await client.execute({ sql: 'DELETE FROM users WHERE id = ?', args: [gid] }); // xoá dây chuyền mọi bảng con
  delete state.guestVersions[gid];
  delete state.guestBase[gid];
}

async function loadGuest(g) {
  const data = decryptValue(g.blob);
  await client.execute('PRAGMA foreign_keys = OFF');
  for (const t of [...TABLES].reverse()) {
    await client.execute({ sql: `DELETE FROM ${t} WHERE ${t === 'users' ? 'id' : 'user_id'} = ?`, args: [g.id] });
  }
  for (const t of TABLES) {
    const rows = data[t] || [];
    if (!rows.length) continue;
    const cols = Object.keys(rows[0]).filter(c => state.columns[t].includes(c));
    const sql = `INSERT OR REPLACE INTO ${t} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`;
    await client.batch(rows.map(o => ({ sql, args: cols.map(c => o[c] ?? null) })), 'write');
  }
  await client.execute('PRAGMA foreign_keys = ON');
  state.guestVersions[g.id] = g.version;
  state.guestBase[g.id] = guestPlain(data);
}

/** Đồng bộ dữ liệu khách theo trạng thái trên Sheet: nạp khách đổi phiên bản, xoá khách đã bị xoá ở nơi khác. */
async function applyRemoteGuests(remoteGuests) {
  const now = Date.now();
  const remoteIds = new Set();
  for (const g of remoteGuests) {
    if (g.expires_at <= now) continue;
    remoteIds.add(g.id);
    if (state.guestVersions[g.id] !== g.version) await loadGuest(g);
  }
  for (const gid of await localGuestIds()) {
    // Chỉ xoá khách đã từng được lưu (khách vừa tạo ở request đang chạy thì chưa có phiên bản).
    if (!remoteIds.has(gid) && state.guestVersions[gid]) await removeGuestLocally(gid);
  }
}

/**
 * Lưu tạm các khách có thay đổi; gỡ khách đã đăng xuất / hết hạn. Gọi khi đang giữ khoá ghi.
 * remote: trạng thái Sheet vừa đọc khi giữ khoá. Nếu cùng một khách vừa được instance khác lưu
 * (VD hai tab, hai yêu cầu song song), gộp theo từng dòng thay vì ghi đè cả khối.
 */
async function persistGuests(remote) {
  if (store.kind !== 'google-sheet') return;
  const ids = await localGuestIds();
  const remoteById = new Map((remote.guests || []).map(g => [g.id, g]));
  const upserts = [];
  const bases = {};
  for (const gid of ids) {
    const ours = guestPlain(await dumpGuest(gid));
    const base = state.guestBase[gid];
    if (base && !hasChanges(base, ours)) continue;
    const r = remoteById.get(gid);
    let target = ours;
    if (state.guestVersions[gid] && !r) {
      // Đã lưu trước đây nhưng không còn trên Sheet: khách đã đăng xuất / hết hạn ở nơi khác
      await removeGuestLocally(gid);
      continue;
    }
    if (r && r.version !== state.guestVersions[gid]) {
      const theirs = guestPlain(decryptValue(r.blob));
      const from = base || guestPlain(null);
      await applyTheirChanges(from, ours, theirs);
      target = mergePlain(from, ours, theirs);
    }
    const created = Date.parse(target.users?.[0]?.created_at || '') || Date.now();
    upserts.push({ id: gid, version: newVersion(), expires_at: created + GUEST_TTL_MS, blob: encryptValue(target) });
    bases[gid] = target;
  }
  const removed = Object.keys(state.guestVersions).filter(gid => !ids.includes(gid));
  if (!upserts.length && !removed.length) return;
  await store.saveGuests({ upserts, removed, current: remote.guests, extent: remote.guestExtent });
  for (const g of upserts) { state.guestVersions[g.id] = g.version; state.guestBase[g.id] = bases[g.id]; }
  for (const gid of removed) { delete state.guestVersions[gid]; delete state.guestBase[gid]; }
}

/** Ghi dữ liệu chính khi đang giữ khoá; instance khác vừa ghi thì gộp theo từng dòng rồi mới ghi. */
async function persistMain(remote) {
  const ours = (await dumpPlain()).plain;
  if (!hasChanges(state.basePlain, ours)) return;
  let target = ours;
  if (store.kind === 'google-sheet' && remote.version && remote.version !== state.version) {
    console.log('[LifeCare DB] Instance khác vừa ghi, gộp thay đổi trước khi lưu...');
    const snapshot = await store.load(TABLES);
    const theirs = plainFromSnapshot(snapshot);
    await applyTheirChanges(state.basePlain, ours, theirs);
    target = mergePlain(state.basePlain, ours, theirs);
    state.sheetExtent = snapshot?.extent || {};
  }
  const snapshot = encryptSnapshot(target);
  await store.save(snapshot, state.sheetExtent);
  state.version = snapshot.version;
  state.basePlain = target;
  state.sheetExtent = Object.fromEntries(TABLES.map(t => [t, {
    rows: Math.max(target[t].length + 1, state.sheetExtent[t]?.rows || 0),
    cols: Math.max(state.columns[t].length, state.sheetExtent[t]?.cols || 0)
  }]));
  state.lastVersionCheck = Date.now();
}

async function persist() {
  // Ghi tuần tự trong instance; giữa các instance thì dùng khoá ghi trên Sheet.
  const run = state.persistChain.then(async () => {
    if (!state.dirty) return;
    state.dirty = false;
    let remote = null;
    try {
      remote = await store.acquireLock(state.instanceId);
      await persistMain(remote);
      await persistGuests(remote);
    } catch (err) {
      state.dirty = true; // lần sau thử lại
      throw err;
    } finally {
      if (remote && remote.locked) await store.releaseLock(state.instanceId).catch(e => console.warn('[LifeCare DB] Không nhả được khoá ghi:', e.message));
    }
  });
  state.persistChain = run.catch(() => {});
  return run;
}

/** Nạp lại nếu một instance khác (Vercel) vừa ghi phiên bản mới. force = kiểm tra ngay, bỏ qua bộ đệm 15 giây. */
async function syncFromStore({ force = false, unknownSession = false, immediate = false } = {}) {
  if (store.kind !== 'google-sheet' || state.dirty) return;
  let age = Date.now() - state.lastVersionCheck;
  // immediate: trình duyệt cho biết đã thấy phiên bản mới hơn bản instance này đang giữ.
  if (immediate) age = Infinity;
  // Google Sheets chỉ cho ~60 lượt đọc/phút: yêu cầu đọc kiểm tra tối đa 15 giây/lần, yêu cầu ghi
  // tối đa 2 giây/lần, mã phiên lạ (có thể vừa tạo ở instance khác) tối đa 1 giây/lần;
  // các yêu cầu đồng thời dùng chung một lần kiểm tra.
  if (age < (unknownSession ? 1_000 : force ? 2_000 : 15_000)) return;
  if (state.syncPromise) return state.syncPromise;
  state.syncPromise = (async () => {
    const remote = await store.getState(); // một lần đọc: phiên bản dữ liệu chính + dữ liệu khách
    state.lastVersionCheck = Date.now();
    if (remote.version && remote.version !== state.version) {
      console.log('[LifeCare DB] Phát hiện dữ liệu mới trên Google Sheet, đang nạp lại...');
      await loadSnapshot(await store.load(TABLES));
    }
    await applyRemoteGuests(remote.guests);
  })().finally(() => { state.syncPromise = null; });
  return state.syncPromise;
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
      await applyRemoteGuests((await store.getState()).guests);
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
