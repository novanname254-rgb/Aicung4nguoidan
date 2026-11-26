/**
 * Nơi lưu dữ liệu bền vững của LifeCare.
 *
 * - GoogleSheetStore: mỗi bảng là một tab trong Google Sheet (hàng 1 là tên cột),
 *   tab "_meta" giữ phiên bản dữ liệu. Dùng khi có GOOGLE_SHEET_ID + GOOGLE_SERVICE_ACCOUNT_JSON.
 * - JsonFileStore: một file JSON (mặc định data/lifecare-store.json). Dùng khi chạy trên máy.
 *
 * Cả hai nhận và trả về "snapshot": { version, savedAt, tables: { tên: { columns, rows } } }.
 * Mã hoá trường nhạy cảm do db.js làm trước khi gọi save().
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// ---------------------------------------------------------------- JSON file
class JsonFileStore {
  constructor(filePath) {
    this.kind = 'json';
    this.filePath = filePath;
  }

  describe() {
    return `JSON file ${this.filePath}`;
  }

  async load() {
    if (!fs.existsSync(this.filePath)) return null;
    return JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
  }

  // Chỉ một tiến trình ghi file này, nên không cần kiểm tra thay đổi từ nơi khác.
  async getVersion() {
    return null;
  }

  async save(snapshot) {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tmp = this.filePath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(snapshot));
    fs.renameSync(tmp, this.filePath); // ghi nguyên tử: không để file dở dang nếu tiến trình bị dừng
  }
}

// ---------------------------------------------------------------- Google Sheet
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const META_TAB = '_meta';

function parseServiceAccount(raw) {
  let text = (raw || '').trim();
  if (!text.startsWith('{')) text = Buffer.from(text, 'base64').toString('utf8'); // cho phép dán dạng base64
  const json = JSON.parse(text);
  if (!json.client_email || !json.private_key) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON thiếu client_email hoặc private_key.');
  return json;
}

const b64url = buf => Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

class GoogleSheetStore {
  constructor(sheetId, serviceAccountRaw) {
    this.kind = 'google-sheet';
    this.sheetId = sheetId;
    this.account = parseServiceAccount(serviceAccountRaw);
    this._token = null;
    this._tokenExp = 0;
    this._knownTabs = null;
  }

  describe() {
    return `Google Sheet ${this.sheetId} (service account ${this.account.client_email})`;
  }

  async accessToken() {
    if (this._token && Date.now() < this._tokenExp - 60_000) return this._token;
    const now = Math.floor(Date.now() / 1000);
    const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claims = b64url(JSON.stringify({
      iss: this.account.client_email,
      scope: 'https://www.googleapis.com/auth/spreadsheets',
      aud: this.account.token_uri || 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600
    }));
    const signature = b64url(crypto.sign('RSA-SHA256', Buffer.from(`${header}.${claims}`), this.account.private_key));
    const res = await fetch(this.account.token_uri || 'https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: `${header}.${claims}.${signature}`
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.access_token) {
      throw new Error(`Google OAuth lỗi ${res.status}: ${data.error_description || data.error || 'không lấy được access token'}`);
    }
    this._token = data.access_token;
    this._tokenExp = Date.now() + (data.expires_in || 3600) * 1000;
    return this._token;
  }

  async api(method, urlPath, body, attempt = 0) {
    const res = await fetch(`${SHEETS_API}/${this.sheetId}${urlPath}`, {
      method,
      headers: { Authorization: `Bearer ${await this.accessToken()}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000)
    });
    // Vượt hạn mức (60 lượt/phút) hoặc Google tạm lỗi: đợi rồi thử lại tối đa 3 lần.
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      await new Promise(r => setTimeout(r, 1500 * 2 ** attempt));
      return this.api(method, urlPath, body, attempt + 1);
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data.error?.message || res.statusText;
      const hint = res.status === 403 || res.status === 404
        ? ` (Đã chia sẻ Sheet cho ${this.account.client_email} với quyền Editor chưa?)` : '';
      throw new Error(`Google Sheets API lỗi ${res.status}: ${msg}${hint}`);
    }
    return data;
  }

  async ensureTabs(names) {
    if (!this._knownTabs) {
      const info = await this.api('GET', '?fields=sheets.properties.title');
      this._knownTabs = new Set((info.sheets || []).map(s => s.properties.title));
    }
    const missing = names.filter(n => !this._knownTabs.has(n));
    if (missing.length) {
      await this.api('POST', ':batchUpdate', { requests: missing.map(title => ({ addSheet: { properties: { title } } })) });
      missing.forEach(n => this._knownTabs.add(n));
    }
  }

  async getVersion() {
    await this.ensureTabs([META_TAB]);
    const data = await this.api('GET', `/values/${encodeURIComponent(META_TAB + '!A1')}?valueRenderOption=UNFORMATTED_VALUE`);
    return data.values?.[0]?.[0] ?? null;
  }

  async load(tableNames) {
    await this.ensureTabs([META_TAB, ...tableNames]);
    const params = [META_TAB, ...tableNames].map(n => 'ranges=' + encodeURIComponent(n)).join('&');
    const data = await this.api('GET', `/values:batchGet?${params}&valueRenderOption=UNFORMATTED_VALUE`);
    const ranges = data.valueRanges || [];
    const version = ranges[0]?.values?.[0]?.[0] ?? null;
    if (version === null) return null; // Sheet mới, chưa có dữ liệu
    const tables = {};
    tableNames.forEach((name, i) => {
      const values = ranges[i + 1]?.values || [];
      if (!values.length) return;
      const columns = values[0].map(String);
      // Google bỏ các ô trống ở cuối hàng: bù lại bằng null.
      const rows = values.slice(1).map(r => columns.map((_, c) => (r[c] === '' || r[c] === undefined ? null : r[c])));
      tables[name] = { columns, rows };
    });
    return { version, savedAt: ranges[0]?.values?.[0]?.[1] ?? null, tables };
  }

  async save(snapshot) {
    const names = Object.keys(snapshot.tables);
    await this.ensureTabs([META_TAB, ...names]);
    await this.api('POST', '/values:batchClear', { ranges: names });
    const data = names.map(name => {
      const { columns, rows } = snapshot.tables[name];
      return { range: `${name}!A1`, values: [columns, ...rows.map(r => r.map(v => (v === null || v === undefined ? '' : v)))] };
    });
    data.push({ range: `${META_TAB}!A1`, values: [[snapshot.version, snapshot.savedAt, 'Dữ liệu nhạy cảm đã được mã hoá. Không sửa tay các tab này.']] });
    await this.api('POST', '/values:batchUpdate', { valueInputOption: 'RAW', data });
  }
}

function createStore() {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  const account = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (sheetId && account) return new GoogleSheetStore(sheetId, account);
  if (sheetId || account) {
    console.warn('[LifeCare Store] Cần đặt cả GOOGLE_SHEET_ID và GOOGLE_SERVICE_ACCOUNT_JSON để dùng Google Sheet. Đang dùng file JSON.');
  }
  const file = process.env.DATA_FILE ||
    (process.env.VERCEL ? '/tmp/lifecare-store.json' : path.join(__dirname, '..', 'data', 'lifecare-store.json'));
  if (process.env.VERCEL) {
    console.warn('[LifeCare Store] Chưa cấu hình Google Sheet: dữ liệu trên Vercel lưu tạm ở /tmp và sẽ bị mất.');
  }
  return new JsonFileStore(file);
}

module.exports = { createStore, JsonFileStore, GoogleSheetStore, parseServiceAccount };
