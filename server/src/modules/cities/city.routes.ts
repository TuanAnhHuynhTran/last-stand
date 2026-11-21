import { Router } from 'express';
import type { RequestHandler } from 'express';
import { cityIdParamSchema, createCitySchema } from '@cityverse/shared';
import { validateBody, validateParams } from '../../middlewares/validate.middleware.js';
import type { CityController } from './city.controller.js';

export function createCityRouter(
  controller: CityController,
  authenticate: RequestHandler
): Router {
  const router = Router();

  router.get('/terrains', controller.getTerrains);
  router.get('/my', authenticate, controller.getMyCity);
  router.post('/', authenticate, validateBody(createCitySchema), controller.createCity);
  router.get(
    '/:cityId',
    authenticate,
    validateParams(cityIdParamSchema),
    controller.getCityById
  );

  return router;
}
