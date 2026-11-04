import { useEffect, useRef, useState } from 'react';
import { easeInOut, motion, useReducedMotion, useTime, useTransform } from 'motion/react';
import { MONSTERS } from './content/content';
import { bankedTarget } from './core/difficulty';
import { currentOrder, TOUR_STEPS } from './core/game';
import { defaultSave } from './core/save';
import {
  playGibberish,
  playClipById,
  playKioskItem,
  playSfx,
  setSoundOn,
  startBackgroundLoop,
  unlockAudio,
  ensureAudioOnVisible,
} from './audio/audio';
import { isTestMode, testSpeed, useGame } from './ui/store';
import { Emoji } from './ui/ItemIcon';
import { Art, Backdrop, preloadArt } from './ui/Art';
import { Kitchen, Star } from './ui/Kitchen';
import { ParentArea } from './ui/ParentArea';
import { Confetti } from './ui/Confetti';
import { DadRoute } from './net/DadViews';
import { AppSyncTransport, LocalTransport, type Transport } from './net/transport';
import { toMirror } from './core/mirror';

const CALL_CORNER = { left: 1280, top: 0, width: 320, height: 360 };

function useStageScale(): number {
  const [scale, setScale] = useState(() => Math.min(window.innerWidth / 1600, window.innerHeight / 900));
  useEffect(() => {
    const on = (): void => setScale(Math.min(window.innerWidth / 1600, window.innerHeight / 900));
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return scale;
}

function usePortrait(): boolean {
  const [p, setP] = useState(window.innerHeight > window.innerWidth);
  useEffect(() => {
    const on = (): void => setP(window.innerHeight > window.innerWidth);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return p;
}

const BTN: React.CSSProperties = {
  border: '4px solid rgba(90,50,20,.4)',
  borderRadius: 28,
  background: '#ffd93d',
  minWidth: 140,
  minHeight: 140,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

/**
 * TITLE SCREEN LAYOUT — edit these numbers to move or resize pieces.
 * Units: the game's 1600x900 stage (0,0 = top-left of the 16:9 safe area).
 * left/top = top-left corner, width/height = size. Bigger left = further right,
 * bigger top = further down. The dev server updates on save.
 */
const TITLE_LAYOUT = {
  chef: { left: 581.5, top: 301.7, width: 337.7, height: 277.0 }, // in the truck window; bottom edge = counter line
  og: { left: 82.5, top: 351.7, width: 377.5, height: 499.2 }, // purple monster, left
  gobbler: { left: 1173.5, top: 438.3, width: 374.2, height: 434.2 }, // orange monster, right
  goButton: { left: 675.1, top: 642.8, width: 256.4, height: 247.2 },
  logo: { left: 175.8, top: 9.2, width: 1160.0, height: 168.3 },
  parentButton: { left: 24, bottom: 24, size: 116 },
} as const;

type Box = { left: number; top: number; width: number; height: number };

/** A title piece drawn in its TITLE_LAYOUT box. Standing characters sit on the box
 *  bottom. `clip` fills the box width from the top and hides anything below the box
 *  bottom (the chef behind the window counter). */
function TitleArt({
  id,
  box,
  className,
  clip = false,
}: {
  id: string;
  box: Box;
  className?: string;
  clip?: boolean;
}): React.JSX.Element {
  if (clip) {
    return (
      <div style={{ position: 'absolute', ...box, overflow: 'hidden', pointerEvents: 'none' }}>
        <Art
          id={id}
          className={className}
          width={box.width}
          height={box.height}
          style={{ objectFit: 'cover', objectPosition: '50% 0%' }}
        />
      </div>
    );
  }
  return (
    <Art
      id={id}
      className={className}
      width={box.width}
      height={box.height}
      style={{ position: 'absolute', ...box, objectPosition: '50% 100%', pointerEvents: 'none' }}
    />
  );
}

/**
 * LEVEL TRANSITION LAYOUT (level complete) — storyboard:
 * approved/level-transition-master.png. Same truck, chef and Go button as the
 * title (TITLE_LAYOUT boxes, approved title art); the stars replace the logo
 * and are native SVG. Stage units as TITLE_LAYOUT.
 */
const LEVEL_LAYOUT = {
  stars: { centreX: 770, top: 18, maxSize: 132, maxWidth: 860, gap: 26 }, // above the truck roof (roof top ~188)
} as const;

function LevelTransition({ stars, onContinue }: { stars: number; onContinue: () => void }): React.JSX.Element {
  const s = LEVEL_LAYOUT.stars;
  const size = Math.min(s.maxSize, (s.maxWidth - s.gap * (stars - 1)) / stars);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (reduce) return undefined;
    const timers = Array.from({ length: stars }, (_, i) => window.setTimeout(() => playSfx('pop'), 350 + i * 260));
    return () => timers.forEach((t) => clearTimeout(t));
  }, [stars, reduce]);
  return (
    <div data-testid="level-transition" style={{ position: 'absolute', inset: 0 }}>
      <Backdrop id="env.title" />
      <TitleArt id="chef.windowWave" box={TITLE_LAYOUT.chef} clip />
      <div
        data-testid="result-stars"
        style={{
          position: 'absolute',
          left: s.centreX - (stars * size + (stars - 1) * s.gap) / 2,
          top: s.top + (s.maxSize - size) / 2,
          display: 'flex',
          gap: s.gap,
        }}
      >
        {Array.from({ length: stars }, (_, i) => (
          <motion.div
            key={i}
            initial={reduce ? false : { scale: 0, rotate: -40 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 14, delay: 0.35 + i * 0.26 }}
          >
            <Star lit size={size} />
          </motion.div>
        ))}
      </div>
      <motion.button
        data-testid="continue-button"
        aria-label="Next level"
        whileTap={{ scale: 0.92 }}
        style={{
          position: 'absolute',
          ...TITLE_LAYOUT.goButton,
          padding: 0,
          border: 'none',
          background: 'transparent',
          borderRadius: '50%',
        }}
        onClick={onContinue}
      >
        <Art
          id="ui.goButton"
          className="pulse"
          width={TITLE_LAYOUT.goButton.width}
          height={TITLE_LAYOUT.goButton.height}
          fallback={<span style={{ fontSize: 160 }}>▶</span>}
        />
      </motion.button>
    </div>
  );
}

/** Title logo as native text (crisp at any DPR, nothing to cut out): Fredoka Bold,
 *  storyboard word colours and outline, auto-fitted to the storyboard's logo box.
 *  Each letter bobs a little, staggered, so a wave runs through the word. */
const WORDMARK_BOX = TITLE_LAYOUT.logo;
const WORDMARK_WORDS: [string, string][] = [
  ['Nom', '#F86848'],
  ['Nom', '#F8C030'],
  ['Go!', '#10C458'],
];
function Wordmark(): React.JSX.Element {
  const row = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(1);
  useEffect(() => {
    // Fit the natural text width to the box once the logo font has loaded.
    const measure = (): void => {
      if (row.current) setFit(Math.min(1.4, (WORDMARK_BOX.width - 20) / row.current.scrollWidth));
    };
    measure();
    void document.fonts.ready.then(measure);
  }, []);
  let n = 0;
  return (
    <div
      role="img"
      aria-label="Nom Nom Go!"
      data-testid="wordmark"
      style={{
        position: 'absolute',
        ...WORDMARK_BOX,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
      }}
    >
      <div
        ref={row}
        aria-hidden
        style={{
          display: 'flex',
          gap: 34,
          whiteSpace: 'nowrap',
          transform: `scale(${fit * 0.92}, ${fit})`,
          fontFamily: 'Fredoka, system-ui, sans-serif',
          fontWeight: 700,
          fontSize: 150,
          lineHeight: 1,
          WebkitTextStroke: '13px #331230',
          paintOrder: 'stroke fill',
        }}
      >
        {WORDMARK_WORDS.map(([word, color], w) => (
          <span key={w} style={{ display: 'flex', color }}>
            {[...word].map((ch, i) => (
              <span key={i} className="wave-letter" style={{ animationDelay: `${(n++ * 0.09).toFixed(2)}s` }}>
                {ch}
              </span>
            ))}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function App(): React.JSX.Element {
  const hash = window.location.hash;
  if (hash.startsWith('#dad') || hash.startsWith('#watch') || hash.startsWith('#pair')) {
    return <DadRoute hash={hash} />;
  }
  return <GameShell />;
}

/**
 * TUTORIAL LAYOUT (pre-Level-1 tour, 3 steps) — edit these numbers to move or
 * resize pieces. Storyboards: approved/tutorial-01/02/03.png, fitted to the
 * stage height and centred. Stage units as TITLE_LAYOUT. Tiles, progress dots
 * and the golden arrow are native CSS/SVG; everything else is production art.
 */
const TUTORIAL_LAYOUT = {
  pips: { top: 40, size: 78, gap: 22 }, // centred
  goButton: { left: 688, top: 652, width: 224, height: 224 }, // same spot on every step
  tile: { border: 10, radius: 34, inset: 0.07 }, // inset = icon padding as a fraction of the tile
  step1: {
    lettuce: { left: 292, top: 254, width: 334, height: 318 },
    tomato: { left: 658, top: 254, width: 322, height: 318 },
    gobbler: { left: 915, top: 321, width: 427, height: 472 }, // pointing at the tomato
  },
  step2: {
    lettuce: { left: 347, top: 290, width: 243, height: 239 },
    tomato: { left: 675, top: 290, width: 239, height: 239 },
    patty: { left: 998, top: 290, width: 243, height: 239 },
    glove: { left: 326, top: 205, width: 143, height: 141 }, // fingertip on the lettuce
    carry: { left: 385, top: 300, width: 150, height: 150 }, // the lettuce the glove drags
    arrow: { left: 352, top: 552, height: 88, shortWidth: 250, fullWidth: 800 }, // grows to under the patty
  },
  step3: {
    burger: { left: 341, top: 194, width: 415, height: 468 },
    bell: { left: 952, top: 316, width: 283, height: 274 },
  },
} as const;

/** First play shows the tour; `?tour=1` forces it (also in test mode, for e2e and screen QA). */
const wantsTour = (seen: readonly string[]): boolean =>
  new URLSearchParams(window.location.search).get('tour') === '1' || (!isTestMode() && !seen.includes('tour'));
/** Step 2's drag loop (seconds) and its keyframe times: rest, drag, hold, fade. */
const DRAG_LOOP = 2.6;
const DRAG_TIMES = [0, 0.15, 0.65, 0.85, 1];

/** A beige rounded tile (native CSS) holding one tutorial icon. */
function TourTile({ box, children }: { box: Box; children?: React.ReactNode }): React.JSX.Element {
  const t = TUTORIAL_LAYOUT.tile;
  const pad = Math.round(box.width * t.inset);
  return (
    <div
      style={{
        position: 'absolute',
        ...box,
        boxSizing: 'border-box',
        background: '#ecc797',
        border: `${t.border}px solid #1c1410`,
        borderRadius: t.radius,
        padding: pad,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
    </div>
  );
}

/** An icon that pops into its tile. */
function PopIn({ id, emoji, still }: { id: string; emoji: string; still: boolean }): React.JSX.Element {
  return (
    <motion.div
      initial={still ? false : { scale: 0, rotate: -12 }}
      animate={{ scale: 1, rotate: 0 }}
      transition={{ type: 'spring', stiffness: 420, damping: 16 }}
      style={{ width: '100%', height: '100%' }}
    >
      <Art id={id} width="100%" height="100%" fallback={<Emoji size={140}>{emoji}</Emoji>} />
    </motion.div>
  );
}

/** Native golden arrow: one outlined path whose shaft stretches, so the head never distorts. */
function arrowPath(len: number, h: number): string {
  const head = h * 0.85;
  const s0 = h * 0.3;
  const s1 = h * 0.7;
  const pad = 6;
  const neck = len - head;
  return `M${pad},${s0} L${neck},${s0} L${neck},${pad} L${len - pad},${h / 2} L${neck},${h - pad} L${neck},${s1} L${pad},${s1} Z`;
}

/** Step 2 on repeat: the glove picks up the lettuce and drags it to the patty
 *  while the golden arrow stretches the same way. One clock drives both, so
 *  they never drift apart. Reduced motion: the glove on the lettuce, arrow full. */
function TourDragLoop({ still }: { still: boolean }): React.JSX.Element {
  const l = TUTORIAL_LAYOUT.step2;
  const a = l.arrow;
  const dx = l.patty.left - l.lettuce.left;
  const ease = [easeInOut, easeInOut, easeInOut, easeInOut];
  const time = useTime();
  const phase = useTransform(time, (t) => (still ? DRAG_TIMES[1] : ((t / 1000) % DRAG_LOOP) / DRAG_LOOP));
  const x = useTransform(phase, DRAG_TIMES, [0, 0, dx, dx, dx], { ease });
  const lift = useTransform(phase, DRAG_TIMES, [1, 1.12, 1.12, 1, 1]);
  const fade = useTransform(phase, DRAG_TIMES, still ? [1, 1, 1, 1, 1] : [0, 1, 1, 1, 0]);
  const arrowFade = useTransform(phase, DRAG_TIMES, still ? [1, 1, 1, 1, 1] : [1, 1, 1, 1, 0]);
  const len = useTransform(
    phase,
    DRAG_TIMES,
    still ? Array(5).fill(a.fullWidth) : [a.shortWidth, a.shortWidth, a.fullWidth, a.fullWidth, a.fullWidth],
    { ease },
  );
  const d = useTransform(len, (v) => arrowPath(v, a.height));
  return (
    <>
      <svg
        data-testid="tour-arrow"
        aria-hidden
        width={a.fullWidth}
        height={a.height}
        style={{ position: 'absolute', left: a.left, top: a.top, overflow: 'visible', pointerEvents: 'none' }}
      >
        <motion.path
          d={d}
          style={{ opacity: arrowFade }}
          fill="#f6c445"
          stroke="#1c1410"
          strokeWidth={9}
          strokeLinejoin="round"
        />
      </svg>
      <motion.div
        data-testid="tour-drag"
        aria-hidden
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none', x, opacity: fade }}
      >
        <motion.div style={{ position: 'absolute', ...l.carry, scale: lift }}>
          <Art id="tut.lettuce" width={l.carry.width} height={l.carry.height} fallback={<Emoji size={120}>🥬</Emoji>} />
        </motion.div>
        <Art
          id="tut.glove"
          width={l.glove.width}
          height={l.glove.height}
          style={{ position: 'absolute', ...l.glove }}
          fallback={<span style={{ position: 'absolute', ...l.glove, fontSize: 110 }}>👆</span>}
        />
      </motion.div>
    </>
  );
}

/** Step 1: the order appears item by item, each said aloud like a real order. */
function TourOrder({ still, soundOn }: { still: boolean; soundOn: boolean }): React.JSX.Element {
  const l = TUTORIAL_LAYOUT.step1;
  const [shown, setShown] = useState(still ? 2 : 0);
  useEffect(() => {
    const items = ['lettuce', 'tomato'];
    const pitch = MONSTERS.find((m) => m.id === 'gobbler')?.pitch ?? 1;
    let chain = Promise.resolve();
    const timers = items.map((item, i) =>
      window.setTimeout(
        () => {
          setShown(i + 1);
          playSfx('pop');
          if (isTestMode() || !soundOn) return;
          chain = chain.then(async () => {
            playGibberish(pitch);
            await new Promise((r) => setTimeout(r, 160));
            await playClipById(`ing.${item}`);
          });
        },
        isTestMode() ? 50 + i * 50 : 700 + i * 1300,
      ),
    );
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div data-testid="tour-order" data-shown={shown}>
      <TourTile box={l.lettuce}>{shown >= 1 && <PopIn id="tut.lettuce" emoji="🥬" still={still} />}</TourTile>
      <TourTile box={l.tomato}>{shown >= 2 && <PopIn id="tut.tomato" emoji="🍅" still={still} />}</TourTile>
      <TitleArt id="monster.gobbler.point" box={l.gobbler} className="sway" />
    </div>
  );
}

function TourStep({ step, soundOn }: { step: number; soundOn: boolean }): React.JSX.Element {
  const still = useReducedMotion() ?? false;
  if (step === 0) return <TourOrder still={still} soundOn={soundOn} />;
  if (step === 1) {
    const l = TUTORIAL_LAYOUT.step2;
    return (
      <div data-testid="tour-build">
        <TourTile box={l.lettuce}>
          <Art id="tut.lettuce" width="100%" height="100%" fallback={<Emoji size={120}>🥬</Emoji>} />
        </TourTile>
        <TourTile box={l.tomato}>
          <Art id="tut.tomato" width="100%" height="100%" fallback={<Emoji size={120}>🍅</Emoji>} />
        </TourTile>
        <TourTile box={l.patty}>
          <Art id="tut.patty" width="100%" height="100%" fallback={<Emoji size={120}>🍔</Emoji>} />
        </TourTile>
        <TourDragLoop still={still} />
      </div>
    );
  }
  return <TourBell still={still} />;
}

/** Step 3: the finished burger and the bell button that shimmies and tinkles. */
function TourBell({ still }: { still: boolean }): React.JSX.Element {
  const l = TUTORIAL_LAYOUT.step3;
  useEffect(() => {
    // Reduced motion: no shimmy (so no animation events), one tinkle on arrival.
    if (still) playSfx('tinkle');
  }, [still]);
  return (
    <div data-testid="tour-bell">
      <motion.div
        initial={still ? false : { scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 18 }}
        style={{ position: 'absolute', ...l.burger }}
      >
        <Art id="tut.burger" width={l.burger.width} height={l.burger.height} fallback={<Emoji size={300}>🍔</Emoji>} />
      </motion.div>
      {/* Each shimmy of the bell tinkles; the sound rides the CSS animation's own events. */}
      <div
        className="ring"
        style={{ position: 'absolute', ...l.bell }}
        onAnimationStart={() => playSfx('tinkle')}
        onAnimationIteration={() => playSfx('tinkle')}
      >
        <Art
          id="tut.bell"
          width={l.bell.width}
          height={l.bell.height}
          fallback={<span style={{ fontSize: 200 }}>🛎️</span>}
        />
      </div>
    </div>
  );
}

/** Pre-Level-1 tour: 1 the order appears, 2 drag to build, 3 ring the bell.
 *  The Go button is the only control. */
function Tour({ step, soundOn, onNext }: { step: number; soundOn: boolean; onNext: () => void }): React.JSX.Element {
  const last = step === TOUR_STEPS - 1;
  const p = TUTORIAL_LAYOUT.pips;
  return (
    <div
      data-testid="tour"
      data-step={step}
      data-tutorial="true"
      style={{ position: 'absolute', inset: 0, zIndex: 50, background: '#f7e8cc' }}
    >
      <Backdrop id="env.tutorial" />
      <div
        data-testid="tour-pips"
        aria-hidden
        style={{
          position: 'absolute',
          top: p.top,
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'center',
          gap: p.gap,
        }}
      >
        {Array.from({ length: TOUR_STEPS }, (_, i) => (
          <span
            key={i}
            data-lit={i <= step}
            style={{
              width: p.size,
              height: p.size,
              boxSizing: 'border-box',
              borderRadius: '50%',
              border: '8px solid #1c1410',
              background: i <= step ? '#f6c445' : 'transparent',
            }}
          />
        ))}
      </div>
      <TourStep key={step} step={step} soundOn={soundOn} />
      <motion.button
        data-testid="tour-next"
        aria-label={last ? 'Start playing' : 'Next'}
        whileTap={{ scale: 0.92 }}
        style={{
          position: 'absolute',
          ...TUTORIAL_LAYOUT.goButton,
          padding: 0,
          border: 'none',
          background: 'transparent',
          borderRadius: '50%',
        }}
        onClick={onNext}
      >
        <Art
          id="ui.goButton"
          className="pulse"
          width={TUTORIAL_LAYOUT.goButton.width}
          height={TUTORIAL_LAYOUT.goButton.height}
          fallback={<span style={{ fontSize: 160 }}>▶</span>}
        />
      </motion.button>
    </div>
  );
}

/** Circular hold-to-activate button with a sweeping progress ring. */
function HoldButton({
  testId,
  label,
  icon,
  onComplete,
  style,
}: {
  testId: string;
  label: string;
  icon: React.ReactNode;
  onComplete: () => void;
  style: React.CSSProperties;
}): React.JSX.Element {
  const [progress, setProgress] = useState(0);
  // The ring shows from the moment of the press, not from the first frame:
  // instant feedback for the finger, and always drawn before completion.
  const [holding, setHolding] = useState(false);
  const timer = useRef<number | null>(null);
  const raf = useRef<number | null>(null);
  const cancel = (): void => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (raf.current) {
      cancelAnimationFrame(raf.current);
      raf.current = null;
    }
    setProgress(0);
    setHolding(false);
  };
  const start = (): void => {
    cancel();
    setHolding(true);
    const duration = isTestMode() ? 300 : 3000;
    const started = performance.now();
    timer.current = window.setTimeout(() => {
      if (raf.current) cancelAnimationFrame(raf.current);
      raf.current = null;
      timer.current = null;
      setProgress(0);
      setHolding(false);
      onComplete();
    }, duration);
    const tick = (now: number): void => {
      setProgress(Math.min(1, (now - started) / duration));
      if (now - started < duration) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  };
  useEffect(() => cancel, []);
  return (
    <button
      data-testid={testId}
      aria-label={label}
      style={{
        width: 140,
        height: 140,
        borderRadius: '50%',
        fontSize: 64,
        border: '4px solid rgba(90,50,20,.3)',
        overflow: 'visible',
        ...style,
      }}
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={(e) => e.preventDefault()}
    >
      {holding && (
        <svg
          data-testid={`${testId}-ring`}
          width="148"
          height="148"
          viewBox="0 0 148 148"
          aria-hidden
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%,-50%) rotate(-90deg)',
            pointerEvents: 'none',
          }}
        >
          <circle cx="74" cy="74" r="68" fill="none" stroke="rgba(90,50,20,.18)" strokeWidth="8" />
          <circle
            cx="74"
            cy="74"
            r="68"
            fill="none"
            stroke="#d35400"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 68}
            strokeDashoffset={2 * Math.PI * 68 * (1 - progress)}
          />
        </svg>
      )}
      <span style={{ position: 'relative' }}>{icon}</span>
    </button>
  );
}

function GameShell(): React.JSX.Element {
  const { state, dispatch, store } = useGame();
  const scale = useStageScale();
  const portrait = usePortrait();
  const [parentOpen, setParentOpen] = useState(false);
  const [cheer, setCheer] = useState<string | null>(null);
  const [glove, setGlove] = useState<{ x: number; y: number } | null>(null);
  const transportRef = useRef<Transport | null>(null);
  const seqRef = useRef(0);
  const voiceChain = useRef<Promise<void>>(Promise.resolve());
  const spoken = useRef<{ key: string; count: number }>({ key: '', count: 0 });

  /** Complete reset: fresh save (pairing and sound retained), then reload. */
  const resetCompletely = (): void => {
    const save = store.getSave();
    dispatch({ type: 'powerReset' });
    store.setSave({
      ...defaultSave(),
      kitchenId: save.kitchenId,
      dadKitchenId: save.dadKitchenId,
      soundOn: save.soundOn,
    });
    window.location.reload();
  };

  const leaveTitle = (): void => {
    unlockAudio();
    const tour = wantsTour(store.getSave().tutorialsSeen);
    if (!tour) startBackgroundLoop(() => (state.streak ? 260 : 380));
    dispatch({ type: 'go', tour });
  };

  const nextTourStep = (): void => {
    unlockAudio();
    if (state.tourStep >= TOUR_STEPS - 1) startBackgroundLoop(() => (state.streak ? 260 : 380));
    dispatch({ type: 'tourNext' });
  };

  // Tick loop. Test mode fast-forwards only the wait for the monster (the
  // ordering call-out and the Go! wipe). The player's turn and the result
  // feedback always tick in real time: patience is the same for a test as
  // for a child, and results stay on screen long enough to be checked.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number): void => {
      const dt = Math.min(100, now - last);
      last = now;
      const phase = store.getState().phase;
      const speed = phase === 'ordering' || phase === 'goWipe' ? testSpeed() : 1;
      dispatch({ type: 'tick', ms: Math.round(dt * speed) });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [dispatch, store]);

  // Auto-pause + AudioContext recovery on visibility.
  useEffect(() => {
    const onVis = (): void => {
      if (document.hidden) dispatch({ type: 'pause' });
      else ensureAudioOnVisible();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [dispatch]);

  useEffect(() => {
    setSoundOn(store.getSave().soundOn);
  }, [store]);

  // Preload the next screens' plates so transitions do not flash placeholders.
  useEffect(() => {
    preloadArt(['prop.undo', 'prop.bell', 'prop.trash', 'chef.helpFace', 'dish.bunBottom', 'env.night.closed']);
  }, []);

  // Phase sound effects.
  const order = currentOrder(state);
  // At the kitchen window the monster orders in gibberish, one item at a
  // time, and the Head Chef repeats each item in Dad's voice as it joins
  // the sill row. Clips queue on one chain so they never overlap. A
  // broken speaker turns the Head Chef repeat into a burst of static;
  // the monster gibberish and the highlights still run.
  useEffect(() => {
    if (state.phase !== 'ordering' || !order) return;
    const key = `${state.level}-${state.orderIndex}-${state.tryCount}-${state.attemptsThisOrder}`;
    if (spoken.current.key !== key) {
      spoken.current = { key, count: 0 };
      voiceChain.current = Promise.resolve();
    }
    playSfx('pop');
    while (spoken.current.count < state.orderingShown) {
      const index = spoken.current.count;
      spoken.current.count++;
      if (isTestMode() || !store.getSave().soundOn) continue;
      const monster = MONSTERS.find((m) => m.id === order.monster);
      const ticket = order.ticket;
      voiceChain.current = voiceChain.current.then(async () => {
        playGibberish(monster?.pitch ?? 1);
        await new Promise((r) => setTimeout(r, 160));
        if (order.broken === 'speaker') playSfx('static');
        else await playKioskItem(ticket, index);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.orderingShown, state.phase]);

  useEffect(() => {
    if (state.phase === 'serveResult' && state.result?.kind === 'correct') playSfx('nom');
    if (state.phase === 'serveResult' && state.result?.kind === 'wrong') playSfx('oops');
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase]);

  // Dad's Window (child side): snapshots out, glove/cheers/presence in.
  useEffect(() => {
    const kitchenId = store.getSave().kitchenId;
    if (!kitchenId) return;
    const transport: Transport = isTestMode()
      ? new LocalTransport(kitchenId)
      : new AppSyncTransport(kitchenId, 'child');
    transportRef.current = transport;
    const beat = window.setInterval(() => transport.publish({ type: 'beat', role: 'child' }), 5000);
    transport.publish({ type: 'beat', role: 'child' });
    const unsub = transport.subscribe((msg) => {
      if (msg.type === 'hello') {
        seqRef.current += 1;
        transport.publish({ type: 'snapshot', seq: seqRef.current, view: toMirror(store.getState()) });
      }
      if (msg.type === 'glove' && typeof msg.x === 'number' && typeof msg.y === 'number') {
        setGlove({ x: Math.min(msg.x, 0.77), y: msg.y < 0.4 && msg.x > 0.8 ? 0.42 : msg.y });
      }
      if (msg.type === 'cheer' && typeof msg.cheer === 'string') {
        setCheer(msg.cheer);
        playSfx('confetti');
        window.setTimeout(() => setCheer(null), 1600);
      }
    });
    return () => {
      unsub();
      transport.close();
      clearInterval(beat);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store]);

  // Publish a snapshot on every meaningful state change.
  const mirrorKey = `${state.phase}|${state.orderIndex}|${state.built.join(',')}|${state.starsTry}|${state.patienceLeftMs >> 8}`;
  useEffect(() => {
    const transport = transportRef.current;
    if (!transport) return;
    seqRef.current += 1;
    transport.publish({ type: 'snapshot', seq: seqRef.current, view: toMirror(state) });
    for (const kind of state.pendingEvents) transport.publish({ type: 'event', kind });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mirrorKey]);

  const debugCorner = new URLSearchParams(window.location.search).get('debug') === 'corner';
  const testAttrs = isTestMode() && order ? { 'data-expected': order.ticket.join(' ') } : {};

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        overflow: 'hidden',
        background: 'linear-gradient(#87ceeb 55%, #f7d08a 55%)',
      }}
    >
      <div
        data-testid="stage"
        data-phase={state.phase}
        data-level={state.level}
        style={{
          width: 1600,
          height: 900,
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: `translate(-50%,-50%) scale(${scale})`,
          transformOrigin: 'center',
        }}
      >
        {debugCorner && (
          <div
            style={{
              position: 'absolute',
              ...CALL_CORNER,
              border: '6px dashed red',
              zIndex: 99,
              pointerEvents: 'none',
            }}
          />
        )}

        {state.phase === 'title' && (
          <div data-testid="title-screen" style={{ position: 'absolute', inset: 0 }}>
            {/* Storyboard: approved/title-intro-master.png. Each piece is generated
                separately and placed in its storyboard box over the bleed plate. */}
            <Backdrop id="env.title" />
            <TitleArt id="chef.windowWave" box={TITLE_LAYOUT.chef} clip />
            <TitleArt id="monster.og.wave" box={TITLE_LAYOUT.og} className="sway" />
            <TitleArt id="monster.gobbler.wave" box={TITLE_LAYOUT.gobbler} className="sway sway-late" />
            <Wordmark />
            <motion.button
              data-testid="go-button"
              aria-label="Go"
              whileTap={{ scale: 0.92 }}
              style={{
                position: 'absolute',
                ...TITLE_LAYOUT.goButton,
                padding: 0,
                border: 'none',
                background: 'transparent',
                borderRadius: '50%',
              }}
              onClick={leaveTitle}
            >
              {/* Pulse the image, not the button: a steady hit box for small fingers
                  (and for Playwright's stability check). */}
              <Art
                id="ui.goButton"
                className="pulse"
                width={TITLE_LAYOUT.goButton.width}
                height={TITLE_LAYOUT.goButton.height}
                fallback={<span style={{ fontSize: 160 }}>▶</span>}
              />
            </motion.button>
            <HoldButton
              testId="parent-gate"
              label="Parent area — press and hold"
              icon={
                // Sticker badge: the chef's face fills the circle (shoulders cropped by it).
                <span
                  style={{
                    width: TITLE_LAYOUT.parentButton.size - 12,
                    height: TITLE_LAYOUT.parentButton.size - 12,
                    borderRadius: '50%',
                    overflow: 'hidden',
                    display: 'block',
                  }}
                >
                  <Art
                    id="chef.helpFace"
                    width={104}
                    height={104}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      transform: 'scale(1.5) translateY(7%)',
                    }}
                    fallback={<span>👨‍🍳</span>}
                  />
                </span>
              }
              onComplete={() => setParentOpen(true)}
              style={{
                position: 'absolute',
                left: TITLE_LAYOUT.parentButton.left,
                bottom: TITLE_LAYOUT.parentButton.bottom,
                width: TITLE_LAYOUT.parentButton.size,
                height: TITLE_LAYOUT.parentButton.size,
                padding: 0,
                background: '#DA7C30', // orange fill from approved/order-at-window-1-centred-ordering.png
                border: '6px solid #331230',
              }}
            />
          </div>
        )}

        {(state.phase === 'ordering' ||
          state.phase === 'goWipe' ||
          state.phase === 'cooking' ||
          state.phase === 'serveResult') &&
          order && <Kitchen state={state} dispatch={dispatch} testAttrs={testAttrs} onPowerReset={resetCompletely} />}

        {state.phase === 'levelResult' && (
          <LevelTransition
            stars={bankedTarget(state.level)}
            onContinue={() => {
              unlockAudio();
              playSfx('ding');
              dispatch({ type: 'continue' });
            }}
          />
        )}

        {state.phase === 'bossEnding' && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(20,20,60,.55)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Art
              id="env.night.goodbye"
              width={1600}
              height={900}
              style={{ position: 'absolute', inset: 0, objectFit: 'cover' }}
            />
            <div className="bob" style={{ position: 'relative' }}>
              <Art id="chef.goodbye" height={200} fallback={<span style={{ fontSize: 170 }}>👨‍🍳👋</span>} />
            </div>
          </div>
        )}

        {state.phase === 'closed' && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: '#232946',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 26,
            }}
          >
            <Art
              id="env.night.closed"
              width={1600}
              height={900}
              style={{ position: 'absolute', inset: 0, objectFit: 'cover' }}
            />
            <button
              data-testid="power-off"
              aria-label="Power off"
              style={{ ...BTN, width: 170, height: 170, borderRadius: '50%', fontSize: 76, position: 'relative' }}
              onClick={() => dispatch({ type: 'powerOff' })}
            >
              <Art id="ui.powerOff" size={76} fallback={<span>⏻</span>} />
            </button>
          </div>
        )}

        {state.phase === 'poweredOff' && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: '#0b0b14',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <button
              data-testid="power-on"
              aria-label="Power on"
              className="hint-glow"
              style={{
                width: 190,
                height: 190,
                borderRadius: '50%',
                fontSize: 88,
                background: '#1d2b53',
                color: '#ffd93d',
                border: '4px solid #ffd93d',
              }}
              onClick={() => {
                unlockAudio();
                dispatch({ type: 'powerOn' });
              }}
            >
              <Art id="ui.powerOn" size={88} fallback={<span>⏻</span>} />
            </button>
          </div>
        )}

        {state.paused && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0,0,0,.45)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 40,
            }}
          >
            <motion.button
              data-testid="resume-button"
              aria-label="Resume"
              whileTap={{ scale: 0.92 }}
              style={{ width: 240, height: 240, padding: 0, border: 'none', background: 'transparent', borderRadius: '50%' }}
              onClick={() => {
                unlockAudio();
                dispatch({ type: 'resume' });
              }}
            >
              <Art id="ui.goButton" size={240} className="pulse" fallback={<span style={{ fontSize: 160 }}>▶</span>} />
            </motion.button>
          </div>
        )}

        {glove && state.phase === 'cooking' && (
          <div
            data-testid="dad-glove"
            style={{
              position: 'absolute',
              left: glove.x * 1600 - 55,
              top: glove.y * 900 - 55,
              fontSize: 92,
              pointerEvents: 'none',
              transition: 'left 100ms linear, top 100ms linear',
              zIndex: 28,
            }}
          >
            <Art id="tut.glove" size={110} fallback={<span>🧤</span>} />
          </div>
        )}
        {cheer && (
          <div
            data-testid="dad-cheer"
            style={{ position: 'absolute', left: 540, top: 190, fontSize: 96, pointerEvents: 'none', zIndex: 29 }}
          >
            <Art
              id={cheer === 'heart' ? 'cheer.heart' : cheer === 'wow' ? 'cheer.wow' : 'cheer.thumbs'}
              size={110}
              fallback={<span>{cheer === 'heart' ? '❤️' : cheer === 'wow' ? '🤩' : '👍'}</span>}
            />
          </div>
        )}
        {state.phase === 'tour' && (
          <Tour step={state.tourStep} soundOn={store.getSave().soundOn} onNext={nextTourStep} />
        )}

        <Confetti active={(state.phase === 'serveResult' && state.result?.kind === 'correct') || state.phase === 'levelResult'} />
      </div>

      {portrait && (
        <div
          data-testid="rotate-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            background: '#232946',
            color: '#fff',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
        >
          <Art id="ui.rotate" size={140} fallback={<span style={{ fontSize: 120 }}>📱↪️</span>} />
        </div>
      )}

      {parentOpen && <ParentArea onClose={() => setParentOpen(false)} />}
    </div>
  );
}

