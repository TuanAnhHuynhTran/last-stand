'use strict';
/** Roads now use their existing anchor + rotation as a persistent edge address.
 * Release only the derived full-hex reservations; retain every road, job and investment. */
module.exports = {
  async up(q) {
    await q.sequelize.transaction(async transaction => {
      await q.sequelize.query("DELETE FROM building_footprints WHERE building_id IN (SELECT id FROM world_buildings WHERE type_code = 'road')", { transaction });
    });
  },
  async down() {
    throw new Error('Edge roads can share plots with buildings. Full-hex occupancy cannot be restored without resolving overlaps.');
  },
};
