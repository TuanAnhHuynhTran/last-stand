import { useSyncExternalStore } from 'react';
import { audio } from './AudioManager';

const subscribe = (notify: () => void) => audio.subscribe(notify);
const snapshot = () => audio.current;

/** Quick control for the existing music channel; AudioManager persists the setting. */
export function MusicToggle() {
  const settings = useSyncExternalStore(subscribe, snapshot, snapshot);
  const enabled = !settings.channels.music.muted;
  return (
    <button
      type="button"
      className={`cv-cozy-hud-btn ${enabled ? 'cv-cozy-hud-btn--active' : ''}`}
      data-testid="toggle-background-music"
      aria-label="Nhạc nền"
      aria-pressed={enabled}
      title={enabled ? 'Tắt nhạc nền' : 'Bật nhạc nền'}
      onClick={() => {
        audio.update(s => { s.channels.music.muted = !s.channels.music.muted; });
        if (!audio.current.channels.music.muted) audio.unlock();
      }}
    >
      <span aria-hidden="true">♫</span>
      <span>Nhạc nền: {enabled ? 'Bật' : 'Tắt'}</span>
    </button>
  );
}
