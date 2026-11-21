import { memo, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getHexRadius, type ChunkDataDTO } from '@cityverse/shared';
import {
  buildChunkPropBatches,
  buildChunkTerrainGeometry,
  buildChunkWaterGeometry,
  type PropInstanceBatch,
} from './terrainMeshBuilder';

// Shared low-poly stylized geometries reused across ALL chunks
const SHARED_TRUNK_GEO = new THREE.CylinderGeometry(0.28, 0.44, 1, 6);
const SHARED_PINE_GEO = new THREE.ConeGeometry(0.86, 1, 7);
const SHARED_ROUND_GEO = new THREE.IcosahedronGeometry(0.92, 0);
const SHARED_ROCK_GEO = new THREE.IcosahedronGeometry(0.95, 0);
const SHARED_GRASS_GEO = new THREE.ConeGeometry(0.45, 0.72, 5);
// Hexagonal raised plowed earth pad (rotated by 0 rad = pointy-top matching hex grid!)
const SHARED_FARM_PLOT_GEO = new THREE.CylinderGeometry(
  getHexRadius(4) * 0.72,
  getHexRadius(4) * 0.77,
  0.16,
  6
);

const SHARED_TRUNK_MAT = new THREE.MeshStandardMaterial({
  roughness: 0.92,
  metalness: 0.02,
  flatShading: true,
});
const SHARED_FOLIAGE_MAT = new THREE.MeshStandardMaterial({
  roughness: 0.84,
  metalness: 0.02,
  flatShading: true,
});
const SHARED_ROCK_MAT = new THREE.MeshStandardMaterial({
  roughness: 0.85,
  metalness: 0.04,
  flatShading: true,
});
const SHARED_GRASS_MAT = new THREE.MeshStandardMaterial({
  roughness: 0.9,
  metalness: 0.0,
  flatShading: true,
});
const SHARED_FARM_MAT = new THREE.MeshStandardMaterial({
  roughness: 0.95,
  metalness: 0.0,
  flatShading: true,
});

interface InstancedPropLayerProps {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  batch: PropInstanceBatch;
  castShadow?: boolean;
  receiveShadow?: boolean;
}

function InstancedPropLayer({
  geometry,
  material,
  batch,
  castShadow = true,
  receiveShadow = true,
}: InstancedPropLayerProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const count = batch.matrices.length;

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || count === 0) return;

    for (let i = 0; i < count; i += 1) {
      mesh.setMatrixAt(i, batch.matrices[i]);
      mesh.setColorAt(i, batch.colors[i]);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
    mesh.computeBoundingSphere();
  }, [batch, count]);

  if (count === 0) {
    return null;
  }

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, count]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
      frustumCulled={false}
    />
  );
}

interface ChunkMeshProps {
  chunk: ChunkDataDTO;
  registerTerrainMesh?: (key: string, mesh: THREE.Mesh | null) => void;
}

function ChunkMeshComponent({ chunk, registerTerrainMesh }: ChunkMeshProps) {
  const terrainMeshRef = useRef<THREE.Mesh>(null);
  const waterMeshRef = useRef<THREE.Mesh>(null);
  const key = `${chunk.chunkX}:${chunk.chunkZ}`;

  const terrainGeometry = useMemo(() => buildChunkTerrainGeometry(chunk), [chunk]);
  const waterGeometry = useMemo(() => buildChunkWaterGeometry(chunk), [chunk]);
  const propBatches = useMemo(() => buildChunkPropBatches(chunk), [chunk]);

  useEffect(() => {
    return () => {
      terrainGeometry.dispose();
    };
  }, [terrainGeometry]);

  useEffect(() => {
    return () => {
      waterGeometry?.dispose();
    };
  }, [waterGeometry]);

  useEffect(() => {
    const mesh = terrainMeshRef.current;
    registerTerrainMesh?.(key, mesh);
    return () => {
      registerTerrainMesh?.(key, null);
    };
  }, [key, registerTerrainMesh, terrainGeometry]);

  // Subtle shimmering water ripple on hexagonal water basins
  useFrame(({ clock }) => {
    if (!waterMeshRef.current) return;
    waterMeshRef.current.position.y =
      Math.sin(clock.elapsedTime * 1.35 + chunk.chunkX * 0.7 + chunk.chunkZ) * 0.035;
  });

  return (
    <group name={`chunk-${chunk.chunkX}-${chunk.chunkZ}-rev-${chunk.revision}`}>
      {/* Merged hexagonal terrain prism mesh (1,024 hex tiles in 1 draw call!) */}
      <mesh
        ref={terrainMeshRef}
        geometry={terrainGeometry}
        castShadow
        receiveShadow
        userData={{
          isTerrainChunk: true,
          chunkX: chunk.chunkX,
          chunkZ: chunk.chunkZ,
          revision: chunk.revision,
        }}
      >
        <meshStandardMaterial
          vertexColors
          roughness={0.86}
          metalness={0.02}
          flatShading
        />
      </mesh>

      {/* Crisp hexagonal turquoise-cyan water surface matching the reference aesthetic */}
      {waterGeometry && (
        <mesh ref={waterMeshRef} geometry={waterGeometry} receiveShadow>
          <meshStandardMaterial
            vertexColors
            emissive="#19a5c7"
            emissiveIntensity={0.22}
            roughness={0.18}
            metalness={0.08}
            transparent
            opacity={0.92}
          />
        </mesh>
      )}

      {/* InstancedMesh layers for repeating trees, faceted boulders, grass, and hex farm plots */}
      <InstancedPropLayer
        geometry={SHARED_TRUNK_GEO}
        material={SHARED_TRUNK_MAT}
        batch={propBatches.trunks}
      />
      <InstancedPropLayer
        geometry={SHARED_PINE_GEO}
        material={SHARED_FOLIAGE_MAT}
        batch={propBatches.pineCanopies}
      />
      <InstancedPropLayer
        geometry={SHARED_ROUND_GEO}
        material={SHARED_FOLIAGE_MAT}
        batch={propBatches.roundCanopies}
      />
      <InstancedPropLayer
        geometry={SHARED_ROCK_GEO}
        material={SHARED_ROCK_MAT}
        batch={propBatches.rocks}
      />
      <InstancedPropLayer
        geometry={SHARED_GRASS_GEO}
        material={SHARED_GRASS_MAT}
        batch={propBatches.grassTufts}
        castShadow={false}
      />
      <InstancedPropLayer
        geometry={SHARED_FARM_PLOT_GEO}
        material={SHARED_FARM_MAT}
        batch={propBatches.farmPlots}
        castShadow={false}
        receiveShadow
      />
    </group>
  );
}

export const ChunkMesh = memo(
  ChunkMeshComponent,
  (prev, next) =>
    prev.chunk.chunkX === next.chunk.chunkX &&
    prev.chunk.chunkZ === next.chunk.chunkZ &&
    prev.chunk.revision === next.chunk.revision &&
    prev.chunk.updatedAt === next.chunk.updatedAt &&
    prev.registerTerrainMesh === next.registerTerrainMesh
);
