/**
 * CITYVERSE - MySQL 8 Database Setup Script (Node.js)
 *
 * Chuc nang:
 *  1. Ket noi den MySQL 8 server bang thong tin trong file .env
 *  2. Tu dong tao database (mac dinh: `cityverse`) neu chua ton tai
 *  3. Chay Sequelize migrations (hoac thuc thi truc tiep init-mysql.sql khi truyen --sql)
 *  4. Tuy chon chay seed du lieu mau khi truyen --seed
 *
 * Cach su dung:
 *   node server/scripts/setup-db.js            # Tao DB + chay Sequelize migrations
 *   node server/scripts/setup-db.js --seed     # Tao DB + migrations + seed tai khoan demo
 *   node server/scripts/setup-db.js --sql      # Thuc thi truc tiep file init-mysql.sql
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(serverRoot, '..');

dotenv.config({ path: path.resolve(repoRoot, '.env') });
dotenv.config({ path: path.resolve(serverRoot, '.env') });

const dbConfig = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'cityverse',
};

const args = new Set(process.argv.slice(2));
const useSqlDirectly = args.has('--sql');
const shouldSeed = args.has('--seed');

function sanitizeDatabaseName(name) {
  if (!/^[a-zA-Z0-9_]+$/.test(name)) {
    throw new Error(`Ten database khong hop le: "${name}". Chi cho phep chu, so va dau gach duoi.`);
  }
  return name;
}

async function runSetup() {
  const safeDbName = sanitizeDatabaseName(dbConfig.database);
  console.log(`[CITYVERSE DB] Dang ket noi MySQL tai ${dbConfig.host}:${dbConfig.port}...`);

  let connection;
  try {
    connection = await mysql.createConnection({
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
      password: dbConfig.password,
      multipleStatements: true,
    });

    if (useSqlDirectly) {
      const sqlFilePath = path.resolve(__dirname, 'init-mysql.sql');
      let sqlContent = await fs.readFile(sqlFilePath, 'utf8');
      if (safeDbName !== 'cityverse') {
        sqlContent = sqlContent.replaceAll('`cityverse`', `\`${safeDbName}\``);
      }
      console.log(`[CITYVERSE DB] Dang thuc thi script SQL: ${sqlFilePath}`);
      await connection.query(sqlContent);
      console.log(`[CITYVERSE DB] Da tao database "${safeDbName}" va toan bo 6 bang thanh cong.`);
    } else {
      await connection.query(
        `CREATE DATABASE IF NOT EXISTS \`${safeDbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
      );
      console.log(`[CITYVERSE DB] Database "${safeDbName}" da san sang.`);
    }
  } finally {
    if (connection) {
      await connection.end();
    }
  }

  if (!useSqlDirectly) {
    console.log('[CITYVERSE DB] Dang chay Sequelize migrations...');
    execSync('npm run db:migrate', {
      cwd: serverRoot,
      stdio: 'inherit',
      env: process.env,
    });
  }

  if (shouldSeed) {
    console.log('[CITYVERSE DB] Dang chay seed du lieu mau...');
    execSync('npm run db:seed', {
      cwd: serverRoot,
      stdio: 'inherit',
      env: process.env,
    });
  }

  console.log('[CITYVERSE DB] Hoan tat khoi tao co so du lieu!');
}

runSetup().catch((error) => {
  console.error('[CITYVERSE DB] Loi khi khoi tao MySQL:', error.message);
  console.error(
    'Kiem tra lai dich vu MySQL 8 va thong tin DB_HOST, DB_PORT, DB_USER, DB_PASSWORD trong file .env.'
  );
  process.exit(1);
});
