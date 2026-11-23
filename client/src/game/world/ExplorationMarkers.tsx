import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import { axialToWorld, hexKey, hexNeighbors, type WorldGenerator } from '@cityverse/shared';
import { useExplorationStore } from './explorationStore';
function Dish({ position, level }: { position: [number, number, number]; level: number }) {
  const ref = useRef<Group>(null);
  useFrame((_, dt) => { if (ref.current) ref.current.rotation.y += dt * (.35 + level * .15); });
  return <group position={position} ref={ref}>
    <mesh><boxGeometry args={[3, .18, .35]} /><meshStandardMaterial color={level === 3 ? '#9df2ed' : '#ddd9bb'} emissive={level === 3 ? '#387d78' : '#000'} emissiveIntensity={.3} /></mesh>
    <mesh position={[1.2, .5, 0]}><boxGeometry args={[.15, 1, .15]} /><meshStandardMaterial color="#536c7e" /></mesh>
  </group>;
}
export function ExplorationMarkers({ world }: { world: WorldGenerator }) {
  const state = useExplorationStore(s => s.state);
  const starter = new Set(world.getStarterTerritory().map(h => hexKey(h.q, h.r)));
  const owned = new Set(state?.tiles.filter(t => t.status === 'claimed').map(t => hexKey(t.q, t.r)));
  return <group>
    {state?.radars.map(r => { const p = axialToWorld(r.q, r.r); return <Dish key={r.id} level={r.level} position={[p.x, world.getHexTile(r.q, r.r).height + r.level + 4, p.z]} />; })}
    {state?.tiles.filter(t => t.status === 'claimed' && !starter.has(hexKey(t.q, t.r)) && hexNeighbors(t).some(n => !owned.has(hexKey(n.q, n.r)))).map(t => {
      const p = axialToWorld(t.q, t.r);
      return <group key={hexKey(t.q, t.r)} position={[p.x + 3.7, world.getHexTile(t.q, t.r).height, p.z]}>
        <mesh position={[0, 1, 0]}><cylinderGeometry args={[.07, .1, 2, 5]} /><meshStandardMaterial color="#91664a" /></mesh>
        <mesh position={[.35, 1.65, 0]}><boxGeometry args={[.7, .45, .06]} /><meshStandardMaterial color="#efc868" /></mesh>
      </group>;
    })}
  </group>;
}
