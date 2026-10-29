import { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  life: number;
}
const COLORS = ['#ff595e', '#ffca3a', '#8ac926', '#1982c4', '#ff924c'];

/** ~100-line canvas confetti emitter. pointer-events: none, DPR capped at 2. */
export function Confetti({ active }: { active: boolean }): React.JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    if (!active) {
      const idle = canvas.getContext('2d');
      idle?.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = 1600 * dpr;
    canvas.height = 900 * dpr;
    const g = canvas.getContext('2d');
    if (!g) return;
    g.scale(dpr, dpr);
    const parts: Particle[] = Array.from({ length: 90 }, () => ({
      x: 300 + Math.random() * 500,
      y: 300,
      vx: (Math.random() - 0.5) * 9,
      vy: -6 - Math.random() * 7,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      size: 8 + Math.random() * 10,
      life: 70 + Math.random() * 30,
    }));
    let raf = 0;
    const frame = (): void => {
      g.clearRect(0, 0, 1600, 900);
      let alive = false;
      for (const p of parts) {
        if (p.life <= 0) continue;
        alive = true;
        p.vy += 0.28;
        p.x += p.vx;
        p.y += p.vy;
        p.life--;
        g.fillStyle = p.color;
        g.fillRect(p.x, p.y, p.size, p.size * 0.6);
      }
      if (alive) raf = requestAnimationFrame(frame);
      else g.clearRect(0, 0, 1600, 900);
    };
    frame();
    return () => {
      cancelAnimationFrame(raf);
      g.clearRect(0, 0, 1600, 900);
    };
  }, [active]);
  return (
    <canvas
      ref={ref}
      style={{ position: 'absolute', inset: 0, width: 1600, height: 900, pointerEvents: 'none', zIndex: 50 }}
      aria-hidden
    />
  );
}
