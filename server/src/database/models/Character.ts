import {
  DataTypes,
  Model,
  type CreationOptional,
  type ForeignKey,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from 'sequelize';
import type { CharacterAppearance } from '@cityverse/shared';
import type { User } from './User.js';

export class Character extends Model<
  InferAttributes<Character>,
  InferCreationAttributes<Character>
> {
  declare id: CreationOptional<string>;
  declare userId: ForeignKey<User['id']>;
  declare name: string;
  declare presetId: string;
  declare appearance: CharacterAppearance;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initCharacterModel(sequelize: Sequelize): typeof Character {
  Character.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
        unique: true,
        field: 'user_id',
      },
      name: {
        type: DataTypes.STRING(40),
        allowNull: false,
      },
      presetId: {
        type: DataTypes.STRING(50),
        allowNull: false,
        field: 'preset_id',
      },
      appearance: {
        type: DataTypes.JSON,
        allowNull: false,
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
      tableName: 'characters',
      modelName: 'Character',
      underscored: true,
      timestamps: true,
    }
  );
  return Character;
}
