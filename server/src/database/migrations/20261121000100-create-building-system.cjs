'use strict';

/**
 * Phase 3 — building system.
 * building_types / building_levels are filled at server start from @cityverse/shared
 * (BuildingCatalogService.ensureCatalog), so code and DB never disagree.
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

    await queryInterface.createTable('building_types', {
      code: { type: Sequelize.STRING(32), primaryKey: true, allowNull: false },
      name: { type: Sequelize.STRING(120), allowNull: false },
      category: { type: Sequelize.STRING(32), allowNull: false },
      description: { type: Sequelize.STRING(500), allowNull: false, defaultValue: '' },
      footprint: { type: Sequelize.JSON, allowNull: false },
      max_per_city: { type: Sequelize.INTEGER, allowNull: true },
      max_level: { type: Sequelize.INTEGER, allowNull: false },
      ...ts,
    });

    await queryInterface.createTable('building_levels', {
      id: { type: Sequelize.CHAR(36), primaryKey: true, allowNull: false },
      type_code: {
        type: Sequelize.STRING(32),
        allowNull: false,
        references: { model: 'building_types', key: 'code' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      level: { type: Sequelize.INTEGER, allowNull: false },
      name: { type: Sequelize.STRING(120), allowNull: false },
      description: { type: Sequelize.STRING(500), allowNull: false, defaultValue: '' },
      cost: { type: Sequelize.JSON, allowNull: false },
      build_seconds: { type: Sequelize.INTEGER, allowNull: false },
      stats: { type: Sequelize.JSON, allowNull: false },
      model_key: { type: Sequelize.STRING(64), allowNull: false },
      ...ts,
    });
    await queryInterface.addIndex('building_levels', ['type_code', 'level'], {
      unique: true,
      name: 'uq_building_levels_type_level',
    });

    await queryInterface.createTable('world_buildings', {
      id: { type: Sequelize.CHAR(36), primaryKey: true, allowNull: false },
      city_id: cityFk,
      type_code: {
        type: Sequelize.STRING(32),
        allowNull: false,
        references: { model: 'building_types', key: 'code' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      level: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      status: { type: Sequelize.STRING(16), allowNull: false, defaultValue: 'constructing' },
      anchor_q: { type: Sequelize.INTEGER, allowNull: false },
      anchor_r: { type: Sequelize.INTEGER, allowNull: false },
      rotation: { type: Sequelize.TINYINT, allowNull: false, defaultValue: 0 },
      created_by: { type: Sequelize.CHAR(36), allowNull: false },
      invested: { type: Sequelize.JSON, allowNull: false },
      ...ts,
    });
    await queryInterface.addIndex('world_buildings', ['city_id'], { name: 'idx_world_buildings_city' });

    const buildingFk = {
      type: Sequelize.CHAR(36),
      allowNull: false,
      references: { model: 'world_buildings', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    };

    await queryInterface.createTable('building_footprints', {
      id: { type: Sequelize.CHAR(36), primaryKey: true, allowNull: false },
      city_id: cityFk,
      building_id: buildingFk,
      q: { type: Sequelize.INTEGER, allowNull: false },
      r: { type: Sequelize.INTEGER, allowNull: false },
      ...ts,
    });
    // One building per hex per city — enforced by the database, not just the service.
    await queryInterface.addIndex('building_footprints', ['city_id', 'q', 'r'], {
      unique: true,
      name: 'uq_building_footprints_city_hex',
    });
    await queryInterface.addIndex('building_footprints', ['building_id'], {
      name: 'idx_building_footprints_building',
    });

    await queryInterface.createTable('building_construction_jobs', {
      id: { type: Sequelize.CHAR(36), primaryKey: true, allowNull: false },
      city_id: cityFk,
      building_id: buildingFk,
      job_type: { type: Sequelize.STRING(16), allowNull: false },
      from_level: { type: Sequelize.INTEGER, allowNull: false },
      target_level: { type: Sequelize.INTEGER, allowNull: false },
      cost: { type: Sequelize.JSON, allowNull: false },
      started_at: { type: Sequelize.DATE, allowNull: false },
      finishes_at: { type: Sequelize.DATE, allowNull: false },
      completed_at: { type: Sequelize.DATE, allowNull: true },
      status: { type: Sequelize.STRING(16), allowNull: false, defaultValue: 'in_progress' },
      ...ts,
    });
    await queryInterface.addIndex('building_construction_jobs', ['city_id', 'status'], {
      name: 'idx_construction_jobs_city_status',
    });
    await queryInterface.addIndex('building_construction_jobs', ['building_id'], {
      name: 'idx_construction_jobs_building',
    });

    await queryInterface.createTable('city_resources', {
      id: { type: Sequelize.CHAR(36), primaryKey: true, allowNull: false },
      city_id: cityFk,
      resource_code: { type: Sequelize.STRING(32), allowNull: false },
      amount: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 0 },
      ...ts,
    });
    await queryInterface.addIndex('city_resources', ['city_id', 'resource_code'], {
      unique: true,
      name: 'uq_city_resources_city_code',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('city_resources');
    await queryInterface.dropTable('building_construction_jobs');
    await queryInterface.dropTable('building_footprints');
    await queryInterface.dropTable('world_buildings');
    await queryInterface.dropTable('building_levels');
    await queryInterface.dropTable('building_types');
  },
};
