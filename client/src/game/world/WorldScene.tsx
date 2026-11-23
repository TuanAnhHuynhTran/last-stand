import { useExplorationStore } from './explorationStore';
import { useEffect, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { WorldGenerator } from '@cityverse/shared';
import { QUALITY_PRESETS } from './qualitySettings';
import { WorldEngine } from './WorldEngine';
import { toHexInfo, useWorldViewStore } from './worldViewStore';
import { useBuildingStore } from '../buildings/buildingStore';
import { useFarmStore } from '../farming/farmStore';
import { useLivestockStore } from '../livestock/livestockStore';
import { useAquaStore } from '../aquaculture/aquaStore';
import { usePopulationStore } from '../population/populationStore';
import { useMilitaryStore } from '../military/militaryStore';

/**
 * Mounts the imperative WorldEngine inside the R3F canvas and bridges it with the Zustand
 * view store. There is no React component per chunk, tree or hex.
 */
export function WorldScene({ world }: { world: WorldGenerator }) {
  const { gl, camera, scene } = useThree();
  const [engine, setEngine] = useState<WorldEngine | null>(null);
  const quality = useWorldViewStore((s) => s.quality);
  const mode = useWorldViewStore((s) => s.mode);
  const selected = useWorldViewStore((s) => s.selected);
  const cameraCommand = useWorldViewStore((s) => s.cameraCommand);
  const territory = useExplorationStore(s => s.state);
  const explorationActive = useExplorationStore(s => s.active);
  const placing = useBuildingStore((s) => s.placing);

  // Created in an effect (not useMemo) so StrictMode's mount → unmount → mount is safe.
  useEffect(() => {
    const e = new WorldEngine(world, QUALITY_PRESETS[useWorldViewStore.getState().quality]);
    setEngine(e);
    useWorldViewStore.getState().setReady(true);
    if (import.meta.env.DEV) {
      // Handles for automated browser checks in dev builds only.
      const w = window as unknown as Record<string, unknown>;
      w.__LH_ENGINE__ = e;
      w.__LH_WORLD__ = useWorldViewStore;
      w.__LH_BUILD__ = useBuildingStore;
      w.__LH_FARM__ = useFarmStore;
      w.__LH_LIVESTOCK__ = useLivestockStore;
      w.__LH_AQUA__ = useAquaStore;
      w.__LH_POPULATION__ = usePopulationStore;
    }
    return () => {
      useWorldViewStore.getState().setReady(false);
      e.dispose();
    };
  }, [world]);

  useEffect(() => {
    if (!engine) return undefined;
    const perspective = camera as THREE.PerspectiveCamera;
    engine.attach(gl.domElement, perspective, {
      onHover: (tile) => {
        const store = useWorldViewStore.getState();
        store.setHovered(tile ? toHexInfo(world, tile) : null);
        engine.setHover(tile, store.mode === 'build');
      },
      onSelect: (tile, additive) => useWorldViewStore.getState().selectHex(toHexInfo(world, tile), additive),
      onFocus: (x, z) => engine.focusOn(x, z),
      isBuildMode: () => useWorldViewStore.getState().mode === 'build',
      onStats: (stats) => useWorldViewStore.getState().setStats(stats),
      onPlacementCheck: (check) =>
        useBuildingStore
          .getState()
          .setPreview(check ? { anchor: check.hexes[0], valid: check.valid, issues: check.issues } : null),
      onPlaceAt: (placing, anchor) => useBuildingStore.getState().handlers?.commitPlacement(placing, anchor),
      onSelectBuilding: (id) => useBuildingStore.getState().select(id),
      onFarmDraftCheck: (check) => useFarmStore.getState().setDraftCheck(check),
      onPaintDraft: (hex, add) => {
        // Route to whichever draw tool is active (livestock farm or crop field).
        if (useAquaStore.getState().draft) useAquaStore.getState().paintDraftHex(hex, add);
        else if (useLivestockStore.getState().draft) useLivestockStore.getState().paintDraftHex(hex, add);
        else useFarmStore.getState().paintDraftHex(hex, add);
      },
      onSelectFarm: (id) => useFarmStore.getState().selectZone(id),
      onRanchDraftCheck: (check) => useLivestockStore.getState().setDraftCheck(check),
      onSelectRanch: (id) => useLivestockStore.getState().selectFarm(id),
      onPondDraftCheck: (check) => useAquaStore.getState().setDraftCheck(check),
      onSelectPond: (id) => useAquaStore.getState().select(id),
      onVillagerUnreachable: (map) => usePopulationStore.getState().setUnreachable(map),
    });
    // Construction "rising" effect uses per-material clipping planes.
    gl.localClippingEnabled = true;
    return () => engine.detach();
  }, [engine, gl, camera, world]);

  // Phase 12: forced weather look (settings / benchmark); 'auto' follows the seeded schedule.
  useEffect(() => {
    if (!engine) return undefined;
    engine.weather.mode = useWorldViewStore.getState().weatherMode;
    return useWorldViewStore.subscribe((s) => {
      engine.weather.mode = s.weatherMode;
    });
  }, [engine]);

  useEffect(() => {
    world.setClaims(territory?.tiles.filter(t => t.status === 'claimed') ?? []);
    engine?.overlay.refreshTerritory();
    engine?.manager.setVisibleHexes(explorationActive ? territory?.tiles ?? world.getStarterTerritory() : null);
  }, [territory, world, engine, explorationActive]);

  // Buildings from the server → meshes.
  useEffect(() => {
    if (!engine) return undefined;
    const apply = (s: ReturnType<typeof useBuildingStore.getState>) => engine.setBuildings(s.buildings, s.serverOffsetMs);
    apply(useBuildingStore.getState());
    return useBuildingStore.subscribe((s, prev) => {
      if (s.buildings !== prev.buildings || s.serverOffsetMs !== prev.serverOffsetMs) apply(s);
    });
  }, [engine]);

  // Farm zones, draw tool and selection.
  useEffect(() => {
    if (!engine) return undefined;
    const apply = (s: ReturnType<typeof useFarmStore.getState>) => engine.setFarms(s.zones, s.serverOffsetMs);
    const init = useFarmStore.getState();
    apply(init);
    engine.setFarmDraft(init.draft);
    engine.setFarmSelection(init.selectedZoneId);
    return useFarmStore.subscribe((s, prev) => {
      if (s.zones !== prev.zones || s.serverOffsetMs !== prev.serverOffsetMs) apply(s);
      if (s.draft !== prev.draft) {
        engine.setFarmDraft(s.draft);
        if (s.draft && !prev.draft) {
          useWorldViewStore.getState().setMode('build');
          useBuildingStore.getState().cancelPlacing();
          useLivestockStore.getState().cancelDraft();
          useAquaStore.getState().cancelDraft();
        }
      }
      if (s.selectedZoneId !== prev.selectedZoneId || s.zones !== prev.zones) engine.setFarmSelection(s.selectedZoneId);
    });
  }, [engine]);

  // Livestock farms, their draw tool and selection.
  useEffect(() => {
    if (!engine) return undefined;
    const apply = (s: ReturnType<typeof useLivestockStore.getState>) => engine.setLivestock(s.farms, s.serverOffsetMs);
    const init = useLivestockStore.getState();
    apply(init);
    engine.setRanchDraft(init.draft);
    engine.setRanchSelection(init.selectedFarmId);
    return useLivestockStore.subscribe((s, prev) => {
      if (s.farms !== prev.farms || s.serverOffsetMs !== prev.serverOffsetMs) apply(s);
      if (s.draft !== prev.draft) {
        engine.setRanchDraft(s.draft);
        if (s.draft && !prev.draft) {
          useWorldViewStore.getState().setMode('build');
          useBuildingStore.getState().cancelPlacing();
          useFarmStore.getState().cancelDraft();
          useAquaStore.getState().cancelDraft();
        }
      }
      if (s.selectedFarmId !== prev.selectedFarmId || s.farms !== prev.farms) engine.setRanchSelection(s.selectedFarmId);
    });
  }, [engine]);

  // Villagers + game clock.
  useEffect(() => {
    if (!engine) return undefined;
    const init = usePopulationStore.getState();
    engine.setPopulation(init.state, init.serverOffsetMs);
    return usePopulationStore.subscribe((s, prev) => {
      if (s.state !== prev.state || s.serverOffsetMs !== prev.serverOffsetMs) engine.setPopulation(s.state, s.serverOffsetMs);
      if (s.selectedSurvivorId && s.selectedSurvivorId !== prev.selectedSurvivorId) engine.focusVillager(s.selectedSurvivorId);
    });
  }, [engine]);

  // Military compounds: soldiers drilling at their stations, selection focus, sound toggle.
  useEffect(() => {
    if (!engine) return undefined;
    const init = useMilitaryStore.getState();
    engine.setMilitary(init.state);
    engine.military.setSound(init.sound);
    return useMilitaryStore.subscribe((s, prev) => {
      if (s.state !== prev.state) engine.setMilitary(s.state);
      if (s.selectedUnitId !== prev.selectedUnitId) engine.focusSoldier(s.selectedUnitId);
      if (s.sound !== prev.sound) engine.military.setSound(s.sound);
    });
  }, [engine]);

  // Water bodies: terrain edits + water + fish, the dig tool and selection.
  useEffect(() => {
    if (!engine) return undefined;
    const apply = (s: ReturnType<typeof useAquaStore.getState>) => engine.setWaterBodies(s.bodies, s.serverOffsetMs);
    const init = useAquaStore.getState();
    apply(init);
    engine.setPondDraft(init.draft);
    engine.setPondSelection(init.selectedId);
    return useAquaStore.subscribe((s, prev) => {
      if (s.bodies !== prev.bodies || s.serverOffsetMs !== prev.serverOffsetMs) apply(s);
      if (s.draft !== prev.draft) {
        engine.setPondDraft(s.draft);
        if (s.draft && !prev.draft) {
          // Dig mode: terrain editing with the hex grid on.
          useWorldViewStore.getState().setMode('build');
          useBuildingStore.getState().cancelPlacing();
          useFarmStore.getState().cancelDraft();
          useLivestockStore.getState().cancelDraft();
        }
      }
      if (s.selectedId !== prev.selectedId || s.bodies !== prev.bodies) engine.setPondSelection(s.selectedId);
      if (s.feedFx && s.feedFx !== prev.feedFx) engine.pondFeedFx(s.feedFx.id);
    });
  }, [engine]);

  // Placement mode → ghost preview (and the hex grid, which placement needs).
  useEffect(() => {
    if (!engine) return;
    engine.setPlacing(placing);
    if (placing) {
      useWorldViewStore.getState().setMode('build');
      useFarmStore.getState().cancelDraft();
      useLivestockStore.getState().cancelDraft();
      useAquaStore.getState().cancelDraft();
    }
  }, [engine, placing]);

  useEffect(() => {
    engine?.setQuality(QUALITY_PRESETS[quality]);
  }, [engine, quality]);

  useEffect(() => {
    if (!engine) return;
    engine.setMode(mode);
    const hovered = useWorldViewStore.getState().hovered;
    engine.setHover(mode === 'build' && hovered ? world.getHexTile(hovered.q, hovered.r) : null, mode === 'build');
  }, [engine, mode, world]);

  useEffect(() => {
    engine?.overlay.setSelection(selected);
  }, [engine, selected]);

  useEffect(() => {
    if (!engine || !cameraCommand) return;
    if (cameraCommand.type === 'home') engine.focusHome();
    else if (cameraCommand.type === 'preset') engine.applyPreset(cameraCommand.preset);
    else engine.focusOn(cameraCommand.x, cameraCommand.z, cameraCommand.distance);
  }, [engine, cameraCommand]);

  useFrame((_, dt) => {
    engine?.frame(dt, camera as THREE.PerspectiveCamera, scene, gl);
  });

  return engine ? <primitive object={engine.root} /> : null;
}
