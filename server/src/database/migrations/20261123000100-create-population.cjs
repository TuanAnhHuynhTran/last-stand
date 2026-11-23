'use strict';

/**
 * Phase 7 — villagers, daily life & economy.
 * professions / production_recipes are seeded at server start from @cityverse/shared.
 * survivor_housing and survivor_jobs have UNIQUE(survivor_id): one main home and one
 * full-time job per survivor, enforced by the database. Villager positions are never stored.
 */
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const ts = {
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    };
    const fk = (model, key = 'id') => ({
      type: Sequelize.CHAR(36),
      allowNull: false,
      references: { model, key },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    });
    const float = (defaultValue = 0) => ({ type: Sequelize.FLOAT, allowNull: false, defaultValue });

    await queryInterface.createTable('professions', {
      code: { type: Sequelize.STRING(32), primaryKey: true, allowNull: false },
      name: { type: Sequelize.STRING(120), allowNull: false },
      description: { type: Sequelize.STRING(500), allowNull: false, defaultValue: '' },
      outfit: { type: Sequelize.JSON, allowNull: false },
      work_clips: { type: Sequelize.JSON, allowNull: false },
      ...ts,
    });

    await queryInterface.createTable('production_recipes', {
      code: { type: Sequelize.STRING(32), primaryKey: true, allowNull: false },
      building_type: { type: Sequelize.STRING(32), allowNull: false },
      name: { type: Sequelize.STRING(120), allowNull: false },
      min_level: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      inputs: { type: Sequelize.JSON, allowNull: false },
      outputs: { type: Sequelize.JSON, allowNull: false },
      seconds: { type: Sequelize.INTEGER, allowNull: false },
      ...ts,
    });

    await queryInterface.createTable('survivors', {
      id: { type: Sequelize.CHAR(36), primaryKey: true, allowNull: false },
      city_id: fk('cities'),
      name: { type: Sequelize.STRING(60), allowNull: false },
      profession_code: {
        type: Sequelize.STRING(32),
        allowNull: true,
        references: { model: 'professions', key: 'code' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      skills: { type: Sequelize.JSON, allowNull: false },
      health: float(1),
      stamina: float(1),
      satisfaction: float(0.6),
      appearance: { type: Sequelize.JSON, allowNull: false },
      origin: { type: Sequelize.STRING(16), allowNull: false, defaultValue: 'founder' },
      seed: { type: Sequelize.INTEGER, allowNull: false },
      assignable: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      arrived_at: { type: Sequelize.DATE, allowNull: false },
      ...ts,
    });
    await queryInterface.addIndex('survivors', ['city_id'], { name: 'idx_survivors_city' });

    await queryInterface.createTable('survivor_housing', {
      id: { type: Sequelize.CHAR(36), primaryKey: true, allowNull: false },
      city_id: fk('cities'),
      survivor_id: { ...fk('survivors'), unique: true },
      building_id: fk('world_buildings'),
      moved_in_at: { type: Sequelize.DATE, allowNull: false },
      ...ts,
    });
    await queryInterface.addIndex('survivor_housing', ['building_id'], { name: 'idx_survivor_housing_building' });

    await queryInterface.createTable('survivor_jobs', {
      id: { type: Sequelize.CHAR(36), primaryKey: true, allowNull: false },
      city_id: fk('cities'),
      survivor_id: { ...fk('survivors'), unique: true },
      workplace_kind: { type: Sequelize.STRING(16), allowNull: false },
      workplace_id: { type: Sequelize.CHAR(36), allowNull: false },
      profession_code: {
        type: Sequelize.STRING(32),
        allowNull: false,
        references: { model: 'professions', key: 'code' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      manual: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      assigned_at: { type: Sequelize.DATE, allowNull: false },
      ...ts,
    });
    await queryInterface.addIndex('survivor_jobs', ['workplace_kind', 'workplace_id'], { name: 'idx_survivor_jobs_workplace' });

    await queryInterface.createTable('production_jobs', {
      id: { type: Sequelize.CHAR(36), primaryKey: true, allowNull: false },
      city_id: fk('cities'),
      building_id: { ...fk('world_buildings'), unique: true },
      recipe_code: {
        type: Sequelize.STRING(32),
        allowNull: true,
        references: { model: 'production_recipes', key: 'code' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      progress: float(),
      buffer: { type: Sequelize.JSON, allowNull: false },
      status: { type: Sequelize.STRING(16), allowNull: false, defaultValue: 'idle' },
      batches_total: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      ...ts,
    });

    await queryInterface.createTable('resource_transactions', {
      id: { type: Sequelize.CHAR(36), primaryKey: true, allowNull: false },
      city_id: fk('cities'),
      resource_code: { type: Sequelize.STRING(32), allowNull: false },
      delta: { type: Sequelize.FLOAT, allowNull: false },
      reason: { type: Sequelize.STRING(32), allowNull: false },
      ref_id: { type: Sequelize.CHAR(36), allowNull: true },
      period_start: { type: Sequelize.DATE, allowNull: false },
      period_end: { type: Sequelize.DATE, allowNull: false },
      ...ts,
    });
    await queryInterface.addIndex('resource_transactions', ['city_id', 'period_end'], { name: 'idx_resource_tx_city_time' });

    await queryInterface.createTable('world_time_states', {
      id: { type: Sequelize.CHAR(36), primaryKey: true, allowNull: false },
      city_id: { ...fk('cities'), unique: true },
      epoch: { type: Sequelize.DATE, allowNull: false },
      day_seconds: { type: Sequelize.INTEGER, allowNull: false },
      last_settled_at: { type: Sequelize.DATE, allowNull: false },
      auto_assign: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      natural_growth: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      rescue: { type: Sequelize.JSON, allowNull: true },
      initialized: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      ...ts,
    });
  },

  async down(queryInterface) {
    for (const t of ['world_time_states', 'resource_transactions', 'production_jobs', 'survivor_jobs', 'survivor_housing', 'survivors', 'production_recipes', 'professions']) {
      await queryInterface.dropTable(t);
    }
  },
};
