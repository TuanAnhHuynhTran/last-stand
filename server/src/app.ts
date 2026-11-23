import { BattleService } from './modules/battle/battle.service.js';
import { createBattleRouter } from './modules/battle/battle.routes.js';
import { createExplorationRouter } from './modules/world/exploration.routes.js';
import { ExplorationService } from './modules/world/exploration.service.js';
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
import { BuildingController, createBuildingRouter } from './modules/buildings/building.routes.js';
import {
  BuildingContext,
  BuildingPlacementService,
  BuildingQueryService,
  BuildingUpgradeService,
} from './modules/buildings/building.service.js';
import { FarmController, createFarmRouter } from './modules/farming/farm.routes.js';
import { FarmService } from './modules/farming/farm.service.js';
import { LivestockController, createLivestockRouter } from './modules/livestock/livestock.routes.js';
import { LivestockService } from './modules/livestock/livestock.service.js';
import { AquacultureController, createAquacultureRouter } from './modules/aquaculture/aquaculture.routes.js';
import { AquacultureService } from './modules/aquaculture/aquaculture.service.js';
import { PopulationController, createPopulationRouter } from './modules/population/population.routes.js';
import { PopulationService } from './modules/population/population.service.js';
import { MilitaryController, createMilitaryRouter } from './modules/military/military.routes.js';
import { MilitaryService } from './modules/military/military.service.js';
import { MountController, createMountRouter } from './modules/mounts/mount.routes.js';
import { MountService } from './modules/mounts/mount.service.js';
import { createDevRouter } from './modules/dev/dev.routes.js';
import { createApiRateLimiter, requestLogger } from './middlewares/requestLog.middleware.js';
import { AllianceService } from './modules/alliance/alliance.service.js';
import { PvpService } from './modules/pvp/pvp.service.js';
import { createSocialRouter } from './modules/social/social.routes.js';
import { SocialService } from './modules/social/social.service.js';
import { RealtimeBus } from './realtime/bus.js';

export interface AppOptions {
  /** Clock used for construction / upgrade / crop timers (tests inject a fake clock). */
  now?: () => Date;
  /** Realtime bus shared with the Socket.IO hub (a private one is created when omitted). */
  bus?: RealtimeBus;
}

export function createApp(models: DatabaseModels, config: EnvConfig, options: AppOptions = {}): Express {
  const app = express();

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(
    cors({
      origin: config.CORS_ORIGIN.split(',').map((origin) => origin.trim()),
      credentials: true,
    })
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(requestLogger(config));
  app.use('/api', createApiRateLimiter(config));

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

  const buildingCtx = new BuildingContext(models, options.now);
  const buildingUpgrades = new BuildingUpgradeService(buildingCtx);
  const buildingController = new BuildingController(
    new BuildingQueryService(buildingCtx, buildingUpgrades),
    new BuildingPlacementService(buildingCtx, buildingUpgrades),
    buildingUpgrades
  );
  const farmService = new FarmService(buildingCtx);
  const livestockService = new LivestockService(buildingCtx);
  const aquacultureService = new AquacultureService(buildingCtx);
  const farmController = new FarmController(farmService);
  const livestockController = new LivestockController(livestockService);
  const aquacultureController = new AquacultureController(aquacultureService);
  const populationService = new PopulationService(buildingCtx, farmService, livestockService, aquacultureService);
  const populationController = new PopulationController(populationService);
  const militaryService = new MilitaryService(buildingCtx, populationService);
  const militaryController = new MilitaryController(militaryService);
  const battleService = new BattleService(buildingCtx, militaryService);
  app.use('/api/v1', createBattleRouter(battleService, authenticate));

  // Phase 12: friends / visits, PvP, alliances (+ realtime through the bus).
  const bus = options.bus ?? new RealtimeBus();
  const socialService = new SocialService(models, bus, buildingCtx.now);
  const pvpService = new PvpService(buildingCtx, militaryService, socialService, bus);
  const allianceService = new AllianceService(buildingCtx, socialService, bus);
  battleService.onVictory((cityId, userId, t) => allianceService.recordPveWin(cityId, userId, t));
  app.use('/api/v1', createSocialRouter(socialService, pvpService, allianceService, authenticate));
  app.locals.realtime = { bus, pvp: pvpService, alliances: allianceService, social: socialService };
  const mountController = new MountController(new MountService(buildingCtx, livestockService));

  const exploration = new ExplorationService(buildingCtx);
  app.use('/api/v1', createExplorationRouter(exploration, authenticate));
  app.use('/api', createExplorationRouter(exploration, authenticate));

  // API v1 Routes
  app.use('/api/v1/auth', createAuthRouter(authController, authenticate, authRateLimiter));
  app.use('/api/v1/characters', createCharacterRouter(characterController, authenticate));
  app.use('/api/v1/cities', createCityRouter(cityController, authenticate));
  app.use('/api/v1/cities', createWorldRouter(worldController, authenticate));
  app.use('/api/v1/dashboard', createDashboardRouter(dashboardController, authenticate));
  app.use('/api/v1', createBuildingRouter(buildingController, authenticate));
  app.use('/api/v1', createFarmRouter(farmController, authenticate));
  app.use('/api/v1', createLivestockRouter(livestockController, authenticate));
  app.use('/api/v1', createAquacultureRouter(aquacultureController, authenticate));
  app.use('/api/v1', createPopulationRouter(populationController, authenticate));
  app.use('/api/v1', createMilitaryRouter(militaryController, authenticate));
  app.use('/api/v1', createMountRouter(mountController, authenticate));
  // Development-only tools (test worlds with plenty of land) — never in production.
  if (config.NODE_ENV !== 'production' && config.DEV_AUTO_ADMIN) {
    app.use('/api/v1/dev', createDevRouter(cityService, authenticate));
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
