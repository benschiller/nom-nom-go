import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { DISH_EMOJI, MONSTERS } from './content/content';
import { bankedTarget, hintDelayMs } from './core/difficulty';
import { currentOrder } from './core/game';
import { defaultSave } from './core/save';
import {
  playKioskItem,
  playSfx,
  setSoundOn,
  startBackgroundLoop,
  unlockAudio,
  ensureAudioOnVisible,
} from './audio/audio';
import { isTestMode, testSpeed, useGame } from './ui/store';
import { Emoji, ItemIcon } from './ui/ItemIcon';
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

export default function App(): React.JSX.Element {
  const hash = window.location.hash;
  if (hash.startsWith('#dad') || hash.startsWith('#watch') || hash.startsWith('#pair')) {
    return <DadRoute hash={hash} />;
  }
  return <GameShell />;
}

const TOUR_STEPS = 6;

function TourDemo({ step }: { step: number }): React.JSX.Element {
  const iconRow = (ids: string[], size = 120) => (
    <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
      {ids.map((id, i) => (
        <span key={`${id}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <ItemIcon id={id} size={size} />
          {i < ids.length - 1 && <span style={{ fontSize: 36, color: '#8a5a33' }}>➜</span>}
        </span>
      ))}
    </div>
  );
  const panel = (bg: string, children: React.ReactNode) => (
    <div
      style={{
        background: bg,
        borderRadius: 28,
        border: '5px solid rgba(90,50,20,.25)',
        padding: '28px 36px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 26,
        minWidth: 760,
        minHeight: 240,
      }}
    >
      {children}
    </div>
  );
  switch (step) {
    case 0:
      return panel(
        '#ff9f45',
        <>
          <span style={{ fontSize: 130 }}>👾</span>
          <span style={{ fontSize: 90 }}>👀</span>
          {iconRow(['cheese', 'lettuce'], 110)}
        </>,
      );
    case 1:
      return panel(
        '#203040',
        <>
          <span style={{ fontSize: 72 }}>🔊</span>
          {iconRow(['cheese', 'lettuce'], 110)}
        </>,
      );
    case 2:
      return panel(
        '#d9f2d0',
        <>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <div style={{ display: 'flex', gap: 14 }}>
              <ItemIcon id="cheese" size={120} glow />
              <ItemIcon id="lettuce" size={120} />
              <ItemIcon id="pickles" size={120} />
            </div>
            <span className="bob" style={{ fontSize: 64 }}>
              👆
            </span>
          </div>
          <span style={{ fontSize: 44 }}>➜</span>
          <div style={{ display: 'flex', flexDirection: 'column-reverse', alignItems: 'center' }}>
            <span style={{ fontSize: 52 }}>🍞</span>
            <ItemIcon id="cheese" size={92} />
          </div>
        </>,
      );
    case 3:
      return panel(
        '#ffe9b8',
        <>
          <span
            style={{
              width: 150,
              height: 150,
              borderRadius: '50%',
              background: '#fff',
              border: '5px solid rgba(90,50,20,.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 84,
            }}
          >
            👨‍🍳
          </span>
          <span style={{ fontSize: 44 }}>➜</span>
          <div style={{ display: 'flex', gap: 14 }}>
            <ItemIcon id="cheese" size={120} glow />
            <ItemIcon id="lettuce" size={120} />
            <ItemIcon id="pickles" size={120} />
          </div>
          <span style={{ fontSize: 54 }}>🔊</span>
        </>,
      );
    case 4:
      return panel(
        '#fff8ec',
        <>
          <span style={{ ...BTN, width: 150, height: 150, fontSize: 68 }}>↩️</span>
          <span style={{ ...BTN, width: 150, height: 150, fontSize: 68 }}>🗑️</span>
        </>,
      );
    default:
      return panel(
        '#bfe8ff',
        <>
          <span style={{ fontSize: 110 }}>🔔</span>
          <span style={{ fontSize: 90 }}>👾😋</span>
          <span style={{ fontSize: 54 }}>😊 😐 😤</span>
        </>,
      );
  }
}

function Tour({
  step,
  onNext,
  onBack,
  onSkip,
}: {
  step: number;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}): React.JSX.Element {
  const last = step === TOUR_STEPS - 1;
  return (
    <div
      data-testid="tour"
      data-step={step}
      style={{
        position: 'absolute',
        inset: 0,
        background: '#fdf3e3',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 22,
        zIndex: 50,
      }}
    >
      <button
        data-testid="tour-skip"
        aria-label="Skip tour"
        style={{
          position: 'absolute',
          left: 24,
          top: 24,
          width: 110,
          height: 110,
          borderRadius: '50%',
          fontSize: 44,
          background: '#fff',
          border: '4px solid rgba(90,50,20,.3)',
        }}
        onClick={onSkip}
      >
        ✕
      </button>
      <div data-testid="tour-pips" style={{ display: 'flex', gap: 12 }} aria-hidden>
        {Array.from({ length: TOUR_STEPS }, (_, i) => (
          <span
            key={i}
            style={{
              width: 30,
              height: 30,
              borderRadius: '50%',
              background: i <= step ? '#d35400' : 'rgba(90,50,20,.2)',
              display: 'block',
            }}
          />
        ))}
      </div>
      <div style={{ fontSize: 110, lineHeight: 1 }}>👨‍🍳👉</div>
      <TourDemo step={step} />
      <div style={{ display: 'flex', gap: 18, alignItems: 'center', minHeight: 150 }}>
        {step > 0 ? (
          <button
            data-testid="tour-back"
            aria-label="Back"
            style={{ ...BTN, width: 150, height: 140, fontSize: 60, background: '#fff' }}
            onClick={onBack}
          >
            ◀
          </button>
        ) : (
          <span style={{ width: 150 }} />
        )}
        <motion.button
          data-testid="tour-next"
          aria-label={last ? 'Start playing' : 'Next'}
          whileTap={{ scale: 0.94 }}
          style={{ ...BTN, width: 240, height: 150, fontSize: 68, background: '#6bcb77' }}
          onClick={onNext}
        >
          {last ? '✓' : '▶'}
        </motion.button>
        <span style={{ width: 150 }} />
      </div>
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
  icon: string;
  onComplete: () => void;
  style: React.CSSProperties;
}): React.JSX.Element {
  const [progress, setProgress] = useState(0);
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
  };
  const start = (): void => {
    cancel();
    const duration = isTestMode() ? 300 : 3000;
    const started = performance.now();
    timer.current = window.setTimeout(() => {
      if (raf.current) cancelAnimationFrame(raf.current);
      raf.current = null;
      timer.current = null;
      setProgress(0);
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
      {progress > 0 && (
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
  const [tourStep, setTourStep] = useState<number | null>(null);
  const [parentOpen, setParentOpen] = useState(false);
  const [dadOnline, setDadOnline] = useState(false);
  const [cheer, setCheer] = useState<string | null>(null);
  const [glove, setGlove] = useState<{ x: number; y: number } | null>(null);
  const transportRef = useRef<Transport | null>(null);
  const seqRef = useRef(0);
  const lastDadBeat = useRef(0);
  const calloutKey = useRef('');
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

  const startGame = (): void => {
    unlockAudio();
    startBackgroundLoop(() => (state.streak ? 260 : 380));
    dispatch({ type: 'go' });
  };

  const finishTour = (): void => {
    unlockAudio();
    dispatch({ type: 'tourDone' });
    setTourStep(null);
    startGame();
  };

  // Tick loop. Test mode scales tick steps so E2E can play in real time.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number): void => {
      const dt = Math.min(100, now - last);
      last = now;
      dispatch({ type: 'tick', ms: Math.round(dt * testSpeed()) });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [dispatch]);

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

  // Phase sound effects.
  const order = currentOrder(state);
  // Dad speaks each item at the kiosk as it pops up: seeing and hearing
  // happen together. Clips queue on one chain so they never overlap.
  // A broken speaker turns each item into a burst of static instead.
  useEffect(() => {
    if (state.phase !== 'kiosk' || !order) return;
    const key = `${state.level}-${state.orderIndex}-${state.tryCount}-${state.attemptsThisOrder}`;
    if (spoken.current.key !== key) {
      spoken.current = { key, count: 0 };
      voiceChain.current = Promise.resolve();
    }
    playSfx('pop');
    while (spoken.current.count < state.kioskShown) {
      const index = spoken.current.count;
      spoken.current.count++;
      if (isTestMode() || !store.getSave().soundOn) continue;
      if (order.broken === 'speaker') {
        voiceChain.current = voiceChain.current.then(() => playSfx('static'));
      } else {
        const ticket = order.ticket;
        voiceChain.current = voiceChain.current.then(() => playKioskItem(ticket, index));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.kioskShown, state.phase]);

  // Cooking starts once the last kiosk item has been spoken (or static).
  useEffect(() => {
    if (state.phase !== 'callout' || !order) return;
    const key = `${state.level}-${state.orderIndex}-${state.tryCount}-${state.attemptsThisOrder}`;
    if (calloutKey.current === key) return;
    calloutKey.current = key;
    if (isTestMode() || !store.getSave().soundOn) {
      dispatch({ type: 'calloutFinished' });
      return;
    }
    void voiceChain.current.then(() => dispatch({ type: 'calloutFinished' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, state.orderIndex]);

  useEffect(() => {
    if (state.phase === 'serveResult' && state.result?.kind === 'correct') playSfx('gobble');
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
      if (msg.type === 'beat' && msg.role === 'dad') lastDadBeat.current = Date.now();
      if (msg.type === 'glove' && typeof msg.x === 'number' && typeof msg.y === 'number') {
        setGlove({ x: Math.min(msg.x, 0.77), y: msg.y < 0.4 && msg.x > 0.8 ? 0.42 : msg.y });
      }
      if (msg.type === 'cheer' && typeof msg.cheer === 'string') {
        setCheer(msg.cheer);
        playSfx('confetti');
        window.setTimeout(() => setCheer(null), 1600);
      }
    });
    const presence = window.setInterval(() => setDadOnline(Date.now() - lastDadBeat.current < 15000), 2000);
    return () => {
      unsub();
      transport.close();
      clearInterval(beat);
      clearInterval(presence);
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
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 18,
            }}
          >
            <div style={{ fontSize: 110, fontWeight: 900, color: '#d35400', textShadow: '0 4px 0 #fff' }}>
              Nom Nom Go!
            </div>
            <div className="bob" style={{ fontSize: 150 }}>
              🚚 👾 🍔
            </div>
            <motion.button
              data-testid="go-button"
              whileTap={{ scale: 0.94 }}
              style={{ ...BTN, width: 320, height: 170, fontSize: 64, fontWeight: 900, background: '#6bcb77' }}
              onClick={() => {
                unlockAudio();
                if (!isTestMode() && !store.getSave().tutorialsSeen.includes('tour')) setTourStep(0);
                else startGame();
              }}
            >
              ▶ Go!
            </motion.button>
            <HoldButton
              testId="parent-gate"
              label="Parent area — press and hold"
              icon="👨‍🍳"
              onComplete={() => setParentOpen(true)}
              style={{ position: 'absolute', left: 24, bottom: 24, background: '#fff3e2' }}
            />
          </div>
        )}

        {state.phase === 'levelIntro' && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Emoji size={180}>👨‍🍳👋</Emoji>
            <div data-testid="level-pips" style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              {Array.from({ length: state.level }, (_, i) => (
                <span key={i} style={{ fontSize: 52 }}>
                  ⭐
                </span>
              ))}
            </div>
          </div>
        )}

        {(state.phase === 'kiosk' || state.phase === 'printing' || state.phase === 'callout') && order && (
          <Kiosk state={state} />
        )}

        {(state.phase === 'cooking' || state.phase === 'serveResult') && order && (
          <Kitchen state={state} dispatch={dispatch} testAttrs={testAttrs} />
        )}

        {state.phase === 'levelResult' && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 16,
            }}
          >
            <Emoji size={160}>{state.starsTry >= bankedTarget(state.level) ? '👨‍🍳🎉' : '👨‍🍳💪'}</Emoji>
            <div data-testid="result-stars" style={{ display: 'flex', gap: 12 }}>
              {Array.from({ length: bankedTarget(state.level) }, (_, i) => (
                <span key={i} style={{ fontSize: 84, opacity: i < state.starsTry ? 1 : 0.25 }}>
                  ⭐
                </span>
              ))}
            </div>
            <button
              data-testid="continue-button"
              style={{ ...BTN, width: 220, height: 150, fontSize: 72 }}
              onClick={() => {
                playSfx('ding');
                dispatch({ type: 'continue' });
              }}
            >
              ➡️
            </button>
          </div>
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
            <div className="bob" style={{ fontSize: 170 }}>
              🚚🌙 👨‍🍳🥱👋
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
            <div style={{ fontSize: 150 }}>🚚🌙💤</div>
            <button
              data-testid="power-off"
              aria-label="Power off"
              style={{ ...BTN, width: 170, height: 170, borderRadius: '50%', fontSize: 76 }}
              onClick={() => dispatch({ type: 'powerOff' })}
            >
              ⏻
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
              ⏻
            </button>
          </div>
        )}

        {state.paused && state.phase !== 'title' && (
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
            <button
              data-testid="resume-button"
              style={{ ...BTN, width: 220, height: 180, fontSize: 84 }}
              onClick={() => {
                unlockAudio();
                dispatch({ type: 'resume' });
              }}
            >
              ▶️
            </button>
          </div>
        )}

        {state.phase === 'cooking' && (
          <button
            data-testid="pause-button"
            aria-label="Pause"
            style={{
              position: 'absolute',
              left: 1436,
              bottom: 178,
              width: 140,
              height: 140,
              borderRadius: 24,
              fontSize: 58,
              zIndex: 30,
            }}
            onClick={() => dispatch({ type: 'pause' })}
          >
            ⏸️
          </button>
        )}

        {state.tutorial && state.phase === 'cooking' && (
          <div
            style={{
              position: 'absolute',
              left: 420,
              top: 560,
              zIndex: 35,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              pointerEvents: 'none',
            }}
          >
            <span className="bob" style={{ fontSize: 84 }}>
              👨‍🍳👉 👆
            </span>
          </div>
        )}
        {state.phase !== 'title' && (
          <div
            data-testid="dad-badge"
            style={{
              position: 'absolute',
              left: 1436,
              bottom: 24,
              width: 140,
              height: 140,
              borderRadius: '50%',
              background: dadOnline ? '#ffd93d' : '#cfd8dc',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 64,
              opacity: dadOnline ? 1 : 0.55,
              pointerEvents: 'none',
            }}
          >
            👋
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
            🧤
          </div>
        )}
        {cheer && (
          <div
            data-testid="dad-cheer"
            style={{ position: 'absolute', left: 540, top: 190, fontSize: 96, pointerEvents: 'none', zIndex: 29 }}
          >
            {cheer === 'heart' ? '❤️' : cheer === 'wow' ? '🤩' : '👍'}
          </div>
        )}
        {state.phase !== 'title' && state.phase !== 'closed' && state.phase !== 'poweredOff' && (
          <HoldButton
            testId="power-reset"
            label="Power — press and hold to reset completely"
            icon="⏻"
            onComplete={resetCompletely}
            style={{
              position: 'absolute',
              left: 24,
              bottom: 24,
              background: '#232946',
              color: '#ffd93d',
              border: '4px solid #ffd93d',
              zIndex: 45,
            }}
          />
        )}

        {tourStep !== null && (
          <Tour
            step={tourStep}
            onBack={() => setTourStep((s) => (s !== null && s > 0 ? s - 1 : s))}
            onSkip={finishTour}
            onNext={() => (tourStep >= TOUR_STEPS - 1 ? finishTour() : setTourStep(tourStep + 1))}
          />
        )}

        <Confetti active={state.phase === 'serveResult' && state.result?.kind === 'correct'} />
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
          <div style={{ fontSize: 120 }}>📱↪️</div>
        </div>
      )}

      {parentOpen && <ParentArea onClose={() => setParentOpen(false)} />}
    </div>
  );
}

function Kiosk({ state }: { state: ReturnType<typeof useGame>['state'] }): React.JSX.Element {
  const order = currentOrder(state);
  if (!order) return <></>;
  const monster = MONSTERS.find((m) => m.id === order.monster);
  const snow = order.broken === 'kiosk';
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div style={{ position: 'absolute', left: 60, top: 240, fontSize: 190 }} className="bob">
        {monster?.emoji}
      </div>
      <div
        style={{
          position: 'absolute',
          left: 430,
          top: 170,
          width: 620,
          height: 480,
          background: '#ff9f45',
          borderRadius: 36,
          border: '6px solid rgba(90,50,20,.4)',
          padding: 24,
        }}
      >
        <div style={{ fontSize: 92, textAlign: 'center' }}>🚚 {DISH_EMOJI[order.dish]}</div>
        <div
          data-testid="kiosk-items"
          style={{
            display: 'flex',
            gap: 14,
            flexWrap: 'wrap',
            justifyContent: 'center',
            marginTop: 22,
            minHeight: 150,
          }}
        >
          {snow ? (
            <span style={{ fontSize: 110 }}>📺❄️</span>
          ) : (
            order.ticket.slice(0, state.kioskShown).map((id, i) => (
              <motion.div key={`${id}-${i}`} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                <ItemIcon id={id} size={130} />
              </motion.div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function Kitchen({
  state,
  dispatch,
  testAttrs,
}: {
  state: ReturnType<typeof useGame>['state'];
  dispatch: ReturnType<typeof useGame>['dispatch'];
  testAttrs: Record<string, string | undefined>;
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
  if (!order) return <></>;
  const monster = MONSTERS.find((m) => m.id === order.monster);
  const fraction = state.patienceTotalMs > 0 ? state.patienceLeftMs / state.patienceTotalMs : 1;
  const emotion =
    state.phase === 'serveResult'
      ? state.result?.kind === 'correct'
        ? '😋💃'
        : state.result?.kind === 'wrong'
          ? '😕👋'
          : '👋'
      : fraction > 0.66
        ? '😊'
        : fraction > 0.33
          ? '😐👆'
          : '😤💨';
  const hintId =
    state.phase === 'cooking' && state.idleMs >= hintDelayMs(state.dimensions, state.level, state.assist)
      ? order.ticket[state.built.length - order.prebuilt.length]
      : undefined;
  // One merged inventory, generated per order at exactly level + 3 items.
  const mergedItems = order.tray;
  const highlight = state.result?.highlight;
  // No ticket on this screen. Wrong-serve feedback points at the tray item.
  const wrongTrayId =
    state.phase === 'serveResult' && highlight?.side === 'expected' ? order.expected[highlight.index] : undefined;
  // HELP: Head Chef replays the call-out. Each tray item grows in ticket
  // order, in sync with its clip (static bursts when the speaker is broken).
  // Budget and the patience pause live in the core (peek / helpPlaying).
  const helpId = helpStep >= 0 ? order.ticket[helpStep] : undefined;
  const canHelp = state.phase === 'cooking' && !state.helpPlaying && state.peeksUsed < state.peekBudget;
  const onHelp = async (): Promise<void> => {
    if (!canHelp) return;
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

  return (
    <div style={{ position: 'absolute', inset: 0, background: '#2a9d8f' }}>
      {/* Kitchen master layout (locked still): tall window, dominant dish,
          horizontal tray, controls below it. No order bar on this screen.
          Test hook only: the expected order for automated play. */}
      <div data-testid="ticket" {...testAttrs} style={{ display: 'none' }} aria-hidden />
      <div
        aria-hidden
        style={{ position: 'absolute', left: 0, top: 0, width: 784, height: 640, background: '#ff8c69' }}
      />
      <div
        data-testid="serving-window"
        style={{
          position: 'absolute',
          left: 24,
          top: 24,
          width: 1232,
          height: 496,
          background: '#7fd4c9',
          border: '8px solid #f2b035',
          borderRadius: 12,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            right: 60,
            bottom: -30,
            fontSize: 300,
            lineHeight: 1,
            display: 'flex',
            alignItems: 'flex-end',
          }}
        >
          <span>{monster?.emoji}</span>
          <span style={{ fontSize: 110, marginLeft: -70, marginBottom: 130 }}>{emotion}</span>
        </div>
      </div>
      {/* Build area */}
      <div
        data-testid="build-area"
        style={{
          position: 'absolute',
          left: 24,
          top: 300,
          width: 736,
          height: 320,
          background: 'rgba(255,248,236,.92)',
          borderRadius: 28,
          border: '5px solid rgba(90,50,20,.25)',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          paddingBottom: 18,
        }}
      >
        {state.phase === 'serveResult' && state.result?.kind === 'wrong' && (
          <div
            data-testid="wrong-feedback"
            style={{ position: 'absolute', right: 18, top: 12, fontSize: 72, pointerEvents: 'none' }}
          >
            👨‍🍳👉
          </div>
        )}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column-reverse',
            alignItems: 'center',
            gap: 2,
            animation:
              state.phase === 'serveResult' && state.result?.kind === 'wrong' ? 'shakeX 0.4s ease-in-out 2' : undefined,
          }}
        >
          {order.dish === 'burger' && <span style={{ fontSize: 58 }}>🍞</span>}
          {state.built.map((id, i) => (
            <button
              key={i}
              data-built-item={id}
              aria-label={`undo ${id}`}
              disabled={state.phase !== 'cooking' || i < order.prebuilt.length}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                outline: highlight?.side === 'built' && highlight.index === i ? '8px solid #ff595e' : undefined,
                borderRadius: 60,
              }}
              onClick={() => {
                if (i === state.built.length - 1) {
                  playSfx('pop');
                  dispatch({ type: 'undo' });
                }
              }}
            >
              <ItemIcon id={id} size={92} />
            </button>
          ))}
          {state.phase === 'serveResult' && state.result?.kind === 'correct' && order.dish === 'burger' && (
            <span style={{ fontSize: 58 }}>🍞</span>
          )}
        </div>
      </div>
      {/* Horizontal ingredient bar (master layout). HELP and wrong-serve
          feedback grow/highlight items here. */}
      <div
        data-testid="tray"
        style={{
          position: 'absolute',
          left: 24,
          top: 636,
          width: 1552,
          height: 132,
          background: '#ffe9b8',
          borderRadius: 24,
          border: '5px solid rgba(90,50,20,.3)',
          display: 'flex',
          gap: 8,
          padding: 10,
          alignItems: 'center',
          overflowX: 'auto',
        }}
      >
        {mergedItems.map((id) => {
          const active = id === helpId || id === wrongTrayId;
          return (
            <button
              key={id}
              data-tray-item={id}
              data-base-item={id}
              data-help-active={id === helpId ? 'true' : undefined}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                transform: id === helpId ? 'scale(1.35)' : undefined,
                outline: active ? '7px solid #ffd93d' : undefined,
                borderRadius: 60,
                transition: 'transform 160ms ease',
                zIndex: id === helpId ? 3 : undefined,
              }}
              onClick={() => {
                playSfx('tap');
                dispatch({ type: 'addItem', item: id });
              }}
            >
              <ItemIcon id={id} size={104} glow={hintId === id && helpId === undefined} />
            </button>
          );
        })}
      </div>
      {/* Controls under the tray: chef HELP left, undo/bell/trash centre
          (bell biggest, clear of the bottom edge), stars lower right. */}
      <button
        data-testid="chef-help"
        aria-label="Head Chef help"
        disabled={!canHelp}
        style={{
          position: 'absolute',
          left: 184,
          top: 782,
          width: 104,
          height: 104,
          borderRadius: '50%',
          fontSize: 56,
          background: '#fff',
          border: '5px solid rgba(90,50,20,.4)',
          opacity: canHelp ? 1 : 0.45,
          zIndex: 6,
        }}
        onClick={() => void onHelp()}
      >
        👨‍🍳
      </button>
      <div
        data-testid="help-pips"
        style={{ position: 'absolute', left: 300, top: 826, display: 'flex', gap: 7, zIndex: 6 }}
        aria-hidden
      >
        {Array.from({ length: state.peekBudget }, (_, i) => (
          <span
            key={i}
            style={{
              width: 20,
              height: 20,
              borderRadius: '50%',
              display: 'block',
              background: i < state.peekBudget - state.peeksUsed ? '#ffd93d' : 'rgba(90,50,20,.25)',
              border: '3px solid rgba(90,50,20,.4)',
            }}
          />
        ))}
      </div>
      <div
        style={{
          position: 'absolute',
          left: 560,
          top: 776,
          width: 480,
          height: 112,
          display: 'flex',
          gap: 10,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <button
          data-testid="undo"
          aria-label="Undo"
          style={{ ...BTN, width: 104, minWidth: 104, minHeight: 104, height: 104, fontSize: 48, borderRadius: '50%' }}
          onClick={() => dispatch({ type: 'undo' })}
        >
          ↩️
        </button>
        <button
          data-testid="bell"
          aria-label="Serve"
          style={{
            ...BTN,
            width: 150,
            minWidth: 150,
            minHeight: 112,
            height: 112,
            fontSize: 72,
            borderRadius: '50%',
            background: '#ffd93d',
          }}
          onClick={() => {
            playSfx('bell');
            dispatch({ type: 'serve' });
          }}
        >
          🔔
        </button>
        <button
          data-testid="trash"
          aria-label="Clear dish"
          style={{ ...BTN, width: 104, minWidth: 104, minHeight: 104, height: 104, fontSize: 48, borderRadius: '50%' }}
          onClick={() => dispatch({ type: 'trash' })}
        >
          🗑️
        </button>
      </div>
      <div
        data-testid="try-stars"
        style={{
          position: 'absolute',
          left: 1304,
          top: 800,
          width: 272,
          height: 80,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 4,
        }}
      >
        {Array.from({ length: bankedTarget(state.level) }, (_, i) => (
          <span
            key={i}
            style={{ fontSize: bankedTarget(state.level) > 3 ? 36 : 52, opacity: i < state.starsTry ? 1 : 0.25 }}
          >
            ⭐
          </span>
        ))}
      </div>
      {state.streak && (
        <div style={{ position: 'absolute', left: 640, top: 600, fontSize: 54, pointerEvents: 'none' }}>🔥</div>
      )}
      <div id="glove-layer" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 25 }} />
      <div id="cheer-layer" style={{ position: 'absolute', left: 560, top: 200, pointerEvents: 'none', zIndex: 26 }} />
    </div>
  );
}
