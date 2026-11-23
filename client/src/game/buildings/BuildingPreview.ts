/**
 * BuildingPreview — translucent ghost of the building snapped to the hovered hex, tinted
 * green (valid) or red (invalid), plus per-hex footprint fills showing exactly which hexes
 * are the problem.
 */
import * as THREE from 'three';
import {
  axialToWorld,
  rotationToYaw,
  type BuildingTypeCode,
  type PlacementCheck,
} from '@cityverse/shared';
import { drapePathGeometry } from './pathGeometry';
import { buildDrapedHexFill } from '../world/HexOverlay';
import type { BuildingModelCache } from './buildingModels';
import { footprintBaseHeight, type HeightSampler } from './BuildingRenderer';

const OK = new THREE.Color('#5ee07a');
const BAD = new THREE.Color('#ff5a4a');

export class BuildingPreview {
  readonly group = new THREE.Group();
  private readonly ghostMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
    emissive: OK.clone(),
    emissiveIntensity: 0.45,
  });
  private readonly ghost = new THREE.Mesh(new THREE.BufferGeometry(), this.ghostMat);
  private ownedGeometry: THREE.BufferGeometry | null = null;
  private readonly okFill: THREE.Mesh;
  private readonly badFill: THREE.Mesh;

  constructor(private readonly models: BuildingModelCache) {
    this.group.name = 'BuildingPreview';
    this.group.visible = false;
    const fillMat = (c: THREE.Color) =>
      new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.45, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
    this.okFill = new THREE.Mesh(new THREE.BufferGeometry(), fillMat(OK));
    this.badFill = new THREE.Mesh(new THREE.BufferGeometry(), fillMat(BAD));
    for (const m of [this.okFill, this.badFill]) {
      m.frustumCulled = false;
      m.renderOrder = 9;
    }
    this.ghost.renderOrder = 10;
    this.group.add(this.ghost, this.okFill, this.badFill);
  }

  show(code: BuildingTypeCode, level: number, rotation: number, check: PlacementCheck, height: HeightSampler): void {
    const anchor = check.hexes[0];
    const c = axialToWorld(anchor.q, anchor.r);
    this.ownedGeometry?.dispose();
    this.ownedGeometry = code === 'road' ? drapePathGeometry(this.models.get(code, level), anchor.q, anchor.r, rotation, height) : null;
    this.ghost.geometry = this.ownedGeometry ?? this.models.get(code, level);
    this.ghost.position.set(c.x, code === 'road' ? 0.03 : footprintBaseHeight(check.hexes, height) + 0.05, c.z);
    this.ghost.rotation.y = rotationToYaw(rotation);
    this.ghostMat.emissive.copy(check.valid ? OK : BAD);
    this.ghostMat.color.set(check.valid ? '#ffffff' : '#ffb0a8');

    const ok = (code === 'road' ? [] : check.hexes).filter((h) => !h.issue);
    const bad = (code === 'road' ? [] : check.hexes).filter((h) => h.issue);
    this.setFill(this.okFill, buildDrapedHexFill(ok, height, 0.22, 3, 0.96));
    this.setFill(this.badFill, buildDrapedHexFill(bad, height, 0.22, 3, 0.96));
    this.group.visible = true;
  }

  hide(): void {
    this.group.visible = false;
  }

  dispose(): void {
    this.ownedGeometry?.dispose();
    this.ghostMat.dispose();
    for (const m of [this.okFill, this.badFill]) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
  }

  private setFill(mesh: THREE.Mesh, positions: Float32Array): void {
    mesh.geometry.dispose();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    mesh.geometry = g;
  }
}
