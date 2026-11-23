'use strict';
/** Older manual SQL installs recorded Phase 5 as applied but used the v1 columns.
 * Add the missing schema without dropping tables, animals, cities or player data.
 * Populated v1 farms need an explicit land/animal conversion; fail before any DDL there.
 */
module.exports = {
  async up(q, S) {
    const farms = await q.describeTable('livestock_farms');
    if (farms.building_id) return;
    for (const name of ['livestock_farms', 'livestock_farm_tiles', 'farm_animals', 'livestock_production_jobs']) {
      const [rows] = await q.sequelize.query(`SELECT COUNT(*) AS n FROM \`${name}\``);
      if (Number(rows[0].n)) throw new Error('Legacy livestock contains data; a data-preserving v1 land conversion is required before this migration. No tables changed.');
    }
    const tables = await q.showAllTables();
    const old = require('./20261121000300-create-livestock.cjs');
    await old.up({
      createTable: async (name, fields) => { if (['animal_species', 'animal_feed_recipes'].includes(name) && !tables.includes(name)) await q.createTable(name, fields); },
      addIndex: async () => {},
    }, S);
    const add = async (table, fields) => {
      const cols = await q.describeTable(table);
      for (const [name, field] of Object.entries(fields)) if (!cols[name]) await q.addColumn(table, name, field);
    };
    const zero = { type: S.FLOAT, allowNull: false, defaultValue: 0 };
    await add('livestock_farms', {
      building_id: { type: S.CHAR(36), allowNull: false, references: { model: 'world_buildings', key: 'id' }, onDelete: 'CASCADE' },
      feed_stock: zero, feed_quality: zero, water_stock: zero,
      water_source: { type: S.STRING(16), allowNull: false, defaultValue: 'well' },
      caretakers: { type: S.INTEGER, allowNull: false, defaultValue: 0 },
      last_simulated_at: { type: S.DATE, allowNull: false },
    });
    await q.addIndex('livestock_farms', ['building_id'], { unique: true });
    // Retain obsolete columns for compatibility, but new writes no longer populate them.
    await q.changeColumn('livestock_farms', 'created_by', { type: S.CHAR(36), allowNull: true });
    await q.changeColumn('livestock_farms', 'invested', { type: S.JSON, allowNull: true });
    await add('livestock_farm_tiles', { role: { type: S.STRING(16), allowNull: false, defaultValue: 'yard' } });
    await add('farm_animals', {
      species_code: { type: S.STRING(32), allowNull: false }, breed: { type: S.STRING(32), allowNull: false },
      health: { ...zero, defaultValue: 1 }, satiety: { ...zero, defaultValue: 1 }, thirst: zero,
      status: { type: S.STRING(16), allowNull: false, defaultValue: 'young' },
    });
    await q.changeColumn('farm_animals', 'animal_code', { type: S.STRING(32), allowNull: true });
    await add('livestock_production_jobs', {
      species_code: { type: S.STRING(32), allowNull: true }, breed: { type: S.STRING(32), allowNull: true },
      progress: { type: S.JSON, allowNull: false }, efficiency: zero, productive_seconds: zero, animal_seconds: zero,
      collected_at: { type: S.DATE, allowNull: true },
    });
    await q.changeColumn('livestock_production_jobs', 'feed', { type: S.JSON, allowNull: true });
  },
  async down() { throw new Error('Forward-only compatibility migration: reverting would discard new livestock data.'); },
};
