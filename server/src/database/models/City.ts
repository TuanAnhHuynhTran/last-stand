import {
  DataTypes,
  Model,
  type CreationOptional,
  type ForeignKey,
  type InferAttributes,
  type InferCreationAttributes,
  type NonAttribute,
  type Sequelize,
} from 'sequelize';
import { CITY_CONFIG, type TerrainType } from '@cityverse/shared';
import type { User } from './User.js';
import type { CityEconomy } from './CityEconomy.js';
import type { CityMember } from './CityMember.js';

export class City extends Model<InferAttributes<City>, InferCreationAttributes<City>> {
  declare id: CreationOptional<string>;
  declare ownerId: ForeignKey<User['id']>;
  declare name: string;
  declare terrainType: TerrainType;
  declare worldSeed: string;
  declare mapWidth: CreationOptional<number>;
  declare mapHeight: CreationOptional<number>;
  declare level: CreationOptional<number>;
  declare isPublic: CreationOptional<boolean>;
  /** Phase 12: public / friends / private (isPublic mirrors 'public') */
  declare visibility: CreationOptional<string>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare economy?: NonAttribute<CityEconomy>;
  declare members?: NonAttribute<CityMember[]>;
}

export function initCityModel(sequelize: Sequelize): typeof City {
  City.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      ownerId: {
        type: DataTypes.UUID,
        allowNull: false,
        unique: true,
        field: 'owner_id',
      },
      name: {
        type: DataTypes.STRING(60),
        allowNull: false,
      },
      terrainType: {
        type: DataTypes.ENUM('plains', 'coastal', 'highlands', 'valley'),
        allowNull: false,
        field: 'terrain_type',
      },
      worldSeed: {
        type: DataTypes.STRING(64),
        allowNull: false,
        field: 'world_seed',
      },
      mapWidth: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: CITY_CONFIG.MAP_WIDTH,
        field: 'map_width',
      },
      mapHeight: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: CITY_CONFIG.MAP_HEIGHT,
        field: 'map_height',
      },
      level: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: CITY_CONFIG.INITIAL_LEVEL,
      },
      isPublic: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        field: 'is_public',
      },
      visibility: {
        type: DataTypes.STRING(16),
        allowNull: false,
        defaultValue: 'public',
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        field: 'created_at',
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        field: 'updated_at',
      },
    },
    {
      sequelize,
      tableName: 'cities',
      modelName: 'City',
      underscored: true,
      timestamps: true,
    }
  );
  return City;
}
