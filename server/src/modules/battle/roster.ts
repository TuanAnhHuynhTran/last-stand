/**
 * Soldiers ↔ battles, shared by PvE (Phase 11) and PvP (Phase 12):
 *  - which soldiers of a city may march out (and why not)
 *  - their battle stats (equipment, rank, horse) as engine roster entries
 *  - after the battle: XP, rank, injuries, back to "ready"
 */
import type { Transaction } from 'sequelize';
import {
  getRank,
  missingEquipment,
  mountSpeed,
  mountedStats,
  rankForXp,
  unitStats,
  type BattleCandidateDTO,
  type BattleRewards,
  type BattleSide,
  type BattleState,
  type EquipmentCode,
  type EquipmentSlot,
  type RosterEntry,
} from '@cityverse/shared';
import type { DatabaseModels } from '../../database/models/index.js';
import { ConflictError, NotFoundError } from '../../utils/errors.js';
import { storedTraits } from '../mounts/mountSupport.js';

/** Minimum survivor health to march out. */
export const MIN_BATTLE_HEALTH = 0.3;

export async function loadCandidates(m: DatabaseModels, cityId: string, t?: Transaction): Promise<BattleCandidateDTO[]> {
  const units = await m.MilitaryUnit.findAll({ where: { cityId }, order: [['recruitedAt', 'ASC']], transaction: t });
  if (!units.length) return [];
  const ids = units.map((u) => u.id);
  const [equipment, survivors, rides, deployedSquads] = await Promise.all([
    m.UnitEquipment.findAll({ where: { unitId: ids }, transaction: t }),
    m.Survivor.findAll({ where: { id: units.map((u) => u.survivorId) }, transaction: t }),
    m.MountAssignment.findAll({ where: { unitId: ids }, transaction: t }),
    m.MilitarySquad.findAll({ where: { cityId, status: 'deployed' }, transaction: t }),
  ]);
  const deployed = deployedSquads.length
    ? new Set((await m.MilitarySquadMember.findAll({ where: { squadId: deployedSquads.map((s) => s.id) }, transaction: t })).map((x) => x.unitId))
    : new Set<string>();
  return units.map((u) => {
    const eq = equipment.filter((e) => e.unitId === u.id);
    const kit = Object.fromEntries(eq.map((e) => [e.slot, e.equipmentCode])) as Partial<Record<EquipmentSlot, EquipmentCode>>;
    const person = survivors.find((s) => s.id === u.survivorId);
    const health = person?.health ?? 0;
    let reason: string | null = null;
    if (u.status === 'battle') reason = 'Đang tham chiến';
    else if (u.status !== 'ready' || !u.trainedAt) reason = 'Chưa sẵn sàng (đang tập / tân binh)';
    else if (missingEquipment(u.unitTypeCode, kit).length) reason = 'Thiếu trang bị';
    else if (health < MIN_BATTLE_HEALTH) reason = 'Bị thương — cần hồi phục';
    else if (deployed.has(u.id)) reason = 'Đang làm nhiệm vụ cùng đội khác';
    const stats = unitStats(u.unitTypeCode, u.rank, eq.map((e) => e.equipmentCode));
    return {
      id: u.id,
      name: person?.name ?? 'Binh sĩ',
      type: u.unitTypeCode,
      rank: u.rank,
      rankName: getRank(u.rank).name,
      power: Math.round(stats.attack * 2 + stats.hp / 5 + stats.defense),
      health: Math.round(health * 100) / 100,
      mounted: rides.some((r) => r.unitId === u.id),
      available: reason === null,
      reason,
    };
  });
}

/** Engine roster entries for the chosen soldiers (each one validated). */
export async function buildRoster(m: DatabaseModels, cands: readonly BattleCandidateDTO[], unitIds: readonly string[], t?: Transaction): Promise<{ roster: RosterEntry[]; power: number }> {
  const roster: RosterEntry[] = [];
  let power = 0;
  for (const id of unitIds) {
    const c = cands.find((x) => x.id === id);
    if (!c) throw new NotFoundError('Binh si khong ton tai', 'UNIT_NOT_FOUND');
    if (!c.available) throw new ConflictError(`${c.name}: ${c.reason}`, 'UNIT_UNAVAILABLE');
    const unit = (await m.MilitaryUnit.findByPk(id, { transaction: t }))!;
    const eq = await m.UnitEquipment.findAll({ where: { unitId: id }, transaction: t });
    let stats = unitStats(unit.unitTypeCode, unit.rank, eq.map((e) => e.equipmentCode));
    const ride = await m.MountAssignment.findOne({ where: { unitId: id }, transaction: t });
    const horse = ride ? await m.FarmAnimal.findByPk(ride.animalId, { transaction: t }) : null;
    if (horse) {
      const armored = Boolean(await m.AnimalEquipment.count({ where: { animalId: horse.id, slot: 'armor' }, transaction: t }));
      stats = mountedStats(stats, unit.unitTypeCode, { speed: mountSpeed('horse', horse.breed, storedTraits(horse)), trainingLevel: horse.trainingLevel, armored });
    }
    power += c.power;
    roster.push({ sourceId: id, name: c.name, type: unit.unitTypeCode, rank: unit.rank, stats, health: c.health, mounted: Boolean(horse) });
  }
  return { roster, power };
}

/** XP, rank and injuries for the soldiers of the given sides; everyone back to "ready". */
export async function settleSoldiers(m: DatabaseModels, battleId: string, state: BattleState, rewards: BattleRewards, sides: readonly BattleSide[], t: Transaction): Promise<void> {
  for (const u of state.units.filter((x) => sides.includes(x.side) && x.sourceId)) {
    const unit = await m.MilitaryUnit.findByPk(u.sourceId!, { transaction: t });
    if (!unit) continue;
    const gained = rewards.xp[u.sourceId!] ?? 0;
    const xp = unit.xp + gained;
    await unit.update({ status: 'ready', xp, rank: rankForXp(xp) }, { transaction: t });
    // Injuries: lost HP hurts the survivor's health; a knock-out needs real recovery time.
    const person = await m.Survivor.findByPk(unit.survivorId, { transaction: t });
    let injury = 0;
    if (person) {
      injury = (1 - u.hp / u.maxHp) * 0.4 + (u.ko ? 0.25 : 0);
      const health = Math.max(0.1, person.health - injury);
      await person.update({ health: u.ko ? Math.min(health, MIN_BATTLE_HEALTH - 0.05) : health }, { transaction: t });
    }
    await m.BattleUnitRecord.update({ xpGained: gained, injury: Math.round(injury * 1000) / 1000 }, { where: { battleId, unitKey: u.id }, transaction: t });
  }
}
