/**
 * Pond water: one mesh per dug water body covering its hexes (fan-subdivided so depth varies
 * smoothly), lifted to the current water surface in the vertex shader.
 *
 * Stylised and cheap (one draw call per pond, no render targets):
 *  - soft waves, depth colour (clear shallow → deep green-blue), quality tint (murky when dirty)
 *  - fresnel sky tint + sun glint (follows the scene's sun direction = colour changes with light)
 *  - waterline foam band where the bank meets the water (the visible edge of the pond)
 *  - up to 4 expanding ripple rings (feeding, splashes)
 * Fragments above the bank are discarded, so the terrain itself shapes the shoreline.
 */
import * as THREE from 'three';
import { axialToWorld, getHexPolygon, type AxialCoord } from '@cityverse/shared';
import type { HeightSampler } from '../farming/farmGround';

export const MAX_RIPPLES = 4;
const RINGS = 4;

const vertexShader = /* glsl */ `
  attribute float ground;
  uniform float uTime;
  uniform float uSurface;
  varying float vDepth;
  varying vec3 vWorld;
  #include <fog_pars_vertex>
  void main() {
    vDepth = uSurface - ground;
    vec3 p = position;
    float calm = smoothstep(0.0, 0.6, vDepth);
    p.y = uSurface + (sin(p.x * 0.33 + uTime * 1.1) * 0.5 + sin(p.z * 0.29 - uTime * 0.8) * 0.5) * 0.035 * calm;
    vec4 world = modelMatrix * vec4(p, 1.0);
    vWorld = world.xyz;
    vec4 mvPosition = viewMatrix * world;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uQuality;
  uniform vec3 uShallow;
  uniform vec3 uDeep;
  uniform vec3 uMurky;
  uniform vec3 uSky;
  uniform vec3 uSunDir;
  uniform vec4 uRipples[${MAX_RIPPLES}];
  varying float vDepth;
  varying vec3 vWorld;
  #include <fog_pars_fragment>

  float wave(vec2 p, float t) {
    return sin(p.x * 0.8 + t * 1.6) * sin(p.y * 0.7 - t * 1.3) + 0.5 * sin((p.x + p.y) * 1.7 + t * 2.4);
  }

  void main() {
    if (vDepth < -0.02) discard;
    vec2 p = vWorld.xz;
    float t = uTime;
    float e = 0.3;
    float h0 = wave(p, t);
    float ring = 0.0;
    for (int i = 0; i < ${MAX_RIPPLES}; i++) {
      vec4 r = uRipples[i];
      if (r.w <= 0.0) continue;
      float age = t - r.z;
      if (age < 0.0 || age > 4.0) continue;
      float d = distance(p, r.xy);
      ring += exp(-pow((d - age * 2.0) * 2.2, 2.0)) * exp(-age * 0.9) * r.w;
    }
    float hx = wave(p + vec2(e, 0.0), t);
    float hz = wave(p + vec2(0.0, e), t);
    vec3 n = normalize(vec3(-(hx - h0) * 0.14 - ring * 0.25, 1.0, -(hz - h0) * 0.14 - ring * 0.25));

    vec3 viewDir = normalize(cameraPosition - vWorld);
    float depthT = smoothstep(0.0, 2.2, vDepth);
    vec3 clean = mix(uShallow, uDeep, depthT);
    vec3 col = mix(uMurky, clean, smoothstep(0.2, 0.75, uQuality));

    float fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);
    col = mix(col, uSky, fresnel * 0.4);
    vec3 halfDir = normalize(uSunDir + viewDir);
    col += vec3(1.0, 0.97, 0.88) * pow(max(dot(n, halfDir), 0.0), 80.0) * 0.5;

    // Waterline: a soft bright band where the bank enters the water.
    float edge = 1.0 - smoothstep(0.0, 0.22, vDepth + h0 * 0.02);
    float edgeNoise = 0.5 + 0.5 * sin(p.x * 2.1 + t * 1.4) * sin(p.y * 1.8 - t);
    col = mix(col, vec3(0.95, 1.0, 0.98), edge * (0.5 + 0.4 * edgeNoise));
    col += vec3(0.9, 1.0, 1.0) * min(1.0, ring) * 0.35;

    float alpha = mix(0.55, 0.88, depthT);
    alpha = max(alpha, edge * 0.85);
    alpha *= smoothstep(-0.02, 0.05, vDepth);
    gl_FragColor = vec4(col, alpha);
    #include <fog_fragment>
  }
`;

export function createPondWaterMaterial(): THREE.ShaderMaterial {
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
        uSurface: { value: 0 },
        uQuality: { value: 0.8 },
        uShallow: { value: new THREE.Color('#7fe3cf') },
        uDeep: { value: new THREE.Color('#2f8fa8') },
        uMurky: { value: new THREE.Color('#7f8a4a') },
        uSky: { value: new THREE.Color('#cdeeff') },
        uSunDir: { value: new THREE.Vector3(0.5, 0.8, 0.3).normalize() },
        uRipples: { value: Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(0, 0, -100, 0)) },
      },
    ]),
  });
}

/** Fan-subdivided hexes; `ground` = terrain height (after digging) at each vertex. */
export function buildPondWaterGeometry(hexes: readonly AxialCoord[], height: HeightSampler): THREE.BufferGeometry {
  const pos: number[] = [];
  const ground: number[] = [];
  const push = (x: number, z: number): void => {
    pos.push(x, 0, z);
    ground.push(height(x, z));
  };
  for (const h of hexes) {
    const c = axialToWorld(h.q, h.r);
    const poly = getHexPolygon(h.q, h.r);
    for (let s = 0; s < 6; s += 1) {
      const a = poly[s];
      const b = poly[(s + 1) % 6];
      // Triangle (c, a, b) split into RINGS² sub-triangles.
      const at = (i: number, j: number) => {
        const u = i / RINGS;
        const v = j / RINGS;
        return { x: c.x + (a.x - c.x) * u + (b.x - a.x) * v, z: c.z + (a.z - c.z) * u + (b.z - a.z) * v };
      };
      for (let i = 0; i < RINGS; i += 1) {
        for (let j = 0; j <= i; j += 1) {
          const p0 = at(i, j);
          const p1 = at(i + 1, j);
          const p2 = at(i + 1, j + 1);
          push(p0.x, p0.z);
          push(p2.x, p2.z);
          push(p1.x, p1.z);
          if (j < i) {
            const p3 = at(i, j + 1);
            push(p0.x, p0.z);
            push(p3.x, p3.z);
            push(p2.x, p2.z);
          }
        }
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('ground', new THREE.Float32BufferAttribute(ground, 1));
  g.computeBoundingSphere();
  // Positions sit at y = 0 and the surface is lifted in the shader: centre the culling sphere on the ground.
  if (g.boundingSphere && ground.length) {
    g.boundingSphere.center.y = ground.reduce((s, v) => s + v, 0) / ground.length;
    g.boundingSphere.radius += 4;
  }
  return g;
}
