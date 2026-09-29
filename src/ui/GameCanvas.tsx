import { useEffect, useRef } from 'react';
import type { RenderableWorld } from '../game/mapModel';

export default function GameCanvas({ world, selectedId, onSelect }: { world: RenderableWorld; selectedId: string | null; onSelect(id: string): void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<Awaited<ReturnType<typeof import('../game/createGame')['createTerrariumGame']>> | null>(null);

  useEffect(() => {
    let active = true;
    void import('../game/createGame').then(({ createTerrariumGame }) => {
      if (!active || !containerRef.current) return;
      handleRef.current = createTerrariumGame(containerRef.current, world, onSelect);
    });
    return () => { active = false; handleRef.current?.destroy(); handleRef.current = null; };
  }, []); // The game owns one canvas for this component lifetime.

  useEffect(() => { handleRef.current?.update(world, selectedId); }, [world, selectedId]);
  return <div className="game-canvas" ref={containerRef} aria-label="人类生态箱地图" />;
}

