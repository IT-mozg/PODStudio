/* Brand mark — print-industry registration symbol (the crosshair used
   to align color plates), with three slightly offset ink dots standing
   in for the CMY channels. Chosen over the earlier "P" placeholder
   because it's grounded in real print production, not a generic
   monogram. Kept as its own component (not folded into icons.tsx)
   since it's the one piece of brand identity, not a UI glyph. */

interface LogoProps {
  size?: number;
}

export function Logo({ size = 20 }: LogoProps) {
  const s = size;
  const cx = s / 2;
  const cy = s / 2;
  const r = s * 0.34;
  const stroke = Math.max(1, s * 0.045);
  const off = r * 0.34;
  const dot = s * 0.05;

  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} fill="none">
      <circle cx={cx} cy={cy} r={r} stroke="var(--accent)" strokeWidth={stroke} />
      <line x1={cx - r} y1={cy} x2={cx + r} y2={cy} stroke="var(--accent)" strokeWidth={stroke} />
      <line x1={cx} y1={cy - r} x2={cx} y2={cy + r} stroke="var(--accent)" strokeWidth={stroke} />
      <circle cx={cx - off} cy={cy - off * 0.4} r={dot} fill="var(--accent)" />
      <circle cx={cx + off} cy={cy - off * 0.2} r={dot} fill="var(--ink-warm)" />
      <circle cx={cx} cy={cy + off} r={dot} fill="var(--ink-cyan)" />
    </svg>
  );
}
