import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import type { EnvConfig } from '../config/env.js';

/**
 * One JSON line per request (id, method, path, status, ms, user). Slow (> 1 s) and failed
 * (5xx) requests are logged as warnings / errors so they stand out in production logs.
 * The request id is echoed back as `X-Request-Id` to match client reports with server logs.
 */
export function requestLogger(config: EnvConfig) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const id = (req.headers['x-request-id'] as string | undefined)?.slice(0, 64) || randomUUID();
    res.setHeader('X-Request-Id', id);
    if (config.NODE_ENV === 'test') return next();
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      const user = (req as Request & { user?: { id: string } }).user?.id ?? null;
      const line = JSON.stringify({ t: new Date().toISOString(), id, m: req.method, p: req.originalUrl.split('?')[0], s: res.statusCode, ms: Math.round(ms), user });
      if (res.statusCode >= 500) console.error(line);
      else if (ms > 1000) console.warn(line);
      else if (config.NODE_ENV !== 'production' || res.statusCode >= 400) console.log(line);
    });
    next();
  };
}

/** General API flood guard (per IP); stricter limits exist for auth, chat, invites and friend requests. */
export function createApiRateLimiter(config: EnvConfig) {
  return rateLimit({
    windowMs: 60_000,
    max: 900,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => config.NODE_ENV === 'test',
    message: { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Qua nhieu yeu cau. Vui long thu lai sau.' } },
  });
}
