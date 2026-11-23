/**
 * Draw-tool preview: painted hexes in green (valid) / red (with an issue); during an
 * expansion the zone's current hexes are tinted blue so the player sees what they extend.
 */
import * as THREE from 'three';
import type { AxialCoord, FarmZoneCheck } from '@cityverse/shared';
import { buildDrapedHexFill } from '../world/HexOverlay';
import type { HeightSampler } from './farmGround';

const COLORS = { ok: '#5ee07a', bad: '#ff5a4a', base: '#6cb8ff', hover: '#fff3a0' } as const;
type Layer = keyof typeof COLORS;

export class FarmDraftPreview {
  readonly group = new THREE.Group();
  private readonly layers = new Map<Layer, THREE.Mesh>();

  constructor() {
    this.group.name = 'FarmDraftPreview';
    this.group.visible = false;
    for (const layer of Object.keys(COLORS) as Layer[]) {
      const mesh = new THREE.Mesh(
        new THREE.BufferGeometry(),
        new THREE.MeshBasicMaterial({
          color: COLORS[layer],
          transparent: true,
          opacity: layer === 'base' ? 0.3 : layer === 'hover' ? 0.35 : 0.5,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -3,
        })
      );
      mesh.frustumCulled = false;
      mesh.renderOrder = 9;
      this.layers.set(layer, mesh);
      this.group.add(mesh);
    }
  }

  show(check: FarmZoneCheck | null, base: readonly AxialCoord[], hover: AxialCoord | null, height: HeightSampler): void {
    const ok = check?.hexes.filter((h) => !h.issue) ?? [];
    const bad = check?.hexes.filter((h) => h.issue) ?? [];
    // Whole-region issues (too small / disconnected) tint every painted hex amber-red.
    const regionIssue = check ? check.issues.some((i) => i === 'TOO_SMALL' || i === 'DISCONNECTED' || i === 'TOO_LARGE') : false;
    this.set('ok', buildDrapedHexFill(regionIssue ? [] : ok, height, 1.3, 3, 0.94));
    this.set('bad', buildDrapedHexFill(regionIssue ? [...ok, ...bad] : bad, height, 1.3, 3, 0.94));
    (this.layers.get('bad')!.material as THREE.MeshBasicMaterial).color.set(regionIssue && bad.length === 0 ? '#ffae3c' : COLORS.bad);
    this.set('base', buildDrapedHexFill(base, height, 1.25, 3, 0.97));
    this.set('hover', buildDrapedHexFill(hover ? [hover] : [], height, 1.35, 3, 0.9));
    this.group.visible = true;
  }

  hide(): void {
    this.group.visible = false;
  }

  dispose(): void {
    for (const m of this.layers.values()) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
  }

  private set(layer: Layer, positions: Float32Array): void {
    const mesh = this.layers.get(layer)!;
    mesh.geometry.dispose();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    mesh.geometry = g;
  }
}
