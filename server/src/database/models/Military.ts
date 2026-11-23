/**
 * Military models (Phase 8):
 *  unit_types               – the four soldier classes (seeded from @cityverse/shared)
 *  equipment_types          – weapons / armour / ammo (seeded); stock lives in city_resources (eq_*)
 *  military_units           – a soldier = a survivor (UNIQUE survivor_id): class, rank, xp, status, barracks
 *  unit_equipment           – what each soldier carries (UNIQUE unit_id + slot)
 *  military_training_jobs   – recruit training / drills with server timestamps (completed exactly once)
 *  military_squads          – named squads with a formation and a status (standby / deployed)
 *  military_squad_members   – squad membership (UNIQUE squad_id + unit_id)
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
import type { EquipmentCode, EquipmentSlot, Formation, SquadStatus, TrainingKind, TrainingStatus, UnitStatus, UnitTypeCode } from '@cityverse/shared';

const timestamps = {
  createdAt: { type: DataTypes.DATE, allowNull: false, field: 'created_at' },
  updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updated_at' },
};
const uuid = (field: string) => ({ type: DataTypes.UUID, allowNull: false, field });

function json<T>(attr: string, field: string, fallback: T): ModelAttributeColumnOptions {
  return {
    type: DataTypes.JSON,
    allowNull: false,
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

export class UnitType extends Model<InferAttributes<UnitType>, InferCreationAttributes<UnitType>> {
  declare code: UnitTypeCode;
  declare name: string;
  declare role: string;
  declare buildingType: string;
  declare base: Record<string, number>;
  declare trainSeconds: number;
  declare food: number;
  declare coins: number;
  declare required: Record<string, string>;
  declare drills: string[];
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export class EquipmentType extends Model<InferAttributes<EquipmentType>, InferCreationAttributes<EquipmentType>> {
  declare code: EquipmentCode;
  declare name: string;
  declare slot: EquipmentSlot;
  declare bonus: Record<string, number>;
  declare units: string[];
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export class MilitaryUnit extends Model<InferAttributes<MilitaryUnit>, InferCreationAttributes<MilitaryUnit>> {
  declare id: CreationOptional<string>;
  declare cityId: string;
  declare survivorId: string;
  declare unitTypeCode: UnitTypeCode;
  declare buildingId: string | null;
  declare rank: CreationOptional<number>;
  declare xp: CreationOptional<number>;
  declare status: UnitStatus;
  declare recruitedAt: Date;
  declare trainedAt: CreationOptional<Date | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export class UnitEquipment extends Model<InferAttributes<UnitEquipment>, InferCreationAttributes<UnitEquipment>> {
  declare id: CreationOptional<string>;
  declare unitId: string;
  declare slot: EquipmentSlot;
  declare equipmentCode: EquipmentCode;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export class MilitaryTrainingJob extends Model<InferAttributes<MilitaryTrainingJob>, InferCreationAttributes<MilitaryTrainingJob>> {
  declare id: CreationOptional<string>;
  declare cityId: string;
  declare buildingId: string;
  declare kind: TrainingKind;
  declare unitTypeCode: UnitTypeCode | null;
  declare unitIds: string[];
  declare startedAt: Date;
  declare finishesAt: Date;
  declare status: TrainingStatus;
  declare completedAt: CreationOptional<Date | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export class MilitarySquad extends Model<InferAttributes<MilitarySquad>, InferCreationAttributes<MilitarySquad>> {
  declare id: CreationOptional<string>;
  declare cityId: string;
  declare name: string;
  declare formation: Formation;
  declare status: SquadStatus;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export class MilitarySquadMember extends Model<InferAttributes<MilitarySquadMember>, InferCreationAttributes<MilitarySquadMember>> {
  declare id: CreationOptional<string>;
  declare squadId: string;
  declare unitId: string;
  declare position: number;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initMilitaryModels(sequelize: Sequelize) {
  UnitType.init(
    {
      code: { type: DataTypes.STRING(32), primaryKey: true },
      name: { type: DataTypes.STRING(120), allowNull: false },
      role: { type: DataTypes.STRING(120), allowNull: false, defaultValue: '' },
      buildingType: { type: DataTypes.STRING(32), allowNull: false, field: 'building_type' },
      base: json<Record<string, number>>('base', 'base', {}),
      trainSeconds: { type: DataTypes.INTEGER, allowNull: false, field: 'train_seconds' },
      food: { type: DataTypes.INTEGER, allowNull: false },
      coins: { type: DataTypes.INTEGER, allowNull: false },
      required: json<Record<string, string>>('required', 'required', {}),
      drills: json<string[]>('drills', 'drills', []),
      ...timestamps,
    },
    { sequelize, tableName: 'unit_types', modelName: 'UnitType', underscored: true }
  );

  EquipmentType.init(
    {
      code: { type: DataTypes.STRING(32), primaryKey: true },
      name: { type: DataTypes.STRING(120), allowNull: false },
      slot: { type: DataTypes.STRING(16), allowNull: false },
      bonus: json<Record<string, number>>('bonus', 'bonus', {}),
      units: json<string[]>('units', 'units', []),
      ...timestamps,
    },
    { sequelize, tableName: 'equipment_types', modelName: 'EquipmentType', underscored: true }
  );

  MilitaryUnit.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      cityId: uuid('city_id'),
      // A survivor is at most one soldier.
      survivorId: { ...uuid('survivor_id'), unique: 'uq_military_units_survivor' },
      unitTypeCode: { type: DataTypes.STRING(32), allowNull: false, field: 'unit_type_code' },
      buildingId: { type: DataTypes.UUID, allowNull: true, field: 'building_id' },
      rank: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      xp: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'recruit' },
      recruitedAt: { type: DataTypes.DATE, allowNull: false, field: 'recruited_at' },
      trainedAt: { type: DataTypes.DATE, allowNull: true, defaultValue: null, field: 'trained_at' },
      ...timestamps,
    },
    {
      sequelize,
      tableName: 'military_units',
      modelName: 'MilitaryUnit',
      underscored: true,
      indexes: [{ fields: ['city_id'], name: 'idx_military_units_city' }],
    }
  );

  UnitEquipment.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      unitId: uuid('unit_id'),
      slot: { type: DataTypes.STRING(16), allowNull: false },
      equipmentCode: { type: DataTypes.STRING(32), allowNull: false, field: 'equipment_code' },
      ...timestamps,
    },
    {
      sequelize,
      tableName: 'unit_equipment',
      modelName: 'UnitEquipment',
      underscored: true,
      indexes: [{ unique: true, fields: ['unit_id', 'slot'], name: 'uq_unit_equipment_slot' }],
    }
  );

  MilitaryTrainingJob.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      cityId: uuid('city_id'),
      buildingId: uuid('building_id'),
      kind: { type: DataTypes.STRING(16), allowNull: false },
      unitTypeCode: { type: DataTypes.STRING(32), allowNull: true, field: 'unit_type_code' },
      unitIds: json<string[]>('unitIds', 'unit_ids', []),
      startedAt: { type: DataTypes.DATE, allowNull: false, field: 'started_at' },
      finishesAt: { type: DataTypes.DATE, allowNull: false, field: 'finishes_at' },
      status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'in_progress' },
      completedAt: { type: DataTypes.DATE, allowNull: true, defaultValue: null, field: 'completed_at' },
      ...timestamps,
    },
    {
      sequelize,
      tableName: 'military_training_jobs',
      modelName: 'MilitaryTrainingJob',
      underscored: true,
      indexes: [{ fields: ['city_id', 'status'], name: 'idx_military_jobs_city_status' }],
    }
  );

  MilitarySquad.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      cityId: uuid('city_id'),
      name: { type: DataTypes.STRING(40), allowNull: false },
      formation: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'line' },
      status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'standby' },
      ...timestamps,
    },
    { sequelize, tableName: 'military_squads', modelName: 'MilitarySquad', underscored: true, indexes: [{ fields: ['city_id'], name: 'idx_military_squads_city' }] }
  );

  MilitarySquadMember.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      squadId: uuid('squad_id'),
      unitId: uuid('unit_id'),
      position: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      ...timestamps,
    },
    {
      sequelize,
      tableName: 'military_squad_members',
      modelName: 'MilitarySquadMember',
      underscored: true,
      indexes: [
        { unique: true, fields: ['squad_id', 'unit_id'], name: 'uq_squad_members_squad_unit' },
        { fields: ['unit_id'], name: 'idx_squad_members_unit' },
      ],
    }
  );

  return { UnitType, EquipmentType, MilitaryUnit, UnitEquipment, MilitaryTrainingJob, MilitarySquad, MilitarySquadMember };
}
