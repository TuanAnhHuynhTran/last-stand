'use strict';

/**
 * Phase 11 — PvE tactical battles on a separate battlefield.
 * battle_instances keeps the authoritative engine state (JSON) + version (optimistic lock);
 * battle_actions makes every action idempotent (UNIQUE client_action_id) and ordered (UNIQUE seq);
 * battle_rewards is UNIQUE per battle and claimed once (claimed_at).
 */
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const ts = {
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    };
    const id = () => ({ type: Sequelize.CHAR(36), primaryKey: true, allowNull: false });
    const fk = (model) => ({ type: Sequelize.CHAR(36), allowNull: false, references: { model, key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' });

    await queryInterface.createTable('battle_instances', {
      id: id(),
      city_id: fk('cities'),
      user_id: fk('users'),
      mission_code: { type: Sequelize.STRING(32), allowNull: false },
      poi_id: { type: Sequelize.CHAR(36), allowNull: true },
      status: { type: Sequelize.STRING(16), allowNull: false },
      version: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      seed: { type: Sequelize.INTEGER, allowNull: false },
      state: { type: Sequelize.JSON, allowNull: false },
      request_key: { type: Sequelize.STRING(36), allowNull: false },
      fingerprint: { type: Sequelize.STRING(500), allowNull: false },
      last_action_at: { type: Sequelize.DATE, allowNull: false },
      expires_at: { type: Sequelize.DATE, allowNull: false },
      ended_at: { type: Sequelize.DATE, allowNull: true },
      outcome: { type: Sequelize.JSON, allowNull: true },
      settled: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      ...ts,
    });
    await queryInterface.addIndex('battle_instances', ['city_id', 'request_key'], { unique: true, name: 'uq_battle_instances_request' });
    await queryInterface.addIndex('battle_instances', ['city_id', 'status'], { name: 'idx_battle_instances_city_status' });

    await queryInterface.createTable('battle_participants', {
      id: id(),
      battle_id: fk('battle_instances'),
      user_id: fk('users'),
      side: { type: Sequelize.STRING(16), allowNull: false },
      joined_at: { type: Sequelize.DATE, allowNull: false },
      ...ts,
    });
    await queryInterface.addIndex('battle_participants', ['battle_id', 'user_id'], { unique: true, name: 'uq_battle_participants' });

    await queryInterface.createTable('battle_units', {
      id: id(),
      battle_id: fk('battle_instances'),
      unit_key: { type: Sequelize.STRING(16), allowNull: false },
      military_unit_id: { type: Sequelize.CHAR(36), allowNull: true },
      side: { type: Sequelize.STRING(16), allowNull: false },
      kind: { type: Sequelize.STRING(32), allowNull: false },
      name: { type: Sequelize.STRING(60), allowNull: false },
      start_hp: { type: Sequelize.INTEGER, allowNull: false },
      max_hp: { type: Sequelize.INTEGER, allowNull: false },
      end_hp: { type: Sequelize.INTEGER, allowNull: true },
      ko: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      kills: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      xp_gained: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      injury: { type: Sequelize.FLOAT, allowNull: false, defaultValue: 0 },
      ...ts,
    });
    await queryInterface.addIndex('battle_units', ['battle_id', 'unit_key'], { unique: true, name: 'uq_battle_units_key' });

    await queryInterface.createTable('battle_actions', {
      id: id(),
      battle_id: fk('battle_instances'),
      seq: { type: Sequelize.INTEGER, allowNull: false },
      turn: { type: Sequelize.INTEGER, allowNull: false },
      client_action_id: { type: Sequelize.STRING(36), allowNull: false },
      fingerprint: { type: Sequelize.STRING(500), allowNull: false },
      action: { type: Sequelize.JSON, allowNull: false },
      events: { type: Sequelize.JSON, allowNull: false },
      ...ts,
    });
    await queryInterface.addIndex('battle_actions', ['battle_id', 'client_action_id'], { unique: true, name: 'uq_battle_actions_client' });
    await queryInterface.addIndex('battle_actions', ['battle_id', 'seq'], { unique: true, name: 'uq_battle_actions_seq' });

    await queryInterface.createTable('battle_turns', {
      id: id(),
      battle_id: fk('battle_instances'),
      turn: { type: Sequelize.INTEGER, allowNull: false },
      side: { type: Sequelize.STRING(16), allowNull: false },
      started_at: { type: Sequelize.DATE, allowNull: false },
      ended_at: { type: Sequelize.DATE, allowNull: true },
      ...ts,
    });
    await queryInterface.addIndex('battle_turns', ['battle_id', 'turn', 'side'], { unique: true, name: 'uq_battle_turns' });

    await queryInterface.createTable('battle_rewards', {
      id: id(),
      battle_id: { ...fk('battle_instances'), unique: 'uq_battle_rewards_battle' },
      city_id: fk('cities'),
      rewards: { type: Sequelize.JSON, allowNull: false },
      stars: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      claimed_at: { type: Sequelize.DATE, allowNull: true },
      ...ts,
    });
  },

  async down(queryInterface) {
    for (const t of ['battle_rewards', 'battle_turns', 'battle_actions', 'battle_units', 'battle_participants', 'battle_instances']) {
      await queryInterface.dropTable(t);
    }
  },
};
