import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  WORLD_CONFIG,
  generateChunkData,
  type ChunkDataDTO,
  type CityDTO,
  type TerrainMetadataDTO,
  type TerrainTileDeltaInput,
} from '@cityverse/shared';
import { worldApi } from '../api/world.api';
import { getApiErrorMessage } from '../api/httpClient';
import { useWorldStore } from '../stores/worldStore';
import { ChunkManager } from './ChunkManager';
import { ChunkMesh } from './ChunkMesh';
import { GridOverlay } from './GridOverlay';
import { TerrainInteraction } from './TerrainInteraction';

interface WorldManagerProps {
  city: CityDTO;
  cameraTargetRef: React.MutableRefObject<{ x: number; y: number; z: number }>;
  onMetadataReady?: (metadata: TerrainMetadataDTO) => void;
  onChunkManagerReady?: (manager: ChunkManager) => void;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

export function WorldManager({
  city,
  cameraTargetRef,
  onMetadataReady,
  onChunkManagerReady,
}: WorldManagerProps) {
  const [chunks, setChunks] = useState<ChunkDataDTO[]>([]);
  const terrainMeshMapRef = useRef<Map<string, THREE.Mesh>>(new Map());

  const showGrid = useWorldStore((s) => s.showGrid);
  const metadata = useWorldStore((s) => s.metadata);
  const pendingAction = useWorldStore((s) => s.pendingAction);

  const setMetadata = useWorldStore((s) => s.setMetadata);
  const setLoadedChunksSnapshot = useWorldStore((s) => s.setLoadedChunksSnapshot);
  const setLoadingChunkCount = useWorldStore((s) => s.setLoadingChunkCount);
  const setIsSavingDelta = useWorldStore((s) => s.setIsSavingDelta);
  const setLastError = useWorldStore((s) => s.setLastError);
  const clearPendingAction = useWorldStore((s) => s.clearPendingAction);
  const toggleGrid = useWorldStore((s) => s.toggleGrid);
  const setSelection = useWorldStore((s) => s.setSelection);
  const setInteractionTool = useWorldStore((s) => s.setInteractionTool);

  const chunkManager = useMemo(() => {
    return new ChunkManager({
      mapWidth: city.mapWidth,
      mapHeight: city.mapHeight,
      chunkSize: WORLD_CONFIG.CHUNK_SIZE,
      tileSize: WORLD_CONFIG.TILE_SIZE,
      loadRadius: WORLD_CONFIG.DEFAULT_LOAD_RADIUS,
      unloadRadius: WORLD_CONFIG.DEFAULT_UNLOAD_RADIUS,
      fetcher: async (range) => {
        try {
          const response = await worldApi.getChunksInRange(city.id, range);
          return response.chunks;
        } catch (err) {
          // Graceful deterministic fallback if offline/transient error, while surfacing message
          setLastError(getApiErrorMessage(err, 'Khong the tai chunk tu server'));
          const fallbackChunks: ChunkDataDTO[] = [];
          for (let cz = range.minZ; cz <= range.maxZ; cz += 1) {
            for (let cx = range.minX; cx <= range.maxX; cx += 1) {
              fallbackChunks.push(
                generateChunkData({
                  cityId: city.id,
                  worldSeed: city.worldSeed,
                  terrainType: city.terrainType,
                  chunkX: cx,
                  chunkZ: cz,
                  mapWidth: city.mapWidth,
                  mapHeight: city.mapHeight,
                  chunkSize: WORLD_CONFIG.CHUNK_SIZE,
                  tileSize: WORLD_CONFIG.TILE_SIZE,
                })
              );
            }
          }
          return fallbackChunks;
        }
      },
      onChange: (loaded) => {
        setChunks(loaded);
        const keys = loaded.map((c) => `${c.chunkX}:${c.chunkZ}`).sort();
        const revisions: Record<string, number> = {};
        for (const c of loaded) {
          revisions[`${c.chunkX}:${c.chunkZ}`] = c.revision;
        }
        setLoadedChunksSnapshot(keys, revisions);
      },
      onLoadingChange: (count) => {
        setLoadingChunkCount(count);
      },
    });
  }, [
    city.id,
    city.mapHeight,
    city.mapWidth,
    city.terrainType,
    city.worldSeed,
    setLastError,
    setLoadedChunksSnapshot,
    setLoadingChunkCount,
  ]);

  useEffect(() => {
    onChunkManagerReady?.(chunkManager);
  }, [chunkManager, onChunkManagerReady]);

  // Fetch terrain metadata & initial surrounding chunks around spawn point
  useEffect(() => {
    let active = true;

    async function bootstrap() {
      try {
        const meta = await worldApi.getTerrainMetadata(city.id);
        if (!active) return;
        setMetadata(meta);
        onMetadataReady?.(meta);
        cameraTargetRef.current = {
          x: meta.spawnPoint.worldX,
          y: meta.spawnPoint.worldY,
          z: meta.spawnPoint.worldZ,
        };
        await chunkManager.updateCameraWorldPosition(
          meta.spawnPoint.worldX,
          meta.spawnPoint.worldZ,
          true
        );
      } catch (err) {
        if (!active) return;
        setLastError(getApiErrorMessage(err, 'Khong the tai metadata dia hinh'));
        await chunkManager.updateCameraWorldPosition(
          cameraTargetRef.current.x,
          cameraTargetRef.current.z,
          true
        );
      }
    }

    void bootstrap();

    return () => {
      active = false;
      chunkManager.disposeAll();
    };
  }, [cameraTargetRef, chunkManager, city.id, onMetadataReady, setLastError, setMetadata]);

  // Periodically check camera target world position to stream chunks lazily as player pans
  useEffect(() => {
    const interval = window.setInterval(() => {
      const target = cameraTargetRef.current;
      void chunkManager.updateCameraWorldPosition(target.x, target.z).catch(() => {
        // Error already reported via chunkManager.onError/fetcher
      });
    }, 140);

    return () => {
      window.clearInterval(interval);
    };
  }, [cameraTargetRef, chunkManager]);

  // Global keyboard hotkeys: G = toggle grid, Esc = clear selection, 1 = Pan, 2 = Select
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;

      if (e.code === 'KeyG' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        toggleGrid();
      } else if (e.code === 'Escape') {
        setSelection(null);
      } else if (e.code === 'Digit1') {
        setInteractionTool('pan');
      } else if (e.code === 'Digit2') {
        setInteractionTool('select');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [setInteractionTool, setSelection, toggleGrid]);

  // Execute queued terrain delta action from HUD or Terraform tool and persist to backend
  useEffect(() => {
    if (!pendingAction) return;

    const action = pendingAction;
    clearPendingAction();

    const tiles: TerrainTileDeltaInput[] = [];
    const { minX, maxX, minZ, maxZ } = action.selection;

    // For flatten, compute average height of the selected area
    let avgHeight = 2.0;
    if (action.type === 'flatten') {
      let sum = 0;
      let count = 0;
      for (let gz = minZ; gz <= maxZ; gz += 1) {
        for (let gx = minX; gx <= maxX; gx += 1) {
          const info = chunkManager.getTileInfo(gx, gz);
          if (info) {
            sum += info.height;
            count += 1;
          }
        }
      }
      if (count > 0) {
        avgHeight = Math.round((sum / count) * 100) / 100;
      }
    }

    for (let gz = minZ; gz <= maxZ; gz += 1) {
      for (let gx = minX; gx <= maxX; gx += 1) {
        if (tiles.length >= 512) break;
        if (action.type === 'raise') {
          tiles.push({ gx, gz, heightDelta: action.amount ?? 1.5 });
        } else if (action.type === 'lower') {
          tiles.push({ gx, gz, heightDelta: -(action.amount ?? 1.5) });
        } else if (action.type === 'flatten') {
          tiles.push({ gx, gz, setHeight: avgHeight, clearProps: true });
        } else if (action.type === 'clear_props') {
          tiles.push({ gx, gz, clearProps: true });
        }
      }
    }

    if (tiles.length === 0) return;

    let cancelled = false;
    setIsSavingDelta(true);
    setLastError(null);

    void worldApi
      .saveTerrainDelta(city.id, tiles)
      .then((res) => {
        if (cancelled) return;
        chunkManager.applyUpdatedChunks(res.updatedChunks);
      })
      .catch((err) => {
        if (cancelled) return;
        setLastError(getApiErrorMessage(err, 'Khong the luu thay doi dia hinh'));
      })
      .finally(() => {
        if (!cancelled) {
          setIsSavingDelta(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    chunkManager,
    city.id,
    clearPendingAction,
    pendingAction,
    setIsSavingDelta,
    setLastError,
  ]);

  const registerTerrainMesh = useCallback((key: string, mesh: THREE.Mesh | null) => {
    if (mesh) {
      terrainMeshMapRef.current.set(key, mesh);
    } else {
      terrainMeshMapRef.current.delete(key);
    }
  }, []);

  const tileSize = metadata?.tileSize ?? WORLD_CONFIG.TILE_SIZE;
  const waterLevel = metadata?.waterLevel ?? WORLD_CONFIG.WATER_LEVEL;

  return (
    <group name="world-manager-root">
      {chunks.map((chunk) => (
        <ChunkMesh
          key={`${chunk.chunkX}:${chunk.chunkZ}`}
          chunk={chunk}
          registerTerrainMesh={registerTerrainMesh}
        />
      ))}

      <GridOverlay chunks={chunks} visible={showGrid} />

      <TerrainInteraction
        chunkManager={chunkManager}
        terrainMeshMapRef={terrainMeshMapRef}
        mapWidth={city.mapWidth}
        mapHeight={city.mapHeight}
        tileSize={tileSize}
        waterLevel={waterLevel}
      />
    </group>
  );
}
