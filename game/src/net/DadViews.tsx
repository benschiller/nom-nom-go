import { useEffect, useRef, useState } from 'react';
import { loadSave, persistSave } from '../core/save';
import { parseMirror, type MirrorView } from '../core/mirror';
import { ItemIcon } from '../ui/ItemIcon';
import { LocalTransport, type Envelope, type Transport } from './transport';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const parseId = (hash: string, prefix: string): string | null => {
  const id = hash.slice(prefix.length).split(/[&#]/)[0];
  return UUID_RE.test(id) ? id : null;
};

export function DadRoute({ hash }: { hash: string }): React.JSX.Element {
  if (hash.startsWith('#pair')) return <PairView id={parseId(hash, '#pair=')} />;
  if (hash.startsWith('#watch')) return <WatchView id={parseId(hash, '#watch=')} />;
  return <DadHome />;
}

function DadHome(): React.JSX.Element {
  const [save] = useState(() => loadSave(window.localStorage));
  const [id] = useState(() => {
    const existing = loadSave(window.localStorage).dadKitchenId;
    const next = existing ?? crypto.randomUUID();
    if (!existing) persistSave(window.localStorage, { ...loadSave(window.localStorage), dadKitchenId: next });
    return next;
  });
  const pairUrl = `${window.location.origin}${window.location.pathname}#pair=${id}`;
  const watchUrl = `${window.location.origin}${window.location.pathname}#watch=${id}`;
  void save;
  return (
    <main style={{ fontFamily: 'system-ui', padding: 32, maxWidth: 640, margin: '0 auto' }}>
      <h1>Nom Nom Go! — Dad's Window</h1>
      <p>Share this pairing link so the child's device joins your kitchen:</p>
      <p style={{ wordBreak: 'break-all', background: '#f4f4f4', padding: 12, borderRadius: 10 }}>{pairUrl}</p>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <button
          style={{ padding: '14px 20px', fontSize: 17 }}
          onClick={() => {
            if (navigator.share) void navigator.share({ url: pairUrl }).catch(() => undefined);
            else void navigator.clipboard.writeText(pairUrl);
          }}
        >
          Share / Copy pairing link
        </button>
        <button
          style={{ padding: '14px 20px', fontSize: 17 }}
          onClick={() => {
            window.location.hash = `#watch=${id}`;
            window.location.reload();
          }}
        >
          Open my window
        </button>
      </div>
      <p style={{ color: '#555' }}>
        Your watch link: <span style={{ wordBreak: 'break-all' }}>{watchUrl}</span>
      </p>
    </main>
  );
}

function PairView({ id }: { id: string | null }): React.JSX.Element {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!id) return;
    const save = loadSave(window.localStorage);
    persistSave(window.localStorage, { ...save, kitchenId: id });
    const t = setTimeout(() => {
      window.history.replaceState(null, '', window.location.pathname);
      setDone(true);
      window.location.reload();
    }, 1800);
    return () => clearTimeout(t);
  }, [id]);
  if (!id) return <div style={{ fontSize: 90, textAlign: 'center', marginTop: 120 }}>👨‍🍳❌</div>;
  return (
    <div data-testid="pair-confirm" style={{ fontSize: 110, textAlign: 'center', marginTop: 120 }}>
      {done ? '…' : '👨‍🍳 ✅'}
    </div>
  );
}

function WatchView({ id }: { id: string | null }): React.JSX.Element {
  const [mirror, setMirror] = useState<MirrorView | null>(null);
  const [online, setOnline] = useState(false);
  const transportRef = useRef<Transport | null>(null);
  const lastBeat = useRef(0);
  const gloveAt = useRef(0);

  useEffect(() => {
    if (!id) return;
    const save = loadSave(window.localStorage);
    persistSave(window.localStorage, { ...save, dadKitchenId: id });
    const transport = new LocalTransport(id);
    transportRef.current = transport;
    transport.publish({ type: 'hello', version: 1 });
    const beat = window.setInterval(() => transport.publish({ type: 'beat', role: 'dad' }), 5000);
    const unsub = transport.subscribe((msg: Envelope) => {
      if (msg.type === 'snapshot') {
        const m = parseMirror(msg.view);
        if (m) setMirror(m);
      }
      if (msg.type === 'beat' && msg.role === 'child') {
        lastBeat.current = Date.now();
        setOnline(true);
      }
      if (msg.type === 'event') setMirror((prev) => prev);
    });
    const presence = window.setInterval(() => setOnline(Date.now() - lastBeat.current < 15000), 3000);
    return () => {
      unsub();
      transport.close();
      clearInterval(beat);
      clearInterval(presence);
    };
  }, [id]);

  if (!id)
    return (
      <main style={{ padding: 32, fontFamily: 'system-ui' }}>
        <h1>Invalid window link</h1>
      </main>
    );

  const cheer = (kind: string): void => transportRef.current?.publish({ type: 'cheer', cheer: kind });

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#87ceeb', fontFamily: 'system-ui' }}>
      <div
        data-testid="dad-mirror"
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 14,
        }}
        onPointerMove={(e) => {
          const now = performance.now();
          if (now - gloveAt.current < 80) return;
          gloveAt.current = now;
          transportRef.current?.publish({
            type: 'glove',
            x: e.clientX / window.innerWidth,
            y: e.clientY / window.innerHeight,
          });
        }}
        onPointerDown={(e) =>
          transportRef.current?.publish({
            type: 'glove',
            x: e.clientX / window.innerWidth,
            y: e.clientY / window.innerHeight,
          })
        }
      >
        {!mirror || !online ? (
          <div data-testid="dad-waiting" style={{ fontSize: 42 }}>
            ⏳ Waiting for the kitchen…
          </div>
        ) : (
          <>
            <div style={{ fontSize: 34 }}>
              Level {mirror.level} · {mirror.phase}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {mirror.ticket.map((tid, i) => (
                <ItemIcon key={i} id={tid} size={92} />
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {mirror.built.map((bid, i) => (
                <ItemIcon key={i} id={bid} size={80} />
              ))}
            </div>
            <div>
              {Array.from({ length: mirror.bankedTarget ?? 3 }, (_, i) => (
                <span key={i} style={{ fontSize: 44, opacity: i < mirror.starsTry ? 1 : 0.25 }}>
                  ⭐
                </span>
              ))}
            </div>
          </>
        )}
      </div>
      <div style={{ position: 'absolute', right: 16, bottom: 16, display: 'flex', gap: 10, zIndex: 10 }}>
        <button
          data-testid="cheer-thumbs"
          style={{ fontSize: 40, padding: '14px 18px', borderRadius: 18 }}
          onClick={() => cheer('thumbs')}
        >
          👍
        </button>
        <button
          data-testid="cheer-heart"
          style={{ fontSize: 40, padding: '14px 18px', borderRadius: 18 }}
          onClick={() => cheer('heart')}
        >
          ❤️
        </button>
        <button
          data-testid="cheer-wow"
          style={{ fontSize: 30, padding: '14px 18px', borderRadius: 18, fontWeight: 800 }}
          onClick={() => cheer('wow')}
        >
          WOW
        </button>
      </div>
    </div>
  );
}
