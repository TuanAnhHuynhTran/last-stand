/**
 * OpenAPI docs for the gameplay modules: buildings (Phase 3), agriculture (Phase 4) and
 * livestock (Phase 5).
 * Merged into the main specification in swagger.ts.
 */
const cityId = { name: 'cityId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } } as const;
const buildingId = { name: 'buildingId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } } as const;
const farmId = { name: 'farmId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } } as const;
const animalId = { name: 'animalId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } } as const;
const waterBodyId = { name: 'waterBodyId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } } as const;
const survivorId = { name: 'survivorId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } } as const;
const zoneId = { name: 'zoneId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } } as const;
const auth = [{ BearerAuth: [] }];
const json = (ref: string) => ({ content: { 'application/json': { schema: { $ref: `#/components/schemas/${ref}` } } } });

const common = {
  '401': { description: 'Chua dang nhap' },
  '403': { description: 'Khong co quyen (BUILD_FORBIDDEN / CITY_ACCESS_DENIED)' },
};

export const gameplaySchemas = {
  HexCoord: {
    type: 'object',
    required: ['q', 'r'],
    properties: { q: { type: 'integer', example: 18 }, r: { type: 'integer', example: -23 } },
  },
  ResourceBag: {
    type: 'object',
    properties: {
      coins: { type: 'integer', example: 250000 },
      wood: { type: 'integer', example: 3000 },
      stone: { type: 'integer', example: 2500 },
    },
  },
  ProduceBag: {
    type: 'object',
    properties: {
      rice: { type: 'integer' },
      corn: { type: 'integer' },
      vegetables: { type: 'integer' },
      fruit: { type: 'integer' },
      hay: { type: 'integer' },
    },
  },
  PlaceBuildingRequest: {
    type: 'object',
    required: ['typeCode', 'q', 'r'],
    properties: {
      typeCode: { type: 'string', enum: ['house', 'territory_center', 'storage', 'market', 'clinic', 'carpentry'] },
      q: { type: 'integer' },
      r: { type: 'integer' },
      rotation: { type: 'integer', minimum: 0, maximum: 5, description: 'Buoc 60 do' },
    },
  },
  MoveBuildingRequest: {
    type: 'object',
    required: ['q', 'r'],
    properties: { q: { type: 'integer' }, r: { type: 'integer' }, rotation: { type: 'integer', minimum: 0, maximum: 5 } },
  },
  CreateFarmZoneRequest: {
    type: 'object',
    required: ['zoneType', 'hexes'],
    properties: {
      zoneType: { type: 'string', enum: ['rice_paddy', 'corn_field', 'vegetable_garden', 'orchard', 'pasture'] },
      hexes: {
        type: 'array',
        minItems: 6,
        description: 'Toi thieu 6 o hex lien nhau trong lanh dia',
        items: { $ref: '#/components/schemas/HexCoord' },
      },
    },
  },
  ExpandFarmZoneRequest: {
    type: 'object',
    required: ['hexes'],
    properties: {
      hexes: {
        type: 'array',
        minItems: 1,
        description: 'Cac o moi, phai noi lien voi khu hien tai',
        items: { $ref: '#/components/schemas/HexCoord' },
      },
    },
  },
  CreateLivestockFarmRequest: {
    type: 'object',
    required: ['farmType', 'hexes'],
    properties: {
      farmType: { type: 'string', enum: ['chicken_farm', 'pig_farm', 'cattle_farm', 'sheep_farm'] },
      hexes: {
        type: 'array',
        description: 'O hex lien nhau trong lanh dia: ga/lon/de-cuu >= 6, bo >= 9',
        items: { $ref: '#/components/schemas/HexCoord' },
      },
    },
  },
  AssignJobRequest: {
    type: 'object',
    required: ['survivorId', 'kind', 'workplaceId'],
    properties: {
      survivorId: { type: 'string', format: 'uuid' },
      kind: { type: 'string', enum: ['building', 'farm_zone', 'livestock_farm', 'water_body'] },
      workplaceId: { type: 'string', format: 'uuid' },
    },
  },
  MoveHomeRequest: { type: 'object', required: ['buildingId'], properties: { buildingId: { type: 'string', format: 'uuid' } } },
  SetRecipeRequest: { type: 'object', required: ['recipeCode'], properties: { recipeCode: { type: 'string', example: 'planks' } } },
  PopulationSettingsRequest: {
    type: 'object',
    properties: {
      autoAssign: { type: 'boolean' },
      naturalGrowth: { type: 'boolean' },
      daySeconds: { type: 'integer', minimum: 120, maximum: 7200, description: 'Do dai mot ngay game (giay that)' },
    },
  },
  CreateWaterBodyRequest: {
    type: 'object',
    required: ['type', 'hexes'],
    properties: {
      type: { type: 'string', enum: ['fish_pond', 'fish_lake', 'hatchery', 'fish_cage'] },
      hexes: { type: 'array', description: 'O hex lien nhau (hinh dang tu do)', items: { $ref: '#/components/schemas/HexCoord' } },
    },
  },
  ExpandWaterBodyRequest: {
    type: 'object',
    required: ['hexes'],
    properties: { hexes: { type: 'array', items: { $ref: '#/components/schemas/HexCoord' } } },
  },
  StockFishRequest: {
    type: 'object',
    required: ['species', 'count'],
    properties: {
      species: { type: 'string', enum: ['carp', 'tilapia', 'catfish', 'snakehead'] },
      count: { type: 'integer', minimum: 1, maximum: 5000 },
      source: { type: 'string', enum: ['market', 'hatchery'], default: 'market' },
    },
  },
  FeedFishRequest: {
    type: 'object',
    required: ['feedCode'],
    properties: {
      feedCode: { type: 'string', enum: ['rice_bran_fish', 'corn_meal', 'fish_pellet'] },
      batches: { type: 'integer', minimum: 1, maximum: 500, default: 1 },
    },
  },
  ExpandLivestockFarmRequest: {
    type: 'object',
    required: ['hexes'],
    properties: { hexes: { type: 'array', description: 'O hex moi, lien voi trai hien tai', items: { $ref: '#/components/schemas/HexCoord' } } },
  },
  BuyAnimalsRequest: {
    type: 'object',
    required: ['animalCode'],
    properties: {
      animalCode: { type: 'string', enum: ['chicken', 'pig', 'cow', 'sheep', 'goat'] },
      breed: { type: 'string', description: 'Ma giong (vd. ri, leghorn, holstein, vang, merino...). Bo trong = giong mac dinh', example: 'ri' },
      count: { type: 'integer', minimum: 1, maximum: 20, default: 1 },
    },
  },
  BreedAnimalsRequest: {
    type: 'object',
    required: ['animalCode'],
    properties: { animalCode: { type: 'string', enum: ['chicken', 'pig', 'cow', 'sheep', 'goat'] } },
  },
  FeedLivestockRequest: {
    type: 'object',
    required: ['recipeCode'],
    properties: {
      recipeCode: { type: 'string', enum: ['corn_grain', 'fresh_grass', 'rice_bran', 'vegetable_scraps', 'processed_feed'] },
      batches: { type: 'integer', minimum: 1, maximum: 500, default: 1, description: 'So me thuc an (nguyen lieu x so me)' },
    },
  },
  SetCaretakersRequest: {
    type: 'object',
    required: ['count'],
    properties: { count: { type: 'integer', minimum: 0, maximum: 10, description: 'Toi da theo cap trai: 1 / 2 / 4' } },
  },
  TransferAnimalRequest: {
    type: 'object',
    required: ['targetFarmId'],
    properties: { targetFarmId: { type: 'string', format: 'uuid' } },
  },
  PlantCropRequest: {
    type: 'object',
    properties: {
      cropCode: {
        type: 'string',
        enum: ['rice', 'corn', 'cabbage', 'carrot', 'orange', 'clover'],
        description: 'Bo trong = cay mac dinh cua loai khu',
      },
    },
  },
} as const;

export const gameplayPaths = {
  // ── Buildings ──────────────────────────────────────────────────────────────
  '/buildings/catalog': {
    get: {
      tags: ['Buildings'],
      summary: 'Danh muc cong trinh va 3 cap cua tung loai (building_types / building_levels)',
      security: auth,
      responses: { '200': { description: 'Danh muc cong trinh' }, '401': common['401'] },
    },
  },
  '/cities/{cityId}/buildings': {
    get: {
      tags: ['Buildings'],
      summary: 'Cong trinh cua thanh pho, tai nguyen va gio server (hoan tat cac lenh xay da den han)',
      security: auth,
      parameters: [cityId],
      responses: { '200': { description: 'Trang thai cong trinh' }, ...common },
    },
    post: {
      tags: ['Buildings'],
      summary: 'Dat cong trinh moi (kiem tra footprint, tru tai nguyen, bat dau xay)',
      security: auth,
      parameters: [cityId],
      requestBody: { required: true, ...json('PlaceBuildingRequest') },
      responses: {
        '201': { description: 'Da bat dau xay' },
        '400': { description: 'INVALID_PLACEMENT / INSUFFICIENT_RESOURCES' },
        '409': { description: 'HEX_OCCUPIED / BUILDING_LIMIT_REACHED / CONSTRUCTION_QUEUE_FULL' },
        ...common,
      },
    },
  },
  '/cities/{cityId}/buildings/{buildingId}/upgrade': {
    post: {
      tags: ['Buildings'],
      summary: 'Nang cap cong trinh (giu nguyen id va vi tri, co thoi gian thi cong)',
      security: auth,
      parameters: [cityId, buildingId],
      responses: {
        '200': { description: 'Da bat dau nang cap' },
        '400': { description: 'MAX_LEVEL_REACHED / INSUFFICIENT_RESOURCES' },
        '409': { description: 'BUILDING_BUSY / CONSTRUCTION_QUEUE_FULL' },
        ...common,
      },
    },
  },
  '/cities/{cityId}/buildings/{buildingId}/move': {
    post: {
      tags: ['Buildings'],
      summary: 'Di chuyen / xoay cong trinh da hoan thanh',
      security: auth,
      parameters: [cityId, buildingId],
      requestBody: { required: true, ...json('MoveBuildingRequest') },
      responses: { '200': { description: 'Da di chuyen' }, '400': { description: 'INVALID_PLACEMENT' }, ...common },
    },
  },
  '/cities/{cityId}/buildings/{buildingId}': {
    delete: {
      tags: ['Buildings'],
      summary: 'Thao do cong trinh (hoan tra lenh dang do + 50% phan da xay)',
      security: auth,
      parameters: [cityId, buildingId],
      responses: { '200': { description: 'Da thao do' }, '404': { description: 'BUILDING_NOT_FOUND' }, ...common },
    },
  },

  // ── Agriculture ────────────────────────────────────────────────────────────
  '/farms/catalog': {
    get: {
      tags: ['Agriculture'],
      summary: 'Loai khu canh tac (3 cap) va cay trong (crop_types: giai doan, nang suat, thoi gian, nhu cau nuoc)',
      security: auth,
      responses: { '200': { description: 'Danh muc nong nghiep' }, '401': common['401'] },
    },
  },
  '/cities/{cityId}/farms': {
    get: {
      tags: ['Agriculture'],
      summary: 'Khu canh tac, vu mua, thuy loi, nong san va gio server',
      security: auth,
      parameters: [cityId],
      responses: { '200': { description: 'Trang thai nong nghiep' }, ...common },
    },
    post: {
      tags: ['Agriculture'],
      summary: 'Ve khu canh tac moi (>= 6 hex lien nhau, khong de cong trinh / khu khac)',
      security: auth,
      parameters: [cityId],
      requestBody: { required: true, ...json('CreateFarmZoneRequest') },
      responses: {
        '201': { description: 'Da tao khu' },
        '400': { description: 'INVALID_FARM_ZONE (TOO_SMALL, DISCONNECTED, NOT_OWNED, OCCUPIED, FARMLAND, …) / INSUFFICIENT_RESOURCES' },
        '409': { description: 'HEX_OCCUPIED' },
        ...common,
      },
    },
  },
  '/cities/{cityId}/farms/{zoneId}/expand': {
    post: {
      tags: ['Agriculture'],
      summary: 'Mo rong khu (tach biet voi nang cap; khu phai van lien mot vung)',
      security: auth,
      parameters: [cityId, zoneId],
      requestBody: { required: true, ...json('ExpandFarmZoneRequest') },
      responses: {
        '200': { description: 'Da mo rong' },
        '400': { description: 'INVALID_FARM_ZONE / INSUFFICIENT_RESOURCES' },
        '409': { description: 'FARM_ZONE_BUSY / FARM_ZONE_HAS_CROP' },
        ...common,
      },
    },
  },
  '/cities/{cityId}/farms/{zoneId}/upgrade': {
    post: {
      tags: ['Agriculture'],
      summary: 'Nang cap khu len cap tiep theo (kenh muong o cap 2, tram bom o cap 3)',
      security: auth,
      parameters: [cityId, zoneId],
      responses: {
        '200': { description: 'Da bat dau nang cap' },
        '400': { description: 'MAX_LEVEL_REACHED / INSUFFICIENT_RESOURCES' },
        '409': { description: 'FARM_ZONE_BUSY' },
        ...common,
      },
    },
  },
  '/cities/{cityId}/farms/{zoneId}/plant': {
    post: {
      tags: ['Agriculture'],
      summary: 'Gieo trong (thoi gian & nang suat co dinh khi gieo theo cap va nuoc)',
      security: auth,
      parameters: [cityId, zoneId],
      requestBody: { required: false, ...json('PlantCropRequest') },
      responses: {
        '200': { description: 'Da gieo' },
        '400': { description: 'CROP_NOT_ALLOWED / INSUFFICIENT_RESOURCES' },
        '409': { description: 'FARM_ZONE_HAS_CROP' },
        ...common,
      },
    },
  },
  '/cities/{cityId}/farms/{zoneId}/harvest': {
    post: {
      tags: ['Agriculture'],
      summary: 'Thu hoach vu da chin vao kho nong san',
      security: auth,
      parameters: [cityId, zoneId],
      responses: { '200': { description: 'Da thu hoach' }, '409': { description: 'NO_CROP / CROP_NOT_READY' }, ...common },
    },
  },
  '/cities/{cityId}/farms/{zoneId}': {
    delete: {
      tags: ['Agriculture'],
      summary: 'Xoa khu canh tac (hoan tra 50% da dau tu, vu dang trong se mat)',
      security: auth,
      parameters: [cityId, zoneId],
      responses: { '200': { description: 'Da xoa khu' }, '404': { description: 'FARM_ZONE_NOT_FOUND' }, ...common },
    },
  },

  // ── Livestock ──────────────────────────────────────────────────────────────
  '/livestock/catalog': {
    get: {
      tags: ['Livestock'],
      summary: 'Loai trang trai (3 cap), loai vat nuoi + giong (animal_species) va cong thuc thuc an (animal_feed_recipes)',
      security: auth,
      responses: { '200': { description: 'Danh muc chan nuoi' }, '401': common['401'] },
    },
  },
  '/cities/{cityId}/livestock': {
    get: {
      tags: ['Livestock'],
      summary: 'Tat ca trang trai (da mo phong den hien tai), dan vat nuoi, dot san xuat, san pham, nong san va gio server',
      security: auth,
      parameters: [cityId],
      responses: { '200': { description: 'Trang thai chan nuoi' }, ...common },
    },
    post: {
      tags: ['Livestock'],
      summary: 'Tao trai (ga/lon/de-cuu >= 6 o, bo >= 9 o). Dat duoc giu bang world_buildings + building_footprints',
      security: auth,
      parameters: [cityId],
      requestBody: { required: true, ...json('CreateLivestockFarmRequest') },
      responses: {
        '201': { description: 'Da xay trang trai' },
        '400': { description: 'INVALID_LIVESTOCK_FARM (TOO_SMALL, DISCONNECTED, OCCUPIED, FARMLAND, ...) / INSUFFICIENT_RESOURCES' },
        '409': { description: 'HEX_OCCUPIED' },
        ...common,
      },
    },
  },
  '/cities/{cityId}/livestock/{farmId}': {
    get: {
      tags: ['Livestock'],
      summary: 'Xem tinh trang dan (dong bo khi mo trai): suc khoe, muc no, muc khat, nang suat, thuc an/nuoc con lai',
      security: auth,
      parameters: [cityId, farmId],
      responses: { '200': { description: 'HerdStatus' }, '404': { description: 'LIVESTOCK_FARM_NOT_FOUND' }, ...common },
    },
    delete: {
      tags: ['Livestock'],
      summary: 'Do trang trai (hoan tra 50% da dau tu, giai phong footprint)',
      security: auth,
      parameters: [cityId, farmId],
      responses: { '200': { description: 'Da do trang trai' }, '404': { description: 'LIVESTOCK_FARM_NOT_FOUND' }, ...common },
    },
  },
  '/cities/{cityId}/livestock/{farmId}/expand': {
    post: {
      tags: ['Livestock'],
      summary: 'Mo rong trai bang cac o lien ke (tang suc chua)',
      security: auth,
      parameters: [cityId, farmId],
      requestBody: { required: true, ...json('ExpandLivestockFarmRequest') },
      responses: {
        '200': { description: 'Da mo rong' },
        '400': { description: 'INVALID_LIVESTOCK_FARM (DISCONNECTED, OCCUPIED, TOO_LARGE, ...) / INSUFFICIENT_RESOURCES' },
        '409': { description: 'LIVESTOCK_FARM_BUSY / HEX_OCCUPIED' },
        ...common,
      },
    },
  },
  '/cities/{cityId}/livestock/{farmId}/upgrade': {
    post: {
      tags: ['Livestock'],
      summary: 'Nang cap (hang doi xay dung chung): cap 2 chuong gach + kho thuc an; cap 3 chia khu, nuoc tu dong, khu con non, xu ly chat thai',
      security: auth,
      parameters: [cityId, farmId],
      responses: {
        '200': { description: 'Da bat dau nang cap' },
        '400': { description: 'MAX_LEVEL_REACHED / INSUFFICIENT_RESOURCES' },
        '409': { description: 'LIVESTOCK_FARM_BUSY / CONSTRUCTION_QUEUE_FULL' },
        ...common,
      },
    },
  },
  '/cities/{cityId}/livestock/{farmId}/animals': {
    post: {
      tags: ['Livestock'],
      summary: 'Mua con giong (con non, lon theo thoi gian server)',
      security: auth,
      parameters: [cityId, farmId],
      requestBody: { required: true, ...json('BuyAnimalsRequest') },
      responses: {
        '200': { description: 'Da tha vat nuoi' },
        '400': { description: 'ANIMAL_NOT_ALLOWED / INVALID_BREED / INSUFFICIENT_RESOURCES' },
        '409': { description: 'FARM_FULL' },
        ...common,
      },
    },
  },
  '/cities/{cityId}/livestock/{farmId}/animals/{animalId}': {
    delete: {
      tags: ['Livestock'],
      summary: 'Ban vat nuoi (truong thanh: du gia; con non: nua gia)',
      security: auth,
      parameters: [cityId, farmId, animalId],
      responses: { '200': { description: 'Da ban' }, '404': { description: 'ANIMAL_NOT_FOUND' }, ...common },
    },
  },
  '/cities/{cityId}/livestock/{farmId}/animals/{animalId}/harvest': {
    post: {
      tags: ['Livestock'],
      summary: 'Xuat chuong lay thit (con truong thanh; khoe hon = nhieu thit hon)',
      security: auth,
      parameters: [cityId, farmId, animalId],
      responses: { '200': { description: 'Da thu thit (collected.meat)' }, '409': { description: 'ANIMAL_NOT_ADULT' }, ...common },
    },
  },
  '/cities/{cityId}/livestock/{farmId}/animals/{animalId}/transfer': {
    post: {
      tags: ['Livestock'],
      summary: 'Dieu chuyen vat nuoi sang trai khac cung loai con cho trong',
      security: auth,
      parameters: [cityId, farmId, animalId],
      requestBody: { required: true, ...json('TransferAnimalRequest') },
      responses: {
        '200': { description: 'Da dieu chuyen (farm + otherFarm)' },
        '400': { description: 'ANIMAL_NOT_ALLOWED / SAME_FARM' },
        '409': { description: 'FARM_FULL' },
        ...common,
      },
    },
  },
  '/cities/{cityId}/livestock/{farmId}/feed': {
    post: {
      tags: ['Livestock'],
      summary: 'Cho an: che bien nong san theo cong thuc thanh dinh duong trong kho thuc an cua trai',
      security: auth,
      parameters: [cityId, farmId],
      requestBody: { required: true, ...json('FeedLivestockRequest') },
      responses: {
        '200': { description: 'Da them thuc an' },
        '400': { description: 'INSUFFICIENT_FEED (thieu nong san) / RECIPE_NOT_SUITABLE' },
        '409': { description: 'FEED_STORAGE_FULL (details.maxBatches)' },
        ...common,
      },
    },
  },
  '/cities/{cityId}/livestock/{farmId}/water': {
    post: {
      tags: ['Livestock'],
      summary: 'Cho uong: keo nuoc gieng day mang (ho/song va he thong cap nuoc cap 3 tu cap nuoc)',
      security: auth,
      parameters: [cityId, farmId],
      responses: { '200': { description: 'Mang nuoc da day' }, ...common },
    },
  },
  '/cities/{cityId}/livestock/{farmId}/caretakers': {
    put: {
      tags: ['Livestock'],
      summary: 'Dat so nguoi cham soc (nhan cong): tang nang suat, suc khoe va keo nuoc gieng',
      security: auth,
      parameters: [cityId, farmId],
      requestBody: { required: true, ...json('SetCaretakersRequest') },
      responses: { '200': { description: 'Da cap nhat' }, '400': { description: 'CARETAKER_LIMIT / INSUFFICIENT_RESOURCES' }, ...common },
    },
  },
  '/cities/{cityId}/livestock/{farmId}/collect': {
    post: {
      tags: ['Livestock'],
      summary: 'Thu tat ca dot san xuat da xong (moi dot chi thu duoc mot lan)',
      security: auth,
      parameters: [cityId, farmId],
      responses: { '200': { description: 'Da thu san pham (collected)' }, '409': { description: 'NO_PRODUCTION / PRODUCTION_NOT_READY' }, ...common },
    },
  },
  '/cities/{cityId}/livestock/{farmId}/breed': {
    post: {
      tags: ['Livestock'],
      summary: 'Ghep doi: 2 con truong thanh khoe, no sinh 1 con non (cap 3 co khu con non: nhanh hon)',
      security: auth,
      parameters: [cityId, farmId],
      requestBody: { required: true, ...json('BreedAnimalsRequest') },
      responses: {
        '200': { description: 'Da bat dau sinh san' },
        '400': { description: 'ANIMAL_NOT_ALLOWED' },
        '409': { description: 'BREEDING_IN_PROGRESS / NOT_ENOUGH_ADULTS / PARENTS_NOT_HEALTHY / INSUFFICIENT_FARM_FEED / FARM_FULL' },
        ...common,
      },
    },
  },
  // ── Aquaculture ────────────────────────────────────────────────────────────
  '/aquaculture/catalog': {
    get: {
      tags: ['Aquaculture'],
      summary: 'Loai ca (fish_species): gia giong, can nang, toc do lon, chat luong nuoc toi thieu',
      security: auth,
      responses: { '200': { description: 'Danh muc thuy san' }, '401': common['401'] },
    },
  },
  '/cities/{cityId}/water-bodies': {
    get: {
      tags: ['Aquaculture'],
      summary: 'Tat ca ao / ho / khu uom / long ca (da mo phong den hien tai), kho ca va nong san',
      security: auth,
      parameters: [cityId],
      responses: { '200': { description: 'Trang thai thuy san' }, ...common },
    },
    post: {
      tags: ['Aquaculture'],
      summary: 'Dao ao (tu ve hinh dang): ao >= 6 o, ho >= 12, khu uom >= 6, long ca >= 6 o mat nuoc tu nhien',
      security: auth,
      parameters: [cityId],
      requestBody: { required: true, ...json('CreateWaterBodyRequest') },
      responses: {
        '201': { description: 'Da dao ao (dia hinh duoc ha xuong, luu do cao goc va day ao tung o)' },
        '400': { description: 'INVALID_WATER_BODY (TOO_SMALL, OCCUPIED, NOT_OWNED, TERRAIN_UNEVEN, NOT_WATER, TOO_FAR, ...) / INSUFFICIENT_RESOURCES' },
        '409': { description: 'HEX_OCCUPIED' },
        ...common,
      },
    },
  },
  '/cities/{cityId}/water-bodies/{waterBodyId}': {
    get: {
      tags: ['Aquaculture'],
      summary: 'Xem trang thai: muc nuoc, chat luong, so ca, mat do, thuc an, suc khoe, giai doan nuoi, lich su chat luong',
      security: auth,
      parameters: [cityId, waterBodyId],
      responses: { '200': { description: 'WaterBody' }, '404': { description: 'WATER_BODY_NOT_FOUND' }, ...common },
    },
    delete: {
      tags: ['Aquaculture'],
      summary: 'Lap ao (hoan tra 50% da dau tu, tra lai dia hinh goc)',
      security: auth,
      parameters: [cityId, waterBodyId],
      responses: { '200': { description: 'Da lap ao' }, ...common },
    },
  },
  '/cities/{cityId}/water-bodies/{waterBodyId}/expand': {
    post: {
      tags: ['Aquaculture'],
      summary: 'Mo rong ao: gop o nuoc, tao lai duong bo, cap nhat dien tich & the tich',
      security: auth,
      parameters: [cityId, waterBodyId],
      requestBody: { required: true, ...json('ExpandWaterBodyRequest') },
      responses: { '200': { description: 'Da mo rong' }, '400': { description: 'INVALID_WATER_BODY' }, '409': { description: 'WATER_BODY_BUSY' }, ...common },
    },
  },
  '/cities/{cityId}/water-bodies/{waterBodyId}/upgrade': {
    post: {
      tags: ['Aquaculture'],
      summary: 'Nang cap (giu nguyen hinh dang ao): cap 2 ke da + cong + mang an; cap 3 suc khi + loc + khu thu hoach',
      security: auth,
      parameters: [cityId, waterBodyId],
      responses: { '200': { description: 'Da bat dau nang cap' }, '400': { description: 'MAX_LEVEL_REACHED' }, '409': { description: 'WATER_BODY_BUSY / CONSTRUCTION_QUEUE_FULL' }, ...common },
    },
  },
  '/cities/{cityId}/water-bodies/{waterBodyId}/fill': {
    post: {
      tags: ['Aquaculture'],
      summary: 'Cap nuoc (bom nuoc vao ao dao, co thoi gian)',
      security: auth,
      parameters: [cityId, waterBodyId],
      responses: { '200': { description: 'Dang cap nuoc' }, '400': { description: 'NATURAL_WATER' }, '409': { description: 'ALREADY_FILLING / WATER_FULL' }, ...common },
    },
  },
  '/cities/{cityId}/water-bodies/{waterBodyId}/stock': {
    post: {
      tags: ['Aquaculture'],
      summary: 'Tha ca giong (mua o cho hoac lay tu khu uom)',
      security: auth,
      parameters: [cityId, waterBodyId],
      requestBody: { required: true, ...json('StockFishRequest') },
      responses: { '200': { description: 'Da tha ca' }, '409': { description: 'NOT_ENOUGH_WATER / POND_PREPARING / POND_FULL / NOT_ENOUGH_FRY' }, ...common },
    },
  },
  '/cities/{cityId}/water-bodies/{waterBodyId}/feed': {
    post: {
      tags: ['Aquaculture'],
      summary: 'Cho ca an (nong san -> thuc an ca trong may cho an)',
      security: auth,
      parameters: [cityId, waterBodyId],
      requestBody: { required: true, ...json('FeedFishRequest') },
      responses: { '200': { description: 'Da cho an' }, '400': { description: 'INSUFFICIENT_FEED' }, '409': { description: 'FEED_STORAGE_FULL' }, ...common },
    },
  },
  '/cities/{cityId}/water-bodies/{waterBodyId}/harvest': {
    post: {
      tags: ['Aquaculture'],
      summary: 'Thu hoach cac dot ca da du lon vao kho (moi dot chi thu mot lan)',
      security: auth,
      parameters: [cityId, waterBodyId],
      responses: { '200': { description: 'Da thu hoach (harvested)' }, '409': { description: 'FISH_NOT_READY / NO_FISH' }, ...common },
    },
  },
  // ── Population & economy ───────────────────────────────────────────────────
  '/cities/{cityId}/population': {
    get: {
      tags: ['Population'],
      summary: 'Dan so: dong ho game, danh sach cu dan, nha o, noi lam viec, san xuat, canh bao, kho (da mo phong den hien tai)',
      security: auth,
      parameters: [cityId],
      responses: { '200': { description: 'PopulationState' }, ...common },
    },
  },
  '/cities/{cityId}/population/economy': {
    get: {
      tags: ['Population'],
      summary: 'Thong ke kinh te: thu chi theo nhom tai nguyen (so resource_transactions), so ngay luong thuc / nuoc',
      security: auth,
      parameters: [cityId, { name: 'days', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 30, default: 3 } }],
      responses: { '200': { description: 'EconomyStats' }, ...common },
    },
  },
  '/cities/{cityId}/population/assign': {
    post: {
      tags: ['Population'],
      summary: 'Phan cong (moi cu dan dung mot viec toan thoi gian; doi viec = chuyen tu viec cu)',
      security: auth,
      parameters: [cityId],
      requestBody: { required: true, ...json('AssignJobRequest') },
      responses: { '200': { description: 'Da phan cong' }, '404': { description: 'SURVIVOR_NOT_FOUND / WORKPLACE_NOT_FOUND' }, '409': { description: 'WORKPLACE_FULL / WORKPLACE_NOT_READY / ALREADY_THERE' }, ...common },
    },
  },
  '/cities/{cityId}/population/assign/{survivorId}': {
    delete: {
      tags: ['Population'],
      summary: 'Cho nghi viec (phan cong tu dong se bo qua nguoi nay)',
      security: auth,
      parameters: [cityId, survivorId],
      responses: { '200': { description: 'Da cho nghi' }, '409': { description: 'NOT_EMPLOYED' }, ...common },
    },
  },
  '/cities/{cityId}/population/auto-assign': {
    post: { tags: ['Population'], summary: 'Phan cong tu dong cac cho trong theo ky nang', security: auth, parameters: [cityId], responses: { '200': { description: 'Da phan cong' }, ...common } },
  },
  '/cities/{cityId}/population/survivors/{survivorId}/home': {
    post: {
      tags: ['Population'],
      summary: 'Chuyen nha (moi cu dan dung mot noi o chinh)',
      security: auth,
      parameters: [cityId, survivorId],
      requestBody: { required: true, ...json('MoveHomeRequest') },
      responses: { '200': { description: 'Da chuyen nha' }, '409': { description: 'HOUSE_FULL / HOUSE_NOT_READY / ALREADY_THERE' }, ...common },
    },
  },
  '/cities/{cityId}/population/production': {
    get: { tags: ['Population'], summary: 'Xem san xuat (cung du lieu voi trang thai dan so)', security: auth, parameters: [cityId], responses: { '200': { description: 'PopulationState' }, ...common } },
  },
  '/cities/{cityId}/population/production/{buildingId}/recipe': {
    post: {
      tags: ['Population'],
      summary: 'Chon cong thuc san xuat cua xuong',
      security: auth,
      parameters: [cityId, buildingId],
      requestBody: { required: true, ...json('SetRecipeRequest') },
      responses: { '200': { description: 'Da doi cong thuc' }, '400': { description: 'RECIPE_NOT_ALLOWED / RECIPE_LOCKED' }, ...common },
    },
  },
  '/cities/{cityId}/population/production/{buildingId}/collect': {
    post: {
      tags: ['Population'],
      summary: 'Nhan san pham tu xuong vao kho (mot lan, gioi han boi suc chua kho)',
      security: auth,
      parameters: [cityId, buildingId],
      responses: { '200': { description: 'Da nhan (collected)' }, '409': { description: 'NOTHING_TO_COLLECT' }, ...common },
    },
  },
  '/cities/{cityId}/population/settings': {
    patch: {
      tags: ['Population'],
      summary: 'Cai dat: phan cong tu dong, tang truong tu nhien, do dai ngay game',
      security: auth,
      parameters: [cityId],
      requestBody: { required: true, ...json('PopulationSettingsRequest') },
      responses: { '200': { description: 'Da cap nhat' }, ...common },
    },
  },
  '/cities/{cityId}/population/rescue': {
    post: {
      tags: ['Population'],
      summary: 'Nhiem vu cuu ho: ton xu + luong thuc, tro ve voi 2-3 nguoi song sot',
      security: auth,
      parameters: [cityId],
      responses: { '200': { description: 'Da xuat phat' }, '409': { description: 'RESCUE_IN_PROGRESS / NOT_ENOUGH_FOOD' }, ...common },
    },
  },
} as const;
