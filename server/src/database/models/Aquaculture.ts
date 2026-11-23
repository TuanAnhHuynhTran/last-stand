/**
 * Aquaculture models (Phase 6):
 *  fish_species           – species catalogue (seeded from @cityverse/shared)
 *  water_bodies           – a pond / lake / hatchery / cage zone: water surface & bed heights, area,
 *                           volume, water level & quality, feeder, filling, simulation clock. Its land,
 *                           level, status and invested resources live on its world_buildings row
 *                           (building_id) and its hexes in building_footprints.
 *  water_body_tiles       – every hex of the water body with its seed height and dug bed height
 *                           (the terrain edit the client re-applies on top of the world seed)
 *  fish_stock_batches     – fish released together: species, source, stocked / alive, weight, health
 *  aquaculture_cycles     – one farming cycle (stocking → growing → harvest) with its totals
 *  water_quality_records  – sampled history of water quality, level, density and feed
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
  AquacultureCycleStatus,
  FishBatchStatus,
  FishSpeciesCode,
  WaterBodyTypeCode,
} from '@cityverse/shared';
import { jsonColumn } from './Building.js';

const timestamps = {
  createdAt: { type: DataTypes.DATE, allowNull: false, field: 'created_at' },
  updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updated_at' },
};
const uuid = (field: string) => ({ type: DataTypes.UUID, allowNull: false, field });
const float = (field: string, defaultValue = 0) => ({ type: DataTypes.FLOAT, allowNull: false, defaultValue, field });
const date = (field: string) => ({ type: DataTypes.DATE, allowNull: true, defaultValue: null, field });

export class FishSpecies extends Model<InferAttributes<FishSpecies>, InferCreationAttributes<FishSpecies>> {
  declare code: FishSpeciesCode;
  declare name: string;
  declare description: string;
  declare fryPrice: number;
  declare fryWeight: number;
  declare marketWeight: number;
  declare fingerlingWeight: number;
  declare growSeconds: number;
  declare feedRate: number;
  declare minQuality: number;
  declare colors: Record<string, string>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export class WaterBody extends Model<InferAttributes<WaterBody>, InferCreationAttributes<WaterBody>> {
  declare id: CreationOptional<string>;
  declare cityId: string;
  declare buildingId: string;
  declare type: WaterBodyTypeCode;
  declare surfaceHeight: number;
  declare bottomHeight: number;
  declare area: number;
  declare volume: number;
  declare shoreline: number;
  declare waterLevel: number;
  declare waterQuality: number;
  declare feedStock: CreationOptional<number>;
  declare feedQuality: CreationOptional<number>;
  declare fillStartedAt: CreationOptional<Date | null>;
  declare fillFinishesAt: CreationOptional<Date | null>;
  declare readyAt: CreationOptional<Date | null>;
  declare lastSimulatedAt: Date;
  declare totalHarvested: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export class WaterBodyTile extends Model<InferAttributes<WaterBodyTile>, InferCreationAttributes<WaterBodyTile>> {
  declare id: CreationOptional<string>;
  declare cityId: string;
  declare waterBodyId: string;
  declare q: number;
  declare r: number;
  /** Seed terrain height at the hex centre before digging */
  declare originalHeight: number;
  /** Height at the hex centre after digging (bed or bank) */
  declare bedHeight: number;
  /** Hex touches the shore (has a neighbour outside the water body) */
  declare shore: boolean;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export class FishStockBatch extends Model<InferAttributes<FishStockBatch>, InferCreationAttributes<FishStockBatch>> {
  declare id: CreationOptional<string>;
  declare cityId: string;
  declare waterBodyId: string;
  declare cycleId: string;
  declare speciesCode: FishSpeciesCode;
  declare source: 'market' | 'hatchery';
  declare stocked: number;
  declare alive: number;
  declare weight: number;
  declare health: number;
  declare satiety: number;
  declare status: FishBatchStatus;
  declare stockedAt: Date;
  declare harvestedAt: CreationOptional<Date | null>;
  declare harvestYield: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export class AquacultureCycle extends Model<InferAttributes<AquacultureCycle>, InferCreationAttributes<AquacultureCycle>> {
  declare id: CreationOptional<string>;
  declare cityId: string;
  declare waterBodyId: string;
  declare status: AquacultureCycleStatus;
  declare startedAt: Date;
  declare harvestedAt: CreationOptional<Date | null>;
  declare stockedFish: CreationOptional<number>;
  declare feedUsed: CreationOptional<number>;
  declare harvested: Record<string, number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export class WaterQualityRecord extends Model<InferAttributes<WaterQualityRecord>, InferCreationAttributes<WaterQualityRecord>> {
  declare id: CreationOptional<string>;
  declare cityId: string;
  declare waterBodyId: string;
  declare recordedAt: Date;
  declare quality: number;
  declare waterLevel: number;
  declare density: number;
  declare feedStock: number;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initAquacultureModels(sequelize: Sequelize) {
  FishSpecies.init(
    {
      code: { type: DataTypes.STRING(32), primaryKey: true },
      name: { type: DataTypes.STRING(120), allowNull: false },
      description: { type: DataTypes.STRING(500), allowNull: false, defaultValue: '' },
      fryPrice: { type: DataTypes.INTEGER, allowNull: false, field: 'fry_price' },
      fryWeight: float('fry_weight'),
      marketWeight: float('market_weight'),
      fingerlingWeight: float('fingerling_weight'),
      growSeconds: { type: DataTypes.INTEGER, allowNull: false, field: 'grow_seconds' },
      feedRate: float('feed_rate'),
      minQuality: float('min_quality'),
      colors: jsonColumn<Record<string, string>>('colors', {}),
      ...timestamps,
    },
    { sequelize, tableName: 'fish_species', modelName: 'FishSpecies', underscored: true }
  );

  WaterBody.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      cityId: uuid('city_id'),
      buildingId: { ...uuid('building_id'), unique: 'uq_water_bodies_building' },
      type: { type: DataTypes.STRING(32), allowNull: false },
      surfaceHeight: float('surface_height'),
      bottomHeight: float('bottom_height'),
      area: float('area'),
      volume: float('volume'),
      shoreline: float('shoreline'),
      waterLevel: float('water_level'),
      waterQuality: float('water_quality', 0.7),
      feedStock: float('feed_stock'),
      feedQuality: float('feed_quality'),
      fillStartedAt: date('fill_started_at'),
      fillFinishesAt: date('fill_finishes_at'),
      readyAt: date('ready_at'),
      lastSimulatedAt: { type: DataTypes.DATE, allowNull: false, field: 'last_simulated_at' },
      totalHarvested: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'total_harvested' },
      ...timestamps,
    },
    {
      sequelize,
      tableName: 'water_bodies',
      modelName: 'WaterBody',
      underscored: true,
      indexes: [{ fields: ['city_id'], name: 'idx_water_bodies_city' }],
    }
  );

  WaterBodyTile.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      cityId: uuid('city_id'),
      waterBodyId: uuid('water_body_id'),
      q: { type: DataTypes.INTEGER, allowNull: false },
      r: { type: DataTypes.INTEGER, allowNull: false },
      originalHeight: float('original_height'),
      bedHeight: float('bed_height'),
      shore: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      ...timestamps,
    },
    {
      sequelize,
      tableName: 'water_body_tiles',
      modelName: 'WaterBodyTile',
      underscored: true,
      indexes: [
        { unique: true, fields: ['water_body_id', 'q', 'r'], name: 'uq_water_body_tiles_body_hex' },
        { fields: ['city_id'], name: 'idx_water_body_tiles_city' },
      ],
    }
  );

  FishStockBatch.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      cityId: uuid('city_id'),
      waterBodyId: uuid('water_body_id'),
      cycleId: uuid('cycle_id'),
      speciesCode: { type: DataTypes.STRING(32), allowNull: false, field: 'species_code' },
      source: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'market' },
      stocked: { type: DataTypes.INTEGER, allowNull: false },
      alive: float('alive'),
      weight: float('weight'),
      health: float('health', 1),
      satiety: float('satiety', 0.8),
      status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'growing' },
      stockedAt: { type: DataTypes.DATE, allowNull: false, field: 'stocked_at' },
      harvestedAt: date('harvested_at'),
      harvestYield: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'harvest_yield' },
      ...timestamps,
    },
    {
      sequelize,
      tableName: 'fish_stock_batches',
      modelName: 'FishStockBatch',
      underscored: true,
      indexes: [
        { fields: ['water_body_id', 'status'], name: 'idx_fish_batches_body_status' },
        { fields: ['city_id'], name: 'idx_fish_batches_city' },
      ],
    }
  );

  AquacultureCycle.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      cityId: uuid('city_id'),
      waterBodyId: uuid('water_body_id'),
      status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'active' },
      startedAt: { type: DataTypes.DATE, allowNull: false, field: 'started_at' },
      harvestedAt: date('harvested_at'),
      stockedFish: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'stocked_fish' },
      feedUsed: float('feed_used'),
      harvested: jsonColumn<Record<string, number>>('harvested', {}),
      ...timestamps,
    },
    {
      sequelize,
      tableName: 'aquaculture_cycles',
      modelName: 'AquacultureCycle',
      underscored: true,
      indexes: [{ fields: ['water_body_id', 'status'], name: 'idx_aqua_cycles_body_status' }],
    }
  );

  WaterQualityRecord.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      cityId: uuid('city_id'),
      waterBodyId: uuid('water_body_id'),
      recordedAt: { type: DataTypes.DATE, allowNull: false, field: 'recorded_at' },
      quality: float('quality'),
      waterLevel: float('water_level'),
      density: float('density'),
      feedStock: float('feed_stock'),
      ...timestamps,
    },
    {
      sequelize,
      tableName: 'water_quality_records',
      modelName: 'WaterQualityRecord',
      underscored: true,
      indexes: [{ fields: ['water_body_id', 'recorded_at'], name: 'idx_water_quality_body_time' }],
    }
  );

  return { FishSpecies, WaterBody, WaterBodyTile, FishStockBatch, AquacultureCycle, WaterQualityRecord };
}
