import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import type { EnvConfig } from './config/env.js';
import { openApiSpecification } from './config/swagger.js';
import type { DatabaseModels } from './database/models/index.js';
import { createAuthMiddleware } from './middlewares/auth.middleware.js';
import { errorHandler, notFoundHandler } from './middlewares/error.middleware.js';
import { createAuthRateLimiter } from './middlewares/rateLimit.middleware.js';
import { AuthController } from './modules/auth/auth.controller.js';
import { createAuthRouter } from './modules/auth/auth.routes.js';
import { AuthService } from './modules/auth/auth.service.js';
import { CharacterController } from './modules/characters/character.controller.js';
import { createCharacterRouter } from './modules/characters/character.routes.js';
import { CharacterService } from './modules/characters/character.service.js';
import { CityController } from './modules/cities/city.controller.js';
import { createCityRouter } from './modules/cities/city.routes.js';
import { CityService } from './modules/cities/city.service.js';
import { DashboardController } from './modules/dashboard/dashboard.controller.js';
import { createDashboardRouter } from './modules/dashboard/dashboard.routes.js';
import { DashboardService } from './modules/dashboard/dashboard.service.js';
import { WorldController } from './modules/world/world.controller.js';
import { createWorldRouter } from './modules/world/world.routes.js';
import { WorldService } from './modules/world/world.service.js';

export function createApp(models: DatabaseModels, config: EnvConfig): Express {
  const app = express();

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(
    cors({
      origin: config.CORS_ORIGIN.split(',').map((origin) => origin.trim()),
      credentials: true,
    })
  );
  app.use(express.json({ limit: '1mb' }));

  // OpenAPI & Swagger UI
  app.get('/api/docs.json', (_req, res) => {
    res.json(openApiSpecification);
  });
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiSpecification));

  // Health Check
  app.get('/api/v1/health', async (_req, res) => {
    try {
      await models.sequelize.authenticate();
      res.status(200).json({
        success: true,
        data: {
          status: 'ok',
          service: 'cityverse-api',
          database: 'connected',
          timestamp: new Date().toISOString(),
        },
      });
    } catch {
      res.status(503).json({
        success: false,
        error: {
          code: 'DATABASE_UNAVAILABLE',
          message: 'Khong the ket noi co so du lieu',
        },
      });
    }
  });

  // Dependency wiring
  const authenticate = createAuthMiddleware(models, config);
  const authRateLimiter = createAuthRateLimiter(config);

  const authService = new AuthService(models, config);
  const authController = new AuthController(authService);

  const characterService = new CharacterService(models);
  const characterController = new CharacterController(characterService);

  const cityService = new CityService(models);
  const cityController = new CityController(cityService);

  const dashboardService = new DashboardService(models);
  const dashboardController = new DashboardController(dashboardService);

  const worldService = new WorldService(models);
  const worldController = new WorldController(worldService);

  // API v1 Routes
  app.use('/api/v1/auth', createAuthRouter(authController, authenticate, authRateLimiter));
  app.use('/api/v1/characters', createCharacterRouter(characterController, authenticate));
  app.use('/api/v1/cities', createCityRouter(cityController, authenticate));
  app.use('/api/v1/cities', createWorldRouter(worldController, authenticate));
  app.use('/api/v1/dashboard', createDashboardRouter(dashboardController, authenticate));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
