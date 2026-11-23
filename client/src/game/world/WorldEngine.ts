import { pathSurfaceSampler } from '../buildings/pathGeometry';
/**
 * WorldEngine — composes the world modules and runs them in a fixed order each frame:
 * camera → chunk streaming → vegetation culling → overlay → hover picking → lighting/fog → stats.
 * Pure Three.js (no React), so React only mounts `engine.root` and forwards input.
 */
import * as THREE from 'three';
import {
  checkFarmZoneShape,
  checkPlacement,
  getWorldBounds,
  type AxialCoord,
  MAX_LIVESTOCK_FARM_HEXES,
  getLivestockFarmDefinition,
  ranchOccupant,
  type FarmZoneCheck,
  type FarmZoneDTO,
  type LivestockFarmDTO,
  type WaterBodyCheck,
  type MilitaryStateDTO,
  type PopulationStateDTO,
  gameClock,
  type WaterBodyDTO,
  HEX_RADIUS,
  axialToWorld,
  checkWaterBodyShape,
  pondOccupant,
  type HexTile,
  type PlacementCheck,
  type WorldBuildingDTO,
  type WorldGenerator,
  worldToAxial,
} from '@cityverse/shared';
import { audio } from '../../audio/AudioManager';
import { WeatherSystem } from './WeatherSystem';
import { BuildingPreview } from '../buildings/BuildingPreview';
import { BuildingRenderer } from '../buildings/BuildingRenderer';
import type { PlacingState } from '../buildings/buildingStore';
import { FarmDraftPreview } from '../farming/FarmDraftPreview';
import { FarmRenderer } from '../farming/FarmRenderer';
import type { FarmDraft } from '../farming/farmStore';
import { LivestockRenderer } from '../livestock/LivestockRenderer';
import type { RanchDraft } from '../livestock/livestockStore';
import { PondRenderer } from '../aquaculture/PondRenderer';
import type { PondDraft } from '../aquaculture/aquaStore';
import { VillagerRenderer } from '../population/VillagerRenderer';
import { MilitaryRenderer } from '../military/MilitaryRenderer';
import { buildVillageContext } from '../population/villageContext';
import { AssetCache } from './assets/AssetCache';
import { CAMERA_PRESETS, CameraController, CameraInput, type CameraPresetName } from './CameraController';
import { HexOverlay } from './HexOverlay';
import type { QualityPreset } from './qualitySettings';
import { TerrainRenderer } from './TerrainRenderer';
import { VegetationRenderer } from './VegetationRenderer';
import { WaterRenderer } from './WaterRenderer';
import { WorldChunkManager } from './WorldChunkManager';
import { WorldInteractionController, type InteractionCallbacks } from './WorldInteractionController';
import type { WorldPerfStats } from './worldViewStore';

const SKY_TOP = new THREE.Color('#8fd3ff');
const SKY_HORIZON = new THREE.Color('#fdf0d8');

export interface EngineCallbacks extends Omit<InteractionCallbacks, 'dragDistance' | 'onClick'> {
  onStats: (stats: WorldPerfStats) => void;
  /** Placement validity under the cursor while placing (null when not over the world). */
  onPlacementCheck: (check: PlacementCheck | null) => void;
  onPlaceAt: (placing: PlacingState, anchor: AxialCoord) => void;
  onSelectBuilding: (buildingId: string | null) => void;
  /** Farm draw tool: validity of the painted hexes (null when not drawing). */
  onFarmDraftCheck: (check: FarmZoneCheck | null) => void;
  /** Farm draw tool: add or erase a hex (decided by the first hex of the stroke). */
  onPaintDraft: (hex: AxialCoord, add: boolean) => void;
  onSelectFarm: (zoneId: string | null) => void;
  /** Livestock draw tool: validity of the painted hexes (null when not drawing). */
  onRanchDraftCheck: (check: FarmZoneCheck | null) => void;
  onSelectRanch: (farmId: string | null) => void;
  /** Dig tool: validity of the painted hexes (null when not digging). */
  onPondDraftCheck?: (check: WaterBodyCheck | null) => void;
  onSelectPond?: (id: string | null) => void;
  /** Villagers that cannot reach their destination (survivor id → reason), reported ~1×/s */
  onVillagerUnreachable?: (map: Record<string, string>) => void;
}

export class WorldEngine {
  readonly root = new THREE.Group();
  readonly manager: WorldChunkManager;
  readonly terrain: TerrainRenderer;
  readonly water: WaterRenderer;
  readonly vegetation: VegetationRenderer;
  readonly overlay: HexOverlay;
  readonly camera: CameraController;
  readonly assets = new AssetCache();
  readonly sun = new THREE.DirectionalLight('#fff4dc', 2.1);
  readonly hemi = new THREE.HemisphereLight('#dff3ff', '#7aa64a', 1.05);
  readonly buildings = new BuildingRenderer();
  readonly preview: BuildingPreview;
  readonly farms = new FarmRenderer();
  readonly farmPreview = new FarmDraftPreview();
  private farmDraft: FarmDraft | null = null;
  private farmOffsetMs = 0;
  private farmList: readonly FarmZoneDTO[] = [];
  private paintAdd = true;
  private farmReseatTimer = -1;
  readonly livestock = new LivestockRenderer();
  private ranchDraft: RanchDraft | null = null;
  private livestockOffsetMs = 0;
  private livestockList: readonly LivestockFarmDTO[] = [];
  readonly ponds = new PondRenderer();
  private pondDraft: PondDraft | null = null;
  private pondOffsetMs = 0;
  private pondList: readonly WaterBodyDTO[] = [];
  readonly villagers: VillagerRenderer;
  readonly military = new MilitaryRenderer();
  private militaryState: MilitaryStateDTO | null = null;
  private militaryDirty = false;
  private population: PopulationStateDTO | null = null;
  private populationOffsetMs = 0;
  private villageDirty = false;
  private unreachableTimer = 0;
  /** Game hour shown (null until the population state arrives → fixed daylight). */
  private gameHour: number | null = null;
  private readonly sky: THREE.Mesh;
  private placing: PlacingState | null = null;
  private hoverTile: HexTile | null = null;
  private serverOffsetMs = 0;
  private buildingList: readonly WorldBuildingDTO[] = [];
  private reseatPending = false;
  private readonly sunOffset = new THREE.Vector3(70, 120, 45);
  private readonly sunDir = new THREE.Vector3();
  private input: CameraInput | null = null;
  private interaction: WorldInteractionController | null = null;
  private quality: QualityPreset;
  private time = 0;
  private statsTimer = 0;
  private frames = 0;
  private frameTime = 0;
  private lastPose = new THREE.Vector3();
  private lastLook = new THREE.Vector3();
  /** Phase 12: rain / wind / fog and night lamps (visual only). */
  readonly weather: WeatherSystem;
  private audioTimer = 0;
  /** ms from app start until the first full frame (load-time metric) */
  readonly bornAt = typeof performance !== 'undefined' ? performance.now() : 0;
  firstFrameMs: number | null = null;

  constructor(
    readonly world: WorldGenerator,
    quality: QualityPreset
  ) {
    this.quality = quality;
    this.root.name = 'WorldEngine';
    this.manager = new WorldChunkManager(world, quality);
    this.terrain = new TerrainRenderer(this.manager, quality);
    this.water = new WaterRenderer(this.manager);
    this.vegetation = new VegetationRenderer(this.manager, this.assets, quality);
    this.overlay = new HexOverlay(world, this.manager);
    this.camera = new CameraController(
      {
        bounds: getWorldBounds(),
        margin: 25,
        minDistance: 24,
        maxDistance: 430,
        minPitch: THREE.MathUtils.degToRad(24),
        maxPitch: THREE.MathUtils.degToRad(80),
        groundClearance: 4,
      },
      { x: world.spawn.x, z: world.spawn.z, preset: 'default' }
    );

    this.villagers = new VillagerRenderer(buildVillageContext({ world, buildings: [], farms: [], ranches: [], ponds: [], population: null }));
    // Riders sit on the saddle seat socket of the horses drawn by the livestock renderer.
    this.military.setSeatProvider((animalId, out) => this.livestock.seatMatrix(animalId, out));
    this.sky = createSkyDome();
    this.weather = new WeatherSystem(Math.round(world.spawn.x * 31 + world.spawn.z * 17), quality.level);
    this.preview = new BuildingPreview(this.buildings.models);

    this.sun.castShadow = quality.shadows;
    this.configureShadows(quality);

    this.root.add(this.sky, this.hemi, this.sun, this.sun.target);
    this.root.add(
      this.terrain.group,
      this.water.group,
      this.vegetation.group,
      this.overlay.group,
      this.buildings.group,
      this.preview.group,
      this.farms.group,
      this.livestock.group,
      this.ponds.group,
      this.villagers.group,
      this.military.group,
      this.farmPreview.group,
      this.weather.group
    );
    // Player terrain edits (dug ponds) sit on top of the seed terrain.
    world.setTerrainEdits(this.ponds.edits);
    // Terrain LOD changes slightly alter the surface: keep buildings seated on it.
    this.manager.subscribe((e) => {
      if (e.type === 'terrain') {
        this.reseatPending = true;
        if (this.farmList.length || this.livestockList.length || this.pondList.length) this.farmReseatTimer = 0.6; // debounce: scenery is baked
      }
    });

    // Fill the area around spawn synchronously so the first frame isn't empty.
    this.manager.loadAllPending(world.spawn.x, world.spawn.z, 170);
    this.camera.snap((x, z) => this.manager.sampleHeight(x, z));
  }

  /** Hooks DOM input. `threeCamera` is the R3F perspective camera. */
  attach(element: HTMLElement, threeCamera: THREE.PerspectiveCamera, cb: EngineCallbacks): void {
    this.detach();
    const height = (x: number, z: number): number => this.manager.sampleHeight(x, z);
    this.interaction = new WorldInteractionController(element, threeCamera, this.world, height, {
      ...cb,
      onHover: (tile) => {
        this.hoverTile = tile;
        this.refreshPlacement();
        this.refreshFarmDraft();
        cb.onHover(tile);
      },
      onClick: (tile, ndc) => {
        if (this.placing) {
          if (tile) cb.onPlaceAt(this.placing, { q: tile.q, r: tile.r });
          return true;
        }
        const hit = this.buildings.pick(threeCamera, ndc) ?? (tile ? this.buildings.occupiedHexes().get(tile.key) : undefined);
        if (hit) {
          cb.onSelectFarm(null);
          cb.onSelectRanch(null);
          cb.onSelectBuilding(hit);
          return true;
        }
        const zone = tile ? this.farms.zoneAtHex(tile.key) : null;
        const ranch = tile && !zone ? this.livestock.farmAtHex(tile.key) : null;
        const pond = tile && !zone && !ranch ? this.ponds.bodyAtHex(tile.key) : null;
        cb.onSelectBuilding(null);
        cb.onSelectFarm(zone);
        cb.onSelectRanch(ranch);
        cb.onSelectPond?.(pond);
        if (ranch) this.livestock.react(ranch);
        return Boolean(zone || ranch || pond);
      },
      isPainting: () => this.draftHexes() !== null,
      onPaint: (tile, phase) => {
        const hexes = this.draftHexes();
        if (!hexes) return;
        if (phase === 'start') this.paintAdd = !hexes.some((h) => h.q === tile.q && h.r === tile.r);
        cb.onPaintDraft({ q: tile.q, r: tile.r }, this.paintAdd);
      },
      dragDistance: () => this.input?.lastDragDistance ?? 0,
    });
    this.input = new CameraInput(
      element,
      this.camera,
      () => THREE.MathUtils.degToRad(threeCamera.fov),
      (x, y) => this.interaction?.groundAt(x, y) ?? null
    );
    this.input.leftDragPans = () => this.draftHexes() === null;
    this.callbacks = cb;
  }

  detach(): void {
    this.input?.dispose();
    this.interaction?.dispose();
    this.input = null;
    this.interaction = null;
  }

  private callbacks: EngineCallbacks | null = null;

  setQuality(quality: QualityPreset): void {
    if (quality === this.quality) return;
    this.quality = quality;
    this.manager.setQuality(quality);
    this.terrain.setQuality(quality);
    this.vegetation.setQuality(quality);
    this.configureShadows(quality);
    this.weather.setQuality(quality.level);
  }

  setMode(mode: 'normal' | 'build'): void {
    this.overlay.setMode(mode);
    if (mode === 'normal') this.overlay.setHover(null);
  }

  setHover(tile: HexTile | null, buildMode: boolean): void {
    // While placing, the ghost + footprint fills replace the single-hex highlight.
    this.overlay.setHover(buildMode && !this.placing && !this.draftHexes() ? tile : null);
  }

  /** Server building list → meshes; vegetation is hidden under building footprints. */
  setBuildings(list: readonly WorldBuildingDTO[], serverOffsetMs: number): void {
    this.buildingList = list;
    this.serverOffsetMs = serverOffsetMs;
    this.buildings.sync(list, (x, z) => this.manager.sampleHeight(x, z));
    this.updateLamps();
    this.villageDirty = true;
    this.updateBlockedVegetation();
    this.refreshPlacement();
    this.refreshFarmDraft();
  }

  /** Server farm zones → scenery, crops, farmers; vegetation is hidden under farmland. */
  setFarms(list: readonly FarmZoneDTO[], serverOffsetMs: number): void {
    this.farmList = list;
    this.farmOffsetMs = serverOffsetMs;
    this.farms.sync(list, (x, z) => this.manager.sampleHeight(x, z));
    this.villageDirty = true;
    this.updateBlockedVegetation();
    this.refreshPlacement();
    this.refreshFarmDraft();
  }

  setFarmDraft(draft: FarmDraft | null): void {
    this.farmDraft = draft;
    if (draft) this.overlay.setHover(null);
    this.refreshFarmDraft();
  }

  /** Server livestock farms → scenery and simulated animals. */
  setLivestock(list: readonly LivestockFarmDTO[], serverOffsetMs: number): void {
    this.livestockList = list;
    this.livestockOffsetMs = serverOffsetMs;
    this.livestock.sync(list, (x, z) => this.manager.sampleHeight(x, z), Date.now() + serverOffsetMs);
    this.villageDirty = true;
    this.updateBlockedVegetation();
    this.refreshPlacement();
    this.refreshFarmDraft();
  }

  setRanchDraft(draft: RanchDraft | null): void {
    this.ranchDraft = draft;
    if (draft) this.overlay.setHover(null);
    this.refreshFarmDraft();
  }

  setRanchSelection(farmId: string | null): void {
    this.livestock.setHighlight(farmId, (x, z) => this.manager.sampleHeight(x, z));
  }

  focusRanch(farmId: string): void {
    const e = this.livestock.getEntry(farmId);
    if (e) this.camera.focus(e.layout.frame.centroid.x, e.layout.frame.centroid.z, Math.min(this.camera.desired.distance, 90));
  }

  /** Hexes of whichever draw tool is active (fields, livestock or the dig tool), or null. */
  private draftHexes(): readonly AxialCoord[] | null {
    return this.farmDraft?.hexes ?? this.ranchDraft?.hexes ?? this.pondDraft?.hexes ?? null;
  }

  /**
   * Server water bodies → terrain edits + water, banks, structures and fish. Only chunks under
   * hexes whose carve changed are rebuilt; the terrain mesh, vegetation, picking and overlays
   * then follow the dug surface (no separate pond plate, no gap at the shore).
   */
  setWaterBodies(list: readonly WaterBodyDTO[], serverOffsetMs: number): void {
    this.pondList = list;
    this.pondOffsetMs = serverOffsetMs;
    const changed = this.ponds.edits.setPonds(PondRenderer.specs(list));
    if (changed.size) {
      this.world.setTerrainEdits(this.ponds.edits);
      const areas = [...changed].map((k) => {
        const [q, r] = k.split(',').map(Number);
        const c = axialToWorld(q, r);
        const pad = HEX_RADIUS + 1;
        return { minX: c.x - pad, maxX: c.x + pad, minZ: c.z - pad, maxZ: c.z + pad };
      });
      this.manager.invalidateAreas(areas);
      this.reseatPending = true;
    }
    this.ponds.sync(list, (x, z) => this.manager.sampleHeight(x, z));
    this.villageDirty = true;
    this.updateBlockedVegetation();
    this.refreshPlacement();
    this.refreshFarmDraft();
  }

  /** Villagers, their homes / jobs and the game clock (from the population state). */
  setPopulation(state: PopulationStateDTO | null, serverOffsetMs: number): void {
    this.population = state;
    this.populationOffsetMs = serverOffsetMs;
    this.villageDirty = true;
  }

  /** Soldiers, barracks stations and training jobs (from the military state). */
  setMilitary(state: MilitaryStateDTO | null): void {
    this.militaryState = state;
    this.militaryDirty = true;
  }

  /** Selected soldier the camera keeps following while they ride. */
  private followSoldier: string | null = null;

  focusSoldier(id: string | null): void {
    this.military.setSelected(id);
    this.followSoldier = id;
    const p = id ? this.military.positionOf(id) : null;
    if (p) this.camera.focus(p.x, p.z, Math.min(this.camera.desired.distance, 55));
  }

  focusVillager(id: string): void {
    const p = this.villagers.brain.positions().find((x) => x.id === id);
    if (p) this.camera.focus(p.x, p.z, Math.min(this.camera.desired.distance, 60));
  }

  /** Current game hour (0..24) or null before the clock is known. */
  get hour(): number | null {
    return this.gameHour;
  }

  private refreshVillage(): void {
    this.villageDirty = false;
    this.villagers.setContext(
      buildVillageContext({
        world: this.world,
        buildings: this.buildingList,
        farms: this.farmList,
        ranches: this.livestockList,
        ponds: this.pondList,
        population: this.population,
      })
    );
    this.villagers.sync(this.population?.survivors ?? [], this.gameHour ?? 9);
  }

  /** One warm lamp per finished building (roads excluded), at about eave height. */
  private updateLamps(): void {
    const pts: THREE.Vector3[] = [];
    for (const b of this.buildingList) {
      if (b.typeCode === 'road' || !b.footprint.length) continue;
      let x = 0;
      let z = 0;
      for (const f of b.footprint) {
        const p = axialToWorld(f.q, f.r);
        x += p.x / b.footprint.length;
        z += p.z / b.footprint.length;
      }
      pts.push(new THREE.Vector3(x + 0.9, this.manager.sampleHeight(x, z) + 2.4 + Math.min(2, b.footprint.length * 0.25), z + 0.9));
    }
    this.weather.setLamps(pts);
  }

  /** Sun, sky and fog follow the game clock (night is dim and blue, dawn / dusk warm). */
  private applyDaylight(hour: number | null, scene: THREE.Scene): void {
    const d = hour === null ? 1 : daylight(hour);
    const warm = hour === null ? 0 : Math.max(0, 1 - Math.abs(hour - 6.8) / 1.6) + Math.max(0, 1 - Math.abs(hour - 18.6) / 1.6);
    this.sun.intensity = 0.25 + 1.85 * d;
    this.sun.color.setRGB(1, 0.96 - 0.25 * warm, 0.86 - 0.4 * warm);
    this.hemi.intensity = 0.35 + 0.7 * d;
    const skyK = 0.25 + 0.75 * d;
    (this.sky.material as THREE.MeshBasicMaterial).color.setRGB(skyK * (1 - 0.1 * warm), skyK * (0.92 + 0.08 * d), skyK * (1.05 - 0.05 * d));
    if (scene.fog instanceof THREE.Fog) scene.fog.color.copy(FOG_COLOR).multiplyScalar(0.3 + 0.7 * d);
  }

  setPondDraft(draft: PondDraft | null): void {
    this.pondDraft = draft;
    if (draft) this.overlay.setHover(null);
    this.refreshFarmDraft();
  }

  setPondSelection(id: string | null): void {
    this.ponds.setHighlight(id, (x, z) => this.manager.sampleHeight(x, z));
  }

  /** Feeding effect (fish gather, ripples). */
  pondFeedFx(id: string): void {
    this.ponds.feed(id);
  }

  focusPond(id: string): void {
    const e = this.ponds.getEntry(id);
    if (e) this.camera.focus(e.layout.frame.centroid.x, e.layout.frame.centroid.z, Math.min(this.camera.desired.distance, 90));
  }

  setFarmSelection(zoneId: string | null): void {
    this.farms.setHighlight(zoneId, (x, z) => this.manager.sampleHeight(x, z));
  }

  focusFarm(zoneId: string): void {
    const e = this.farms.getEntry(zoneId);
    if (e) this.camera.focus(e.layout.centroid.x, e.layout.centroid.z, Math.min(this.camera.desired.distance, 110));
  }

  /** Hex key → building id, `farm:<zoneId>` or `ranch:<farmId>` (all block each other). */
  occupancy(): Map<string, string> {
    const map = this.buildings.occupiedHexes();
    for (const [k, v] of this.farms.occupiedHexes()) map.set(k, v);
    for (const [k, v] of this.livestock.occupiedHexes()) map.set(k, v);
    for (const [k, v] of this.ponds.occupiedHexes()) map.set(k, v);
    return map;
  }

  private updateBlockedVegetation(): void {
    this.vegetation.setBlockedHexes(new Set(this.occupancy().keys()));
  }

  private refreshFarmDraft(): void {
    const height = (x: number, z: number): number => this.manager.sampleHeight(x, z);
    const hover = this.hoverTile ? { q: this.hoverTile.q, r: this.hoverTile.r } : null;
    const p = this.pondDraft;
    if (p) {
      const body = p.expandId ? this.pondList.find((b) => b.id === p.expandId) : undefined;
      const check = p.hexes.length
        ? checkWaterBodyShape(this.world, p.type, p.hexes, this.occupancy(), {
            baseHexes: body?.hexes,
            selfOccupant: body ? pondOccupant(body.id) : undefined,
            baseHeight: (x, z) => this.world.terrain.baseHeightAt(x, z),
            ownedHexes: this.world.getOwnedTerritory(),
          })
        : null;
      this.farmPreview.show(check as unknown as FarmZoneCheck | null, body?.hexes ?? [], hover, height);
      this.callbacks?.onPondDraftCheck?.(check);
      if (!this.ranchDraft && !this.farmDraft) return;
    } else {
      this.callbacks?.onPondDraftCheck?.(null);
    }
    const r = this.ranchDraft;
    if (r) {
      const def = getLivestockFarmDefinition(r.farmType);
      // Expanding an existing farm: its hexes are the base, its own occupant id is free.
      const farm = r.expandFarmId ? this.livestockList.find((f) => f.id === r.expandFarmId) : undefined;
      const check = r.hexes.length
        ? checkFarmZoneShape(this.world, r.hexes, this.occupancy(), {
            minHexes: def.minHexes,
            maxHexes: MAX_LIVESTOCK_FARM_HEXES,
            ...(farm ? { baseHexes: farm.hexes, selfOccupant: ranchOccupant(farm.id) } : {}),
          })
        : null;
      this.farmPreview.show(check, farm?.hexes ?? [], hover, height);
      this.callbacks?.onRanchDraftCheck(check);
    } else {
      this.callbacks?.onRanchDraftCheck(null);
    }
    const d = this.farmDraft;
    if (!d) {
      if (!r && !p) this.farmPreview.hide();
      this.callbacks?.onFarmDraftCheck(null);
      return;
    }
    const zone = d.zoneId ? this.farmList.find((z) => z.id === d.zoneId) : undefined;
    const check = d.hexes.length
      ? checkFarmZoneShape(this.world, d.hexes, this.occupancy(), zone ? { zoneId: zone.id, baseHexes: zone.hexes } : {})
      : null;
    this.farmPreview.show(check, zone?.hexes ?? [], hover, height);
    this.callbacks?.onFarmDraftCheck(check);
  }

  setPlacing(placing: PlacingState | null): void {
    this.placing = placing;
    if (placing) this.overlay.setHover(null);
    this.refreshPlacement();
  }

  focusBuilding(id: string): void {
    const b = this.buildingList.find((x) => x.id === id);
    const root = this.buildings.getEntryRoot(id);
    if (!b || !root) return;
    this.camera.focus(root.position.x, root.position.z, Math.min(this.camera.desired.distance, 90));
  }

  private refreshPlacement(): void {
    const tile = this.hoverTile;
    if (!this.placing || !tile) {
      this.preview.hide();
      this.callbacks?.onPlacementCheck(null);
      return;
    }
    const p = this.placing;
    const check = checkPlacement(this.world, p.typeCode, { q: tile.q, r: tile.r }, p.rotation, this.occupancy(), p.movingId ?? undefined);
    const height = (x: number, z: number) => this.manager.sampleHeight(x, z);
    this.preview.show(p.typeCode, p.level, p.rotation, check, p.typeCode === 'road' ? pathSurfaceSampler(this.buildingList, height) : height);
    this.callbacks?.onPlacementCheck(check);
  }

  focusHome(): void {
    this.camera.focus(this.world.spawn.x, this.world.spawn.z, CAMERA_PRESETS.default.distance, CAMERA_PRESETS.default.pitch);
  }

  focusOn(x: number, z: number, distance?: number): void {
    this.camera.focus(x, z, distance);
  }

  applyPreset(preset: CameraPresetName): void {
    this.camera.applyPreset(preset);
  }

  frame(dt: number, threeCamera: THREE.PerspectiveCamera, scene: THREE.Scene, gl: THREE.WebGLRenderer): void {
    const delta = Math.min(dt, 0.1);
    this.time += delta;

    // 1. Camera
    this.input?.update(delta);
    const height = (x: number, z: number): number => this.manager.sampleHeight(x, z);
    this.camera.update(delta, height);
    this.camera.applyTo(threeCamera);
    const moved =
      this.lastPose.distanceToSquared(this.camera.position) > 1e-6 ||
      this.lastLook.distanceToSquared(this.camera.lookAt) > 1e-6;
    this.lastPose.copy(this.camera.position);
    this.lastLook.copy(this.camera.lookAt);

    // 2. Streaming
    const focus = this.camera.current;
    this.manager.update(focus.x, focus.z, this.manager.radiusForCameraDistance(focus.distance), 5);

    // 3. Vegetation pools (chunk frustum culling, LOD, distance layers)
    this.vegetation.update(threeCamera, focus.x, focus.z, delta, this.time);

    // 4. Overlay + hover picking
    this.overlay.update();
    this.interaction?.update(moved);

    // 4b. Buildings: stay seated after terrain LOD swaps; construction progress + bars.
    if (this.reseatPending) {
      this.reseatPending = false;
      this.buildings.reseat(height);
      this.military.reseat(height);
    }
    this.buildings.update(Date.now() + this.serverOffsetMs, threeCamera);

    // 4c. Farms: re-drape after terrain LOD swaps (debounced), growth, wind, farmers.
    if (this.farmReseatTimer >= 0) {
      this.farmReseatTimer -= delta;
      if (this.farmReseatTimer < 0) {
        this.farms.reseat(height);
        this.livestock.reseat(height, Date.now() + this.livestockOffsetMs);
        this.ponds.sync(this.pondList, height, true);
      }
    }
    this.farms.update(Date.now() + this.farmOffsetMs, delta, this.time, threeCamera, height);
    // 4d. Livestock: animal state machines, LOD + animation culling.
    this.livestock.update(Date.now() + this.livestockOffsetMs, delta, this.time, threeCamera, height);

    // 5. Lighting, fog, sky follow the focus
    const look = this.camera.lookAt;
    this.sun.position.copy(look).add(this.sunOffset);
    this.sun.target.position.copy(look);
    this.sun.target.updateMatrixWorld();
    this.sunDir.copy(this.sunOffset).normalize();
    this.water.update(this.time, this.sunDir);
    // 5a. Villagers: schedule → behaviour → animation; day / night light.
    this.gameHour = this.population
      ? gameClock(new Date(this.population.clock.epoch).getTime(), this.population.clock.daySeconds, Date.now() + this.populationOffsetMs).hour
      : null;
    if (this.villageDirty) this.refreshVillage();
    this.villagers.update(delta, this.gameHour ?? 9, threeCamera, height);
    this.applyDaylight(this.gameHour, scene);
    // 5a''. Weather: clouds dim the light, rain / fog close in, lamps glow at night.
    const dayK = this.gameHour === null ? 1 : daylight(this.gameHour);
    const wx = this.weather.update(delta, Date.now(), dayK, look, threeCamera);
    this.sun.intensity *= 1 - 0.45 * wx.cloud - 0.1 * wx.rain;
    this.hemi.intensity *= 1 - 0.2 * wx.cloud;
    this.audioTimer += delta;
    if (this.audioTimer > 0.5) {
      this.audioTimer = 0;
      const hex = worldToAxial(look.x, look.z);
      let wet = 0;
      for (const [dq, dr] of [[0, 0], [2, 0], [-2, 0], [0, 2], [0, -2], [2, -2], [-2, 2]]) if (this.world.getHexTile(hex.q + dq, hex.r + dr).isWater) wet += 1 / 7;
      const near = Math.max(0, 1 - threeCamera.position.distanceTo(look) / 260);
      audio.setAmbience({ daylight: dayK, wind: wx.wind, rain: wx.rain, water: wet * (0.4 + 0.6 * near), music: 'world' });
    }
    this.unreachableTimer += delta;
    if (this.unreachableTimer > 1) {
      this.unreachableTimer = 0;
      this.callbacks?.onVillagerUnreachable?.(this.villagers.brain.unreachable());
    }
    // 5a'. Military compounds: drills, reacting dummies / targets, arrows, sounds.
    if (this.militaryDirty) {
      this.militaryDirty = false;
      this.military.sync(this.militaryState, height);
    }
    this.military.update(delta, this.time, threeCamera);
    if (this.followSoldier && this.military.isRiding(this.followSoldier)) {
      const p = this.military.positionOf(this.followSoldier);
      if (p) this.camera.focus(p.x, p.z);
    }
    // 5b. Ponds: water level / quality, fish schools, bubbles, ripples.
    this.ponds.update(delta, this.time, threeCamera, this.sunDir, Date.now() + this.pondOffsetMs);
    this.sky.position.copy(threeCamera.position);
    const camDist = threeCamera.position.distanceTo(look);
    const fogFar = camDist + this.manager.focus.radius * 0.95;
    if (scene.fog instanceof THREE.Fog) {
      const thick = 1 - 0.6 * this.weather.state.fog - 0.2 * this.weather.state.rain;
      scene.fog.near = camDist * thick + this.manager.focus.radius * 0.25 * thick;
      scene.fog.far = camDist + (fogFar - camDist) * thick;
    }
    threeCamera.far = fogFar + 200;
    threeCamera.updateProjectionMatrix();
    this.sky.scale.setScalar(threeCamera.far * 0.85);

    // 6. Stats (gl.info holds the previous frame's numbers here)
    if (this.firstFrameMs === null && this.manager.stats.pending === 0) this.firstFrameMs = Math.round(performance.now() - this.bornAt);
    this.frames += 1;
    this.frameTime += dt;
    this.statsTimer += dt;
    if (this.statsTimer >= 0.5 && this.callbacks) {
      const s = this.manager.stats;
      this.callbacks.onStats({
        fps: Math.round(this.frames / this.statsTimer),
        frameMs: +((this.frameTime / this.frames) * 1000).toFixed(1),
        drawCalls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
        geometries: gl.info.memory.geometries,
        loadedChunks: s.loaded,
        pendingChunks: s.pending,
        totalChunks: s.total,
        vegetationInstances: this.vegetation.visibleInstances,
        textures: gl.info.memory.textures,
        programs: gl.info.programs?.length ?? 0,
        buildings: this.buildingList.length,
        villagers: this.population?.survivors.length ?? 0,
        animals: this.livestockList.reduce((n, f) => n + f.animals.length, 0),
        soldiers: this.militaryState?.units.length ?? 0,
        lamps: this.weather.lampCount,
        rainDrops: this.weather.rainDrops,
        weather: this.weather.state.kind,
        loadMs: this.firstFrameMs,
      });
      this.statsTimer = 0;
      this.frames = 0;
      this.frameTime = 0;
    }
  }

  dispose(): void {
    this.detach();
    this.weather.dispose();
    this.overlay.dispose();
    this.vegetation.dispose();
    this.water.dispose();
    this.terrain.dispose();
    this.manager.dispose();
    this.assets.dispose();
    this.preview.dispose();
    this.buildings.dispose();
    this.farmPreview.dispose();
    this.farms.dispose();
    this.livestock.dispose();
    this.ponds.dispose();
    this.villagers.dispose();
    this.military.dispose();
    this.world.setTerrainEdits(null);
    this.sky.geometry.dispose();
    (this.sky.material as THREE.Material).dispose();
    this.sun.shadow.map?.dispose();
  }

  private configureShadows(quality: QualityPreset): void {
    this.sun.castShadow = quality.shadows;
    const cam = this.sun.shadow.camera;
    const extent = quality.level === 'high' ? 150 : 110;
    cam.left = -extent;
    cam.right = extent;
    cam.top = extent;
    cam.bottom = -extent;
    cam.near = 20;
    cam.far = 400;
    cam.updateProjectionMatrix();
    this.sun.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.6;
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
    this.buildings.setShadows(quality.shadows);
    this.farms.setShadows(quality.shadows);
    this.livestock.setShadows(quality.shadows);
    this.villagers.setShadows(quality.shadows);
    this.military.setShadows(quality.shadows);
  }
}

function createSkyDome(): THREE.Mesh {
  const geo = new THREE.SphereGeometry(1, 24, 12);
  const pos = geo.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i += 1) {
    const t = Math.max(0, pos.getY(i));
    c.copy(SKY_HORIZON).lerp(SKY_TOP, Math.pow(t, 0.6));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'SkyDome';
  mesh.scale.setScalar(600);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return mesh;
}

export const FOG_COLOR = SKY_HORIZON.clone();

/** 0 (night) … 1 (full day) for a game hour. */
export function daylight(hour: number): number {
  const h = ((hour % 24) + 24) % 24;
  if (h < 5 || h >= 21) return 0;
  if (h < 7.5) return (h - 5) / 2.5;
  if (h > 18) return 1 - (h - 18) / 3;
  return 1;
}
