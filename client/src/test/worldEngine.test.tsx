import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ConfigProvider } from 'antd';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  WORLD_CONFIG,
  chunkToWorldBounds,
  generateChunkData,
  getHexVertices,
  getWorldBounds,
  gridToChunk,
  gridToWorldCenter,
  normalizeGridSelection,
  worldToGrid,
  type ChunkDataDTO,
  type CityDTO,
  type TerrainArchetype,
} from '@cityverse/shared';
import { cityApi } from '../api/city.api';
import { ChunkManager } from '../engine/ChunkManager';
import {
  DEFAULT_CAMERA_LIMITS,
  IsometricCameraController,
  applyCameraViewportResize,
} from '../engine/cameraController';
import {
  buildChunkGridGeometry,
  buildChunkPropBatches,
  buildChunkTerrainGeometry,
  buildChunkWaterGeometry,
} from '../engine/terrainMeshBuilder';
import { GameWorldPage } from '../pages/GameWorldPage';
import { useGameStore } from '../stores/gameStore';
import { useWorldStore } from '../stores/worldStore';
import { cityverseTheme } from '../theme/gameTheme';

vi.mock('../engine/GameCanvas', () => ({
  GameCanvas: ({ city }: { city: CityDTO }) => (
    <div data-testid="mock-game-canvas">GameCanvas:{city.name}</div>
  ),
}));

const sampleCity: CityDTO = {
  id: '33333333-3333-4333-8333-333333333333',
  ownerId: '11111111-1111-4111-8111-111111111111',
  name: 'Emerald Bay',
  terrainType: 'coastal',
  worldSeed: 'CV-COA-DETERMINISTIC01',
  mapWidth: 128,
  mapHeight: 128,
  level: 1,
  isPublic: true,
  role: 'owner',
  economy: {
    id: '44444444-4444-4444-8444-444444444444',
    cityId: '33333333-3333-4333-8333-333333333333',
    cityCoins: 250000,
    population: 0,
    happiness: 75,
    taxRate: 8,
    powerCapacity: 0,
    powerUsage: 0,
    waterCapacity: 0,
    waterUsage: 0,
    lastTickAt: null,
  },
  createdAt: '2026-11-19T00:00:00.000Z',
  updatedAt: '2026-11-19T00:00:00.000Z',
};

describe('CITYVERSE Phase 2 - 3D World Engine Unit & UI Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useGameStore.getState().resetGameState();
    useWorldStore.getState().resetWorldStore();
  });

  it('1. World seed tao cung mot terrain cho plain, coastal, mountain va river', () => {
    const archetypes: TerrainArchetype[] = ['plain', 'coastal', 'mountain', 'river'];

    for (const archetype of archetypes) {
      const a = generateChunkData({
        cityId: sampleCity.id,
        worldSeed: 'CV-FIXED-SEED-999',
        terrainType: archetype,
        chunkX: 1,
        chunkZ: 1,
      });
      const b = generateChunkData({
        cityId: sampleCity.id,
        worldSeed: 'CV-FIXED-SEED-999',
        terrainType: archetype,
        chunkX: 1,
        chunkZ: 1,
      });

      expect(a.cornerHeights).toEqual(b.cornerHeights);
      expect(a.cornerNormals).toEqual(b.cornerNormals);
      expect(a.tileBiomes).toEqual(b.tileBiomes);
      expect(a.props).toEqual(b.props);
    }
  });

  it('2. Hex grid chuyen doi toa do chinh xac, khep kin khong lech vi tri giua 2 chunk', () => {
    // Odd & even row hex round-trips across interior & chunk boundaries
    const boundaryTiles = [
      { gx: 0, gz: 0, expectedCx: 0, expectedCz: 0 },
      { gx: 0, gz: 1, expectedCx: 0, expectedCz: 0 },
      { gx: 31, gz: 31, expectedCx: 0, expectedCz: 0 },
      { gx: 32, gz: 0, expectedCx: 1, expectedCz: 0 },
      { gx: 32, gz: 1, expectedCx: 1, expectedCz: 0 },
      { gx: 63, gz: 64, expectedCx: 1, expectedCz: 2 },
      { gx: 127, gz: 127, expectedCx: 3, expectedCz: 3 },
    ];

    for (const t of boundaryTiles) {
      const chunk = gridToChunk(t.gx, t.gz, WORLD_CONFIG.CHUNK_SIZE);
      expect(chunk).toEqual({ cx: t.expectedCx, cz: t.expectedCz });

      const worldCenter = gridToWorldCenter(t.gx, t.gz, WORLD_CONFIG.TILE_SIZE);
      const backToGrid = worldToGrid(
        worldCenter.x,
        worldCenter.z,
        128,
        128,
        WORLD_CONFIG.TILE_SIZE
      );
      expect(backToGrid).toEqual({ gx: t.gx, gz: t.gz });

      // Verify 6 vertices form a regular pointy-top hexagon and any interior point maps back to same hex
      const vertices = getHexVertices(t.gx, t.gz, WORLD_CONFIG.TILE_SIZE, 0.7);
      expect(vertices).toHaveLength(6);
      for (const v of vertices) {
        expect(worldToGrid(v.x, v.z, 128, 128, WORLD_CONFIG.TILE_SIZE)).toEqual({
          gx: t.gx,
          gz: t.gz,
        });
      }

      const bounds = chunkToWorldBounds(
        chunk.cx,
        chunk.cz,
        WORLD_CONFIG.CHUNK_SIZE,
        WORLD_CONFIG.TILE_SIZE
      );
      expect(worldCenter.x).toBeGreaterThanOrEqual(bounds.minX);
      expect(worldCenter.x).toBeLessThanOrEqual(bounds.maxX);
      expect(worldCenter.z).toBeGreaterThanOrEqual(bounds.minZ);
      expect(worldCenter.z).toBeLessThanOrEqual(bounds.maxZ);
    }

    // Verify exact shared edge between border hex (31, 4) in chunk (0,0) and hex (32, 4) in chunk (1,0)
    const leftEdgeVerts = getHexVertices(31, 4, WORLD_CONFIG.TILE_SIZE, 1);
    const rightEdgeVerts = getHexVertices(32, 4, WORLD_CONFIG.TILE_SIZE, 1);
    // Pointy-top right edge (index 1 & 2) of left hex === left edge (index 5 & 4) of right hex
    expect(leftEdgeVerts[1].x).toBeCloseTo(rightEdgeVerts[5].x, 5);
    expect(leftEdgeVerts[1].z).toBeCloseTo(rightEdgeVerts[5].z, 5);
    expect(leftEdgeVerts[2].x).toBeCloseTo(rightEdgeVerts[4].x, 5);
    expect(leftEdgeVerts[2].z).toBeCloseTo(rightEdgeVerts[4].z, 5);

    // Build merged hex prism terrain, hex water, and hex grid geometries for a river chunk
    const riverChunk = generateChunkData({
      cityId: sampleCity.id,
      worldSeed: sampleCity.worldSeed,
      terrainType: 'river',
      chunkX: 1,
      chunkZ: 1,
    });

    const terrainGeo = buildChunkTerrainGeometry(riverChunk);
    expect(terrainGeo.getAttribute('position').count).toBe(32 * 32 * 90);

    const gridGeos = buildChunkGridGeometry(riverChunk);
    // 1,024 hexes * 6 edges * 2 endpoints = 12,288 line vertices
    expect(gridGeos.tileLines.getAttribute('position').count).toBe(32 * 32 * 6 * 2);

    const waterGeo = buildChunkWaterGeometry(riverChunk);
    if (riverChunk.hasWater) {
      expect(waterGeo).not.toBeNull();
    }

    // Verify props batch cleanly for InstancedMesh rendering
    const batches = buildChunkPropBatches(riverChunk);
    const totalBatchedProps =
      batches.pineCanopies.matrices.length +
      batches.roundCanopies.matrices.length +
      batches.rocks.matrices.length +
      batches.grassTufts.matrices.length;
    expect(totalBatchedProps).toBe(riverChunk.props.length);

    terrainGeo.dispose();
    gridGeos.tileLines.dispose();
    gridGeos.borderLines.dispose();
    waterGeo?.dispose();
  });

  it('3. ChunkManager khong tai toan bo world cung luc, tai gan camera va unload khi ra ngoai pham vi', async () => {
    const fetchedRanges: Array<{ minX: number; maxX: number; minZ: number; maxZ: number }> = [];
    const unloadedKeys: string[] = [];

    const manager = new ChunkManager({
      mapWidth: 128,
      mapHeight: 128,
      chunkSize: 32,
      tileSize: 4,
      loadRadius: 1,
      unloadRadius: 1,
      fetcher: async (range) => {
        fetchedRanges.push(range);
        const chunks: ChunkDataDTO[] = [];
        for (let cz = range.minZ; cz <= range.maxZ; cz += 1) {
          for (let cx = range.minX; cx <= range.maxX; cx += 1) {
            chunks.push(
              generateChunkData({
                cityId: sampleCity.id,
                worldSeed: sampleCity.worldSeed,
                terrainType: 'plain',
                chunkX: cx,
                chunkZ: cz,
                revision: 1,
              })
            );
          }
        }
        return chunks;
      },
      onUnload: (chunk) => {
        unloadedKeys.push(`${chunk.chunkX}:${chunk.chunkZ}`);
      },
    });

    // Camera starts in corner chunk (0,0) -> loads ONLY 2x2 = 4 chunks (strictly < 16 total world chunks)
    await manager.updateCameraWorldPosition(32, 32);
    expect(manager.getTotalWorldChunks()).toBe(16);
    expect(manager.getLoadedCount()).toBe(4);
    expect(manager.getLoadedCount()).toBeLessThan(manager.getTotalWorldChunks());
    expect(manager.getLoadedChunkKeys()).toEqual(['0:0', '0:1', '1:0', '1:1']);

    // Move camera across the map to chunk (3,3) -> unloads all 4 corner chunks and loads only 4 near (3,3)
    const farCorner = gridToWorldCenter(120, 120, 4);
    await manager.updateCameraWorldPosition(farCorner.x, farCorner.z);
    expect(unloadedKeys).toEqual(expect.arrayContaining(['0:0', '0:1', '1:0', '1:1']));
    expect(manager.getLoadedCount()).toBe(4);
    expect(manager.getLoadedChunkKeys()).toEqual(['2:2', '2:3', '3:2', '3:3']);
    expect(fetchedRanges.length).toBe(2);

    // Revision update replaces cached chunk cleanly
    const updatedChunk = generateChunkData({
      cityId: sampleCity.id,
      worldSeed: sampleCity.worldSeed,
      terrainType: 'plain',
      chunkX: 3,
      chunkZ: 3,
      revision: 4,
    });
    manager.applyUpdatedChunks([updatedChunk]);
    expect(manager.getChunk(3, 3)?.revision).toBe(4);

    manager.disposeAll();
    expect(manager.getLoadedCount()).toBe(0);
  });

  it('4. Camera hoat dong dung khi resize, pan, rotate, zoom va khong vuot gioi han ban do', () => {
    const bounds = getWorldBounds(128, 128, 4);
    const controller = new IsometricCameraController(
      { x: 256, y: 2, z: 256 },
      {
        worldBounds: bounds,
        minDistance: DEFAULT_CAMERA_LIMITS.minDistance,
        maxDistance: DEFAULT_CAMERA_LIMITS.maxDistance,
        minPolarAngle: DEFAULT_CAMERA_LIMITS.minPolarAngle,
        maxPolarAngle: DEFAULT_CAMERA_LIMITS.maxPolarAngle,
        padding: 6,
      }
    );

    // Pan violently outside world bounds -> must clamp inside padded hex world bounds
    controller.panScreenAligned(5000, 5000, 1);
    let desired = controller.getDesiredState();
    expect(desired.targetX).toBeGreaterThanOrEqual(bounds.minX + 6);
    expect(desired.targetX).toBeLessThanOrEqual(bounds.maxX - 6);
    expect(desired.targetZ).toBeGreaterThanOrEqual(bounds.minZ + 6);
    expect(desired.targetZ).toBeLessThanOrEqual(bounds.maxZ - 6);

    // Zoom way in and way out -> must clamp to [minDistance..maxDistance]
    for (let i = 0; i < 30; i += 1) controller.zoomByWheel(-240);
    expect(controller.getDesiredState().distance).toBe(DEFAULT_CAMERA_LIMITS.minDistance);

    for (let i = 0; i < 30; i += 1) controller.zoomByWheel(240);
    expect(controller.getDesiredState().distance).toBe(DEFAULT_CAMERA_LIMITS.maxDistance);

    // Rotate polar beyond vertical/ground limits -> must clamp to [minPolarAngle..maxPolarAngle]
    controller.rotateByPixels(120, 9000);
    desired = controller.getDesiredState();
    expect(desired.polar).toBeGreaterThanOrEqual(DEFAULT_CAMERA_LIMITS.minPolarAngle);
    expect(desired.polar).toBeLessThanOrEqual(DEFAULT_CAMERA_LIMITS.maxPolarAngle);

    // Resize updates camera aspect and triggers projection matrix recalculation
    const mockCamera = {
      aspect: 1,
      updateProjectionMatrix: vi.fn(),
    };

    const changed1 = applyCameraViewportResize(mockCamera, 1920, 1080);
    expect(changed1).toBe(true);
    expect(mockCamera.aspect).toBeCloseTo(1920 / 1080, 5);
    expect(mockCamera.updateProjectionMatrix).toHaveBeenCalledTimes(1);

    const changed2 = applyCameraViewportResize(mockCamera, 800, 1000);
    expect(changed2).toBe(true);
    expect(mockCamera.aspect).toBeCloseTo(0.8, 5);
    expect(mockCamera.updateProjectionMatrix).toHaveBeenCalledTimes(2);

    // Ignore degenerate 0-height resize cleanly
    const ignored = applyCameraViewportResize(mockCamera, 800, 0);
    expect(ignored).toBe(false);
    expect(mockCamera.updateProjectionMatrix).toHaveBeenCalledTimes(2);
  });

  it('5. HUD hien thi toa do Grid X/Z, vung chon keo chuot va nut bat/tat luoi [G]', async () => {
    vi.spyOn(cityApi, 'getCityById').mockResolvedValue(sampleCity);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <ConfigProvider theme={cityverseTheme}>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={[`/game/${sampleCity.id}`]}>
            <Routes>
              <Route path="/game/:cityId" element={<GameWorldPage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      </ConfigProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('mock-game-canvas')).toBeInTheDocument();
    });

    // Grid toggle button updates store cleanly
    const gridBtn = screen.getByTestId('toggle-grid-button');
    expect(gridBtn).toHaveTextContent(/TAT/i);
    fireEvent.click(gridBtn);
    expect(useWorldStore.getState().showGrid).toBe(true);
    expect(gridBtn).toHaveTextContent(/BAT/i);

    // Simulate raycast hover & drag selection updating worldStore
    act(() => {
      useWorldStore.getState().setLoadedChunksSnapshot(['1:1', '1:2', '2:1', '2:2'], {
        '1:1': 1,
        '1:2': 1,
        '2:1': 2,
        '2:2': 1,
      });
      useWorldStore.getState().setHoveredTile({
        gx: 64,
        gz: 72,
        cx: 2,
        cz: 2,
        height: 3.45,
        biome: 'grass',
        buildable: true,
        revision: 2,
      });
      useWorldStore
        .getState()
        .setSelection(normalizeGridSelection({ gx: 60, gz: 70 }, { gx: 64, gz: 72 }, 128, 128));
    });

    expect(screen.getByTestId('hovered-grid-coord')).toHaveTextContent('Grid X: 64 | Z: 72');
    expect(screen.getByTestId('terrain-inspector-hud')).toHaveTextContent('Chunks: 4 / 16');
    expect(screen.getByTestId('selection-action-bar')).toHaveTextContent('5x3 = 15 o');
  });
});
