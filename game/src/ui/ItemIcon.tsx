import { ITEM_BY_ID } from '../content/content';

export function ItemIcon({ id, size = 110, glow = false }: { id: string; size?: number; glow?: boolean }) {
  const item = ITEM_BY_ID.get(id);
  if (!item) return null;
  const radius =
    item.shape === 'round' || item.shape === 'flat-round' ? '50%' : item.shape === 'triangle' ? '18%' : '26%';
  return (
    <div
      data-item={id}
      className={glow ? 'hint-glow' : undefined}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: item.color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.58,
        lineHeight: 1,
        border: '4px solid rgba(90,50,20,.35)',
        boxShadow: 'inset 0 -8px 0 rgba(0,0,0,.12)',
        flex: '0 0 auto',
      }}
      aria-label={item.clipText}
      role="img"
    >
      <span aria-hidden>{item.emoji}</span>
    </div>
  );
}

export function Emoji({ children, size = 90 }: { children: string; size?: number }) {
  return (
    <span style={{ fontSize: size, lineHeight: 1 }} aria-hidden>
      {children}
    </span>
  );
}
