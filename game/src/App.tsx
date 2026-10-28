import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { DISH_EMOJI, MONSTERS } from './content/content';
import { currentOrder } from './core/game';
import {
  playCallout,
  playGibberish,
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

function GameShell(): React.JSX.Element {
  const { state, dispatch, store } = useGame();
  const scale = useStageScale();
  const portrait = usePortrait();
  const [parentOpen, setParentOpen] = useState(false);
  const gateTimer = useRef<number | null>(null);
  const [dadOnline, setDadOnline] = useState(false);
  const [cheer, setCheer] = useState<string | null>(null);
  const [glove, setGlove] = useState<{ x: number; y: number } | null>(null);
  const transportRef = useRef<Transport | null>(null);
  const seqRef = useRef(0);
  const lastDadBeat = useRef(0);
  const calloutKey = useRef('');

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
  useEffect(() => {
    if (state.phase === 'kiosk' && state.kioskShown > 0 && order) {
      playGibberish(MONSTERS.find((m) => m.id === order.monster)?.pitch ?? 1);
      playSfx('pop');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.kioskShown]);

  useEffect(() => {
    if (state.phase !== 'callout' || !order) return;
    const key = `${state.level}-${state.orderIndex}-${state.tryCount}`;
    if (calloutKey.current === key) return;
    calloutKey.current = key;
    if (order.broken === 'speaker') {
      playSfx('static');
      dispatch({ type: 'calloutFinished' });
      return;
    }
    if (isTestMode() || !store.getSave().soundOn) {
      dispatch({ type: 'calloutFinished' });
      return;
    }
    const doubled = new Set(order.ticket.filter((id, i) => order.ticket.indexOf(id) !== i));
    void playCallout(order.ticket, doubled).then(() => dispatch({ type: 'calloutFinished' }));
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
        {/* Call corner scenery only */}
        <div style={{ position: 'absolute', ...CALL_CORNER, overflow: 'hidden', pointerEvents: 'none' }} aria-hidden>
          <div style={{ fontSize: 60, opacity: 0.8 }}>☁️ ☀️</div>
        </div>
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
                startBackgroundLoop(() => (state.streak ? 260 : 380));
                dispatch({ type: 'go' });
              }}
            >
              ▶ Go!
            </motion.button>
            <button
              data-testid="parent-gate"
              aria-label="Parent area"
              style={{
                position: 'absolute',
                left: 24,
                bottom: 24,
                width: 140,
                height: 140,
                borderRadius: '50%',
                fontSize: 64,
                background: '#fff3e2',
                border: '4px solid rgba(90,50,20,.3)',
              }}
              onPointerDown={() => {
                gateTimer.current = window.setTimeout(() => setParentOpen(true), isTestMode() ? 300 : 3000);
              }}
              onPointerUp={() => {
                if (gateTimer.current) clearTimeout(gateTimer.current);
              }}
              onPointerLeave={() => {
                if (gateTimer.current) clearTimeout(gateTimer.current);
              }}
            >
              👨‍🍳
            </button>
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
            <Emoji size={160}>{state.starsTry === 3 ? '👨‍🍳🎉' : '👨‍🍳💪'}</Emoji>
            <div data-testid="result-stars" style={{ display: 'flex', gap: 12 }}>
              {[0, 1, 2].map((i) => (
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
              left: 1330,
              bottom: 24,
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

        {state.tutorial && (
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
              left: 1300,
              bottom: 24,
              width: 110,
              height: 110,
              borderRadius: '50%',
              background: dadOnline ? '#ffd93d' : '#cfd8dc',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 56,
              opacity: dadOnline ? 1 : 0.55,
              pointerEvents: 'none',
            }}
          >
            👨‍🍳
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
        {state.tutorial && (
          <button
            data-testid="tutorial-done"
            style={{
              position: 'absolute',
              left: 620,
              top: 700,
              ...BTN,
              width: 160,
              height: 140,
              fontSize: 60,
              zIndex: 36,
            }}
            onClick={() => dispatch({ type: 'tutorialDone' })}
          >
            👍
          </button>
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
  if (!order) return <></>;
  const monster = MONSTERS.find((m) => m.id === order.monster);
  const fraction = state.patienceTotalMs > 0 ? state.patienceLeftMs / state.patienceTotalMs : 1;
  const emotion =
    state.phase === 'serveResult'
      ? state.result?.kind === 'correct'
        ? '😋💃'
        : state.result?.kind === 'wrong'
          ? '😕'
          : '👋'
      : fraction > 0.66
        ? '😊'
        : fraction > 0.33
          ? '😐👆'
          : '😤💨';
  const nextNeeded = order.ticket.find((id, idx) => {
    const builtToppings = state.built.slice(order.prebuilt.length);
    const used = builtToppings.filter((b, bi) => bi < idx + 1 && b === id).length;
    void used;
    return (
      state.built.filter((b) => b === id).length < order.expected.filter((e) => e === id).length &&
      order.ticket[state.built.length - order.prebuilt.length] === id
    );
  });
  const hintId =
    state.phase === 'cooking' && state.idleMs >= (state.assist ? 2000 : 4000)
      ? order.ticket[state.built.length - order.prebuilt.length]
      : undefined;
  void nextNeeded;
  const baseShelf =
    order.dish === 'burger'
      ? ['patty']
      : order.dish === 'pizza'
        ? [
            'crust.thin',
            'crust.thick',
            'sauce.redSmooth',
            ...(state.level >= 4 ? ['sauce.redChunky'] : []),
            'sauce.white',
          ]
        : ['cup', 'cone', 'scoop.vanilla', 'scoop.chocolate', 'scoop.strawberry'];
  const highlight = state.result?.highlight;

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {/* Monitor / ticket zone x24 y24 w700 h150 */}
      <div
        style={{
          position: 'absolute',
          left: 24,
          top: 24,
          width: 700,
          height: 150,
          background: '#203040',
          borderRadius: 20,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '0 14px',
          overflow: 'hidden',
        }}
      >
        <span style={{ fontSize: 44 }}>{order.broken === 'speaker' ? '🔊❄️' : '🔊'}</span>
        <div data-testid="ticket" {...testAttrs} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {order.broken === 'monitor' ? (
            <span style={{ fontSize: 54 }}>⬛</span>
          ) : (
            order.ticket.map((id, i) => (
              <span
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  outline: highlight?.side === 'expected' && highlight.index === i ? '5px solid #ffd93d' : undefined,
                  borderRadius: 60,
                }}
              >
                <ItemIcon id={id} size={104} />
                {i < order.ticket.length - 1 && <span style={{ color: '#fff', fontSize: 28 }}>➜</span>}
              </span>
            ))
          )}
        </div>
      </div>
      {/* Serving window */}
      <div
        data-testid="serving-window"
        style={{
          position: 'absolute',
          left: 748,
          top: 24,
          width: 220,
          height: 150,
          background: '#bfe8ff',
          borderRadius: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 76,
        }}
      >
        {monster?.emoji}
        {emotion}
      </div>
      {/* Stars */}
      <div
        data-testid="try-stars"
        style={{
          position: 'absolute',
          left: 992,
          top: 24,
          width: 264,
          height: 150,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
        }}
      >
        {[0, 1, 2].map((i) => (
          <span key={i} style={{ fontSize: 58, opacity: i < state.starsTry ? 1 : 0.25 }}>
            ⭐
          </span>
        ))}
      </div>
      {/* Build area */}
      <div
        data-testid="build-area"
        style={{
          position: 'absolute',
          left: 24,
          top: 186,
          width: 736,
          height: 444,
          background: '#fff8ec',
          borderRadius: 28,
          border: '5px solid rgba(90,50,20,.25)',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          paddingBottom: 26,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column-reverse', alignItems: 'center', gap: 2 }}>
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
                outline: highlight?.side === 'built' && highlight.index === i ? '5px solid #ff595e' : undefined,
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
      {/* Base shelf */}
      <div
        data-testid="base-shelf"
        style={{
          position: 'absolute',
          left: 784,
          top: 186,
          width: 472,
          height: 260,
          background: '#ffe3b3',
          borderRadius: 24,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          padding: 14,
          alignContent: 'flex-start',
        }}
      >
        {baseShelf.map((id) => (
          <button
            key={id}
            data-base-item={id}
            style={{ background: 'none', border: 'none', padding: 0 }}
            onClick={() => {
              playSfx('tap');
              dispatch({ type: 'addItem', item: id });
            }}
          >
            <ItemIcon id={id} size={128} glow={hintId === id} />
          </button>
        ))}
      </div>
      {/* Bell / undo / trash */}
      <div style={{ position: 'absolute', left: 784, top: 466, width: 472, height: 164, display: 'flex', gap: 12 }}>
        <button
          data-testid="bell"
          aria-label="Serve"
          style={{ ...BTN, flex: 1, fontSize: 76 }}
          onClick={() => {
            playSfx('bell');
            dispatch({ type: 'serve' });
          }}
        >
          🔔
        </button>
        <button
          data-testid="undo"
          aria-label="Undo"
          style={{ ...BTN, width: 140, fontSize: 54 }}
          onClick={() => dispatch({ type: 'undo' })}
        >
          ↩️
        </button>
        <button
          data-testid="trash"
          aria-label="Clear dish"
          style={{ ...BTN, width: 140, fontSize: 54 }}
          onClick={() => dispatch({ type: 'trash' })}
        >
          🗑️
        </button>
      </div>
      {/* Tray: 8 x 140 + gaps = 1232 */}
      <div
        data-testid="tray"
        style={{
          position: 'absolute',
          left: 24,
          top: 646,
          width: 1232,
          height: 208,
          background: '#d9f2d0',
          borderRadius: 24,
          display: 'flex',
          gap: 16,
          padding: '20px 0',
          justifyContent: 'center',
        }}
      >
        {order.tray.map((id) => (
          <button
            key={id}
            data-tray-item={id}
            style={{ background: 'none', border: 'none', padding: 0, width: 140, height: 168 }}
            onClick={() => {
              playSfx('tap');
              dispatch({ type: 'addItem', item: id });
            }}
          >
            <ItemIcon id={id} size={140} glow={hintId === id} />
          </button>
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
