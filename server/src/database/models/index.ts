import type { Sequelize } from 'sequelize';
import { initUserModel, User } from './User.js';
import { initRefreshTokenModel, RefreshToken } from './RefreshToken.js';
import { initCharacterModel, Character } from './Character.js';
import { initCityModel, City } from './City.js';
import { initCityMemberModel, CityMember } from './CityMember.js';
import { initCityEconomyModel, CityEconomy } from './CityEconomy.js';
import { initCityChunkModel, CityChunk } from './CityChunk.js';

export interface DatabaseModels {
  sequelize: Sequelize;
  User: typeof User;
  RefreshToken: typeof RefreshToken;
  Character: typeof Character;
  City: typeof City;
  CityMember: typeof CityMember;
  CityEconomy: typeof CityEconomy;
  CityChunk: typeof CityChunk;
}

export function initModels(sequelize: Sequelize): DatabaseModels {
  const UserModel = initUserModel(sequelize);
  const RefreshTokenModel = initRefreshTokenModel(sequelize);
  const CharacterModel = initCharacterModel(sequelize);
  const CityModel = initCityModel(sequelize);
  const CityMemberModel = initCityMemberModel(sequelize);
  const CityEconomyModel = initCityEconomyModel(sequelize);
  const CityChunkModel = initCityChunkModel(sequelize);

  UserModel.hasMany(RefreshTokenModel, {
    foreignKey: 'userId',
    as: 'refreshTokens',
    onDelete: 'CASCADE',
  });
  RefreshTokenModel.belongsTo(UserModel, {
    foreignKey: 'userId',
    as: 'user',
  });

  UserModel.hasOne(CharacterModel, {
    foreignKey: 'userId',
    as: 'character',
    onDelete: 'CASCADE',
  });
  CharacterModel.belongsTo(UserModel, {
    foreignKey: 'userId',
    as: 'user',
  });

  UserModel.hasOne(CityModel, {
    foreignKey: 'ownerId',
    as: 'ownedCity',
    onDelete: 'CASCADE',
  });
  CityModel.belongsTo(UserModel, {
    foreignKey: 'ownerId',
    as: 'owner',
  });

  CityModel.hasMany(CityMemberModel, {
    foreignKey: 'cityId',
    as: 'members',
    onDelete: 'CASCADE',
  });
  CityMemberModel.belongsTo(CityModel, {
    foreignKey: 'cityId',
    as: 'city',
  });

  UserModel.hasMany(CityMemberModel, {
    foreignKey: 'userId',
    as: 'cityMemberships',
    onDelete: 'CASCADE',
  });
  CityMemberModel.belongsTo(UserModel, {
    foreignKey: 'userId',
    as: 'user',
  });

  CityModel.hasOne(CityEconomyModel, {
    foreignKey: 'cityId',
    as: 'economy',
    onDelete: 'CASCADE',
  });
  CityEconomyModel.belongsTo(CityModel, {
    foreignKey: 'cityId',
    as: 'city',
  });

  CityModel.hasMany(CityChunkModel, {
    foreignKey: 'cityId',
    as: 'chunks',
    onDelete: 'CASCADE',
  });
  CityChunkModel.belongsTo(CityModel, {
    foreignKey: 'cityId',
    as: 'city',
  });

  return {
    sequelize,
    User: UserModel,
    RefreshToken: RefreshTokenModel,
    Character: CharacterModel,
    City: CityModel,
    CityMember: CityMemberModel,
    CityEconomy: CityEconomyModel,
    CityChunk: CityChunkModel,
  };
}

export { User, RefreshToken, Character, City, CityMember, CityEconomy, CityChunk };
