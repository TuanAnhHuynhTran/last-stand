/** OpenAPI docs for Phase 11 — PvE tactical battles. */
const cityId = { name: 'cityId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } } as const;
const battleId = { name: 'battleId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } } as const;
const auth = [{ BearerAuth: [] }];
const json = (ref: string) => ({ content: { 'application/json': { schema: { $ref: `#/components/schemas/${ref}` } } } });
const common = { '401': { description: 'Chua dang nhap' }, '403': { description: 'BATTLE_FORBIDDEN / CITY_ACCESS_DENIED' }, '404': { description: 'BATTLE_NOT_FOUND' } };
const tags = ['Battles'];
const coord = { type: 'object', properties: { q: { type: 'integer' }, r: { type: 'integer' } } } as const;

export const battleSchemas = {
  CreateBattleRequest: {
    type: 'object',
    required: ['mission', 'unitIds', 'idempotencyKey'],
    properties: {
      mission: { type: 'string', enum: ['rescue_survivors', 'reclaim_ruins', 'mutant_boss'] },
      unitIds: { type: 'array', items: { type: 'string', format: 'uuid' }, minItems: 1, maxItems: 6 },
      poiId: { type: 'string', format: 'uuid', description: 'Diem kham pha (giai doan 10) se duoc giai phong khi thang' },
      idempotencyKey: { type: 'string', format: 'uuid', description: 'Gui lai cung khoa = cung tran' },
    },
  },
  BattleActionRequest: {
    type: 'object',
    required: ['clientActionId', 'expectedVersion', 'action'],
    description: 'Chi gui Y DINH (di dau, danh ai). Server tu tinh trung / truot, sat thuong, ket qua va phan thuong.',
    properties: {
      clientActionId: { type: 'string', format: 'uuid', description: 'Gui lai sau mat ket noi tra ve ket qua da luu, khong ap dung lan 2' },
      expectedVersion: { type: 'integer', description: 'Phai trung version hien tai (STALE_BATTLE neu khac)' },
      action: {
        type: 'object',
        required: ['type'],
        properties: {
          type: { type: 'string', enum: ['deploy', 'start', 'move', 'attack', 'skill', 'defend', 'item', 'reload', 'interact', 'end_turn', 'retreat'] },
          unitId: { type: 'string', example: 'p1' },
          targetId: { type: 'string', example: 'e3' },
          to: coord,
          at: coord,
          skill: { type: 'string', enum: ['shield_wall', 'brace', 'aimed_shot', 'volley', 'piercing_bolt'] },
          item: { type: 'string', enum: ['bandage'] },
        },
      },
    },
  },
  EndTurnRequest: { type: 'object', required: ['clientActionId', 'expectedVersion'], properties: { clientActionId: { type: 'string', format: 'uuid' }, expectedVersion: { type: 'integer' } } },
} as const;

const rules = '409: NOT_YOUR_UNIT, NO_AP, TOO_FAR, BLOCKED, OCCUPIED, OUT_OF_RANGE, NO_LINE_OF_SIGHT, NOT_LOADED, COOLDOWN, WRONG_PHASE, STALE_BATTLE, BATTLE_FINISHED';

export const battlePaths = {
  '/cities/{cityId}/battles': {
    get: { tags, summary: 'Sanh nhiem vu: dieu kien tham gia, tran dang mo (ket noi lai), lich su, binh si co the xuat quan', security: auth, parameters: [cityId], responses: { '200': { description: 'BattleLobbyDTO' }, ...common } },
    post: {
      tags,
      summary: 'Tao tran: kiem tra doi quan (da huan luyen, du trang bi, du suc khoe) va dieu kien nhiem vu; server sinh chien truong rieng',
      security: auth,
      parameters: [cityId],
      requestBody: { required: true, ...json('CreateBattleRequest') },
      responses: { '201': { description: 'BattleDTO (giai doan trien khai)' }, '409': { description: 'BATTLE_ACTIVE / MISSION_LOCKED / UNIT_UNAVAILABLE / IDEMPOTENCY_CONFLICT' }, ...common },
    },
  },
  '/battles/{battleId}': { get: { tags, summary: 'Trang thai tran (ket noi lai sau khi mat mang)', security: auth, parameters: [battleId], responses: { '200': { description: 'BattleDTO' }, ...common } } },
  '/battles/{battleId}/result': { get: { tags, summary: 'Ket qua tran va phan thuong do server tinh', security: auth, parameters: [battleId], responses: { '200': { description: 'BattleDTO' }, ...common } } },
  '/battles/{battleId}/actions': {
    post: { tags, summary: 'Gui hanh dong (server kiem tra moi luat)', security: auth, parameters: [battleId], requestBody: { required: true, ...json('BattleActionRequest') }, responses: { '200': { description: 'BattleDTO + events de chay animation' }, '409': { description: rules }, ...common } },
  },
  '/battles/{battleId}/end-turn': {
    post: { tags, summary: 'Ket thuc luot: AI ke dich hanh dong tren server, roi den luot moi', security: auth, parameters: [battleId], requestBody: { required: true, ...json('EndTurnRequest') }, responses: { '200': { description: 'BattleDTO' }, '409': { description: rules }, ...common } },
  },
  '/battles/{battleId}/rewards': {
    post: { tags, summary: 'Nhan thuong (chi khi thang; dung mot lan — goi lai tra ve granted: null)', security: auth, parameters: [battleId], responses: { '200': { description: 'BattleClaimDTO' }, '409': { description: 'NOT_WON' }, ...common } },
  },
} as const;
