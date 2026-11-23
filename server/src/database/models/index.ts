import { initSocialModels, FriendRequest, Friendship, Notification, PvpSeason, PvpRating, PvpQueueEntry, PvpRoom, PvpMatch, Alliance, AllianceRole, AllianceMember, AllianceMessage, AllianceInvite, AllianceQuest } from './Social.js';
import { initBattleModels, BattleInstance, BattleParticipant, BattleUnitRecord, BattleActionRecord, BattleTurn, BattleReward } from './Battle.js';
import { initExplorationModels, WorldScanJob, WorldClaimJob, WorldDiscovery, WorldPointOfInterest } from './Exploration.js';
import type { Sequelize } from 'sequelize';
import { initUserModel, User } from './User.js';
import { initRefreshTokenModel, RefreshToken } from './RefreshToken.js';
import { initCharacterModel, Character } from './Character.js';
import { initCityModel, City } from './City.js';
import { initCityMemberModel, CityMember } from './CityMember.js';
import { initCityEconomyModel, CityEconomy } from './CityEconomy.js';
import { initCityChunkModel, CityChunk } from './CityChunk.js';
import {
  initBuildingModels,
  BuildingConstructionJob,
  BuildingFootprint,
  BuildingLevel,
  BuildingType,
  CityResource,
  WorldBuilding,
} from './Building.js';
import { initFarmModels, CropCycle, CropType, FarmZone, FarmZoneTile, IrrigationNetwork } from './Farm.js';
import {
  initLivestockModels,
  AnimalFeedRecipe,
  AnimalSpecies,
  FarmAnimal,
  LivestockFarm,
  LivestockFarmTile,
  LivestockProductionJob,
} from './Livestock.js';
import {
  initAquacultureModels,
  AquacultureCycle,
  FishSpecies,
  FishStockBatch,
  WaterBody,
  WaterBodyTile,
  WaterQualityRecord,
} from './Aquaculture.js';
import {
  initPopulationModels,
  Profession,
  ProductionJob,
  ProductionRecipe,
  ResourceTransaction,
  Survivor,
  SurvivorHousing,
  SurvivorJob,
  WorldTimeState,
} from './Population.js';
import {
  initMilitaryModels,
  EquipmentType,
  MilitarySquad,
  MilitarySquadMember,
  MilitaryTrainingJob,
  MilitaryUnit,
  UnitEquipment,
  UnitType,
} from './Military.js';
import { initMountModels, AnimalAssignment, AnimalCareRecord, AnimalEquipment, AnimalTrainingJob, MountAssignment } from './Mounts.js';

export interface DatabaseModels {
  BattleInstance: typeof BattleInstance;
  BattleParticipant: typeof BattleParticipant;
  BattleUnitRecord: typeof BattleUnitRecord;
  BattleActionRecord: typeof BattleActionRecord;
  BattleTurn: typeof BattleTurn;
  BattleReward: typeof BattleReward;
  FriendRequest: typeof FriendRequest;
  Friendship: typeof Friendship;
  Notification: typeof Notification;
  PvpSeason: typeof PvpSeason;
  PvpRating: typeof PvpRating;
  PvpQueueEntry: typeof PvpQueueEntry;
  PvpRoom: typeof PvpRoom;
  PvpMatch: typeof PvpMatch;
  Alliance: typeof Alliance;
  AllianceRole: typeof AllianceRole;
  AllianceMember: typeof AllianceMember;
  AllianceMessage: typeof AllianceMessage;
  AllianceInvite: typeof AllianceInvite;
  AllianceQuest: typeof AllianceQuest;
  WorldScanJob: typeof WorldScanJob;
  WorldClaimJob: typeof WorldClaimJob;
  WorldDiscovery: typeof WorldDiscovery;
  WorldPointOfInterest: typeof WorldPointOfInterest;
  sequelize: Sequelize;
  User: typeof User;
  RefreshToken: typeof RefreshToken;
  Character: typeof Character;
  City: typeof City;
  CityMember: typeof CityMember;
  CityEconomy: typeof CityEconomy;
  CityChunk: typeof CityChunk;
  BuildingType: typeof BuildingType;
  BuildingLevel: typeof BuildingLevel;
  WorldBuilding: typeof WorldBuilding;
  BuildingFootprint: typeof BuildingFootprint;
  BuildingConstructionJob: typeof BuildingConstructionJob;
  CityResource: typeof CityResource;
  CropType: typeof CropType;
  FarmZone: typeof FarmZone;
  FarmZoneTile: typeof FarmZoneTile;
  CropCycle: typeof CropCycle;
  IrrigationNetwork: typeof IrrigationNetwork;
  AnimalSpecies: typeof AnimalSpecies;
  AnimalFeedRecipe: typeof AnimalFeedRecipe;
  LivestockFarm: typeof LivestockFarm;
  LivestockFarmTile: typeof LivestockFarmTile;
  FarmAnimal: typeof FarmAnimal;
  LivestockProductionJob: typeof LivestockProductionJob;
  FishSpecies: typeof FishSpecies;
  WaterBody: typeof WaterBody;
  WaterBodyTile: typeof WaterBodyTile;
  FishStockBatch: typeof FishStockBatch;
  AquacultureCycle: typeof AquacultureCycle;
  WaterQualityRecord: typeof WaterQualityRecord;
  Profession: typeof Profession;
  ProductionRecipe: typeof ProductionRecipe;
  Survivor: typeof Survivor;
  SurvivorHousing: typeof SurvivorHousing;
  SurvivorJob: typeof SurvivorJob;
  ProductionJob: typeof ProductionJob;
  ResourceTransaction: typeof ResourceTransaction;
  WorldTimeState: typeof WorldTimeState;
  UnitType: typeof UnitType;
  EquipmentType: typeof EquipmentType;
  MilitaryUnit: typeof MilitaryUnit;
  UnitEquipment: typeof UnitEquipment;
  MilitaryTrainingJob: typeof MilitaryTrainingJob;
  MilitarySquad: typeof MilitarySquad;
  MilitarySquadMember: typeof MilitarySquadMember;
  AnimalTrainingJob: typeof AnimalTrainingJob;
  AnimalAssignment: typeof AnimalAssignment;
  AnimalEquipment: typeof AnimalEquipment;
  MountAssignment: typeof MountAssignment;
  AnimalCareRecord: typeof AnimalCareRecord;
}

export function initModels(sequelize: Sequelize): DatabaseModels {
  const UserModel = initUserModel(sequelize);
  const RefreshTokenModel = initRefreshTokenModel(sequelize);
  const CharacterModel = initCharacterModel(sequelize);
  const CityModel = initCityModel(sequelize);
  const CityMemberModel = initCityMemberModel(sequelize);
  const CityEconomyModel = initCityEconomyModel(sequelize);
  const CityChunkModel = initCityChunkModel(sequelize);
  const B = initBuildingModels(sequelize);
  const F = initFarmModels(sequelize);
  const L = initLivestockModels(sequelize);
  const A = initAquacultureModels(sequelize);
  const P = initPopulationModels(sequelize);
  const M = initMilitaryModels(sequelize);
  const W = initMountModels(sequelize);
  const E = initExplorationModels(sequelize);
  const Battle = initBattleModels(sequelize);
  const Social = initSocialModels(sequelize);

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

  B.BuildingType.hasMany(B.BuildingLevel, { foreignKey: 'typeCode', sourceKey: 'code', as: 'levels' });
  B.BuildingLevel.belongsTo(B.BuildingType, { foreignKey: 'typeCode', targetKey: 'code', as: 'type' });
  CityModel.hasMany(B.WorldBuilding, { foreignKey: 'cityId', as: 'buildings', onDelete: 'CASCADE' });
  B.WorldBuilding.belongsTo(CityModel, { foreignKey: 'cityId', as: 'city' });
  B.WorldBuilding.belongsTo(B.BuildingType, { foreignKey: 'typeCode', targetKey: 'code', as: 'type' });
  B.WorldBuilding.hasMany(B.BuildingFootprint, { foreignKey: 'buildingId', as: 'footprints', onDelete: 'CASCADE' });
  B.BuildingFootprint.belongsTo(B.WorldBuilding, { foreignKey: 'buildingId', as: 'building' });
  B.WorldBuilding.hasMany(B.BuildingConstructionJob, { foreignKey: 'buildingId', as: 'jobs', onDelete: 'CASCADE' });
  B.BuildingConstructionJob.belongsTo(B.WorldBuilding, { foreignKey: 'buildingId', as: 'building' });
  CityModel.hasMany(B.CityResource, { foreignKey: 'cityId', as: 'resources', onDelete: 'CASCADE' });
  B.CityResource.belongsTo(CityModel, { foreignKey: 'cityId', as: 'city' });

  CityModel.hasMany(F.FarmZone, { foreignKey: 'cityId', as: 'farmZones', onDelete: 'CASCADE' });
  F.FarmZone.belongsTo(CityModel, { foreignKey: 'cityId', as: 'city' });
  F.FarmZone.hasMany(F.FarmZoneTile, { foreignKey: 'zoneId', as: 'tiles', onDelete: 'CASCADE' });
  F.FarmZoneTile.belongsTo(F.FarmZone, { foreignKey: 'zoneId', as: 'zone' });
  F.FarmZone.hasMany(F.CropCycle, { foreignKey: 'zoneId', as: 'cycles', onDelete: 'CASCADE' });
  F.CropCycle.belongsTo(F.FarmZone, { foreignKey: 'zoneId', as: 'zone' });
  F.CropCycle.belongsTo(F.CropType, { foreignKey: 'cropCode', targetKey: 'code', as: 'crop' });
  F.FarmZone.hasOne(F.IrrigationNetwork, { foreignKey: 'zoneId', as: 'irrigation', onDelete: 'CASCADE' });
  F.IrrigationNetwork.belongsTo(F.FarmZone, { foreignKey: 'zoneId', as: 'zone' });

  CityModel.hasMany(L.LivestockFarm, { foreignKey: 'cityId', as: 'livestockFarms', onDelete: 'CASCADE' });
  L.LivestockFarm.belongsTo(CityModel, { foreignKey: 'cityId', as: 'city' });
  L.LivestockFarm.hasMany(L.LivestockFarmTile, { foreignKey: 'farmId', as: 'tiles', onDelete: 'CASCADE' });
  L.LivestockFarmTile.belongsTo(L.LivestockFarm, { foreignKey: 'farmId', as: 'farm' });
  L.LivestockFarm.hasMany(L.FarmAnimal, { foreignKey: 'farmId', as: 'animals', onDelete: 'CASCADE' });
  L.FarmAnimal.belongsTo(L.LivestockFarm, { foreignKey: 'farmId', as: 'farm' });
  L.FarmAnimal.belongsTo(L.AnimalSpecies, { foreignKey: 'speciesCode', targetKey: 'code', as: 'species' });
  // The farm's land is a world_buildings row + building_footprints (one land-claim system).
  B.WorldBuilding.hasOne(L.LivestockFarm, { foreignKey: 'buildingId', as: 'livestockFarm', onDelete: 'CASCADE' });
  L.LivestockFarm.belongsTo(B.WorldBuilding, { foreignKey: 'buildingId', as: 'building' });
  L.LivestockFarm.hasMany(L.LivestockProductionJob, { foreignKey: 'farmId', as: 'jobs', onDelete: 'CASCADE' });
  L.LivestockProductionJob.belongsTo(L.LivestockFarm, { foreignKey: 'farmId', as: 'farm' });

  CityModel.hasMany(A.WaterBody, { foreignKey: 'cityId', as: 'waterBodies', onDelete: 'CASCADE' });
  A.WaterBody.belongsTo(CityModel, { foreignKey: 'cityId', as: 'city' });
  // Like livestock farms, a water body owns a world_buildings row (land + level).
  B.WorldBuilding.hasOne(A.WaterBody, { foreignKey: 'buildingId', as: 'waterBody', onDelete: 'CASCADE' });
  A.WaterBody.belongsTo(B.WorldBuilding, { foreignKey: 'buildingId', as: 'building' });
  A.WaterBody.hasMany(A.WaterBodyTile, { foreignKey: 'waterBodyId', as: 'tiles', onDelete: 'CASCADE' });
  A.WaterBodyTile.belongsTo(A.WaterBody, { foreignKey: 'waterBodyId', as: 'waterBody' });
  A.WaterBody.hasMany(A.FishStockBatch, { foreignKey: 'waterBodyId', as: 'batches', onDelete: 'CASCADE' });
  A.FishStockBatch.belongsTo(A.WaterBody, { foreignKey: 'waterBodyId', as: 'waterBody' });
  A.WaterBody.hasMany(A.AquacultureCycle, { foreignKey: 'waterBodyId', as: 'cycles', onDelete: 'CASCADE' });
  A.AquacultureCycle.belongsTo(A.WaterBody, { foreignKey: 'waterBodyId', as: 'waterBody' });
  A.WaterBody.hasMany(A.WaterQualityRecord, { foreignKey: 'waterBodyId', as: 'qualityRecords', onDelete: 'CASCADE' });
  A.WaterQualityRecord.belongsTo(A.WaterBody, { foreignKey: 'waterBodyId', as: 'waterBody' });
  A.AquacultureCycle.hasMany(A.FishStockBatch, { foreignKey: 'cycleId', as: 'batches', onDelete: 'CASCADE' });
  A.FishStockBatch.belongsTo(A.AquacultureCycle, { foreignKey: 'cycleId', as: 'cycle' });
  A.FishStockBatch.belongsTo(A.FishSpecies, { foreignKey: 'speciesCode', targetKey: 'code', as: 'species' });

  // Villagers: one home and one full-time job each (UNIQUE survivor_id on both tables).
  CityModel.hasMany(P.Survivor, { foreignKey: 'cityId', as: 'survivors', onDelete: 'CASCADE' });
  P.Survivor.belongsTo(CityModel, { foreignKey: 'cityId', as: 'city' });
  P.Survivor.belongsTo(P.Profession, { foreignKey: 'professionCode', targetKey: 'code', as: 'profession' });
  P.Survivor.hasOne(P.SurvivorHousing, { foreignKey: 'survivorId', as: 'home', onDelete: 'CASCADE' });
  P.SurvivorHousing.belongsTo(P.Survivor, { foreignKey: 'survivorId', as: 'survivor' });
  B.WorldBuilding.hasMany(P.SurvivorHousing, { foreignKey: 'buildingId', as: 'residents', onDelete: 'CASCADE' });
  P.SurvivorHousing.belongsTo(B.WorldBuilding, { foreignKey: 'buildingId', as: 'house' });
  P.Survivor.hasOne(P.SurvivorJob, { foreignKey: 'survivorId', as: 'job', onDelete: 'CASCADE' });
  P.SurvivorJob.belongsTo(P.Survivor, { foreignKey: 'survivorId', as: 'survivor' });
  P.SurvivorJob.belongsTo(P.Profession, { foreignKey: 'professionCode', targetKey: 'code', as: 'profession' });
  B.WorldBuilding.hasOne(P.ProductionJob, { foreignKey: 'buildingId', as: 'production', onDelete: 'CASCADE' });
  P.ProductionJob.belongsTo(B.WorldBuilding, { foreignKey: 'buildingId', as: 'building' });
  CityModel.hasMany(P.ResourceTransaction, { foreignKey: 'cityId', as: 'transactions', onDelete: 'CASCADE' });
  CityModel.hasOne(P.WorldTimeState, { foreignKey: 'cityId', as: 'timeState', onDelete: 'CASCADE' });

  // Military: a soldier is a survivor; equipment per slot; squads with members.
  P.Survivor.hasOne(M.MilitaryUnit, { foreignKey: 'survivorId', as: 'soldier', onDelete: 'CASCADE' });
  M.MilitaryUnit.belongsTo(P.Survivor, { foreignKey: 'survivorId', as: 'survivor' });
  M.MilitaryUnit.belongsTo(M.UnitType, { foreignKey: 'unitTypeCode', targetKey: 'code', as: 'unitType' });
  M.MilitaryUnit.belongsTo(B.WorldBuilding, { foreignKey: 'buildingId', as: 'barracks', onDelete: 'SET NULL' });
  M.MilitaryUnit.hasMany(M.UnitEquipment, { foreignKey: 'unitId', as: 'equipment', onDelete: 'CASCADE' });
  M.UnitEquipment.belongsTo(M.MilitaryUnit, { foreignKey: 'unitId', as: 'unit' });
  M.UnitEquipment.belongsTo(M.EquipmentType, { foreignKey: 'equipmentCode', targetKey: 'code', as: 'type' });
  CityModel.hasMany(M.MilitaryTrainingJob, { foreignKey: 'cityId', as: 'trainingJobs', onDelete: 'CASCADE' });
  M.MilitaryTrainingJob.belongsTo(B.WorldBuilding, { foreignKey: 'buildingId', as: 'building', onDelete: 'CASCADE' });
  CityModel.hasMany(M.MilitarySquad, { foreignKey: 'cityId', as: 'squads', onDelete: 'CASCADE' });
  M.MilitarySquad.hasMany(M.MilitarySquadMember, { foreignKey: 'squadId', as: 'members', onDelete: 'CASCADE' });
  M.MilitarySquadMember.belongsTo(M.MilitarySquad, { foreignKey: 'squadId', as: 'squad' });
  M.MilitaryUnit.hasMany(M.MilitarySquadMember, { foreignKey: 'unitId', as: 'memberships', onDelete: 'CASCADE' });
  M.MilitarySquadMember.belongsTo(M.MilitaryUnit, { foreignKey: 'unitId', as: 'unit' });

  // Working animals (Phase 9): training, duties, tack, mounts and care history per farm animal.
  L.FarmAnimal.hasMany(W.AnimalTrainingJob, { foreignKey: 'animalId', as: 'trainingJobs', onDelete: 'CASCADE' });
  W.AnimalTrainingJob.belongsTo(L.LivestockFarm, { foreignKey: 'farmId', as: 'farm', onDelete: 'CASCADE' });
  L.FarmAnimal.hasOne(W.AnimalAssignment, { foreignKey: 'animalId', as: 'assignment', onDelete: 'CASCADE' });
  L.FarmAnimal.hasMany(W.AnimalEquipment, { foreignKey: 'animalId', as: 'tack', onDelete: 'CASCADE' });
  L.FarmAnimal.hasOne(W.MountAssignment, { foreignKey: 'animalId', as: 'mount', onDelete: 'CASCADE' });
  M.MilitaryUnit.hasOne(W.MountAssignment, { foreignKey: 'unitId', as: 'mount', onDelete: 'CASCADE' });
  CityModel.hasMany(W.AnimalCareRecord, { foreignKey: 'cityId', as: 'careRecords', onDelete: 'CASCADE' });

  return {
    sequelize,
    User: UserModel,
    RefreshToken: RefreshTokenModel,
    Character: CharacterModel,
    City: CityModel,
    CityMember: CityMemberModel,
    CityEconomy: CityEconomyModel,
    CityChunk: CityChunkModel,
    ...B,
    ...F,
    ...L,
    ...A,
    ...P,
    ...M,
    ...W,
    ...E,
    ...Battle,
    ...Social,
  };
}

export { User, RefreshToken, Character, City, CityMember, CityEconomy, CityChunk, BuildingType, BuildingLevel, WorldBuilding, BuildingFootprint, BuildingConstructionJob, CityResource, CropType, FarmZone, FarmZoneTile, CropCycle, IrrigationNetwork, AnimalSpecies, AnimalFeedRecipe, LivestockFarm, LivestockFarmTile, FarmAnimal, LivestockProductionJob, FishSpecies, WaterBody, WaterBodyTile, FishStockBatch, AquacultureCycle, WaterQualityRecord, Profession, ProductionRecipe, Survivor, SurvivorHousing, SurvivorJob, ProductionJob, ResourceTransaction, WorldTimeState, UnitType, EquipmentType, MilitaryUnit, UnitEquipment, MilitaryTrainingJob, MilitarySquad, MilitarySquadMember, AnimalTrainingJob, AnimalAssignment, AnimalEquipment, MountAssignment, AnimalCareRecord };
