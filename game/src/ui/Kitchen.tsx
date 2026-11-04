import { memo, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { bankedTarget } from '../core/difficulty';
import { currentOrder, GO_WIPE_MS, type GameEvent, type GameState } from '../core/game';
import { playKioskItem, playSfx } from '../audio/audio';
import { isTestMode } from './store';
import { Art, artAspect, monsterPoseFor, preloadArt } from './Art';
import { ItemIcon } from './ItemIcon';

/**
 * KITCHEN LAYOUT (ordering, Go! wipe, cooking, serve result).
 * Storyboards (1920x1280; window-1 is the same frame at 1536x1024):
 * approved/order-at-window-1-centred-ordering.png, -2-bar-collecting.png,
 * -3-go-wipe.png and go-start-gameplay.png.
 *
 * Every number below is MEASURED IN STORYBOARD PIXELS (1920x1280 frame).
 * The storyboard frame is fitted to the stage height and centred:
 * stage x = 125 + x * 0.703125, stage y = y * 0.703125 (helpers X, Y, D).
 * On screens wider than 3:2 only the plain wall, counter and panel continue
 * to the sides. Edit a storyboard number to move a piece.
 *
 * There is no background image. The scene is layers, back to front:
 * sky + hills (SVG) -> monster -> truck wall with the window as a hole, posts
 * and top line (SVG) -> counter and bottom panel (SVG) -> dish, tiles,
 * controls -> Go! wipe. The wall and counter are in front of the monster, so
 * it rises from below the counter and leaves behind the wall. Nothing is
 * clipped.
 */
const SB_SCALE = 900 / 1280;
const X = (x: number): number => 125 + x * SB_SCALE;
const Y = (y: number): number => y * SB_SCALE;
const D = (d: number): number => d * SB_SCALE;

export const KITCHEN_SB = {
  topLine: 42, // centre of the frame's top line
  postL: [89, 185], // left post: centres of its outer and inner outlines
  postR: [1723.5, 1830.5], // right post
  jambR: 1690.5, // thin jamb line inside the right post
  back: 785.5, // counter ledge, back edge (centre of line)
  front: 904.5, // counter ledge, front edge
  diagL: [180, 790, 5, 904.5], // ledge's left end: post inner corner -> front edge
  diagR: [1729, 790, 1914, 904.5], // ledge's right end
  hillsL: [[190, 420], [250, 489], [300, 551], [350, 543], [475, 508], [600, 531], [700, 600], [780, 700]],
  hillsR: [[1240, 700], [1300, 628], [1350, 589], [1475, 554], [1550, 565], [1600, 592], [1650, 653], [1690, 690]],
  // Monster window-pose canvas (all poses and monsters share it). Sized so OG
  // matches the storyboard: body 671 wide at the counter, head top at y 300.
  monster: { size: 965, top: 281, orderX: 952.5, waitX: 1272 },
  dish: { centreX: 557.5, base: 891, width: 509 }, // bun on the counter
  tiles: { top: 924, width: 206, height: 170, pitch: 230, border: 9, radius: 22, icon: 140, glow: 233 },
  undo: [739, 1185, 160], // centre x, centre y, diameter
  bell: [957, 1182, 198],
  trash: [1181, 1188, 160],
  badge: [101, 1192, 167], // Head Chef: tap = help, hold = power reset
  stars: { right: 1897, centreY: 1168, size: 108, gap: 13, maxWidth: 597 },
  // Go! wipe at its storyboard moment: band axis angle, centre, thickness;
  // "GO!" and the triangle placed along the band (u) and across it (v).
  wipe: { angle: -15.4, cx: 960, cy: 520, thickness: 611, goU: -130, goV: -93, goSize: 386, triU: 400, triV: -55, triW: 300, triH: 330 },
} as const;

/** Stage-unit pieces not shown in the four storyboards. */
export const KITCHEN_EXTRA = {
  speaker: { left: 176, top: 64, size: 84 }, // broken-speaker sign (Level 5+)
  nom: { left: 590, top: 64, width: 400, height: 170 }, // "Nom Nom!" bubble beside the waiting monster
  rise: 380, // monster rises from below the counter by this much
  dishOverlap: 0.42,
  dishMaxHeight: 500,
} as const;

/** Colours sampled from the approved storyboards. */
const INK = '#1a0f17';
const C = {
  wall: '#3aa4a2',
  sky: '#46baa9',
  hills: '#40938d',
  post: '#fd6950',
  ledge: '#faeac3',
  panel: '#faeac3',
  tile: '#fcc984',
  glow: '#fff4a3',
  wrong: '#ff4d4d',
  star: '#fbc531',
  starOff: '#fbf3dc',
  band: '#fed725',
  goText: '#682c0a',
  badge: '#dc7e31',
} as const;

const BLEED = { left: -200, top: -217, width: 2000, height: 1334 };
const LINE = D(12); // storyboard outlines are ~12 px

const svgBox: React.CSSProperties = {
  position: 'absolute',
  left: BLEED.left,
  top: BLEED.top,
  width: BLEED.width,
  height: BLEED.height,
  pointerEvents: 'none',
  overflow: 'visible',
};
const viewBox = `${BLEED.left} ${BLEED.top} ${BLEED.width} ${BLEED.height}`;

/** Smooth SVG path through points (Catmull-Rom as cubic Beziers). */
function smooth(pts: readonly (readonly number[])[]): string {
  const p = pts.map(([x, y]) => [X(x), Y(y)]);
  let d = `M ${p[0][0]} ${p[0][1]}`;
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[Math.max(0, i - 1)];
    const b = p[i];
    const c = p[i + 1];
    const e = p[Math.min(p.length - 1, i + 2)];
    d += ` C ${b[0] + (c[0] - a[0]) / 6} ${b[1] + (c[1] - a[1]) / 6}, ${c[0] - (e[0] - b[0]) / 6} ${c[1] - (e[1] - b[1]) / 6}, ${c[0]} ${c[1]}`;
  }
  return d;
}

/** Back layer: sky and hills seen through the window. */
const SceneBack = memo(function SceneBack(): React.JSX.Element {
  const k = KITCHEN_SB;
  const back = Y(k.back);
  const hill = (pts: readonly (readonly number[])[]): string =>
    `${smooth(pts)} L ${X(pts[pts.length - 1][0])} ${back} L ${X(pts[0][0])} ${back} Z`;
  return (
    <svg data-testid="kitchen-back" viewBox={viewBox} style={{ ...svgBox, zIndex: 0 }} aria-hidden>
      <rect x={BLEED.left} y={BLEED.top} width={BLEED.width} height={BLEED.height} fill={C.sky} />
      <path fill={C.hills} d={hill(k.hillsL)} />
      <path fill={C.hills} d={hill(k.hillsR)} />
    </svg>
  );
});

/** Truck wall with the window opening cut out, coral posts, the jamb and
 *  the dark top line: in front of the monster. */
const WindowFrame = memo(function WindowFrame(): React.JSX.Element {
  const k = KITCHEN_SB;
  const yB = BLEED.top + BLEED.height;
  const xR = BLEED.left + BLEED.width;
  const top = Y(k.topLine);
  const bottom = Y(k.front);
  const [lo, li] = k.postL;
  const [ri, ro] = k.postR;
  return (
    <svg data-testid="window-frame" viewBox={viewBox} style={{ ...svgBox, zIndex: 2 }} aria-hidden>
      <path
        fillRule="evenodd"
        fill={C.wall}
        d={`M ${BLEED.left} ${BLEED.top} H ${xR} V ${yB} H ${BLEED.left} Z M ${X(lo)} ${top} H ${X(ro)} V ${bottom} H ${X(lo)} Z`}
      />
      <g stroke={INK} strokeWidth={LINE} strokeLinejoin="round">
        <rect x={X(lo)} y={top} width={X(li) - X(lo)} height={bottom - top} fill={C.post} />
        <line x1={X(k.jambR)} y1={top} x2={X(k.jambR)} y2={bottom} />
        <rect x={X(ri)} y={top} width={X(ro) - X(ri)} height={bottom - top} fill={C.post} />
        <line x1={X(lo)} y1={top} x2={X(ro)} y2={top} strokeLinecap="round" />
      </g>
    </svg>
  );
});

/** Front layer: the counter ledge (its ends run diagonally from the posts'
 *  inner corners to the front edge, over the posts) and the bottom panel. */
const SceneFront = memo(function SceneFront(): React.JSX.Element {
  const k = KITCHEN_SB;
  const back = Y(k.back);
  const front = Y(k.front);
  const [lx0, ly0, lx1] = k.diagL;
  const [rx0, ry0, rx1] = k.diagR;
  const xL = BLEED.left;
  const xR = BLEED.left + BLEED.width;
  const yB = BLEED.top + BLEED.height;
  return (
    <svg data-testid="kitchen-front" viewBox={viewBox} style={{ ...svgBox, zIndex: 4 }} aria-hidden>
      <rect x={xL} y={front} width={xR - xL} height={yB - front} fill={C.panel} />
      <polygon
        points={`${X(lx1)},${front} ${X(lx0)},${Y(ly0)} ${X(lx0)},${back} ${X(rx0)},${back} ${X(rx0)},${Y(ry0)} ${X(rx1)},${front}`}
        fill={C.ledge}
      />
      <g stroke={INK} strokeWidth={LINE} strokeLinejoin="round" strokeLinecap="round" fill="none">
        <polyline points={`${X(lx1)},${front} ${X(lx0)},${Y(ly0)}`} />
        <line x1={X(lx0)} y1={back} x2={X(rx0)} y2={back} />
        <polyline points={`${X(rx0)},${Y(ry0)} ${X(rx1)},${front}`} />
        <line x1={xL} y1={front} x2={xR} y2={front} />
      </g>
    </svg>
  );
});

/** A chunky outlined star (native SVG): lit gold or unlit cream. */
export function Star({ lit, size }: { lit: boolean; size: number }): React.JSX.Element {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 46 : 21;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${50 + r * Math.cos(a)},${53 + r * Math.sin(a)}`);
  }
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" data-lit={lit} aria-hidden style={{ display: 'block' }}>
      <polygon
        points={pts.join(' ')}
        fill={lit ? C.star : C.starOff}
        stroke={INK}
        strokeWidth={9}
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Row of level stars, sized so up to seven fit beside the controls. */
function StarRow({ lit, total }: { lit: number; total: number }): React.JSX.Element {
  const s = KITCHEN_SB.stars;
  const size = D(Math.min(s.size, (s.maxWidth - s.gap * (total - 1)) / total));
  const width = total * size + (total - 1) * D(s.gap);
  return (
    <div
      data-testid="try-stars"
      data-lit-count={lit}
      style={{
        position: 'absolute',
        left: X(s.right) - width,
        top: Y(s.centreY) - size / 2,
        display: 'flex',
        gap: D(s.gap),
        zIndex: 8,
      }}
    >
      {Array.from({ length: total }, (_, i) => (
        <Star key={i} lit={i < lit} size={size} />
      ))}
    </div>
  );
}

/** Speaker with static sparks: the Level 5+ broken-speaker gag (native SVG). */
function BrokenSpeaker(): React.JSX.Element {
  const s = KITCHEN_EXTRA.speaker;
  return (
    <svg
      data-testid="speaker-broken"
      width={s.size}
      height={s.size}
      viewBox="0 0 100 100"
      aria-label="Broken speaker"
      style={{ position: 'absolute', left: s.left, top: s.top, zIndex: 3 }}
    >
      <g stroke={INK} strokeWidth={7} strokeLinejoin="round" strokeLinecap="round">
        <circle cx={50} cy={50} r={45} fill="#fff7e6" />
        <path d="M24 40 h12 l16 -13 v46 l-16 -13 h-12 z" fill="#8a7f87" />
        <path d="M62 34 l8 8 l-8 8 l8 8 l-8 8" fill="none" stroke="#f2a20d" />
        <path d="M74 30 l8 8 l-8 8 l8 8 l-8 8" fill="none" stroke="#f2a20d" />
      </g>
    </svg>
  );
}

/** "Nom Nom!" speech bubble (native SVG + Fredoka text). */
function NomBubble(): React.JSX.Element {
  const n = KITCHEN_EXTRA.nom;
  return (
    <motion.div
      data-testid="nom-nom"
      initial={{ scale: 0.3, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 380, damping: 16 }}
      style={{ position: 'absolute', left: n.left, top: n.top, width: n.width, height: n.height, zIndex: 8 }}
    >
      <svg width={n.width} height={n.height} viewBox="0 0 400 170" style={{ position: 'absolute', inset: 0 }} aria-hidden>
        <path
          d="M44 12 H340 Q380 12 380 52 V100 Q380 138 340 138 H300 L352 166 L240 138 H44 Q8 138 8 100 V52 Q8 12 44 12 Z"
          fill="#fff"
          stroke={INK}
          strokeWidth={8}
          strokeLinejoin="round"
        />
      </svg>
      <span
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 30,
          textAlign: 'center',
          fontFamily: 'Fredoka, system-ui, sans-serif',
          fontWeight: 700,
          fontSize: 62,
          lineHeight: 1.1,
          color: C.post,
          WebkitTextStroke: `3px ${INK}`,
          paintOrder: 'stroke fill',
        }}
      >
        Nom Nom!
      </span>
    </motion.div>
  );
}

/** Deterministic speed streaks for the Go! band (orange and pale yellow),
 *  in band-local storyboard px (u along the band, v across it). */
const STREAKS = Array.from({ length: 30 }, (_, i) => {
  const r = (n: number): number => ((Math.sin(i * 97.13 + n * 13.7) + 1) / 2) % 1;
  const t = KITCHEN_SB.wipe.thickness;
  return { u: -2000 + r(1) * 4000, v: -t / 2 + 30 + r(2) * (t - 60), len: 300 + r(3) * 700, th: 8 + r(4) * 16, pale: i % 3 === 0 };
});

/** Go! wipe: the storyboard's diagonal streaked band with "GO!" and a white
 *  play triangle. It slides in along its own axis, holds exactly where the
 *  storyboard has it, and slides out (native: CSS/SVG band, Fredoka text,
 *  SVG triangle). */
export function GoWipe(): React.JSX.Element {
  const w = KITCHEN_SB.wipe;
  const seconds = GO_WIPE_MS / 1000;
  const len = 4400; // band length in storyboard px (longer than any screen diagonal)
  const rad = (w.angle * Math.PI) / 180;
  const travel = D(3200);
  const dx = Math.cos(rad) * travel;
  const dy = Math.sin(rad) * travel;
  return (
    <div
      data-testid="go-wipe"
      aria-hidden
      style={{ position: 'absolute', left: BLEED.left, top: BLEED.top, width: BLEED.width, height: BLEED.height, overflow: 'hidden', zIndex: 20, pointerEvents: 'none' }}
    >
      <motion.div
        initial={{ x: -dx, y: -dy }}
        animate={{ x: [-dx, 0, 0, dx], y: [-dy, 0, 0, dy] }}
        transition={{ duration: seconds, times: [0, 0.3, 0.7, 1], ease: 'easeInOut' }}
        style={{
          position: 'absolute',
          left: X(w.cx) - BLEED.left - D(len) / 2,
          top: Y(w.cy) - BLEED.top - D(w.thickness) / 2,
          width: D(len),
          height: D(w.thickness),
          rotate: w.angle,
          background: C.band,
        }}
      >
        <svg width={D(len)} height={D(w.thickness)} viewBox={`${-len / 2} ${-w.thickness / 2} ${len} ${w.thickness}`} style={{ position: 'absolute', inset: 0 }} aria-hidden>
          {STREAKS.map((s, i) => (
            <path key={i} d={`M ${s.u} ${s.v} L ${s.u + s.len} ${s.v - s.th / 2} L ${s.u + s.len} ${s.v + s.th / 2} Z`} fill={s.pale ? '#fff27a' : '#f6b330'} opacity={0.9} />
          ))}
        </svg>
        <span
          style={{
            position: 'absolute',
            left: D(len / 2 + w.goU),
            top: D(w.thickness / 2 + w.goV),
            transform: 'translate(-50%, -50%)',
            fontFamily: 'Fredoka, system-ui, sans-serif',
            fontWeight: 700,
            fontSize: D(w.goSize),
            lineHeight: 1,
            color: C.goText,
            whiteSpace: 'nowrap',
          }}
        >
          GO!
        </span>
        <svg
          width={D(w.triW)}
          height={D(w.triH)}
          viewBox="0 0 300 330"
          aria-hidden
          style={{ position: 'absolute', left: D(len / 2 + w.triU - w.triW / 2), top: D(w.thickness / 2 + w.triV - w.triH / 2) }}
        >
          <path d="M40 30 Q40 6 62 18 L280 145 Q300 165 280 185 L62 312 Q40 324 40 300 Z" fill="#fff" />
        </svg>
      </motion.div>
    </div>
  );
}

/** One beige tile with an ingredient. `ring` draws the storyboard's glow
 *  circle (ordering / help) or a red ring (wrong serve: the missing item). */
function Tile({
  id,
  index,
  ring,
  disabled,
  onTap,
  attrs,
}: {
  id: string;
  index: number;
  ring: 'glow' | 'wrong' | null;
  disabled: boolean;
  onTap?: () => void;
  attrs: Record<string, string | number | undefined>;
}): React.JSX.Element {
  const t = KITCHEN_SB.tiles;
  return (
    <motion.button
      {...attrs}
      aria-label={id}
      disabled={disabled}
      initial={{ scale: 0.4, opacity: 0 }}
      animate={{ scale: ring === 'glow' ? 1.08 : 1, opacity: 1 }}
      whileTap={disabled ? undefined : { scale: 0.92 }}
      transition={{ type: 'spring', stiffness: 420, damping: 20, delay: onTap ? index * 0.03 : 0 }}
      onClick={onTap}
      style={{
        position: 'relative',
        width: D(t.width),
        height: D(t.height),
        flex: '0 0 auto',
        padding: 0,
        background: C.tile,
        border: `${D(t.border)}px solid ${INK}`,
        borderRadius: D(t.radius),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: disabled ? 'default' : 'pointer',
        zIndex: ring ? 2 : 1,
      }}
    >
      <ItemIcon id={id} size={D(t.icon)} />
      {ring && (
        <span
          aria-hidden
          data-testid={ring === 'wrong' ? 'missing-item' : undefined}
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: D(t.glow),
            height: D(t.glow),
            transform: 'translate(-50%, -50%)',
            borderRadius: '50%',
            border: `9px solid ${ring === 'glow' ? C.glow : C.wrong}`,
            boxShadow:
              ring === 'glow'
                ? '0 0 22px 8px rgba(255,226,80,.85), inset 0 0 16px 6px rgba(255,226,80,.75)'
                : '0 0 18px 6px rgba(255,77,77,.7)',
            pointerEvents: 'none',
          }}
        />
      )}
    </motion.button>
  );
}

/** Head Chef badge, bottom left. Tap: the Head Chef re-calls the order
 *  (help). Press and hold: a ring fills and the game resets completely. */
function ChefBadge({
  helping,
  onHelp,
  onPowerReset,
}: {
  helping: boolean;
  onHelp: () => void;
  onPowerReset: () => void;
}): React.JSX.Element {
  const [bx, by, bd] = KITCHEN_SB.badge;
  const b = { size: D(bd) };
  const test = isTestMode();
  // A press shorter than `tapMs` is a tap (help); longer shows the ring,
  // which completes the reset at `holdMs`.
  const tapMs = test ? 120 : 450;
  const holdMs = test ? 700 : 3000;
  const [progress, setProgress] = useState(0);
  const [holding, setHolding] = useState(false);
  const started = useRef<number | null>(null);
  const timers = useRef<number[]>([]);
  const raf = useRef<number | null>(null);
  const clear = (): void => {
    timers.current.forEach((t) => clearTimeout(t));
    timers.current = [];
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = null;
    setHolding(false);
    setProgress(0);
  };
  useEffect(() => clear, []);
  const down = (): void => {
    clear();
    started.current = performance.now();
    timers.current.push(
      window.setTimeout(() => {
        setHolding(true);
        const tick = (now: number): void => {
          setProgress(Math.min(1, (now - (started.current ?? now) - tapMs) / (holdMs - tapMs)));
          raf.current = requestAnimationFrame(tick);
        };
        raf.current = requestAnimationFrame(tick);
      }, tapMs),
      window.setTimeout(() => {
        started.current = null;
        clear();
        onPowerReset();
      }, holdMs),
    );
  };
  const up = (): void => {
    const t0 = started.current;
    started.current = null;
    clear();
    if (t0 !== null && performance.now() - t0 < tapMs) onHelp();
  };
  const cancel = (): void => {
    started.current = null;
    clear();
  };
  const r = b.size / 2 + 10;
  return (
    <button
      data-testid="chef-help"
      aria-label="Head Chef help. Press and hold to reset the game."
      data-helping={helping ? 'true' : undefined}
      className={helping ? 'pulse' : undefined}
      onPointerDown={down}
      onPointerUp={up}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onHelp();
      }}
      style={{
        position: 'absolute',
        left: X(bx) - b.size / 2,
        top: Y(by) - b.size / 2,
        width: b.size,
        height: b.size,
        padding: 0,
        borderRadius: '50%',
        background: C.badge,
        border: `${LINE}px solid ${INK}`,
        overflow: 'visible',
        touchAction: 'none',
        zIndex: 30,
      }}
    >
      <span style={{ display: 'block', width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden' }}>
        <Art
          id="chef.helpFace"
          width={b.size}
          height={b.size}
          style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scale(1.5) translateY(7%)' }}
          fallback={<span style={{ fontSize: 64 }}>👨‍🍳</span>}
        />
      </span>
      {holding && (
        <svg
          data-testid="power-reset-ring"
          width={r * 2}
          height={r * 2}
          viewBox={`0 0 ${r * 2} ${r * 2}`}
          aria-hidden
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%,-50%) rotate(-90deg)',
            pointerEvents: 'none',
            overflow: 'visible',
          }}
        >
          <circle cx={r} cy={r} r={r - 6} fill="none" stroke="rgba(26,15,23,.25)" strokeWidth={10} />
          <circle
            cx={r}
            cy={r}
            r={r - 6}
            fill="none"
            stroke={C.post}
            strokeWidth={10}
            strokeLinecap="round"
            strokeDasharray={2 * Math.PI * (r - 6)}
            strokeDashoffset={2 * Math.PI * (r - 6) * (1 - progress)}
          />
        </svg>
      )}
    </button>
  );
}

/** A round control: the generated button sprite (circle + icon). */
function RoundButton({
  testId,
  label,
  art,
  at,
  disabled,
  onClick,
  fallback,
}: {
  testId: string;
  label: string;
  art: string;
  at: readonly [number, number, number]; // storyboard centre x, centre y, diameter
  disabled: boolean;
  onClick: () => void;
  fallback: string;
}): React.JSX.Element {
  const size = D(at[2]);
  return (
    <motion.button
      data-testid={testId}
      aria-label={label}
      disabled={disabled}
      whileTap={disabled ? undefined : { scale: 0.9 }}
      onClick={onClick}
      style={{
        position: 'absolute',
        left: X(at[0]) - size / 2,
        top: Y(at[1]) - size / 2,
        width: size,
        height: size,
        padding: 0,
        border: 'none',
        background: 'transparent',
        borderRadius: '50%',
        zIndex: 8,
      }}
    >
      <Art id={art} size={size} fallback={<span style={{ fontSize: size * 0.55 }}>{fallback}</span>} />
    </motion.button>
  );
}

/** The dish on the counter: bottom bun, built layers, and the top bun on a
 *  correct serve. Layers are side-view sprites stacked with overlap. */
function DishStack({
  state,
  dispatch,
  wrong,
  correct,
}: {
  state: GameState;
  dispatch: (e: GameEvent) => void;
  wrong: boolean;
  correct: boolean;
}): React.JSX.Element {
  const sb = KITCHEN_SB.dish;
  const d = { centreX: X(sb.centreX), base: Y(sb.base), width: D(sb.width), overlap: KITCHEN_EXTRA.dishOverlap, maxHeight: KITCHEN_EXTRA.dishMaxHeight };
  const order = currentOrder(state);
  const layers = [
    { key: 'bunBottom', art: 'dish.bunBottom', builtIndex: -1 },
    ...state.built.map((id, i) => ({ key: `${i}-${id}`, art: `item.${id}.dish`, builtIndex: i, id })),
    ...(correct ? [{ key: 'bunTop', art: 'dish.bunTop', builtIndex: -1 }] : []),
  ];
  const aspect = (art: string): number => artAspect(art) ?? 0.3;
  // Stack height at full width; shrink the whole dish if it would get too tall.
  const full = layers.reduce((sum, l, i) => sum + aspect(l.art) * d.width * (i === layers.length - 1 ? 1 : 1 - d.overlap), 0);
  const width = full > d.maxHeight ? (d.width * d.maxHeight) / full : d.width;
  const highlight = state.result?.highlight;
  let bottom = d.base;
  const placed = layers.map((l, i) => {
    const h = aspect(l.art) * width;
    const top = bottom - h;
    bottom -= h * (1 - d.overlap);
    return { ...l, top, h, z: i };
  });
  const floor = order ? order.prebuilt.length : 0;
  return (
    <div
      data-testid={wrong ? 'wrong-feedback' : 'dish'}
      style={{
        position: 'absolute',
        left: d.centreX - width / 2,
        top: 0,
        width,
        height: d.base,
        animation: wrong ? 'shakeX 0.4s ease-in-out 2' : undefined,
        pointerEvents: 'none',
        zIndex: 6,
      }}
    >
      {placed.map((l) => {
        const isWrong = wrong && highlight?.side === 'built' && highlight.index === l.builtIndex;
        const canUndo = l.builtIndex >= floor && l.builtIndex === state.built.length - 1 && state.phase === 'cooking';
        return (
          <motion.button
            key={l.key}
            data-built-item={l.builtIndex >= 0 ? (l as { id: string }).id : undefined}
            aria-label={l.builtIndex >= 0 ? `undo ${(l as { id: string }).id}` : 'bun'}
            disabled={!canUndo || state.helpPlaying}
            initial={l.builtIndex >= 0 || l.art === 'dish.bunTop' ? { y: -60, opacity: 0 } : false}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 24 }}
            onClick={() => {
              if (!canUndo) return;
              playSfx('pop');
              dispatch({ type: 'undo' });
            }}
            style={{
              position: 'absolute',
              left: 0,
              top: l.top,
              width,
              height: l.h,
              padding: 0,
              border: 'none',
              background: 'transparent',
              zIndex: l.z,
              pointerEvents: canUndo ? 'auto' : 'none',
              filter: isWrong ? `drop-shadow(0 0 5px ${C.wrong}) drop-shadow(0 0 5px ${C.wrong})` : undefined,
            }}
          >
            <Art
              id={l.art}
              width={width}
              height={l.h}
              fallback={
                <span
                  style={{
                    display: 'block',
                    width: '100%',
                    height: '100%',
                    borderRadius: 20,
                    background: '#d9a066',
                    border: `${LINE - 2}px solid ${INK}`,
                  }}
                />
              }
            />
          </motion.button>
        );
      })}
    </div>
  );
}

export function Kitchen({
  state,
  dispatch,
  testAttrs,
  onPowerReset,
}: {
  state: GameState;
  dispatch: (e: GameEvent) => void;
  testAttrs: Record<string, string | undefined>;
  onPowerReset: () => void;
}): React.JSX.Element {
  const order = currentOrder(state);
  const [helpStep, setHelpStep] = useState(-1);
  const helpRun = useRef(0);
  useEffect(
    () => () => {
      helpRun.current += 1;
    },
    [],
  );
  // Preload this monster's window poses so pose swaps never flash.
  const monsterId = order?.monster;
  useEffect(() => {
    if (!monsterId) return;
    preloadArt(['tap', 'happy', 'fidgety', 'grumpy', 'gobble', 'confused'].map((p) => `monster.${monsterId}.${p}`));
  }, [monsterId]);
  if (!order) return <></>;

  const fraction = state.patienceTotalMs > 0 ? state.patienceLeftMs / state.patienceTotalMs : 1;
  const resultKind = state.phase === 'serveResult' ? (state.result?.kind ?? null) : null;
  const pose = monsterPoseFor({ phase: state.phase, patienceFraction: fraction, resultKind, phaseMs: state.phaseMs });
  const ordering = state.phase === 'ordering';
  const wiping = state.phase === 'goWipe';
  const cooking = state.phase === 'cooking';
  const correct = resultKind === 'correct';
  const wrong = resultKind === 'wrong';
  const leaving = resultKind === 'timeout';
  const atSide = !ordering;

  // HELP: tap the Head Chef and the game stops (patience frozen, no
  // building) while he re-calls the order: each item's tile glows in
  // ticket order in sync with his voice (static bursts when the speaker is
  // broken). Unlimited; the core counts helps for the mastery model.
  const helpId = helpStep >= 0 ? order.ticket[helpStep] : undefined;
  const onHelp = async (): Promise<void> => {
    if (!cooking || state.helpPlaying) return;
    dispatch({ type: 'peek' });
    const run = ++helpRun.current;
    try {
      for (let i = 0; i < order.ticket.length; i++) {
        if (helpRun.current !== run) return;
        setHelpStep(i);
        if (isTestMode()) {
          await new Promise((r) => setTimeout(r, 30));
        } else if (order.broken === 'speaker') {
          playSfx('static');
          await new Promise((r) => setTimeout(r, 650));
        } else {
          await Promise.race([playKioskItem(order.ticket, i), new Promise((r) => setTimeout(r, 1400))]);
          await new Promise((r) => setTimeout(r, 120));
        }
      }
    } finally {
      if (helpRun.current === run) {
        setHelpStep(-1);
        dispatch({ type: 'helpEnd' });
      }
    }
  };

  // Bottom row: while ordering, the called items pop into tiles one by one
  // (the one being said glows); from cooking on, the tray to build from.
  const showTicket = ordering || wiping;
  const rowIds = showTicket ? order.ticket : order.tray;
  const t = KITCHEN_SB.tiles;
  const rowWidth = D(rowIds.length * t.pitch - (t.pitch - t.width));
  const highlight = state.result?.highlight;
  const missingId =
    wrong && highlight?.side === 'expected' ? order.expected[highlight.index] : undefined;
  const orderingIndex = ordering ? state.orderingShown - 1 : -1;
  const ms = KITCHEN_SB.monster;
  const m = { size: D(ms.size), top: Y(ms.top), orderX: X(ms.orderX), waitX: X(ms.waitX), rise: KITCHEN_EXTRA.rise };

  return (
    <div data-testid="kitchen" style={{ position: 'absolute', inset: 0 }}>
      <div data-testid="ticket" {...testAttrs} style={{ display: 'none' }} aria-hidden />
      <SceneBack />
      <motion.div
        key={`${state.tryCount}-${state.orderIndex}`}
        data-testid="window-monster"
        data-position={atSide ? 'side' : 'centre'}
        data-pose={pose}
        initial={{ y: m.rise, x: 0 }}
        animate={{
          y: 0,
          x: leaving ? m.waitX - m.orderX + 700 : atSide ? m.waitX - m.orderX : 0,
        }}
        transition={{
          y: { type: 'spring', stiffness: 140, damping: 18 },
          x: leaving ? { duration: 1, ease: 'easeIn' } : { type: 'spring', stiffness: 120, damping: 20 },
        }}
        style={{
          position: 'absolute',
          left: m.orderX - m.size / 2,
          top: m.top,
          width: m.size,
          height: m.size,
          zIndex: 1,
          pointerEvents: 'none',
        }}
      >
        <div className={correct && pose === 'happy' ? 'bob' : undefined} style={{ width: '100%', height: '100%' }}>
          <Art
            id={`monster.${order.monster}.${pose}`}
            width={m.size}
            height={m.size}
            fallback={<span style={{ fontSize: 300 }}>👾</span>}
          />
        </div>
      </motion.div>
      <WindowFrame />
      {order.broken === 'speaker' && <BrokenSpeaker />}
      <SceneFront />
      {!showTicket && <DishStack state={state} dispatch={dispatch} wrong={wrong} correct={correct} />}
      {correct && <NomBubble />}

      <div
        data-testid={showTicket ? 'sill-row' : 'tray'}
        data-ordering-count={ordering ? state.orderingShown : order.ticket.length}
        style={{
          position: 'absolute',
          left: 800 - rowWidth / 2,
          top: Y(t.top),
          width: rowWidth,
          height: D(t.height),
          display: 'flex',
          gap: D(t.pitch - t.width),
          zIndex: 7,
        }}
      >
        {rowIds.map((id, i) => {
          if (showTicket) {
            const shown = wiping || i < state.orderingShown;
            if (!shown) return <span key={`${i}-${id}`} style={{ width: D(t.width), flex: '0 0 auto' }} />;
            return (
              <Tile
                key={`${i}-${id}`}
                id={id}
                index={i}
                ring={i === orderingIndex ? 'glow' : null}
                disabled
                attrs={{
                  'data-sill-item': id,
                  'data-sill-index': i,
                  'data-ordering-active': i === orderingIndex ? 'true' : undefined,
                }}
              />
            );
          }
          const isHelp = id === helpId;
          return (
            <Tile
              key={id}
              id={id}
              index={i}
              ring={isHelp ? 'glow' : id === missingId ? 'wrong' : null}
              disabled={!cooking || state.helpPlaying}
              onTap={() => {
                playSfx('tap');
                dispatch({ type: 'addItem', item: id });
              }}
              attrs={{
                'data-tray-item': id,
                'data-base-item': id,
                'data-help-active': isHelp ? 'true' : undefined,
              }}
            />
          );
        })}
      </div>

      <ChefBadge helping={state.helpPlaying} onHelp={() => void onHelp()} onPowerReset={onPowerReset} />
      <RoundButton
        testId="undo"
        label="Undo"
        art="prop.undo"
        at={KITCHEN_SB.undo}
        disabled={!cooking || state.helpPlaying}
        onClick={() => {
          playSfx('pop');
          dispatch({ type: 'undo' });
        }}
        fallback="↩️"
      />
      <RoundButton
        testId="bell"
        label="Serve"
        art="prop.bell"
        at={KITCHEN_SB.bell}
        disabled={!cooking || state.helpPlaying}
        onClick={() => {
          playSfx('bell');
          dispatch({ type: 'serve' });
        }}
        fallback="🔔"
      />
      <RoundButton
        testId="trash"
        label="Clear dish"
        art="prop.trash"
        at={KITCHEN_SB.trash}
        disabled={!cooking || state.helpPlaying}
        onClick={() => dispatch({ type: 'trash' })}
        fallback="🗑️"
      />
      <StarRow lit={state.starsTry} total={bankedTarget(state.level)} />
      {wiping && <GoWipe />}
    </div>
  );
}
