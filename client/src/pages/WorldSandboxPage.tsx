import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { WorldCanvas } from '../game/world/WorldCanvas';
import { WorldHud } from '../game/world/WorldHud';
import { useWorldViewStore } from '../game/world/worldViewStore';

/**
 * Dev-only test scene (route registered only when import.meta.env.DEV): renders the world for
 * any seed with the performance panel open, to compare seeds and measure FPS / draw calls.
 */
export function WorldSandboxPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const seed = params.get('seed') || 'CV-COA-AABBCC112233';
  const [draft, setDraft] = useState(seed);

  useEffect(() => {
    if (!useWorldViewStore.getState().showPerf) useWorldViewStore.getState().togglePerf();
    // Exposed for automated browser checks (screenshots / perf sampling) in dev only.
    (window as unknown as Record<string, unknown>).__LH_WORLD__ = useWorldViewStore;
  }, []);

  const title = (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setParams({ seed: draft.trim() || seed });
      }}
      style={{ display: 'flex', gap: 8, alignItems: 'center' }}
    >
      <strong style={{ color: '#2b2116' }}>World sandbox</strong>
      <input
        aria-label="world seed"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        style={{ border: '1px solid #d8c3a0', borderRadius: 8, padding: '3px 8px', width: 190 }}
      />
      <button type="submit" className="cv-cozy-hud-btn">
        Tạo
      </button>
    </form>
  );

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <WorldCanvas key={seed} worldSeed={seed} />
      <WorldHud title={title} onExit={() => navigate('/')} />
    </div>
  );
}
