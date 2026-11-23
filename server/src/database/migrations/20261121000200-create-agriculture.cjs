'use strict';

/**
 * Phase 4 — agriculture & irrigation.
 * crop_types is filled at server start from @cityverse/shared (FarmCatalogService), like the
 * building catalogue. Harvested produce is stored in city_resources (rice, corn, …).
 */
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const ts = {
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    };
    const cityFk = {
      type: Sequelize.CHAR(36),
      allowNull: false,
      references: { model: 'cities', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    };

    await queryInterface.createTable('crop_types', {
      code: { type: Sequelize.STRING(32), primaryKey: true, allowNull: false },
      name: { type: Sequelize.STRING(120), allowNull: false },
      zone_type: { type: Sequelize.STRING(32), allowNull: false },
      produce: { type: Sequelize.STRING(32), allowNull: false },
      grow_seconds: { type: Sequelize.INTEGER, allowNull: false },
      yield_per_hex: { type: Sequelize.INTEGER, allowNull: false },
      water_need: { type: Sequelize.FLOAT, allowNull: false, defaultValue: 0 },
      seed_cost_per_hex: { type: Sequelize.JSON, allowNull: false },
      stages: { type: Sequelize.JSON, allowNull: false },
      ...ts,
    });

    await queryInterface.createTable('farm_zones', {
      id: { type: Sequelize.CHAR(36), primaryKey: true, allowNull: false },
      city_id: cityFk,
      zone_type: { type: Sequelize.STRING(32), allowNull: false },
      level: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      status: { type: Sequelize.STRING(16), allowNull: false, defaultValue: 'active' },
      upgrade_started_at: { type: Sequelize.DATE, allowNull: true },
      upgrade_finishes_at: { type: Sequelize.DATE, allowNull: true },
      created_by: { type: Sequelize.CHAR(36), allowNull: false },
      invested: { type: Sequelize.JSON, allowNull: false },
      total_harvested: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      ...ts,
    });
    await queryInterface.addIndex('farm_zones', ['city_id'], { name: 'idx_farm_zones_city' });

    const zoneFk = {
      type: Sequelize.CHAR(36),
      allowNull: false,
      references: { model: 'farm_zones', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    };

    await queryInterface.createTable('farm_zone_tiles', {
      id: { type: Sequelize.CHAR(36), primaryKey: true, allowNull: false },
      city_id: cityFk,
      zone_id: zoneFk,
      q: { type: Sequelize.INTEGER, allowNull: false },
      r: { type: Sequelize.INTEGER, allowNull: false },
      ...ts,
    });
    // One farm zone per hex per city — enforced by the database.
    await queryInterface.addIndex('farm_zone_tiles', ['city_id', 'q', 'r'], {
      unique: true,
      name: 'uq_farm_zone_tiles_city_hex',
    });
    await queryInterface.addIndex('farm_zone_tiles', ['zone_id'], { name: 'idx_farm_zone_tiles_zone' });

    await queryInterface.createTable('crop_cycles', {
      id: { type: Sequelize.CHAR(36), primaryKey: true, allowNull: false },
      city_id: cityFk,
      zone_id: zoneFk,
      crop_code: {
        type: Sequelize.STRING(32),
        allowNull: false,
        references: { model: 'crop_types', key: 'code' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      zone_level: { type: Sequelize.INTEGER, allowNull: false },
      hex_count: { type: Sequelize.INTEGER, allowNull: false },
      planted_at: { type: Sequelize.DATE, allowNull: false },
      ready_at: { type: Sequelize.DATE, allowNull: false },
      expected_yield: { type: Sequelize.INTEGER, allowNull: false },
      water_factor: { type: Sequelize.FLOAT, allowNull: false, defaultValue: 1 },
      seed_cost: { type: Sequelize.JSON, allowNull: false },
      status: { type: Sequelize.STRING(16), allowNull: false, defaultValue: 'growing' },
      harvested_at: { type: Sequelize.DATE, allowNull: true },
      harvested_amount: { type: Sequelize.INTEGER, allowNull: true },
      ...ts,
    });
    await queryInterface.addIndex('crop_cycles', ['zone_id', 'status'], { name: 'idx_crop_cycles_zone_status' });
    await queryInterface.addIndex('crop_cycles', ['city_id'], { name: 'idx_crop_cycles_city' });

    await queryInterface.createTable('irrigation_networks', {
      id: { type: Sequelize.CHAR(36), primaryKey: true, allowNull: false },
      city_id: cityFk,
      zone_id: zoneFk,
      kind: { type: Sequelize.STRING(16), allowNull: false, defaultValue: 'none' },
      source_type: { type: Sequelize.STRING(16), allowNull: false, defaultValue: 'rain' },
      source_q: { type: Sequelize.INTEGER, allowNull: true },
      source_r: { type: Sequelize.INTEGER, allowNull: true },
      source_distance: { type: Sequelize.INTEGER, allowNull: true },
      natural_supply: { type: Sequelize.FLOAT, allowNull: false, defaultValue: 0 },
      supply: { type: Sequelize.FLOAT, allowNull: false, defaultValue: 0 },
      fertility: { type: Sequelize.FLOAT, allowNull: false, defaultValue: 1 },
      ...ts,
    });
    await queryInterface.addIndex('irrigation_networks', ['zone_id'], {
      unique: true,
      name: 'uq_irrigation_networks_zone',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('irrigation_networks');
    await queryInterface.dropTable('crop_cycles');
    await queryInterface.dropTable('farm_zone_tiles');
    await queryInterface.dropTable('farm_zones');
    await queryInterface.dropTable('crop_types');
  },
};
