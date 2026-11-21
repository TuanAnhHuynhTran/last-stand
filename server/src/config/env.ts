import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  DB_DIALECT: z.enum(['mysql', 'sqlite']).default('mysql'),
  DB_HOST: z.string().default('127.0.0.1'),
  DB_PORT: z.coerce.number().int().default(3306),
  DB_NAME: z.string().default('cityverse'),
  DB_USER: z.string().default('root'),
  DB_PASSWORD: z.string().default(''),
  DB_STORAGE: z.string().default(':memory:'),
  DB_LOGGING: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  JWT_ACCESS_SECRET: z
    .string()
    .min(16)
    .default('dev-cityverse-access-secret-change-in-production-01'),
  JWT_REFRESH_SECRET: z
    .string()
    .min(16)
    .default('dev-cityverse-refresh-secret-change-in-production-02'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
  AUTH_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(900000),
  AUTH_RATE_LIMIT_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(20),
  DEV_AUTO_ADMIN: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  DB_FALLBACK_SQLITE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function loadEnv(overrides?: Partial<Record<keyof EnvConfig, string | number>>): EnvConfig {
  const merged = {
    ...process.env,
    ...overrides,
  };
  return envSchema.parse(merged);
}

export const env = loadEnv();
