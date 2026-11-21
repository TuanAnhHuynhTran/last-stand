import { Sequelize } from 'sequelize';
import type { EnvConfig } from './env.js';
import { env } from './env.js';

export function createSequelizeInstance(config: EnvConfig = env): Sequelize {
  if (config.DB_DIALECT === 'sqlite') {
    return new Sequelize({
      dialect: 'sqlite',
      storage: config.DB_STORAGE,
      logging: config.DB_LOGGING ? console.log : false,
      define: {
        underscored: true,
        timestamps: true,
      },
    });
  }

  return new Sequelize(config.DB_NAME, config.DB_USER, config.DB_PASSWORD, {
    host: config.DB_HOST,
    port: config.DB_PORT,
    dialect: 'mysql',
    logging: config.DB_LOGGING ? console.log : false,
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
    define: {
      underscored: true,
      timestamps: true,
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
    },
  });
}
