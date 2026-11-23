'use strict';

/**
 * Phase 5 — livestock farms & animal simulation.
 *
 * animal_species / animal_feed_recipes are filled at server start from @cityverse/shared
 * (LivestockCatalogService). A farm's land is NOT stored here: every livestock farm owns a
 * world_buildings row (type_code = farm type, level, status, invested) and its hexes are
 * building_footprints rows — the single land-claim system shared with buildings.
 * Products (eggs, meat, milk, wool, manure, draft) live in city_resources.
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

    await queryInterface.createTable('animal_species', {
      code: { type: Sequelize.STRING(32), primaryKey: true, allowNull: false },
      name: { type: Sequelize.STRING(120), allowNull: false },
      farm_type: { type: Sequelize.STRING(32), allowNull: false },
      price: { type: Sequelize.INTEGER, allowNull: false },
      grow_seconds: { type: Sequelize.INTEGER, allowNull: false },
      lifespan_seconds: { type: Sequelize.INTEGER, allowNull: false },
      capacity_per_hex: { type: Sequelize.FLOAT, allowNull: false },
      feed_per_minute: { type: Sequelize.FLOAT, allowNull: false },
      water_per_minute: { type: Sequelize.FLOAT, allowNull: false },
      products: { type: Sequelize.JSON, allowNull: false },
      meat_yield: { type: Sequelize.INTEGER, allowNull: false },
      production_seconds: { type: Sequelize.INTEGER, allowNull: false },
      breed_seconds: { type: Sequelize.INTEGER, allowNull: false },
      animals_per_caretaker: { type: Sequelize.INTEGER, allowNull: false },
      breeds: { type: Sequelize.JSON, allowNull: false },
      ...ts,
    });

    await queryInterface.createTable('animal_feed_recipes', {
      code: { type: Sequelize.STRING(32), primaryKey: true, allowNull: false },
      name: { type: Sequelize.STRING(120), allowNull: false },
      description: { type: Sequelize.STRING(500), allowNull: false, defaultValue: '' },
      ingredients: { type: Sequelize.JSON, allowNull: false },
      nutrition: { type: Sequelize.INTEGER, allowNull: false },
      quality: { type: Sequelize.FLOAT, allowNull: false, defaultValue: 0 },
      species: { type: Sequelize.JSON, allowNull: false },
      ...ts,
    });

    await queryInterface.createTable('livestock_farms', {
      id: { type: Sequelize.CHAR(36), primaryKey: true, allowNull: false },
      city_id: cityFk,
      building_id: {
        type: Sequelize.CHAR(36),
        allowNull: false,
        unique: true,
        references: { model: 'world_buildings', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      farm_type: { type: Sequelize.STRING(32), allowNull: false },
      feed_stock: { type: Sequelize.FLOAT, allowNull: false, defaultValue: 0 },
      feed_quality: { type: Sequelize.FLOAT, allowNull: false, defaultValue: 0 },
      water_stock: { type: Sequelize.FLOAT, allowNull: false, defaultValue: 0 },
      water_source: { type: Sequelize.STRING(16), allowNull: false, defaultValue: 'well' },
      caretakers: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      last_simulated_at: { type: Sequelize.DATE, allowNull: false },
      total_produced: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      ...ts,
    });
    await queryInterface.addIndex('livestock_farms', ['city_id'], { name: 'idx_livestock_farms_city' });

    const farmFk = {
      type: Sequelize.CHAR(36),
      allowNull: false,
      references: { model: 'livestock_farms', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    };

    // Role of each hex (barn, yard, feeder, water, caretaker, storage, nursery, waste).
    // Land uniqueness is enforced by building_footprints (city_id, q, r).
    await queryInterface.createTable('livestock_farm_tiles', {
      id: { type: Sequelize.CHAR(36), primaryKey: true, allowNull: false },
      city_id: cityFk,
      farm_id: farmFk,
      q: { type: Sequelize.INTEGER, allowNull: false },
      r: { type: Sequelize.INTEGER, allowNull: false },
      role: { type: Sequelize.STRING(16), allowNull: false, defaultValue: 'yard' },
      ...ts,
    });
    await queryInterface.addIndex('livestock_farm_tiles', ['farm_id', 'q', 'r'], {
      unique: true,
      name: 'uq_livestock_farm_tiles_farm_hex',
    });
    await queryInterface.addIndex('livestock_farm_tiles', ['city_id'], { name: 'idx_livestock_farm_tiles_city' });

    await queryInterface.createTable('farm_animals', {
      id: { type: Sequelize.CHAR(36), primaryKey: true, allowNull: false },
      city_id: cityFk,
      farm_id: farmFk,
      species_code: {
        type: Sequelize.STRING(32),
        allowNull: false,
        references: { model: 'animal_species', key: 'code' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      breed: { type: Sequelize.STRING(32), allowNull: false },
      name: { type: Sequelize.STRING(40), allowNull: false },
      born_at: { type: Sequelize.DATE, allowNull: false },
      grows_up_at: { type: Sequelize.DATE, allowNull: false },
      health: { type: Sequelize.FLOAT, allowNull: false, defaultValue: 1 },
      satiety: { type: Sequelize.FLOAT, allowNull: false, defaultValue: 1 },
      thirst: { type: Sequelize.FLOAT, allowNull: false, defaultValue: 0 },
      status: { type: Sequelize.STRING(16), allowNull: false, defaultValue: 'young' },
      ...ts,
    });
    await queryInterface.addIndex('farm_animals', ['farm_id'], { name: 'idx_farm_animals_farm' });
    await queryInterface.addIndex('farm_animals', ['city_id'], { name: 'idx_farm_animals_city' });

    await queryInterface.createTable('livestock_production_jobs', {
      id: { type: Sequelize.CHAR(36), primaryKey: true, allowNull: false },
      city_id: cityFk,
      farm_id: farmFk,
      job_type: { type: Sequelize.STRING(16), allowNull: false },
      species_code: { type: Sequelize.STRING(32), allowNull: true },
      breed: { type: Sequelize.STRING(32), allowNull: true },
      started_at: { type: Sequelize.DATE, allowNull: false },
      finishes_at: { type: Sequelize.DATE, allowNull: false },
      status: { type: Sequelize.STRING(16), allowNull: false, defaultValue: 'in_progress' },
      progress: { type: Sequelize.JSON, allowNull: false },
      output: { type: Sequelize.JSON, allowNull: false },
      efficiency: { type: Sequelize.FLOAT, allowNull: false, defaultValue: 0 },
      productive_seconds: { type: Sequelize.FLOAT, allowNull: false, defaultValue: 0 },
      animal_seconds: { type: Sequelize.FLOAT, allowNull: false, defaultValue: 0 },
      completed_at: { type: Sequelize.DATE, allowNull: true },
      collected_at: { type: Sequelize.DATE, allowNull: true },
      ...ts,
    });
    await queryInterface.addIndex('livestock_production_jobs', ['farm_id', 'status'], {
      name: 'idx_livestock_jobs_farm_status',
    });
    await queryInterface.addIndex('livestock_production_jobs', ['city_id'], { name: 'idx_livestock_jobs_city' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('livestock_production_jobs');
    await queryInterface.dropTable('farm_animals');
    await queryInterface.dropTable('livestock_farm_tiles');
    await queryInterface.dropTable('livestock_farms');
    await queryInterface.dropTable('animal_feed_recipes');
    await queryInterface.dropTable('animal_species');
  },
};
