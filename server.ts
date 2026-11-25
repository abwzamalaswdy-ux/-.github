import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import express, { type NextFunction, type Request, type Response } from 'express';

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

// Ephemeral in-memory fallback ensures session signing never uses a predictable static secret
const SESSION_SECRET =
  process.env.AUTH_SESSION_SECRET && process.env.AUTH_SESSION_SECRET.trim().length >= 16
    ? process.env.AUTH_SESSION_SECRET.trim()
    : crypto.randomBytes(32).toString('hex');

const TOKEN_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 60 * 1000; // 60 seconds cooldown after 5 failures
const MAX_DB_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB

// Initial salted scrypt credential hash for first-run default passcode ("admin")
const DEFAULT_SALT = 'e038926e611f1a2b842cf211f330a5cc';
const DEFAULT_HASH =
  '8697b9b35b5f7926a99b8bbfa752d393d757e8f0f02a9e757d164fb50deec7d79b634112d94e09a4471b8dba4b4598d24ec547d080a3490cebaca759980f5790';

const DATA_DIR = path.resolve(process.cwd(), '.data');
const AUTH_STORE_PATH = path.resolve(DATA_DIR, 'auth-config.json');
const DB_CONFIG_PATH = path.resolve(DATA_DIR, 'db-config.json');
const TMP_DIR = path.resolve(DATA_DIR, 'tmp');

const CONFIGURED_DB_ROOT = process.env.LOCAL_DB_ROOT?.trim()
  ? path.resolve(process.env.LOCAL_DB_ROOT.trim())
  : path.resolve(process.cwd(), 'local-db');

function ensureStorageRoot(): string {
  fs.mkdirSync(CONFIGURED_DB_ROOT, { recursive: true, mode: 0o700 });
  return fs.realpathSync(CONFIGURED_DB_ROOT);
}

const DB_STORAGE_ROOT = ensureStorageRoot();
const DEFAULT_DB_FILENAME = 'mansarf-ledger.db';

type StoredAuthRecord = {
  salt: string;
  hash: string;
  isDefault: boolean;
  updatedAt: string;
};

type TokenPayload = {
  sub: 'admin';
  jti: string;
  iat: number;
  exp: number;
};

type RateLimitBucket = {
  failures: number;
  lockedUntil: number;
  lastAttemptAt: number;
};

type SheetKey = 'order' | 'dispatch' | 'single';
type SignPosition = 'right' | 'center' | 'left';
type NumeralStyle = 'ar' | 'en';
type BackupFrequency = 'off' | 'daily' | 'weekly' | 'monthly';

type ServerEntry = {
  id: string;
  name: string;
  day: number;
  desc: string;
  qty: number;
  date: string;
  sheet: SheetKey;
};

type ServerAppState = {
  entries: ServerEntry[];
  signer: {
    name: string;
    job: string;
    position: SignPosition;
    image: string;
  };
  period: string;
  unit: string;
  numeralStyle: NumeralStyle;
  autoLockMinutes: number;
  readOnly: boolean;
  highContrast: boolean;
  backupFrequency: BackupFrequency;
  lastBackupAt: string;
};

type DbFileInfo = {
  name: string;
  relativePath: string;
  sizeBytes: number;
  updatedAt: string;
};

type DbStatusInfo = {
  engine: 'sqlite';
  relativePath: string;
  fullPath: string;
  storageRoot: string;
  sizeBytes: number;
  updatedAt: string;
  entryCount: number;
  availableFiles: DbFileInfo[];
  availableDirs: string[];
  backups: DbFileInfo[];
};

const DEFAULT_SERVER_STATE: ServerAppState = {
  entries: [],
  signer: { name: '', job: '', position: 'right', image: '' },
  period: 'all',
  unit: 'لتر',
  numeralStyle: 'ar',
  autoLockMinutes: 15,
  readOnly: false,
  highContrast: false,
  backupFrequency: 'weekly',
  lastBackupAt: '',
};

const revokedTokenIds = new Map<string, number>();
const rateLimitMap = new Map<string, RateLimitBucket>();

function withTrailingSep(dir: string): string {
  return dir.endsWith(path.sep) ? dir : dir + path.sep;
}

function ensureSafeInternalPath(targetPath: string): string {
  const resolved = path.resolve(targetPath);
  if (!resolved.startsWith(withTrailingSep(DATA_DIR))) {
    throw new Error('Unsafe internal data path');
  }
  return resolved;
}

function roundQtyServer(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round((n + Number.EPSILON) * 10000) / 10000;
}

function isValidCalendarDateServer(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (year < 1900 || year > 2150 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  return day <= new Date(year, month, 0).getDate();
}

function sanitizeImageUrlServer(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2 * 1024 * 1024) return '';
  if (/^data:image\/(?:png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/i.test(trimmed)) {
    return trimmed;
  }
  return '';
}

function sanitizeServerEntry(raw: unknown): ServerEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const name = typeof r.name === 'string' ? r.name.trim().slice(0, 160) : '';
  const day = Math.trunc(Number(r.day));
  if (!name || !Number.isInteger(day) || day < 1 || day > 31) return null;

  const desc = typeof r.desc === 'string' ? r.desc.trim().slice(0, 400) : '';
  const rawQty = Number(r.qty);
  const qty = Number.isFinite(rawQty) && rawQty >= 0 ? roundQtyServer(rawQty) : 0;

  let date = '';
  if (typeof r.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.date.trim())) {
    const [y, m, d] = r.date.trim().split('-').map(Number);
    if (isValidCalendarDateServer(y, m, d)) {
      date = r.date.trim();
    }
  }

  const sheet: SheetKey =
    r.sheet === 'order' || r.sheet === 'dispatch' || r.sheet === 'single' ? r.sheet : 'single';
  const id = typeof r.id === 'string' && r.id.trim() ? r.id.trim().slice(0, 80) : crypto.randomUUID();

  return {
    id,
    name,
    day: date ? Number(date.slice(8, 10)) : day,
    desc,
    qty,
    date,
    sheet,
  };
}

function sanitizeServerState(raw: unknown): ServerAppState {
  if (!raw || typeof raw !== 'object') {
    return JSON.parse(JSON.stringify(DEFAULT_SERVER_STATE)) as ServerAppState;
  }
  const obj = raw as Record<string, unknown>;
  const entries = Array.isArray(obj.entries)
    ? obj.entries.map(sanitizeServerEntry).filter((e): e is ServerEntry => Boolean(e))
    : [];

  const rawSigner =
    obj.signer && typeof obj.signer === 'object'
      ? (obj.signer as Record<string, unknown>)
      : {};

  const period =
    typeof obj.period === 'string' && (obj.period === 'all' || /^\d{4}-\d{2}$/.test(obj.period))
      ? obj.period
      : 'all';

  const unit =
    typeof obj.unit === 'string' && obj.unit.trim().length <= 24
      ? obj.unit.trim()
      : DEFAULT_SERVER_STATE.unit;

  const numeralStyle: NumeralStyle = obj.numeralStyle === 'en' ? 'en' : 'ar';

  const autoLockMinutes =
    typeof obj.autoLockMinutes === 'number' && [0, 5, 15, 30].includes(obj.autoLockMinutes)
      ? obj.autoLockMinutes
      : DEFAULT_SERVER_STATE.autoLockMinutes;

  const pos: SignPosition =
    rawSigner.position === 'right' ||
    rawSigner.position === 'center' ||
    rawSigner.position === 'left'
      ? rawSigner.position
      : 'right';

  const backupFrequency: BackupFrequency =
    obj.backupFrequency === 'off' ||
    obj.backupFrequency === 'daily' ||
    obj.backupFrequency === 'weekly' ||
    obj.backupFrequency === 'monthly'
      ? obj.backupFrequency
      : 'weekly';

  let lastBackupAt = '';
  if (typeof obj.lastBackupAt === 'string' && obj.lastBackupAt.trim()) {
    const parsedTime = Date.parse(obj.lastBackupAt.trim());
    if (Number.isFinite(parsedTime) && parsedTime > 0) {
      lastBackupAt = new Date(parsedTime).toISOString();
    }
  }

  return {
    entries,
    signer: {
      name: typeof rawSigner.name === 'string' ? rawSigner.name.slice(0, 120) : '',
      job: typeof rawSigner.job === 'string' ? rawSigner.job.slice(0, 120) : '',
      position: pos,
      image: sanitizeImageUrlServer(rawSigner.image),
    },
    period,
    unit,
    numeralStyle,
    autoLockMinutes,
    readOnly: Boolean(obj.readOnly),
    highContrast: Boolean(obj.highContrast),
    backupFrequency,
    lastBackupAt,
  };
}

function resolveSafeDbPath(inputPath: string): { fullPath: string; relativePath: string } {
  if (typeof inputPath !== 'string') {
    throw new Error('المسار غير صالح.');
  }
  let raw = inputPath.trim();
  if (!raw || raw.length > 200 || raw.includes('\0')) {
    throw new Error('يرجى إدخال اسم ومسار ملف صالح.');
  }
  raw = raw.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (!raw) {
    throw new Error('يرجى إدخال اسم ملف قاعدة البيانات.');
  }

  const segments = raw.split('/');
  if (segments.length > 5) {
    throw new Error('عمق المجلدات الفرعية يتجاوز الحد المسموح (5 مستويات).');
  }
  for (const seg of segments) {
    if (
      !seg ||
      seg === '.' ||
      seg === '..' ||
      seg.startsWith('.') ||
      /[<>:"|?*]/.test(seg)
    ) {
      throw new Error('اسم المجلد أو الملف يحتوي على رموز غير مسموح بها.');
    }
  }

  const last = segments[segments.length - 1];
  if (!/\.(db|sqlite|sqlite3)$/i.test(last)) {
    segments[segments.length - 1] = `${last}.db`;
  }

  const normalizedRel = segments.join('/');
  const resolved = path.resolve(DB_STORAGE_ROOT, ...segments);
  const rootPrefix = withTrailingSep(DB_STORAGE_ROOT);
  if (!resolved.startsWith(rootPrefix)) {
    throw new Error('المسار يقع خارج نطاق مجلد قواعد البيانات المحلي.');
  }

  // Verify no existing ancestor symlink escapes DB_STORAGE_ROOT
  let probe = path.dirname(resolved);
  while (probe.length > DB_STORAGE_ROOT.length && !fs.existsSync(probe)) {
    probe = path.dirname(probe);
  }
  if (fs.existsSync(probe)) {
    const realAncestor = fs.realpathSync(probe);
    if (realAncestor !== DB_STORAGE_ROOT && !realAncestor.startsWith(rootPrefix)) {
      throw new Error('مسار التخزين يشير إلى رابط غير مصرح به خارج المجلد المحلي.');
    }
  }

  if (fs.existsSync(resolved)) {
    const stat = fs.lstatSync(resolved);
    if (stat.isSymbolicLink() || stat.isDirectory()) {
      throw new Error('المسار المختار ليس ملف قاعدة بيانات صالح.');
    }
    const realTarget = fs.realpathSync(resolved);
    if (!realTarget.startsWith(rootPrefix)) {
      throw new Error('ملف قاعدة البيانات خارج نطاق المجلد المسموح.');
    }
  }

  return { fullPath: resolved, relativePath: normalizedRel };
}

function getActiveDbTarget(): { fullPath: string; relativePath: string } {
  try {
    const cfgPath = ensureSafeInternalPath(DB_CONFIG_PATH);
    if (fs.existsSync(cfgPath)) {
      const parsed = JSON.parse(fs.readFileSync(cfgPath, 'utf8')) as {
        relativePath?: unknown;
      };
      if (typeof parsed.relativePath === 'string') {
        return resolveSafeDbPath(parsed.relativePath);
      }
    }
  } catch {
    // Fall back safely to default local SQLite DB path
  }
  return resolveSafeDbPath(DEFAULT_DB_FILENAME);
}

function saveActiveDbTarget(relativePath: string): { fullPath: string; relativePath: string } {
  const safe = resolveSafeDbPath(relativePath);
  const cfgPath = ensureSafeInternalPath(DB_CONFIG_PATH);
  fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(
    cfgPath,
    JSON.stringify({ relativePath: safe.relativePath, updatedAt: new Date().toISOString() }, null, 2),
    { mode: 0o600 }
  );
  return safe;
}

function initDatabaseFile(filePath: string): DatabaseSync {
  const parentDir = path.dirname(filePath);
  fs.mkdirSync(parentDir, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(filePath);
  // Single portable .db file without external -wal/-shm sidecars
  db.exec('PRAGMA journal_mode = DELETE; PRAGMA synchronous = FULL;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS entries (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      day INTEGER NOT NULL,
      desc TEXT NOT NULL DEFAULT '',
      qty REAL NOT NULL DEFAULT 0,
      date TEXT NOT NULL DEFAULT '',
      sheet TEXT NOT NULL DEFAULT 'single',
      sort_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  return db;
}

function readStateFromSqliteHandle(db: DatabaseSync): ServerAppState {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('entries', 'app_meta')")
    .all() as Array<{ name: string }>;
  const tableSet = new Set(tables.map((t) => t.name));

  let rawEntries: unknown[] = [];
  if (tableSet.has('entries')) {
    rawEntries = db
      .prepare('SELECT id, name, day, desc, qty, date, sheet FROM entries ORDER BY sort_order ASC, rowid ASC')
      .all();
  }

  const rawState: Record<string, unknown> = { entries: rawEntries };

  if (tableSet.has('app_meta')) {
    const metaRows = db.prepare('SELECT key, value FROM app_meta').all() as Array<{
      key: string;
      value: string;
    }>;
    for (const row of metaRows) {
      if (row.key === 'signer') {
        try {
          rawState.signer = JSON.parse(row.value);
        } catch {
          // ignore malformed signer meta
        }
      } else if (
        row.key === 'period' ||
        row.key === 'unit' ||
        row.key === 'numeralStyle' ||
        row.key === 'backupFrequency' ||
        row.key === 'lastBackupAt'
      ) {
        rawState[row.key] = row.value;
      } else if (row.key === 'autoLockMinutes') {
        rawState.autoLockMinutes = Number(row.value);
      } else if (row.key === 'readOnly' || row.key === 'highContrast') {
        rawState[row.key] = row.value === '1' || row.value === 'true';
      }
    }
  }

  return sanitizeServerState(rawState);
}

function readStateFromDb(filePath: string): ServerAppState {
  const db = initDatabaseFile(filePath);
  try {
    return readStateFromSqliteHandle(db);
  } finally {
    db.close();
  }
}

function writeStateToDb(filePath: string, rawState: unknown): ServerAppState {
  const clean = sanitizeServerState(rawState);
  const db = initDatabaseFile(filePath);
  try {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec('DELETE FROM entries');
      const insertEntry = db.prepare(
        'INSERT INTO entries (id, name, day, desc, qty, date, sheet, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      );
      clean.entries.forEach((entry, idx) => {
        insertEntry.run(
          entry.id,
          entry.name,
          entry.day,
          entry.desc,
          entry.qty,
          entry.date,
          entry.sheet,
          idx
        );
      });

      const upsertMeta = db.prepare(
        'INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
      );
      upsertMeta.run('signer', JSON.stringify(clean.signer));
      upsertMeta.run('period', clean.period);
      upsertMeta.run('unit', clean.unit);
      upsertMeta.run('numeralStyle', clean.numeralStyle);
      upsertMeta.run('autoLockMinutes', String(clean.autoLockMinutes));
      upsertMeta.run('readOnly', clean.readOnly ? '1' : '0');
      upsertMeta.run('highContrast', clean.highContrast ? '1' : '0');
      upsertMeta.run('backupFrequency', clean.backupFrequency);
      upsertMeta.run('lastBackupAt', clean.lastBackupAt);
      upsertMeta.run('updatedAt', new Date().toISOString());

      db.exec('COMMIT');
    } catch (err) {
      try {
        db.exec('ROLLBACK');
      } catch {
        // ignore rollback error
      }
      throw err;
    }
  } finally {
    db.close();
  }
  return clean;
}

function scanAvailableDbStorage(): {
  files: DbFileInfo[];
  dirs: string[];
  backups: DbFileInfo[];
} {
  const files: DbFileInfo[] = [];
  const dirs: string[] = [];
  const backups: DbFileInfo[] = [];

  function walk(currentDir: string, relPrefix: string, depth: number): void {
    if (depth > 4 || files.length + backups.length >= 160) return;
    let dirEntries: fs.Dirent[];
    try {
      dirEntries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const item of dirEntries) {
      if (item.name.startsWith('.') || item.isSymbolicLink()) continue;
      const itemRel = relPrefix ? `${relPrefix}/${item.name}` : item.name;
      const itemFull = path.join(currentDir, item.name);

      if (item.isDirectory()) {
        if (itemRel !== 'backups' && !itemRel.startsWith('backups/')) {
          dirs.push(itemRel);
        }
        walk(itemFull, itemRel, depth + 1);
      } else if (item.isFile() && /\.(db|sqlite|sqlite3)$/i.test(item.name)) {
        try {
          const st = fs.statSync(itemFull);
          const info: DbFileInfo = {
            name: item.name,
            relativePath: itemRel,
            sizeBytes: st.size,
            updatedAt: st.mtime.toISOString(),
          };
          if (itemRel.startsWith('backups/')) {
            backups.push(info);
          } else {
            files.push(info);
          }
        } catch {
          // skip unreadable file
        }
      }
    }
  }

  walk(DB_STORAGE_ROOT, '', 0);
  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  dirs.sort((a, b) => a.localeCompare(b));
  backups.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return { files, dirs, backups };
}

function buildDbStatusInfo(target: { fullPath: string; relativePath: string }, entryCount?: number): DbStatusInfo {
  let sizeBytes = 0;
  let updatedAt = new Date().toISOString();
  if (fs.existsSync(target.fullPath)) {
    const st = fs.statSync(target.fullPath);
    sizeBytes = st.size;
    updatedAt = st.mtime.toISOString();
  }
  const count = typeof entryCount === 'number' ? entryCount : readStateFromDb(target.fullPath).entries.length;
  const scanned = scanAvailableDbStorage();

  return {
    engine: 'sqlite',
    relativePath: target.relativePath,
    fullPath: target.fullPath,
    storageRoot: DB_STORAGE_ROOT,
    sizeBytes,
    updatedAt,
    entryCount: count,
    availableFiles: scanned.files,
    availableDirs: scanned.dirs,
    backups: scanned.backups.slice(0, 30),
  };
}

function hashPassword(password: string, saltHex: string): string {
  return crypto.scryptSync(password, saltHex, 64).toString('hex');
}

function verifyPasswordHash(candidate: string, saltHex: string, expectedHashHex: string): boolean {
  const candidateBuf = Buffer.from(hashPassword(candidate, saltHex), 'hex');
  const expectedBuf = Buffer.from(expectedHashHex, 'hex');
  if (candidateBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(candidateBuf, expectedBuf);
}

function readAuthRecord(): StoredAuthRecord {
  const envPass = process.env.ADMIN_PASSCODE?.trim();
  if (envPass) {
    const ephemeralSalt = 'env-override-salt';
    return {
      salt: ephemeralSalt,
      hash: hashPassword(envPass, ephemeralSalt),
      isDefault: false,
      updatedAt: '',
    };
  }

  try {
    const storePath = ensureSafeInternalPath(AUTH_STORE_PATH);
    if (fs.existsSync(storePath)) {
      const parsed = JSON.parse(fs.readFileSync(storePath, 'utf8')) as Partial<StoredAuthRecord>;
      if (
        typeof parsed.salt === 'string' &&
        /^[0-9a-f]{32}$/i.test(parsed.salt) &&
        typeof parsed.hash === 'string' &&
        /^[0-9a-f]{128}$/i.test(parsed.hash)
      ) {
        return {
          salt: parsed.salt,
          hash: parsed.hash,
          isDefault: Boolean(parsed.isDefault),
          updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '',
        };
      }
    }
  } catch {
    // Fall back safely to initial default credential hash
  }

  return {
    salt: DEFAULT_SALT,
    hash: DEFAULT_HASH,
    isDefault: true,
    updatedAt: '',
  };
}

function writeAuthRecord(newPassword: string): StoredAuthRecord {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashPassword(newPassword, salt);
  const record: StoredAuthRecord = {
    salt,
    hash,
    isDefault: false,
    updatedAt: new Date().toISOString(),
  };
  const storePath = ensureSafeInternalPath(AUTH_STORE_PATH);
  fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(storePath, JSON.stringify(record, null, 2), { mode: 0o600 });
  return record;
}

function signSessionToken(): { token: string; expiresAt: number } {
  const now = Date.now();
  const expiresAt = now + TOKEN_TTL_MS;
  const payload: TokenPayload = {
    sub: 'admin',
    jti: crypto.randomUUID(),
    iat: now,
    exp: expiresAt,
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  return { token: `${encoded}.${sig}`, expiresAt };
}

function verifySessionToken(token: string): TokenPayload | null {
  const dotIdx = token.indexOf('.');
  if (dotIdx <= 0) return null;
  const encoded = token.slice(0, dotIdx);
  const sig = token.slice(dotIdx + 1);
  if (!encoded || !sig) return null;

  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encoded)
    .digest('base64url');
  const sigBuf = Buffer.from(sig, 'utf8');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as TokenPayload;
    if (
      payload.sub !== 'admin' ||
      typeof payload.jti !== 'string' ||
      typeof payload.exp !== 'number' ||
      Date.now() > payload.exp
    ) {
      return null;
    }
    if (revokedTokenIds.has(payload.jti)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function revokeExpiredEntries(): void {
  const now = Date.now();
  for (const [jti, exp] of revokedTokenIds.entries()) {
    if (now > exp) revokedTokenIds.delete(jti);
  }
  for (const [ip, bucket] of rateLimitMap.entries()) {
    if (now - bucket.lastAttemptAt > LOCKOUT_MS * 10) {
      rateLimitMap.delete(ip);
    }
  }
}

function getClientKey(req: Request): string {
  return req.ip || req.socket.remoteAddress || 'local';
}

function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token || null;
}

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'مطلوب تسجيل الدخول أولًا.' });
    return;
  }
  const payload = verifySessionToken(token);
  if (!payload) {
    res.status(401).json({ error: 'انتهت الجلسة أو الرمز غير صالح.' });
    return;
  }
  (req as Request & { authPayload?: TokenPayload }).authPayload = payload;
  next();
}

async function startServer() {
  // Ensure active SQLite DB exists on boot
  const bootTarget = getActiveDbTarget();
  readStateFromDb(bootTarget.fullPath);

  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use('/api/auth', express.json({ limit: '64kb' }));

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    next();
  });

  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  app.get('/api/auth/status', (req, res) => {
    revokeExpiredEntries();
    const record = readAuthRecord();
    const bucket = rateLimitMap.get(getClientKey(req));
    const now = Date.now();
    const lockedOutSeconds =
      bucket && bucket.lockedUntil > now ? Math.ceil((bucket.lockedUntil - now) / 1000) : 0;

    res.json({
      configured: true,
      isDefaultPassword: record.isDefault,
      envOverride: Boolean(process.env.ADMIN_PASSCODE?.trim()),
      lockedOutSeconds,
    });
  });

  app.post('/api/auth/login', (req, res) => {
    revokeExpiredEntries();
    const clientKey = getClientKey(req);
    const now = Date.now();
    const bucket = rateLimitMap.get(clientKey);

    if (bucket && bucket.lockedUntil > now) {
      const retryAfterSeconds = Math.ceil((bucket.lockedUntil - now) / 1000);
      res.status(429).json({
        error: `تم تجاوز عدد المحاولات المسموح. انتظر ${retryAfterSeconds} ثانية.`,
        retryAfterSeconds,
      });
      return;
    }

    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!password || password.length > 128) {
      res.status(400).json({ error: 'يرجى إدخال كلمة المرور.' });
      return;
    }

    const record = readAuthRecord();
    const valid = verifyPasswordHash(password, record.salt, record.hash);

    if (!valid) {
      const nextFailures = (bucket?.failures || 0) + 1;
      const shouldLock = nextFailures >= MAX_FAILED_ATTEMPTS;
      rateLimitMap.set(clientKey, {
        failures: shouldLock ? 0 : nextFailures,
        lockedUntil: shouldLock ? now + LOCKOUT_MS : 0,
        lastAttemptAt: now,
      });

      if (shouldLock) {
        const retryAfterSeconds = Math.ceil(LOCKOUT_MS / 1000);
        res.status(429).json({
          error: `كلمة المرور غير صحيحة. تم القفل مؤقتًا لمدة ${retryAfterSeconds} ثانية.`,
          retryAfterSeconds,
        });
        return;
      }

      const remainingAttempts = MAX_FAILED_ATTEMPTS - nextFailures;
      res.status(401).json({
        error: `كلمة المرور غير صحيحة. المحاولات المتبقية: ${remainingAttempts}.`,
        remainingAttempts,
      });
      return;
    }

    rateLimitMap.delete(clientKey);
    const session = signSessionToken();
    res.json({
      token: session.token,
      expiresAt: session.expiresAt,
      isDefaultPassword: record.isDefault,
      envOverride: Boolean(process.env.ADMIN_PASSCODE?.trim()),
    });
  });

  app.get('/api/auth/verify', requireAuth, (req, res) => {
    const payload = (req as Request & { authPayload?: TokenPayload }).authPayload!;
    const record = readAuthRecord();
    res.json({
      valid: true,
      expiresAt: payload.exp,
      isDefaultPassword: record.isDefault,
      envOverride: Boolean(process.env.ADMIN_PASSCODE?.trim()),
    });
  });

  app.post('/api/auth/change-password', requireAuth, (req, res) => {
    if (process.env.ADMIN_PASSCODE?.trim()) {
      res.status(403).json({
        error: 'كلمة المرور مضبوطة عبر متغير البيئة ADMIN_PASSCODE ولا يمكن تعديلها من الواجهة.',
      });
      return;
    }

    const currentPassword =
      typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
    const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';

    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: 'يرجى إدخال كلمة المرور الحالية والجديدة.' });
      return;
    }
    if (newPassword.length < 4 || newPassword.length > 128) {
      res.status(400).json({ error: 'يجب أن تتكون كلمة المرور الجديدة من 4 إلى 128 حرفًا.' });
      return;
    }

    const record = readAuthRecord();
    if (!verifyPasswordHash(currentPassword, record.salt, record.hash)) {
      res.status(401).json({ error: 'كلمة المرور الحالية غير صحيحة.' });
      return;
    }

    const oldPayload = (req as Request & { authPayload?: TokenPayload }).authPayload;
    if (oldPayload) {
      revokedTokenIds.set(oldPayload.jti, oldPayload.exp);
    }

    writeAuthRecord(newPassword);
    const nextSession = signSessionToken();
    res.json({
      ok: true,
      token: nextSession.token,
      expiresAt: nextSession.expiresAt,
      isDefaultPassword: false,
    });
  });

  app.post('/api/auth/logout', requireAuth, (req, res) => {
    const payload = (req as Request & { authPayload?: TokenPayload }).authPayload;
    if (payload) {
      revokedTokenIds.set(payload.jti, payload.exp);
    }
    res.json({ ok: true });
  });

  /* ================= Local SQLite Database Endpoints (Authenticated) ================= */

  app.get('/api/db/info', requireAuth, (_req, res) => {
    try {
      const target = getActiveDbTarget();
      const dbInfo = buildDbStatusInfo(target);
      res.json({ dbInfo });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message || 'تعذر قراءة معلومات قاعدة البيانات.' });
    }
  });

  app.get('/api/db/state', requireAuth, (_req, res) => {
    try {
      const target = getActiveDbTarget();
      const state = readStateFromDb(target.fullPath);
      const dbInfo = buildDbStatusInfo(target, state.entries.length);
      res.json({ state, dbInfo });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message || 'تعذر قراءة قاعدة البيانات المحلية.' });
    }
  });

  app.put('/api/db/state', requireAuth, express.json({ limit: '10mb' }), (req, res) => {
    try {
      const target = getActiveDbTarget();
      const current = readStateFromDb(target.fullPath);
      const incoming = sanitizeServerState(req.body?.state ?? req.body);

      // Server-side Read-Only lock guard: prevent entry modifications if readOnly remains locked
      if (current.readOnly && incoming.readOnly) {
        incoming.entries = current.entries;
        incoming.signer = current.signer;
        incoming.unit = current.unit;
      }

      const saved = writeStateToDb(target.fullPath, incoming);
      const dbInfo = buildDbStatusInfo(target, saved.entries.length);
      res.json({ ok: true, state: saved, dbInfo });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message || 'تعذر حفظ البيانات في قاعدة البيانات.' });
    }
  });

  app.post('/api/db/location', requireAuth, express.json({ limit: '64kb' }), (req, res) => {
    try {
      const relativePath = typeof req.body?.relativePath === 'string' ? req.body.relativePath : '';
      const mode =
        req.body?.mode === 'open_or_create' ? 'open_or_create' : 'move_or_copy';

      const currentTarget = getActiveDbTarget();
      const nextTarget = resolveSafeDbPath(relativePath);

      if (mode === 'move_or_copy') {
        const currentState = readStateFromDb(currentTarget.fullPath);
        if (currentState.readOnly && nextTarget.fullPath !== currentTarget.fullPath && fs.existsSync(nextTarget.fullPath)) {
          res.status(403).json({
            error: 'وضع القراءة فقط نشط — قم بإلغائه قبل الكتابة فوق ملف قاعدة بيانات آخر.',
          });
          return;
        }
        writeStateToDb(nextTarget.fullPath, currentState);
      }

      saveActiveDbTarget(nextTarget.relativePath);
      const activeState = readStateFromDb(nextTarget.fullPath);
      const dbInfo = buildDbStatusInfo(nextTarget, activeState.entries.length);

      res.json({ ok: true, state: activeState, dbInfo });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message || 'تعذر تغيير مكان تخزين قاعدة البيانات.' });
    }
  });

  app.get('/api/db/export-file', requireAuth, (_req, res) => {
    try {
      const target = getActiveDbTarget();
      // Ensure DB is initialized on disk before streaming download
      readStateFromDb(target.fullPath);
      const safeDownloadName = path.basename(target.fullPath).replace(/[^\w.-]/g, '_');
      res.setHeader('Content-Type', 'application/vnd.sqlite3');
      res.setHeader('Content-Disposition', `attachment; filename="${safeDownloadName}"`);
      res.sendFile(target.fullPath);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message || 'تعذر تصدير ملف قاعدة البيانات.' });
    }
  });

  app.post(
    '/api/db/import-sqlite',
    requireAuth,
    express.raw({ type: 'application/octet-stream', limit: MAX_DB_UPLOAD_BYTES }),
    (req, res) => {
      const target = getActiveDbTarget();
      const currentState = readStateFromDb(target.fullPath);
      if (currentState.readOnly) {
        res.status(403).json({
          error: 'وضع القراءة فقط نشط — قم بإلغائه قبل استيراد قاعدة بيانات جديدة.',
        });
        return;
      }

      const buf = req.body as Buffer;
      if (!Buffer.isBuffer(buf) || buf.length < 100) {
        res.status(400).json({ error: 'ملف قاعدة البيانات فارغ أو غير مكتمل.' });
        return;
      }

      const sqliteHeader = 'SQLite format 3\0';
      if (buf.subarray(0, sqliteHeader.length).toString('utf8') !== sqliteHeader) {
        res.status(400).json({ error: 'الملف المحدد ليس ملف قاعدة بيانات SQLite صالحًا.' });
        return;
      }

      let destTarget = target;
      const requestedTargetPath = req.headers['x-target-path'];
      if (typeof requestedTargetPath === 'string' && requestedTargetPath.trim()) {
        try {
          destTarget = resolveSafeDbPath(requestedTargetPath.trim());
        } catch (err) {
          res.status(400).json({ error: (err as Error).message });
          return;
        }
      }

      fs.mkdirSync(TMP_DIR, { recursive: true, mode: 0o700 });
      const tmpPath = ensureSafeInternalPath(path.join(TMP_DIR, `import-${crypto.randomUUID()}.db`));

      try {
        fs.writeFileSync(tmpPath, buf, { mode: 0o600 });
        const tempDb = new DatabaseSync(tmpPath, { readOnly: true });
        let importedState: ServerAppState;
        try {
          const hasEntriesTable = tempDb
            .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'entries'")
            .get();
          if (!hasEntriesTable) {
            res.status(400).json({
              error: 'ملف SQLite لا يحتوي على جدول القيود الخاص بالتطبيق (entries).',
            });
            return;
          }
          importedState = readStateFromSqliteHandle(tempDb);
        } finally {
          tempDb.close();
        }

        const saved = writeStateToDb(destTarget.fullPath, importedState);
        if (destTarget.relativePath !== target.relativePath) {
          saveActiveDbTarget(destTarget.relativePath);
        }
        const dbInfo = buildDbStatusInfo(destTarget, saved.entries.length);
        res.json({ ok: true, state: saved, dbInfo });
      } catch (err) {
        res.status(400).json({
          error: (err as Error).message || 'تعذر قراءة أو استيراد ملف قاعدة البيانات.',
        });
      } finally {
        try {
          if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
        } catch {
          // ignore cleanup failure
        }
      }
    }
  );

  app.post('/api/db/backup', requireAuth, (_req, res) => {
    try {
      const target = getActiveDbTarget();
      const activeState = readStateFromDb(target.fullPath);
      const nowIso = new Date().toISOString();
      const stamp = nowIso.replace(/[:.]/g, '-').slice(0, 19);
      const rawBase = path
        .basename(target.fullPath)
        .replace(/\.(db|sqlite|sqlite3)$/i, '')
        .replace(/[^A-Za-z0-9_-]/g, '_');
      const safeBase = rawBase || 'mansarf-ledger';
      const backupRel = `backups/${safeBase}_backup_${stamp}.db`;
      const backupTarget = resolveSafeDbPath(backupRel);

      const snapshotState: ServerAppState = {
        ...activeState,
        lastBackupAt: nowIso,
      };
      writeStateToDb(backupTarget.fullPath, snapshotState);
      const savedActive = writeStateToDb(target.fullPath, snapshotState);
      const dbInfo = buildDbStatusInfo(target, savedActive.entries.length);

      res.json({
        ok: true,
        backupFile: backupTarget.relativePath,
        lastBackupAt: nowIso,
        state: savedActive,
        dbInfo,
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message || 'تعذر إنشاء النسخة الاحتياطية الدورية.' });
    }
  });

  app.get('/api/db/backup-file', requireAuth, (req, res) => {
    try {
      const requested = typeof req.query?.path === 'string' ? req.query.path : '';
      const safeTarget = resolveSafeDbPath(requested);
      if (!safeTarget.relativePath.startsWith('backups/')) {
        res.status(400).json({ error: 'المسار المطلوب ليس ضمن مجلد النسخ الاحتياطية.' });
        return;
      }
      if (!fs.existsSync(safeTarget.fullPath)) {
        res.status(404).json({ error: 'ملف النسخة الاحتياطية غير موجود.' });
        return;
      }
      const downloadName = path.basename(safeTarget.fullPath).replace(/[^\w.-]/g, '_');
      res.setHeader('Content-Type', 'application/vnd.sqlite3');
      res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
      res.sendFile(safeTarget.fullPath);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message || 'تعذر تنزيل ملف النسخة الاحتياطية.' });
    }
  });

  app.post('/api/db/restore-backup', requireAuth, express.json({ limit: '64kb' }), (req, res) => {
    try {
      const target = getActiveDbTarget();
      const currentState = readStateFromDb(target.fullPath);
      if (currentState.readOnly) {
        res.status(403).json({
          error: 'وضع القراءة فقط نشط — قم بإلغائه قبل استعادة نسخة احتياطية.',
        });
        return;
      }

      const requested = typeof req.body?.relativePath === 'string' ? req.body.relativePath : '';
      const backupTarget = resolveSafeDbPath(requested);
      if (!backupTarget.relativePath.startsWith('backups/')) {
        res.status(400).json({ error: 'المسار المحدد ليس ملف نسخة احتياطية صالحًا.' });
        return;
      }
      if (!fs.existsSync(backupTarget.fullPath)) {
        res.status(404).json({ error: 'ملف النسخة الاحتياطية غير موجود.' });
        return;
      }

      const backupDb = new DatabaseSync(backupTarget.fullPath, { readOnly: true });
      let restoredState: ServerAppState;
      try {
        restoredState = readStateFromSqliteHandle(backupDb);
      } finally {
        backupDb.close();
      }

      const saved = writeStateToDb(target.fullPath, {
        ...restoredState,
        backupFrequency: currentState.backupFrequency,
      });
      const dbInfo = buildDbStatusInfo(target, saved.entries.length);
      res.json({ ok: true, state: saved, dbInfo });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message || 'تعذر استعادة النسخة الاحتياطية.' });
    }
  });

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      res.sendFile(path.resolve(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://localhost:${PORT} (0.0.0.0:${PORT})`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

