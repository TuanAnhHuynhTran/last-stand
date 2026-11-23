'use strict';

/**
 * Phase 6 — fish ponds, water terrain & aquaculture.
 *
 * fish_species is filled at server start from @cityverse/shared. Like livestock farms, a water
 * body owns a world_buildings row (land, level, status, invested) and its hexes are
 * building_footprints rows. water_body_tiles keeps each hex's seed height and dug bed height —
 * the terrain edit the client re-applies on top of the world seed.
 * Harvested fish (fish_<species>, kg) and hatchery fry (fry_<species>) live in city_resources.
 */
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const ts = {
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    };
    const fk = (model) => ({
      type: Sequelize.CHAR(36),
      allowNull: false,
      references: { model, key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    });
    const float = (defaultValue = 0) => ({ type: Sequelize.FLOAT, allowNull: false, defaultValue });

    await queryInterface.createTable('fish_species', {
      code: { type: Sequelize.STRING(32), primaryKey: true, allowNull: false },
      name: { type: Sequelize.STRING(120), allowNull: false },
      description: { type: Sequelize.STRING(500), allowNull: false, defaultValue: '' },
      fry_price: { type: Sequelize.INTEGER, allowNull: false },
      fry_weight: float(),
      market_weight: float(),
      fingerling_weight: float(),
      grow_seconds: { type: Sequelize.INTEGER, allowNull: false },
      feed_rate: float(),
      min_quality: float(),
      colors: { type: Sequelize.JSON, allowNull: false },
      ...ts,
    });

    await queryInterface.createTable('water_bodies', {
      id: { type: Sequelize.CHAR(36), primaryKey: true, allowNull: false },
      city_id: fk('cities'),
      building_id: { ...fk('world_buildings'), unique: true },
      type: { type: Sequelize.STRING(32), allowNull: false },
      surface_height: float(),
      bottom_height: float(),
      area: float(),
      volume: float(),
      shoreline: float(),
      water_level: float(),
      water_quality: float(0.7),
      feed_stock: float(),
      feed_quality: float(),
      fill_started_at: { type: Sequelize.DATE, allowNull: true },
      fill_finishes_at: { type: Sequelize.DATE, allowNull: true },
      ready_at: { type: Sequelize.DATE, allowNull: true },
      last_simulated_at: { type: Sequelize.DATE, allowNull: false },
      total_harvested: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      ...ts,
    });
    await queryInterface.addIndex('water_bodies', ['city_id'], { name: 'idx_water_bodies_city' });

    await queryInterface.createTable('water_body_tiles', {
      id: { type: Sequelize.CHAR(36), primaryKey: true, allowNull: false },
      city_id: fk('cities'),
      water_body_id: fk('water_bodies'),
      q: { type: Sequelize.INTEGER, allowNull: false },
      r: { type: Sequelize.INTEGER, allowNull: false },
      original_height: float(),
      bed_height: float(),
      shore: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      ...ts,
    });
    await queryInterface.addIndex('water_body_tiles', ['water_body_id', 'q', 'r'], { unique: true, name: 'uq_water_body_tiles_body_hex' });
    await queryInterface.addIndex('water_body_tiles', ['city_id'], { name: 'idx_water_body_tiles_city' });

    await queryInterface.createTable('aquaculture_cycles', {
      id: { type: Sequelize.CHAR(36), primaryKey: true, allowNull: false },
      city_id: fk('cities'),
      water_body_id: fk('water_bodies'),
      status: { type: Sequelize.STRING(16), allowNull: false, defaultValue: 'active' },
      started_at: { type: Sequelize.DATE, allowNull: false },
      harvested_at: { type: Sequelize.DATE, allowNull: true },
      stocked_fish: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      feed_used: float(),
      harvested: { type: Sequelize.JSON, allowNull: false },
      ...ts,
    });
    await queryInterface.addIndex('aquaculture_cycles', ['water_body_id', 'status'], { name: 'idx_aqua_cycles_body_status' });

    await queryInterface.createTable('fish_stock_batches', {
      id: { type: Sequelize.CHAR(36), primaryKey: true, allowNull: false },
      city_id: fk('cities'),
      water_body_id: fk('water_bodies'),
      cycle_id: fk('aquaculture_cycles'),
      species_code: {
        type: Sequelize.STRING(32),
        allowNull: false,
        references: { model: 'fish_species', key: 'code' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      source: { type: Sequelize.STRING(16), allowNull: false, defaultValue: 'market' },
      stocked: { type: Sequelize.INTEGER, allowNull: false },
      alive: float(),
      weight: float(),
      health: float(1),
      satiety: float(0.8),
      status: { type: Sequelize.STRING(16), allowNull: false, defaultValue: 'growing' },
      stocked_at: { type: Sequelize.DATE, allowNull: false },
      harvested_at: { type: Sequelize.DATE, allowNull: true },
      harvest_yield: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      ...ts,
    });
    await queryInterface.addIndex('fish_stock_batches', ['water_body_id', 'status'], { name: 'idx_fish_batches_body_status' });
    await queryInterface.addIndex('fish_stock_batches', ['city_id'], { name: 'idx_fish_batches_city' });

    await queryInterface.createTable('water_quality_records', {
      id: { type: Sequelize.CHAR(36), primaryKey: true, allowNull: false },
      city_id: fk('cities'),
      water_body_id: fk('water_bodies'),
      recorded_at: { type: Sequelize.DATE, allowNull: false },
      quality: float(),
      water_level: float(),
      density: float(),
      feed_stock: float(),
      ...ts,
    });
    await queryInterface.addIndex('water_quality_records', ['water_body_id', 'recorded_at'], { name: 'idx_water_quality_body_time' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('water_quality_records');
    await queryInterface.dropTable('fish_stock_batches');
    await queryInterface.dropTable('aquaculture_cycles');
    await queryInterface.dropTable('water_body_tiles');
    await queryInterface.dropTable('water_bodies');
    await queryInterface.dropTable('fish_species');
  },
};
