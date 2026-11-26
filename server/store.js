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

  // Chỉ một tiến trình ghi file này, nên không cần kiểm tra thay đổi từ nơi khác,
  // và dữ liệu khách chỉ cần nằm trong bộ nhớ.
  async getState() {
    return { version: null, guests: [] };
  }

  async saveGuests() {}

  async save(snapshot) {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tmp = this.filePath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(snapshot));
    fs.renameSync(tmp, this.filePath); // ghi nguyên tử: không để file dở dang nếu tiến trình bị dừng
  }
}

// ---------------------------------------------------------------- Google Sheet
const SHEETS_API = process.env.SHEETS_API_BASE || 'https://sheets.googleapis.com/v4/spreadsheets'; // ghi đè chỉ để kiểm thử
const META_TAB = '_meta';
// Tab lưu TẠM dữ liệu tài khoản khách: mỗi khách một dòng [guest_id, version, expires_at, khối mã hoá...].
// Dòng bị xoá khi khách đăng xuất hoặc hết hạn (24 giờ). Khối mã hoá được chia nhỏ vì mỗi ô tối đa 50.000 ký tự.
const GUEST_TAB = '_guests';
const CELL_CHUNK = 45000;

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
    this._knownTabs = null; // tên tab -> { sheetId, rows, cols }
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
      const info = await this.api('GET', '?fields=sheets.properties(title,sheetId,gridProperties(rowCount,columnCount))');
      this._knownTabs = new Map((info.sheets || []).map(s => [s.properties.title, {
        sheetId: s.properties.sheetId,
        rows: s.properties.gridProperties?.rowCount || 1000,
        cols: s.properties.gridProperties?.columnCount || 26
      }]));
    }
    const missing = names.filter(n => !this._knownTabs.has(n));
    if (missing.length) {
      const out = await this.api('POST', ':batchUpdate', { requests: missing.map(title => ({ addSheet: { properties: { title } } })) });
      (out.replies || []).forEach((r, i) => {
        const p = r.addSheet?.properties || {};
        this._knownTabs.set(missing[i], { sheetId: p.sheetId, rows: p.gridProperties?.rowCount || 1000, cols: p.gridProperties?.columnCount || 26 });
      });
      missing.forEach(n => { if (!this._knownTabs.has(n)) this._knownTabs.set(n, { sheetId: undefined, rows: 1000, cols: 26 }); });
    }
  }

  /** Nới rộng lưới của tab nếu dữ liệu cần nhiều hàng / cột hơn (tab mới chỉ có 1000 × 26 ô). */
  async ensureGrid(sizes) {
    const requests = [];
    for (const [title, { rows, cols }] of Object.entries(sizes)) {
      const g = this._knownTabs.get(title);
      if (!g || g.sheetId === undefined) continue;
      const needRows = Math.max(g.rows, rows + 50);
      const needCols = Math.max(g.cols, cols);
      if (needRows > g.rows || needCols > g.cols) {
        requests.push({ updateSheetProperties: {
          properties: { sheetId: g.sheetId, gridProperties: { rowCount: needRows, columnCount: needCols } },
          fields: 'gridProperties(rowCount,columnCount)'
        } });
        g.rows = needRows; g.cols = needCols;
      }
    }
    if (requests.length) await this.api('POST', ':batchUpdate', { requests });
  }

  static parseGuests(values) {
    return (values || []).filter(r => r && r[0]).map(r => ({
      id: String(r[0]),
      version: r[1] == null ? null : String(r[1]),
      expires_at: Number(r[2]) || 0,
      blob: r.slice(3).filter(v => v !== '' && v != null).join('')
    }));
  }

  /** Một lần đọc: phiên bản dữ liệu chính + toàn bộ dữ liệu khách đang dùng. */
  async getState() {
    await this.ensureTabs([META_TAB, GUEST_TAB]);
    const data = await this.api('GET', `/values:batchGet?ranges=${encodeURIComponent(META_TAB + '!A1:B1')}&ranges=${encodeURIComponent(GUEST_TAB)}&valueRenderOption=UNFORMATTED_VALUE`);
    const ranges = data.valueRanges || [];
    return { version: ranges[0]?.values?.[0]?.[0] ?? null, guests: GoogleSheetStore.parseGuests(ranges[1]?.values) };
  }

  /** Cập nhật dữ liệu khách: upserts [{id, version, expires_at, blob}], removed [id]. Tự bỏ các khách đã hết hạn. */
  async saveGuests({ upserts = [], removed = [] }) {
    await this.ensureTabs([GUEST_TAB]);
    const data = await this.api('GET', `/values/${encodeURIComponent(GUEST_TAB)}?valueRenderOption=UNFORMATTED_VALUE`);
    const now = Date.now();
    const byId = new Map(GoogleSheetStore.parseGuests(data.values).map(g => [g.id, g]));
    removed.forEach(id => byId.delete(id));
    upserts.forEach(g => byId.set(g.id, g));
    const rows = [...byId.values()].filter(g => g.expires_at > now).map(g => {
      const chunks = [];
      for (let i = 0; i < g.blob.length; i += CELL_CHUNK) chunks.push(g.blob.slice(i, i + CELL_CHUNK));
      return [g.id, g.version, g.expires_at, ...chunks];
    });
    const width = Math.max(4, ...rows.map(r => r.length));
    await this.ensureGrid({ [GUEST_TAB]: { rows: rows.length + 1, cols: width } });
    await this.api('POST', '/values:batchClear', { ranges: [GUEST_TAB] });
    if (rows.length) {
      await this.api('POST', '/values:batchUpdate', { valueInputOption: 'RAW', data: [{ range: `${GUEST_TAB}!A1`, values: rows }] });
    }
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
    await this.ensureGrid(Object.fromEntries(names.map(n => [n, { rows: snapshot.tables[n].rows.length + 1, cols: snapshot.tables[n].columns.length }])));
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
