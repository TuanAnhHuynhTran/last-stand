/**
 * Building catalogue — the single source of truth for building types and their levels.
 * The server seeds `building_types` / `building_levels` from this, the client renders from it.
 */
import type { AxialCoord } from '../hex/hexMath.js';

export type ResourceCode = 'coins' | 'wood' | 'stone';
export const RESOURCE_CODES: readonly ResourceCode[] = ['coins', 'wood', 'stone'];
export type ResourceBag = Record<ResourceCode, number>;

export const RESOURCE_LABELS: Record<ResourceCode, string> = {
  coins: 'Xu',
  wood: 'Gỗ',
  stone: 'Đá',
};

/** Materials granted when a city's resource rows are first created (coins live in the economy). */
export const STARTING_MATERIALS: Omit<ResourceBag, 'coins'> = { wood: 3000, stone: 2500 };

export type BuildingTypeCode =
  | 'radar'
  | 'house'
  | 'territory_center'
  | 'storage'
  | 'market'
  | 'clinic'
  | 'carpentry'
  | 'quarry'
  | 'smithy'
  | 'well'
  | 'road'
  | 'sword_barracks'
  | 'spear_barracks'
  | 'archery_range'
  | 'crossbow_range'
  | 'military_forge'
  | 'training_ground'
  | 'military_depot';

export type BuildingStatKey = 'residents' | 'storage' | 'trade' | 'healing' | 'production' | 'influence' | 'water' | 'speed' | 'training';

export const BUILDING_STAT_LABELS: Record<BuildingStatKey, string> = {
  residents: 'Sức chứa cư dân',
  storage: 'Sức chứa kho',
  trade: 'Sạp buôn bán',
  healing: 'Giường bệnh',
  production: 'Năng suất gỗ/giờ',
  influence: 'Bán kính ảnh hưởng (hex)',
  water: 'Nước / ngày',
  speed: 'Tốc độ đi lại (×)',
  training: 'Lính mỗi đợt huấn luyện',
};

export interface BuildingLevelDefinition {
  level: number;
  name: string;
  description: string;
  cost: ResourceBag;
  buildSeconds: number;
  stats: Partial<Record<BuildingStatKey, number>>;
  /** Key of the 3D model variant for this level */
  modelKey: string;
}

export interface BuildingDefinition {
  code: BuildingTypeCode;
  name: string;
  category: 'residential' | 'civic' | 'economy' | 'service' | 'production' | 'infrastructure' | 'military';
  description: string;
  /** Axial offsets relative to the anchor hex at rotation 0. The anchor (0,0) is always first. */
  footprint: readonly AxialCoord[];
  /** Max instances per city (null = unlimited) */
  maxPerCity: number | null;
  levels: readonly BuildingLevelDefinition[];
}

const cost = (coins: number, wood: number, stone: number): ResourceBag => ({ coins, wood, stone });

const ONE: readonly AxialCoord[] = [{ q: 0, r: 0 }];
const TWO: readonly AxialCoord[] = [
  { q: 0, r: 0 },
  { q: 1, r: 0 },
];
const THREE: readonly AxialCoord[] = [
  { q: 0, r: 0 },
  { q: 1, r: 0 },
  { q: 0, r: 1 },
];
/** 6 hexes: a 3 × 2 rhombus (military compounds). Anchor first. */
const SIX: readonly AxialCoord[] = [
  { q: 0, r: 0 },
  { q: 1, r: 0 },
  { q: 2, r: 0 },
  { q: 0, r: 1 },
  { q: 1, r: 1 },
  { q: 2, r: 1 },
];
/** 9 hexes: a 3 × 3 rhombus (combined training ground). */
const NINE: readonly AxialCoord[] = [...SIX, { q: 0, r: 2 }, { q: 1, r: 2 }, { q: 2, r: 2 }];
const SEVEN: readonly AxialCoord[] = [
  { q: 0, r: 0 },
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export const BUILDING_DEFINITIONS: readonly BuildingDefinition[] = [
  { code: 'radar', name: 'Tr?m radar', category: 'civic', description: 'Qu?t b?n ?? v? t?m ??a ?i?m ??c bi?t.', footprint: ONE, maxPerCity: null,
    levels: [1, 2, 3].map(level => ({ level, name: ['Radar g?', 'Th?p radar g?ch', 'Radar ki?n c?'][level - 1], description: 'M? r?ng ph?m vi qu?t.', cost: cost(level * 150, level * 100, level * 80), buildSeconds: level * 30, stats: { influence: [12, 22, 34][level - 1] }, modelKey: 'radar_' + level })) },
  {
    code: 'house',
    name: 'Nhà dân',
    category: 'residential',
    description: 'Nơi ở cho cư dân. Luôn chiếm 1 ô hex, nâng cấp để tăng sức chứa.',
    footprint: ONE,
    maxPerCity: null,
    levels: [
      {
        level: 1,
        name: 'Nhà gỗ chibi sân vườn',
        description: '1 tầng, mái lớn, tường gỗ, cửa sổ to, sân vườn nhỏ và hàng rào xinh.',
        cost: cost(500, 120, 20),
        buildSeconds: 20,
        stats: { residents: 4 },
        modelKey: 'house_l1',
      },
      {
        level: 2,
        name: 'Nhà gạch chibi mái ngói',
        description: 'Thân nhà gạch, mái ngói cam đỏ, sân đẹp hơn, hàng rào trắng và chậu hoa.',
        cost: cost(1500, 150, 180),
        buildSeconds: 45,
        stats: { residents: 6 },
        modelKey: 'house_l2',
      },
      {
        level: 3,
        name: 'Nhà gạch chibi 2 tầng',
        description: 'Hai tầng thật sự, ban công nhỏ, mái ngói lớn, đèn sân, cây cảnh và lối đi.',
        cost: cost(4000, 250, 400),
        buildSeconds: 90,
        stats: { residents: 10 },
        modelKey: 'house_l3',
      },
    ],
  },
  {
    code: 'territory_center',
    name: 'Trung tâm lãnh địa',
    category: 'civic',
    description: 'Trung tâm điều hành lãnh địa. Mỗi lãnh địa chỉ có một.',
    footprint: SEVEN,
    maxPerCity: 1,
    levels: [
      {
        level: 1,
        name: 'Nhà chỉ huy gỗ',
        description: 'Nhà gỗ lớn có cờ hiệu và sân tập trung.',
        cost: cost(3000, 400, 150),
        buildSeconds: 60,
        stats: { influence: 6 },
        modelKey: 'territory_center_l1',
      },
      {
        level: 2,
        name: 'Dinh gạch mái ngói',
        description: 'Dinh thự gạch, mái ngói, sân lát đá.',
        cost: cost(8000, 500, 600),
        buildSeconds: 150,
        stats: { influence: 8 },
        modelKey: 'territory_center_l2',
      },
      {
        level: 3,
        name: 'Phủ hai tầng',
        description: 'Phủ hai tầng có tháp, quảng trường nhỏ và đài phun nước.',
        cost: cost(20000, 800, 1200),
        buildSeconds: 300,
        stats: { influence: 10 },
        modelKey: 'territory_center_l3',
      },
    ],
  },
  {
    code: 'storage',
    name: 'Kho tài nguyên',
    category: 'economy',
    description: 'Chứa gỗ, đá và lương thực.',
    footprint: TWO,
    maxPerCity: null,
    levels: [
      {
        level: 1,
        name: 'Kho gỗ',
        description: 'Kho gỗ mái dốc với thùng hàng.',
        cost: cost(800, 200, 40),
        buildSeconds: 30,
        stats: { storage: 1000 },
        modelKey: 'storage_l1',
      },
      {
        level: 2,
        name: 'Kho gạch có kệ',
        description: 'Kho tường gạch, cửa lớn, kệ hàng.',
        cost: cost(2000, 250, 300),
        buildSeconds: 75,
        stats: { storage: 2500 },
        modelKey: 'storage_l2',
      },
      {
        level: 3,
        name: 'Kho lớn có gác',
        description: 'Kho hai tầng có gác chứa và ròng rọc.',
        cost: cost(5000, 400, 600),
        buildSeconds: 150,
        stats: { storage: 5000 },
        modelKey: 'storage_l3',
      },
    ],
  },
  {
    code: 'market',
    name: 'Chợ',
    category: 'economy',
    description: 'Nơi cư dân trao đổi hàng hóa.',
    footprint: THREE,
    maxPerCity: null,
    levels: [
      {
        level: 1,
        name: 'Quầy gỗ mái vải',
        description: 'Vài sạp gỗ với mái vải sọc.',
        cost: cost(1200, 250, 60),
        buildSeconds: 40,
        stats: { trade: 4 },
        modelKey: 'market_l1',
      },
      {
        level: 2,
        name: 'Chợ mái ngói',
        description: 'Nhà chợ mái ngói, nhiều sạp hơn.',
        cost: cost(3000, 300, 350),
        buildSeconds: 90,
        stats: { trade: 8 },
        modelKey: 'market_l2',
      },
      {
        level: 3,
        name: 'Khu chợ nhiều gian',
        description: 'Khu chợ lớn có lầu và đèn lồng.',
        cost: cost(7000, 500, 700),
        buildSeconds: 180,
        stats: { trade: 14 },
        modelKey: 'market_l3',
      },
    ],
  },
  {
    code: 'clinic',
    name: 'Trạm y tế',
    category: 'service',
    description: 'Chăm sóc sức khỏe cư dân.',
    footprint: TWO,
    maxPerCity: null,
    levels: [
      {
        level: 1,
        name: 'Nhà thuốc gỗ',
        description: 'Nhà gỗ nhỏ có biển chữ thập.',
        cost: cost(1000, 180, 60),
        buildSeconds: 35,
        stats: { healing: 4 },
        modelKey: 'clinic_l1',
      },
      {
        level: 2,
        name: 'Phòng khám gạch',
        description: 'Phòng khám tường trắng, mái ngói.',
        cost: cost(2500, 220, 320),
        buildSeconds: 80,
        stats: { healing: 8 },
        modelKey: 'clinic_l2',
      },
      {
        level: 3,
        name: 'Bệnh xá hai tầng',
        description: 'Bệnh xá hai tầng có vườn thảo dược.',
        cost: cost(6000, 350, 650),
        buildSeconds: 160,
        stats: { healing: 14 },
        modelKey: 'clinic_l3',
      },
    ],
  },
  {
    code: 'carpentry',
    name: 'Xưởng mộc',
    category: 'production',
    description: 'Chế biến gỗ thành vật liệu xây dựng.',
    footprint: THREE,
    maxPerCity: null,
    levels: [
      {
        level: 1,
        name: 'Xưởng thủ công',
        description: 'Mái che gỗ, bàn cưa và đống gỗ.',
        cost: cost(900, 150, 80),
        buildSeconds: 35,
        stats: { production: 5 },
        modelKey: 'carpentry_l1',
      },
      {
        level: 2,
        name: 'Xưởng có máy cưa',
        description: 'Xưởng mái ngói với bánh xe máy cưa cơ học.',
        cost: cost(2400, 250, 300),
        buildSeconds: 80,
        stats: { production: 10 },
        modelKey: 'carpentry_l2',
      },
      {
        level: 3,
        name: 'Xưởng lớn',
        description: 'Xưởng lớn có khu gia công và kho gỗ.',
        cost: cost(5500, 400, 600),
        buildSeconds: 160,
        stats: { production: 18 },
        modelKey: 'carpentry_l3',
      },
    ],
  },
  {
    code: 'quarry',
    name: 'Mỏ đá',
    category: 'production',
    description: 'Thợ xây khai thác đá và nung gạch.',
    footprint: TWO,
    maxPerCity: null,
    levels: [
      { level: 1, name: 'Bãi đá lộ thiên', description: 'Bãi đá, xe cút kít và giàn đục.', cost: cost(900, 220, 0), buildSeconds: 35, stats: { production: 5 }, modelKey: 'quarry_l1' },
      { level: 2, name: 'Mỏ đá có lò gạch', description: 'Thêm lò nung gạch chibi và băng chuyền.', cost: cost(2400, 300, 200), buildSeconds: 80, stats: { production: 10 }, modelKey: 'quarry_l2' },
      { level: 3, name: 'Mỏ đá cơ giới', description: 'Cần cẩu gỗ, máy nghiền và kho gạch.', cost: cost(5600, 420, 500), buildSeconds: 150, stats: { production: 16 }, modelKey: 'quarry_l3' },
    ],
  },
  {
    code: 'smithy',
    name: 'Lò rèn',
    category: 'production',
    description: 'Thợ rèn làm công cụ và trang bị bảo vệ lãnh địa.',
    footprint: ONE,
    maxPerCity: null,
    levels: [
      { level: 1, name: 'Lò rèn mái tranh', description: 'Bễ thổi, đe và thùng nước.', cost: cost(1100, 160, 180), buildSeconds: 40, stats: { production: 4 }, modelKey: 'smithy_l1' },
      { level: 2, name: 'Lò rèn gạch', description: 'Ống khói gạch, giá vũ khí.', cost: cost(2800, 220, 380), buildSeconds: 90, stats: { production: 8 }, modelKey: 'smithy_l2' },
      { level: 3, name: 'Xưởng rèn lớn', description: 'Hai lò, búa máy và kho trang bị.', cost: cost(6400, 320, 700), buildSeconds: 160, stats: { production: 14 }, modelKey: 'smithy_l3' },
    ],
  },
  {
    code: 'well',
    name: 'Giếng nước',
    category: 'service',
    description: 'Cung cấp nước sạch cho cư dân.',
    footprint: ONE,
    maxPerCity: null,
    levels: [
      { level: 1, name: 'Giếng đá kéo tay', description: 'Thành giếng đá, gàu và mái nhỏ.', cost: cost(400, 80, 120), buildSeconds: 20, stats: { water: 40 }, modelKey: 'well_l1' },
      { level: 2, name: 'Giếng có tời', description: 'Tời quay và bể chứa.', cost: cost(1000, 120, 220), buildSeconds: 45, stats: { water: 80 }, modelKey: 'well_l2' },
      { level: 3, name: 'Trạm bơm nước', description: 'Bơm tay, bồn nước trên tháp.', cost: cost(2600, 200, 380), buildSeconds: 90, stats: { water: 140 }, modelKey: 'well_l3' },
    ],
  },
  {
    code: 'road',
    name: 'Đường đi',
    category: 'infrastructure',
    description: 'Lối đi rộng 1,2 m theo cạnh ô, nối cửa và chạy ven công trình; không chiếm cả ô đất.',
    footprint: ONE,
    maxPerCity: null,
    levels: [
      { level: 1, name: 'Đường đất', description: 'Đường đất nện.', cost: cost(20, 4, 0), buildSeconds: 3, stats: { speed: 1.4 }, modelKey: 'road_l1' },
      { level: 2, name: 'Đường sỏi', description: 'Sỏi đá viền gỗ.', cost: cost(60, 4, 10), buildSeconds: 6, stats: { speed: 1.7 }, modelKey: 'road_l2' },
      { level: 3, name: 'Đường lát đá', description: 'Lối đá lát hẹp có viền, nối liền các đoạn đường.', cost: cost(150, 6, 24), buildSeconds: 10, stats: { speed: 2 }, modelKey: 'road_l3' },
    ],
  },
  {
    code: 'sword_barracks',
    name: 'Doanh trại đao',
    category: 'military',
    description: 'Huấn luyện đao binh: đao, khiên, cận chiến bảo vệ đội hình.',
    footprint: SIX,
    maxPerCity: null,
    levels: [
      { level: 1, name: 'Trại đao lều gỗ', description: 'Lều lính gỗ, sân tập đất, hình nộm và giá vũ khí đơn giản.', cost: cost(1400, 308, 84), buildSeconds: 60, stats: { training: 2 }, modelKey: 'sword_barracks_l1' },
      { level: 2, name: 'Trại đao nhà gạch', description: 'Nhà gạch mái ngói, khu nghỉ, nhiều hình nộm và dụng cụ.', cost: cost(3500, 420, 560), buildSeconds: 120, stats: { training: 4 }, modelKey: 'sword_barracks_l2' },
      { level: 3, name: 'Thành trại đao', description: 'Doanh trại kiên cố hai tầng, sân lát đá, cờ hiệu và tháp quan sát.', cost: cost(8400, 630, 1120), buildSeconds: 200, stats: { training: 6 }, modelKey: 'sword_barracks_l3' },
    ],
  },
  {
    code: 'spear_barracks',
    name: 'Doanh trại thương',
    category: 'military',
    description: 'Huấn luyện thương binh: giữ đội hình, chặn kẻ lao vào.',
    footprint: SIX,
    maxPerCity: null,
    levels: [
      { level: 1, name: 'Trại thương lều gỗ', description: 'Lều lính gỗ, sân tập đất, hình nộm và giá vũ khí đơn giản.', cost: cost(1400, 308, 84), buildSeconds: 60, stats: { training: 2 }, modelKey: 'spear_barracks_l1' },
      { level: 2, name: 'Trại thương nhà gạch', description: 'Nhà gạch mái ngói, khu nghỉ, nhiều hình nộm và dụng cụ.', cost: cost(3500, 420, 560), buildSeconds: 120, stats: { training: 4 }, modelKey: 'spear_barracks_l2' },
      { level: 3, name: 'Thành trại thương', description: 'Doanh trại kiên cố hai tầng, sân lát đá, cờ hiệu và tháp quan sát.', cost: cost(8400, 630, 1120), buildSeconds: 200, stats: { training: 6 }, modelKey: 'spear_barracks_l3' },
    ],
  },
  {
    code: 'archery_range',
    name: 'Trường cung',
    category: 'military',
    description: 'Huấn luyện cung binh: bắn xa, cơ động.',
    footprint: SIX,
    maxPerCity: null,
    levels: [
      { level: 1, name: 'Trường cung đất', description: 'Lều lính gỗ, sân tập đất, hình nộm và giá vũ khí đơn giản.', cost: cost(1500, 330, 90), buildSeconds: 60, stats: { training: 2 }, modelKey: 'archery_range_l1' },
      { level: 2, name: 'Trường cung mái ngói', description: 'Nhà gạch mái ngói, khu nghỉ, nhiều hình nộm và dụng cụ.', cost: cost(3750, 450, 600), buildSeconds: 120, stats: { training: 4 }, modelKey: 'archery_range_l2' },
      { level: 3, name: 'Trường cung kiên cố', description: 'Doanh trại kiên cố hai tầng, sân lát đá, cờ hiệu và tháp quan sát.', cost: cost(9000, 675, 1200), buildSeconds: 200, stats: { training: 6 }, modelKey: 'archery_range_l3' },
    ],
  },
  {
    code: 'crossbow_range',
    name: 'Trường nỏ',
    category: 'military',
    description: 'Huấn luyện nỏ binh: xuyên giáp, nạp chậm.',
    footprint: SIX,
    maxPerCity: null,
    levels: [
      { level: 1, name: 'Trường nỏ đất', description: 'Lều lính gỗ, sân tập đất, hình nộm và giá vũ khí đơn giản.', cost: cost(1700, 374, 102), buildSeconds: 60, stats: { training: 2 }, modelKey: 'crossbow_range_l1' },
      { level: 2, name: 'Trường nỏ mái ngói', description: 'Nhà gạch mái ngói, khu nghỉ, nhiều hình nộm và dụng cụ.', cost: cost(4250, 510, 680), buildSeconds: 120, stats: { training: 4 }, modelKey: 'crossbow_range_l2' },
      { level: 3, name: 'Trường nỏ kiên cố', description: 'Doanh trại kiên cố hai tầng, sân lát đá, cờ hiệu và tháp quan sát.', cost: cost(10200, 765, 1360), buildSeconds: 200, stats: { training: 6 }, modelKey: 'crossbow_range_l3' },
    ],
  },
  {
    code: 'military_forge',
    name: 'Lò rèn quân sự',
    category: 'military',
    description: 'Thợ rèn chế tạo đao, khiên, thương, cung, nỏ, tên và giáp.',
    footprint: SIX,
    maxPerCity: null,
    levels: [
      { level: 1, name: 'Xưởng rèn lều', description: 'Lều lính gỗ, sân tập đất, hình nộm và giá vũ khí đơn giản.', cost: cost(1600, 352, 96), buildSeconds: 60, stats: { production: 6 }, modelKey: 'military_forge_l1' },
      { level: 2, name: 'Xưởng rèn gạch', description: 'Nhà gạch mái ngói, khu nghỉ, nhiều hình nộm và dụng cụ.', cost: cost(4000, 480, 640), buildSeconds: 120, stats: { production: 12 }, modelKey: 'military_forge_l2' },
      { level: 3, name: 'Quân giới xưởng', description: 'Doanh trại kiên cố hai tầng, sân lát đá, cờ hiệu và tháp quan sát.', cost: cost(9600, 720, 1280), buildSeconds: 200, stats: { production: 18 }, modelKey: 'military_forge_l3' },
    ],
  },
  {
    code: 'training_ground',
    name: 'Trường huấn luyện tổng hợp',
    category: 'military',
    description: 'Thao luyện đội hình mọi binh chủng — lính lên cấp nhanh hơn.',
    footprint: NINE,
    maxPerCity: null,
    levels: [
      { level: 1, name: 'Bãi tập đất', description: 'Lều lính gỗ, sân tập đất, hình nộm và giá vũ khí đơn giản.', cost: cost(2200, 484, 132), buildSeconds: 60, stats: { training: 4 }, modelKey: 'training_ground_l1' },
      { level: 2, name: 'Thao trường', description: 'Nhà gạch mái ngói, khu nghỉ, nhiều hình nộm và dụng cụ.', cost: cost(5500, 660, 880), buildSeconds: 120, stats: { training: 8 }, modelKey: 'training_ground_l2' },
      { level: 3, name: 'Đại thao trường', description: 'Doanh trại kiên cố hai tầng, sân lát đá, cờ hiệu và tháp quan sát.', cost: cost(13200, 990, 1760), buildSeconds: 200, stats: { training: 12 }, modelKey: 'training_ground_l3' },
    ],
  },
  {
    code: 'military_depot',
    name: 'Kho quân nhu',
    category: 'military',
    description: 'Chứa vũ khí, giáp và lương thực quân đội.',
    footprint: SIX,
    maxPerCity: null,
    levels: [
      { level: 1, name: 'Kho quân nhu gỗ', description: 'Lều lính gỗ, sân tập đất, hình nộm và giá vũ khí đơn giản.', cost: cost(1200, 264, 72), buildSeconds: 60, stats: { storage: 1500 }, modelKey: 'military_depot_l1' },
      { level: 2, name: 'Kho quân nhu gạch', description: 'Nhà gạch mái ngói, khu nghỉ, nhiều hình nộm và dụng cụ.', cost: cost(3000, 360, 480), buildSeconds: 120, stats: { storage: 3500 }, modelKey: 'military_depot_l2' },
      { level: 3, name: 'Đại kho quân nhu', description: 'Doanh trại kiên cố hai tầng, sân lát đá, cờ hiệu và tháp quan sát.', cost: cost(7200, 540, 960), buildSeconds: 200, stats: { storage: 7000 }, modelKey: 'military_depot_l3' },
    ],
  },
];

const BY_CODE = new Map(BUILDING_DEFINITIONS.map((d) => [d.code, d]));

export function isBuildingTypeCode(code: string): code is BuildingTypeCode {
  return BY_CODE.has(code as BuildingTypeCode);
}

export function getBuildingDefinition(code: BuildingTypeCode): BuildingDefinition {
  const def = BY_CODE.get(code);
  if (!def) throw new Error(`Unknown building type: ${code}`);
  return def;
}

export function getBuildingLevel(code: BuildingTypeCode, level: number): BuildingLevelDefinition | null {
  return getBuildingDefinition(code).levels.find((l) => l.level === level) ?? null;
}

export function getMaxLevel(code: BuildingTypeCode): number {
  return getBuildingDefinition(code).levels.length;
}

export function emptyResources(): ResourceBag {
  return { coins: 0, wood: 0, stone: 0 };
}

export function addResources(a: ResourceBag, b: ResourceBag, factor = 1): ResourceBag {
  return {
    coins: a.coins + Math.floor(b.coins * factor),
    wood: a.wood + Math.floor(b.wood * factor),
    stone: a.stone + Math.floor(b.stone * factor),
  };
}

/** Resource codes the player is short of (empty when affordable). */
export function missingResources(have: ResourceBag, need: ResourceBag): ResourceCode[] {
  return RESOURCE_CODES.filter((c) => have[c] < need[c]);
}
