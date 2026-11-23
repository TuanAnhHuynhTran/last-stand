import { DataTypes, Model, type Optional, type Sequelize } from 'sequelize';
import type { AxialCoord, TerritoryStatus } from '@cityverse/shared';
interface JobAttributes { id: string; cityId: string; idempotencyKey: string; fingerprint: string; hexes: AxialCoord[]; finishesAt: Date; status: string }
export class WorldScanJob extends Model<JobAttributes, Optional<JobAttributes, 'id'>> implements JobAttributes {
  declare id: string; declare cityId: string; declare idempotencyKey: string; declare fingerprint: string;
  declare hexes: AxialCoord[]; declare finishesAt: Date; declare status: string;
}
export class WorldClaimJob extends WorldScanJob {}
interface DiscoveryAttributes { id: string; cityId: string; q: number; r: number; status: TerritoryStatus }
export class WorldDiscovery extends Model<DiscoveryAttributes, Optional<DiscoveryAttributes, 'id'>> implements DiscoveryAttributes {
  declare id: string; declare cityId: string; declare q: number; declare r: number; declare status: TerritoryStatus;
}
interface PoiAttributes { id: string; cityId: string; q: number; r: number; kind: string; reason: string | null }
export class WorldPointOfInterest extends Model<PoiAttributes, Optional<PoiAttributes, 'id'>> implements PoiAttributes {
  declare id: string; declare cityId: string; declare q: number; declare r: number; declare kind: string; declare reason: string | null;
}
export function initExplorationModels(sequelize: Sequelize) {
  const id = { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true };
  const cityId = { type: DataTypes.UUID, allowNull: false, field: 'city_id', references: { model: 'cities', key: 'id' }, onDelete: 'CASCADE' };
  for (const [model, tableName] of [[WorldScanJob, 'world_scan_jobs'], [WorldClaimJob, 'world_claim_jobs']] as const) {
    model.init({ id, cityId,
      idempotencyKey: { type: DataTypes.STRING(36), allowNull: false, field: 'idempotency_key' },
      fingerprint: { type: DataTypes.TEXT, allowNull: false }, hexes: { type: DataTypes.JSON, allowNull: false },
      finishesAt: { type: DataTypes.DATE, allowNull: false, field: 'finishes_at' }, status: { type: DataTypes.STRING(16), allowNull: false },
    }, { sequelize, tableName, underscored: true, indexes: [{ unique: true, fields: ['city_id', 'idempotency_key'] }, { fields: ['city_id', 'status', 'finishes_at'] }] });
  }
  const coords = { id, cityId, q: { type: DataTypes.INTEGER, allowNull: false }, r: { type: DataTypes.INTEGER, allowNull: false } };
  WorldDiscovery.init({ ...coords, status: { type: DataTypes.STRING(16), allowNull: false } }, { sequelize, tableName: 'world_discoveries', underscored: true, indexes: [{ unique: true, fields: ['city_id', 'q', 'r'] }] });
  WorldPointOfInterest.init({ ...coords, kind: { type: DataTypes.STRING(32), allowNull: false }, reason: { type: DataTypes.STRING, allowNull: true } }, { sequelize, tableName: 'world_points_of_interest', underscored: true, indexes: [{ unique: true, fields: ['city_id', 'q', 'r'] }] });
  return { WorldScanJob, WorldClaimJob, WorldDiscovery, WorldPointOfInterest };
}
