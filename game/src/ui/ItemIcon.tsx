import { memo } from 'react';
import { ITEM_BY_ID } from '../content/content';
import { Art } from './Art';

export type ItemVariant = 'tray' | 'dish' | 'sill';

export const ItemIcon = memo(function ItemIcon({
  id,
  size = 110,
  glow = false,
  variant = 'tray',
}: {
  id: string;
  size?: number;
  glow?: boolean;
  variant?: ItemVariant;
}) {
  const item = ITEM_BY_ID.get(id);
  if (!item) return null;
  const artId = `item.${id}.${variant === 'dish' ? 'dish' : 'tray'}`;
  const fallback = <EmojiFallback id={id} size={size} />;
  return (
    <div
      data-item={id}
      data-variant={variant}
      className={glow ? 'hint-glow' : undefined}
      style={{
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flex: '0 0 auto',
        borderRadius: variant === 'dish' ? 8 : '50%',
      }}
      aria-label={item.clipText}
      role="img"
    >
      <Art id={artId} size={size} alt="" fallback={fallback} />
    </div>
  );
});

function EmojiFallback({ id, size }: { id: string; size: number }) {
  const item = ITEM_BY_ID.get(id);
  if (!item) return null;
  const radius =
    item.shape === 'round' || item.shape === 'flat-round' ? '50%' : item.shape === 'triangle' ? '18%' : '26%';
  return (
    <div
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
