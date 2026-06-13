'use client';

// M4 — the floating reader toolbar (inside the reader panel, thumb-reachable on
// iPad: ≥40 px touch targets). Tools hand/pen/highlighter/eraser, 6 colors, 3
// widths, undo/redo, finger-draw toggle, zoom −/%/＋, page jump, and the
// «PDF | Текст» mode toggle. All labels i18n (notebooks.reader.*). The local
// inline SVGs cover the ink tools the global NNIcon set doesn't have.
//
// M5-T3 — visual polish: one compact sticky row, frosted backdrop, segmented
// groups with 1-px separators, 36-px icon buttons (.nn-tb-btn), save-status
// as a tiny pulsing/idle dot with tooltip. Colors+widths collapsed into the
// main row (no flyout needed for 5 colors + 3 widths).

import React, { useState } from 'react';
import type { InkTool, SaveState } from './types';
import { INK_COLORS, INK_WIDTHS } from './types';

type T = (key: string, params?: Record<string, string | number>) => string;

// ── Local inline icons (ink tools not in the global NNIcon set) ───────────────
const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};
const ToolIcon = ({ name, size = 16 }: { name: InkTool | 'undo' | 'redo' | 'zin' | 'zout' | 'mode' | 'markup' | 'toc'; size?: number }) => {
  const paths: Record<string, React.ReactNode> = {
    // L2 — table of contents (list-with-bullets).
    toc: <><path d="M8 6h13M8 12h13M8 18h13" {...stroke} /><circle cx="3.5" cy="6" r="1" {...stroke} /><circle cx="3.5" cy="12" r="1" {...stroke} /><circle cx="3.5" cy="18" r="1" {...stroke} /></>,
    hand: <path d="M8 13V5.5a1.5 1.5 0 013 0V11m0-1.5a1.5 1.5 0 013 0V12m0-1a1.5 1.5 0 013 0v4a5 5 0 01-5 5h-1.5a4 4 0 01-3-1.4L7 16c-1-1.2-2-2-2-3.2 0-1.2 1.4-1.6 2.4-.6L8 13" {...stroke} />,
    pen: <path d="M4 20h4L19 9a2 2 0 00-3-3L5 17l-1 3zM14 7l3 3" {...stroke} />,
    highlighter: <><path d="M9 14l-3 3 .5 2.5L9 20l9-9-3-3-6 6z" {...stroke} /><path d="M14 6l4 4 2-2a2 2 0 00-3-3l-3 1z" {...stroke} /><path d="M5 21h6" {...stroke} /></>,
    eraser: <><path d="M7 17l-3-3a2 2 0 010-3l7-7a2 2 0 013 0l4 4a2 2 0 010 3l-6 6H8z" {...stroke} /><path d="M10 8l6 6" {...stroke} /></>,
    // W3 — smart-card (✨ wand): marquee-select a region → AI proposes a card.
    'smart-card': <><path d="M5 3v4M3 5h4M19 17v4M17 19h4M13 3l2 2-8 8-2-2 8-8z" {...stroke} /><path d="M13 3l2 2" {...stroke} /></>,
    undo: <path d="M9 7L4 12l5 5M4 12h11a5 5 0 010 10h-1" {...stroke} />,
    redo: <path d="M15 7l5 5-5 5M20 12H9a5 5 0 000 10h1" {...stroke} />,
    zin:  <><circle cx="10.5" cy="10.5" r="6" {...stroke} /><path d="M20 20l-5-5M10.5 8v5M8 10.5h5" {...stroke} /></>,
    zout: <><circle cx="10.5" cy="10.5" r="6" {...stroke} /><path d="M20 20l-5-5M8 10.5h5" {...stroke} /></>,
    mode: <><rect x="3" y="4" width="8" height="16" rx="1.5" {...stroke} /><path d="M14 7h7M14 12h7M14 17h5" {...stroke} /></>,
    markup: <><path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" {...stroke} /></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: 'block' }}>
      {paths[name] ?? null}
    </svg>
  );
};

// 36-px toolbar button using the .nn-tb-btn CSS class.
const TBtn = ({
  active,
  disabled,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={title}
    aria-label={title}
    aria-pressed={active}
    className={`nn-tb-btn${active ? ' active' : ''}`}
  >
    {children}
  </button>
);

// 1-px group separator
const Sep = () => <span className="nn-tb-sep" />;

export interface ReaderToolbarProps {
  tool: InkTool;
  color: string;
  widthIdx: number;
  fingerDraw: boolean;
  scale: number;
  page: number;
  total: number;
  saveState: SaveState;
  canUndo: boolean;
  canRedo: boolean;
  mode: 'pdf' | 'text';
  marksCount?: number;
  marksPanelOpen?: boolean;
  onToggleMarksPanel?: () => void;
  /** L2 — table-of-contents toggle (library reader). Hidden when undefined or
   *  the document has no outline/headings (`tocAvailable === false`). */
  tocOpen?: boolean;
  tocAvailable?: boolean;
  onToggleToc?: () => void;
  onTool: (t: InkTool) => void;
  onColor: (hex: string) => void;
  onWidth: (idx: number) => void;
  onFingerDraw: (v: boolean) => void;
  onZoom: (delta: number) => void;
  onZoomReset: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onJumpPage: (page: number) => void;
  onMode: (m: 'pdf' | 'text') => void;
  onRetrySave: () => void;
  t: T;
}

export const ReaderToolbar = ({
  tool,
  color,
  widthIdx,
  fingerDraw,
  scale,
  page,
  total,
  saveState,
  canUndo,
  canRedo,
  mode,
  marksCount = 0,
  marksPanelOpen = false,
  onToggleMarksPanel,
  tocOpen = false,
  tocAvailable = false,
  onToggleToc,
  onTool,
  onColor,
  onWidth,
  onFingerDraw,
  onZoom,
  onZoomReset,
  onUndo,
  onRedo,
  onJumpPage,
  onMode,
  onRetrySave,
  t,
}: ReaderToolbarProps) => {
  const showInkExtras = tool !== 'hand' && tool !== 'eraser' && tool !== 'smart-card';
  const [jumpVal, setJumpVal] = useState(String(page));

  // Keep jump input in sync with programmatic page changes.
  React.useEffect(() => { setJumpVal(String(page)); }, [page]);

  return (
    <div
      role="toolbar"
      aria-label={t('notebooks.reader.toolbar')}
      className="nn-chrome nn-reader-toolbar"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        padding: '4px 10px',
        flexShrink: 0,
        overflowX: 'auto',
        overflowY: 'hidden',
      }}
    >
      {/* ── Group 0: table of contents (library reader; hidden when no outline) ── */}
      {onToggleToc && tocAvailable && (
        <>
          <TBtn active={tocOpen} onClick={onToggleToc} title={t('library.reader.toc')}>
            <ToolIcon name="toc" />
          </TBtn>
          <Sep />
        </>
      )}

      {/* ── Group 1: mode toggle PDF | Текст ── */}
      <div
        style={{
          display: 'inline-flex',
          borderRadius: 'var(--r-sm)',
          overflow: 'hidden',
          border: '1px solid var(--border)',
          flexShrink: 0,
        }}
      >
        {(['pdf', 'text'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onMode(m)}
            aria-pressed={mode === m}
            title={m === 'pdf' ? t('notebooks.reader.modePdf') : t('notebooks.reader.modeText')}
            style={{
              height: 28,
              padding: '0 10px',
              border: 'none',
              cursor: 'pointer',
              fontSize: 11.5,
              fontWeight: 700,
              fontFamily: 'var(--font-sans)',
              letterSpacing: '0.02em',
              background: mode === m
                ? 'color-mix(in srgb, var(--lime-500) 20%, var(--surface-2))'
                : 'var(--surface-2)',
              color: mode === m ? 'var(--lime-300)' : 'var(--text-muted)',
              transition: 'background 100ms, color 100ms',
              flexShrink: 0,
            }}
          >
            {m === 'pdf' ? t('notebooks.reader.modePdf') : t('notebooks.reader.modeText')}
          </button>
        ))}
      </div>

      <Sep />

      {/* ── Group 2: ink tools ── */}
      <TBtn active={tool === 'hand'} onClick={() => onTool('hand')} title={t('notebooks.reader.toolHand')}>
        <ToolIcon name="hand" />
      </TBtn>
      <TBtn active={tool === 'pen'} onClick={() => onTool('pen')} title={t('notebooks.reader.toolPen')}>
        <ToolIcon name="pen" />
      </TBtn>
      <TBtn active={tool === 'highlighter'} onClick={() => onTool('highlighter')} title={t('notebooks.reader.toolHighlighter')}>
        <ToolIcon name="highlighter" />
      </TBtn>
      <TBtn active={tool === 'eraser'} onClick={() => onTool('eraser')} title={t('notebooks.reader.toolEraser')}>
        <ToolIcon name="eraser" />
      </TBtn>
      <TBtn active={tool === 'smart-card'} onClick={() => onTool('smart-card')} title={t('notebooks.reader.toolSmartCard')}>
        <ToolIcon name="smart-card" />
      </TBtn>

      {/* ── Group 3: colors + widths (only when an ink tool is active) ── */}
      {showInkExtras && (
        <>
          <Sep />
          {/* Color dots */}
          {INK_COLORS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onColor(c.hex)}
              aria-label={t(`notebooks.reader.color_${c.id}`)}
              title={t(`notebooks.reader.color_${c.id}`)}
              aria-pressed={color === c.hex}
              style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                background: c.hex,
                cursor: 'pointer',
                border: color === c.hex
                  ? '2px solid var(--text)'
                  : '2px solid transparent',
                boxShadow: color === c.hex
                  ? '0 0 0 2px var(--surface-2), 0 0 0 3px var(--text)'
                  : 'var(--mark-swatch-shadow)',
                padding: 0,
                flexShrink: 0,
                transition: 'box-shadow 100ms',
              }}
            />
          ))}
          <Sep />
          {/* Width buttons */}
          {INK_WIDTHS.map((_, i) => (
            <TBtn
              key={i}
              active={widthIdx === i}
              onClick={() => onWidth(i)}
              title={t('notebooks.reader.width', { n: i + 1 })}
            >
              <span
                style={{
                  width: 14 + i * 2,
                  height: (i + 1) * 2 + 1,
                  borderRadius: 99,
                  background: 'currentColor',
                  display: 'block',
                }}
              />
            </TBtn>
          ))}
        </>
      )}

      <Sep />

      {/* ── Group 4: undo / redo ── */}
      <TBtn disabled={!canUndo} onClick={onUndo} title={t('notebooks.reader.undo')}>
        <ToolIcon name="undo" />
      </TBtn>
      <TBtn disabled={!canRedo} onClick={onRedo} title={t('notebooks.reader.redo')}>
        <ToolIcon name="redo" />
      </TBtn>

      <Sep />

      {/* ── Group 5: marks panel toggle ── */}
      {onToggleMarksPanel && (
        <TBtn
          active={marksPanelOpen}
          onClick={onToggleMarksPanel}
          title={t('notebooks.marks.panelTitle')}
        >
          <span style={{ position: 'relative', display: 'inline-flex' }}>
            <ToolIcon name="markup" />
            {marksCount > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: -5,
                  right: -6,
                  minWidth: 14,
                  height: 14,
                  borderRadius: 7,
                  background: marksPanelOpen ? 'var(--lime-500)' : 'var(--ink-600)',
                  color: marksPanelOpen ? 'var(--text-on-accent)' : 'var(--text)',
                  fontSize: 9,
                  fontWeight: 700,
                  fontFamily: 'var(--font-sans)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0 3px',
                  lineHeight: 1,
                }}
              >
                {marksCount > 99 ? '99+' : marksCount}
              </span>
            )}
          </span>
        </TBtn>
      )}

      {/* ── Group 6: zoom ── */}
      <Sep />
      <TBtn onClick={() => onZoom(-0.2)} title={t('notebooks.reader.zoomOut')}>
        <ToolIcon name="zout" />
      </TBtn>
      <button
        type="button"
        onClick={onZoomReset}
        title={t('notebooks.reader.zoomReset')}
        style={{
          height: 28,
          minWidth: 46,
          padding: '0 6px',
          borderRadius: 'var(--r-sm)',
          border: '1px solid var(--border)',
          background: 'var(--surface-2)',
          color: 'var(--text-muted)',
          cursor: 'pointer',
          fontSize: 11,
          fontFamily: 'var(--font-mono)',
          flexShrink: 0,
        }}
      >
        {Math.round(scale * 100)}%
      </button>
      <TBtn onClick={() => onZoom(0.2)} title={t('notebooks.reader.zoomIn')}>
        <ToolIcon name="zin" />
      </TBtn>

      {/* ── Group 7: page jump ── */}
      <Sep />
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
        <input
          type="number"
          min={1}
          max={total || 1}
          value={jumpVal}
          onChange={(e) => setJumpVal(e.target.value)}
          onBlur={() => {
            const v = Number(jumpVal);
            if (Number.isFinite(v) && v >= 1) onJumpPage(v);
            else setJumpVal(String(page));
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const v = Number(jumpVal);
              if (Number.isFinite(v) && v >= 1) onJumpPage(v);
            }
          }}
          aria-label={t('notebooks.reader.pageJump')}
          title={t('notebooks.reader.pageJump')}
          style={{
            width: 42,
            height: 28,
            textAlign: 'center',
            borderRadius: 'var(--r-sm)',
            border: '1px solid var(--border)',
            background: 'var(--surface-2)',
            color: 'var(--text)',
            fontSize: 12,
            fontFamily: 'var(--font-mono)',
          }}
        />
        <span style={{ fontSize: 11.5, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
          / {total || '—'}
        </span>
      </div>

      {/* ── Save status dot (right-aligned) ── */}
      <span style={{ flex: 1, minWidth: 4 }} />
      <SaveDot saveState={saveState} onRetry={onRetrySave} t={t} />
    </div>
  );
};

const SaveDot = ({ saveState, onRetry, t }: { saveState: SaveState; onRetry: () => void; t: T }) => {
  if (saveState === 'idle') return null;
  if (saveState === 'error') {
    return (
      <button
        type="button"
        onClick={onRetry}
        title={t('notebooks.reader.saveError')}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          height: 26,
          padding: '0 8px',
          borderRadius: 'var(--r-sm)',
          border: '1px solid var(--rose-400)',
          background: 'var(--tone-rose-bg)',
          color: 'var(--rose-400)',
          cursor: 'pointer',
          fontSize: 11.5,
          fontWeight: 600,
          fontFamily: 'var(--font-sans)',
          flexShrink: 0,
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--rose-400)', flexShrink: 0 }} />
        {t('notebooks.reader.saveError')}
      </button>
    );
  }
  const dotColor = saveState === 'saving' ? 'var(--amber-400)' : 'var(--lime-400)';
  const dotClass = saveState === 'saving' ? 'nn-save-dot-saving' : '';
  return (
    <span
      title={t(saveState === 'saving' ? 'notebooks.reader.saving' : 'notebooks.reader.saved')}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 4px',
        flexShrink: 0,
      }}
    >
      <span className={dotClass} style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor, display: 'block' }} />
    </span>
  );
};
