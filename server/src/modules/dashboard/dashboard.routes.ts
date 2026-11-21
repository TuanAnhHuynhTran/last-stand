import { Router } from 'express';
import type { RequestHandler } from 'express';
import type { DashboardController } from './dashboard.controller.js';

export function createDashboardRouter(
  controller: DashboardController,
  authenticate: RequestHandler
): Router {
  const router = Router();
  router.get('/', authenticate, controller.getDashboard);
  return router;
}
