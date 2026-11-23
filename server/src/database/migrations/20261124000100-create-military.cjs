'use strict';

/**
 * Phase 8 — military barracks & four soldier classes (no combat yet).
 * unit_types / equipment_types are seeded at server start from @cityverse/shared.
 * military_units.survivor_id is UNIQUE: a soldier is a real citizen, at most once.
 * Training jobs carry server timestamps and are completed with a conditional UPDATE.
 */
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const ts = {
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    };
    const fk = (model, key = 'id', onDelete = 'CASCADE', allowNull = false) => ({
      type: Sequelize.CHAR(36),
      allowNull,
      references: { model, key },
      onUpdate: 'CASCADE',
      onDelete,
    });
    const id = { type: Sequelize.CHAR(36), primaryKey: true, allowNull: false };

    await queryInterface.createTable('unit_types', {
      code: { type: Sequelize.STRING(32), primaryKey: true, allowNull: false },
      name: { type: Sequelize.STRING(120), allowNull: false },
      role: { type: Sequelize.STRING(120), allowNull: false, defaultValue: '' },
      building_type: { type: Sequelize.STRING(32), allowNull: false },
      base: { type: Sequelize.JSON, allowNull: false },
      train_seconds: { type: Sequelize.INTEGER, allowNull: false },
      food: { type: Sequelize.INTEGER, allowNull: false },
      coins: { type: Sequelize.INTEGER, allowNull: false },
      required: { type: Sequelize.JSON, allowNull: false },
      drills: { type: Sequelize.JSON, allowNull: false },
      ...ts,
    });

    await queryInterface.createTable('equipment_types', {
      code: { type: Sequelize.STRING(32), primaryKey: true, allowNull: false },
      name: { type: Sequelize.STRING(120), allowNull: false },
      slot: { type: Sequelize.STRING(16), allowNull: false },
      bonus: { type: Sequelize.JSON, allowNull: false },
      units: { type: Sequelize.JSON, allowNull: false },
      ...ts,
    });

    await queryInterface.createTable('military_units', {
      id,
      city_id: fk('cities'),
      survivor_id: { ...fk('survivors'), unique: 'uq_military_units_survivor' },
      unit_type_code: { type: Sequelize.STRING(32), allowNull: false },
      building_id: fk('world_buildings', 'id', 'SET NULL', true),
      rank: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      xp: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      status: { type: Sequelize.STRING(16), allowNull: false, defaultValue: 'recruit' },
      recruited_at: { type: Sequelize.DATE, allowNull: false },
      trained_at: { type: Sequelize.DATE, allowNull: true },
      ...ts,
    });
    await queryInterface.addIndex('military_units', ['city_id'], { name: 'idx_military_units_city' });

    await queryInterface.createTable('unit_equipment', {
      id,
      unit_id: fk('military_units'),
      slot: { type: Sequelize.STRING(16), allowNull: false },
      equipment_code: { type: Sequelize.STRING(32), allowNull: false },
      ...ts,
    });
    await queryInterface.addIndex('unit_equipment', ['unit_id', 'slot'], { unique: true, name: 'uq_unit_equipment_slot' });

    await queryInterface.createTable('military_training_jobs', {
      id,
      city_id: fk('cities'),
      building_id: fk('world_buildings'),
      kind: { type: Sequelize.STRING(16), allowNull: false },
      unit_type_code: { type: Sequelize.STRING(32), allowNull: true },
      unit_ids: { type: Sequelize.JSON, allowNull: false },
      started_at: { type: Sequelize.DATE, allowNull: false },
      finishes_at: { type: Sequelize.DATE, allowNull: false },
      status: { type: Sequelize.STRING(16), allowNull: false, defaultValue: 'in_progress' },
      completed_at: { type: Sequelize.DATE, allowNull: true },
      ...ts,
    });
    await queryInterface.addIndex('military_training_jobs', ['city_id', 'status'], { name: 'idx_military_jobs_city_status' });

    await queryInterface.createTable('military_squads', {
      id,
      city_id: fk('cities'),
      name: { type: Sequelize.STRING(40), allowNull: false },
      formation: { type: Sequelize.STRING(16), allowNull: false, defaultValue: 'line' },
      status: { type: Sequelize.STRING(16), allowNull: false, defaultValue: 'standby' },
      ...ts,
    });
    await queryInterface.addIndex('military_squads', ['city_id'], { name: 'idx_military_squads_city' });

    await queryInterface.createTable('military_squad_members', {
      id,
      squad_id: fk('military_squads'),
      unit_id: fk('military_units'),
      position: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      ...ts,
    });
    await queryInterface.addIndex('military_squad_members', ['squad_id', 'unit_id'], { unique: true, name: 'uq_squad_members_squad_unit' });
    await queryInterface.addIndex('military_squad_members', ['unit_id'], { name: 'idx_squad_members_unit' });
  },

  async down(queryInterface) {
    for (const t of ['military_squad_members', 'military_squads', 'military_training_jobs', 'unit_equipment', 'military_units', 'equipment_types', 'unit_types']) {
      await queryInterface.dropTable(t);
    }
  },
};
