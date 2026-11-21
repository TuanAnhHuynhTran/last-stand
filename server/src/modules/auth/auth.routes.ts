import { Router } from 'express';
import type { RequestHandler } from 'express';
import { loginSchema, logoutSchema, refreshTokenSchema, registerSchema } from '@cityverse/shared';
import { validateBody } from '../../middlewares/validate.middleware.js';
import type { AuthController } from './auth.controller.js';

export function createAuthRouter(
  controller: AuthController,
  authenticate: RequestHandler,
  authRateLimiter: RequestHandler
): Router {
  const router = Router();

  router.post('/register', authRateLimiter, validateBody(registerSchema), controller.register);
  router.post('/login', authRateLimiter, validateBody(loginSchema), controller.login);
  router.post('/dev-admin', controller.devAdmin);
  router.post('/refresh', validateBody(refreshTokenSchema), controller.refresh);
  router.post('/logout', authenticate, validateBody(logoutSchema), controller.logout);
  router.get('/me', authenticate, controller.me);

  return router;
}
