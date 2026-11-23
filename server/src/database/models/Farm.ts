/**
 * Agriculture models:
 *  crop_types           – crop catalogue (seeded from @cityverse/shared)
 *  farm_zones           – a connected group of ≥ 6 hexes of one zone type (level 1..3)
 *  farm_zone_tiles      – one row per hex; UNIQUE(city_id, q, r) — zones can never overlap
 *  crop_cycles          – planting → growth → harvest (growth data lives on the backend)
 *  irrigation_networks  – water supply evaluation per zone (canal / pump, source, supply)
 */
import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from 'sequelize';
import type {
  CropCycleStatus,
  CropStageDefinition,
  CropTypeCode,
  FarmZoneStatus,
  FarmZoneTypeCode,
  IrrigationKind,
  ProduceCode,
  ResourceBag,
  WaterSourceType,
} from '@cityverse/shared';
import { jsonColumn } from './Building.js';

const timestamps = {
  createdAt: { type: DataTypes.DATE, allowNull: false, field: 'created_at' },
  updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updated_at' },
};

const floatColumn = (field: string, defaultValue = 0) => ({
  type: DataTypes.FLOAT,
  allowNull: false,
  defaultValue,
  field,
});

export class CropType extends Model<InferAttributes<CropType>, InferCreationAttributes<CropType>> {
  declare code: CropTypeCode;
  declare name: string;
  declare zoneType: FarmZoneTypeCode;
  declare produce: ProduceCode;
  declare growSeconds: number;
  declare yieldPerHex: number;
  declare waterNeed: number;
  declare seedCostPerHex: ResourceBag;
  declare stages: CropStageDefinition[];
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export class FarmZone extends Model<InferAttributes<FarmZone>, InferCreationAttributes<FarmZone>> {
  declare id: CreationOptional<string>;
  declare cityId: string;
  declare zoneType: FarmZoneTypeCode;
  declare level: number;
  declare status: FarmZoneStatus;
  declare upgradeStartedAt: CreationOptional<Date | null>;
  declare upgradeFinishesAt: CreationOptional<Date | null>;
  declare createdBy: string;
  /** Cumulative resources spent (creation + expansions + upgrades) — basis for refunds. */
  declare invested: ResourceBag;
  declare totalHarvested: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export class FarmZoneTile extends Model<InferAttributes<FarmZoneTile>, InferCreationAttributes<FarmZoneTile>> {
  declare id: CreationOptional<string>;
  declare cityId: string;
  declare zoneId: string;
  declare q: number;
  declare r: number;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export class CropCycle extends Model<InferAttributes<CropCycle>, InferCreationAttributes<CropCycle>> {
  declare id: CreationOptional<string>;
  declare cityId: string;
  declare zoneId: string;
  declare cropCode: CropTypeCode;
  declare zoneLevel: number;
  declare hexCount: number;
  declare plantedAt: Date;
  declare readyAt: Date;
  declare expectedYield: number;
  declare waterFactor: number;
  declare seedCost: ResourceBag;
  declare status: CropCycleStatus;
  declare harvestedAt: CreationOptional<Date | null>;
  declare harvestedAmount: CreationOptional<number | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export class IrrigationNetwork extends Model<
  InferAttributes<IrrigationNetwork>,
  InferCreationAttributes<IrrigationNetwork>
> {
  declare id: CreationOptional<string>;
  declare cityId: string;
  declare zoneId: string;
  declare kind: IrrigationKind;
  declare sourceType: WaterSourceType;
  declare sourceQ: number | null;
  declare sourceR: number | null;
  declare sourceDistance: number | null;
  declare naturalSupply: number;
  declare supply: number;
  declare fertility: number;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initFarmModels(sequelize: Sequelize) {
  CropType.init(
    {
      code: { type: DataTypes.STRING(32), primaryKey: true },
      name: { type: DataTypes.STRING(120), allowNull: false },
      zoneType: { type: DataTypes.STRING(32), allowNull: false, field: 'zone_type' },
      produce: { type: DataTypes.STRING(32), allowNull: false },
      growSeconds: { type: DataTypes.INTEGER, allowNull: false, field: 'grow_seconds' },
      yieldPerHex: { type: DataTypes.INTEGER, allowNull: false, field: 'yield_per_hex' },
      waterNeed: floatColumn('water_need'),
      seedCostPerHex: jsonColumn<ResourceBag>('seed_cost_per_hex', { coins: 0, wood: 0, stone: 0 }),
      stages: jsonColumn<CropStageDefinition[]>('stages', []),
      ...timestamps,
    },
    { sequelize, tableName: 'crop_types', modelName: 'CropType', underscored: true }
  );

  FarmZone.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      cityId: { type: DataTypes.UUID, allowNull: false, field: 'city_id' },
      zoneType: { type: DataTypes.STRING(32), allowNull: false, field: 'zone_type' },
      level: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'active' },
      upgradeStartedAt: { type: DataTypes.DATE, allowNull: true, defaultValue: null, field: 'upgrade_started_at' },
      upgradeFinishesAt: { type: DataTypes.DATE, allowNull: true, defaultValue: null, field: 'upgrade_finishes_at' },
      createdBy: { type: DataTypes.UUID, allowNull: false, field: 'created_by' },
      invested: jsonColumn<ResourceBag>('invested', { coins: 0, wood: 0, stone: 0 }),
      totalHarvested: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'total_harvested' },
      ...timestamps,
    },
    {
      sequelize,
      tableName: 'farm_zones',
      modelName: 'FarmZone',
      underscored: true,
      indexes: [{ fields: ['city_id'], name: 'idx_farm_zones_city' }],
    }
  );

  FarmZoneTile.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      cityId: { type: DataTypes.UUID, allowNull: false, field: 'city_id' },
      zoneId: { type: DataTypes.UUID, allowNull: false, field: 'zone_id' },
      q: { type: DataTypes.INTEGER, allowNull: false },
      r: { type: DataTypes.INTEGER, allowNull: false },
      ...timestamps,
    },
    {
      sequelize,
      tableName: 'farm_zone_tiles',
      modelName: 'FarmZoneTile',
      underscored: true,
      indexes: [
        { unique: true, fields: ['city_id', 'q', 'r'], name: 'uq_farm_zone_tiles_city_hex' },
        { fields: ['zone_id'], name: 'idx_farm_zone_tiles_zone' },
      ],
    }
  );

  CropCycle.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      cityId: { type: DataTypes.UUID, allowNull: false, field: 'city_id' },
      zoneId: { type: DataTypes.UUID, allowNull: false, field: 'zone_id' },
      cropCode: { type: DataTypes.STRING(32), allowNull: false, field: 'crop_code' },
      zoneLevel: { type: DataTypes.INTEGER, allowNull: false, field: 'zone_level' },
      hexCount: { type: DataTypes.INTEGER, allowNull: false, field: 'hex_count' },
      plantedAt: { type: DataTypes.DATE, allowNull: false, field: 'planted_at' },
      readyAt: { type: DataTypes.DATE, allowNull: false, field: 'ready_at' },
      expectedYield: { type: DataTypes.INTEGER, allowNull: false, field: 'expected_yield' },
      waterFactor: floatColumn('water_factor', 1),
      seedCost: jsonColumn<ResourceBag>('seed_cost', { coins: 0, wood: 0, stone: 0 }),
      status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'growing' },
      harvestedAt: { type: DataTypes.DATE, allowNull: true, defaultValue: null, field: 'harvested_at' },
      harvestedAmount: { type: DataTypes.INTEGER, allowNull: true, defaultValue: null, field: 'harvested_amount' },
      ...timestamps,
    },
    {
      sequelize,
      tableName: 'crop_cycles',
      modelName: 'CropCycle',
      underscored: true,
      indexes: [
        { fields: ['zone_id', 'status'], name: 'idx_crop_cycles_zone_status' },
        { fields: ['city_id'], name: 'idx_crop_cycles_city' },
      ],
    }
  );

  IrrigationNetwork.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      cityId: { type: DataTypes.UUID, allowNull: false, field: 'city_id' },
      zoneId: { type: DataTypes.UUID, allowNull: false, field: 'zone_id' },
      kind: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'none' },
      sourceType: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'rain', field: 'source_type' },
      sourceQ: { type: DataTypes.INTEGER, allowNull: true, field: 'source_q' },
      sourceR: { type: DataTypes.INTEGER, allowNull: true, field: 'source_r' },
      sourceDistance: { type: DataTypes.INTEGER, allowNull: true, field: 'source_distance' },
      naturalSupply: floatColumn('natural_supply'),
      supply: floatColumn('supply'),
      fertility: floatColumn('fertility', 1),
      ...timestamps,
    },
    {
      sequelize,
      tableName: 'irrigation_networks',
      modelName: 'IrrigationNetwork',
      underscored: true,
      indexes: [{ unique: true, fields: ['zone_id'], name: 'uq_irrigation_networks_zone' }],
    }
  );

  return { CropType, FarmZone, FarmZoneTile, CropCycle, IrrigationNetwork };
}
