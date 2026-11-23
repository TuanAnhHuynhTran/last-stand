import { gameplayPaths, gameplaySchemas } from './swagger.gameplay.js';
import { militaryPaths, militarySchemas } from './swagger.military.js';
import { mountPaths, mountSchemas } from './swagger.mounts.js';
import { battlePaths, battleSchemas } from './swagger.battle.js';
import { realtimeDescription, socialPaths, socialSchemas } from './swagger.social.js';

export const openApiSpecification = {
  openapi: '3.0.3',
  info: {
    title: 'CITYVERSE API',
    version: '1.0.0',
    description:
      'REST API cho CITYVERSE - 3D City Builder, Life Simulation & Multiplayer (Giai doan 1-12: Foundation, 3D World Engine, Building System, Agriculture & Irrigation, Livestock, Aquaculture, Villagers & Economy, Military, Stables & Mounts, Exploration, Tactical Battles, Multiplayer: Friends, Visits, PvP, Ranking, Alliances).\n\n' + realtimeDescription,
  },
  servers: [
    {
      url: '/api/v1',
      description: 'API v1',
    },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
    schemas: {
      ...gameplaySchemas,
      ...militarySchemas,
      ...mountSchemas,
      ...battleSchemas,
      ...socialSchemas,
      RegisterRequest: {
        type: 'object',
        required: ['email', 'username', 'password'],
        properties: {
          email: { type: 'string', format: 'email', example: 'mayor@cityverse.io' },
          username: { type: 'string', example: 'mayor_one' },
          password: { type: 'string', example: 'CityVerse2026' },
        },
      },
      LoginRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email', example: 'mayor@cityverse.io' },
          password: { type: 'string', example: 'CityVerse2026' },
        },
      },
      RefreshRequest: {
        type: 'object',
        required: ['refreshToken'],
        properties: {
          refreshToken: { type: 'string' },
        },
      },
      CreateCharacterRequest: {
        type: 'object',
        required: ['name', 'presetId'],
        properties: {
          name: { type: 'string', example: 'Alex Horizon' },
          presetId: { type: 'string', example: 'urban-architect' },
          appearance: {
            type: 'object',
            properties: {
              bodyType: { type: 'string', enum: ['athletic', 'classic', 'compact'] },
              skinTone: { type: 'string', example: '#e8be9e' },
              hairStyle: { type: 'string', enum: ['short', 'slick', 'wavy', 'bob', 'buzz'] },
              hairColor: { type: 'string', example: '#1f2937' },
              outfitStyle: {
                type: 'string',
                enum: ['architect', 'mayor', 'explorer', 'urban', 'engineer'],
              },
              outfitPrimaryColor: { type: 'string', example: '#0ea5e9' },
              outfitSecondaryColor: { type: 'string', example: '#0f172a' },
              accessory: {
                type: 'string',
                enum: ['none', 'glasses', 'hard_hat', 'visor', 'scarf'],
              },
              modelKey: { type: 'string', example: 'character_architect_v1' },
            },
          },
        },
      },
      CreateCityRequest: {
        type: 'object',
        required: ['name', 'terrainType'],
        properties: {
          name: { type: 'string', example: 'Neo Saigon' },
          terrainType: {
            type: 'string',
            enum: ['plains', 'coastal', 'highlands', 'valley'],
            example: 'coastal',
          },
          isPublic: { type: 'boolean', default: true },
        },
      },
    },
  },
  paths: {
    ...gameplayPaths,
    ...militaryPaths,
    ...mountPaths,
    ...battlePaths,
    ...socialPaths,
    '/health': {
      get: {
        tags: ['System'],
        summary: 'Kiem tra trang thai server & database',
        responses: {
          '200': { description: 'Server dang hoat dong' },
        },
      },
    },
    '/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Dang ky tai khoan moi',
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/RegisterRequest' } },
          },
        },
        responses: {
          '201': { description: 'Dang ky thanh cong' },
          '409': { description: 'Email hoac username da ton tai' },
          '429': { description: 'Vuot gioi han tan suat' },
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Dang nhap he thong',
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } },
          },
        },
        responses: {
          '200': { description: 'Dang nhap thanh cong' },
          '401': { description: 'Sai email hoac mat khau' },
          '429': { description: 'Vuot gioi han tan suat' },
        },
      },
    },
    '/auth/refresh': {
      post: {
        tags: ['Auth'],
        summary: 'Lam moi cap JWT (Refresh Token Rotation)',
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/RefreshRequest' } },
          },
        },
        responses: {
          '200': { description: 'Cap nhat token thanh cong' },
          '401': { description: 'Refresh token khong hop le hoac da het han' },
        },
      },
    },
    '/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'Dang xuat va thu hoi refresh token',
        security: [{ BearerAuth: [] }],
        responses: {
          '200': { description: 'Dang xuat thanh cong' },
        },
      },
    },
    '/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'Lay thong tin phien dang nhap hien tai (user, character, city)',
        security: [{ BearerAuth: [] }],
        responses: {
          '200': { description: 'Thong tin nguoi dung hop le' },
          '401': { description: 'Chua xac thuc hoac token het han' },
        },
      },
    },
    '/characters/presets': {
      get: {
        tags: ['Characters'],
        summary: 'Lay danh sach preset ngoai hinh nhan vat',
        responses: {
          '200': { description: 'Danh sach preset' },
        },
      },
    },
    '/characters/me': {
      get: {
        tags: ['Characters'],
        summary: 'Lay nhan vat cua nguoi choi hien tai',
        security: [{ BearerAuth: [] }],
        responses: {
          '200': { description: 'Thong tin nhan vat' },
          '404': { description: 'Chua tao nhan vat' },
        },
      },
    },
    '/characters': {
      post: {
        tags: ['Characters'],
        summary: 'Tao nhan vat 3D (moi user toi da 1 nhan vat)',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateCharacterRequest' },
            },
          },
        },
        responses: {
          '201': { description: 'Tao nhan vat thanh cong' },
          '409': { description: 'Nguoi choi da so huu nhan vat' },
        },
      },
    },
    '/cities/terrains': {
      get: {
        tags: ['Cities'],
        summary: 'Lay danh sach kieu dia hinh khoi tao thanh pho',
        responses: {
          '200': { description: 'Danh sach kieu dia hinh' },
        },
      },
    },
    '/cities/my': {
      get: {
        tags: ['Cities'],
        summary: 'Lay thanh pho cua nguoi choi hien tai',
        security: [{ BearerAuth: [] }],
        responses: {
          '200': { description: 'Thong tin thanh pho' },
          '404': { description: 'Chua tao thanh pho' },
        },
      },
    },
    '/cities': {
      post: {
        tags: ['Cities'],
        summary: 'Tao thanh pho moi (128x128, 250000 City Coins, owner trong 1 transaction)',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/CreateCityRequest' } },
          },
        },
        responses: {
          '201': { description: 'Tao thanh pho thanh cong' },
          '409': { description: 'Moi nguoi choi chi duoc tao 1 thanh pho o MVP' },
        },
      },
    },
    '/cities/{cityId}': {
      get: {
        tags: ['Cities'],
        summary: 'Lay chi tiet thanh pho theo ID (co kiem tra ton tai va quyen truy cap)',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'cityId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '200': { description: 'Chi tiet thanh pho' },
          '403': { description: 'Khong du quyen truy cap thanh pho nay' },
          '404': { description: 'Thanh pho khong ton tai' },
        },
      },
    },
    '/cities/{cityId}/terrain': {
      get: {
        tags: ['World'],
        summary: 'Lay metadata dia hinh thanh pho (seed, kich thuoc 128x128, tileSize=4, chunkSize=32, spawn)',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'cityId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          '200': { description: 'Metadata terrain' },
          '403': { description: 'Khong du quyen truy cap' },
          '404': { description: 'Thanh pho khong ton tai' },
        },
      },
    },
    '/cities/{cityId}/chunks': {
      get: {
        tags: ['World'],
        summary: 'Tai cac chunk dia hinh theo pham vi (minX/maxX/minZ/maxZ hoac cx/cz/radius)',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'cityId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'minX', in: 'query', schema: { type: 'integer', minimum: 0 } },
          { name: 'maxX', in: 'query', schema: { type: 'integer', minimum: 0 } },
          { name: 'minZ', in: 'query', schema: { type: 'integer', minimum: 0 } },
          { name: 'maxZ', in: 'query', schema: { type: 'integer', minimum: 0 } },
          { name: 'cx', in: 'query', schema: { type: 'integer', minimum: 0 } },
          { name: 'cz', in: 'query', schema: { type: 'integer', minimum: 0 } },
          { name: 'radius', in: 'query', schema: { type: 'integer', minimum: 0, maximum: 3 } },
        ],
        responses: {
          '200': { description: 'Danh sach chunk trong pham vi kem revision va heightmap' },
        },
      },
    },
    '/cities/{cityId}/terrain/delta': {
      post: {
        tags: ['World'],
        summary: 'Luu delta dia hinh khi thay doi va tang revision cho cac chunk bi anh huong',
        security: [{ BearerAuth: [] }],
        responses: {
          '200': { description: 'Da luu delta va tra ve cac chunk da cap nhat' },
          '403': { description: 'Khong co quyen chinh sua dia hinh' },
        },
      },
    },
    '/cities/{cityId}/terrain/seed': {
      post: {
        tags: ['World'],
        summary: 'Seed hoac tai tao du lieu chunk tu world_seed',
        security: [{ BearerAuth: [] }],
        responses: {
          '200': { description: 'Da dong bo chunk tu world_seed' },
        },
      },
    },
    '/dashboard': {
      get: {
        tags: ['Dashboard'],
        summary: 'Tong hop du lieu dashboard (nhan vat, thanh pho, ngan sach, dan so)',
        security: [{ BearerAuth: [] }],
        responses: {
          '200': { description: 'Du lieu dashboard' },
          '401': { description: 'Chua dang nhap' },
        },
      },
    },
  },
} as const;
