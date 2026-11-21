import { Suspense, useEffect, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import type { CharacterDTO, CityDTO } from '@cityverse/shared';
import { useWorldStore } from '../stores/worldStore';
import { WorldScene } from './WorldScene';

export interface GameCanvasProps {
  city: CityDTO;
  character: CharacterDTO | null;
}

export function GameCanvas({ city, character }: GameCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const interactionTool = useWorldStore((s) => s.interactionTool);
  const resetWorldStore = useWorldStore((s) => s.resetWorldStore);

  useEffect(() => {
    return () => {
      resetWorldStore();
    };
  }, [city.id, resetWorldStore]);

  const cursorStyle =
    interactionTool === 'pan'
      ? 'grab'
      : interactionTool === 'select'
        ? 'crosshair'
        : 'cell';

  return (
    <div
      ref={containerRef}
      data-testid="game-canvas-container"
      style={{
        width: '100%',
        height: '100vh',
        position: 'relative',
        overflow: 'hidden',
        cursor: cursorStyle,
        userSelect: 'none',
        background: '#edd8c8',
      }}
    >
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ fov: 40, near: 0.5, far: 900, position: [305, 62, 275] }}
        gl={{
          antialias: true,
          powerPreference: 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.06,
        }}
      >
        <Suspense fallback={null}>
          <WorldScene city={city} character={character} />
        </Suspense>
      </Canvas>
    </div>
  );
}
