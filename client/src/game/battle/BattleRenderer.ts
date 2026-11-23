/**
 * BattleRenderer — the BattleScene's 3D content (separate from the WorldScene).
 *
 *  terrain     merged chibi tiles + water + glowing toxic puddles, invisible pick prisms
 *  units       chibi humanoids on the Phase 8 rig (soldiers, bandits, zombies, robots, captives)
 *              and merged creatures (wolf, spitter, behemoth), all instanced
 *  playback    server events → cues (battlePlayback): walking along the server path, class
 *              attacks, projectiles with arcs, hit / dodge / block, damage numbers, HP bars,
 *              heals, statuses, skills (volley rain, acid splash, slam shockwave), knock-outs,
 *              victory; at the end every unit snaps to the server's final state
 *  highlights  reachable hexes, path, valid targets, skill areas, deployment zone, objectives
 * Effects stay small and short so the formation is never hidden.
 */
import * as THREE from 'three';
import { type AxialCoord, type BattleEvent, type BattleState, type BattleStatusCode, type BattleTile, type BattleUnit } from '@cityverse/shared';
import { InstancePool } from '../military/instancePool';
import { buildSoldierParts, disposeSoldierParts, type SoldierParts } from '../military/soldierModels';
import { createSoldierMatrices, soldierMatrices } from '../military/soldierRig';
import { buildVillagerParts, disposeVillagerParts, type VillagerParts } from '../population/villagerModels';
import { hexCenter, standPoint, tileMap, tileTop, yawTo, type V3 } from './battleLayout';
import { buildBattlefield, buildCreature, buildExtras, highlightDisc, lookFor, pickPrism, type HumanLook } from './battleModels';
import { audio } from '../../audio/AudioManager';
import { planTimeline, type Cue } from './battlePlayback';
import { creatureFrame, humanoidFrame, isCreature, styleOf, type CombatClip } from './combatAnimation';

export const UNIT_SCALE = 1.15;
/** Floating text sprites (damage numbers) — off in headless tests (no 2D canvas). */
export const BATTLE_TEXT = { enabled: true };
const CREATURE_SCALE: Record<string, number> = { wolf: 1.0, spitter: 1.0, behemoth: 0.95 };
const HEAD: Record<string, number> = { wolf: 2.4, spitter: 2.8, behemoth: 5.8 };

export interface Highlights {
  move: AxialCoord[];
  path: AxialCoord[];
  targets: string[];
  area: AxialCoord[];
  deploy: AxialCoord[];
  objectives: AxialCoord[];
  selected: string | null;
  hover: AxialCoord | null;
}

export const EMPTY_HIGHLIGHTS: Highlights = { move: [], path: [], targets: [], area: [], deploy: [], objectives: [], selected: null, hover: null };

interface Actor {
  id: string;
  kind: string;
  side: BattleUnit['side'];
  look: HumanLook | null;
  x: number;
  y: number;
  z: number;
  yaw: number;
  hp: number;
  maxHp: number;
  ko: boolean;
  koAt: number;
  freed: boolean;
  fade: number;
  statuses: BattleStatusCode[];
  seed: number;
  /** Clip chosen this frame */
  clip: CombatClip;
  phase: number;
}

interface Popup {
  text: string;
  color: string;
  x: number;
  y: number;
  z: number;
  born: number;
  sprite: THREE.Sprite | null;
}

interface Fx {
  kind: 'puff' | 'heal' | 'shock' | 'rain' | 'splash';
  x: number;
  y: number;
  z: number;
  born: number;
  life: number;
  color: THREE.Color;
}

interface Playback {
  cues: Cue[];
  total: number;
  start: number;
  fired: Set<number>;
  before: BattleState;
  after: BattleState;
  onDone: () => void;
}

const STATUS_COLOR: Record<BattleStatusCode, string> = {
  poison: '#7dd36f',
  stun: '#ffd45c',
  defending: '#6fb2e8',
  shield_wall: '#8fd6ff',
  braced: '#ff9f43',
  overcharged: '#c38bff',
  enraged: '#ff5a3a',
};
const STATUS_TEXT: Record<BattleStatusCode, string> = {
  poison: '☠ Nhiễm độc',
  stun: '💫 Choáng',
  defending: '🛡 Phòng thủ',
  shield_wall: '🛡 Tường khiên',
  braced: '🔱 Giữ đội hình',
  overcharged: '⚡ Quá tải',
  enraged: '🔥 Cuồng nộ',
};

export class BattleRenderer {
  readonly group = new THREE.Group();
  /** Popups shown so far (tests / HUD log) */
  readonly popups: Popup[] = [];
  onBanner: ((text: string, tone: string) => void) | null = null;
  onCinematic: ((x: number, z: number) => void) | null = null;
  onFocus: ((x: number, z: number) => void) | null = null;

  private readonly vp: VillagerParts;
  private readonly sp: SoldierParts;
  private readonly extras = buildExtras();
  private readonly creatures = new Map<string, THREE.BufferGeometry>();
  private readonly solidMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  private readonly unitMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65 });
  private readonly waterMat = new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.78, roughness: 0.15 });
  private readonly toxicMat = new THREE.MeshStandardMaterial({ vertexColors: true, emissive: new THREE.Color('#5fd35a'), emissiveIntensity: 0.4, transparent: true, opacity: 0.9 });
  private readonly barMat = new THREE.MeshBasicMaterial({ color: '#ffffff', depthWrite: false });
  private readonly pool: InstancePool;
  private readonly bars: InstancePool;
  private readonly barGeo = new THREE.PlaneGeometry(1, 1);
  private readonly ballGeo = new THREE.IcosahedronGeometry(0.16, 0);
  private readonly acidGeo = new THREE.IcosahedronGeometry(0.3, 1);
  private readonly terrain = new THREE.Group();
  private pick: THREE.InstancedMesh | null = null;
  private pickTiles: BattleTile[] = [];
  private tiles = new Map<string, BattleTile>();
  private readonly hl: Record<'move' | 'path' | 'target' | 'area' | 'deploy' | 'objective' | 'hover' | 'selected', THREE.InstancedMesh>;
  private readonly actors = new Map<string, Actor>();
  private playback: Playback | null = null;
  private fx: Fx[] = [];
  private loadedKey = '';
  private time = 0;
  private readonly mats = createSoldierMatrices();
  private readonly m = new THREE.Matrix4();
  private readonly root = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly colors = new Map<string, THREE.Color>();

  constructor() {
    this.group.name = 'BattleRenderer';
    this.vp = buildVillagerParts();
    this.sp = buildSoldierParts();
    this.pool = new InstancePool(this.group, this.unitMat, 'Battle');
    this.bars = new InstancePool(this.group, this.barMat, 'BattleBar');
    this.group.add(this.terrain);
    const disc = highlightDisc();
    const mk = (color: string, opacity: number, name: string) => {
      const mesh = new THREE.InstancedMesh(disc, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }), 200);
      mesh.count = 0;
      mesh.name = `BattleHL:${name}`;
      mesh.renderOrder = 4;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      return mesh;
    };
    this.hl = {
      deploy: mk('#3fd6c6', 0.35, 'deploy'),
      move: mk('#5ab2ff', 0.45, 'move'),
      area: mk('#ff9f43', 0.5, 'area'),
      path: mk('#ffe066', 0.75, 'path'),
      target: mk('#ff4f5e', 0.6, 'target'),
      objective: mk('#ffd45c', 0.55, 'objective'),
      hover: mk('#ffffff', 0.4, 'hover'),
      selected: mk('#7dff8a', 0.6, 'selected'),
    };
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  /** Builds the battlefield once per battle and places every unit (no animation). */
  load(battleId: string, state: BattleState): void {
    const k = `${battleId}:${state.tiles.length}`;
    if (k !== this.loadedKey) {
      this.loadedKey = k;
      for (const c of [...this.terrain.children]) {
        this.terrain.remove(c);
        (c as THREE.Mesh).geometry?.dispose();
      }
      const geo = buildBattlefield(state);
      const solid = new THREE.Mesh(geo.solid, this.solidMat);
      solid.receiveShadow = true;
      solid.castShadow = true;
      this.terrain.add(solid, new THREE.Mesh(geo.water, this.waterMat), new THREE.Mesh(geo.toxic, this.toxicMat));
      this.tiles = tileMap(state);
      this.pickTiles = [...state.tiles];
      if (this.pick) {
        this.group.remove(this.pick);
        this.pick.dispose();
      }
      this.pick = new THREE.InstancedMesh(pickPrism(), new THREE.MeshBasicMaterial({ visible: false }), this.pickTiles.length);
      this.pick.name = 'BattlePick';
      this.pickTiles.forEach((t, i) => {
        const c = hexCenter(t);
        const top = tileTop(t) + (t.terrain === 'rock' ? 1.6 : t.terrain === 'forest' || t.terrain === 'ruins' ? 0.6 : 0);
        this.m.compose(this.v.set(c.x, top / 2, c.z), this.q.identity(), this.s.set(1, Math.max(0.3, top), 1));
        this.pick!.setMatrixAt(i, this.m);
      });
      this.pick.instanceMatrix.needsUpdate = true;
      this.pick.computeBoundingSphere();
      this.group.add(this.pick);
      this.actors.clear();
    }
    this.snap(state);
  }

  /** Every actor to the server state exactly. */
  snap(state: BattleState): void {
    const seen = new Set<string>();
    state.units.forEach((u, i) => {
      seen.add(u.id);
      const p = standPoint(this.tiles, u);
      let a = this.actors.get(u.id);
      if (!a) {
        a = {
          id: u.id,
          kind: u.kind,
          side: u.side,
          look: isCreature(u.kind) ? null : lookFor(u.kind, i * 37 + u.id.length),
          ...p,
          yaw: u.side === 'player' ? Math.PI : 0,
          hp: u.hp,
          maxHp: u.maxHp,
          ko: u.ko,
          koAt: -10,
          freed: u.freed,
          fade: u.freed ? 0 : 1,
          statuses: [],
          seed: i,
          clip: 'idle',
          phase: 0,
        };
        this.actors.set(u.id, a);
      }
      Object.assign(a, p, { hp: u.hp, maxHp: u.maxHp, ko: u.ko, freed: u.freed, statuses: u.statuses.map((x) => x.code) });
      if (u.freed) a.fade = 0;
      if (u.ko && a.koAt < 0) a.koAt = this.time - 5;
    });
    for (const id of [...this.actors.keys()]) if (!seen.has(id)) this.actors.delete(id);
  }

  get isPlaying(): boolean {
    return this.playback !== null;
  }

  /** Animates the server's events from `before`, then snaps to `after`. */
  play(events: readonly BattleEvent[], before: BattleState, after: BattleState, onDone: () => void): void {
    if (this.playback) this.finish();
    const { cues, total } = planTimeline(events, before);
    if (!cues.length) {
      this.snap(after);
      onDone();
      return;
    }
    this.snap(before);
    this.playback = { cues, total, start: this.time, fired: new Set(), before, after, onDone };
  }

  /** Skip the rest of the animation (the result is already known). */
  finish(): void {
    const p = this.playback;
    if (!p) return;
    this.playback = null;
    this.snap(p.after);
    p.onDone();
  }

  setHighlights(h: Highlights): void {
    const place = (mesh: THREE.InstancedMesh, hexes: AxialCoord[], lift: number) => {
      const n = Math.min(hexes.length, mesh.instanceMatrix.count);
      for (let i = 0; i < n; i += 1) {
        const c = hexCenter(hexes[i]);
        this.m.compose(this.v.set(c.x, tileTop(this.tiles.get(`${hexes[i].q},${hexes[i].r}`)) + lift, c.z), this.q.identity(), this.s.set(1, 1, 1));
        mesh.setMatrixAt(i, this.m);
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
    };
    const unitHex = (id: string | null) => {
      const a = id ? this.actors.get(id) : null;
      return a ? [this.hexOfActor(a)] : [];
    };
    place(this.hl.deploy, h.deploy, 0.07);
    place(this.hl.move, h.move, 0.09);
    place(this.hl.area, h.area, 0.11);
    place(this.hl.path, h.path, 0.13);
    place(this.hl.target, h.targets.flatMap((id) => unitHex(id)), 0.15);
    place(this.hl.objective, h.objectives, 0.08);
    place(this.hl.hover, h.hover ? [h.hover] : [], 0.17);
    place(this.hl.selected, unitHex(h.selected), 0.16);
  }

  private hexOfActor(a: Actor): AxialCoord {
    let best: AxialCoord = { q: 0, r: 0 };
    let bd = Infinity;
    for (const t of this.tiles.values()) {
      const c = hexCenter(t);
      const d = (c.x - a.x) ** 2 + (c.z - a.z) ** 2;
      if (d < bd) {
        bd = d;
        best = { q: t.q, r: t.r };
      }
    }
    return best;
  }

  /** Hex under the pointer (raycaster set by the caller). */
  pickHex(ray: THREE.Raycaster): AxialCoord | null {
    if (!this.pick) return null;
    const hit = ray.intersectObject(this.pick, false)[0];
    if (!hit || hit.instanceId === undefined) return null;
    const t = this.pickTiles[hit.instanceId];
    return t ? { q: t.q, r: t.r } : null;
  }

  actorPosition(id: string): V3 | null {
    const a = this.actors.get(id);
    return a ? { x: a.x, y: a.y, z: a.z } : null;
  }

  /** Current clip of a unit (tests / debugging). */
  clipOf(id: string): CombatClip | null {
    return this.actors.get(id)?.clip ?? null;
  }

  displayedHp(id: string): number | null {
    return this.actors.get(id)?.hp ?? null;
  }

  partCount(key: string): number {
    return this.pool.count(key);
  }

  // ── Frame ──────────────────────────────────────────────────────────────────
  update(dt: number, camera: THREE.Camera): void {
    this.time += dt;
    const t = this.time;
    for (const a of this.actors.values()) {
      a.clip = a.ko ? 'knockout' : a.statuses.includes('stun') ? 'stunned' : a.statuses.includes('defending') || a.statuses.includes('shield_wall') ? 'defend' : 'idle';
      a.phase = a.ko ? Math.min(1, (t - a.koAt) / 0.6) : 0;
      if (a.freed) a.fade = Math.max(0, a.fade - dt * 1.5);
    }
    if (this.playback) this.runPlayback(t);
    (this.toxicMat as THREE.MeshStandardMaterial).emissiveIntensity = 0.35 + Math.sin(t * 2.4) * 0.15;
    for (const m of [this.hl.hover, this.hl.selected, this.hl.target]) (m.material as THREE.MeshBasicMaterial).opacity = 0.4 + Math.sin(t * 5) * 0.15;

    this.pool.begin();
    this.bars.begin();
    camera.updateMatrixWorld();
    const camQ = camera.getWorldQuaternion(new THREE.Quaternion());
    for (const a of this.actors.values()) {
      if (a.fade <= 0.01) continue;
      if (a.look) this.writeHuman(a, t);
      else this.writeCreature(a, t);
      if (!a.ko && !a.freed) this.writeBar(a, camQ);
    }
    this.writeFx(t);
    if (this.playback) this.writeProjectiles(t - this.playback.start);
    this.pool.commit();
    this.bars.commit();
    this.updatePopups(t);
  }

  dispose(): void {
    this.pool.dispose();
    this.bars.dispose();
    disposeVillagerParts(this.vp);
    disposeSoldierParts(this.sp);
    for (const g of Object.values(this.extras)) g.dispose();
    for (const g of this.creatures.values()) g.dispose();
    for (const c of this.terrain.children) (c as THREE.Mesh).geometry?.dispose();
    for (const m of Object.values(this.hl)) {
      m.dispose();
      (m.material as THREE.Material).dispose();
    }
    this.pick?.dispose();
    for (const p of this.popups) p.sprite?.material.map?.dispose();
    for (const mat of [this.solidMat, this.unitMat, this.waterMat, this.toxicMat, this.barMat]) mat.dispose();
    this.barGeo.dispose();
    this.ballGeo.dispose();
    this.acidGeo.dispose();
  }

  // ── Playback ───────────────────────────────────────────────────────────────
  private runPlayback(t: number): void {
    const p = this.playback!;
    const T = t - p.start;
    p.cues.forEach((c, i) => {
      if (T < c.start) return;
      const local = T - c.start;
      const u = Math.min(1, local / Math.max(1e-3, c.duration));
      const first = !p.fired.has(i);
      if (first) p.fired.add(i);
      switch (c.type) {
        case 'banner':
          if (first) this.onBanner?.(c.text, c.tone);
          break;
        case 'move': {
          const a = this.actors.get(c.unitId);
          if (!a) break;
          const n = c.path.length - 1;
          const f = u * n;
          const k = Math.min(n - 1, Math.floor(f));
          const A = standPoint(this.tiles, c.path[Math.max(0, k)]);
          const B = standPoint(this.tiles, c.path[Math.min(n, k + 1)]);
          const w = n > 0 ? f - k : 1;
          a.x = A.x + (B.x - A.x) * w;
          a.y = A.y + (B.y - A.y) * w;
          a.z = A.z + (B.z - A.z) * w;
          if (n > 0 && (B.x !== A.x || B.z !== A.z)) a.yaw = yawTo(A, B);
          if (u < 1) {
            a.clip = n > 3 || a.kind === 'wolf' ? 'run' : 'walk';
            a.phase = u;
          }
          if (first) this.onFocus?.(B.x, B.z);
          if (u < 1 && Math.floor(f * 2) !== Math.floor((f - 0.08) * 2)) audio.play('step', 0.5);
          break;
        }
        case 'attack': {
          const a = this.actors.get(c.unitId);
          const b = this.actors.get(c.targetId);
          if (!a || !b) break;
          if (first && !c.ranged) audio.play('swing', 0.8);
          if (u < 1) {
            a.yaw = yawTo(a, b);
            a.clip = 'attack';
            a.phase = u;
            if (!b.ko) b.yaw = yawTo(b, a);
          }
          break;
        }
        case 'impact': {
          const b = this.actors.get(c.unitId);
          if (!b) break;
          if (first) {
            audio.play(c.blocked ? 'block' : c.hit ? (c.ko ? 'stomp' : 'thud') : 'swing', c.hit ? 0.9 : 0.4);
            if (c.hit) {
              b.hp = Math.max(0, b.hp - c.damage);
              this.popup(b, c.poison ? `☠ -${c.damage}` : `${c.crit ? 'CHÍ MẠNG ' : c.blocked ? '🛡 ' : ''}-${c.damage}`, c.poison ? '#7dd36f' : c.crit ? '#ffb020' : '#ff4f5e');
              this.spawn('puff', b, c.poison ? '#7dd36f' : c.crit ? '#ffd45c' : '#ffffff', 0.5);
            } else this.popup(b, 'Né!', '#d8e6ff');
            if (c.ko) {
              b.ko = true;
              b.koAt = t;
            }
          }
          if (u < 1 && !b.ko) {
            b.clip = c.hit ? 'hit' : 'dodge';
            b.phase = u;
          }
          break;
        }
        case 'skill': {
          const a = this.actors.get(c.unitId);
          if (!a) break;
          const at = c.at ? standPoint(this.tiles, c.at) : { x: a.x, y: a.y, z: a.z };
          if (first) {
            if (c.cinematic) this.onCinematic?.(at.x, at.z);
            if (c.skill === 'volley') this.spawn('rain', at, '#ffe066', 0.8);
            if (c.skill === 'acid_spit') this.spawn('splash', at, '#9cff5a', 0.9);
            if (c.skill === 'ground_slam') this.spawn('shock', a, '#c38bff', 0.8);
            this.popup(a, skillName(c.skill), '#ffe7a8');
          }
          if (u < 1 && (c.skill === 'shield_wall' || c.skill === 'brace')) {
            a.clip = 'defend';
            a.phase = u;
          }
          break;
        }
        case 'status': {
          const a = this.actors.get(c.unitId);
          if (a && first) {
            if (!a.statuses.includes(c.status)) a.statuses.push(c.status);
            this.popup(a, STATUS_TEXT[c.status], STATUS_COLOR[c.status]);
          }
          break;
        }
        case 'heal': {
          const a = this.actors.get(c.unitId);
          if (!a) break;
          if (first) {
            a.hp = Math.min(a.maxHp, a.hp + c.amount);
            this.popup(a, `+${c.amount}`, '#7dff8a');
            this.spawn('heal', a, '#7dff8a', 0.9);
          }
          break;
        }
        case 'pose': {
          const a = this.actors.get(c.unitId);
          if (a && u < 1 && !a.ko) {
            a.clip = c.clip;
            a.phase = u;
          }
          break;
        }
        case 'free': {
          const cap = this.actors.get(c.captiveId);
          if (cap) {
            if (u < 1) {
              cap.clip = 'cheer';
              cap.phase = u;
            } else cap.freed = true;
            if (first) this.popup(cap, '🙌 Được giải cứu!', '#ffe066');
          }
          break;
        }
        case 'outcome':
          for (const a of this.actors.values()) {
            if (a.ko || a.freed) continue;
            const won = (c.result === 'victory' && a.side === 'player') || (c.result === 'defeat' && a.side === 'enemy');
            if (won) {
              a.clip = 'victory';
              a.phase = u;
            }
          }
          break;
        case 'projectile':
          if (first) audio.play(c.kind === 'bolt' ? 'clack' : c.kind === 'arrow' ? 'twang' : 'thunk', 0.8);
          break;
      }
    });
    if (T >= p.total) this.finish();
  }

  // ── Writing ────────────────────────────────────────────────────────────────
  private color(hex: string): THREE.Color {
    let c = this.colors.get(hex);
    if (!c) {
      c = new THREE.Color(hex);
      this.colors.set(hex, c);
    }
    return c;
  }

  private part(key: string, geo: THREE.BufferGeometry, local: THREE.Matrix4, color?: THREE.Color): void {
    this.m.multiplyMatrices(this.root, local);
    this.pool.put(key, geo, this.m, color);
  }

  private writeHuman(a: Actor, t: number): void {
    const L = a.look!;
    const f = humanoidFrame(styleOf(a.kind), a.clip, t + a.seed * 0.37, a.phase);
    const M = soldierMatrices(f.pose, this.mats);
    // Knock-out: the whole body tips over backwards onto the ground (no gore, little stars).
    this.e.set(-f.fall * (Math.PI / 2 - 0.12), a.yaw, 0, 'YXZ');
    this.q.setFromEuler(this.e);
    const sc = UNIT_SCALE * (a.kind === 'robot' ? 1.1 : 1) * a.fade;
    this.root.compose(this.v.set(a.x, a.y + f.lift + f.fall * 0.15, a.z), this.q, this.s.set(sc, sc, sc));
    const V = this.vp;
    const S = this.sp;
    const tunic = this.color(L.tunic);
    const skin = this.color(L.skin);
    const pants = this.color(L.pants);
    this.part('hips', V.hips, M.hips, pants);
    this.part('torso', V.torso, M.hips, tunic);
    this.part('belt', S.belt, M.hips, this.color(L.trim));
    if (L.armor === 'iron') this.part('armor:iron', S.armor.iron, M.hips);
    else if (L.armor === 'leather') this.part('armor:leather', S.armor.leather, M.hips);
    this.part('head', V.head, M.head, skin);
    this.part('face', V.face, M.head);
    const mood = a.ko ? 'tired' : a.clip === 'victory' || a.clip === 'cheer' ? 'happy' : a.clip === 'hit' ? 'sad' : 'content';
    this.part(`mouth:${mood}`, V.mouths[mood], M.head);
    if (L.helmet === 'iron') this.part('helmet:iron', S.helmet.iron, M.head);
    else if (L.helmet === 'leather') this.part('helmet:leather', S.helmet.leather, M.head);
    else this.part(`hair:${L.hairStyle}`, V.hair[L.hairStyle], M.head, this.color(L.hair));
    if (L.extra === 'mask' || L.extra === 'visor') this.part(`x:${L.extra}`, this.extras[L.extra], M.head);
    if (L.extra === 'rope' && a.clip !== 'cheer') this.part('x:rope', this.extras.rope, M.hips);
    if (L.extra === 'torn') this.part('x:torn', this.extras.torn, M.hips);
    for (const arm of [M.armL, M.armR]) this.part('arm', V.arm, arm, tunic);
    this.part('hand', V.hand, M.handL, skin);
    this.part('hand', V.hand, M.handR, skin);
    this.part('leg', V.leg, M.legL, pants);
    this.part('leg', V.leg, M.legR, pants);
    if (L.main === 'saber') this.part('saber', S.saber, M.main);
    if (L.main === 'spear') this.part('spear', S.spear, M.main);
    if (L.main === 'crossbow') {
      this.part('crossbow', S.crossbow, M.main);
      if (f.pose.loaded > 0.5) this.part('bolt', S.bolt, M.main);
    }
    if (L.off === 'shield') this.part('shield', S.shield, M.off, tunic);
    if (L.off === 'bow') {
      this.part('bow', S.bow, M.off);
      if (f.pose.loaded > 0.5) {
        this.m.makeTranslation(0, f.pose.draw * 0.42, 0);
        this.part('arrow', S.arrow, this.m.clone().premultiply(M.off));
      }
    }
    if (L.quiver === 'arrows') this.part('quiver', S.quiver, M.hips);
    if (L.quiver === 'bolts') this.part('boltCase', S.boltCase, M.hips);
    this.writeKoStars(a, t, 2.6);
    this.writeStatusRing(a, t);
  }

  private writeCreature(a: Actor, t: number): void {
    const kind = a.kind as 'wolf' | 'spitter' | 'behemoth';
    let geo = this.creatures.get(kind);
    if (!geo) {
      geo = buildCreature(kind);
      this.creatures.set(kind, geo);
    }
    const f = creatureFrame(kind, a.clip, t + a.seed * 0.41, a.phase);
    const sc = (CREATURE_SCALE[kind] ?? 1) * a.fade;
    this.e.set(f.lean, a.yaw + f.wobble, f.fall * (Math.PI / 2), 'YXZ');
    this.q.setFromEuler(this.e);
    this.root.compose(
      this.v.set(a.x + Math.sin(a.yaw) * f.lunge, a.y + f.bob, a.z + Math.cos(a.yaw) * f.lunge),
      this.q,
      this.s.set(sc, sc * f.squash, sc)
    );
    this.pool.put(`creature:${kind}`, geo, this.root);
    this.writeKoStars(a, t, HEAD[kind] ?? 3);
    this.writeStatusRing(a, t);
  }

  private writeKoStars(a: Actor, t: number, h: number): void {
    if (!a.ko || t - a.koAt > 2.5) return;
    this.e.set(0, t * 4, 0, 'YXZ');
    this.q.setFromEuler(this.e);
    this.m.compose(this.v.set(a.x, a.y + h * 0.45, a.z), this.q, this.s.set(1, 1, 1));
    this.pool.put('stars', this.extras.stars, this.m);
  }

  /** Shield wall / brace / enrage … shown as a small ring of orbs around the unit's feet. */
  private writeStatusRing(a: Actor, t: number): void {
    if (a.ko) return;
    const ringed = a.statuses.filter((s) => s === 'shield_wall' || s === 'braced' || s === 'enraged' || s === 'overcharged' || s === 'poison');
    ringed.forEach((s, k) => {
      const c = this.color(STATUS_COLOR[s]);
      for (let i = 0; i < 6; i += 1) {
        const ang = t * 1.5 + (i / 6) * Math.PI * 2 + k;
        this.m.compose(this.v.set(a.x + Math.cos(ang) * 1.3, a.y + 0.25 + k * 0.3, a.z + Math.sin(ang) * 1.3), this.q.identity(), this.s.set(0.8, 0.8, 0.8));
        this.pool.put('orb', this.ballGeo, this.m, c);
      }
    });
  }

  private writeBar(a: Actor, camQ: THREE.Quaternion): void {
    const h = (a.look ? 3.0 * UNIT_SCALE : HEAD[a.kind] ?? 3) + 0.35;
    const w = a.kind === 'behemoth' ? 3.2 : 1.6;
    const pos = this.v.set(a.x, a.y + h, a.z);
    this.m.compose(pos, camQ, this.s.set(w + 0.12, 0.3, 1));
    this.bars.put('bg', this.barGeo, this.m, this.color('#2b2116'));
    const k = Math.max(0, a.hp / Math.max(1, a.maxHp));
    // Fill starts at the left edge of the bar (in camera space).
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camQ);
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(camQ);
    const p = pos.clone().addScaledVector(right, (-w * (1 - k)) / 2).addScaledVector(fwd, 0.02);
    this.m.compose(p, camQ, this.s.set(Math.max(0.001, w * k), 0.18, 1));
    const color = a.side === 'player' ? (k > 0.35 ? '#7dd36f' : '#ffb020') : a.side === 'neutral' ? '#ffe066' : '#ff4f5e';
    this.bars.put('fill', this.barGeo, this.m, this.color(color));
    // Status dots under the bar.
    a.statuses.forEach((s, i) => {
      this.m.compose(this.v.set(a.x - 0.5 + i * 0.35, a.y + h - 0.35, a.z), this.q.identity(), this.s.set(0.9, 0.9, 0.9));
      this.pool.put('badge', this.ballGeo, this.m, this.color(STATUS_COLOR[s]));
    });
  }

  private writeProjectiles(T: number): void {
    const p = this.playback!;
    for (const c of p.cues) {
      if (c.type !== 'projectile' || T < c.start || T > c.start + c.duration) continue;
      const a = this.actors.get(c.unitId);
      const b = this.actors.get(c.targetId);
      if (!a || !b) continue;
      const u = (T - c.start) / c.duration;
      const from = new THREE.Vector3(a.x, a.y + 1.9, a.z);
      const to = new THREE.Vector3(b.x, b.y + (b.look ? 1.6 : (HEAD[b.kind] ?? 3) * 0.5), b.z);
      const arc = from.distanceTo(to) * (c.kind === 'arrow' ? 0.12 : c.kind === 'acid' ? 0.2 : 0.04);
      const pos = from.clone().lerp(to, u);
      pos.y += arc * 4 * u * (1 - u);
      const dir = to.clone().sub(from);
      dir.y += arc * 4 * (1 - 2 * u);
      dir.normalize();
      if (c.kind === 'acid' || c.kind === 'shell') {
        this.m.compose(pos, this.q.identity(), this.s.set(1, 1, 1));
        this.pool.put(c.kind === 'acid' ? 'acid' : 'shell', this.acidGeo, this.m, this.color(c.kind === 'acid' ? '#9cff5a' : '#ffb020'));
        continue;
      }
      const axis = c.kind === 'arrow' ? new THREE.Vector3(0, -1, 0) : new THREE.Vector3(0, 0, 1);
      this.q.setFromUnitVectors(axis, dir);
      this.m.compose(pos, this.q, this.s.set(UNIT_SCALE, UNIT_SCALE, UNIT_SCALE));
      this.pool.put(c.kind === 'arrow' ? 'flyArrow' : 'flyBolt', c.kind === 'arrow' ? this.sp.arrow : this.sp.bolt, this.m);
    }
  }

  private spawn(kind: Fx['kind'], at: { x: number; y: number; z: number }, color: string, life: number): void {
    if (this.fx.length > 60) this.fx.shift();
    this.fx.push({ kind, x: at.x, y: at.y, z: at.z, born: this.time, life, color: this.color(color) });
  }

  private writeFx(t: number): void {
    this.fx = this.fx.filter((f) => t - f.born < f.life);
    for (const f of this.fx) {
      const u = (t - f.born) / f.life;
      const n = f.kind === 'shock' ? 14 : f.kind === 'rain' ? 10 : 7;
      for (let i = 0; i < n; i += 1) {
        const ang = (i / n) * Math.PI * 2;
        let x = f.x;
        let y = f.y;
        let z = f.z;
        let k = 1 - u;
        if (f.kind === 'puff') {
          x += Math.cos(ang) * u * 1.1;
          z += Math.sin(ang) * u * 1.1;
          y += 1.4 + u * 0.8;
        } else if (f.kind === 'heal') {
          x += Math.cos(ang) * 0.7;
          z += Math.sin(ang) * 0.7;
          y += 0.5 + u * 2.5;
        } else if (f.kind === 'shock') {
          x += Math.cos(ang) * (0.5 + u * 5);
          z += Math.sin(ang) * (0.5 + u * 5);
          y += 0.3;
        } else if (f.kind === 'rain') {
          // Arrows falling on the volley's area (radius 1 hex ≈ 4 m).
          const r = ((i * 37) % 10) / 10 * 4;
          x += Math.cos(ang * 3) * r;
          z += Math.sin(ang * 3) * r;
          y += 6 * (1 - u) + 0.4;
          k = 1;
        } else {
          x += Math.cos(ang) * u * 3.5;
          z += Math.sin(ang) * u * 3.5;
          y += 0.6 + Math.sin(u * Math.PI) * 1.5;
        }
        this.m.compose(this.v.set(x, y, z), this.q.identity(), this.s.setScalar(Math.max(0.05, k * 1.3)));
        this.pool.put('fx', this.ballGeo, this.m, f.color);
      }
    }
  }

  private popup(a: { x: number; y: number; z: number; look?: HumanLook | null; kind?: string }, text: string, color: string): void {
    const h = a.look ? 3.6 : HEAD[a.kind ?? ''] ?? 3.4;
    const p: Popup = { text, color, x: a.x, y: a.y + h, z: a.z, born: this.time, sprite: makeTextSprite(text, color) };
    if (p.sprite) {
      p.sprite.position.set(p.x, p.y, p.z);
      this.group.add(p.sprite);
    }
    this.popups.push(p);
    if (this.popups.length > 80) {
      const old = this.popups.shift()!;
      if (old.sprite) {
        this.group.remove(old.sprite);
        old.sprite.material.map?.dispose();
        old.sprite.material.dispose();
      }
    }
  }

  private updatePopups(t: number): void {
    for (const p of this.popups) {
      if (!p.sprite) continue;
      const age = t - p.born;
      if (age > 1.3) {
        p.sprite.visible = false;
        continue;
      }
      p.sprite.position.y = p.y + age * 1.2;
      p.sprite.material.opacity = Math.max(0, 1 - Math.max(0, age - 0.7) / 0.6);
    }
  }
}

function skillName(code: string): string {
  return (
    {
      shield_wall: '🛡 Tường khiên',
      brace: '🔱 Giữ đội hình',
      aimed_shot: '🎯 Bắn tập trung',
      volley: '🏹 Mưa tên',
      piercing_bolt: '⚡ Nỏ xuyên giáp',
      acid_spit: '🧪 Phun axit',
      overcharge: '⚡ Quá tải',
      ground_slam: '💥 Dậm đất',
    } as Record<string, string>
  )[code] ?? code;
}

/** Billboard text (damage numbers, statuses). Returns null when no 2D canvas is available. */
function makeTextSprite(text: string, color: string): THREE.Sprite | null {
  if (!BATTLE_TEXT.enabled || typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext?.('2d');
  if (!ctx) return null;
  canvas.width = 256;
  canvas.height = 64;
  ctx.font = 'bold 34px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#2b2116';
  ctx.strokeText(text, 128, 32);
  ctx.fillStyle = color;
  ctx.fillText(text, 128, 32);
  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }));
  sprite.scale.set(4, 1, 1);
  sprite.renderOrder = 10;
  return sprite;
}

