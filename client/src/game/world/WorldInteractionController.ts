/**
 * WorldInteractionController — pointer → hex. Hover is re-picked whenever the pointer or the
 * camera moved (so the highlight stays under the cursor while the camera eases/rotates).
 * Click (no drag) selects in build mode; double-click focuses the camera on that spot.
 */
import type * as THREE from 'three';
import { isWithinWorldBounds, type HexTile, type WorldGenerator } from '@cityverse/shared';
import { clientToNdc, pickHexFromNdc, type HeightSampler } from './picking';

export interface InteractionCallbacks {
  onHover: (tile: HexTile | null) => void;
  onSelect: (tile: HexTile, additive: boolean) => void;
  onFocus: (x: number, z: number) => void;
  /** Called first on every click (not drag); return true when handled (placement, building pick). */
  onClick?: (tile: HexTile | null, ndc: { x: number; y: number }, additive: boolean) => boolean;
  /** Pixels dragged during the last pointer press (from the camera input). */
  dragDistance: () => number;
  isBuildMode: () => boolean;
  /** Paint mode (farm draw tool): left press + drag paints hexes instead of clicking. */
  isPainting?: () => boolean;
  onPaint?: (tile: HexTile, phase: 'start' | 'move') => void;
}

export class WorldInteractionController {
  private pointer: { x: number; y: number } | null = null;
  private dirty = false;
  private hoverKey: string | null = null;
  private painting = false;
  private paintKey: string | null = null;
  private readonly disposers: (() => void)[] = [];

  constructor(
    private readonly element: HTMLElement,
    private readonly camera: THREE.Camera,
    private readonly world: WorldGenerator,
    private readonly height: HeightSampler,
    private readonly cb: InteractionCallbacks
  ) {
    const on = <K extends keyof HTMLElementEventMap>(type: K, fn: (e: HTMLElementEventMap[K]) => void): void => {
      element.addEventListener(type, fn as EventListener);
      this.disposers.push(() => element.removeEventListener(type, fn as EventListener));
    };
    on('pointermove', (e) => {
      this.pointer = clientToNdc(element, e.clientX, e.clientY);
      this.dirty = true;
      if (this.painting) this.paintAt(this.pointer);
    });
    on('pointerdown', (e) => {
      if (e.button !== 0 || !this.cb.isPainting?.()) return;
      this.painting = true;
      this.paintKey = null;
      this.paintAt(clientToNdc(element, e.clientX, e.clientY));
    });
    const stopPaint = (): void => {
      this.painting = false;
      this.paintKey = null;
    };
    on('pointerup', stopPaint);
    on('pointercancel', stopPaint);
    on('pointerleave', () => {
      this.pointer = null;
      this.setHover(null);
    });
    on('click', (e) => {
      if (e.button !== 0) return;
      if (this.cb.isPainting?.()) return; // handled on pointerdown / drag
      if (this.cb.dragDistance() > 5) return;
      const ndc = clientToNdc(element, e.clientX, e.clientY);
      const tile = this.tileAt(ndc);
      const additive = e.shiftKey || e.ctrlKey || e.metaKey;
      if (this.cb.onClick?.(tile, ndc, additive)) return;
      if (tile && this.cb.isBuildMode()) this.cb.onSelect(tile, additive);
    });
    on('dblclick', (e) => {
      const ndc = clientToNdc(element, e.clientX, e.clientY);
      const hit = pickHexFromNdc(this.camera, ndc.x, ndc.y, this.height);
      if (hit) this.cb.onFocus(hit.point.x, hit.point.z);
    });
  }

  /** Call once per frame after the camera has been updated. */
  update(cameraMoved: boolean): void {
    if (!this.pointer || (!this.dirty && !cameraMoved)) return;
    this.dirty = false;
    this.setHover(this.tileAt(this.pointer));
  }

  /** Ground point under a client position (used for zoom-to-cursor). */
  groundAt(clientX: number, clientY: number): { x: number; z: number } | null {
    const ndc = clientToNdc(this.element, clientX, clientY);
    const hit = pickHexFromNdc(this.camera, ndc.x, ndc.y, this.height);
    return hit ? { x: hit.point.x, z: hit.point.z } : null;
  }

  dispose(): void {
    this.disposers.forEach((d) => d());
    this.disposers.length = 0;
  }

  /** First hex of a stroke is 'start' (decides add vs erase), later ones are 'move'. */
  private paintAt(ndc: { x: number; y: number }): void {
    const tile = this.tileAt(ndc);
    if (!tile || tile.key === this.paintKey) return;
    const first = this.paintKey === null;
    this.paintKey = tile.key;
    this.cb.onPaint?.(tile, first ? 'start' : 'move');
  }

  private tileAt(ndc: { x: number; y: number }): HexTile | null {
    const hit = pickHexFromNdc(this.camera, ndc.x, ndc.y, this.height);
    if (!hit || !isWithinWorldBounds(hit.hex.q, hit.hex.r)) return null;
    return this.world.getHexTile(hit.hex.q, hit.hex.r);
  }

  private setHover(tile: HexTile | null): void {
    const key = tile?.key ?? null;
    if (key === this.hoverKey) return;
    this.hoverKey = key;
    this.cb.onHover(tile);
  }
}
