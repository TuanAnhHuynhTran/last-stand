import { ExplorationMarkers } from './ExplorationMarkers';
import { ExplorationFog } from './ExplorationFog';
import { useEffect, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { WorldGenerator } from '@cityverse/shared';
import { QUALITY_PRESETS } from './qualitySettings';
import { FOG_COLOR } from './WorldEngine';
import { WorldScene } from './WorldScene';
import { useWorldViewStore } from './worldViewStore';

export interface WorldCanvasProps {
  worldSeed: string;
}

/** Full-screen WebGL view of the player's 3D chibi hex world, generated from `worldSeed`. */
export function WorldCanvas({ worldSeed }: WorldCanvasProps) {
  const world = useMemo(() => new WorldGenerator(worldSeed), [worldSeed]);
  const quality = useWorldViewStore((s) => s.quality);
  const mode = useWorldViewStore((s) => s.mode);
  const preset = QUALITY_PRESETS[quality];
  const fog = `#${FOG_COLOR.getHexString()}`;

  useEffect(() => () => useWorldViewStore.getState().reset(), [worldSeed]);

  return (
    <div
      data-testid="world-canvas"
      style={{
        position: 'absolute',
        inset: 0,
        cursor: mode === 'build' ? 'crosshair' : 'grab',
        userSelect: 'none',
        touchAction: 'none',
        background: fog,
      }}
    >
      <Canvas
        // Antialiasing is fixed at context creation, so the canvas remounts when it changes.
        key={preset.antialias ? 'aa' : 'no-aa'}
        shadows={{ type: THREE.PCFSoftShadowMap }}
        dpr={preset.dpr}
        camera={{ fov: 32, near: 0.5, far: 1500, position: [world.spawn.x + 120, 140, world.spawn.z + 120] }}
        gl={{
          antialias: preset.antialias,
          powerPreference: 'high-performance',
          toneMapping: THREE.NeutralToneMapping,
          toneMappingExposure: 1.05,
        }}
      >
        <color attach="background" args={[fog]} />
        <fog attach="fog" args={[fog, 250, 700]} />
        <WorldScene world={world} />
        <ExplorationFog world={world} />
        <ExplorationMarkers world={world} />
      </Canvas>
    </div>
  );
}
