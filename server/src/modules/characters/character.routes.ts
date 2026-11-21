import { Router } from 'express';
import type { RequestHandler } from 'express';
import { createCharacterSchema } from '@cityverse/shared';
import { validateBody } from '../../middlewares/validate.middleware.js';
import type { CharacterController } from './character.controller.js';

export function createCharacterRouter(
  controller: CharacterController,
  authenticate: RequestHandler
): Router {
  const router = Router();

  router.get('/presets', controller.getPresets);
  router.get('/me', authenticate, controller.getMyCharacter);
  router.post('/', authenticate, validateBody(createCharacterSchema), controller.createCharacter);

  return router;
}
