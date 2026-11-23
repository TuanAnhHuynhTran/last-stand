/**
 * Villagers & economy models (Phase 7):
 *  professions           – profession catalogue (seeded from @cityverse/shared)
 *  production_recipes    – recipes per building type (seeded)
 *  survivors             – each villager: name, profession, skills, health, stamina, satisfaction, look
 *  survivor_housing      – the ONE main home of a survivor (UNIQUE survivor_id → a house building)
 *  survivor_jobs         – the ONE full-time job of a survivor (UNIQUE survivor_id → a workplace)
 *  production_jobs       – the running recipe of a production building, progress and output buffer
 *  resource_transactions – income / expense ledger (aggregated per settle, reason and resource)
 *  world_time_states     – per city game clock (epoch, day length), settlement time and settings
 * Positions of villagers are never stored: the client derives them from the schedule.
 */
import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type ModelAttributeColumnOptions,
  type Sequelize,
} from 'sequelize';
import type { Appearance, ProducerStatus, ProfessionCode, SurvivorDTO, WorkplaceKind } from '@cityverse/shared';
/** JSON column (tolerates drivers returning strings); the getter reads by attribute name. */
function json<T>(attr: string, field: string, fallback: T, allowNull = false): ModelAttributeColumnOptions {
  return {
    type: DataTypes.JSON,
    allowNull,
    field,
    get(this: Model) {
      const raw = this.getDataValue(attr as never) as unknown;
      if (typeof raw === 'string') {
        try {
          return JSON.parse(raw) as T;
        } catch {
          return fallback;
        }
      }
      return (raw ?? fallback) as T;
    },
  } as ModelAttributeColumnOptions;
}

const timestamps = {
  createdAt: { type: DataTypes.DATE, allowNull: false, field: 'created_at' },
  updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updated_at' },
};
const uuid = (field: string) => ({ type: DataTypes.UUID, allowNull: false, field });
const float = (field: string, defaultValue = 0) => ({ type: DataTypes.FLOAT, allowNull: false, defaultValue, field });

export class Profession extends Model<InferAttributes<Profession>, InferCreationAttributes<Profession>> {
  declare code: ProfessionCode;
  declare name: string;
  declare description: string;
  declare outfit: Record<string, unknown>;
  declare workClips: string[];
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export class ProductionRecipe extends Model<InferAttributes<ProductionRecipe>, InferCreationAttributes<ProductionRecipe>> {
  declare code: string;
  declare buildingType: string;
  declare name: string;
  declare minLevel: number;
  declare inputs: Record<string, number>;
  declare outputs: Record<string, number>;
  declare seconds: number;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export class Survivor extends Model<InferAttributes<Survivor>, InferCreationAttributes<Survivor>> {
  declare id: CreationOptional<string>;
  declare cityId: string;
  declare name: string;
  declare professionCode: ProfessionCode | null;
  declare skills: Partial<Record<ProfessionCode, number>>;
  declare health: number;
  declare stamina: number;
  declare satisfaction: number;
  declare appearance: Appearance;
  declare origin: SurvivorDTO['origin'];
  declare seed: number;
  /** false after the player took them off a job: auto-assignment leaves them alone */
  declare assignable: CreationOptional<boolean>;
  declare arrivedAt: Date;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export class SurvivorHousing extends Model<InferAttributes<SurvivorHousing>, InferCreationAttributes<SurvivorHousing>> {
  declare id: CreationOptional<string>;
  declare cityId: string;
  declare survivorId: string;
  declare buildingId: string;
  declare movedInAt: Date;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export class SurvivorJob extends Model<InferAttributes<SurvivorJob>, InferCreationAttributes<SurvivorJob>> {
  declare id: CreationOptional<string>;
  declare cityId: string;
  declare survivorId: string;
  declare workplaceKind: WorkplaceKind;
  declare workplaceId: string;
  declare professionCode: ProfessionCode;
  declare manual: boolean;
  declare assignedAt: Date;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export class ProductionJob extends Model<InferAttributes<ProductionJob>, InferCreationAttributes<ProductionJob>> {
  declare id: CreationOptional<string>;
  declare cityId: string;
  declare buildingId: string;
  declare recipeCode: string | null;
  declare progress: number;
  declare buffer: Record<string, number>;
  declare status: ProducerStatus;
  declare batchesTotal: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export class ResourceTransaction extends Model<InferAttributes<ResourceTransaction>, InferCreationAttributes<ResourceTransaction>> {
  declare id: CreationOptional<string>;
  declare cityId: string;
  declare resourceCode: string;
  declare delta: number;
  declare reason: string;
  declare refId: string | null;
  declare periodStart: Date;
  declare periodEnd: Date;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export class WorldTimeState extends Model<InferAttributes<WorldTimeState>, InferCreationAttributes<WorldTimeState>> {
  declare id: CreationOptional<string>;
  declare cityId: string;
  declare epoch: Date;
  declare daySeconds: number;
  declare lastSettledAt: Date;
  declare autoAssign: boolean;
  declare naturalGrowth: boolean;
  declare rescue: { arrivesAtHour: number; count: number } | null;
  declare initialized: boolean;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initPopulationModels(sequelize: Sequelize) {
  Profession.init(
    {
      code: { type: DataTypes.STRING(32), primaryKey: true },
      name: { type: DataTypes.STRING(120), allowNull: false },
      description: { type: DataTypes.STRING(500), allowNull: false, defaultValue: '' },
      outfit: json<Record<string, unknown>>('outfit', 'outfit', {}),
      workClips: json<string[]>('workClips', 'work_clips', []),
      ...timestamps,
    },
    { sequelize, tableName: 'professions', modelName: 'Profession', underscored: true }
  );

  ProductionRecipe.init(
    {
      code: { type: DataTypes.STRING(32), primaryKey: true },
      buildingType: { type: DataTypes.STRING(32), allowNull: false, field: 'building_type' },
      name: { type: DataTypes.STRING(120), allowNull: false },
      minLevel: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1, field: 'min_level' },
      inputs: json<Record<string, number>>('inputs', 'inputs', {}),
      outputs: json<Record<string, number>>('outputs', 'outputs', {}),
      seconds: { type: DataTypes.INTEGER, allowNull: false },
      ...timestamps,
    },
    { sequelize, tableName: 'production_recipes', modelName: 'ProductionRecipe', underscored: true }
  );

  Survivor.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      cityId: uuid('city_id'),
      name: { type: DataTypes.STRING(60), allowNull: false },
      professionCode: { type: DataTypes.STRING(32), allowNull: true, field: 'profession_code' },
      skills: json<Record<string, number>>('skills', 'skills', {}),
      health: float('health', 1),
      stamina: float('stamina', 1),
      satisfaction: float('satisfaction', 0.6),
      appearance: json<Appearance>('appearance', 'appearance', { skin: '#f6d2b4', hair: '#2b2116', hairStyle: 0, height: 1 }),
      origin: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'founder' },
      seed: { type: DataTypes.INTEGER, allowNull: false },
      assignable: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      arrivedAt: { type: DataTypes.DATE, allowNull: false, field: 'arrived_at' },
      ...timestamps,
    },
    {
      sequelize,
      tableName: 'survivors',
      modelName: 'Survivor',
      underscored: true,
      indexes: [{ fields: ['city_id'], name: 'idx_survivors_city' }],
    }
  );

  SurvivorHousing.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      cityId: uuid('city_id'),
      // One main home per survivor — enforced by the database.
      survivorId: { ...uuid('survivor_id'), unique: 'uq_survivor_housing_survivor' },
      buildingId: uuid('building_id'),
      movedInAt: { type: DataTypes.DATE, allowNull: false, field: 'moved_in_at' },
      ...timestamps,
    },
    {
      sequelize,
      tableName: 'survivor_housing',
      modelName: 'SurvivorHousing',
      underscored: true,
      indexes: [{ fields: ['building_id'], name: 'idx_survivor_housing_building' }],
    }
  );

  SurvivorJob.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      cityId: uuid('city_id'),
      // One full-time job per survivor — enforced by the database.
      survivorId: { ...uuid('survivor_id'), unique: 'uq_survivor_jobs_survivor' },
      workplaceKind: { type: DataTypes.STRING(16), allowNull: false, field: 'workplace_kind' },
      workplaceId: uuid('workplace_id'),
      professionCode: { type: DataTypes.STRING(32), allowNull: false, field: 'profession_code' },
      manual: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      assignedAt: { type: DataTypes.DATE, allowNull: false, field: 'assigned_at' },
      ...timestamps,
    },
    {
      sequelize,
      tableName: 'survivor_jobs',
      modelName: 'SurvivorJob',
      underscored: true,
      indexes: [{ fields: ['workplace_kind', 'workplace_id'], name: 'idx_survivor_jobs_workplace' }],
    }
  );

  ProductionJob.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      cityId: uuid('city_id'),
      buildingId: { ...uuid('building_id'), unique: 'uq_production_jobs_building' },
      recipeCode: { type: DataTypes.STRING(32), allowNull: true, field: 'recipe_code' },
      progress: float('progress'),
      buffer: json<Record<string, number>>('buffer', 'buffer', {}),
      status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'idle' },
      batchesTotal: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'batches_total' },
      ...timestamps,
    },
    { sequelize, tableName: 'production_jobs', modelName: 'ProductionJob', underscored: true }
  );

  ResourceTransaction.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      cityId: uuid('city_id'),
      resourceCode: { type: DataTypes.STRING(32), allowNull: false, field: 'resource_code' },
      delta: { type: DataTypes.FLOAT, allowNull: false },
      reason: { type: DataTypes.STRING(32), allowNull: false },
      refId: { type: DataTypes.UUID, allowNull: true, field: 'ref_id' },
      periodStart: { type: DataTypes.DATE, allowNull: false, field: 'period_start' },
      periodEnd: { type: DataTypes.DATE, allowNull: false, field: 'period_end' },
      ...timestamps,
    },
    {
      sequelize,
      tableName: 'resource_transactions',
      modelName: 'ResourceTransaction',
      underscored: true,
      indexes: [{ fields: ['city_id', 'period_end'], name: 'idx_resource_tx_city_time' }],
    }
  );

  WorldTimeState.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      cityId: { ...uuid('city_id'), unique: 'uq_world_time_states_city' },
      epoch: { type: DataTypes.DATE, allowNull: false },
      daySeconds: { type: DataTypes.INTEGER, allowNull: false, field: 'day_seconds' },
      lastSettledAt: { type: DataTypes.DATE, allowNull: false, field: 'last_settled_at' },
      autoAssign: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'auto_assign' },
      naturalGrowth: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'natural_growth' },
      rescue: json<unknown>('rescue', 'rescue', null, true),
      initialized: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      ...timestamps,
    },
    { sequelize, tableName: 'world_time_states', modelName: 'WorldTimeState', underscored: true }
  );

  return { Profession, ProductionRecipe, Survivor, SurvivorHousing, SurvivorJob, ProductionJob, ResourceTransaction, WorldTimeState };
}
