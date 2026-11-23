/**
 * Agriculture catalogue — farm zone types (3 levels each) and crop types (growth stages,
 * yield, duration, water need). Single source of truth: the server seeds `crop_types` from
 * this and validates against it; the client renders from it.
 */
import type { ResourceBag } from '../buildings/definitions.js';

// ─────────────────────────────────────────────────────────────────────────────
// Produce (stored per city in city_resources next to wood / stone)
// ─────────────────────────────────────────────────────────────────────────────
export type ProduceCode = 'rice' | 'corn' | 'vegetables' | 'fruit' | 'hay';
export const PRODUCE_CODES: readonly ProduceCode[] = ['rice', 'corn', 'vegetables', 'fruit', 'hay'];
export type ProduceBag = Record<ProduceCode, number>;

export const PRODUCE_LABELS: Record<ProduceCode, string> = {
  rice: 'Lúa gạo',
  corn: 'Ngô',
  vegetables: 'Rau củ',
  fruit: 'Trái cây',
  hay: 'Cỏ khô',
};

export const PRODUCE_ICONS: Record<ProduceCode, string> = {
  rice: '🌾',
  corn: '🌽',
  vegetables: '🥬',
  fruit: '🍊',
  hay: '🌿',
};

export function emptyProduce(): ProduceBag {
  return { rice: 0, corn: 0, vegetables: 0, fruit: 0, hay: 0 };
}

// ─────────────────────────────────────────────────────────────────────────────
// Farm zones
// ─────────────────────────────────────────────────────────────────────────────
export type FarmZoneTypeCode = 'rice_paddy' | 'corn_field' | 'vegetable_garden' | 'orchard' | 'pasture';
export const FARM_ZONE_TYPE_CODES: readonly FarmZoneTypeCode[] = [
  'rice_paddy',
  'corn_field',
  'vegetable_garden',
  'orchard',
  'pasture',
];

/** A zone must cover at least this many connected hexes. */
export const MIN_FARM_ZONE_HEXES = 6;
/** Upper bound per zone (keeps a single zone readable and bounded for rendering). */
export const MAX_FARM_ZONE_HEXES = 60;
/** Highest farm zone level. */
export const FARM_MAX_LEVEL = 3;

export interface FarmZoneLevelDefinition {
  level: number;
  name: string;
  description: string;
  /** Visible features at this level (shown in the panel). */
  features: string[];
  /** Upgrade cost to reach this level: fixed part + per-hex part (level 1 = creation cost). */
  cost: ResourceBag;
  costPerHex: ResourceBag;
  /** Upgrade duration (s) to reach this level (0 for level 1). */
  upgradeSeconds: number;
  /** Yield multiplier */
  yieldMultiplier: number;
  /** Growth speed multiplier (higher = faster) */
  growthSpeed: number;
  /** Irrigation added on top of the natural water supply (0..1). */
  irrigationBonus: number;
  /** How far (hexes) the irrigation can reach for a water source. */
  irrigationReach: number;
  /** Chibi farmers working the zone */
  farmers: number;
}

export interface FarmZoneDefinition {
  code: FarmZoneTypeCode;
  name: string;
  description: string;
  /** Crops that can be planted in this zone type (first = default). */
  crops: readonly CropTypeCode[];
  /** Expansion cost per added hex at level 1 (scaled by level). */
  expandCostPerHex: ResourceBag;
  levels: readonly FarmZoneLevelDefinition[];
}

const bag = (coins: number, wood = 0, stone = 0): ResourceBag => ({ coins, wood, stone });

/**
 * Level ladders share their mechanics; names/features differ per zone type.
 * L1 manual · L2 canal + hut + farm road · L3 pump station / irrigation works.
 */
function ladder(
  names: [string, string, string],
  features: [string[], string[], string[]],
  descriptions: [string, string, string]
): FarmZoneLevelDefinition[] {
  return [
    {
      level: 1,
      name: names[0],
      description: descriptions[0],
      features: features[0],
      cost: bag(300, 40, 0),
      costPerHex: bag(60, 4, 0),
      upgradeSeconds: 0,
      yieldMultiplier: 1,
      growthSpeed: 1,
      irrigationBonus: 0,
      irrigationReach: 0,
      farmers: 2,
    },
    {
      level: 2,
      name: names[1],
      description: descriptions[1],
      features: features[1],
      cost: bag(1600, 220, 140),
      costPerHex: bag(30, 6, 6),
      upgradeSeconds: 40,
      yieldMultiplier: 1.35,
      growthSpeed: 1.15,
      irrigationBonus: 0.35,
      irrigationReach: 12,
      farmers: 3,
    },
    {
      level: 3,
      name: names[2],
      description: descriptions[2],
      features: features[2],
      cost: bag(4200, 320, 420),
      costPerHex: bag(60, 8, 12),
      upgradeSeconds: 80,
      yieldMultiplier: 1.8,
      growthSpeed: 1.35,
      irrigationBonus: 0.7,
      irrigationReach: 25,
      farmers: 4,
    },
  ];
}

export const FARM_ZONE_DEFINITIONS: readonly FarmZoneDefinition[] = [
  {
    code: 'rice_paddy',
    name: 'Cánh đồng lúa',
    description: 'Ruộng nước trồng lúa — cần nhiều nước nhất, năng suất cao.',
    crops: ['rice'],
    expandCostPerHex: bag(60, 4, 0),
    levels: ladder(
      ['Ruộng đất thủ công', 'Ruộng có kênh mương', 'Cánh đồng thủy lợi'],
      [
        ['Ruộng đất chibi', 'Bờ đất đơn giản', 'Nông dân làm thủ công'],
        ['Bờ ruộng cỏ xanh', 'Kênh nước quanh ruộng', 'Chòi canh nhỏ', 'Đường nội đồng'],
        ['Trạm bơm thủy lợi', 'Bờ kè đá quy hoạch', 'Bù nhìn & cờ hiệu', 'Năng suất cao nhất'],
      ],
      [
        'Những ô ruộng nhỏ đắp bờ bằng tay, nông dân đội nón lá cấy lúa.',
        'Bờ ruộng gọn gàng, kênh nước dẫn quanh ruộng, có chòi nghỉ và đường nội đồng.',
        'Trạm bơm chibi đưa nước vào kênh kè đá — ruộng quy hoạch đẹp, năng suất cao.',
      ]
    ),
  },
  {
    code: 'corn_field',
    name: 'Ruộng ngô',
    description: 'Ngô chịu hạn khá tốt, thân cao và trái vàng ươm.',
    crops: ['corn'],
    expandCostPerHex: bag(55, 4, 0),
    levels: ladder(
      ['Nương ngô thủ công', 'Ruộng ngô có mương', 'Ruộng ngô cối xay gió'],
      [
        ['Luống đất xới tay', 'Bờ đất thấp', 'Nông dân làm thủ công'],
        ['Mương nước quanh ruộng', 'Chòi canh', 'Đường nội đồng'],
        ['Cối xay gió bơm nước', 'Bờ kè đá', 'Bù nhìn', 'Năng suất cao nhất'],
      ],
      [
        'Luống ngô xới bằng cuốc, bờ đất thấp.',
        'Có mương dẫn nước, chòi canh và lối đi giữa các luống.',
        'Cối xay gió chibi bơm nước vào mương kè đá, ngô mọc đều tăm tắp.',
      ]
    ),
  },
  {
    code: 'vegetable_garden',
    name: 'Vườn rau',
    description: 'Luống rau xinh xắn, lớn nhanh, cần tưới đều.',
    crops: ['cabbage', 'carrot'],
    expandCostPerHex: bag(70, 6, 0),
    levels: ladder(
      ['Vườn rau nhà', 'Vườn rau có mương', 'Vườn rau tưới tự động'],
      [
        ['Luống đất vun tay', 'Hàng rào tre thấp', 'Nông dân làm thủ công'],
        ['Luống gỗ nâng', 'Mương tưới', 'Chòi dụng cụ', 'Lối đi giữa luống'],
        ['Trạm bơm & tháp nước', 'Luống kè đá', 'Bù nhìn', 'Năng suất cao nhất'],
      ],
      [
        'Luống rau vun bằng tay, rào tre thấp quanh vườn.',
        'Luống gỗ nâng gọn gàng, mương tưới và chòi để dụng cụ.',
        'Trạm bơm và tháp nước chibi tưới đều cho từng luống.',
      ]
    ),
  },
  {
    code: 'orchard',
    name: 'Vườn cây ăn trái',
    description: 'Hàng cây tròn trịa trĩu quả — lâu lớn nhưng ít cần nước.',
    crops: ['orange'],
    expandCostPerHex: bag(80, 8, 0),
    levels: ladder(
      ['Vườn cây tự nhiên', 'Vườn cây có mương', 'Vườn cây thủy lợi'],
      [
        ['Gốc cây vun đất', 'Lối mòn', 'Nông dân làm thủ công'],
        ['Mương quanh vườn', 'Chòi hái quả', 'Đường nội vườn'],
        ['Trạm bơm tưới nhỏ giọt', 'Bờ kè đá', 'Thang & giỏ quả', 'Năng suất cao nhất'],
      ],
      [
        'Cây trồng theo lối tự nhiên, nông dân chăm từng gốc.',
        'Mương nước quanh vườn, chòi nhỏ để hái và phân loại quả.',
        'Trạm bơm tưới nhỏ giọt, vườn quy hoạch thành hàng thẳng tắp.',
      ]
    ),
  },
  {
    code: 'pasture',
    name: 'Đồng cỏ',
    description: 'Đồng cỏ mượt mà cho cỏ khô — lớn nhanh, ít cần nước.',
    crops: ['clover'],
    expandCostPerHex: bag(40, 3, 0),
    levels: ladder(
      ['Bãi cỏ tự nhiên', 'Đồng cỏ có mương', 'Đồng cỏ cối xay gió'],
      [
        ['Cỏ mọc tự nhiên', 'Rào gỗ mộc', 'Nông dân cắt cỏ tay'],
        ['Mương nước', 'Chòi chứa cỏ', 'Đường nội đồng'],
        ['Cối xay gió bơm nước', 'Rào kè đá', 'Đống rơm vàng', 'Năng suất cao nhất'],
      ],
      [
        'Bãi cỏ tự nhiên quây rào gỗ mộc.',
        'Mương nước giữ cỏ luôn xanh, có chòi chứa cỏ khô.',
        'Cối xay gió chibi bơm nước, cỏ dày mượt quanh năm.',
      ]
    ),
  },
];

const ZONE_BY_CODE = new Map(FARM_ZONE_DEFINITIONS.map((d) => [d.code, d]));

export function isFarmZoneTypeCode(code: string): code is FarmZoneTypeCode {
  return ZONE_BY_CODE.has(code as FarmZoneTypeCode);
}

export function getFarmZoneDefinition(code: FarmZoneTypeCode): FarmZoneDefinition {
  const def = ZONE_BY_CODE.get(code);
  if (!def) throw new Error(`Unknown farm zone type: ${code}`);
  return def;
}

export function getFarmZoneLevel(code: FarmZoneTypeCode, level: number): FarmZoneLevelDefinition | null {
  return getFarmZoneDefinition(code).levels.find((l) => l.level === level) ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Crops
// ─────────────────────────────────────────────────────────────────────────────
export type CropTypeCode = 'rice' | 'corn' | 'cabbage' | 'carrot' | 'orange' | 'clover';
export const CROP_TYPE_CODES: readonly CropTypeCode[] = ['rice', 'corn', 'cabbage', 'carrot', 'orange', 'clover'];

export interface CropStageDefinition {
  /** 0-based stage index */
  index: number;
  key: 'seeded' | 'seedling' | 'growing' | 'ripe';
  name: string;
  /** Growth progress (0..1) at which this stage starts; the last stage starts at 1 (ripe). */
  startsAt: number;
}

export interface CropTypeDefinition {
  code: CropTypeCode;
  name: string;
  zoneType: FarmZoneTypeCode;
  produce: ProduceCode;
  /** Base growth time (s) at zone level 1 with ideal water */
  growSeconds: number;
  /** Base yield per hex at zone level 1 with ideal water */
  yieldPerHex: number;
  /** Water need 0..1 (rice ≈ 0.9, pasture ≈ 0.3) */
  waterNeed: number;
  /** Seed cost per hex */
  seedCostPerHex: ResourceBag;
  stages: readonly CropStageDefinition[];
}

function stages(names: [string, string, string, string]): CropStageDefinition[] {
  return [
    { index: 0, key: 'seeded', name: names[0], startsAt: 0 },
    { index: 1, key: 'seedling', name: names[1], startsAt: 0.2 },
    { index: 2, key: 'growing', name: names[2], startsAt: 0.55 },
    { index: 3, key: 'ripe', name: names[3], startsAt: 1 },
  ];
}

export const CROP_TYPE_DEFINITIONS: readonly CropTypeDefinition[] = [
  {
    code: 'rice',
    name: 'Lúa nước',
    zoneType: 'rice_paddy',
    produce: 'rice',
    growSeconds: 120,
    yieldPerHex: 12,
    waterNeed: 0.9,
    seedCostPerHex: bag(12),
    stages: stages(['Mới gieo', 'Mạ non', 'Đang phát triển', 'Lúa chín vàng']),
  },
  {
    code: 'corn',
    name: 'Ngô nếp',
    zoneType: 'corn_field',
    produce: 'corn',
    growSeconds: 100,
    yieldPerHex: 10,
    waterNeed: 0.55,
    seedCostPerHex: bag(10),
    stages: stages(['Mới gieo', 'Cây con', 'Trổ cờ', 'Bắp chín']),
  },
  {
    code: 'cabbage',
    name: 'Bắp cải',
    zoneType: 'vegetable_garden',
    produce: 'vegetables',
    growSeconds: 60,
    yieldPerHex: 13,
    waterNeed: 0.65,
    seedCostPerHex: bag(8),
    stages: stages(['Mới gieo', 'Lá mầm', 'Cuốn bắp', 'Bắp cải tròn']),
  },
  {
    code: 'carrot',
    name: 'Cà rốt',
    zoneType: 'vegetable_garden',
    produce: 'vegetables',
    growSeconds: 75,
    yieldPerHex: 15,
    waterNeed: 0.55,
    seedCostPerHex: bag(9),
    stages: stages(['Mới gieo', 'Lá mầm', 'Lá xum xuê', 'Củ cam tròn']),
  },
  {
    code: 'orange',
    name: 'Cam sành',
    zoneType: 'orchard',
    produce: 'fruit',
    growSeconds: 180,
    yieldPerHex: 11,
    waterNeed: 0.45,
    seedCostPerHex: bag(20, 2),
    stages: stages(['Cây giống', 'Cây non', 'Ra hoa', 'Trĩu quả']),
  },
  {
    code: 'clover',
    name: 'Cỏ chăn nuôi',
    zoneType: 'pasture',
    produce: 'hay',
    growSeconds: 45,
    yieldPerHex: 16,
    waterNeed: 0.3,
    seedCostPerHex: bag(5),
    stages: stages(['Gieo hạt', 'Cỏ non', 'Cỏ xanh mượt', 'Cỏ vàng chờ cắt']),
  },
];

const CROP_BY_CODE = new Map(CROP_TYPE_DEFINITIONS.map((d) => [d.code, d]));

export function isCropTypeCode(code: string): code is CropTypeCode {
  return CROP_BY_CODE.has(code as CropTypeCode);
}

export function getCropDefinition(code: CropTypeCode): CropTypeDefinition {
  const def = CROP_BY_CODE.get(code);
  if (!def) throw new Error(`Unknown crop type: ${code}`);
  return def;
}
