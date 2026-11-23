import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { createSequelizeInstance } from './config/database.js';
import { env, type EnvConfig } from './config/env.js';
import { ensureAdminAccount } from './database/ensureAdminAccount.js';
import { initModels, type DatabaseModels } from './database/models/index.js';
import { attachRealtime, type RealtimeServices } from './realtime/hub.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function connectDatabase(config: EnvConfig): Promise<DatabaseModels> {
  const primarySequelize = createSequelizeInstance(config);
  const primaryModels = initModels(primarySequelize);

  try {
    await primarySequelize.authenticate();
    console.log(
      `[CITYVERSE SERVER] Ket noi database (${config.DB_DIALECT}) thanh cong: ${config.DB_NAME}`
    );
    if (config.DB_DIALECT === 'sqlite') {
      await primarySequelize.sync();
    }
    return primaryModels;
  } catch (error) {
    if (config.NODE_ENV === 'production' || !config.DB_FALLBACK_SQLITE) {
      console.error('[CITYVERSE SERVER] Khong the ket noi database:', error);
      console.error(
        'Hay chay "node server/scripts/setup-db.js" sau khi khoi dong MySQL 8 va cau hinh .env.'
      );
      process.exit(1);
    }

    await primarySequelize.close().catch(() => {});

    const dataDir = path.resolve(__dirname, '../data');
    fs.mkdirSync(dataDir, { recursive: true });
    const sqlitePath = path.join(dataDir, 'cityverse-dev.sqlite');

    console.warn(
      `[CITYVERSE SERVER] Chua co MySQL -> tu dong dung SQLite local tam thoi tai: ${sqlitePath}`
    );

    const fallbackConfig: EnvConfig = {
      ...config,
      DB_DIALECT: 'sqlite',
      DB_STORAGE: sqlitePath,
    };
    const sqliteSequelize = createSequelizeInstance(fallbackConfig);
    const sqliteModels = initModels(sqliteSequelize);
    await sqliteSequelize.authenticate();
    await sqliteSequelize.sync();
    return sqliteModels;
  }
}

async function bootstrap(): Promise<void> {
  const models = await connectDatabase(env);

  if (env.NODE_ENV !== 'production' && env.DEV_AUTO_ADMIN) {
    try {
      await ensureAdminAccount(models, env);
      console.log(
        '[CITYVERSE SERVER] Da san sang tai khoan Admin mac dinh (admin@cityverse.io / @admin).'
      );
    } catch (error) {
      console.warn('[CITYVERSE SERVER] Khong the khoi tao tai khoan Admin mac dinh:', error);
    }
  }

  const app = createApp(models, env);
  // Phase 12: one HTTP server for REST + Socket.IO (realtime PvP, presence, alliance chat).
  const server = http.createServer(app);
  const realtime = app.locals.realtime as RealtimeServices;
  attachRealtime(server, models, env, realtime);
  realtime.pvp.start();

  const shutdown = (signal: string) => {
    console.log(`[CITYVERSE SERVER] ${signal}: dang tat...`);
    realtime.pvp.stop();
    server.close(() => void models.sequelize.close().finally(() => process.exit(0)));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => console.error('[CITYVERSE ERROR] unhandledRejection', reason));

  server.listen(env.PORT, () => {
    console.log(`[CITYVERSE SERVER] Dang chay tai http://localhost:${env.PORT}`);
    console.log(`[CITYVERSE SERVER] Swagger UI: http://localhost:${env.PORT}/api/docs`);
  });
}

bootstrap();
