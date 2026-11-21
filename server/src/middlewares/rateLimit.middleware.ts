import rateLimit from 'express-rate-limit';
import type { EnvConfig } from '../config/env.js';

export function createAuthRateLimiter(config: EnvConfig) {
  return rateLimit({
    windowMs: config.AUTH_RATE_LIMIT_WINDOW_MS,
    max: config.AUTH_RATE_LIMIT_MAX_ATTEMPTS,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Ban da thao tac qua nhieu lan. Vui long thu lai sau it phut.',
      },
    },
  });
}
