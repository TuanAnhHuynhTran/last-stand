/**
 * Tactical battle models (Phase 11) — PvE battles on a separate battlefield:
 *  battle_instances    – one battle: mission, phase, authoritative engine state (JSON), version
 *                        (optimistic concurrency), idempotent creation key, abandon deadline
 *  battle_participants – who fights (the city owner's account) and on which side
 *  battle_units        – roster snapshot: soldier ↔ battle unit, start / end HP, KO, kills, XP, injury
 *  battle_actions      – every accepted action (UNIQUE client_action_id → retries are replayed,
 *                        UNIQUE seq) with the events the client animates
 *  battle_turns        – turn log (turn, side, start / end time)
 *  battle_rewards      – rewards computed by the server at the end (UNIQUE battle_id, claimed once)
 *
 * Every attribute has its OWN definition object (Sequelize writes `field` into it — sharing one
 * object between columns silently renames them).
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
import type { BattleAction, BattleEvent, BattleOutcome, BattlePhase, BattleRewards, BattleState, MissionCode } from '@cityverse/shared';

const timestamps = () => ({
  createdAt: { type: DataTypes.DATE, allowNull: false, field: 'created_at' },
  updatedAt: { type: DataTypes.DATE, allowNull: false, field: 'updated_at' },
});
const uuidCol = (field: string, allowNull = false) => ({ type: DataTypes.UUID, allowNull, field });

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

export class BattleInstance extends Model<InferAttributes<BattleInstance>, InferCreationAttributes<BattleInstance>> {
  declare id: CreationOptional<string>;
  declare cityId: string;
  declare userId: string;
  declare missionCode: MissionCode;
  declare poiId: string | null;
  declare status: BattlePhase;
  declare version: number;
  declare seed: number;
  declare state: BattleState;
  declare requestKey: string;
  declare fingerprint: string;
  declare lastActionAt: Date;
  declare expiresAt: Date;
  declare endedAt: CreationOptional<Date | null>;
  declare outcome: CreationOptional<BattleOutcome | null>;
  declare settled: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export class BattleParticipant extends Model<InferAttributes<BattleParticipant>, InferCreationAttributes<BattleParticipant>> {
  declare id: CreationOptional<string>;
  declare battleId: string;
  declare userId: string;
  declare side: 'player' | 'enemy';
  declare joinedAt: Date;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export class BattleUnitRecord extends Model<InferAttributes<BattleUnitRecord>, InferCreationAttributes<BattleUnitRecord>> {
  declare id: CreationOptional<string>;
  declare battleId: string;
  declare unitKey: string;
  declare militaryUnitId: string | null;
  declare side: string;
  declare kind: string;
  declare name: string;
  declare startHp: number;
  declare maxHp: number;
  declare endHp: CreationOptional<number | null>;
  declare ko: CreationOptional<boolean>;
  declare kills: CreationOptional<number>;
  declare xpGained: CreationOptional<number>;
  declare injury: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export class BattleActionRecord extends Model<InferAttributes<BattleActionRecord>, InferCreationAttributes<BattleActionRecord>> {
  declare id: CreationOptional<string>;
  declare battleId: string;
  declare seq: number;
  declare turn: number;
  declare clientActionId: string;
  declare fingerprint: string;
  declare action: BattleAction;
  declare events: BattleEvent[];
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export class BattleTurn extends Model<InferAttributes<BattleTurn>, InferCreationAttributes<BattleTurn>> {
  declare id: CreationOptional<string>;
  declare battleId: string;
  declare turn: number;
  declare side: 'player' | 'enemy';
  declare startedAt: Date;
  declare endedAt: CreationOptional<Date | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export class BattleReward extends Model<InferAttributes<BattleReward>, InferCreationAttributes<BattleReward>> {
  declare id: CreationOptional<string>;
  declare battleId: string;
  declare cityId: string;
  declare rewards: BattleRewards;
  declare stars: number;
  declare claimedAt: CreationOptional<Date | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initBattleModels(sequelize: Sequelize) {
  BattleInstance.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      cityId: uuidCol('city_id'),
      userId: uuidCol('user_id'),
      missionCode: { type: DataTypes.STRING(32), allowNull: false, field: 'mission_code' },
      poiId: uuidCol('poi_id', true),
      status: { type: DataTypes.STRING(16), allowNull: false },
      version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      seed: { type: DataTypes.INTEGER, allowNull: false },
      state: json<BattleState | null>('state', 'state', null),
      requestKey: { type: DataTypes.STRING(36), allowNull: false, field: 'request_key' },
      fingerprint: { type: DataTypes.STRING(500), allowNull: false },
      lastActionAt: { type: DataTypes.DATE, allowNull: false, field: 'last_action_at' },
      expiresAt: { type: DataTypes.DATE, allowNull: false, field: 'expires_at' },
      endedAt: { type: DataTypes.DATE, allowNull: true, defaultValue: null, field: 'ended_at' },
      outcome: json<BattleOutcome | null>('outcome', 'outcome', null, true),
      settled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      ...timestamps(),
    },
    {
      sequelize,
      tableName: 'battle_instances',
      modelName: 'BattleInstance',
      underscored: true,
      indexes: [
        { unique: true, fields: ['city_id', 'request_key'], name: 'uq_battle_instances_request' },
        { fields: ['city_id', 'status'], name: 'idx_battle_instances_city_status' },
        { fields: ['mission_code', 'status'], name: 'idx_battle_instances_mission_status' },
      ],
    }
  );

  BattleParticipant.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      battleId: uuidCol('battle_id'),
      userId: uuidCol('user_id'),
      side: { type: DataTypes.STRING(16), allowNull: false },
      joinedAt: { type: DataTypes.DATE, allowNull: false, field: 'joined_at' },
      ...timestamps(),
    },
    { sequelize, tableName: 'battle_participants', modelName: 'BattleParticipant', underscored: true, indexes: [{ unique: true, fields: ['battle_id', 'user_id'], name: 'uq_battle_participants' }, { fields: ['user_id'], name: 'idx_battle_participants_user' }] }
  );

  BattleUnitRecord.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      battleId: uuidCol('battle_id'),
      unitKey: { type: DataTypes.STRING(16), allowNull: false, field: 'unit_key' },
      militaryUnitId: uuidCol('military_unit_id', true),
      side: { type: DataTypes.STRING(16), allowNull: false },
      kind: { type: DataTypes.STRING(32), allowNull: false },
      name: { type: DataTypes.STRING(60), allowNull: false },
      startHp: { type: DataTypes.INTEGER, allowNull: false, field: 'start_hp' },
      maxHp: { type: DataTypes.INTEGER, allowNull: false, field: 'max_hp' },
      endHp: { type: DataTypes.INTEGER, allowNull: true, defaultValue: null, field: 'end_hp' },
      ko: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      kills: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      xpGained: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'xp_gained' },
      injury: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
      ...timestamps(),
    },
    { sequelize, tableName: 'battle_units', modelName: 'BattleUnitRecord', underscored: true, indexes: [{ unique: true, fields: ['battle_id', 'unit_key'], name: 'uq_battle_units_key' }] }
  );

  BattleActionRecord.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      battleId: uuidCol('battle_id'),
      seq: { type: DataTypes.INTEGER, allowNull: false },
      turn: { type: DataTypes.INTEGER, allowNull: false },
      clientActionId: { type: DataTypes.STRING(36), allowNull: false, field: 'client_action_id' },
      fingerprint: { type: DataTypes.STRING(500), allowNull: false },
      action: json<BattleAction | null>('action', 'action', null),
      events: json<BattleEvent[]>('events', 'events', []),
      ...timestamps(),
    },
    {
      sequelize,
      tableName: 'battle_actions',
      modelName: 'BattleActionRecord',
      underscored: true,
      indexes: [
        { unique: true, fields: ['battle_id', 'client_action_id'], name: 'uq_battle_actions_client' },
        { unique: true, fields: ['battle_id', 'seq'], name: 'uq_battle_actions_seq' },
      ],
    }
  );

  BattleTurn.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      battleId: uuidCol('battle_id'),
      turn: { type: DataTypes.INTEGER, allowNull: false },
      side: { type: DataTypes.STRING(16), allowNull: false },
      startedAt: { type: DataTypes.DATE, allowNull: false, field: 'started_at' },
      endedAt: { type: DataTypes.DATE, allowNull: true, defaultValue: null, field: 'ended_at' },
      ...timestamps(),
    },
    { sequelize, tableName: 'battle_turns', modelName: 'BattleTurn', underscored: true, indexes: [{ unique: true, fields: ['battle_id', 'turn', 'side'], name: 'uq_battle_turns' }] }
  );

  BattleReward.init(
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      battleId: { ...uuidCol('battle_id'), unique: 'uq_battle_rewards_battle' },
      cityId: uuidCol('city_id'),
      rewards: json<BattleRewards | null>('rewards', 'rewards', null),
      stars: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      claimedAt: { type: DataTypes.DATE, allowNull: true, defaultValue: null, field: 'claimed_at' },
      ...timestamps(),
    },
    { sequelize, tableName: 'battle_rewards', modelName: 'BattleReward', underscored: true }
  );

  return { BattleInstance, BattleParticipant, BattleUnitRecord, BattleActionRecord, BattleTurn, BattleReward };
}
