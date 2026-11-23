/**
 * Building system models:
 *  building_types, building_levels        – catalogue (seeded from @cityverse/shared)
 *  world_buildings                         – placed buildings (id is stable across upgrades/moves)
 *  building_footprints                     – one row per occupied hex; UNIQUE(city_id, q, r)
 *                                            makes overlapping buildings impossible at DB level
 *  building_construction_jobs              – timed build / upgrade jobs
 *  city_resources                          – wood / stone stock per city
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
import type {
  AxialCoord,
  BuildingStatKey,
  BuildingStatus,
  BuildingTypeCode,
  LivestockFarmTypeCode,
  WaterBodyTypeCode,
  ConstructionJobStatus,
  ConstructionJobType,
  ResourceBag,
} from '@cityverse/shared';

/** JSON column that also tolerates drivers returning strings. */
export function jsonColumn<T>(field: string, fallback: T): ModelAttributeColumnOptions {
  return {
    type: DataTypes.JSON,
    allowNull: false,
    field,
    get(this: Model) {
      const raw = this.getDataValue(field as never) as unknown;
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

export class BuildingType extends Model<InferAttributes<BuildingType>, InferCreationAttributes<BuildingType>> {
  declare code: BuildingTypeCode | LivestockFarmTypeCode | WaterBodyTypeCode;
  declare name: string;
  declare category: string;
  declare description: string;
  declare footprint: AxialCoord[];
  declare maxPerCity: number | null;
  declare maxLevel: number;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export class BuildingLevel extends Model<InferAttributes<BuildingLevel>, InferCreationAttributes<BuildingLevel>> {
  declare id: CreationOptional<string>;
  declare typeCode: BuildingTypeCode | LivestockFarmTypeCode | WaterBodyTypeCode;
  declare level: number;
  declare name: string;
  declare description: string;
  declare cost: ResourceBag;
  declare buildSeconds: number;
  declare stats: Partial<Record<BuildingStatKey, number>>;
  declare modelKey: string;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export class WorldBuilding extends Model<InferAttributes<WorldBuilding>, InferCreationAttributes<WorldBuilding>> {
  declare id: CreationOptional<string>;
  declare cityId: string;
  declare typeCode: BuildingTypeCode | LivestockFarmTypeCode | WaterBodyTypeCode;
  declare level: number;
  declare status: BuildingStatus;
  declare anchorQ: number;
  declare anchorR: number;
  declare rotation: number;
  declare createdBy: string;
  /** Cumulative resources spent on this building (basis for demolish refunds). */
  declare invested: ResourceBag;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export class BuildingFootprint extends Model<
  InferAttributes<BuildingFootprint>,
  InferCreationAttributes<BuildingFootprint>
> {
  declare id: CreationOptional<string>;
  declare cityId: string;
  declare buildingId: string;
  declare q: number;
  declare r: number;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export class BuildingConstructionJob extends Model<
  InferAttributes<BuildingConstructionJob>,
  InferCreationAttributes<BuildingConstructionJob>
> {
  declare id: CreationOptional<string>;
  declare cityId: string;
  declare buildingId: string;
  declare jobType: ConstructionJobType;
  declare fromLevel: number;
  declare targetLevel: number;
  declare cost: ResourceBag;
  declare startedAt: Date;
  declare finishesAt: Date;
  declare completedAt: CreationOptional<Date | null>;
  declare status: ConstructionJobStatus;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export class CityResource extends Model<InferAttributes<CityResource>, InferCreationAttributes<CityResource>> {
  declare id: CreationOptional<string>;
  declare cityId: string;
  declare resourceCode: string;
  declare amount: number;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initBuildingModels(sequelize: Sequelize) {
  BuildingType.init(
    {
      code: { type: DataTypes.STRING(32), primaryKey: true },
      name: { type: DataTypes.STRING(120), allowNull: false },
      category: { type: DataTypes.STRING(32), allowNull: false },
      description: { type: DataTypes.STRING(500), allowNull: false, defaultValue: '' },
      footprint: jsonColumn<AxialCoord[]>('footprint', []),
      maxPerCity: { type: DataTypes.INTEGER, allowNull: true, field: 'max_per_city' },
      maxLevel: { type: DataTypes.INTEGER, allowNull: false, field: 'max_level' },
      ...timestamps,
    },
    { sequelize, tableName: 'building_types', modelName: 'BuildingType', underscored: true }
  );

  BuildingLevel.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      typeCode: { type: DataTypes.STRING(32), allowNull: false, field: 'type_code' },
      level: { type: DataTypes.INTEGER, allowNull: false },
      name: { type: DataTypes.STRING(120), allowNull: false },
      description: { type: DataTypes.STRING(500), allowNull: false, defaultValue: '' },
      cost: jsonColumn<ResourceBag>('cost', { coins: 0, wood: 0, stone: 0 }),
      buildSeconds: { type: DataTypes.INTEGER, allowNull: false, field: 'build_seconds' },
      stats: jsonColumn<Record<string, number>>('stats', {}),
      modelKey: { type: DataTypes.STRING(64), allowNull: false, field: 'model_key' },
      ...timestamps,
    },
    {
      sequelize,
      tableName: 'building_levels',
      modelName: 'BuildingLevel',
      underscored: true,
      indexes: [{ unique: true, fields: ['type_code', 'level'], name: 'uq_building_levels_type_level' }],
    }
  );

  WorldBuilding.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      cityId: { type: DataTypes.UUID, allowNull: false, field: 'city_id' },
      typeCode: { type: DataTypes.STRING(32), allowNull: false, field: 'type_code' },
      level: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'constructing' },
      anchorQ: { type: DataTypes.INTEGER, allowNull: false, field: 'anchor_q' },
      anchorR: { type: DataTypes.INTEGER, allowNull: false, field: 'anchor_r' },
      rotation: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 0 },
      createdBy: { type: DataTypes.UUID, allowNull: false, field: 'created_by' },
      invested: jsonColumn<ResourceBag>('invested', { coins: 0, wood: 0, stone: 0 }),
      ...timestamps,
    },
    {
      sequelize,
      tableName: 'world_buildings',
      modelName: 'WorldBuilding',
      underscored: true,
      indexes: [{ fields: ['city_id'], name: 'idx_world_buildings_city' }],
    }
  );

  BuildingFootprint.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      cityId: { type: DataTypes.UUID, allowNull: false, field: 'city_id' },
      buildingId: { type: DataTypes.UUID, allowNull: false, field: 'building_id' },
      q: { type: DataTypes.INTEGER, allowNull: false },
      r: { type: DataTypes.INTEGER, allowNull: false },
      ...timestamps,
    },
    {
      sequelize,
      tableName: 'building_footprints',
      modelName: 'BuildingFootprint',
      underscored: true,
      indexes: [
        { unique: true, fields: ['city_id', 'q', 'r'], name: 'uq_building_footprints_city_hex' },
        { fields: ['building_id'], name: 'idx_building_footprints_building' },
      ],
    }
  );

  BuildingConstructionJob.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      cityId: { type: DataTypes.UUID, allowNull: false, field: 'city_id' },
      buildingId: { type: DataTypes.UUID, allowNull: false, field: 'building_id' },
      jobType: { type: DataTypes.STRING(16), allowNull: false, field: 'job_type' },
      fromLevel: { type: DataTypes.INTEGER, allowNull: false, field: 'from_level' },
      targetLevel: { type: DataTypes.INTEGER, allowNull: false, field: 'target_level' },
      cost: jsonColumn<ResourceBag>('cost', { coins: 0, wood: 0, stone: 0 }),
      startedAt: { type: DataTypes.DATE, allowNull: false, field: 'started_at' },
      finishesAt: { type: DataTypes.DATE, allowNull: false, field: 'finishes_at' },
      completedAt: { type: DataTypes.DATE, allowNull: true, defaultValue: null, field: 'completed_at' },
      status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'in_progress' },
      ...timestamps,
    },
    {
      sequelize,
      tableName: 'building_construction_jobs',
      modelName: 'BuildingConstructionJob',
      underscored: true,
      indexes: [
        { fields: ['city_id', 'status'], name: 'idx_construction_jobs_city_status' },
        { fields: ['building_id'], name: 'idx_construction_jobs_building' },
      ],
    }
  );

  CityResource.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      cityId: { type: DataTypes.UUID, allowNull: false, field: 'city_id' },
      resourceCode: { type: DataTypes.STRING(32), allowNull: false, field: 'resource_code' },
      amount: {
        type: DataTypes.BIGINT,
        allowNull: false,
        defaultValue: 0,
        get(this: CityResource) {
          return Number(this.getDataValue('amount'));
        },
      },
      ...timestamps,
    },
    {
      sequelize,
      tableName: 'city_resources',
      modelName: 'CityResource',
      underscored: true,
      indexes: [{ unique: true, fields: ['city_id', 'resource_code'], name: 'uq_city_resources_city_code' }],
    }
  );

  return { BuildingType, BuildingLevel, WorldBuilding, BuildingFootprint, BuildingConstructionJob, CityResource };
}
