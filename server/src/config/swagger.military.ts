/** OpenAPI docs for the Phase 8 military module (barracks, soldiers, training, squads). */
const cityId = { name: 'cityId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } } as const;
const unitId = { name: 'unitId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } } as const;
const squadId = { name: 'squadId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } } as const;
const auth = [{ BearerAuth: [] }];
const json = (ref: string) => ({ content: { 'application/json': { schema: { $ref: `#/components/schemas/${ref}` } } } });
const common = {
  '401': { description: 'Chua dang nhap' },
  '403': { description: 'Khong co quyen (BUILD_FORBIDDEN / CITY_ACCESS_DENIED)' },
};
const tags = ['Military'];
const uuid = { type: 'string', format: 'uuid' } as const;
const unitType = { type: 'string', enum: ['swordsman', 'spearman', 'archer', 'crossbowman'] } as const;
const formation = { type: 'string', enum: ['line', 'column', 'wedge', 'square'] } as const;

export const militarySchemas = {
  RecruitRequest: {
    type: 'object',
    required: ['buildingId', 'unitType'],
    properties: {
      buildingId: uuid,
      unitType,
      count: { type: 'integer', minimum: 1, maximum: 12, default: 1 },
      startTraining: { type: 'boolean', default: true, description: 'Bat dau huan luyen ngay sau khi tuyen' },
    },
  },
  StartTrainingRequest: {
    type: 'object',
    required: ['buildingId', 'kind'],
    properties: {
      buildingId: uuid,
      kind: { type: 'string', enum: ['recruit', 'drill'], description: 'recruit = huan luyen tan binh; drill = thao luyen tang XP' },
      unitIds: { type: 'array', items: uuid },
    },
  },
  EquipRequest: {
    type: 'object',
    required: ['slot', 'equipmentCode'],
    properties: {
      slot: { type: 'string', enum: ['weapon', 'offhand', 'armor', 'helmet', 'ammo'] },
      equipmentCode: { type: 'string', nullable: true, description: 'eq_* trong kho; null = thao ra (tra ve kho)' },
    },
  },
  CreateSquadRequest: {
    type: 'object',
    required: ['name'],
    properties: { name: { type: 'string', minLength: 1, maxLength: 40 }, formation },
  },
  UpdateSquadRequest: {
    type: 'object',
    properties: { name: { type: 'string', minLength: 1, maxLength: 40 }, formation, status: { type: 'string', enum: ['standby', 'deployed'] } },
  },
  SquadMembersRequest: {
    type: 'object',
    required: ['unitIds'],
    properties: { unitIds: { type: 'array', items: uuid, minItems: 1, maxItems: 12 } },
  },
} as const;

const state = { '200': { description: 'MilitaryStateDTO: binh si, job huan luyen, doanh trai, doi hinh, kho trang bi' }, ...common };

export const militaryPaths = {
  '/cities/{cityId}/military': {
    get: { tags, summary: 'Toan bo quan doi (tinh toan lai theo thoi gian server)', security: auth, parameters: [cityId], responses: state },
  },
  '/cities/{cityId}/military/recruit': {
    post: {
      tags,
      summary: 'Tuyen cu dan that thanh tan binh (kiem tra dan, trang bi, giap, luong thuc, xu)',
      security: auth,
      parameters: [cityId],
      requestBody: { required: true, ...json('RecruitRequest') },
      responses: {
        '201': { description: 'Da tuyen (va bat dau huan luyen)' },
        '409': { description: 'NOT_ENOUGH_CITIZENS / MISSING_EQUIPMENT / NOT_ENOUGH_FOOD / BARRACKS_FULL / NOT_ENOUGH_RESOURCES' },
        ...common,
      },
    },
  },
  '/cities/{cityId}/military/training': {
    get: { tags, summary: 'Trang thai huan luyen (jobs + tien do)', security: auth, parameters: [cityId], responses: state },
    post: {
      tags,
      summary: 'Bat dau huan luyen tan binh / thao luyen (theo so cho cua doanh trai)',
      security: auth,
      parameters: [cityId],
      requestBody: { required: true, ...json('StartTrainingRequest') },
      responses: { '201': { description: 'Da tao training job' }, '409': { description: 'BARRACKS_FULL / NO_UNITS / MISSING_EQUIPMENT' }, ...common },
    },
  },
  '/cities/{cityId}/military/units/{unitId}/equipment': {
    put: {
      tags,
      summary: 'Doi / thao trang bi (lay tu kho, mon cu tra ve kho)',
      security: auth,
      parameters: [cityId, unitId],
      requestBody: { required: true, ...json('EquipRequest') },
      responses: { '200': { description: 'Da cap nhat' }, '409': { description: 'UNIT_BUSY / MISSING_EQUIPMENT' }, ...common },
    },
  },
  '/cities/{cityId}/military/units/{unitId}': {
    delete: {
      tags,
      summary: 'Giai ngu: tro lai lam cu dan, trang bi tra ve kho',
      security: auth,
      parameters: [cityId, unitId],
      responses: { '200': { description: 'Da giai ngu' }, '409': { description: 'UNIT_BUSY / UNIT_ON_MISSION' }, ...common },
    },
  },
  '/cities/{cityId}/military/squads': {
    get: { tags, summary: 'Danh sach doi hinh', security: auth, parameters: [cityId], responses: state },
    post: {
      tags,
      summary: 'Tao doi hinh moi',
      security: auth,
      parameters: [cityId],
      requestBody: { required: true, ...json('CreateSquadRequest') },
      responses: { '201': { description: 'Da tao' }, ...common },
    },
  },
  '/cities/{cityId}/military/squads/{squadId}': {
    patch: {
      tags,
      summary: 'Doi ten / doi hinh / trang thai (deployed: mot binh si khong thuoc hai doi dang lam nhiem vu)',
      security: auth,
      parameters: [cityId, squadId],
      requestBody: { required: true, ...json('UpdateSquadRequest') },
      responses: { '200': { description: 'Da cap nhat' }, '409': { description: 'SQUAD_EMPTY / SQUAD_NOT_READY / UNIT_ON_MISSION' }, ...common },
    },
    delete: { tags, summary: 'Giai tan doi', security: auth, parameters: [cityId, squadId], responses: { '200': { description: 'Da xoa' }, ...common } },
  },
  '/cities/{cityId}/military/squads/{squadId}/members': {
    post: {
      tags,
      summary: 'Gan binh si vao doi',
      security: auth,
      parameters: [cityId, squadId],
      requestBody: { required: true, ...json('SquadMembersRequest') },
      responses: { '200': { description: 'Da gan' }, '409': { description: 'SQUAD_FULL / UNIT_ON_MISSION' }, ...common },
    },
  },
  '/cities/{cityId}/military/squads/{squadId}/members/{unitId}': {
    delete: { tags, summary: 'Rut binh si khoi doi', security: auth, parameters: [cityId, squadId, unitId], responses: { '200': { description: 'Da rut' }, ...common } },
  },
} as const;
