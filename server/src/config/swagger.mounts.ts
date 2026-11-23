/** OpenAPI docs for Phase 9 — working animals (stables / camps use the livestock endpoints). */
const cityId = { name: 'cityId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } } as const;
const animalId = { name: 'animalId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } } as const;
const auth = [{ BearerAuth: [] }];
const json = (ref: string) => ({ content: { 'application/json': { schema: { $ref: `#/components/schemas/${ref}` } } } });
const common = {
  '401': { description: 'Chua dang nhap' },
  '403': { description: 'Khong co quyen (BUILD_FORBIDDEN / CITY_ACCESS_DENIED)' },
  '404': { description: 'ANIMAL_NOT_FOUND' },
};
const tags = ['Mounts'];
const params = [cityId, animalId];
const state = { '200': { description: 'MountStateDTO: ngua / voi, chi so, job huan luyen, nhat ky cham soc, trang bi trong kho' }, ...common };

export const mountSchemas = {
  TrainAnimalRequest: {
    type: 'object',
    required: ['program'],
    properties: { program: { type: 'string', enum: ['taming', 'riding', 'speed', 'endurance', 'cargo', 'war'] } },
  },
  CareAnimalRequest: { type: 'object', required: ['action'], properties: { action: { type: 'string', enum: ['groom', 'vet'] } } },
  AnimalEquipRequest: {
    type: 'object',
    required: ['slot', 'equipmentCode'],
    properties: {
      slot: { type: 'string', enum: ['saddle', 'armor', 'harness', 'howdah'] },
      equipmentCode: { type: 'string', nullable: true, enum: ['eq_saddle', 'eq_horse_barding', 'eq_cargo_harness', 'eq_howdah', null] },
    },
  },
  AssignMountRequest: { type: 'object', required: ['unitId'], properties: { unitId: { type: 'string', format: 'uuid' } } },
  AssignTaskRequest: { type: 'object', required: ['kind'], properties: { kind: { type: 'string', enum: ['transport', 'military'] } } },
} as const;

export const mountPaths = {
  '/cities/{cityId}/mounts': {
    get: {
      tags,
      summary: 'Ngua / voi cua lanh dia (trai ngua, trai voi = trai chan nuoi farmType horse_stable / elephant_camp; xay, nang cap, tiep nhan, cho an qua /livestock)',
      security: auth,
      parameters: [cityId],
      responses: state,
    },
  },
  '/cities/{cityId}/mounts/animals/{animalId}': {
    get: { tags, summary: 'Thong tin mot con: suc khoe, the luc, toc do, do thuan hoa, suc cho, trinh do, dang dung', security: auth, parameters: params, responses: { '200': { description: 'MountAnimalDTO' }, ...common } },
  },
  '/cities/{cityId}/mounts/animals/{animalId}/training': {
    post: {
      tags,
      summary: 'Huan luyen (thuan hoa cap 1; tap cuoi / toc do / suc ben / cho hang / luyen chien can san huan luyen cap 2)',
      security: auth,
      parameters: params,
      requestBody: { required: true, ...json('TrainAnimalRequest') },
      responses: { '201': { description: 'Da tao job huan luyen' }, '409': { description: 'NOT_TAME / ANIMAL_IN_USE / ANIMAL_TRAINING / STABLE_LEVEL_TOO_LOW / INSUFFICIENT_FARM_FEED …' }, ...common },
    },
  },
  '/cities/{cityId}/mounts/animals/{animalId}/care': {
    post: {
      tags,
      summary: 'Cham soc: chai long (+thuan hoa) hoac kham thu y (+suc khoe, can khu cham soc cap 2)',
      security: auth,
      parameters: params,
      requestBody: { required: true, ...json('CareAnimalRequest') },
      responses: { '200': { description: 'Da cham soc' }, '409': { description: 'GROOM_COOLDOWN / VET_UNAVAILABLE' }, ...common },
    },
  },
  '/cities/{cityId}/mounts/animals/{animalId}/equipment': {
    put: {
      tags,
      summary: 'Deo / thao yen, giap ngua, dai cho hang, banh voi (lay tu kho, mon cu tra ve kho)',
      security: auth,
      parameters: params,
      requestBody: { required: true, ...json('AnimalEquipRequest') },
      responses: { '200': { description: 'Da cap nhat' }, '409': { description: 'MISSING_EQUIPMENT / ANIMAL_IN_USE' }, ...common },
    },
  },
  '/cities/{cityId}/mounts/animals/{animalId}/mount': {
    post: {
      tags,
      summary: 'Giao ngua cho binh si (dao / thuong / cung): ngua phai thuan hoa, co yen; moi ngua mot nguoi, moi nguoi mot ngua',
      security: auth,
      parameters: params,
      requestBody: { required: true, ...json('AssignMountRequest') },
      responses: { '201': { description: 'Da giao' }, '409': { description: 'NOT_TAME / NO_SADDLE / ANIMAL_IN_USE / UNIT_HAS_MOUNT / RIDER_NOT_SUITABLE' }, ...common },
    },
    delete: { tags, summary: 'Huy giao thu cuoi', security: auth, parameters: params, responses: { '200': { description: 'Da huy' }, ...common } },
  },
  '/cities/{cityId}/mounts/animals/{animalId}/task': {
    post: {
      tags,
      summary: 'Phan cong: cho vat lieu (can dai cho hang, tang nang luc van chuyen) / du bi quan su (voi da luyen chien)',
      security: auth,
      parameters: params,
      requestBody: { required: true, ...json('AssignTaskRequest') },
      responses: { '201': { description: 'Da phan cong' }, '409': { description: 'NO_HARNESS / NOT_WAR_TRAINED / ANIMAL_IN_USE' }, ...common },
    },
    delete: { tags, summary: 'Ket thuc nhiem vu', security: auth, parameters: params, responses: { '200': { description: 'Da ket thuc' }, ...common } },
  },
  '/dev/test-world': {
    post: {
      tags: ['Development'],
      summary: 'CHI MOI TRUONG DEV: tao thanh pho thu nghiem (seed CV-DEV-) voi lanh tho rong ~3 lan de thu trai ngua / voi. Khong ton tai o production.',
      security: auth,
      requestBody: { required: true, ...json('CreateCityRequest') },
      responses: { '201': { description: 'Da tao thanh pho thu nghiem' }, '404': { description: 'Production: route khong ton tai' }, '409': { description: 'CITY_ALREADY_EXISTS' } },
    },
  },
} as const;
