/**
 * Mã hoá các trường nhạy cảm trước khi ghi ra Google Sheet / file JSON.
 *
 * - AES-256-GCM, mỗi giá trị một IV ngẫu nhiên: "enc:v1:<base64(iv | tag | ciphertext)>".
 * - Giá trị gốc được JSON.stringify trước khi mã hoá để giữ đúng kiểu (số / chữ).
 * - Dữ liệu chỉ được giải mã trong bộ nhớ server; Sheet và file JSON chỉ chứa bản mã.
 * - Khoá lấy từ biến môi trường DATA_ENCRYPTION_KEY. Khi chạy trên máy mà chưa đặt,
 *   server tự tạo khoá ngẫu nhiên và lưu ở data/.encryption-key (không commit).
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const PREFIX = 'enc:v1:';
const LOCAL_KEY_FILE = path.join(__dirname, '..', 'data', '.encryption-key');

// Bảng -> các cột được mã hoá. Tiêu đề / mô tả công việc cố ý để nguyên.
const ENCRYPTED_COLUMNS = {
  users: ['email', 'full_name', 'dob', 'gender', 'personal_goals', 'psych_profile'],
  sessions: ['token'],
  password_resets: ['token'],
  tasks: ['date', 'start_time', 'end_time', 'deadline', 'reminder_time'],
  goals: ['deadline'],
  routine_blocks: ['start_time', 'end_time'],
  disruptions: ['date', 'start_time', 'end_time'],
  progress_logs: ['log_date'],
  health_checkins: ['checkin_date', 'sleep_duration', 'sleep_quality', 'physical_condition', 'energy_level',
    'exercise_status', 'exercise_type', 'exercise_duration', 'meals_summary', 'water_ml', 'discomfort', 'notes'],
  mood_checkins: ['checkin_date', 'mood', 'emoji', 'stress_level', 'motivation_level', 'connected_score',
    'relaxed_score', 'anxiety_score', 'emotional_notes', 'journal_entry'],
  ai_chats: ['message']
};

let _key = null;

function getKey() {
  if (_key) return _key;
  let secret = process.env.DATA_ENCRYPTION_KEY;
  if (!secret) {
    if (process.env.VERCEL) {
      throw new Error('Thiếu biến môi trường DATA_ENCRYPTION_KEY (khoá mã hoá dữ liệu).');
    }
    if (fs.existsSync(LOCAL_KEY_FILE)) {
      secret = fs.readFileSync(LOCAL_KEY_FILE, 'utf8').trim();
    } else {
      secret = crypto.randomBytes(32).toString('base64');
      fs.mkdirSync(path.dirname(LOCAL_KEY_FILE), { recursive: true });
      fs.writeFileSync(LOCAL_KEY_FILE, secret + '\n', { mode: 0o600 });
      console.log(`[LifeCare Crypto] Đã tạo khoá mã hoá mới tại ${LOCAL_KEY_FILE}. Giữ file này cẩn thận: mất khoá là mất dữ liệu.`);
    }
  }
  // Chấp nhận khoá base64 32 byte; chuỗi khác thì băm SHA-256 thành 32 byte.
  const raw = Buffer.from(secret, 'base64');
  _key = raw.length === 32 ? raw : crypto.createHash('sha256').update(secret).digest();
  return _key;
}

function encryptValue(value) {
  if (value === null || value === undefined) return value;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64');
}

function decryptValue(value) {
  if (typeof value !== 'string' || !value.startsWith(PREFIX)) return value; // dữ liệu cũ chưa mã hoá
  const buf = Buffer.from(value.slice(PREFIX.length), 'base64');
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), buf.subarray(0, 12));
    decipher.setAuthTag(buf.subarray(12, 28));
    const text = Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8');
    return JSON.parse(text);
  } catch {
    throw new Error('Không giải mã được dữ liệu: DATA_ENCRYPTION_KEY không khớp với khoá đã dùng để mã hoá.');
  }
}

/** rows: mảng object. Trả về bản sao với các cột nhạy cảm đã mã hoá / giải mã. */
function transformRows(table, rows, fn) {
  const cols = ENCRYPTED_COLUMNS[table];
  if (!cols) return rows;
  return rows.map(row => {
    const out = { ...row };
    for (const c of cols) if (c in out) out[c] = fn(out[c]);
    return out;
  });
}

const encryptRows = (table, rows) => transformRows(table, rows, encryptValue);
const decryptRows = (table, rows) => transformRows(table, rows, decryptValue);

module.exports = { ENCRYPTED_COLUMNS, encryptValue, decryptValue, encryptRows, decryptRows, getKey };
