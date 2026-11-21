import {
  DataTypes,
  Model,
  type CreationOptional,
  type ForeignKey,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from 'sequelize';
import type { CityMemberRole } from '@cityverse/shared';
import type { City } from './City.js';
import type { User } from './User.js';

export class CityMember extends Model<
  InferAttributes<CityMember>,
  InferCreationAttributes<CityMember>
> {
  declare id: CreationOptional<string>;
  declare cityId: ForeignKey<City['id']>;
  declare userId: ForeignKey<User['id']>;
  declare role: CityMemberRole;
  declare joinedAt: CreationOptional<Date>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initCityMemberModel(sequelize: Sequelize): typeof CityMember {
  CityMember.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      cityId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'city_id',
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'user_id',
      },
      role: {
        type: DataTypes.ENUM('owner', 'co_mayor', 'visitor'),
        allowNull: false,
        defaultValue: 'visitor',
      },
      joinedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        field: 'joined_at',
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
      tableName: 'city_members',
      modelName: 'CityMember',
      underscored: true,
      timestamps: true,
      indexes: [
        {
          unique: true,
          fields: ['city_id', 'user_id'],
          name: 'uniq_city_members_city_user',
        },
      ],
    }
  );
  return CityMember;
}
