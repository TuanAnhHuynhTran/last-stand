import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  UNIT_TYPE_CODES,
  getFootprintHexes,
  getUnitType,
  hexKey,
  trainingSlots,
  unitStats,
  worldToAxial,
  type BuildingTypeCode,
  type EquipmentCode,
  type EquipmentSlot,
  type MilitaryStateDTO,
  type MilitaryUnitDTO,
  type UnitTypeCode,
} from '@cityverse/shared';
import { MilitaryRenderer } from '../../game/military/MilitaryRenderer';
import { jobProgress } from '../../game/military/militaryStore';
import {
  CROSSFADE_SECONDS,
  clipAt,
  cycleSeconds,
  drillCycle,
  drillEvents,
  drillPose,
  eventsBetween,
  idlePose,
} from '../../game/military/soldierAnimation';
import { buildSoldierParts } from '../../game/military/soldierModels';
import { originOf, soldierMatrices } from '../../game/military/soldierRig';
import { planTrainingScene, toWorld } from '../../game/military/trainingScene';
import { RIG } from '../../game/population/villagerModels';

const KIT: Record<UnitTypeCode, Partial<Record<EquipmentSlot, EquipmentCode>>> = {
  swordsman: { weapon: 'eq_saber', offhand: 'eq_shield', armor: 'eq_leather_armor' },
  spearman: { weapon: 'eq_spear', armor: 'eq_leather_armor' },
  archer: { weapon: 'eq_bow', ammo: 'eq_arrows' },
  crossbowman: { weapon: 'eq_crossbow', ammo: 'eq_bolts', armor: 'eq_leather_armor' },
};
const at = (p: { x: number; z: number }) => {
  const h = worldToAxial(p.x, p.z);
  return hexKey(h.q, h.r);
};
const BARRACKS: Record<UnitTypeCode, BuildingTypeCode> = { swordsman: 'sword_barracks', spearman: 'spear_barracks', archer: 'archery_range', crossbowman: 'crossbow_range' };

function unit(id: string, type: UnitTypeCode, buildingId: string, over: Partial<MilitaryUnitDTO> = {}): MilitaryUnitDTO {
  const stats = unitStats(type, 1, Object.values(KIT[type]) as EquipmentCode[]);
  return {
    id,
    survivorId: `s-${id}`,
    name: `Lính ${id}`,
    type,
    rank: 1,
    rankName: 'Tân binh',
    xp: 0,
    nextRankXp: 100,
    status: 'training',
    buildingId,
    equipment: { ...KIT[type] },
    stats,
    power: 10,
    ready: false,
    missing: [],
    squadIds: [],
    appearance: { skin: '#f6d2b4', hair: '#2b2116', hairStyle: 1, height: 1 },
    mount: null,
    ...over,
  };
}

function militaryState(units: MilitaryUnitDTO[], barracks: { id: string; code: BuildingTypeCode; level: number; anchor: { q: number; r: number }; rotation?: number }[], jobs: { buildingId: string; unitIds: string[] }[]): MilitaryStateDTO {
  return {
    units,
    jobs: jobs.map((j, i) => ({ id: `job${i}`, buildingId: j.buildingId, kind: 'recruit', unitType: null, unitIds: j.unitIds, startedAt: '2026-11-24T08:00:00.000Z', finishesAt: '2026-11-24T08:02:00.000Z', status: 'in_progress' })),
    barracks: barracks.map((b) => {
      const slots = trainingSlots(b.code, b.level);
      return {
        buildingId: b.id,
        typeCode: b.code,
        level: b.level,
        ready: true,
        unitType: null,
        slots,
        training: 0,
        free: slots,
        trainSeconds: 90,
        soldiers: [],
        hexes: getFootprintHexes(b.code, b.anchor, b.rotation ?? 0),
        anchor: b.anchor,
        rotation: b.rotation ?? 0,
      };
    }),
    squads: [],
    equipment: {},
    recruitable: 0,
    food: 0,
    resources: { coins: 0, wood: 0, stone: 0 } as MilitaryStateDTO['resources'],
    serverTime: '2026-11-24T08:00:00.000Z',
  };
}

describe('Phase 8 – soldier drills (per class)', () => {
  it('every class loops its own drill cycle from the catalogue', () => {
    for (const type of UNIT_TYPE_CODES) {
      expect(drillCycle(type).map((c) => c.name)).toEqual([...getUnitType(type).drills]);
      // Sampling one full cycle visits exactly those clips, in order.
      const seen: string[] = [];
      for (let t = 0; t < cycleSeconds(type); t += 0.02) {
        const c = clipAt(type, t).clip.name;
        if (seen[seen.length - 1] !== c) seen.push(c);
      }
      expect(seen).toEqual([...getUnitType(type).drills]);
    }
    // Melee classes never play ranged clips and vice versa.
    expect(drillCycle('swordsman').map((c) => c.name)).not.toContain('shoot');
    expect(drillCycle('spearman').map((c) => c.name)).toContain('thrust');
    expect(drillCycle('archer').map((c) => c.name)).toContain('nock');
    expect(drillCycle('crossbowman').map((c) => c.name)).toContain('span');
    // Crossbows are the slowest to cycle (reload), spears the quickest.
    expect(cycleSeconds('crossbowman')).toBeGreaterThan(cycleSeconds('archer'));
  });

  it('melee classes hit their prop, ranged classes shoot — each exactly once per occurrence', () => {
    const count = (type: UnitTypeCode, kind: string) => {
      let n = 0;
      const total = cycleSeconds(type) * 3;
      for (let t = 0; t < total; t += 1 / 60) n += eventsBetween(type, t, t + 1 / 60).filter((e) => e.kind === kind).length;
      return n;
    };
    expect(count('swordsman', 'hit')).toBe(3 * drillEvents('swordsman').filter((e) => e.kind === 'hit').length);
    expect(count('spearman', 'hit')).toBe(3);
    expect(count('archer', 'shoot')).toBe(3);
    expect(count('crossbowman', 'shoot')).toBe(3);
    expect(count('archer', 'hit')).toBe(0);
    // A long frame (tab in the background) never replays a cycle twice.
    expect(eventsBetween('archer', 0, cycleSeconds('archer') * 10).filter((e) => e.kind === 'shoot')).toHaveLength(1);
  });

  it('clips cross-fade without popping and the poses differ per class', () => {
    for (const type of UNIT_TYPE_CODES) {
      let start = 0;
      for (const c of drillCycle(type)) {
        start += c.seconds;
        const a = drillPose(type, start - 1e-3).pose;
        const b = drillPose(type, start + 1e-3).pose;
        for (const k of Object.keys(a) as (keyof typeof a)[]) expect(Math.abs(a[k] - b[k])).toBeLessThan(0.08);
      }
      expect(CROSSFADE_SECONDS).toBeGreaterThan(0);
    }
    const arch = drillPose('archer', 2.0).pose;
    const sword = drillPose('swordsman', 2.0).pose;
    expect(arch).not.toEqual(sword);
    // Archers draw the bow while aiming; swordsmen never draw.
    const aim = drillCycle('archer').findIndex((c) => c.name === 'aim');
    const tAim = drillCycle('archer').slice(0, aim).reduce((s, c) => s + c.seconds, 0) + 0.95;
    expect(drillPose('archer', tAim).pose.draw).toBeGreaterThan(0.9);
    for (let t = 0; t < cycleSeconds('swordsman'); t += 0.1) expect(drillPose('swordsman', t).pose.draw).toBe(0);
  });

  it('weapons follow the hand sockets in every frame of every drill', () => {
    const hand = new THREE.Vector3();
    const item = new THREE.Vector3();
    for (const type of UNIT_TYPE_CODES) {
      for (let t = 0; t < cycleSeconds(type); t += 0.07) {
        for (const pose of [drillPose(type, t).pose, idlePose(type, t)]) {
          const m = soldierMatrices(pose);
          expect(originOf(m.main, item).distanceTo(originOf(m.handR, hand))).toBeLessThan(1e-6);
          expect(originOf(m.off, item).distanceTo(originOf(m.handL, hand))).toBeLessThan(1e-6);
          // Hands stay attached to the shoulders (arm length).
          expect(originOf(m.handR, hand).distanceTo(originOf(m.armR, item))).toBeCloseTo(RIG.armLength, 5);
        }
      }
    }
  });

  it('the spear is longer than the chibi body; the shield faces forward while blocking', () => {
    const parts = buildSoldierParts();
    parts.spear.computeBoundingBox();
    const len = parts.spear.boundingBox!.max.z - parts.spear.boundingBox!.min.z;
    expect(len).toBeGreaterThan(RIG.height);
    const block = drillCycle('swordsman').findIndex((c) => c.name === 'block');
    const t = drillCycle('swordsman').slice(0, block).reduce((s, c) => s + c.seconds, 0) + drillCycle('swordsman')[block].seconds / 2;
    const m = soldierMatrices(drillPose('swordsman', t).pose);
    const normal = new THREE.Vector3(0, 0, 1).transformDirection(m.off);
    expect(normal.z).toBeGreaterThan(0.8); // shield face points to the dummy (+Z)
    const shieldY = originOf(m.off).y;
    expect(shieldY).toBeGreaterThan(RIG.shoulderY); // raised in front of the chest / face
  });
});

describe('Phase 8 – training scene', () => {
  it('training soldiers take the active stations (2 / 4 / 6 by level), the rest stand on the parade ground', () => {
    for (const level of [1, 2, 3]) {
      const units = Array.from({ length: 8 }, (_, i) => unit(`u${i}`, 'swordsman', 'b1', { status: i < 6 ? 'training' : 'ready' }));
      const slots = trainingSlots('sword_barracks', level);
      const state = militaryState(units, [{ id: 'b1', code: 'sword_barracks', level, anchor: { q: 3, r: -2 } }], [{ buildingId: 'b1', unitIds: units.slice(0, slots).map((u) => u.id) }]);
      const plan = planTrainingScene(state);
      expect(plan.compounds[0].stations).toHaveLength(slots);
      const drilling = plan.soldiers.filter((s) => s.mode === 'drill');
      expect(drilling).toHaveLength(slots);
      expect(new Set(drilling.map((s) => s.station)).size).toBe(slots);
      expect(plan.soldiers.filter((s) => s.mode === 'idle')).toHaveLength(8 - slots);
    }
  });

  it('stations and props stay inside the footprint for every rotation', () => {
    for (const code of ['sword_barracks', 'spear_barracks', 'archery_range', 'crossbow_range', 'training_ground'] as BuildingTypeCode[]) {
      for (let rotation = 0; rotation < 6; rotation += 1) {
        const anchor = { q: 5, r: -3 };
        const state = militaryState([], [{ id: 'b', code, level: 3, anchor, rotation }], []);
        const plan = planTrainingScene(state);
        const inside = new Set(getFootprintHexes(code, anchor, rotation).map((h) => hexKey(h.q, h.r)));
        for (const s of plan.compounds[0].stations) {
          expect(inside.has(at(s))).toBe(true);
          if (s.prop) expect(inside.has(at(s.prop))).toBe(true);
        }
        for (const p of plan.compounds[0].parade.slice(0, 12)) expect(inside.has(at(p))).toBe(true);
      }
    }
    // toWorld matches the building rotation (yaw 0 is identity).
    expect(toWorld({ x: 1, z: 2 }, { x: 10, z: 20 }, 0)).toEqual({ x: 11, z: 22 });
  });

  it('training progress comes from server timestamps', () => {
    const job = { startedAt: '2026-11-24T08:00:00.000Z', finishesAt: '2026-11-24T08:02:00.000Z' };
    expect(jobProgress(job, Date.parse('2026-11-24T08:01:00.000Z'))).toBeCloseTo(0.5);
    expect(jobProgress(job, Date.parse('2026-11-24T09:00:00.000Z'))).toBe(1);
  });
});

describe('Phase 8 – MilitaryRenderer', () => {
  function scene(units: MilitaryUnitDTO[], jobsFor: (u: MilitaryUnitDTO[]) => { buildingId: string; unitIds: string[] }[]) {
    const barracks = UNIT_TYPE_CODES.map((t, i) => ({ id: `b-${t}`, code: BARRACKS[t], level: 3, anchor: { q: (i % 2) * 3 - (i >> 1), r: (i >> 1) * 2 } }));
    const state = militaryState(units, barracks, jobsFor(units));
    const r = new MilitaryRenderer();
    r.sync(state, () => 2);
    const cam = new THREE.PerspectiveCamera(50, 16 / 9, 0.5, 2000);
    cam.position.set(15, 60, 75);
    cam.lookAt(15, 0, 10);
    return { r, cam, state };
  }

  it('each soldier plays the animation of its own class and holds its own weapon', () => {
    const units = UNIT_TYPE_CODES.map((t) => unit(`u-${t}`, t, `b-${t}`));
    const { r, cam } = scene(units, (us) => us.map((u) => ({ buildingId: u.buildingId, unitIds: [u.id] })));
    for (let i = 0; i < 30; i += 1) r.update(1 / 30, i / 30, cam);
    expect(r.stats.detailed).toBe(4);
    for (const u of units) expect(getUnitType(u.type).drills).toContain(r.clips.get(u.id));
    expect(r.partCount('saber')).toBe(1);
    expect(r.partCount('shield')).toBe(1);
    expect(r.partCount('spear')).toBe(1);
    expect(r.partCount('bow')).toBe(1);
    expect(r.partCount('crossbow')).toBe(1);
    expect(r.partCount('quiver')).toBe(1);
    // Active stations show their props (6 per barracks at level 3).
    expect(r.partCount('dummy') + r.partCount('post') + r.partCount('target')).toBe(24);
    r.dispose();
  });

  it('a soldier without a weapon holds nothing; idle soldiers stand at attention', () => {
    const u = unit('bare', 'swordsman', 'b-swordsman', { status: 'ready', equipment: { armor: 'eq_leather_armor' } });
    const { r, cam } = scene([u], () => []);
    r.update(1 / 30, 0, cam);
    expect(r.partCount('saber')).toBe(0);
    expect(r.partCount('shield')).toBe(0);
    expect(r.clips.get('bare')).toBe('attention');
    r.dispose();
  });

  it('rank accessories are added to the same model without swapping it', () => {
    const units = [1, 2, 3, 4, 5].map((rank) => unit(`r${rank}`, 'spearman', 'b-spearman', { rank, status: 'ready' }));
    const { r, cam } = scene(units, () => []);
    r.update(1 / 30, 0, cam);
    expect(r.partCount('torso')).toBe(5); // one body per soldier, whatever the rank
    expect(r.partCount('scarf')).toBe(4);
    expect(r.partCount('plume')).toBe(3);
    expect(r.partCount('pauldron')).toBe(4); // ranks 4 & 5, two shoulders
    expect(r.partCount('cape')).toBe(1);
    r.dispose();
  });

  it('dummies wobble when hit and arrows fly to the target', () => {
    const units = [unit('sw', 'swordsman', 'b-swordsman'), unit('ar', 'archer', 'b-archer')];
    const { r, cam } = scene(units, (us) => us.map((u) => ({ buildingId: u.buildingId, unitIds: [u.id] })));
    let flew = 0;
    let wobble = 0;
    for (let i = 0; i < 60 * 8; i += 1) {
      r.update(1 / 60, i / 60, cam);
      flew = Math.max(flew, r.stats.projectiles);
      wobble = Math.max(wobble, ...r.propAmplitudes());
    }
    expect(flew).toBeGreaterThan(0);
    expect(wobble).toBeGreaterThan(0.1);
    r.dispose();
  });
});
