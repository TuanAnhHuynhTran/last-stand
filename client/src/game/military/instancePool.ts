import * as THREE from 'three';

const WHITE = new THREE.Color('#ffffff');

/**
 * Growable instanced meshes keyed by part name: write instances each frame with `put`, then
 * `commit` sets counts / visibility. One draw call per part, whatever the number of soldiers.
 */
export class InstancePool {
  private readonly meshes = new Map<string, THREE.InstancedMesh>();
  private counts = new Map<string, number>();

  constructor(
    private readonly group: THREE.Group,
    private readonly material: THREE.Material,
    private readonly prefix: string
  ) {}

  begin(): void {
    this.counts = new Map();
  }

  put(key: string, geo: THREE.BufferGeometry, m: THREE.Matrix4, color: THREE.Color = WHITE): void {
    const i = this.counts.get(key) ?? 0;
    this.counts.set(key, i + 1);
    let mesh = this.meshes.get(key);
    if (!mesh || i >= mesh.instanceMatrix.count) {
      const bigger = new THREE.InstancedMesh(geo, this.material, Math.max(8, Math.ceil((i + 1) * 1.6)));
      bigger.name = `${this.prefix}:${key}`;
      bigger.castShadow = true;
      bigger.frustumCulled = false;
      for (let k = 0; k < bigger.instanceMatrix.count; k += 1) bigger.setColorAt(k, WHITE);
      if (mesh) {
        (bigger.instanceMatrix.array as Float32Array).set(mesh.instanceMatrix.array as Float32Array);
        if (mesh.instanceColor) (bigger.instanceColor!.array as Float32Array).set(mesh.instanceColor.array as Float32Array);
        this.group.remove(mesh);
        mesh.dispose();
      }
      this.group.add(bigger);
      this.meshes.set(key, bigger);
      mesh = bigger;
    }
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, color);
  }

  commit(): void {
    for (const [key, mesh] of this.meshes) {
      mesh.count = this.counts.get(key) ?? 0;
      mesh.visible = mesh.count > 0;
      if (mesh.count) {
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
    }
  }

  count(key: string): number {
    return this.counts.get(key) ?? 0;
  }

  setShadows(on: boolean): void {
    for (const m of this.meshes.values()) m.castShadow = on;
  }

  dispose(): void {
    for (const m of this.meshes.values()) {
      this.group.remove(m);
      m.dispose();
    }
    this.meshes.clear();
  }
}
