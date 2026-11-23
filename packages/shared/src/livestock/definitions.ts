/**
 * Livestock catalogue — farm types (3 levels each), animal species (+ breeds), feed recipes,
 * products and the capacity / cost rules shared by client and server.
 *
 * Feed comes from Phase 4 produce (corn, hay/grass, rice by-products, vegetables) turned into
 * "nutrition" by a feed recipe; water comes from a well, an adjacent lake or (level 3) a piped
 * supply. Products are stored per city in city_resources next to wood / stone / produce.
 */
import type { ResourceBag } from '../buildings/definitions.js';
import type { ProduceCode } from '../farming/definitions.js';
import { HEX_DIRECTIONS, axialToWorld, hexKey, type AxialCoord } from '../hex/hexMath.js';

// ─────────────────────────────────────────────────────────────────────────────
// Products
// ─────────────────────────────────────────────────────────────────────────────
export type LivestockProductCode = 'eggs' | 'meat' | 'milk' | 'wool' | 'manure' | 'draft';
export const LIVESTOCK_PRODUCT_CODES: readonly LivestockProductCode[] = ['eggs', 'meat', 'milk', 'wool', 'manure', 'draft'];
export type LivestockProductBag = Record<LivestockProductCode, number>;
export type ProductAmounts = Partial<Record<LivestockProductCode, number>>;

export const LIVESTOCK_PRODUCT_LABELS: Record<LivestockProductCode, string> = {
  eggs: 'Trứng',
  meat: 'Thịt',
  milk: 'Sữa',
  wool: 'Lông',
  manure: 'Phân bón',
  draft: 'Sức kéo',
};

export const LIVESTOCK_PRODUCT_ICONS: Record<LivestockProductCode, string> = {
  eggs: '🥚',
  meat: '🥩',
  milk: '🥛',
  wool: '🧶',
  manure: '💩',
  draft: '🐂',
};

export function emptyLivestockProducts(): LivestockProductBag {
  return { eggs: 0, meat: 0, milk: 0, wool: 0, manure: 0, draft: 0 };
}

// ─────────────────────────────────────────────────────────────────────────────
// Farm types
// ─────────────────────────────────────────────────────────────────────────────
export type LivestockFarmTypeCode = 'chicken_farm' | 'pig_farm' | 'cattle_farm' | 'sheep_farm' | 'horse_stable' | 'elephant_camp';
export const LIVESTOCK_FARM_TYPE_CODES: readonly LivestockFarmTypeCode[] = ['chicken_farm', 'pig_farm', 'cattle_farm', 'sheep_farm', 'horse_stable', 'elephant_camp'];
/** Phase 9: stables / camps whose animals are trained and used (mounts, cargo, military). */
export const MOUNT_FARM_TYPES: readonly LivestockFarmTypeCode[] = ['horse_stable', 'elephant_camp'];
export const isMountFarmType = (code: string): boolean => (MOUNT_FARM_TYPES as readonly string[]).includes(code);

/** Hard cap on farm size (keeps nav grids and rendering bounded). */
export const MAX_LIVESTOCK_FARM_HEXES = 40;
export const LIVESTOCK_MAX_LEVEL = 3;
/** Occupancy map value prefix for livestock farm hexes. */
export const RANCH_OCCUPANT_PREFIX = 'ranch:';
export const ranchOccupant = (farmId: string): string => `${RANCH_OCCUPANT_PREFIX}${farmId}`;
/** Building category used for the world_buildings row that owns a livestock farm's land. */
export const LIVESTOCK_BUILDING_CATEGORY = 'livestock';
/** One-time cost of hiring a caretaker (coins). */
export const CARETAKER_HIRE_COST = 150;

export type WaterSource = 'well' | 'lake' | 'piped';
export const RANCH_WATER_SOURCE_LABELS: Record<WaterSource, string> = {
  well: 'Giếng (người chăm sóc kéo nước)',
  lake: 'Hồ / sông kề bên',
  piped: 'Hệ thống cấp nước',
};

export interface LivestockLevelDefinition {
  level: number;
  name: string;
  description: string;
  features: string[];
  /** Fixed + per-hex cost to reach this level (level 1 = creation). */
  cost: ResourceBag;
  costPerHex: ResourceBag;
  upgradeSeconds: number;
  capacityMultiplier: number;
  /** Production speed (higher = shorter cycles) */
  productionSpeed: number;
  yieldMultiplier: number;
  /** Caretakers that can work on the farm */
  maxCaretakers: number;
  /** Feed storage / water trough size multipliers */
  storageMultiplier: number;
  /** Finished production batches the farm can hold before production pauses */
  readyBatches: number;
  /** Level 3 nursery: faster breeding and growth of young animals */
  nursery: boolean;
  /** Level 3 piped water supply */
  pipedWater: boolean;
  modelKey: string;
  /** Stables / camps: fixed head count at the minimum size (expansion adds grazing room) */
  baseCapacity?: number;
}

export interface LivestockFarmDefinition {
  code: LivestockFarmTypeCode;
  name: string;
  description: string;
  minHexes: number;
  animals: readonly AnimalTypeCode[];
  /** Products this farm type can give (periodic + meat) */
  products: readonly LivestockProductCode[];
  levels: readonly LivestockLevelDefinition[];
  /** Stables / camps: one extra animal per this many hexes above `minHexes` */
  hexesPerExtraAnimal?: number;
}

const bag =(coins: number, wood = 0, stone = 0): ResourceBag => ({ coins, wood, stone });

function ladder(code: string, names: [string, string, string], descriptions: [string, string, string]): LivestockLevelDefinition[] {
  return [
    {
      level: 1,
      name: names[0],
      description: descriptions[0],
      features: ['Chuồng gỗ chibi, mái tranh', 'Hàng rào gỗ đơn giản', 'Sân đất', 'Máng ăn & máng nước gỗ', 'Giếng kéo tay'],
      cost: bag(600, 120, 20),
      costPerHex: bag(50, 8, 0),
      upgradeSeconds: 0,
      capacityMultiplier: 1,
      productionSpeed: 1,
      yieldMultiplier: 1,
      maxCaretakers: 1,
      storageMultiplier: 1,
      readyBatches: 1,
      nursery: false,
      pipedWater: false,
      modelKey: `${code}_l1`,
    },
    {
      level: 2,
      name: names[1],
      description: descriptions[1],
      features: ['Chuồng gạch, mái ngói', 'Hàng rào sơn trắng', 'Khu cho ăn có mái che', 'Kho chứa thức ăn', 'Tăng số lượng vật nuôi'],
      cost: bag(2200, 200, 260),
      costPerHex: bag(40, 6, 10),
      upgradeSeconds: 45,
      capacityMultiplier: 1.5,
      productionSpeed: 1.2,
      yieldMultiplier: 1.3,
      maxCaretakers: 2,
      storageMultiplier: 2,
      readyBatches: 2,
      nursery: false,
      pipedWater: false,
      modelKey: `${code}_l2`,
    },
    {
      level: 3,
      name: names[2],
      description: descriptions[2],
      features: [
        'Chuồng trại kiên cố + silo',
        'Khu nuôi chia ô bằng vách ngăn',
        'Tháp nước & ống cấp nước tự động',
        'Khu chăm sóc con non',
        'Khu xử lý chất thải (biogas)',
      ],
      cost: bag(5200, 320, 520),
      costPerHex: bag(70, 8, 14),
      upgradeSeconds: 90,
      capacityMultiplier: 2,
      productionSpeed: 1.45,
      yieldMultiplier: 1.7,
      maxCaretakers: 4,
      storageMultiplier: 3,
      readyBatches: 3,
      nursery: true,
      pipedWater: true,
      modelKey: `${code}_l3`,
    },
  ];
}

interface MountLevelSpec {
  name: string;
  description: string;
  features: string[];
  capacity: number;
}

/** Stable / camp ladder: same economics shape as farms, fixed head counts, big compounds. */
function mountLadder(code: string, specs: [MountLevelSpec, MountLevelSpec, MountLevelSpec], scale: number): LivestockLevelDefinition[] {
  const base = ladder(code, [specs[0].name, specs[1].name, specs[2].name], [specs[0].description, specs[1].description, specs[2].description]);
  return base.map((l, i) => ({
    ...l,
    features: specs[i].features,
    cost: scaled(l.cost, scale * (i === 0 ? 1.6 : 1.4)),
    costPerHex: scaled(l.costPerHex, scale),
    upgradeSeconds: [0, 60, 120][i],
    maxCaretakers: [2, 3, 4][i],
    // Grooms come with the compound; product batches are small (manure / draft work).
    readyBatches: [1, 2, 2][i],
    baseCapacity: specs[i].capacity,
  }));
}

export const LIVESTOCK_FARM_DEFINITIONS: readonly LivestockFarmDefinition[] = [
  {
    code: 'chicken_farm',
    name: 'Trại gà',
    description: 'Gà chibi lon ton mổ thóc, đẻ trứng đều đặn.',
    minHexes: 6,
    animals: ['chicken'],
    products: ['eggs', 'meat'],
    levels: ladder(
      'chicken_farm',
      ['Chuồng gà gỗ', 'Trại gà mái ngói', 'Trại gà hoàn chỉnh'],
      [
        'Chuồng gỗ mái tranh, sân đất, máng thóc đơn giản.',
        'Chuồng gạch có ổ đẻ, khu ăn có mái che và kho thóc.',
        'Trại kiên cố chia ô, khu ấp nở, nước tự động và hầm biogas.',
      ]
    ),
  },
  {
    code: 'pig_farm',
    name: 'Trại lợn',
    description: 'Lợn hồng tròn xoe thích lăn bùn — cho thịt và phân bón.',
    minHexes: 6,
    animals: ['pig'],
    products: ['meat', 'manure'],
    levels: ladder(
      'pig_farm',
      ['Chuồng lợn gỗ', 'Trại lợn chuồng gạch', 'Trại lợn hoàn chỉnh'],
      [
        'Chuồng gỗ, vũng bùn và máng ăn đơn giản.',
        'Chuồng gạch sạch sẽ, khu ăn có mái và kho cám.',
        'Ô chuồng riêng, khu lợn con, nước tự động và hầm biogas.',
      ]
    ),
  },
  {
    code: 'cattle_farm',
    name: 'Trại bò',
    description: 'Bò chibi to tròn cho sữa, thịt và sức kéo — cần đồng cỏ rộng (tối thiểu 9 ô).',
    minHexes: 9,
    animals: ['cow'],
    products: ['milk', 'meat', 'draft'],
    levels: ladder(
      'cattle_farm',
      ['Chuồng bò gỗ', 'Trại bò chuồng gạch', 'Trang trại bò sữa'],
      [
        'Chuồng gỗ, rào gỗ và máng cỏ đơn giản.',
        'Chuồng gạch mái ngói, khu ăn có mái và kho cỏ khô.',
        'Trang trại chia khu, chuồng bê, nước tự động và xử lý chất thải.',
      ]
    ),
  },
  {
    code: 'sheep_farm',
    name: 'Trại dê/cừu',
    description: 'Cừu bông xù cho lông, dê nhanh nhẹn cho sữa — cả hai cho thịt.',
    minHexes: 6,
    animals: ['sheep', 'goat'],
    products: ['milk', 'meat', 'wool'],
    levels: ladder(
      'sheep_farm',
      ['Chuồng dê cừu gỗ', 'Trại dê cừu chuồng gạch', 'Trại dê cừu hoàn chỉnh'],
      [
        'Chuồng gỗ mái tranh, rào gỗ và máng cỏ.',
        'Chuồng gạch, khu xén lông, kho cỏ khô.',
        'Đồng cỏ chia khu, khu chăm con non, nước tự động và xử lý chất thải.',
      ]
    ),
  },
  {
    code: 'horse_stable',
    name: 'Trại ngựa',
    description: 'Ngựa chibi bờm xù — chăm sóc, thuần hóa, huấn luyện làm thú cưỡi hoặc chở hàng (tối thiểu 9 ô).',
    minHexes: 9,
    animals: ['horse'],
    products: ['manure'],
    hexesPerExtraAnimal: 3,
    levels: mountLadder(
      'horse_stable',
      [
        {
          name: 'Chuồng ngựa gỗ',
          description: 'Chuồng gỗ chibi mái lớn, hàng rào, máng ăn và đồng cỏ nhỏ.',
          features: ['Chuồng ngựa gỗ chibi', 'Mái lớn', 'Hàng rào', 'Máng ăn & máng nước', 'Đồng cỏ nhỏ', 'Sức chứa 4 ngựa'],
          capacity: 4,
        },
        {
          name: 'Trại ngựa mái ngói',
          description: 'Chuồng gạch mái ngói, kho cỏ, sân huấn luyện và khu chăm sóc.',
          features: ['Chuồng gạch mái ngói', 'Kho cỏ', 'Sân huấn luyện', 'Khu chăm sóc', 'Hàng rào sơn trắng', 'Sức chứa 8 ngựa'],
          capacity: 8,
        },
        {
          name: 'Học viện kỵ mã',
          description: 'Khu chuồng lớn hoàn chỉnh, sân cưỡi ngựa, khu thú y và nhà quản lý.',
          features: ['Khu chuồng lớn', 'Sân cưỡi ngựa', 'Khu thú y', 'Nhà quản lý', 'Nước tự động', 'Sức chứa 12 ngựa'],
          capacity: 12,
        },
      ],
      1.4
    ),
  },
  {
    code: 'elephant_camp',
    name: 'Trại voi',
    description: 'Voi chibi tai to vòi dài — chở vật liệu và luyện cho quân đội (tối thiểu 12 ô).',
    minHexes: 12,
    animals: ['elephant'],
    products: ['manure', 'draft'],
    hexesPerExtraAnimal: 6,
    levels: mountLadder(
      'elephant_camp',
      [
        {
          name: 'Bãi nuôi voi',
          description: 'Bãi nuôi voi với chuồng gỗ cao, hồ tắm nhỏ và hàng rào chắc.',
          features: ['Bãi nuôi voi', 'Chuồng gỗ cao', 'Hồ tắm nhỏ', 'Hàng rào', 'Sức chứa 2 voi'],
          capacity: 2,
        },
        {
          name: 'Trại voi kiên cố',
          description: 'Chuồng kiên cố, hồ tắm lớn hơn, kho thức ăn và sân luyện.',
          features: ['Chuồng kiên cố', 'Hồ tắm lớn hơn', 'Kho thức ăn', 'Sân luyện', 'Sức chứa 4 voi'],
          capacity: 4,
        },
        {
          name: 'Trung tâm huấn luyện voi',
          description: 'Sân vận động lớn, khu chăm sóc y tế, kho thức ăn và tháp quan sát.',
          features: ['Trung tâm huấn luyện voi', 'Sân vận động lớn', 'Khu chăm sóc y tế', 'Kho thức ăn', 'Tháp quan sát', 'Sức chứa 6 voi'],
          capacity: 6,
        },
      ],
      2
    ),
  },
];

const FARM_BY_CODE = new Map(LIVESTOCK_FARM_DEFINITIONS.map((d) => [d.code, d]));

export function isLivestockFarmTypeCode(code: string): code is LivestockFarmTypeCode {
  return FARM_BY_CODE.has(code as LivestockFarmTypeCode);
}

export function getLivestockFarmDefinition(code: LivestockFarmTypeCode): LivestockFarmDefinition {
  const def = FARM_BY_CODE.get(code);
  if (!def) throw new Error(`Unknown livestock farm type: ${code}`);
  return def;
}

export function getLivestockLevel(code: LivestockFarmTypeCode, level: number): LivestockLevelDefinition | null {
  return getLivestockFarmDefinition(code).levels.find((l) => l.level === level) ?? null;
}

/** Level definition, clamped to 1..3 (never null). */
export function livestockLevel(code: LivestockFarmTypeCode, level: number): LivestockLevelDefinition {
  const levels = getLivestockFarmDefinition(code).levels;
  return levels[Math.min(levels.length, Math.max(1, Math.round(level))) - 1];
}

// ─────────────────────────────────────────────────────────────────────────────
// Feed recipes
// ─────────────────────────────────────────────────────────────────────────────
export type FeedRecipeCode = 'corn_grain' | 'fresh_grass' | 'rice_bran' | 'vegetable_scraps' | 'processed_feed';
export const FEED_RECIPE_CODES: readonly FeedRecipeCode[] = ['corn_grain', 'fresh_grass', 'rice_bran', 'vegetable_scraps', 'processed_feed'];

export interface FeedRecipeDefinition {
  code: FeedRecipeCode;
  name: string;
  description: string;
  /** Produce used for ONE batch */
  ingredients: Partial<Record<ProduceCode, number>>;
  /** Nutrition units one batch adds to the farm's feed store */
  nutrition: number;
  /** 0..0.3 — better health recovery and productivity */
  quality: number;
  /** Species that eat it */
  species: readonly AnimalTypeCode[];
}

export const FEED_RECIPE_DEFINITIONS: readonly FeedRecipeDefinition[] = [
  {
    code: 'corn_grain',
    name: 'Ngô hạt',
    description: 'Ngô từ ruộng ngô — món khoái khẩu của gà và lợn.',
    ingredients: { corn: 1 },
    nutrition: 10,
    quality: 0.05,
    species: ['chicken', 'pig', 'cow', 'horse'],
  },
  {
    code: 'fresh_grass',
    name: 'Cỏ',
    description: 'Cỏ khô từ đồng cỏ — thức ăn chính của bò, dê, cừu.',
    ingredients: { hay: 1 },
    nutrition: 10,
    quality: 0.05,
    species: ['cow', 'sheep', 'goat', 'horse', 'elephant'],
  },
  {
    code: 'rice_bran',
    name: 'Cám lúa (phụ phẩm)',
    description: 'Phụ phẩm xay lúa — rẻ nhưng ít dinh dưỡng.',
    ingredients: { rice: 1 },
    nutrition: 8,
    quality: 0,
    species: ['chicken', 'pig', 'cow', 'sheep', 'goat'],
  },
  {
    code: 'vegetable_scraps',
    name: 'Rau củ thừa',
    description: 'Rau củ dập, lá già — lợn và dê rất thích.',
    ingredients: { vegetables: 1 },
    nutrition: 8,
    quality: 0.05,
    species: ['pig', 'goat', 'sheep', 'elephant'],
  },
  {
    code: 'processed_feed',
    name: 'Thức ăn chế biến',
    description: 'Trộn ngô, cám, rau củ và cỏ — giàu dinh dưỡng, vật nuôi khỏe và năng suất hơn.',
    ingredients: { corn: 2, rice: 1, vegetables: 1, hay: 1 },
    nutrition: 70,
    quality: 0.25,
    species: ['chicken', 'pig', 'cow', 'sheep', 'goat', 'horse', 'elephant'],
  },
];

const RECIPE_BY_CODE = new Map(FEED_RECIPE_DEFINITIONS.map((d) => [d.code, d]));

export function isFeedRecipeCode(code: string): code is FeedRecipeCode {
  return RECIPE_BY_CODE.has(code as FeedRecipeCode);
}

export function getFeedRecipe(code: FeedRecipeCode): FeedRecipeDefinition {
  const def = RECIPE_BY_CODE.get(code);
  if (!def) throw new Error(`Unknown feed recipe: ${code}`);
  return def;
}

/** Recipes usable on a farm type (at least one of its species eats it). */
export function recipesForFarm(code: LivestockFarmTypeCode): FeedRecipeDefinition[] {
  const species = getLivestockFarmDefinition(code).animals;
  return FEED_RECIPE_DEFINITIONS.filter((r) => r.species.some((s) => species.includes(s)));
}

// ─────────────────────────────────────────────────────────────────────────────
// Animals
// ─────────────────────────────────────────────────────────────────────────────
export type AnimalTypeCode = 'chicken' | 'pig' | 'cow' | 'sheep' | 'goat' | 'horse' | 'elephant';
export const ANIMAL_TYPE_CODES: readonly AnimalTypeCode[] = ['chicken', 'pig', 'cow', 'sheep', 'goat', 'horse', 'elephant'];

export interface AnimalBreedDefinition {
  code: string;
  name: string;
  description: string;
  priceMultiplier: number;
  /** Per-product yield multipliers (missing = 1) */
  productMultiplier: ProductAmounts;
  /** 0..0.5 — slows health loss when hungry / thirsty */
  resilience: number;
  /** Optional coat tint (multiplied with the model colours) */
  tint: string | null;
}

export interface AnimalTypeDefinition {
  code: AnimalTypeCode;
  name: string;
  farmType: LivestockFarmTypeCode;
  /** Price of a young animal of the default breed (coins) */
  price: number;
  /** Seconds from young to adult */
  growSeconds: number;
  /** Seconds until old age (productivity declines after 70 %) */
  lifespanSeconds: number;
  /** Animals per hex at farm level 1 */
  capacityPerHex: number;
  /** Nutrition / water eaten per minute by an adult (young eat 60 %) */
  feedPerMinute: number;
  waterPerMinute: number;
  /** Periodic products per adult per production cycle (level 1) */
  products: ProductAmounts;
  /** Meat when an adult is taken to the butcher */
  meatYield: number;
  /** Base production cycle (s) */
  productionSeconds: number;
  /** Breeding time (s) */
  breedSeconds: number;
  /** One caretaker handles this many animals */
  animalsPerCaretaker: number;
  breeds: readonly AnimalBreedDefinition[];
  /** Starving at minimum health this long kills the animal (no animal lives forever unfed) */
  starvationDeathSeconds?: number;
  /** Working animals (mounts) are never sent to the butcher */
  butcher?: boolean;
}

const breed = (
  code: string,
  name: string,
  description: string,
  o: Partial<Omit<AnimalBreedDefinition, 'code' | 'name' | 'description'>> = {}
): AnimalBreedDefinition => ({
  code,
  name,
  description,
  priceMultiplier: o.priceMultiplier ?? 1,
  productMultiplier: o.productMultiplier ?? {},
  resilience: o.resilience ?? 0,
  tint: o.tint ?? null,
});

export const ANIMAL_TYPE_DEFINITIONS: readonly AnimalTypeDefinition[] = [
  {
    code: 'chicken',
    name: 'Gà',
    farmType: 'chicken_farm',
    price: 80,
    growSeconds: 45,
    lifespanSeconds: 1800,
    capacityPerHex: 2,
    feedPerMinute: 15,
    waterPerMinute: 5,
    products: { eggs: 3 },
    meatYield: 2,
    productionSeconds: 40,
    breedSeconds: 40,
    animalsPerCaretaker: 12,
    breeds: [
      breed('ri', 'Gà ri', 'Giống địa phương dẻo dai, chịu đói khát tốt.', { resilience: 0.35 }),
      breed('leghorn', 'Gà đẻ trứng', 'Đẻ nhiều trứng hơn nhưng cần chăm kỹ.', { priceMultiplier: 1.4, productMultiplier: { eggs: 1.3 }, tint: '#fffaf0' }),
    ],
  },
  {
    code: 'pig',
    name: 'Lợn',
    farmType: 'pig_farm',
    price: 300,
    growSeconds: 90,
    lifespanSeconds: 2700,
    capacityPerHex: 0.75,
    feedPerMinute: 17,
    waterPerMinute: 10,
    products: { manure: 3 },
    meatYield: 6,
    productionSeconds: 70,
    breedSeconds: 70,
    animalsPerCaretaker: 5,
    breeds: [
      breed('mong_cai', 'Lợn Móng Cái', 'Giống nội khỏe mạnh, mắn đẻ.', { resilience: 0.3, tint: '#f6d6dc' }),
      breed('yorkshire', 'Lợn Yorkshire', 'Lớn nhanh, nhiều thịt.', { priceMultiplier: 1.4, productMultiplier: { meat: 1.35 } }),
    ],
  },
  {
    code: 'cow',
    name: 'Bò',
    farmType: 'cattle_farm',
    price: 900,
    growSeconds: 120,
    lifespanSeconds: 3600,
    capacityPerHex: 0.5,
    feedPerMinute: 20,
    waterPerMinute: 20,
    products: { milk: 4, draft: 1 },
    meatYield: 10,
    productionSeconds: 90,
    breedSeconds: 100,
    animalsPerCaretaker: 3,
    breeds: [
      breed('holstein', 'Bò sữa HF', 'Lang trắng đen, nhiều sữa.', { productMultiplier: { milk: 1.3, draft: 0.5 } }),
      breed('vang', 'Bò vàng', 'Bò cày khỏe, sức kéo lớn, ít sữa.', { productMultiplier: { milk: 0.5, draft: 2.5 }, resilience: 0.25, tint: '#f0c27a' }),
    ],
  },
  {
    code: 'sheep',
    name: 'Cừu',
    farmType: 'sheep_farm',
    price: 400,
    growSeconds: 90,
    lifespanSeconds: 3000,
    capacityPerHex: 1,
    feedPerMinute: 15,
    waterPerMinute: 8,
    products: { wool: 2, milk: 1 },
    meatYield: 4,
    productionSeconds: 80,
    breedSeconds: 80,
    animalsPerCaretaker: 5,
    breeds: [
      breed('phan_rang', 'Cừu Phan Rang', 'Chịu nắng gió, dễ nuôi.', { resilience: 0.3 }),
      breed('merino', 'Cừu Merino', 'Lông mịn và dày gấp rưỡi.', { priceMultiplier: 1.5, productMultiplier: { wool: 1.5 } }),
    ],
  },
  {
    code: 'goat',
    name: 'Dê',
    farmType: 'sheep_farm',
    price: 350,
    growSeconds: 80,
    lifespanSeconds: 2800,
    capacityPerHex: 1,
    feedPerMinute: 17,
    waterPerMinute: 8,
    products: { milk: 2 },
    meatYield: 3,
    productionSeconds: 70,
    breedSeconds: 70,
    animalsPerCaretaker: 5,
    breeds: [
      breed('co', 'Dê cỏ', 'Dê núi nhỏ, leo trèo giỏi, rất dẻo dai.', { resilience: 0.35 }),
      breed('bach_thao', 'Dê Bách Thảo', 'Giống dê sữa lông đen.', { priceMultiplier: 1.3, productMultiplier: { milk: 1.35 }, tint: '#9a8d84' }),
    ],
  },
  {
    code: 'horse',
    name: 'Ngựa',
    farmType: 'horse_stable',
    price: 1200,
    growSeconds: 150,
    lifespanSeconds: 9000,
    capacityPerHex: 0.45,
    feedPerMinute: 24,
    waterPerMinute: 22,
    products: { manure: 1 },
    meatYield: 0,
    productionSeconds: 120,
    breedSeconds: 160,
    animalsPerCaretaker: 3,
    starvationDeathSeconds: 900,
    butcher: false,
    // Coat colours (body model is white → tinted per instance).
    breeds: [
      breed('bay', 'Ngựa hồng', 'Lông nâu đỏ, hiền lành, dễ thuần.', { tint: '#b8693c', resilience: 0.2 }),
      breed('black', 'Ngựa ô', 'Lông đen tuyền, nhanh nhẹn.', { tint: '#4a4048', priceMultiplier: 1.3 }),
      breed('white', 'Ngựa bạch', 'Lông trắng muốt, dáng đẹp.', { tint: '#f4efe6', priceMultiplier: 1.4 }),
      breed('chestnut', 'Ngựa vàng', 'Lông vàng hạt dẻ, dẻo dai.', { tint: '#d9a35a', resilience: 0.3 }),
      breed('dapple', 'Ngựa xám đốm', 'Lông xám đốm, khỏe và bền.', { tint: '#a9aab2', priceMultiplier: 1.2, resilience: 0.15 }),
    ],
  },
  {
    code: 'elephant',
    name: 'Voi',
    farmType: 'elephant_camp',
    price: 4200,
    growSeconds: 240,
    lifespanSeconds: 18000,
    capacityPerHex: 0.17,
    feedPerMinute: 60,
    waterPerMinute: 70,
    products: { manure: 3, draft: 2 },
    meatYield: 0,
    productionSeconds: 150,
    breedSeconds: 300,
    animalsPerCaretaker: 1,
    starvationDeathSeconds: 1500,
    butcher: false,
    breeds: [
      breed('asian', 'Voi châu Á', 'Voi xám hiền lành, siêng làm việc.', { tint: '#a3a7b0', resilience: 0.25 }),
      breed('war', 'Voi chiến', 'Voi lớn sậm màu, gan dạ — hợp huấn luyện quân sự.', { tint: '#7f838d', priceMultiplier: 1.5 }),
    ],
  },
];

const ANIMAL_BY_CODE = new Map(ANIMAL_TYPE_DEFINITIONS.map((d) => [d.code, d]));

export function isAnimalTypeCode(code: string): code is AnimalTypeCode {
  return ANIMAL_BY_CODE.has(code as AnimalTypeCode);
}

export function getAnimalDefinition(code: AnimalTypeCode): AnimalTypeDefinition {
  const def = ANIMAL_BY_CODE.get(code);
  if (!def) throw new Error(`Unknown animal type: ${code}`);
  return def;
}

/** Breed of a species (unknown / null → the first, default breed). */
export function getAnimalBreed(code: AnimalTypeCode, breedCode: string | null | undefined): AnimalBreedDefinition {
  const def = getAnimalDefinition(code);
  return def.breeds.find((b) => b.code === breedCode) ?? def.breeds[0];
}

export function animalPrice(code: AnimalTypeCode, breedCode: string | null | undefined): number {
  return Math.round(getAnimalDefinition(code).price * getAnimalBreed(code, breedCode).priceMultiplier);
}

// ─────────────────────────────────────────────────────────────────────────────
// Rules
// ─────────────────────────────────────────────────────────────────────────────
function scaled(b: ResourceBag, k: number): ResourceBag {
  return { coins: Math.round(b.coins * k), wood: Math.round(b.wood * k), stone: Math.round(b.stone * k) };
}

const sum = (a: ResourceBag, b: ResourceBag): ResourceBag => ({ coins: a.coins + b.coins, wood: a.wood + b.wood, stone: a.stone + b.stone });

export function livestockCreateCost(code: LivestockFarmTypeCode, hexCount: number): ResourceBag {
  const l1 = livestockLevel(code, 1);
  return sum(l1.cost, scaled(l1.costPerHex, hexCount));
}

export function livestockUpgradeCost(code: LivestockFarmTypeCode, targetLevel: number, hexCount: number): ResourceBag | null {
  const lvl = getLivestockLevel(code, targetLevel);
  if (!lvl || targetLevel <= 1) return null;
  return sum(lvl.cost, scaled(lvl.costPerHex, hexCount));
}

/** Adding hexes to a farm at `level` pays every level's per-hex part (the new land is built up to that level). */
export function livestockExpandCost(code: LivestockFarmTypeCode, level: number, addedHexes: number): ResourceBag {
  let total: ResourceBag = { coins: 0, wood: 0, stone: 0 };
  for (const l of getLivestockFarmDefinition(code).levels) if (l.level <= level) total = sum(total, scaled(l.costPerHex, addedHexes));
  return total;
}

/** Max animals (all species together) a farm can hold. */
export function livestockCapacity(code: LivestockFarmTypeCode, level: number, hexCount: number): number {
  const def = getLivestockFarmDefinition(code);
  const lvl = livestockLevel(code, level);
  if (lvl.baseCapacity !== undefined) {
    // Stables / camps: fixed stalls per level; extra land gives grazing room for a few more.
    const extra = Math.max(0, hexCount - def.minHexes);
    return lvl.baseCapacity + Math.floor(extra / (def.hexesPerExtraAnimal ?? 3));
  }
  const perHex = Math.max(...def.animals.map((a) => getAnimalDefinition(a).capacityPerHex));
  return Math.max(2, Math.floor(hexCount * perHex * livestockLevel(code, level).capacityMultiplier));
}

/** Nutrition units the feed store holds. */
export function feedCapacity(code: LivestockFarmTypeCode, level: number, hexCount: number): number {
  return Math.round((400 + 40 * hexCount) * livestockLevel(code, level).storageMultiplier);
}

/** Water units the troughs hold. */
export function waterCapacity(code: LivestockFarmTypeCode, level: number, hexCount: number): number {
  return Math.round((300 + 30 * hexCount) * livestockLevel(code, level).storageMultiplier);
}

/** Effective water source: level 3 always has the piped supply. */
export function effectiveWaterSource(code: LivestockFarmTypeCode, level: number, natural: WaterSource): WaterSource {
  return livestockLevel(code, level).pipedWater ? 'piped' : natural;
}

/** Water flowing into the troughs per minute (a well needs caretakers to draw water). */
export function waterSupplyPerMinute(source: WaterSource, caretakers: number): number {
  if (source === 'piped') return 600;
  if (source === 'lake') return 300;
  return 60 * caretakers;
}

/** Production cycle length for the species present (slowest species sets the pace). */
export function livestockCycleSeconds(code: LivestockFarmTypeCode, level: number, species: readonly AnimalTypeCode[]): number {
  const list = species.length ? species : getLivestockFarmDefinition(code).animals;
  const base = Math.max(...list.map((s) => getAnimalDefinition(s).productionSeconds));
  return Math.max(5, Math.round(base / livestockLevel(code, level).productionSpeed));
}

/** Animal growth 0..1 (1 = adult). */
export function animalGrowth(bornAtMs: number, growsUpAtMs: number, nowMs: number): number {
  if (growsUpAtMs <= bornAtMs) return 1;
  return Math.min(1, Math.max(0, (nowMs - bornAtMs) / (growsUpAtMs - bornAtMs)));
}

/** Age factor for production: 0 while young, 1 in prime, down to 0.5 in old age. */
export function animalAgeFactor(code: AnimalTypeCode, bornAtMs: number, growsUpAtMs: number, nowMs: number): number {
  if (nowMs < growsUpAtMs) return 0;
  const life = getAnimalDefinition(code).lifespanSeconds * 1000;
  const age = nowMs - bornAtMs;
  const prime = life * 0.7;
  if (age <= prime) return 1;
  return Math.max(0.5, 1 - (0.5 * (age - prime)) / (life - prime));
}

/** Caretakers needed for a herd. */
export function caretakersNeeded(animals: readonly AnimalTypeCode[]): number {
  let need = 0;
  const counts = new Map<AnimalTypeCode, number>();
  for (const a of animals) counts.set(a, (counts.get(a) ?? 0) + 1);
  for (const [code, n] of counts) need += n / getAnimalDefinition(code).animalsPerCaretaker;
  return need <= 0 ? 0 : Math.ceil(need - 1e-9);
}

/** 0.6 .. 1 — production / health bonus from enough caretakers. */
export function laborFactor(caretakers: number, needed: number): number {
  if (needed <= 0) return 1;
  return 0.6 + 0.4 * Math.min(1, caretakers / needed);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tile roles: where the barn, troughs, caretaker spot … sit (deterministic, shared)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Stables / camps (Phase 9) add: `arena` (training / riding yard, L2+), `vet` (care area L2,
 * veterinary L3) and `office` (manager house / watchtower, L3). Their `water` hex is a bathing
 * pond for elephants.
 */
export type RanchTileRole = 'barn' | 'yard' | 'feeder' | 'water' | 'caretaker' | 'storage' | 'nursery' | 'waste' | 'arena' | 'vet' | 'office';
export const RANCH_TILE_ROLES: readonly RanchTileRole[] = ['barn', 'yard', 'feeder', 'water', 'caretaker', 'storage', 'nursery', 'waste', 'arena', 'vet', 'office'];

export interface RanchTile extends AxialCoord {
  role: RanchTileRole;
}

/**
 * Assigns a role to every hex: barn on the most exposed boundary hex, water trough on the
 * boundary hex farthest from it, feeder near the middle, caretaker spot beside the barn,
 * feed storage (L2+), nursery and waste area (L3) on the remaining boundary; the rest is yard.
 */
export function planRanchTiles(hexes: readonly AxialCoord[], level: number, farmType?: LivestockFarmTypeCode): RanchTile[] {
  const mount = farmType !== undefined && isMountFarmType(farmType);
  const keys = new Set(hexes.map((h) => hexKey(h.q, h.r)));
  const sorted = [...hexes].sort((a, b) => a.q - b.q || a.r - b.r);
  const exposed = (h: AxialCoord): number => HEX_DIRECTIONS.filter((d) => !keys.has(hexKey(h.q + d.q, h.r + d.r))).length;
  const boundary = sorted.filter((h) => exposed(h) > 0).sort((a, b) => exposed(b) - exposed(a) || a.q - b.q || a.r - b.r);
  const world = (h: AxialCoord) => axialToWorld(h.q, h.r);
  const centers = sorted.map(world);
  const centroid = {
    x: centers.reduce((s, c) => s + c.x, 0) / Math.max(1, centers.length),
    z: centers.reduce((s, c) => s + c.z, 0) / Math.max(1, centers.length),
  };
  const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
  const roles = new Map<string, RanchTileRole>();
  const free = (h: AxialCoord) => !roles.has(hexKey(h.q, h.r));
  const assign = (list: AxialCoord[], role: RanchTileRole): AxialCoord | null => {
    const h = list.find(free) ?? sorted.find(free) ?? null;
    if (h) roles.set(hexKey(h.q, h.r), role);
    return h;
  };

  const barn = assign(boundary, 'barn');
  if (barn) {
    const bw = world(barn);
    const nearBarn = (list: AxialCoord[]) => [...list].sort((a, b) => dist(world(a), bw) - dist(world(b), bw) || a.q - b.q || a.r - b.r);
    assign([...boundary].sort((a, b) => dist(world(b), bw) - dist(world(a), bw) || a.q - b.q || a.r - b.r), 'water');
    const interior = sorted.filter((h) => exposed(h) === 0);
    assign(
      [...(interior.length ? interior : sorted)].sort((a, b) => dist(world(a), centroid) - dist(world(b), centroid) || a.q - b.q || a.r - b.r),
      'feeder'
    );
    assign(nearBarn(sorted), 'caretaker');
    if (mount) {
      // Stables / camps: the training yard is an interior hex far from the barn, then care / office.
      const inner = sorted.filter((h) => exposed(h) === 0);
      const far = (list: AxialCoord[]) => [...list].sort((a, b) => dist(world(b), bw) - dist(world(a), bw) || a.q - b.q || a.r - b.r);
      if (level >= 2) {
        assign(far(inner.length ? inner : sorted), 'arena');
        assign(nearBarn(boundary).reverse(), 'vet');
      }
      if (level >= 3) assign(nearBarn(boundary), 'office');
      if (level >= 2) assign(nearBarn(boundary), 'storage');
      return sorted.map((h) => ({ q: h.q, r: h.r, role: roles.get(hexKey(h.q, h.r)) ?? 'yard' }));
    }
    // Level 3 areas first: on a small farm the feed store moves into the barn's silo instead.
    if (level >= 3) {
      assign(nearBarn(boundary).reverse(), 'nursery');
      assign(nearBarn(boundary).reverse(), 'waste');
    }
    if (level >= 2) assign(nearBarn(boundary), 'storage');
  }
  return sorted.map((h) => ({ q: h.q, r: h.r, role: roles.get(hexKey(h.q, h.r)) ?? 'yard' }));
}
