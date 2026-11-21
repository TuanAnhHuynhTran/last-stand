import { useCallback, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  WORLD_CONFIG,
  getSpawnPoint,
  getWorldBounds,
  type CharacterDTO,
  type CityDTO,
  type TerrainMetadataDTO,
} from '@cityverse/shared';
import { resolveAssetEntry } from './assetRegistry';
import { CameraRig } from './CameraRig';
import type { ChunkManager } from './ChunkManager';
import { resolveHexSurfaceHeight } from './terrainMeshBuilder';
import { WorldManager } from './WorldManager';

interface WorldSceneProps {
  city: CityDTO;
  character: CharacterDTO | null;
}

function CharacterLandmark({
  character,
  position,
}: {
  character: CharacterDTO | null;
  position: [number, number, number];
}) {
  const appearance = character?.appearance;
  const asset = resolveAssetEntry(appearance?.modelKey ?? 'character_architect_v1');

  return (
    <group position={position} scale={asset.scale}>
      <mesh position={[0, 0.9, 0]} castShadow>
        <capsuleGeometry args={[0.36, 0.72, 6, 10]} />
        <meshStandardMaterial
          color={appearance?.outfitPrimaryColor ?? '#2f8f83'}
          roughness={0.7}
          flatShading
        />
      </mesh>
      <mesh position={[0, 1.85, 0]} castShadow>
        <icosahedronGeometry args={[0.34, 1]} />
        <meshStandardMaterial
          color={appearance?.skinTone ?? '#e8be9e'}
          roughness={0.75}
          flatShading
        />
      </mesh>
      <mesh position={[0, 2.12, 0]} castShadow>
        <coneGeometry args={[0.38, 0.32, 6]} />
        <meshStandardMaterial
          color={appearance?.hairColor ?? '#4a3222'}
          roughness={0.75}
          flatShading
        />
      </mesh>
    </group>
  );
}

/**
 * Low-poly timber cottage with teal shingled roof matching the cozy village in the reference image.
 */
function CozyCottage({
  position,
  rotationY = 0,
  scale = 1,
}: {
  position: [number, number, number];
  rotationY?: number;
  scale?: number;
}) {
  return (
    <group position={position} rotation={[0, rotationY, 0]} scale={scale}>
      {/* Timber-framed walls */}
      <mesh position={[0, 0.85, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.1, 1.7, 1.65]} />
        <meshStandardMaterial color="#c9ad88" roughness={0.88} flatShading />
      </mesh>
      {/* Wooden beams trim */}
      <mesh position={[0, 0.12, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.24, 0.24, 1.78]} />
        <meshStandardMaterial color="#6e4b30" roughness={0.92} flatShading />
      </mesh>
      {/* Signature teal-green pitched roof */}
      <mesh position={[0, 2.2, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[1.75, 1.35, 4]} />
        <meshStandardMaterial color="#2f8d7b" roughness={0.78} flatShading />
      </mesh>
      {/* Roof ridge timber */}
      <mesh position={[0, 2.4, 0]} castShadow>
        <boxGeometry args={[0.25, 0.45, 0.25]} />
        <meshStandardMaterial color="#6d472c" roughness={0.9} flatShading />
      </mesh>
    </group>
  );
}

/**
 * Gently rotating wooden pastoral Windmill echoing the windmills in the reference image.
 */
function PastoralWindmill({ position }: { position: [number, number, number] }) {
  const bladesRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (bladesRef.current) {
      bladesRef.current.rotation.z -= delta * 0.75;
    }
  });

  return (
    <group position={position} rotation={[0, -0.5, 0]}>
      {/* Tapered timber windmill tower */}
      <mesh position={[0, 2.4, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.9, 1.55, 4.8, 6]} />
        <meshStandardMaterial color="#8b5e3c" roughness={0.9} flatShading />
      </mesh>
      {/* Stone base */}
      <mesh position={[0, 0.45, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[1.62, 1.8, 0.9, 6]} />
        <meshStandardMaterial color="#b4aba0" roughness={0.92} flatShading />
      </mesh>
      {/* Conical wooden cap */}
      <mesh position={[0, 5.35, 0]} castShadow>
        <coneGeometry args={[1.15, 1.3, 6]} />
        <meshStandardMaterial color="#5c3a22" roughness={0.85} flatShading />
      </mesh>
      {/* Spinning sail blades */}
      <group ref={bladesRef} position={[0, 4.2, 1.08]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.22, 0.22, 0.35, 6]} />
          <meshStandardMaterial color="#4a2e1b" flatShading />
        </mesh>
        {[0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2].map((angle) => (
          <group key={angle} rotation={[0, 0, angle]}>
            <mesh position={[0, 1.65, 0.08]} castShadow>
              <boxGeometry args={[0.16, 3.1, 0.08]} />
              <meshStandardMaterial color="#4e311d" flatShading />
            </mesh>
            <mesh position={[0.32, 1.85, 0.1]} castShadow>
              <boxGeometry args={[0.58, 2.35, 0.05]} />
              <meshStandardMaterial color="#efe3cc" roughness={0.85} flatShading />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

/**
 * Cozy starter village cluster placed neatly on the spawn hex plateau.
 */
function StarterHexVillage({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Central village hall cottage */}
      <CozyCottage position={[0, 0, -3.2]} rotationY={0.25} scale={1.32} />
      {/* Surrounding cozy teal-roofed cottages */}
      <CozyCottage position={[4.1, 0, -1.2]} rotationY={-0.6} scale={0.92} />
      <CozyCottage position={[3.2, 0, 2.8]} rotationY={0.85} scale={0.86} />
      <CozyCottage position={[-3.6, 0, 1.8]} rotationY={-0.35} scale={0.9} />
      {/* Pastoral Windmill overlooking the settlement */}
      <PastoralWindmill position={[-4.8, 0, -4.4]} />
    </group>
  );
}

export function WorldScene({ city, character }: WorldSceneProps) {
  const defaultSpawn = useMemo(
    () =>
      getSpawnPoint(
        city.worldSeed,
        city.terrainType,
        city.mapWidth,
        city.mapHeight,
        WORLD_CONFIG.TILE_SIZE
      ),
    [city.mapHeight, city.mapWidth, city.terrainType, city.worldSeed]
  );

  const [spawnPoint, setSpawnPoint] = useState(defaultSpawn);
  const cameraTargetRef = useRef({
    x: defaultSpawn.worldX,
    y: defaultSpawn.worldY,
    z: defaultSpawn.worldZ,
  });
  const chunkManagerRef = useRef<ChunkManager | null>(null);
  const sunLightRef = useRef<THREE.DirectionalLight>(null);
  const sunTargetRef = useRef<THREE.Object3D>(null);

  const worldBounds = useMemo(
    () => getWorldBounds(city.mapWidth, city.mapHeight, WORLD_CONFIG.TILE_SIZE),
    [city.mapHeight, city.mapWidth]
  );

  const handleMetadataReady = useCallback((meta: TerrainMetadataDTO) => {
    setSpawnPoint(meta.spawnPoint);
  }, []);

  const handleChunkManagerReady = useCallback((manager: ChunkManager) => {
    chunkManagerRef.current = manager;
  }, []);

  const handleCameraTargetUpdate = useCallback((x: number, y: number, z: number) => {
    cameraTargetRef.current.x = x;
    cameraTargetRef.current.y = y;
    cameraTargetRef.current.z = z;
  }, []);

  const getTerrainHeight = useCallback(
    (x: number, z: number) => {
      const h =
        chunkManagerRef.current?.getHeightAtWorld(x, z, spawnPoint.worldY) ?? spawnPoint.worldY;
      return resolveHexSurfaceHeight(h, WORLD_CONFIG.WATER_LEVEL);
    },
    [spawnPoint.worldY]
  );

  // Move directional golden-hour sun shadow frustum with the camera target
  useFrame(() => {
    const sun = sunLightRef.current;
    const sunTarget = sunTargetRef.current;
    if (!sun || !sunTarget) return;

    const tx = cameraTargetRef.current.x;
    const ty = cameraTargetRef.current.y;
    const tz = cameraTargetRef.current.z;

    sunTarget.position.set(tx, ty, tz);
    sunTarget.updateMatrixWorld();
    sun.position.set(tx + 82, ty + 115, tz + 62);
    sun.target = sunTarget;
  });

  const spawnSurfaceY = resolveHexSurfaceHeight(spawnPoint.worldY, WORLD_CONFIG.WATER_LEVEL);

  const initialTarget = useMemo(
    () => ({
      x: spawnPoint.worldX,
      y: spawnSurfaceY,
      z: spawnPoint.worldZ,
    }),
    [spawnPoint.worldX, spawnSurfaceY, spawnPoint.worldZ]
  );

  const chunksX = Math.max(1, Math.ceil(city.mapWidth / WORLD_CONFIG.CHUNK_SIZE));
  const chunksZ = Math.max(1, Math.ceil(city.mapHeight / WORLD_CONFIG.CHUNK_SIZE));

  return (
    <>
      {/* Dreamy warm peach-cream horizon sky & soft pastoral fog matching the reference image */}
      <color attach="background" args={['#edd8c8']} />
      <fog attach="fog" args={['#edd8c8', 148, 345]} />

      {/* Warm golden sunlight + soft verdant bounce lighting */}
      <ambientLight intensity={0.42} color="#fff5e6" />
      <hemisphereLight args={['#fff1e0', '#6c8c2c', 0.72]} />

      <object3D ref={sunTargetRef} position={[spawnPoint.worldX, spawnSurfaceY, spawnPoint.worldZ]} />
      <directionalLight
        ref={sunLightRef}
        position={[spawnPoint.worldX + 82, spawnSurfaceY + 115, spawnPoint.worldZ + 62]}
        intensity={1.75}
        color="#fff2d6"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.0004}
        shadow-normalBias={0.05}
        shadow-camera-near={12}
        shadow-camera-far={320}
        shadow-camera-left={-110}
        shadow-camera-right={110}
        shadow-camera-top={110}
        shadow-camera-bottom={-110}
      />

      {/* Streamed 32x32 hexagonal terrain chunks, instanced foliage/rocks/farms, hex grid & interaction */}
      <WorldManager
        city={city}
        cameraTargetRef={cameraTargetRef}
        onMetadataReady={handleMetadataReady}
        onChunkManagerReady={handleChunkManagerReady}
      />

      {/* Cozy starter village & character positioned flush on the spawn hex */}
      <StarterHexVillage position={[spawnPoint.worldX, spawnSurfaceY, spawnPoint.worldZ]} />
      <CharacterLandmark
        character={character}
        position={[spawnPoint.worldX - 0.8, spawnSurfaceY, spawnPoint.worldZ + 3.4]}
      />

      {/* Bounded isometric/orbit camera rig */}
      <CameraRig
        initialTarget={initialTarget}
        worldBounds={worldBounds}
        chunkSize={WORLD_CONFIG.CHUNK_SIZE}
        tileSize={WORLD_CONFIG.TILE_SIZE}
        chunksX={chunksX}
        chunksZ={chunksZ}
        getTerrainHeight={getTerrainHeight}
        onCameraTargetUpdate={handleCameraTargetUpdate}
      />
    </>
  );
}
