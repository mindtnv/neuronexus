'use client';

// M4 — the floating reader toolbar (inside the reader panel, thumb-reachable on
// iPad: ≥40 px touch targets). Tools hand/pen/highlighter/eraser, 6 colors, 3
// widths, undo/redo, finger-draw toggle, zoom −/%/＋, page jump, and the
// «PDF | Текст» mode toggle. All labels i18n (notebooks.reader.*). The local
// inline SVGs cover the ink tools the global NNIcon set doesn't have.

import React from 'react';
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
const ToolIcon = ({ name, size = 18 }: { name: InkTool | 'undo' | 'redo' | 'zin' | 'zout' | 'mode'; size?: number }) => {
  const paths: Record<string, React.ReactNode> = {
    hand: <path d="M8 13V5.5a1.5 1.5 0 013 0V11m0-1.5a1.5 1.5 0 013 0V12m0-1a1.5 1.5 0 013 0v4a5 5 0 01-5 5h-1.5a4 4 0 01-3-1.4L7 16c-1-1.2-2-2-2-3.2 0-1.2 1.4-1.6 2.4-.6L8 13" {...stroke} />,
    pen: <path d="M4 20h4L19 9a2 2 0 00-3-3L5 17l-1 3zM14 7l3 3" {...stroke} />,
    highlighter: <><path d="M9 14l-3 3 .5 2.5L9 20l9-9-3-3-6 6z" {...stroke} /><path d="M14 6l4 4 2-2a2 2 0 00-3-3l-3 1z" {...stroke} /><path d="M5 21h6" {...stroke} /></>,
    eraser: <><path d="M7 17l-3-3a2 2 0 010-3l7-7a2 2 0 013 0l4 4a2 2 0 010 3l-6 6H8z" {...stroke} /><path d="M10 8l6 6" {...stroke} /></>,
    undo: <path d="M9 7L4 12l5 5M4 12h11a5 5 0 010 10h-1" {...stroke} />,
    redo: <path d="M15 7l5 5-5 5M20 12H9a5 5 0 000 10h1" {...stroke} />,
    zin: <><circle cx="10.5" cy="10.5" r="6" {...stroke} /><path d="M20 20l-5-5M10.5 8v5M8 10.5h5" {...stroke} /></>,
    zout: <><circle cx="10.5" cy="10.5" r="6" {...stroke} /><path d="M20 20l-5-5M8 10.5h5" {...stroke} /></>,
    mode: <><rect x="3" y="4" width="8" height="16" rx="1.5" {...stroke} /><path d="M14 7h7M14 12h7M14 17h5" {...stroke} /></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: 'block' }}>
      {paths[name] ?? null}
    </svg>
  );
};

const TouchBtn = ({
  active,
  disabled,
  onClick,
  title,
  ariaLabel,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  title?: string;
  ariaLabel?: string;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    title={title}
    aria-label={ariaLabel ?? title}
    aria-pressed={active}
    style={{
      width: 40,
      height: 40,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 'var(--r-md)',
      border: active ? '1px solid var(--lime-500)' : '1px solid var(--border)',
      background: active ? 'color-mix(in srgb, var(--lime-500) 18%, transparent)' : 'var(--surface-2)',
      color: active ? 'var(--lime-300)' : 'var(--text-muted)',
      cursor: disabled ? 'default' : 'pointer',
      opacity: disabled ? 0.4 : 1,
      flexShrink: 0,
      padding: 0,
    }}
  >
    {children}
  </button>
);

const Divider = () => (
  <span style={{ width: 1, height: 26, background: 'var(--border)', flexShrink: 0, margin: '0 2px' }} />
);

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
  const showInk = tool !== 'hand';
  return (
    <div
      role="toolbar"
      aria-label={t('notebooks.reader.toolbar')}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 6,
        padding: '8px 10px',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-lg)',
        boxShadow: 'var(--shadow-lg)',
      }}
    >
      {/* Mode toggle PDF | Text */}
      <div style={{ display: 'inline-flex', borderRadius: 'var(--r-md)', overflow: 'hidden', border: '1px solid var(--border)' }}>
        {(['pdf', 'text'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onMode(m)}
            aria-pressed={mode === m}
            style={{
              height: 40,
              padding: '0 12px',
              border: 'none',
              cursor: 'pointer',
              fontSize: 12.5,
              fontWeight: 600,
              fontFamily: 'var(--font-sans)',
              background: mode === m ? 'var(--lime-500)' : 'var(--surface-2)',
              color: mode === m ? '#0d1608' : 'var(--text-muted)',
            }}
          >
            {m === 'pdf' ? t('notebooks.reader.modePdf') : t('notebooks.reader.modeText')}
          </button>
        ))}
      </div>

      <Divider />

      {/* Tools */}
      <TouchBtn active={tool === 'hand'} onClick={() => onTool('hand')} title={t('notebooks.reader.toolHand')}>
        <ToolIcon name="hand" />
      </TouchBtn>
      <TouchBtn active={tool === 'pen'} onClick={() => onTool('pen')} title={t('notebooks.reader.toolPen')}>
        <ToolIcon name="pen" />
      </TouchBtn>
      <TouchBtn active={tool === 'highlighter'} onClick={() => onTool('highlighter')} title={t('notebooks.reader.toolHighlighter')}>
        <ToolIcon name="highlighter" />
      </TouchBtn>
      <TouchBtn active={tool === 'eraser'} onClick={() => onTool('eraser')} title={t('notebooks.reader.toolEraser')}>
        <ToolIcon name="eraser" />
      </TouchBtn>

      {showInk && tool !== 'eraser' && (
        <>
          <Divider />
          {/* Colors */}
          <div style={{ display: 'inline-flex', gap: 4 }}>
            {INK_COLORS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onColor(c.hex)}
                aria-label={t(`notebooks.reader.color_${c.id}`)}
                title={t(`notebooks.reader.color_${c.id}`)}
                aria-pressed={color === c.hex}
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: '50%',
                  background: c.hex,
                  cursor: 'pointer',
                  border: color === c.hex ? '2px solid var(--text)' : '2px solid var(--border)',
                  boxShadow: color === c.hex ? '0 0 0 2px var(--surface)' : 'none',
                  padding: 0,
                  flexShrink: 0,
                }}
              />
            ))}
          </div>
          <Divider />
          {/* Widths */}
          <div style={{ display: 'inline-flex', gap: 4 }}>
            {INK_WIDTHS.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onWidth(i)}
                aria-label={t('notebooks.reader.width', { n: i + 1 })}
                title={t('notebooks.reader.width', { n: i + 1 })}
                aria-pressed={widthIdx === i}
                style={{
                  width: 32,
                  height: 32,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 'var(--r-md)',
                  border: widthIdx === i ? '1px solid var(--lime-500)' : '1px solid var(--border)',
                  background: widthIdx === i ? 'color-mix(in srgb, var(--lime-500) 18%, transparent)' : 'var(--surface-2)',
                  cursor: 'pointer',
                  padding: 0,
                  flexShrink: 0,
                }}
              >
                <span style={{ width: 18, height: (i + 1) * 2 + 1, borderRadius: 99, background: 'var(--text)' }} />
              </button>
            ))}
          </div>
        </>
      )}

      <Divider />

      {/* Undo / redo */}
      <TouchBtn disabled={!canUndo} onClick={onUndo} title={t('notebooks.reader.undo')}>
        <ToolIcon name="undo" />
      </TouchBtn>
      <TouchBtn disabled={!canRedo} onClick={onRedo} title={t('notebooks.reader.redo')}>
        <ToolIcon name="redo" />
      </TouchBtn>

      <Divider />

      {/* Finger-draw toggle */}
      <TouchBtn active={fingerDraw} onClick={() => onFingerDraw(!fingerDraw)} title={t('notebooks.reader.fingerDraw')}>
        <ToolIcon name="hand" size={16} />
      </TouchBtn>

      <Divider />

      {/* Zoom */}
      <TouchBtn onClick={() => onZoom(-0.2)} title={t('notebooks.reader.zoomOut')}>
        <ToolIcon name="zout" />
      </TouchBtn>
      <button
        type="button"
        onClick={onZoomReset}
        title={t('notebooks.reader.zoomReset')}
        style={{
          height: 40,
          minWidth: 52,
          padding: '0 8px',
          borderRadius: 'var(--r-md)',
          border: '1px solid var(--border)',
          background: 'var(--surface-2)',
          color: 'var(--text-muted)',
          cursor: 'pointer',
          fontSize: 12.5,
          fontFamily: 'var(--font-mono)',
          flexShrink: 0,
        }}
      >
        {Math.round(scale * 100)}%
      </button>
      <TouchBtn onClick={() => onZoom(0.2)} title={t('notebooks.reader.zoomIn')}>
        <ToolIcon name="zin" />
      </TouchBtn>

      <Divider />

      {/* Page jump */}
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <input
          type="number"
          min={1}
          max={total || 1}
          value={page}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v)) onJumpPage(v);
          }}
          aria-label={t('notebooks.reader.pageJump')}
          style={{
            width: 56,
            height: 40,
            textAlign: 'center',
            borderRadius: 'var(--r-md)',
            border: '1px solid var(--border)',
            background: 'var(--surface-2)',
            color: 'var(--text)',
            fontSize: 13,
            fontFamily: 'var(--font-mono)',
          }}
        />
        <span style={{ fontSize: 12, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
          / {total || '—'}
        </span>
      </div>

      <span style={{ flex: 1 }} />

      {/* Save status */}
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
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 5,
          height: 40,
          padding: '0 10px',
          borderRadius: 'var(--r-md)',
          border: '1px solid var(--rose-400)',
          background: 'rgba(232,120,138,0.12)',
          color: 'var(--rose-400)',
          cursor: 'pointer',
          fontSize: 12,
        }}
      >
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--rose-400)' }} />
        {t('notebooks.reader.saveError')}
      </button>
    );
  }
  const dot = saveState === 'saving' ? 'var(--amber-400)' : 'var(--lime-400)';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-dim)', padding: '0 6px' }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot }} />
      {t(saveState === 'saving' ? 'notebooks.reader.saving' : 'notebooks.reader.saved')}
    </span>
  );
};
