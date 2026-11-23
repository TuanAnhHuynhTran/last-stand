/**
 * Weather & night lights (Phase 12): rain streaks around the camera (one LineSegments draw),
 * wind slanting the rain, extra fog / cloud dimming, and warm lamps on buildings at night
 * (one Points draw + a few real point lights near the camera focus, count by quality).
 * Visual only — nothing here touches game data.
 */
import * as THREE from 'three';
import type { QualityLevel } from './qualitySettings';
import { weatherAt, type WeatherMode, type WeatherState } from './weather';

const RAIN_DROPS: Record<QualityLevel, number> = { low: 500, medium: 1400, high: 2800 };
const LAMP_LIGHTS: Record<QualityLevel, number> = { low: 0, medium: 3, high: 6 };
const BOX = { w: 90, h: 55 };

function glowTexture(): THREE.Texture {
  if (typeof document === 'undefined') return new THREE.Texture();
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (!g) return new THREE.Texture();
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,236,170,1)');
  grad.addColorStop(0.35, 'rgba(255,196,96,0.55)');
  grad.addColorStop(1, 'rgba(255,170,60,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class WeatherSystem {
  readonly group = new THREE.Group();
  mode: WeatherMode = 'auto';
  state: WeatherState = weatherAt(0, 0, 'clear');
  /** 0 (day) … 1 (deep night) — lamp brightness */
  night = 0;
  private rain!: THREE.LineSegments;
  private rainPos!: Float32Array;
  private drops = 0;
  private readonly lampPoints: THREE.Points;
  private lampPositions: THREE.Vector3[] = [];
  private readonly lights: THREE.PointLight[] = [];
  private readonly tmp = new THREE.Vector3();
  private level: QualityLevel;

  constructor(
    private readonly seed: number,
    level: QualityLevel
  ) {
    this.level = level;
    this.group.name = 'Weather';
    this.buildRain(RAIN_DROPS[level]);
    const lampMat = new THREE.PointsMaterial({ size: 3.2, map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, sizeAttenuation: true, fog: false });
    this.lampPoints = new THREE.Points(new THREE.BufferGeometry(), lampMat);
    this.lampPoints.frustumCulled = false;
    this.lampPoints.name = 'Lamps';
    this.group.add(this.lampPoints);
    this.setLightCount(LAMP_LIGHTS[level]);
  }

  private buildRain(n: number): void {
    if (this.rain) {
      this.group.remove(this.rain);
      this.rain.geometry.dispose();
      (this.rain.material as THREE.Material).dispose();
    }
    this.drops = n;
    this.rainPos = new Float32Array(n * 6);
    for (let i = 0; i < n; i += 1) {
      const x = (Math.random() - 0.5) * BOX.w;
      const y = Math.random() * BOX.h;
      const z = (Math.random() - 0.5) * BOX.w;
      this.rainPos.set([x, y, z, x, y - 1.1, z], i * 6);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.LineBasicMaterial({ color: '#cfe3ff', transparent: true, opacity: 0, depthWrite: false });
    this.rain = new THREE.LineSegments(geo, mat);
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    this.rain.name = 'Rain';
    this.group.add(this.rain);
  }

  private setLightCount(n: number): void {
    while (this.lights.length > n) this.group.remove(this.lights.pop()!);
    while (this.lights.length < n) {
      const l = new THREE.PointLight('#ffc070', 0, 22, 2);
      l.castShadow = false;
      this.lights.push(l);
      this.group.add(l);
    }
  }

  setQuality(level: QualityLevel): void {
    if (level === this.level) return;
    this.level = level;
    this.buildRain(RAIN_DROPS[level]);
    this.setLightCount(LAMP_LIGHTS[level]);
  }

  /** World positions of lamps (one per lit building, at about eave height). */
  setLamps(points: readonly THREE.Vector3[]): void {
    this.lampPositions = points.map((p) => p.clone());
    const arr = new Float32Array(points.length * 3);
    points.forEach((p, i) => arr.set([p.x, p.y, p.z], i * 3));
    this.lampPoints.geometry.dispose();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    this.lampPoints.geometry = g;
  }

  get lampCount(): number {
    return this.lampPositions.length;
  }

  get rainDrops(): number {
    return this.rain.visible ? this.drops : 0;
  }

  /** Advances rain, lamps and lights; returns the current weather. */
  update(dt: number, nowMs: number, daylight: number, focus: THREE.Vector3, camera: THREE.Camera): WeatherState {
    const w = weatherAt(this.seed, nowMs, this.mode);
    this.state = w;
    // Rain: a box of streaks that follows the camera, falling and slanted by the wind.
    const show = w.rain > 0.02;
    this.rain.visible = show;
    if (show) {
      (this.rain.material as THREE.LineBasicMaterial).opacity = 0.18 + 0.35 * w.rain;
      const fall = (26 + 10 * w.rain) * dt;
      const slant = w.wind * 0.6;
      const base = camera.position;
      const p = this.rainPos;
      const active = Math.floor(this.drops * Math.min(1, 0.3 + w.rain));
      for (let i = 0; i < this.drops; i += 1) {
        const o = i * 6;
        if (i >= active) {
          p[o + 1] = p[o + 4] = -9999;
          continue;
        }
        let x = p[o] - slant * fall;
        let y = p[o + 1] - fall;
        let z = p[o + 2];
        // Wrap inside the box around the camera.
        if (y < base.y - BOX.h * 0.75 || y < -50 || Math.abs(x - base.x) > BOX.w / 2 || Math.abs(z - base.z) > BOX.w / 2) {
          x = base.x + (Math.random() - 0.5) * BOX.w;
          z = base.z + (Math.random() - 0.5) * BOX.w;
          y = base.y + BOX.h * (0.15 + Math.random() * 0.25);
        }
        p[o] = x;
        p[o + 1] = y;
        p[o + 2] = z;
        p[o + 3] = x + slant * 1.1;
        p[o + 4] = y - 1.1;
        p[o + 5] = z;
      }
      (this.rain.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    }
    // Lamps glow from dusk (and a little under heavy cloud / fog).
    this.night = Math.min(1, Math.max(0, 1 - daylight * 1.25) + 0.25 * w.cloud * (1 - daylight) + 0.2 * w.fog);
    (this.lampPoints.material as THREE.PointsMaterial).opacity = this.night * 0.95;
    this.lampPoints.visible = this.night > 0.02 && this.lampPositions.length > 0;
    if (this.lights.length) {
      const near = this.lampPositions
        .map((p) => ({ p, d: p.distanceToSquared(this.tmp.set(focus.x, p.y, focus.z)) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, this.lights.length);
      this.lights.forEach((l, i) => {
        const n = near[i];
        l.visible = Boolean(n) && this.night > 0.05;
        if (n) {
          l.position.copy(n.p);
          l.intensity = 14 * this.night;
        }
      });
    }
    return w;
  }

  dispose(): void {
    this.rain.geometry.dispose();
    (this.rain.material as THREE.Material).dispose();
    this.lampPoints.geometry.dispose();
    const m = this.lampPoints.material as THREE.PointsMaterial;
    m.map?.dispose();
    m.dispose();
  }
}
