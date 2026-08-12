'use client';

import React, { CSSProperties, ReactNode } from 'react';

// ─────────────────────────────────────────────
// Icon — minimal line-style, Lucide-ish
// ─────────────────────────────────────────────
export type IconName =
  | 'home' | 'brain' | 'graph' | 'garden' | 'stack' | 'plus' | 'search'
  | 'flame' | 'bolt' | 'settings' | 'check' | 'x' | 'chevr' | 'chevl'
  | 'chevd' | 'tag' | 'clock' | 'sparkle' | 'play' | 'pause' | 'eye'
  | 'edit' | 'link' | 'sync' | 'arrow' | 'trophy' | 'target' | 'mic'
  | 'image' | 'dots' | 'filter' | 'grid' | 'stars' | 'bulb' | 'pin'
  | 'clip' | 'doc' | 'book' | 'send' | 'note' | 'copy' | 'warning';

export const NNIcon = ({
  name,
  size = 16,
  color = 'currentColor',
  strokeWidth = 1.6,
}: {
  name: IconName | (string & {});
  size?: number;
  color?: string;
  strokeWidth?: number;
}) => {
  const p = {
    stroke: color,
    strokeWidth,
    fill: 'none',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  const paths: Partial<Record<string, ReactNode>> = {
    home: <path d="M3 10l9-7 9 7v10a1 1 0 01-1 1h-4v-7H8v7H4a1 1 0 01-1-1V10z" {...p} />,
    brain: (
      <path
        d="M9.5 3a2.5 2.5 0 00-2.5 2.5A2.5 2.5 0 004 8v2a2 2 0 001 1.7A2.5 2.5 0 005 15a2.5 2.5 0 002 2.5V19a2 2 0 002 2h1V3H9.5zM14.5 3a2.5 2.5 0 012.5 2.5A2.5 2.5 0 0120 8v2a2 2 0 01-1 1.7A2.5 2.5 0 0119 15a2.5 2.5 0 01-2 2.5V19a2 2 0 01-2 2h-1V3h.5z"
        {...p}
      />
    ),
    graph: (
      <>
        <circle cx="6" cy="6" r="2.2" {...p} />
        <circle cx="18" cy="6" r="2.2" {...p} />
        <circle cx="12" cy="18" r="2.2" {...p} />
        <circle cx="6" cy="14" r="1.8" {...p} />
        <path d="M8 7l8 3M8 14l2 3M16 8l-3 9" {...p} />
      </>
    ),
    garden: (
      <path
        d="M12 21v-6M12 15c0-3-3-5-6-5 0 3 2 5 6 5zM12 15c0-3 3-5 6-5 0 3-2 5-6 5zM12 10c0-3 1-5 3-5-0 3-1 5-3 5zM12 10c0-3-1-5-3-5 0 3 1 5 3 5zM6 21h12"
        {...p}
      />
    ),
    stack: <path d="M4 7l8-4 8 4-8 4-8-4zM4 12l8 4 8-4M4 17l8 4 8-4" {...p} />,
    plus: <path d="M12 5v14M5 12h14" {...p} />,
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="6" {...p} />
        <path d="M20 20l-5-5" {...p} />
      </>
    ),
    flame: <path d="M12 22c4 0 7-3 7-7 0-3-2-5-3-7-1 2-3 2-3-1 0-2 1-4 1-4-6 2-8 7-8 11 0 5 3 8 6 8z" {...p} />,
    bolt: <path d="M13 2L4 14h6l-2 8 9-12h-6l2-8z" {...p} />,
    settings: (
      <>
        <circle cx="12" cy="12" r="3" {...p} />
        <path
          d="M19 12a1 1 0 00.6-.2l1.6-1-1-1.7-1.8.6a1 1 0 01-.9-.3 7 7 0 00-.9-.5 1 1 0 01-.4-.8V6h-2v1.2a1 1 0 01-.4.8 7 7 0 00-.9.5 1 1 0 01-.9.3l-1.8-.6-1 1.7 1.6 1a1 1 0 01.4.8v1a1 1 0 01-.4.8l-1.6 1 1 1.7 1.8-.6a1 1 0 01.9.3 7 7 0 00.9.5 1 1 0 01.4.8V18h2v-1.2a1 1 0 01.4-.8 7 7 0 00.9-.5 1 1 0 01.9-.3l1.8.6 1-1.7-1.6-1A1 1 0 0119 13v-1z"
          {...p}
        />
      </>
    ),
    check: <path d="M4 12l5 5L20 6" {...p} />,
    x: <path d="M6 6l12 12M18 6L6 18" {...p} />,
    chevr: <path d="M9 6l6 6-6 6" {...p} />,
    chevl: <path d="M15 6l-6 6 6 6" {...p} />,
    chevd: <path d="M6 9l6 6 6-6" {...p} />,
    tag: (
      <>
        <path d="M3 12V4h8l10 10-8 8L3 12z" {...p} />
        <circle cx="7.5" cy="7.5" r="1.2" fill={color} />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" {...p} />
        <path d="M12 7v5l3 2" {...p} />
      </>
    ),
    sparkle: <path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6zM19 14l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z" {...p} />,
    play: <path d="M7 4v16l13-8L7 4z" stroke={color} strokeWidth={strokeWidth} fill={color} />,
    pause: <path d="M7 4h3v16H7zM14 4h3v16h-3z" stroke={color} strokeWidth={strokeWidth} fill={color} />,
    eye: (
      <>
        <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" {...p} />
        <circle cx="12" cy="12" r="3" {...p} />
      </>
    ),
    edit: <path d="M4 20h4l10-10-4-4L4 16v4zM14 6l4 4" {...p} />,
    link: <path d="M9 15l6-6M8 8l-3 3a4 4 0 005 6l3-3M16 16l3-3a4 4 0 00-5-6l-3 3" {...p} />,
    sync: <path d="M21 12a9 9 0 11-3-6.7M21 4v5h-5" {...p} />,
    arrow: <path d="M5 12h14M13 6l6 6-6 6" {...p} />,
    trophy: <path d="M7 4h10v4a5 5 0 01-10 0V4zM7 6H4v2a3 3 0 003 3M17 6h3v2a3 3 0 01-3 3M9 20h6M12 14v6" {...p} />,
    target: (
      <>
        <circle cx="12" cy="12" r="9" {...p} />
        <circle cx="12" cy="12" r="5" {...p} />
        <circle cx="12" cy="12" r="1.5" fill={color} stroke="none" />
      </>
    ),
    mic: (
      <>
        <rect x="9" y="3" width="6" height="12" rx="3" {...p} />
        <path d="M5 11a7 7 0 0014 0M12 18v3" {...p} />
      </>
    ),
    image: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" {...p} />
        <circle cx="8.5" cy="9" r="1.5" {...p} />
        <path d="M3 17l5-5 5 5 3-3 5 5" {...p} />
      </>
    ),
    dots: (
      <>
        <circle cx="5" cy="12" r="1.5" fill={color} stroke="none" />
        <circle cx="12" cy="12" r="1.5" fill={color} stroke="none" />
        <circle cx="19" cy="12" r="1.5" fill={color} stroke="none" />
      </>
    ),
    filter: <path d="M3 5h18l-7 9v5l-4 2v-7L3 5z" {...p} />,
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" {...p} />
        <rect x="14" y="3" width="7" height="7" rx="1" {...p} />
        <rect x="3" y="14" width="7" height="7" rx="1" {...p} />
        <rect x="14" y="14" width="7" height="7" rx="1" {...p} />
      </>
    ),
    stars: <path d="M12 3l1.5 5 5 1.5-5 1.5L12 16l-1.5-5L5.5 9.5l5-1.5L12 3z" {...p} />,
    bulb: <path d="M9 18h6M10 21h4M12 3a6 6 0 00-3.5 11c.5.5 1 1 1 2h5c0-1 .5-1.5 1-2A6 6 0 0012 3z" {...p} />,
    pin: <path d="M12 21v-6M8 4h8l-1 6 2.5 3h-11L9 10 8 4z" {...p} />,
    clip: <path d="M20 11.5l-7.8 7.8a5 5 0 01-7-7l8.5-8.5a3.3 3.3 0 014.7 4.7l-8.5 8.5a1.7 1.7 0 01-2.4-2.4l7.8-7.8" {...p} />,
    doc: <path d="M14 3H7a1.5 1.5 0 00-1.5 1.5v15A1.5 1.5 0 007 21h10a1.5 1.5 0 001.5-1.5V7.5L14 3zM14 3v4.5h4.5M9.5 12.5h5M9.5 16h5" {...p} />,
    book: <path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2V5zM19 17H6a2 2 0 00-2 2M9 3v14" {...p} />,
    // Send — upward arrow (composer submit, NBIcon parity).
    send: <path d="M12 19V5M6 11l6-6 6 6" {...p} />,
    // Note — page with a folded corner (save-to-notes action).
    note: (
      <>
        <path d="M5 4h14v12l-4 4H5V4z" {...p} />
        <path d="M15 20v-4h4" {...p} />
      </>
    ),
    // Copy — overlapping sheets.
    copy: (
      <>
        <rect x="9" y="9" width="11" height="11" rx="2" {...p} />
        <path d="M5 15V6a2 2 0 012-2h9" {...p} />
      </>
    ),
    warning: (
      <>
        <path d="M12 3L2.8 20h18.4L12 3z" {...p} />
        <path d="M12 9v5M12 17.5h.01" {...p} />
      </>
    ),
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: 'block', flexShrink: 0 }}>
      {paths[name] ?? null}
    </svg>
  );
};

// ─────────────────────────────────────────────
// Button
// ─────────────────────────────────────────────
export type BtnVariant = 'primary' | 'violet' | 'amber' | 'ghost' | 'soft' | 'outline' | 'danger';
export type BtnSize = 'sm' | 'md' | 'lg' | 'xl';

export const NNBtn = ({
  children,
  variant = 'ghost',
  size = 'md',
  icon,
  iconRight,
  onClick,
  style,
  block,
  active,
  type,
  title,
  ariaLabel,
  disabled,
  loading = false,
  loadingLabel,
}: {
  children?: ReactNode;
  variant?: BtnVariant;
  size?: BtnSize;
  icon?: IconName | (string & {});
  iconRight?: IconName | (string & {});
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  style?: CSSProperties;
  block?: boolean;
  active?: boolean;
  type?: 'button' | 'submit' | 'reset';
  title?: string;
  ariaLabel?: string;
  disabled?: boolean;
  /** Keeps the button's dimensions stable while an action is in flight. */
  loading?: boolean;
  /** Optional accessible label announced instead of the normal label while busy. */
  loadingLabel?: string;
}) => {
  const sizes: Record<BtnSize, { h: number; px: number; fs: number; gap: number; r: number }> = {
    sm: { h: 28, px: 10, fs: 12.5, gap: 6, r: 8 },
    md: { h: 34, px: 12, fs: 13.5, gap: 7, r: 9 },
    lg: { h: 42, px: 18, fs: 15, gap: 9, r: 11 },
    xl: { h: 52, px: 24, fs: 16, gap: 10, r: 14 },
  };
  const variants: Record<BtnVariant, { bg: string; color: string; border: string }> = {
    primary: { bg: 'var(--accent-500)', color: 'var(--text-on-accent)', border: 'var(--accent-500)' },
    violet: { bg: 'var(--violet-500)', color: 'var(--text-on-violet)', border: 'var(--violet-500)' },
    amber: { bg: 'var(--amber-500)', color: 'var(--text-on-amber)', border: 'var(--amber-500)' },
    ghost: { bg: 'transparent', color: 'var(--text)', border: 'transparent' },
    soft: { bg: 'var(--surface-3)', color: 'var(--text)', border: 'var(--border)' },
    outline: { bg: 'transparent', color: 'var(--text)', border: 'var(--border-2)' },
    danger: { bg: 'transparent', color: 'var(--rose-500)', border: 'var(--border)' },
  };
  const s = sizes[size];
  const v = variants[variant];
  const unavailable = disabled || loading;
  return (
    <button
      type={type ?? 'button'}
      onClick={onClick}
      title={title}
      aria-label={loading ? (loadingLabel ?? ariaLabel ?? title) : (ariaLabel ?? title)}
      aria-busy={loading || undefined}
      disabled={unavailable}
      style={{
        height: s.h,
        padding: `0 ${s.px}px`,
        fontSize: s.fs,
        gap: s.gap,
        borderRadius: s.r,
        background: active ? 'var(--surface-3)' : v.bg,
        color: v.color,
        border: `1px solid ${v.border}`,
        fontFamily: 'var(--font-sans)',
        fontWeight: 500,
        letterSpacing: -0.1,
        cursor: unavailable ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'background-color 120ms ease, border-color 120ms ease, color 120ms ease, opacity 120ms ease, transform 120ms ease',
        width: block ? '100%' : undefined,
        whiteSpace: 'nowrap',
        ...style,
      }}
      onMouseEnter={(e) => {
        if (variant === 'ghost' && !unavailable) e.currentTarget.style.background = 'var(--surface-3)';
      }}
      onMouseLeave={(e) => {
        if (variant === 'ghost' && !active) e.currentTarget.style.background = 'transparent';
      }}
    >
      <span
        style={{
          display: 'inline-grid',
          gridTemplateAreas: '"content"',
          alignItems: 'center',
          justifyItems: 'center',
        }}
      >
        <span
          style={{
            gridArea: 'content',
            display: 'inline-flex',
            alignItems: 'center',
            gap: s.gap,
            opacity: loading ? 0 : 1,
            transition: 'opacity 120ms ease',
          }}
        >
          {icon && <NNIcon name={icon} size={s.fs + 2} />}
          {children}
          {iconRight && <NNIcon name={iconRight} size={s.fs + 2} />}
        </span>
        <span
          aria-hidden
          className={loading ? 'nn-spin' : undefined}
          style={{
            gridArea: 'content',
            display: 'inline-flex',
            opacity: loading ? 1 : 0,
            pointerEvents: 'none',
            transition: 'opacity 120ms ease',
          }}
        >
          <NNIcon name="sync" size={s.fs + 2} />
        </span>
      </span>
    </button>
  );
};

// ─────────────────────────────────────────────
// Badge / Chip
// ─────────────────────────────────────────────
export type BadgeTone = 'neutral' | 'lime' | 'amber' | 'violet' | 'sky' | 'rose' | 'solid';
export type BadgeSize = 'xs' | 'sm' | 'md' | 'lg';

export const NNBadge = ({
  children,
  tone = 'neutral',
  icon,
  size = 'md',
  style,
}: {
  children?: ReactNode;
  tone?: BadgeTone | (string & {});
  icon?: IconName | (string & {});
  size?: BadgeSize;
  style?: CSSProperties;
}) => {
  const tones: Record<string, { bg: string; color: string; border: string }> = {
    neutral: { bg: 'var(--surface-3)', color: 'var(--text-muted)', border: 'var(--border)' },
    lime: { bg: 'var(--tone-lime-bg)', color: 'var(--lime-400)', border: 'var(--tone-lime-border)' },
    amber: { bg: 'var(--tone-amber-bg)', color: 'var(--amber-400)', border: 'var(--tone-amber-border)' },
    violet: { bg: 'var(--tone-violet-bg)', color: 'var(--violet-400)', border: 'var(--tone-violet-border)' },
    sky: { bg: 'var(--tone-sky-bg)', color: 'var(--sky-400)', border: 'var(--tone-sky-border)' },
    rose: { bg: 'var(--tone-rose-bg)', color: 'var(--rose-400)', border: 'var(--tone-rose-border)' },
    solid: { bg: 'var(--accent-500)', color: 'var(--text-on-accent)', border: 'var(--accent-500)' },
  };
  const sizes: Record<BadgeSize, { h: number; px: number; fs: number; gap: number }> = {
    xs: { h: 18, px: 6, fs: 10.5, gap: 3 },
    sm: { h: 22, px: 8, fs: 11, gap: 4 },
    md: { h: 26, px: 10, fs: 12, gap: 5 },
    lg: { h: 30, px: 12, fs: 13, gap: 6 },
  };
  const t = tones[tone] ?? tones.neutral;
  const s = sizes[size];
  return (
    <span
      style={{
        height: s.h,
        padding: `0 ${s.px}px`,
        fontSize: s.fs,
        gap: s.gap,
        background: t.bg,
        color: t.color,
        border: `1px solid ${t.border}`,
        borderRadius: 'var(--r-pill)',
        display: 'inline-flex',
        alignItems: 'center',
        fontWeight: 500,
        letterSpacing: -0.1,
        whiteSpace: 'nowrap',
        fontFamily: 'var(--font-sans)',
        ...style,
      }}
    >
      {icon && <NNIcon name={icon} size={s.fs + 2} />}
      {children}
    </span>
  );
};

// ─────────────────────────────────────────────
// Tag — used for deck/topic tags with # prefix
// ─────────────────────────────────────────────
export type TagColor = 'sky' | 'lime' | 'violet' | 'amber' | 'rose' | 'neutral';

export const NNTag = ({ children, color = 'sky' }: { children: ReactNode; color?: TagColor | (string & {}) }) => {
  const colors: Record<string, string> = {
    sky: 'var(--sky-400)',
    lime: 'var(--lime-400)',
    violet: 'var(--violet-400)',
    amber: 'var(--amber-400)',
    rose: 'var(--rose-400)',
    neutral: 'var(--text-muted)',
  };
  return (
    <span className="mono" style={{ color: colors[color], fontSize: 11.5, fontWeight: 500, letterSpacing: 0.1 }}>
      #{children}
    </span>
  );
};

// ─────────────────────────────────────────────
// Card
// ─────────────────────────────────────────────
export const NNCard = ({
  children,
  padding = 20,
  style,
  hoverable,
  onClick,
}: {
  children?: ReactNode;
  padding?: number;
  style?: CSSProperties;
  hoverable?: boolean;
  onClick?: () => void;
}) => (
  <div
    onClick={onClick}
    style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--r-lg)',
      padding,
      cursor: onClick || hoverable ? 'pointer' : 'default',
      transition: 'background-color 150ms ease, border-color 150ms ease, box-shadow 150ms ease, transform 150ms ease',
      ...style,
    }}
  >
    {children}
  </div>
);

// ─────────────────────────────────────────────
// Kbd — keyboard shortcut display
// ─────────────────────────────────────────────
export const NNKbd = ({ children }: { children: ReactNode }) => (
  <span
    className="mono"
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: 20,
      minWidth: 20,
      padding: '0 5px',
      border: '1px solid var(--border-2)',
      borderBottomWidth: 2,
      borderRadius: 4,
      background: 'var(--surface-2)',
      color: 'var(--text-muted)',
      fontSize: 10.5,
      fontWeight: 500,
    }}
  >
    {children}
  </span>
);

// ─────────────────────────────────────────────
// Logo
// ─────────────────────────────────────────────
export const NNLogo = ({ size = 28, showText = true }: { size?: number; showText?: boolean }) => (
  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
    <svg width={size} height={size} viewBox="0 0 32 32">
      <defs>
        <linearGradient id="nn-logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--accent-400)" />
          <stop offset="1" stopColor="var(--violet-500)" />
        </linearGradient>
      </defs>
      <circle cx="8" cy="9" r="3" fill="url(#nn-logo-g)" />
      <circle cx="24" cy="9" r="2.2" fill="var(--amber-500)" />
      <circle cx="16" cy="22" r="2.8" fill="var(--violet-400)" />
      <circle cx="6" cy="22" r="1.8" fill="var(--sky-400)" />
      <path d="M8 9 L16 22 M24 9 L16 22 M8 9 L6 22" stroke="var(--text-dim)" strokeWidth="1.1" fill="none" strokeLinecap="round" />
    </svg>
    {showText && (
      <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 15, letterSpacing: -0.3, color: 'var(--text)' }}>
        neuro<span style={{ color: 'var(--accent-400)' }}>nexus</span>
      </span>
    )}
  </div>
);

// ─────────────────────────────────────────────
// Plant — stylized plant SVG for garden/streak
// Supports 6 species, each with distinct shape + colour.
// ─────────────────────────────────────────────
type PlantSpeciesLocal = 'fern' | 'cactus' | 'succulent' | 'bonsai' | 'sakura' | 'mushroom';

export const NNPlant = ({
  stage = 3,
  size = 80,
  species = 'fern',
}: {
  stage?: number;
  size?: number;
  species?: PlantSpeciesLocal;
}) => {
  const grow = stage / 5;
  const top = 72 - 44 * grow; // y-coordinate of the plant top at full grow
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      {/* shadow */}
      <ellipse cx="50" cy="85" rx="22" ry="4" fill="var(--plant-shadow)" />
      {/* pot */}
      <path d="M32 72 L35 85 L65 85 L68 72 Z" fill="var(--plant-pot)" stroke="var(--plant-pot-dark)" strokeWidth="0.8" />
      <ellipse cx="50" cy="72" rx="18" ry="3" fill="var(--plant-pot-dark)" />
      <ellipse cx="50" cy="72" rx="16" ry="2.5" fill="color-mix(in srgb, var(--plant-pot-dark) 70%, var(--bg))" />

      {stage > 0 && (
        <g opacity={Math.min(1, grow * 1.5)}>

          {/* ── FERN — arching fronds, bright green ── */}
          {species === 'fern' && (
            <>
              <path d={`M50 72 Q48 ${72 - 25 * grow} 44 ${72 - 40 * grow}`} stroke="var(--plant-green-2)" strokeWidth={2} fill="none" strokeLinecap="round" />
              <path d={`M50 72 Q52 ${72 - 22 * grow} 56 ${72 - 38 * grow}`} stroke="var(--plant-green-3)" strokeWidth={2} fill="none" strokeLinecap="round" />
              <path d={`M50 72 Q50 ${72 - 30 * grow} 50 ${72 - 45 * grow}`} stroke="var(--plant-green-1)" strokeWidth={2.2} fill="none" strokeLinecap="round" />
              {stage > 2 && (
                <>
                  <ellipse cx="44" cy={72 - 38 * grow} rx="4" ry="2.5" fill="var(--plant-green-3)" transform={`rotate(-40 44 ${72 - 38 * grow})`} />
                  <ellipse cx="56" cy={72 - 36 * grow} rx="4" ry="2.5" fill="var(--plant-green-4)" transform={`rotate(40 56 ${72 - 36 * grow})`} />
                  <ellipse cx="50" cy={72 - 45 * grow} rx="3" ry="2" fill="var(--plant-green-2)" />
                </>
              )}
              {stage >= 4 && <circle cx="50" cy={72 - 48 * grow} r="3" fill="var(--amber-500)" />}
              {stage >= 5 && (
                <>
                  <circle cx="44" cy={72 - 40 * grow} r="2" fill="var(--amber-400)" />
                  <circle cx="56" cy={72 - 38 * grow} r="2" fill="var(--amber-400)" />
                </>
              )}
            </>
          )}

          {/* ── CACTUS — vertical segments, spines, muted green ── */}
          {species === 'cactus' && (() => {
            const h = 42 * grow;
            const segH = h / 3;
            const x = 50;
            const base = 72;
            return (
              <>
                {/* main trunk segments */}
                <rect x={x - 5} y={base - h} width={10} height={h} rx={3} fill="var(--plant-green-1)" />
                {stage > 1 && <rect x={x - 4} y={base - h * 0.9} width={8} height={segH * 0.9} rx={2} fill="var(--plant-green-2)" />}
                {/* arm left */}
                {stage > 2 && (
                  <>
                    <rect x={x - 14} y={base - h * 0.6} width={8} height={segH} rx={3} fill="var(--plant-green-1)" />
                    <rect x={x - 12} y={base - h * 0.6 - segH * 0.4} width={6} height={segH * 0.6} rx={2} fill="var(--plant-green-2)" />
                  </>
                )}
                {/* arm right */}
                {stage > 3 && (
                  <>
                    <rect x={x + 6} y={base - h * 0.55} width={8} height={segH * 0.9} rx={3} fill="var(--plant-green-1)" />
                    <rect x={x + 8} y={base - h * 0.55 - segH * 0.35} width={6} height={segH * 0.55} rx={2} fill="var(--plant-green-2)" />
                  </>
                )}
                {/* spines */}
                {stage > 1 && [42, 50, 58].map((lx) => (
                  <React.Fragment key={lx}>
                    <line x1={lx} y1={base - h * 0.5} x2={lx - 3} y2={base - h * 0.5 - 3} stroke="var(--plant-green-4)" strokeWidth={0.8} />
                    <line x1={lx} y1={base - h * 0.5} x2={lx + 3} y2={base - h * 0.5 - 3} stroke="var(--plant-green-4)" strokeWidth={0.8} />
                  </React.Fragment>
                ))}
                {/* bloom on top */}
                {stage >= 5 && <circle cx={x} cy={base - h - 4} r={4} fill="var(--plant-flower)" />}
              </>
            );
          })()}

          {/* ── SUCCULENT — rosette of fleshy leaves, blue-green ── */}
          {species === 'succulent' && (() => {
            const cx = 50, cy = top + 10;
            const r = 14 * grow;
            const leafAngles = [0, 60, 120, 180, 240, 300];
            return (
              <>
                {/* stem */}
                <line x1={cx} y1={72} x2={cx} y2={cy + r * 0.3} stroke="var(--plant-water-1)" strokeWidth={2.5} strokeLinecap="round" />
                {/* outer leaves */}
                {leafAngles.map((angle) => {
                  const rad = (angle * Math.PI) / 180;
                  const lx = cx + Math.cos(rad) * r;
                  const ly = cy + Math.sin(rad) * r * 0.7;
                  return (
                    <ellipse
                      key={angle}
                      cx={lx}
                      cy={ly}
                      rx={r * 0.35}
                      ry={r * 0.55}
                      fill="var(--plant-water-2)"
                      transform={`rotate(${angle} ${lx} ${ly})`}
                      opacity={0.85}
                    />
                  );
                })}
                {/* inner leaves */}
                {stage > 2 && leafAngles.filter((_, i) => i % 2 === 0).map((angle) => {
                  const rad = (angle * Math.PI) / 180;
                  const ir = r * 0.55;
                  const lx = cx + Math.cos(rad) * ir;
                  const ly = cy + Math.sin(rad) * ir * 0.7;
                  return (
                    <ellipse key={`i${angle}`} cx={lx} cy={ly} rx={r * 0.25} ry={r * 0.38} fill="var(--plant-water-3)" transform={`rotate(${angle} ${lx} ${ly})`} />
                  );
                })}
                {/* center */}
                <circle cx={cx} cy={cy} r={r * 0.22} fill="color-mix(in srgb, var(--plant-water-3) 70%, var(--surface))" />
                {stage >= 5 && <circle cx={cx} cy={cy} r={r * 0.1} fill="var(--text-on-violet)" />}
              </>
            );
          })()}

          {/* ── BONSAI — wide spreading crown, dark trunk, earthy tones ── */}
          {species === 'bonsai' && (() => {
            const trunkH = 30 * grow;
            const crownCy = 72 - trunkH;
            const crownR = 20 * grow;
            return (
              <>
                {/* trunk */}
                <path
                  d={`M48 72 Q46 ${72 - trunkH * 0.5} 50 ${crownCy + 4}`}
                  stroke="var(--plant-pot)"
                  strokeWidth={4}
                  fill="none"
                  strokeLinecap="round"
                />
                {/* branch left */}
                {stage > 1 && (
                  <path d={`M50 ${crownCy + 4} Q42 ${crownCy - 4} 38 ${crownCy - 8}`} stroke="var(--plant-pot)" strokeWidth={2.5} fill="none" strokeLinecap="round" />
                )}
                {/* branch right */}
                {stage > 2 && (
                  <path d={`M50 ${crownCy + 4} Q58 ${crownCy - 3} 62 ${crownCy - 6}`} stroke="var(--plant-pot)" strokeWidth={2} fill="none" strokeLinecap="round" />
                )}
                {/* crown foliage blobs */}
                <ellipse cx={50} cy={crownCy - 2} rx={crownR} ry={crownR * 0.65} fill="var(--plant-green-1)" opacity={0.9} />
                {stage > 1 && <ellipse cx={38} cy={crownCy - 7} rx={crownR * 0.55} ry={crownR * 0.42} fill="var(--plant-green-1)" opacity={0.85} />}
                {stage > 2 && <ellipse cx={62} cy={crownCy - 5} rx={crownR * 0.48} ry={crownR * 0.38} fill="var(--plant-green-2)" opacity={0.8} />}
                {stage > 3 && <ellipse cx={50} cy={crownCy - 10} rx={crownR * 0.4} ry={crownR * 0.3} fill="var(--plant-green-2)" opacity={0.85} />}
                {/* highlight */}
                <ellipse cx={46} cy={crownCy - 4} rx={crownR * 0.3} ry={crownR * 0.2} fill="var(--plant-green-3)" opacity={0.35} />
                {/* berries at stage 5 */}
                {stage >= 5 && [42, 52, 60].map((bx) => (
                  <circle key={bx} cx={bx} cy={crownCy - 8} r={2} fill="var(--rose-500)" />
                ))}
              </>
            );
          })()}

          {/* ── SAKURA — pink cherry blossom, slim trunk ── */}
          {species === 'sakura' && (() => {
            const trunkH = 32 * grow;
            const crownCy = 72 - trunkH;
            const crownR = 18 * grow;
            const petalPositions = [
              { dx: -8, dy: -6 }, { dx: 8, dy: -6 }, { dx: -14, dy: 2 }, { dx: 14, dy: 2 },
              { dx: -6, dy: 8 }, { dx: 6, dy: 8 }, { dx: 0, dy: -12 }, { dx: -11, dy: -10 }, { dx: 11, dy: -10 },
            ];
            return (
              <>
                {/* trunk */}
                <path
                  d={`M50 72 Q49 ${72 - trunkH * 0.6} 50 ${crownCy + 4}`}
                  stroke="var(--plant-pot)"
                  strokeWidth={3}
                  fill="none"
                  strokeLinecap="round"
                />
                {/* crown base */}
                <ellipse cx={50} cy={crownCy} rx={crownR} ry={crownR * 0.7} fill="var(--plant-flower-soft)" opacity={0.4} />
                {/* petals / blossoms */}
                {petalPositions.slice(0, Math.ceil(petalPositions.length * grow)).map(({ dx, dy }, i) => {
                  const px = 50 + dx * grow;
                  const py = crownCy + dy * grow;
                  return (
                    <g key={i}>
                      <circle cx={px} cy={py} r={3.5 * grow} fill="var(--plant-flower-soft)" opacity={0.9} />
                      {stage >= 4 && <circle cx={px} cy={py} r={1} fill="var(--plant-flower)" />}
                    </g>
                  );
                })}
                {/* scattered petals at full bloom */}
                {stage >= 5 && [
                  { x: 34, y: crownCy + 10 }, { x: 65, y: crownCy + 8 }, { x: 40, y: crownCy + 14 },
                ].map(({ x, y }, i) => (
                  <circle key={`fp${i}`} cx={x} cy={y} r={2} fill="var(--plant-flower-soft)" opacity={0.6} />
                ))}
              </>
            );
          })()}

          {/* ── MUSHROOM — domed cap, spotted, earthy brown + cream ── */}
          {species === 'mushroom' && (() => {
            const stemH = 22 * grow;
            const capR = 18 * grow;
            const stemBase = 72;
            const stemTop = stemBase - stemH;
            return (
              <>
                {/* stem */}
                <path
                  d={`M44 ${stemBase} Q43 ${stemTop + stemH * 0.5} 44 ${stemTop}`}
                  stroke="var(--plant-stem)"
                  strokeWidth={10}
                  fill="none"
                  strokeLinecap="round"
                />
                <path
                  d={`M56 ${stemBase} Q57 ${stemTop + stemH * 0.5} 56 ${stemTop}`}
                  stroke="var(--plant-stem)"
                  strokeWidth={10}
                  fill="none"
                  strokeLinecap="round"
                />
                <rect x={43} y={stemTop} width={14} height={stemH} rx={5} fill="var(--plant-stem)" />
                {/* gills underside */}
                <ellipse cx={50} cy={stemTop} rx={capR * 0.85} ry={3 * grow} fill="color-mix(in srgb, var(--plant-stem) 70%, var(--surface))" />
                {/* cap */}
                <ellipse cx={50} cy={stemTop - capR * 0.35} rx={capR} ry={capR * 0.72} fill="var(--rose-500)" />
                {/* cap highlight */}
                <ellipse cx={45} cy={stemTop - capR * 0.5} rx={capR * 0.35} ry={capR * 0.22} fill="var(--rose-400)" opacity={0.5} />
                {/* spots */}
                {stage > 1 && [
                  { cx: 50, cy: stemTop - capR * 0.55, r: 3 },
                  { cx: 40, cy: stemTop - capR * 0.3, r: 2 },
                  { cx: 60, cy: stemTop - capR * 0.28, r: 2.5 },
                ].map((s, i) => (
                  <circle key={i} cx={s.cx * grow + 50 * (1 - grow)} cy={s.cy} r={s.r * grow} fill="color-mix(in srgb, var(--selection-text) 80%, transparent)" />
                ))}
                {stage >= 4 && <circle cx={44} cy={stemTop - capR * 0.45} r={1.5 * grow} fill="color-mix(in srgb, var(--selection-text) 80%, transparent)" />}
              </>
            );
          })()}

        </g>
      )}
    </svg>
  );
};

// ─────────────────────────────────────────────
// NNSkeleton — content placeholder with shimmer animation.
//
// Use for loading states where we don't yet know what the content looks like
// (initial bootstrap). Accepts width / height / borderRadius or `style` for
// arbitrary shapes.
//
//   <NNSkeleton height={40} />
//   <NNSkeleton width="60%" height={14} style={{ marginBottom: 8 }} />
// ─────────────────────────────────────────────
export const NNSkeleton = ({
  width = '100%',
  height = 14,
  radius = 8,
  style,
  className,
}: {
  width?: number | string;
  height?: number | string;
  radius?: number;
  style?: React.CSSProperties;
  className?: string;
}) => (
  <span
    aria-hidden
    className={className}
    style={{
      display: 'inline-block',
      width,
      height,
      borderRadius: radius,
      background: 'var(--skeleton-bg)',
      backgroundSize: '200% 100%',
      animation: 'nn-shimmer 1400ms ease-in-out infinite',
      ...style,
    }}
  />
);

/** A stable, chrome-neutral page fallback for route/query suspension. */
export const NNPageSkeleton = ({ compact = false }: { compact?: boolean }) => (
  <div
    aria-busy="true"
    aria-label="Loading"
    style={{
      flex: 1,
      overflow: 'hidden',
      padding: compact ? 16 : 24,
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
    }}
  >
    <NNSkeleton width="38%" height={18} />
    <NNSkeleton width="64%" height={11} />
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
        gap: 12,
        marginTop: 6,
      }}
    >
      <NNSkeleton height={compact ? 92 : 138} />
      <NNSkeleton height={compact ? 92 : 138} />
      <NNSkeleton height={compact ? 92 : 138} />
    </div>
  </div>
);

/** Non-blocking refresh affordance: existing content remains mounted beneath it. */
export const NNInlineRefresh = ({ label }: { label: string }) => (
  <span
    role="status"
    aria-live="polite"
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      color: 'var(--text-dim)',
      fontSize: 11.5,
      fontVariantNumeric: 'tabular-nums',
    }}
  >
    <span className="nn-spin" aria-hidden><NNIcon name="sync" size={13} /></span>
    {label}
  </span>
);

/** Retryable resource error that retains the API correlation reference. */
export const NNLoadError = ({
  title,
  description,
  retryLabel,
  onRetry,
  requestId,
}: {
  title: string;
  description?: string;
  retryLabel: string;
  onRetry: () => void;
  requestId?: string;
}) => (
  <div
    role="alert"
    style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-start',
      gap: 8,
      padding: 16,
      borderRadius: 'var(--r-lg)',
      border: '1px solid var(--tone-rose-border)',
      background: 'var(--tone-rose-bg)',
      color: 'var(--text)',
    }}
  >
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
      <NNIcon name="warning" size={17} color="var(--rose-400)" />
      {title}
    </span>
    {description ? <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{description}</span> : null}
    {requestId ? (
      <span className="mono" style={{ color: 'var(--text-dim)', fontSize: 10.5 }}>
        request: {requestId}
      </span>
    ) : null}
    <NNBtn size="sm" variant="outline" icon="sync" onClick={onRetry}>{retryLabel}</NNBtn>
  </div>
);
