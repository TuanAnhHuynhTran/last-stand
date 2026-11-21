'use strict';

const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const existing = await queryInterface.sequelize.query(
      "SELECT id FROM users WHERE email = 'mayor@cityverse.io' LIMIT 1",
      { type: queryInterface.sequelize.QueryTypes.SELECT }
    );

    if (existing.length > 0) {
      return;
    }

    const now = new Date();
    const userId = crypto.randomUUID();
    const characterId = crypto.randomUUID();
    const cityId = crypto.randomUUID();
    const memberId = crypto.randomUUID();
    const economyId = crypto.randomUUID();
    const passwordHash = await bcrypt.hash('CityVerse2026', 12);

    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.bulkInsert(
        'users',
        [
          {
            id: userId,
            email: 'mayor@cityverse.io',
            username: 'mayor_demo',
            password_hash: passwordHash,
            status: 'active',
            created_at: now,
            updated_at: now,
          },
        ],
        { transaction }
      );

      await queryInterface.bulkInsert(
        'characters',
        [
          {
            id: characterId,
            user_id: userId,
            name: 'Mayor Nova',
            preset_id: 'visionary-mayor',
            appearance: JSON.stringify({
              bodyType: 'classic',
              skinTone: '#d9a077',
              hairStyle: 'wavy',
              hairColor: '#3b2f2f',
              outfitStyle: 'mayor',
              outfitPrimaryColor: '#10b981',
              outfitSecondaryColor: '#1e293b',
              accessory: 'scarf',
              modelKey: 'character_mayor_v1',
            }),
            created_at: now,
            updated_at: now,
          },
        ],
        { transaction }
      );

      await queryInterface.bulkInsert(
        'cities',
        [
          {
            id: cityId,
            owner_id: userId,
            name: 'Aurora Bay',
            terrain_type: 'coastal',
            world_seed: 'CV-COA-DEMO2026A1B2',
            map_width: 128,
            map_height: 128,
            level: 1,
            is_public: true,
            created_at: now,
            updated_at: now,
          },
        ],
        { transaction }
      );

      await queryInterface.bulkInsert(
        'city_members',
        [
          {
            id: memberId,
            city_id: cityId,
            user_id: userId,
            role: 'owner',
            joined_at: now,
            created_at: now,
            updated_at: now,
          },
        ],
        { transaction }
      );

      await queryInterface.bulkInsert(
        'city_economies',
        [
          {
            id: economyId,
            city_id: cityId,
            city_coins: 250000,
            population: 0,
            happiness: 75,
            tax_rate: 8.0,
            power_capacity: 0,
            power_usage: 0,
            water_capacity: 0,
            water_usage: 0,
            last_tick_at: null,
            created_at: now,
            updated_at: now,
          },
        ],
        { transaction }
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('users', { email: 'mayor@cityverse.io' });
  },
};
