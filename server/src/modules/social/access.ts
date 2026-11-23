/**
 * Who may see a city (Phase 12). One rule for every API (city, world, buildings, farms …):
 *  members / owner → their role; otherwise the owner's visibility setting decides:
 *  public → visitor · friends → visitor only for friends · private → no access.
 * A visitor never gets edit rights (every write requires owner / co_mayor).
 */
import type { CityMemberRole, WorldVisibility } from '@cityverse/shared';
import type { City } from '../../database/models/City.js';
import type { DatabaseModels } from '../../database/models/index.js';

export const pairKey = (a: string, b: string): [string, string] => (a < b ? [a, b] : [b, a]);

export async function areFriends(models: DatabaseModels, a: string, b: string): Promise<boolean> {
  if (a === b) return false;
  const [userAId, userBId] = pairKey(a, b);
  return (await models.Friendship.count({ where: { userAId, userBId } })) > 0;
}

export function visibilityOf(city: Pick<City, 'visibility' | 'isPublic'>): WorldVisibility {
  return (city.visibility as WorldVisibility | null) ?? (city.isPublic ? 'public' : 'private');
}

export async function cityRole(models: DatabaseModels, city: City, userId: string): Promise<CityMemberRole | null> {
  const membership = await models.CityMember.findOne({ where: { cityId: city.id, userId } });
  if (membership) return membership.role;
  if (city.ownerId === userId) return 'owner';
  const vis = visibilityOf(city);
  if (vis === 'public') return 'visitor';
  if (vis === 'friends' && (await areFriends(models, city.ownerId, userId))) return 'visitor';
  return null;
}
