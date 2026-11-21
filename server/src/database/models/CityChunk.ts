import {
  DataTypes,
  Model,
  type CreationOptional,
  type ForeignKey,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from 'sequelize';
import type { BiomeType, ChunkTerrainDelta } from '@cityverse/shared';
import type { City } from './City.js';

export class CityChunk extends Model<
  InferAttributes<CityChunk>,
  InferCreationAttributes<CityChunk>
> {
  declare id: CreationOptional<string>;
  declare cityId: ForeignKey<City['id']>;
  declare chunkX: number;
  declare chunkZ: number;
  declare revision: CreationOptional<number>;
  declare biomeSummary: CreationOptional<BiomeType>;
  declare seedHash: string;
  declare terrainDelta: ChunkTerrainDelta;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

function normalizeDelta(raw: unknown): ChunkTerrainDelta {
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as ChunkTerrainDelta;
      if (parsed && typeof parsed === 'object' && parsed.tiles && typeof parsed.tiles === 'object') {
        return parsed;
      }
    } catch {
      return { tiles: {} };
    }
  }
  if (raw && typeof raw === 'object' && 'tiles' in raw) {
    const candidate = raw as ChunkTerrainDelta;
    if (candidate.tiles && typeof candidate.tiles === 'object') {
      return candidate;
    }
  }
  return { tiles: {} };
}

export function initCityChunkModel(sequelize: Sequelize): typeof CityChunk {
  CityChunk.init(
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
      chunkX: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'chunk_x',
      },
      chunkZ: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'chunk_z',
      },
      revision: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      biomeSummary: {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: 'grass',
        field: 'biome_summary',
      },
      seedHash: {
        type: DataTypes.STRING(64),
        allowNull: false,
        field: 'seed_hash',
      },
      terrainDelta: {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: { tiles: {} },
        field: 'terrain_delta',
        get() {
          const raw = this.getDataValue('terrainDelta');
          return normalizeDelta(raw);
        },
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
      tableName: 'city_chunks',
      modelName: 'CityChunk',
      underscored: true,
      timestamps: true,
      indexes: [
        {
          unique: true,
          name: 'uq_city_chunks_city_coords',
          fields: ['city_id', 'chunk_x', 'chunk_z'],
        },
        {
          name: 'idx_city_chunks_city_id',
          fields: ['city_id'],
        },
      ],
    }
  );

  return CityChunk;
}
