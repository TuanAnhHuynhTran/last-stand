'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('city_chunks', {
      id: {
        type: Sequelize.CHAR(36),
        primaryKey: true,
        allowNull: false,
      },
      city_id: {
        type: Sequelize.CHAR(36),
        allowNull: false,
        references: {
          model: 'cities',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      chunk_x: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      chunk_z: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      revision: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      biome_summary: {
        type: Sequelize.STRING(32),
        allowNull: false,
        defaultValue: 'grass',
      },
      seed_hash: {
        type: Sequelize.STRING(64),
        allowNull: false,
      },
      terrain_delta: {
        type: Sequelize.JSON,
        allowNull: false,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    await queryInterface.addIndex('city_chunks', ['city_id', 'chunk_x', 'chunk_z'], {
      unique: true,
      name: 'uq_city_chunks_city_coords',
    });

    await queryInterface.addIndex('city_chunks', ['city_id'], {
      name: 'idx_city_chunks_city_id',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('city_chunks');
  },
};
