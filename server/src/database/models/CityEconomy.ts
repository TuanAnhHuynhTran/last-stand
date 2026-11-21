import {
  DataTypes,
  Model,
  type CreationOptional,
  type ForeignKey,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from 'sequelize';
import { CITY_CONFIG } from '@cityverse/shared';
import type { City } from './City.js';

export class CityEconomy extends Model<
  InferAttributes<CityEconomy>,
  InferCreationAttributes<CityEconomy>
> {
  declare id: CreationOptional<string>;
  declare cityId: ForeignKey<City['id']>;
  declare cityCoins: CreationOptional<number>;
  declare population: CreationOptional<number>;
  declare happiness: CreationOptional<number>;
  declare taxRate: CreationOptional<number>;
  declare powerCapacity: CreationOptional<number>;
  declare powerUsage: CreationOptional<number>;
  declare waterCapacity: CreationOptional<number>;
  declare waterUsage: CreationOptional<number>;
  declare lastTickAt: CreationOptional<Date | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initCityEconomyModel(sequelize: Sequelize): typeof CityEconomy {
  CityEconomy.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      cityId: {
        type: DataTypes.UUID,
        allowNull: false,
        unique: true,
        field: 'city_id',
      },
      cityCoins: {
        type: DataTypes.BIGINT,
        allowNull: false,
        defaultValue: CITY_CONFIG.INITIAL_COINS,
        field: 'city_coins',
        get() {
          const raw = this.getDataValue('cityCoins');
          return Number(raw);
        },
      },
      population: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: CITY_CONFIG.INITIAL_POPULATION,
      },
      happiness: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: CITY_CONFIG.INITIAL_HAPPINESS,
      },
      taxRate: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: CITY_CONFIG.INITIAL_TAX_RATE,
        field: 'tax_rate',
        get() {
          const raw = this.getDataValue('taxRate');
          return Number(raw);
        },
      },
      powerCapacity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        field: 'power_capacity',
      },
      powerUsage: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        field: 'power_usage',
      },
      waterCapacity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        field: 'water_capacity',
      },
      waterUsage: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        field: 'water_usage',
      },
      lastTickAt: {
        type: DataTypes.DATE,
        allowNull: true,
        defaultValue: null,
        field: 'last_tick_at',
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
      tableName: 'city_economies',
      modelName: 'CityEconomy',
      underscored: true,
      timestamps: true,
    }
  );
  return CityEconomy;
}
