/**
 * Livestock models (Phase 5):
 *  animal_species              – species catalogue: growth, lifespan, intake, products, breeds (seeded from @cityverse/shared)
 *  animal_feed_recipes         – produce → nutrition recipes (seeded from @cityverse/shared)
 *  livestock_farms             – ranch state (feed / water stores, caretakers, simulation clock). The land, level,
 *                                status and invested resources live on its world_buildings row (building_id), and
 *                                its hexes in building_footprints — the one land-claim system shared with buildings.
 *  livestock_farm_tiles        – role of each hex of the farm (barn, yard, feeder, water, caretaker, storage, …)
 *  farm_animals                – each animal: species, breed, age, health, satiety, thirst, status, farm
 *  livestock_production_jobs   – production batches (in_progress → ready → collected) and breeding jobs
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
  AnimalBreedDefinition,
  AnimalStatus,
  AnimalTypeCode,
  FeedRecipeCode,
  LivestockFarmTypeCode,
  LivestockJobStatus,
  LivestockJobType,
  ProduceCode,
  ProductAmounts,
  RanchTileRole,
  WaterSource,
} from '@cityverse/shared';
import { jsonColumn } from './Building.js';

const timestamps = {
  createdAt: { type: DataTypes.DATE, allowNull: false, field: 'created_at' },
  updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updated_at' },
};

export class AnimalSpecies extends Model<InferAttributes<AnimalSpecies>, InferCreationAttributes<AnimalSpecies>> {
  declare code: AnimalTypeCode;
  declare name: string;
  declare farmType: LivestockFarmTypeCode;
  declare price: number;
  declare growSeconds: number;
  declare lifespanSeconds: number;
  declare capacityPerHex: number;
  declare feedPerMinute: number;
  declare waterPerMinute: number;
  declare products: ProductAmounts;
  declare meatYield: number;
  declare productionSeconds: number;
  declare breedSeconds: number;
  declare animalsPerCaretaker: number;
  declare breeds: AnimalBreedDefinition[];
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export class AnimalFeedRecipe extends Model<InferAttributes<AnimalFeedRecipe>, InferCreationAttributes<AnimalFeedRecipe>> {
  declare code: FeedRecipeCode;
  declare name: string;
  declare description: string;
  declare ingredients: Partial<Record<ProduceCode, number>>;
  declare nutrition: number;
  declare quality: number;
  declare species: AnimalTypeCode[];
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export class LivestockFarm extends Model<InferAttributes<LivestockFarm>, InferCreationAttributes<LivestockFarm>> {
  declare id: CreationOptional<string>;
  declare cityId: string;
  declare buildingId: string;
  declare farmType: LivestockFarmTypeCode;
  declare feedStock: CreationOptional<number>;
  declare feedQuality: CreationOptional<number>;
  declare waterStock: CreationOptional<number>;
  declare waterSource: WaterSource;
  declare caretakers: CreationOptional<number>;
  declare lastSimulatedAt: Date;
  declare totalProduced: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export class LivestockFarmTile extends Model<InferAttributes<LivestockFarmTile>, InferCreationAttributes<LivestockFarmTile>> {
  declare id: CreationOptional<string>;
  declare cityId: string;
  declare farmId: string;
  declare q: number;
  declare r: number;
  declare role: RanchTileRole;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export class FarmAnimal extends Model<InferAttributes<FarmAnimal>, InferCreationAttributes<FarmAnimal>> {
  declare id: CreationOptional<string>;
  declare cityId: string;
  declare farmId: string;
  declare speciesCode: AnimalTypeCode;
  declare breed: string;
  declare name: string;
  declare bornAt: Date;
  declare growsUpAt: Date;
  declare health: number;
  declare satiety: number;
  declare thirst: number;
  declare status: AnimalStatus;
  /** Phase 9 working-animal traits (horses / elephants; 0 for other livestock) */
  declare tameness: CreationOptional<number>;
  declare stamina: CreationOptional<number>;
  declare speedBonus: CreationOptional<number>;
  declare carryBonus: CreationOptional<number>;
  declare trainingLevel: CreationOptional<number>;
  /** Seconds starving at minimum health (starvation limit) */
  declare starvingSeconds: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export class LivestockProductionJob extends Model<
  InferAttributes<LivestockProductionJob>,
  InferCreationAttributes<LivestockProductionJob>
> {
  declare id: CreationOptional<string>;
  declare cityId: string;
  declare farmId: string;
  declare jobType: LivestockJobType;
  declare speciesCode: AnimalTypeCode | null;
  declare breed: string | null;
  declare startedAt: Date;
  declare finishesAt: Date;
  declare status: LivestockJobStatus;
  declare progress: ProductAmounts;
  declare output: ProductAmounts;
  declare efficiency: CreationOptional<number>;
  /** Σ productivity·dt and Σ adult·dt of the batch (its running efficiency) */
  declare productiveSeconds: CreationOptional<number>;
  declare animalSeconds: CreationOptional<number>;
  declare completedAt: CreationOptional<Date | null>;
  declare collectedAt: CreationOptional<Date | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initLivestockModels(sequelize: Sequelize) {
  AnimalSpecies.init(
    {
      code: { type: DataTypes.STRING(32), primaryKey: true },
      name: { type: DataTypes.STRING(120), allowNull: false },
      farmType: { type: DataTypes.STRING(32), allowNull: false, field: 'farm_type' },
      price: { type: DataTypes.INTEGER, allowNull: false },
      growSeconds: { type: DataTypes.INTEGER, allowNull: false, field: 'grow_seconds' },
      lifespanSeconds: { type: DataTypes.INTEGER, allowNull: false, field: 'lifespan_seconds' },
      capacityPerHex: { type: DataTypes.FLOAT, allowNull: false, field: 'capacity_per_hex' },
      feedPerMinute: { type: DataTypes.FLOAT, allowNull: false, field: 'feed_per_minute' },
      waterPerMinute: { type: DataTypes.FLOAT, allowNull: false, field: 'water_per_minute' },
      products: jsonColumn<ProductAmounts>('products', {}),
      meatYield: { type: DataTypes.INTEGER, allowNull: false, field: 'meat_yield' },
      productionSeconds: { type: DataTypes.INTEGER, allowNull: false, field: 'production_seconds' },
      breedSeconds: { type: DataTypes.INTEGER, allowNull: false, field: 'breed_seconds' },
      animalsPerCaretaker: { type: DataTypes.INTEGER, allowNull: false, field: 'animals_per_caretaker' },
      breeds: jsonColumn<AnimalBreedDefinition[]>('breeds', []),
      ...timestamps,
    },
    { sequelize, tableName: 'animal_species', modelName: 'AnimalSpecies', underscored: true }
  );

  AnimalFeedRecipe.init(
    {
      code: { type: DataTypes.STRING(32), primaryKey: true },
      name: { type: DataTypes.STRING(120), allowNull: false },
      description: { type: DataTypes.STRING(500), allowNull: false, defaultValue: '' },
      ingredients: jsonColumn<Record<string, number>>('ingredients', {}),
      nutrition: { type: DataTypes.INTEGER, allowNull: false },
      quality: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
      species: jsonColumn<string[]>('species', []),
      ...timestamps,
    },
    { sequelize, tableName: 'animal_feed_recipes', modelName: 'AnimalFeedRecipe', underscored: true }
  );

  LivestockFarm.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      cityId: { type: DataTypes.UUID, allowNull: false, field: 'city_id' },
      buildingId: { type: DataTypes.UUID, allowNull: false, unique: 'uq_livestock_farms_building', field: 'building_id' },
      farmType: { type: DataTypes.STRING(32), allowNull: false, field: 'farm_type' },
      feedStock: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0, field: 'feed_stock' },
      feedQuality: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0, field: 'feed_quality' },
      waterStock: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0, field: 'water_stock' },
      waterSource: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'well', field: 'water_source' },
      caretakers: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      lastSimulatedAt: { type: DataTypes.DATE, allowNull: false, field: 'last_simulated_at' },
      totalProduced: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'total_produced' },
      ...timestamps,
    },
    {
      sequelize,
      tableName: 'livestock_farms',
      modelName: 'LivestockFarm',
      underscored: true,
      indexes: [{ fields: ['city_id'], name: 'idx_livestock_farms_city' }],
    }
  );

  LivestockFarmTile.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      cityId: { type: DataTypes.UUID, allowNull: false, field: 'city_id' },
      farmId: { type: DataTypes.UUID, allowNull: false, field: 'farm_id' },
      q: { type: DataTypes.INTEGER, allowNull: false },
      r: { type: DataTypes.INTEGER, allowNull: false },
      role: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'yard' },
      ...timestamps,
    },
    {
      sequelize,
      tableName: 'livestock_farm_tiles',
      modelName: 'LivestockFarmTile',
      underscored: true,
      indexes: [
        { unique: true, fields: ['farm_id', 'q', 'r'], name: 'uq_livestock_farm_tiles_farm_hex' },
        { fields: ['city_id'], name: 'idx_livestock_farm_tiles_city' },
      ],
    }
  );

  FarmAnimal.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      cityId: { type: DataTypes.UUID, allowNull: false, field: 'city_id' },
      farmId: { type: DataTypes.UUID, allowNull: false, field: 'farm_id' },
      speciesCode: { type: DataTypes.STRING(32), allowNull: false, field: 'species_code' },
      breed: { type: DataTypes.STRING(32), allowNull: false },
      name: { type: DataTypes.STRING(40), allowNull: false },
      bornAt: { type: DataTypes.DATE, allowNull: false, field: 'born_at' },
      growsUpAt: { type: DataTypes.DATE, allowNull: false, field: 'grows_up_at' },
      health: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 1 },
      satiety: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 1 },
      thirst: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
      status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'young' },
      tameness: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
      stamina: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
      speedBonus: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0, field: 'speed_bonus' },
      carryBonus: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0, field: 'carry_bonus' },
      trainingLevel: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'training_level' },
      starvingSeconds: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0, field: 'starving_seconds' },
      ...timestamps,
    },
    {
      sequelize,
      tableName: 'farm_animals',
      modelName: 'FarmAnimal',
      underscored: true,
      indexes: [
        { fields: ['farm_id'], name: 'idx_farm_animals_farm' },
        { fields: ['city_id'], name: 'idx_farm_animals_city' },
      ],
    }
  );

  LivestockProductionJob.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      cityId: { type: DataTypes.UUID, allowNull: false, field: 'city_id' },
      farmId: { type: DataTypes.UUID, allowNull: false, field: 'farm_id' },
      jobType: { type: DataTypes.STRING(16), allowNull: false, field: 'job_type' },
      speciesCode: { type: DataTypes.STRING(32), allowNull: true, field: 'species_code' },
      breed: { type: DataTypes.STRING(32), allowNull: true },
      startedAt: { type: DataTypes.DATE, allowNull: false, field: 'started_at' },
      finishesAt: { type: DataTypes.DATE, allowNull: false, field: 'finishes_at' },
      status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'in_progress' },
      progress: jsonColumn<Record<string, number>>('progress', {}),
      output: jsonColumn<Record<string, number>>('output', {}),
      efficiency: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
      productiveSeconds: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0, field: 'productive_seconds' },
      animalSeconds: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0, field: 'animal_seconds' },
      completedAt: { type: DataTypes.DATE, allowNull: true, defaultValue: null, field: 'completed_at' },
      collectedAt: { type: DataTypes.DATE, allowNull: true, defaultValue: null, field: 'collected_at' },
      ...timestamps,
    },
    {
      sequelize,
      tableName: 'livestock_production_jobs',
      modelName: 'LivestockProductionJob',
      underscored: true,
      indexes: [
        { fields: ['farm_id', 'status'], name: 'idx_livestock_jobs_farm_status' },
        { fields: ['city_id'], name: 'idx_livestock_jobs_city' },
      ],
    }
  );

  return { AnimalSpecies, AnimalFeedRecipe, LivestockFarm, LivestockFarmTile, FarmAnimal, LivestockProductionJob };
}
