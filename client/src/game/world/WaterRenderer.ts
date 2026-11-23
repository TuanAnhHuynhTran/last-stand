/**
 * WaterRenderer — lake/river surfaces per chunk with a stylised water shader:
 * depth-based turquoise → deep blue, animated ripples, fresnel sky tint, sun glints and
 * soft shoreline foam. Water geometry only covers cells where the terrain dips below the
 * water level, so the shoreline is shaped by the terrain itself.
 */
import * as THREE from 'three';
import type { WaterChunkData } from './chunkBuilder';
import type { ChunkEvent, WorldChunkManager } from './WorldChunkManager';

const vertexShader = /* glsl */ `
  attribute float depth;
  uniform float uTime;
  varying float vDepth;
  varying vec3 vWorld;
  #include <fog_pars_vertex>
  void main() {
    vDepth = depth;
    vec3 p = position;
    float calm = smoothstep(0.0, 0.8, depth);
    p.y += (sin(p.x * 0.21 + uTime * 0.9) * 0.5 + sin(p.z * 0.17 - uTime * 0.7) * 0.5) * 0.06 * calm;
    vec4 world = modelMatrix * vec4(p, 1.0);
    vWorld = world.xyz;
    vec4 mvPosition = viewMatrix * world;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uShallow;
  uniform vec3 uDeep;
  uniform vec3 uSky;
  uniform vec3 uSunDir;
  varying float vDepth;
  varying vec3 vWorld;
  #include <fog_pars_fragment>

  float ripple(vec2 p, float t) {
    return sin(p.x * 0.55 + t * 1.3) * sin(p.y * 0.47 - t * 1.1)
         + 0.5 * sin((p.x + p.y) * 1.1 + t * 2.1)
         + 0.25 * sin((p.x - p.y) * 2.3 - t * 2.7);
  }

  void main() {
    vec2 p = vWorld.xz;
    float t = uTime;
    float e = 0.35;
    float h0 = ripple(p, t);
    float hx = ripple(p + vec2(e, 0.0), t);
    float hz = ripple(p + vec2(0.0, e), t);
    vec3 n = normalize(vec3(-(hx - h0) * 0.18, 1.0, -(hz - h0) * 0.18));

    vec3 viewDir = normalize(cameraPosition - vWorld);
    float depthT = smoothstep(0.0, 3.6, vDepth);
    vec3 col = mix(uShallow, uDeep, depthT);

    float fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);
    col = mix(col, uSky, fresnel * 0.45);

    vec3 halfDir = normalize(uSunDir + viewDir);
    float spec = pow(max(dot(n, halfDir), 0.0), 90.0);
    col += vec3(1.0, 0.97, 0.88) * spec * 0.55;

    // Shoreline foam: thin animated band where the water gets shallow.
    float foamBand = 1.0 - smoothstep(0.02, 0.38, vDepth + h0 * 0.05);
    float foamNoise = 0.5 + 0.5 * sin(p.x * 1.7 + t * 1.5) * sin(p.y * 1.9 - t * 1.2);
    col = mix(col, vec3(0.97, 1.0, 1.0), foamBand * (0.55 + 0.45 * foamNoise));

    float alpha = mix(0.62, 0.9, depthT);
    alpha = max(alpha, foamBand * 0.9);
    alpha *= smoothstep(-0.05, 0.06, vDepth + 0.05);
    gl_FragColor = vec4(col, alpha);
    #include <fog_fragment>
  }
`;

export function createWaterMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    fog: true,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uShallow: { value: new THREE.Color('#5fe0d2') },
        uDeep: { value: new THREE.Color('#2a86c8') },
        uSky: { value: new THREE.Color('#cdeeff') },
        uSunDir: { value: new THREE.Vector3(0.5, 0.8, 0.3).normalize() },
      },
    ]),
  });
}

export class WaterRenderer {
  readonly group = new THREE.Group();
  readonly material = createWaterMaterial();
  private readonly meshes = new Map<string, THREE.Mesh>();
  private readonly unsubscribe: () => void;

  constructor(manager: WorldChunkManager) {
    this.group.name = 'WaterRenderer';
    this.unsubscribe = manager.subscribe((e) => this.onChunkEvent(e));
  }

  update(time: number, sunDir: THREE.Vector3): void {
    this.material.uniforms.uTime.value = time;
    (this.material.uniforms.uSunDir.value as THREE.Vector3).copy(sunDir);
  }

  get meshCount(): number {
    return this.meshes.size;
  }

  dispose(): void {
    this.unsubscribe();
    for (const key of [...this.meshes.keys()]) this.remove(key);
    this.material.dispose();
  }

  private onChunkEvent(e: ChunkEvent): void {
    if (e.type === 'terrain') {
      if (e.chunk.water) this.upsert(e.chunk.key, e.chunk.water);
      else this.remove(e.chunk.key);
    } else if (e.type === 'unload') {
      this.remove(e.key);
    }
  }

  private upsert(key: string, data: WaterChunkData): void {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    geo.setAttribute('depth', new THREE.BufferAttribute(data.depths, 1));
    geo.setIndex(new THREE.BufferAttribute(data.indices, 1));
    geo.computeBoundingSphere();
    const existing = this.meshes.get(key);
    if (existing) {
      existing.geometry.dispose();
      existing.geometry = geo;
      return;
    }
    const mesh = new THREE.Mesh(geo, this.material);
    mesh.name = `water:${key}`;
    mesh.renderOrder = 2;
    mesh.matrixAutoUpdate = false;
    this.meshes.set(key, mesh);
    this.group.add(mesh);
  }

  private remove(key: string): void {
    const mesh = this.meshes.get(key);
    if (!mesh) return;
    this.group.remove(mesh);
    mesh.geometry.dispose();
    this.meshes.delete(key);
  }
}
