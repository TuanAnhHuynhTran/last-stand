/**
 * Training-yard sounds (sword whoosh, straw thud, bow twang, crossbow clack, arrow in the
 * target, stomp). Phase 12: synthesised by the shared AudioManager on its "weapons" channel,
 * so the settings sliders / mute apply. Off until enabled (a user gesture unlocks audio).
 */
import { audio } from '../../audio/AudioManager';

export type SoundKind = 'swing' | 'thud' | 'twang' | 'clack' | 'thunk' | 'stomp';

export class TrainingSounds {
  private enabled = false;

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (on) audio.unlock();
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  /** volume 0..1 (already distance-attenuated by the caller) */
  play(kind: SoundKind, volume: number): void {
    if (this.enabled) audio.play(kind, volume);
  }

  dispose(): void {
    this.enabled = false;
  }
}
