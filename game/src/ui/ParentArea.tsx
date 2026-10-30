import { useState } from 'react';
import { getStore } from './store';
import { setSoundOn } from '../audio/audio';
import { SKILL_IDS, SKILL_LABELS, shrunkMastery } from '../core/mastery';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function extractPairId(text: string): string | null {
  const m = text.match(/#pair=([0-9a-f-]{36})/i) ?? text.match(/([0-9a-f]{8}-[0-9a-f-]{27,})/i);
  const id = m?.[1];
  return id && UUID_RE.test(id) ? id : null;
}

export function ParentArea({ onClose }: { onClose: () => void }): React.JSX.Element {
  const store = getStore();
  const [save, setLocal] = useState(store.getSave());
  const [paste, setPaste] = useState('');
  const [msg, setMsg] = useState('');

  const update = (next: typeof save): void => {
    store.setSave(next);
    setLocal(next);
  };

  const telemetry = save.telemetry;
  const correct = telemetry.filter((t) => t.correct).length;
  const rate = telemetry.length ? Math.round((correct / telemetry.length) * 100) : 0;
  const avgMs = telemetry.length
    ? Math.round(telemetry.reduce((a, t) => a + (t.msToFinish ?? 0), 0) / telemetry.length / 100) / 10
    : 0;
  const mistakes = telemetry.map((t) => t.mistake).filter(Boolean) as string[];
  const topMistake =
    mistakes.sort((a, b) => mistakes.filter((x) => x === b).length - mistakes.filter((x) => x === a).length)[0] ?? '—';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(20,20,40,.72)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 20,
          padding: 24,
          width: 'min(680px,92vw)',
          maxHeight: '88vh',
          overflow: 'auto',
          color: '#222',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>Parent area</h2>
          <button onClick={onClose} style={{ fontSize: 20, padding: '8px 14px' }}>
            Close
          </button>
        </div>
        <p>
          Level reached: {save.level} · Kitchen closed for the night: {save.bossBeaten ? 'yes' : 'not yet'}
        </p>
        <p>
          Stars by level:{' '}
          {Object.entries(save.starsByLevel)
            .map(([l, s]) => `L${l}: ${s}`)
            .join(' · ') || 'none yet'}
        </p>
        <h3>Skill mastery (on-device estimate)</h3>
        {SKILL_IDS.map((id) => {
          const entry = save.mastery.skills[id];
          const pct = Math.round(shrunkMastery(entry) * 100);
          return (
            <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0' }}>
              <span style={{ width: 190 }}>{SKILL_LABELS[id]}</span>
              <span style={{ flex: 1, background: '#eee', borderRadius: 8, height: 14 }}>
                <span
                  style={{ display: 'block', width: `${pct}%`, background: '#69b84d', borderRadius: 8, height: 14 }}
                />
              </span>
              <span style={{ width: 90 }}>
                {pct}% · n={entry.n}
              </span>
            </div>
          );
        })}
        <p style={{ color: '#555', margin: '4px 0' }}>
          Fluency (speed vs patience): {Math.round(save.mastery.fluency.mastery * 100)}% · n={save.mastery.fluency.n}.
          Difficulty axes (encode/time/memory/search/complexity): {save.dimensions.encode}/{save.dimensions.time}/
          {save.dimensions.memory}/{save.dimensions.search}/{save.dimensions.complexity}. Estimates stay on this device
          and only shape practice and support.
        </p>
        <h3>Recent orders</h3>
        <p>
          Orders: {telemetry.length} · Correct: {rate}% · Average finish: {avgMs}s · Most common mistake: {topMistake}
        </p>
        <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={save.soundOn}
            onChange={(e) => {
              update({ ...save, soundOn: e.target.checked });
              setSoundOn(e.target.checked);
            }}
          />
          Sound on
        </label>
        <h3>Dad's Window pairing</h3>
        <p>Status: {save.kitchenId ? `paired (${save.kitchenId.slice(0, 8)}…)` : 'not paired'}</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            placeholder="Paste pairing link (#pair=…)"
            style={{ flex: 1, padding: 10, fontSize: 16 }}
          />
          <button
            style={{ padding: '10px 14px' }}
            onClick={() => {
              const id = extractPairId(paste);
              if (id) {
                update({ ...save, kitchenId: id });
                setMsg('Pairing saved.');
              } else setMsg('That link does not contain a valid pairing id.');
            }}
          >
            Save pairing
          </button>
        </div>
        <button
          style={{ marginTop: 10, padding: '10px 14px' }}
          onClick={() => {
            update({ ...save, kitchenId: crypto.randomUUID() });
            setMsg('New pairing created. Share the new link from Dad\u2019s device.');
          }}
        >
          Re-pair (rotate id)
        </button>
        {msg && <p role="status">{msg}</p>}
        <h3>Add to Home Screen</h3>
        <p>
          📲 ➡️ <strong>Share</strong> ➡️ <strong>Add to Home Screen</strong>. Saved progress is safest when the game
          runs from the Home Screen icon. Note: Home Screen apps may not share storage with Safari, so use “paste
          pairing link” above if pairing does not carry over.
        </p>
      </div>
    </div>
  );
}
