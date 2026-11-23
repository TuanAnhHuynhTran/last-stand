'use strict';

/**
 * Phase 9 — horse stables, elephant camps and the mount system.
 * Stables / camps are livestock farms (farm types horse_stable / elephant_camp); horses and
 * elephants are farm_animals with working-animal traits. New tables add training, duties,
 * tack, mounts (UNIQUE animal / UNIQUE soldier) and the care history.
 */
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const ts = {
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    };
    const fk = (model, onDelete = 'CASCADE', allowNull = false) => ({
      type: Sequelize.CHAR(36),
      allowNull,
      references: { model, key: 'id' },
      onUpdate: 'CASCADE',
      onDelete,
    });
    const id = { type: Sequelize.CHAR(36), primaryKey: true, allowNull: false };
    const float = { type: Sequelize.FLOAT, allowNull: false, defaultValue: 0 };

    // Extend the animal table (working-animal traits + starvation timer).
    await queryInterface.addColumn('farm_animals', 'tameness', float);
    await queryInterface.addColumn('farm_animals', 'stamina', float);
    await queryInterface.addColumn('farm_animals', 'speed_bonus', float);
    await queryInterface.addColumn('farm_animals', 'carry_bonus', float);
    await queryInterface.addColumn('farm_animals', 'training_level', { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 });
    await queryInterface.addColumn('farm_animals', 'starving_seconds', float);

    await queryInterface.createTable('animal_training_jobs', {
      id,
      city_id: fk('cities'),
      farm_id: fk('livestock_farms'),
      animal_id: fk('farm_animals'),
      program: { type: Sequelize.STRING(16), allowNull: false },
      started_at: { type: Sequelize.DATE, allowNull: false },
      finishes_at: { type: Sequelize.DATE, allowNull: false },
      status: { type: Sequelize.STRING(16), allowNull: false, defaultValue: 'in_progress' },
      completed_at: { type: Sequelize.DATE, allowNull: true },
      ...ts,
    });
    await queryInterface.addIndex('animal_training_jobs', ['city_id', 'status'], { name: 'idx_animal_training_city_status' });
    await queryInterface.addIndex('animal_training_jobs', ['animal_id'], { name: 'idx_animal_training_animal' });

    await queryInterface.createTable('animal_assignments', {
      id,
      city_id: fk('cities'),
      animal_id: { ...fk('farm_animals'), unique: 'uq_animal_assignments_animal' },
      kind: { type: Sequelize.STRING(16), allowNull: false },
      assigned_at: { type: Sequelize.DATE, allowNull: false },
      ...ts,
    });
    await queryInterface.addIndex('animal_assignments', ['city_id'], { name: 'idx_animal_assignments_city' });

    await queryInterface.createTable('animal_equipment', {
      id,
      animal_id: fk('farm_animals'),
      slot: { type: Sequelize.STRING(16), allowNull: false },
      equipment_code: { type: Sequelize.STRING(32), allowNull: false },
      ...ts,
    });
    await queryInterface.addIndex('animal_equipment', ['animal_id', 'slot'], { unique: true, name: 'uq_animal_equipment_slot' });

    await queryInterface.createTable('mount_assignments', {
      id,
      city_id: fk('cities'),
      animal_id: { ...fk('farm_animals'), unique: 'uq_mount_assignments_animal' },
      unit_id: { ...fk('military_units'), unique: 'uq_mount_assignments_unit' },
      assigned_at: { type: Sequelize.DATE, allowNull: false },
      ...ts,
    });
    await queryInterface.addIndex('mount_assignments', ['city_id'], { name: 'idx_mount_assignments_city' });

    await queryInterface.createTable('animal_care_records', {
      id,
      city_id: fk('cities'),
      farm_id: fk('livestock_farms'),
      animal_id: { type: Sequelize.CHAR(36), allowNull: true },
      kind: { type: Sequelize.STRING(16), allowNull: false },
      note: { type: Sequelize.STRING(200), allowNull: false, defaultValue: '' },
      at: { type: Sequelize.DATE, allowNull: false },
      ...ts,
    });
    await queryInterface.addIndex('animal_care_records', ['city_id', 'at'], { name: 'idx_animal_care_city_time' });
    await queryInterface.addIndex('animal_care_records', ['animal_id'], { name: 'idx_animal_care_animal' });
  },

  async down(queryInterface) {
    for (const t of ['animal_care_records', 'mount_assignments', 'animal_equipment', 'animal_assignments', 'animal_training_jobs']) {
      await queryInterface.dropTable(t);
    }
    for (const c of ['starving_seconds', 'training_level', 'carry_bonus', 'speed_bonus', 'stamina', 'tameness']) {
      await queryInterface.removeColumn('farm_animals', c);
    }
  },
};
