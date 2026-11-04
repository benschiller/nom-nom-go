import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'motion/react';

type Kind = 'star' | 'dot' | 'streamer';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  phase: number;
  kind: Kind;
  color: string;
  size: number;
  life: number;
  maxLife: number;
}

/** Game palette (wordmark + storyboard), never generic confetti colours. */
const PALETTE = ['#F86848', '#F8C030', '#10C458', '#FFD93D', '#2EC4B6', '#FFF3D6'];
const OUTLINE = '#1C1410';
const STAR_GOLD = '#FFD93D';
/** Dish centre on the 1600x900 stage (Kitchen dish slot). */
const DISH = { x: 557, y: 730 };

interface Burst {
  at: number;
  x: number;
  y: number;
  count: number;
  spread: number;
  power: number;
  /** Cannon direction: 1 fires rightward, -1 leftward. */
  dir?: 1 | -1;
  starsOnly?: boolean;
  rain?: boolean;
}

function burstsFor(variant: 'round' | 'level'): Burst[] {
  if (variant === 'level') {
    // Level win: gold-star rain across the top, nothing else.
    return [{ at: 0, x: 800, y: -30, count: 38, spread: 1500, power: 1, starsOnly: true, rain: true }];
  }
  // Round win: stars only, shot across at food height from both sides.
  return [
    { at: 0, x: 90, y: 620, count: 32, spread: 12, power: 16, dir: 1, starsOnly: true },
    { at: 0, x: 1510, y: 620, count: 32, spread: 12, power: 16, dir: -1, starsOnly: true },
  ];
}

function spawn(b: Burst): Particle[] {
  const out: Particle[] = [];
  for (let i = 0; i < b.count; i++) {
    const kind: Kind = b.starsOnly ? 'star' : Math.random() < 0.22 ? 'star' : Math.random() < 0.5 ? 'dot' : 'streamer';
    const life = b.rain ? 150 + Math.random() * 60 : 42 + Math.random() * 26;
    out.push({
      x: b.rain ? Math.random() * 1600 : b.x + (Math.random() - 0.5) * 60,
      y: b.y + (Math.random() - 0.5) * 24,
      vx: b.rain
        ? (Math.random() - 0.5) * 1.2
        : b.dir
          ? b.dir * (5 + Math.random() * b.spread)
          : (Math.random() - 0.5) * b.spread,
      vy: b.rain ? 1.2 + Math.random() * 1.8 : -(5 + Math.random() * b.power),
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.3,
      phase: Math.random() * Math.PI * 2,
      kind,
      color: kind === 'star' ? STAR_GOLD : PALETTE[Math.floor(Math.random() * PALETTE.length)],
      size: kind === 'star' ? 11 + Math.random() * 9 : 7 + Math.random() * 9,
      life,
      maxLife: life,
    });
  }
  return out;
}

function starPath(g: CanvasRenderingContext2D, r: number): void {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.48;
    const a = (i * Math.PI) / 5 - Math.PI / 2;
    if (i === 0) g.moveTo(Math.cos(a) * rad, Math.sin(a) * rad);
    else g.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
  }
  g.closePath();
}

function draw(g: CanvasRenderingContext2D, p: Particle, t: number): void {
  g.save();
  g.translate(p.x, p.y);
  g.rotate(p.rot);
  g.globalAlpha = Math.min(1, p.life / 16);
  g.fillStyle = p.color;
  g.strokeStyle = OUTLINE;
  g.lineWidth = Math.max(1.2, p.size * 0.16);
  if (p.kind === 'star') {
    starPath(g, p.size);
    g.fill();
    g.stroke();
  } else if (p.kind === 'dot') {
    g.beginPath();
    g.arc(0, 0, p.size * 0.55, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  } else {
    // Streamer: flips edge-on and back, like a ribbon.
    const flip = Math.max(0.18, Math.abs(Math.sin(t * 0.09 + p.phase)));
    g.scale(1, flip);
    const w = p.size * 1.7;
    const h = p.size * 0.66;
    g.beginPath();
    g.roundRect(-w / 2, -h / 2, w, h, h / 2);
    g.fill();
    g.stroke();
  }
  g.restore();
}

/**
 * Design-native confetti: outlined stars, dots and streamers in the game
 * palette. Round win = one fast pop from a cannon on each side, aimed at
 * the dish; level win = gold-star rain across the top. Reduced motion
 * gets one static frame.
 */
export function Confetti({
  active,
  variant = 'round',
  runKey,
  paused = false,
}: {
  active: boolean;
  variant?: 'round' | 'level';
  runKey: string;
  paused?: boolean;
}): React.JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null);
  const run = useRef({ key: '', started: false, cancelled: false });
  const reduced = useReducedMotion() ?? false;
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const g = canvas.getContext('2d');
    if (!g) return;
    if (run.current.key !== runKey) run.current = { key: runKey, started: false, cancelled: false };
    if (paused) run.current.cancelled = true;
    canvas.dataset.cancelled = String(run.current.cancelled);
    canvas.dataset.active = 'false';
    if (!active || run.current.cancelled) {
      g.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    // The same result cannot re-fire its cannons after pause/resume.
    if (run.current.started) return;
    run.current.started = true;
    canvas.dataset.active = 'true';
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = 1600 * dpr;
    canvas.height = 900 * dpr;
    g.scale(dpr, dpr);
    const bursts = burstsFor(variant);
    if (reduced) {
      // One still sprinkle, no loop: respects prefers-reduced-motion.
      const parts = bursts.flatMap((b) =>
        spawn({ ...b, count: Math.ceil(b.count / 3) }).map((p) => ({
          ...p,
          x: DISH.x + (Math.random() - 0.5) * 700,
          y: 300 + Math.random() * 380,
        })),
      );
      g.clearRect(0, 0, 1600, 900);
      for (const p of parts) draw(g, p, 20);
      return;
    }
    let parts: Particle[] = [];
    let frame = 0;
    let raf = 0;
    const step = (): void => {
      for (const b of bursts) if (b.at === frame) parts = parts.concat(spawn(b));
      frame++;
      g.clearRect(0, 0, 1600, 900);
      let alive = false;
      // Two physics sub-steps per frame: the whole show runs 2x faster.
      for (let s = 0; s < 2; s++) {
        for (const p of parts) {
          if (p.life <= 0) continue;
          p.life--;
          p.vy = Math.min(p.vy + 0.3, 8);
          p.vx *= 0.992;
          p.x += p.vx + Math.sin(frame * 0.12 + p.phase) * 0.7;
          p.y += p.vy;
          p.rot += p.vr;
        }
      }
      for (const p of parts) {
        if (p.life <= 0) continue;
        alive = true;
        draw(g, p, frame * 2);
      }
      const pending = bursts.some((b) => b.at >= frame);
      if (alive || pending) raf = requestAnimationFrame(step);
      else {
        canvas.dataset.active = 'false';
        g.clearRect(0, 0, 1600, 900);
      }
    };
    step();
    return () => {
      cancelAnimationFrame(raf);
      g.clearRect(0, 0, 1600, 900);
    };
  }, [active, variant, reduced, runKey, paused]);
  return (
    <canvas
      ref={ref}
      data-testid="celebration-confetti"
      data-variant={variant}
      data-run-key={runKey}
      style={{ position: 'absolute', inset: 0, width: 1600, height: 900, pointerEvents: 'none', zIndex: 50 }}
      aria-hidden
    />
  );
}
