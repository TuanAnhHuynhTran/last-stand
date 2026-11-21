import { useEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  WORLD_CONFIG,
  getHexCornerOffsets,
  gridToWorldCenter,
  normalizeGridSelection,
  worldToGrid,
  type GridCoord,
  type GridSelection,
} from '@cityverse/shared';
import { useWorldStore } from '../stores/worldStore';
import type { ChunkManager } from './ChunkManager';
import { resolveHexSurfaceHeight } from './terrainMeshBuilder';

interface TerrainInteractionProps {
  chunkManager: ChunkManager;
  terrainMeshMapRef: React.MutableRefObject<Map<string, THREE.Mesh>>;
  mapWidth: number;
  mapHeight: number;
  tileSize: number;
  waterLevel: number;
}

function buildHoverHexGeometries(
  gx: number,
  gz: number,
  surfaceY: number,
  tileSize: number
): { fillGeo: THREE.BufferGeometry; outlineGeo: THREE.BufferGeometry } {
  const center = gridToWorldCenter(gx, gz, tileSize);
  const corners = getHexCornerOffsets(tileSize, 0.96);
  const y = surfaceY + 0.14;

  // 6 fan triangles forming the glowing hexagon cap
  const fillPositions = new Float32Array(6 * 3 * 3);
  let fPtr = 0;
  for (let i = 0; i < 6; i += 1) {
    const next = (i + 1) % 6;
    fillPositions[fPtr++] = center.x;
    fillPositions[fPtr++] = y;
    fillPositions[fPtr++] = center.z;

    fillPositions[fPtr++] = center.x + corners[next][0];
    fillPositions[fPtr++] = y;
    fillPositions[fPtr++] = center.z + corners[next][1];

    fillPositions[fPtr++] = center.x + corners[i][0];
    fillPositions[fPtr++] = y;
    fillPositions[fPtr++] = center.z + corners[i][1];
  }
  const fillGeo = new THREE.BufferGeometry();
  fillGeo.setAttribute('position', new THREE.BufferAttribute(fillPositions, 3));

  // 6 line segments forming the crisp hexagonal highlight ring
  const outlineCorners = getHexCornerOffsets(tileSize, 0.99);
  const outlineY = y + 0.05;
  const outlinePositions = new Float32Array(6 * 2 * 3);
  let oPtr = 0;
  for (let i = 0; i < 6; i += 1) {
    const next = (i + 1) % 6;
    outlinePositions[oPtr++] = center.x + outlineCorners[i][0];
    outlinePositions[oPtr++] = outlineY;
    outlinePositions[oPtr++] = center.z + outlineCorners[i][1];

    outlinePositions[oPtr++] = center.x + outlineCorners[next][0];
    outlinePositions[oPtr++] = outlineY;
    outlinePositions[oPtr++] = center.z + outlineCorners[next][1];
  }
  const outlineGeo = new THREE.BufferGeometry();
  outlineGeo.setAttribute('position', new THREE.BufferAttribute(outlinePositions, 3));

  return { fillGeo, outlineGeo };
}

function buildSelectionHexGeometries(
  selection: GridSelection,
  chunkManager: ChunkManager,
  tileSize: number,
  waterLevel: number
): { fillGeo: THREE.BufferGeometry; borderGeo: THREE.BufferGeometry } {
  const cols = selection.maxX - selection.minX + 1;
  const rows = selection.maxZ - selection.minZ + 1;
  const count = cols * rows;

  const fillCorners = getHexCornerOffsets(tileSize, 0.95);
  const borderCorners = getHexCornerOffsets(tileSize, 0.985);

  const fillPositions = new Float32Array(count * 6 * 3 * 3);
  const borderPositions = new Float32Array(count * 6 * 2 * 3);
  let fPtr = 0;
  let bPtr = 0;

  for (let gz = selection.minZ; gz <= selection.maxZ; gz += 1) {
    for (let gx = selection.minX; gx <= selection.maxX; gx += 1) {
      const rawH = chunkManager.getTileHeight(gx, gz, 0);
      const y =
        (rawH < waterLevel ? waterLevel : resolveHexSurfaceHeight(rawH, waterLevel)) + 0.19;
      const borderY = y + 0.05;
      const center = gridToWorldCenter(gx, gz, tileSize);

      for (let i = 0; i < 6; i += 1) {
        const next = (i + 1) % 6;

        fillPositions[fPtr++] = center.x;
        fillPositions[fPtr++] = y;
        fillPositions[fPtr++] = center.z;

        fillPositions[fPtr++] = center.x + fillCorners[next][0];
        fillPositions[fPtr++] = y;
        fillPositions[fPtr++] = center.z + fillCorners[next][1];

        fillPositions[fPtr++] = center.x + fillCorners[i][0];
        fillPositions[fPtr++] = y;
        fillPositions[fPtr++] = center.z + fillCorners[i][1];

        borderPositions[bPtr++] = center.x + borderCorners[i][0];
        borderPositions[bPtr++] = borderY;
        borderPositions[bPtr++] = center.z + borderCorners[i][1];

        borderPositions[bPtr++] = center.x + borderCorners[next][0];
        borderPositions[bPtr++] = borderY;
        borderPositions[bPtr++] = center.z + borderCorners[next][1];
      }
    }
  }

  const fillGeo = new THREE.BufferGeometry();
  fillGeo.setAttribute('position', new THREE.BufferAttribute(fillPositions, 3));

  const borderGeo = new THREE.BufferGeometry();
  borderGeo.setAttribute('position', new THREE.BufferAttribute(borderPositions, 3));

  return { fillGeo, borderGeo };
}

export function TerrainInteraction({
  chunkManager,
  terrainMeshMapRef,
  mapWidth,
  mapHeight,
  tileSize,
  waterLevel,
}: TerrainInteractionProps) {
  const { camera, gl } = useThree();

  const hoveredTile = useWorldStore((s) => s.hoveredTile);
  const selection = useWorldStore((s) => s.selection);
  const chunkRevisions = useWorldStore((s) => s.chunkRevisions);
  const setHoveredTile = useWorldStore((s) => s.setHoveredTile);
  const setSelection = useWorldStore((s) => s.setSelection);
  const setIsDraggingSelection = useWorldStore((s) => s.setIsDraggingSelection);
  const triggerTerrainAction = useWorldStore((s) => s.triggerTerrainAction);

  const raycasterRef = useRef(new THREE.Raycaster());
  const ndcRef = useRef(new THREE.Vector2());
  const fallbackPlaneRef = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), -waterLevel));
  const hitPointRef = useRef(new THREE.Vector3());
  const dragStartRef = useRef<GridCoord | null>(null);
  const pointerDownPosRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const domElement = gl.domElement;

    const raycastToGrid = (clientX: number, clientY: number): GridCoord | null => {
      const rect = domElement.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;

      ndcRef.current.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      ndcRef.current.y = -((clientY - rect.top) / rect.height) * 2 + 1;

      raycasterRef.current.setFromCamera(ndcRef.current, camera);

      const meshes = Array.from(terrainMeshMapRef.current.values());
      if (meshes.length > 0) {
        const hits = raycasterRef.current.intersectObjects(meshes, false);
        if (hits.length > 0) {
          const p = hits[0].point;
          return worldToGrid(p.x, p.z, mapWidth, mapHeight, tileSize);
        }
      }

      if (raycasterRef.current.ray.intersectPlane(fallbackPlaneRef.current, hitPointRef.current)) {
        return worldToGrid(
          hitPointRef.current.x,
          hitPointRef.current.z,
          mapWidth,
          mapHeight,
          tileSize
        );
      }
      return null;
    };

    const updateHoverAt = (clientX: number, clientY: number): GridCoord | null => {
      const coord = raycastToGrid(clientX, clientY);
      if (!coord) {
        if (useWorldStore.getState().hoveredTile !== null) {
          setHoveredTile(null);
        }
        return null;
      }

      const prev = useWorldStore.getState().hoveredTile;
      const info = chunkManager.getTileInfo(coord.gx, coord.gz);
      if (
        info &&
        (!prev ||
          prev.gx !== info.gx ||
          prev.gz !== info.gz ||
          prev.revision !== info.revision ||
          prev.height !== info.height)
      ) {
        setHoveredTile(info);
      }
      return coord;
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;

      const tool = useWorldStore.getState().interactionTool;
      const shouldSelectDrag = tool !== 'pan' || e.shiftKey;

      pointerDownPosRef.current = { x: e.clientX, y: e.clientY };

      if (!shouldSelectDrag) {
        return;
      }

      const coord = updateHoverAt(e.clientX, e.clientY);
      if (!coord) return;

      dragStartRef.current = coord;
      setIsDraggingSelection(true);
      setSelection(normalizeGridSelection(coord, coord, mapWidth, mapHeight));
    };

    const onPointerMove = (e: PointerEvent) => {
      const coord = updateHoverAt(e.clientX, e.clientY);
      if (dragStartRef.current && coord) {
        setSelection(normalizeGridSelection(dragStartRef.current, coord, mapWidth, mapHeight));
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (e.button !== 0) return;

      const tool = useWorldStore.getState().interactionTool;

      if (dragStartRef.current) {
        const endCoord = raycastToGrid(e.clientX, e.clientY) ?? dragStartRef.current;
        const finalSelection = normalizeGridSelection(
          dragStartRef.current,
          endCoord,
          mapWidth,
          mapHeight
        );
        dragStartRef.current = null;
        setIsDraggingSelection(false);
        setSelection(finalSelection);

        if (tool === 'raise' || tool === 'lower' || tool === 'flatten') {
          triggerTerrainAction(tool, finalSelection);
        }
      } else if (pointerDownPosRef.current && tool === 'pan') {
        const dist = Math.hypot(
          e.clientX - pointerDownPosRef.current.x,
          e.clientY - pointerDownPosRef.current.y
        );
        if (dist < 5) {
          const coord = raycastToGrid(e.clientX, e.clientY);
          if (coord) {
            setSelection(normalizeGridSelection(coord, coord, mapWidth, mapHeight));
          }
        }
      }

      pointerDownPosRef.current = null;
    };

    const onPointerLeave = () => {
      setHoveredTile(null);
    };

    domElement.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    domElement.addEventListener('pointerleave', onPointerLeave);

    return () => {
      domElement.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      domElement.removeEventListener('pointerleave', onPointerLeave);
    };
  }, [
    camera,
    chunkManager,
    gl.domElement,
    mapHeight,
    mapWidth,
    setHoveredTile,
    setIsDraggingSelection,
    setSelection,
    terrainMeshMapRef,
    tileSize,
    triggerTerrainAction,
    waterLevel,
  ]);

  const revisionVersion = Object.values(chunkRevisions).reduce((sum, rev) => sum + rev, 0);

  const hoverGeometry = useMemo(() => {
    if (!hoveredTile || revisionVersion < 0) return null;
    const rawH = chunkManager.getTileHeight(hoveredTile.gx, hoveredTile.gz, hoveredTile.height);
    const surfaceY =
      rawH < waterLevel ? waterLevel : resolveHexSurfaceHeight(rawH, waterLevel);
    return buildHoverHexGeometries(hoveredTile.gx, hoveredTile.gz, surfaceY, tileSize);
  }, [hoveredTile, chunkManager, tileSize, waterLevel, revisionVersion]);

  useEffect(() => {
    return () => {
      hoverGeometry?.fillGeo.dispose();
      hoverGeometry?.outlineGeo.dispose();
    };
  }, [hoverGeometry]);

  const selectionGeometry = useMemo(() => {
    if (!selection || revisionVersion < 0) return null;
    return buildSelectionHexGeometries(
      selection,
      chunkManager,
      tileSize ?? WORLD_CONFIG.TILE_SIZE,
      waterLevel
    );
  }, [selection, chunkManager, tileSize, waterLevel, revisionVersion]);

  useEffect(() => {
    return () => {
      selectionGeometry?.fillGeo.dispose();
      selectionGeometry?.borderGeo.dispose();
    };
  }, [selectionGeometry]);

  // Warm radiant golden hex glow inspired by the center highlight in the reference image
  const hoverFillColor = hoveredTile?.buildable ? '#ffeb6b' : '#ff944d';
  const hoverOutlineColor = hoveredTile?.buildable ? '#fff7bd' : '#ffbe76';

  return (
    <group name="terrain-hex-interaction-overlays">
      {hoverGeometry && (
        <group>
          <mesh geometry={hoverGeometry.fillGeo} renderOrder={5}>
            <meshBasicMaterial
              color={hoverFillColor}
              transparent
              opacity={0.48}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
          <lineSegments geometry={hoverGeometry.outlineGeo} renderOrder={6}>
            <lineBasicMaterial
              color={hoverOutlineColor}
              transparent
              opacity={0.98}
              depthWrite={false}
            />
          </lineSegments>
        </group>
      )}

      {selectionGeometry && (
        <group>
          <mesh geometry={selectionGeometry.fillGeo} renderOrder={4}>
            <meshBasicMaterial
              color="#ffd95a"
              transparent
              opacity={0.34}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
          <lineSegments geometry={selectionGeometry.borderGeo} renderOrder={6}>
            <lineBasicMaterial color="#fff3b0" transparent opacity={0.95} depthWrite={false} />
          </lineSegments>
        </group>
      )}
    </group>
  );
}
