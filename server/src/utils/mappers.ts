import type {
  CharacterAppearance,
  CharacterDTO,
  CityDTO,
  CityEconomyDTO,
  CityMemberRole,
  UserDTO,
} from '@cityverse/shared';
import type { Character } from '../database/models/Character.js';
import type { City } from '../database/models/City.js';
import type { CityEconomy } from '../database/models/CityEconomy.js';
import type { User } from '../database/models/User.js';

export function toUserDTO(user: User): UserDTO {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    status: user.status,
    createdAt: user.createdAt.toISOString(),
  };
}

export function toCharacterDTO(character: Character): CharacterDTO {
  const parsedAppearance: CharacterAppearance =
    typeof character.appearance === 'string'
      ? (JSON.parse(character.appearance) as CharacterAppearance)
      : character.appearance;

  return {
    id: character.id,
    userId: character.userId,
    name: character.name,
    presetId: character.presetId,
    appearance: parsedAppearance,
    createdAt: character.createdAt.toISOString(),
    updatedAt: character.updatedAt.toISOString(),
  };
}

export function toCityEconomyDTO(economy: CityEconomy): CityEconomyDTO {
  return {
    id: economy.id,
    cityId: economy.cityId,
    cityCoins: Number(economy.cityCoins),
    population: economy.population,
    happiness: economy.happiness,
    taxRate: Number(economy.taxRate),
    powerCapacity: economy.powerCapacity,
    powerUsage: economy.powerUsage,
    waterCapacity: economy.waterCapacity,
    waterUsage: economy.waterUsage,
    lastTickAt: economy.lastTickAt ? economy.lastTickAt.toISOString() : null,
  };
}

export function toCityDTO(
  city: City,
  economy: CityEconomy,
  role: CityMemberRole
): CityDTO {
  return {
    id: city.id,
    ownerId: city.ownerId,
    name: city.name,
    terrainType: city.terrainType,
    worldSeed: city.worldSeed,
    mapWidth: city.mapWidth,
    mapHeight: city.mapHeight,
    level: city.level,
    isPublic: Boolean(city.isPublic),
    visibility: ((city as { visibility?: string }).visibility ?? (city.isPublic ? 'public' : 'private')) as 'public' | 'friends' | 'private',
    role,
    economy: toCityEconomyDTO(economy),
    createdAt: city.createdAt.toISOString(),
    updatedAt: city.updatedAt.toISOString(),
  };
}
