/**
 * LAST HAVEN – database backup (Phase 12).
 *
 *   node server/scripts/backup-db.js                 # backup into server/backups/
 *   node server/scripts/backup-db.js --out D:/bk     # another folder
 *   node server/scripts/backup-db.js --keep 14       # keep the newest 14 backups (default 7)
 *
 * MySQL: a logical dump written by Node itself (no mysqldump needed): for every table
 * SHOW CREATE TABLE + batched INSERTs, inside one REPEATABLE READ transaction so the snapshot
 * is consistent, gzip-compressed (.sql.gz). Restore with:
 *   gunzip -c backup.sql.gz | mysql -u root -p cityverse
 * SQLite (dev fallback): `VACUUM INTO` a copy of the live file (safe while the server runs).
 *
 * Schedule it (cron / Task Scheduler) e.g. nightly; copy the folder off the machine.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.resolve(serverRoot, '..', '.env') });
dotenv.config({ path: path.resolve(serverRoot, '.env') });

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const outDir = path.resolve(arg('--out', path.join(serverRoot, 'backups')));
const keep = Math.max(1, Number(arg('--keep', '7')) || 7);
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
fs.mkdirSync(outDir, { recursive: true });

function prune(ext) {
  const files = fs.readdirSync(outDir).filter((f) => f.startsWith('lasthaven-') && f.endsWith(ext)).sort();
  for (const f of files.slice(0, Math.max(0, files.length - keep))) fs.rmSync(path.join(outDir, f));
}

async function backupSqlite() {
  const { default: sqlite3 } = await import('sqlite3');
  const source = path.resolve(serverRoot, process.env.DB_STORAGE || 'data/cityverse-dev.sqlite');
  if (!fs.existsSync(source)) throw new Error(`Khong thay file SQLite: ${source}`);
  const target = path.join(outDir, `lasthaven-${stamp}.sqlite`);
  await new Promise((resolve, reject) => {
    const db = new sqlite3.Database(source, sqlite3.OPEN_READONLY, (err) => {
      if (err) return reject(err);
      db.run(`VACUUM INTO '${target.replace(/'/g, "''")}'`, (e) => db.close(() => (e ? reject(e) : resolve())));
    });
  });
  prune('.sqlite');
  return target;
}

async function backupMysql() {
  const { default: mysql } = await import('mysql2/promise');
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'cityverse',
    dateStrings: true,
    supportBigNumbers: true,
  });
  const target = path.join(outDir, `lasthaven-${stamp}.sql.gz`);
  const gz = zlib.createGzip({ level: 6 });
  const file = fs.createWriteStream(target);
  gz.pipe(file);
  const write = (s) => new Promise((r) => (gz.write(s) ? r() : gz.once('drain', r)));
  try {
    await conn.query('SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await conn.query('START TRANSACTION WITH CONSISTENT SNAPSHOT');
    await write(`-- LAST HAVEN backup ${new Date().toISOString()} (${process.env.DB_NAME || 'cityverse'})\nSET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS = 0;\n\n`);
    const [tables] = await conn.query("SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'");
    let rowsTotal = 0;
    for (const row of tables) {
      const table = Object.values(row)[0];
      const [[create]] = await conn.query(`SHOW CREATE TABLE \`${table}\``);
      await write(`DROP TABLE IF EXISTS \`${table}\`;\n${create['Create Table']};\n`);
      const batch = 500;
      for (let offset = 0; ; offset += batch) {
        const [rows] = await conn.query(`SELECT * FROM \`${table}\` LIMIT ? OFFSET ?`, [batch, offset]);
        if (!rows.length) break;
        const cols = Object.keys(rows[0]).map((c) => `\`${c}\``).join(',');
        const values = rows.map((r) => `(${Object.values(r).map((v) => conn.escape(typeof v === 'object' && v !== null && !(v instanceof Buffer) ? JSON.stringify(v) : v)).join(',')})`).join(',\n');
        await write(`INSERT INTO \`${table}\` (${cols}) VALUES\n${values};\n`);
        rowsTotal += rows.length;
        if (rows.length < batch) break;
      }
      await write('\n');
    }
    await write('SET FOREIGN_KEY_CHECKS = 1;\n');
    await conn.query('COMMIT');
    console.log(`[BACKUP] ${tables.length} bang, ${rowsTotal} dong`);
  } finally {
    await conn.end();
    await new Promise((r) => {
      file.once('finish', r);
      gz.end();
    });
  }
  prune('.sql.gz');
  return target;
}

const dialect = process.env.DB_DIALECT || 'mysql';
(dialect === 'sqlite' ? backupSqlite() : backupMysql())
  .then((f) => console.log(`[BACKUP] Da luu: ${f} (${(fs.statSync(f).size / 1024).toFixed(1)} KB)`))
  .catch((err) => {
    console.error('[BACKUP] That bai:', err.message);
    process.exit(1);
  });
