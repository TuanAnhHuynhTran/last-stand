import { GameCanvas, type GameCanvasProps } from './GameCanvas';

/**
 * Backward-compatible Phase 1 export delegating to Phase 2 GameCanvas.
 */
export function CityWorldCanvas(props: GameCanvasProps) {
  return <GameCanvas {...props} />;
}

export { GameCanvas };
export type { GameCanvasProps };
