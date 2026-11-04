import { memo, type CSSProperties, type ReactNode } from 'react';
import manifest from './artManifest.json';

export interface ArtAsset {
  id: string;
  category: string;
  file: string;
  w: number;
  h: number;
  /** Box in its approved 3:2 master as fractions [x0, y0, x1, y1]. */
  placement?: number[];
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
  height?: number | string;
  width?: number | string;
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

/*
 * Responsive layout: fixed stage + full-bleed background.
 * The 1600x900 stage is the safe area and is scaled to fit the viewport.
 * Approved storyboards are 3:2; a screen shows its master fit to the
 * stage width (1600x1066.7, centred, so 83.3 units sit above and below).
 * Bleed plates are those masters grown by 12.5% per side, which covers
 * any landscape viewport from 4:3 to ~2.2:1 with scenery instead of bars.
 */
const MASTER_W = 1600;
const MASTER_H = (1600 * 2) / 3;
const MASTER_TOP = (900 - MASTER_H) / 2;
const BLEED_PAD = 0.125;
export const BLEED_BOX = {
  left: -MASTER_W * BLEED_PAD,
  top: MASTER_TOP - MASTER_H * BLEED_PAD,
  width: MASTER_W * (1 + 2 * BLEED_PAD),
  height: MASTER_H * (1 + 2 * BLEED_PAD),
} as const;

/** Full-bleed scene plate behind a screen. Extends past the stage on purpose. */
export function Backdrop({ id, fallback = null }: { id: string; fallback?: ReactNode }): React.JSX.Element {
  return (
    <Art
      id={id}
      width={BLEED_BOX.width}
      height={BLEED_BOX.height}
      fallback={fallback}
      style={{
        position: 'absolute',
        left: BLEED_BOX.left,
        top: BLEED_BOX.top,
        objectFit: 'fill',
        pointerEvents: 'none',
      }}
    />
  );
}

/** Stage box for an element cut from a master: exactly where the storyboard has it. */
export interface StageBox {
  position: 'absolute';
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Where a 3:2 master's full frame lands in stage units. */
export interface MasterFrame {
  left: number;
  top: number;
  width: number;
  height: number;
}
/** Default: the master fit to the 1600-wide safe area, centred vertically. */
export const STORYBOARD_FRAME: MasterFrame = { left: 0, top: MASTER_TOP, width: MASTER_W, height: MASTER_H };

export function masterBox(id: string, frame: MasterFrame = STORYBOARD_FRAME): StageBox | undefined {
  const p = BY_ID.get(id)?.placement;
  if (!p || p.length !== 4) return undefined;
  return {
    position: 'absolute',
    left: frame.left + p[0] * frame.width,
    top: frame.top + p[1] * frame.height,
    width: (p[2] - p[0]) * frame.width,
    height: (p[3] - p[1]) * frame.height,
  };
}

/** Height / width of an art asset, from the synced manifest (for stacking layers). */
export const artAspect = (id: string): number | undefined => {
  const a = BY_ID.get(id);
  return a ? a.h / a.w : undefined;
};

/** The monster's window poses (art-production WINDOW_POSES). Dancing and
 *  leaving reuse `happy` with motion in the kitchen. */
export type MonsterPose = 'tap' | 'happy' | 'fidgety' | 'grumpy' | 'gobble' | 'confused';

/** Curated state -> window pose map. */
export function monsterPoseFor(input: {
  phase: string;
  patienceFraction: number;
  resultKind?: 'correct' | 'wrong' | 'timeout' | null;
  phaseMs: number;
}): MonsterPose {
  if (input.phase === 'ordering') return 'tap';
  if (input.phase === 'serveResult') {
    if (input.resultKind === 'correct') return input.phaseMs < 1250 ? 'gobble' : 'happy';
    if (input.resultKind === 'wrong') return 'confused';
    return 'happy';
  }
  if (input.phase === 'cooking') {
    if (input.patienceFraction > 0.66) return 'happy';
    if (input.patienceFraction > 0.33) return 'fidgety';
    return 'grumpy';
  }
  return 'happy';
}
