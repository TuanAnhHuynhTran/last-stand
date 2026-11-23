/**
 * Working-animal models (Phase 9) on top of farm_animals (horses / elephants in stables / camps):
 *  animal_training_jobs  – timed training programs (completed exactly once, conditional UPDATE)
 *  animal_assignments    – non-mount duty (transport / military reserve), UNIQUE animal_id
 *  animal_equipment      – saddle / barding / cargo harness / howdah, UNIQUE animal_id + slot
 *  mount_assignments     – horse ↔ soldier, UNIQUE animal_id and UNIQUE unit_id
 *  animal_care_records   – care history (feed, water, grooming, vet, training, deaths …)
 */
import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from 'sequelize';
import type { AnimalEquipmentCode, AnimalEquipmentSlot, AnimalTaskKind, CareRecordKind, TrainingProgramCode } from '@cityverse/shared';

const timestamps = {
  createdAt: { type: DataTypes.DATE, allowNull: false, field: 'created_at' },
  updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updated_at' },
};
const uuid = (field: string) => ({ type: DataTypes.UUID, allowNull: false, field });

export class AnimalTrainingJob extends Model<InferAttributes<AnimalTrainingJob>, InferCreationAttributes<AnimalTrainingJob>> {
  declare id: CreationOptional<string>;
  declare cityId: string;
  declare farmId: string;
  declare animalId: string;
  declare program: TrainingProgramCode;
  declare startedAt: Date;
  declare finishesAt: Date;
  declare status: 'in_progress' | 'completed' | 'cancelled';
  declare completedAt: CreationOptional<Date | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export class AnimalAssignment extends Model<InferAttributes<AnimalAssignment>, InferCreationAttributes<AnimalAssignment>> {
  declare id: CreationOptional<string>;
  declare cityId: string;
  declare animalId: string;
  declare kind: AnimalTaskKind;
  declare assignedAt: Date;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export class AnimalEquipment extends Model<InferAttributes<AnimalEquipment>, InferCreationAttributes<AnimalEquipment>> {
  declare id: CreationOptional<string>;
  declare animalId: string;
  declare slot: AnimalEquipmentSlot;
  declare equipmentCode: AnimalEquipmentCode;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export class MountAssignment extends Model<InferAttributes<MountAssignment>, InferCreationAttributes<MountAssignment>> {
  declare id: CreationOptional<string>;
  declare cityId: string;
  declare animalId: string;
  declare unitId: string;
  declare assignedAt: Date;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export class AnimalCareRecord extends Model<InferAttributes<AnimalCareRecord>, InferCreationAttributes<AnimalCareRecord>> {
  declare id: CreationOptional<string>;
  declare cityId: string;
  declare farmId: string;
  declare animalId: string | null;
  declare kind: CareRecordKind;
  declare note: string;
  declare at: Date;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initMountModels(sequelize: Sequelize) {
  AnimalTrainingJob.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      cityId: uuid('city_id'),
      farmId: uuid('farm_id'),
      animalId: uuid('animal_id'),
      program: { type: DataTypes.STRING(16), allowNull: false },
      startedAt: { type: DataTypes.DATE, allowNull: false, field: 'started_at' },
      finishesAt: { type: DataTypes.DATE, allowNull: false, field: 'finishes_at' },
      status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'in_progress' },
      completedAt: { type: DataTypes.DATE, allowNull: true, defaultValue: null, field: 'completed_at' },
      ...timestamps,
    },
    {
      sequelize,
      tableName: 'animal_training_jobs',
      modelName: 'AnimalTrainingJob',
      underscored: true,
      indexes: [
        { fields: ['city_id', 'status'], name: 'idx_animal_training_city_status' },
        { fields: ['animal_id'], name: 'idx_animal_training_animal' },
      ],
    }
  );

  AnimalAssignment.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      cityId: uuid('city_id'),
      animalId: { ...uuid('animal_id'), unique: 'uq_animal_assignments_animal' },
      kind: { type: DataTypes.STRING(16), allowNull: false },
      assignedAt: { type: DataTypes.DATE, allowNull: false, field: 'assigned_at' },
      ...timestamps,
    },
    { sequelize, tableName: 'animal_assignments', modelName: 'AnimalAssignment', underscored: true, indexes: [{ fields: ['city_id'], name: 'idx_animal_assignments_city' }] }
  );

  AnimalEquipment.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      animalId: uuid('animal_id'),
      slot: { type: DataTypes.STRING(16), allowNull: false },
      equipmentCode: { type: DataTypes.STRING(32), allowNull: false, field: 'equipment_code' },
      ...timestamps,
    },
    {
      sequelize,
      tableName: 'animal_equipment',
      modelName: 'AnimalEquipment',
      underscored: true,
      indexes: [{ unique: true, fields: ['animal_id', 'slot'], name: 'uq_animal_equipment_slot' }],
    }
  );

  MountAssignment.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      cityId: uuid('city_id'),
      // One rider per horse and one horse per rider — enforced by the database.
      animalId: { ...uuid('animal_id'), unique: 'uq_mount_assignments_animal' },
      unitId: { ...uuid('unit_id'), unique: 'uq_mount_assignments_unit' },
      assignedAt: { type: DataTypes.DATE, allowNull: false, field: 'assigned_at' },
      ...timestamps,
    },
    { sequelize, tableName: 'mount_assignments', modelName: 'MountAssignment', underscored: true, indexes: [{ fields: ['city_id'], name: 'idx_mount_assignments_city' }] }
  );

  AnimalCareRecord.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      cityId: uuid('city_id'),
      farmId: uuid('farm_id'),
      animalId: { type: DataTypes.UUID, allowNull: true, field: 'animal_id' },
      kind: { type: DataTypes.STRING(16), allowNull: false },
      note: { type: DataTypes.STRING(200), allowNull: false, defaultValue: '' },
      at: { type: DataTypes.DATE, allowNull: false },
      ...timestamps,
    },
    {
      sequelize,
      tableName: 'animal_care_records',
      modelName: 'AnimalCareRecord',
      underscored: true,
      indexes: [
        { fields: ['city_id', 'at'], name: 'idx_animal_care_city_time' },
        { fields: ['animal_id'], name: 'idx_animal_care_animal' },
      ],
    }
  );

  return { AnimalTrainingJob, AnimalAssignment, AnimalEquipment, MountAssignment, AnimalCareRecord };
}
