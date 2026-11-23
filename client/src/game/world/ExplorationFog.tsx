import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { axialToWorld, worldToAxial, hexKey, type WorldGenerator } from '@cityverse/shared';
import { useExplorationStore } from './explorationStore';

/** One fog sheet, two small visibility textures; no meshes for hidden hexes. */
export function ExplorationFog({ world }: { world: WorldGenerator }) {
  const active = useExplorationStore(s => s.active);
  const state = useExplorationStore(s => s.state);
  const radarId = useExplorationStore(s => s.radarId);
  const scanMode = useExplorationStore(s => s.scanMode);
  const drone = useExplorationStore(s => s.drone);
  const fog = useMemo(() => {
    const size = 512;
    const bytes = new Float32Array(size * size * 4);
    const texture = new THREE.DataTexture(bytes, size, size, THREE.RGBAFormat, THREE.FloatType);
    texture.minFilter = texture.magFilter = THREE.LinearFilter;
    const material = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide,
      uniforms: { mask: { value: texture }, time: { value: 0 }, radar: { value: new THREE.Vector2() }, scanning: { value: 0 }, range: { value: 120 } },
      vertexShader: 'varying vec2 pos; void main(){vec4 w=modelMatrix*vec4(position,1.);pos=w.xz;gl_Position=projectionMatrix*viewMatrix*w;}',
      fragmentShader: `uniform sampler2D mask; uniform float time; uniform vec2 radar; uniform float scanning; uniform float range; varying vec2 pos;
      void main(){vec2 uv=(pos+500.)/1000.;vec4 m=texture2D(mask,uv);float visible=m.r;float age=time-m.g;float reveal=smoothstep(0.,1.4,age);float alpha=1.-visible*reveal;
      float drift=sin(pos.x*.035+time*.18)*sin(pos.y*.027-time*.13);vec3 color=mix(vec3(.49,.54,.65),vec3(.66,.63,.77),.5+drift*.16);
      float d=distance(pos,radar);float wave=1.-smoothstep(0.,2.,abs(d-mod(time*22.,range)));float ring=(1.-smoothstep(0.,1.5,abs(d-range)))*scanning;
      float fx=max(wave*scanning,ring)*.45;gl_FragColor=vec4(mix(color,vec3(.5,1.,.87),fx),max(alpha,fx));}`,
    });
    return { bytes, texture, material, time: 0, known: new Set<string>() };
  }, []);
  useEffect(() => {
    const known = new Set((state?.tiles ?? world.getStarterTerritory()).map(h => hexKey(h.q, h.r)));
    for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
      const h = worldToAxial((x + .5) / 512 * 1000 - 500, (y + .5) / 512 * 1000 - 500);
      const key = hexKey(h.q, h.r), i = (y * 512 + x) * 4;
      fog.bytes[i] = known.has(key) ? 1 : 0;
      if (known.has(key) && !fog.known.has(key)) fog.bytes[i + 1] = fog.known.size ? fog.time : 0;
      fog.bytes[i + 3] = 1;
    }
    fog.known = known;
    fog.texture.needsUpdate = true;
  }, [state?.tiles, world, fog]);
  useFrame((_, dt) => {
    fog.time += dt; fog.material.uniforms.time.value = fog.time;
    const radar = state?.radars.find(r => r.id === radarId);
    if (radar) { const p = axialToWorld(radar.q, radar.r); fog.material.uniforms.radar.value.set(p.x, p.z); fog.material.uniforms.range.value = (radar.range + (drone ? 8 : 0)) * 10; }
    fog.material.uniforms.scanning.value = radar && (scanMode || state?.jobs.some(j => j.kind === 'scan')) ? 1 : 0;
  });
  useEffect(() => () => { fog.texture.dispose(); fog.material.dispose(); }, [fog]);
  if (!active) return null;
  return <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 3, 0]} renderOrder={100}><planeGeometry args={[1000, 1000]} /><primitive object={fog.material} attach="material" /></mesh>;
}
