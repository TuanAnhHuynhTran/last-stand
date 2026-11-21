import { memo, useEffect, useMemo } from 'react';
import type { ChunkDataDTO } from '@cityverse/shared';
import { buildChunkGridGeometry } from './terrainMeshBuilder';

interface ChunkGridItemProps {
  chunk: ChunkDataDTO;
}

const ChunkGridItem = memo(
  function ChunkGridItem({ chunk }: ChunkGridItemProps) {
    const { tileLines, borderLines } = useMemo(() => buildChunkGridGeometry(chunk), [chunk]);

    useEffect(() => {
      return () => {
        tileLines.dispose();
        borderLines.dispose();
      };
    }, [tileLines, borderLines]);

    return (
      <group>
        <lineSegments geometry={tileLines} renderOrder={2}>
          <lineBasicMaterial color="#fff9e6" transparent opacity={0.42} depthWrite={false} />
        </lineSegments>
        <lineSegments geometry={borderLines} renderOrder={3}>
          <lineBasicMaterial color="#ffd15c" transparent opacity={0.82} depthWrite={false} />
        </lineSegments>
      </group>
    );
  },
  (prev, next) =>
    prev.chunk.chunkX === next.chunk.chunkX &&
    prev.chunk.chunkZ === next.chunk.chunkZ &&
    prev.chunk.revision === next.chunk.revision
);

interface GridOverlayProps {
  chunks: ChunkDataDTO[];
  visible: boolean;
}

export function GridOverlay({ chunks, visible }: GridOverlayProps) {
  if (!visible || chunks.length === 0) {
    return null;
  }

  return (
    <group name="terrain-hex-grid-overlay">
      {chunks.map((chunk) => (
        <ChunkGridItem key={`${chunk.chunkX}:${chunk.chunkZ}`} chunk={chunk} />
      ))}
    </group>
  );
}
