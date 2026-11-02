import { memo, type CSSProperties, type ReactNode } from 'react';
import manifest from './artManifest.json';

export interface ArtAsset {
  id: string;
  category: string;
  file: string;
  w: number;
  h: number;
}

const BY_ID: ReadonlyMap<string, ArtAsset> = new Map((manifest.assets as ArtAsset[]).map((a) => [a.id, a]));

export const hasArt = (id: string): boolean => BY_ID.has(id);
export const artUrl = (id: string): string | undefined => BY_ID.get(id)?.file;

const preloaded = new Set<string>();
export function preloadArt(ids: string[]): void {
  for (const id of ids) {
    const url = artUrl(id);
    if (!url || preloaded.has(url)) continue;
    preloaded.add(url);
    const img = new Image();
    img.src = url;
  }
}

/** Production image with a placeholder fallback. Art never blocks gameplay. */
export const Art = memo(function Art({
  id,
  size,
  height,
  width,
  alt = '',
  style,
  className,
  fallback = null,
  testId,
}: {
  id: string;
  size?: number;
  height?: number;
  width?: number;
  alt?: string;
  style?: CSSProperties;
  className?: string;
  fallback?: ReactNode;
  testId?: string;
}): React.JSX.Element {
  const url = artUrl(id);
  if (!url) return <>{fallback}</>;
  const h = height ?? size;
  const w = width ?? size;
  return (
    <img
      src={url}
      alt={alt}
      data-art={id}
      data-testid={testId}
      className={className}
      draggable={false}
      decoding="async"
      style={{
        width: w,
        height: h,
        objectFit: 'contain',
        display: 'block',
        flex: '0 0 auto',
        userSelect: 'none',
        ...style,
      }}
    />
  );
});

export type MonsterPose = 'idle' | 'tap' | 'happy' | 'fidgety' | 'grumpy' | 'gobble' | 'dance' | 'confused' | 'leave';

/** Curated state -> pose map. `walk` is deferred (no locomotion state). */
export function monsterPoseFor(input: {
  phase: string;
  patienceFraction: number;
  resultKind?: 'correct' | 'wrong' | 'timeout' | null;
  phaseMs: number;
}): MonsterPose {
  if (input.phase === 'ordering') return 'tap';
  if (input.phase === 'goWipe') return 'happy';
  if (input.phase === 'serveResult') {
    if (input.resultKind === 'correct') return input.phaseMs < 1250 ? 'gobble' : 'dance';
    if (input.resultKind === 'wrong') return 'confused';
    if (input.resultKind === 'timeout') return 'leave';
    return 'idle';
  }
  if (input.phase === 'cooking') {
    if (input.patienceFraction > 0.66) return 'happy';
    if (input.patienceFraction > 0.33) return 'fidgety';
    return 'grumpy';
  }
  return 'idle';
}
