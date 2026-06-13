'use client';

// M5 — SelectionPopover: the floating pill that appears above a text selection
// inside the PDF text layer. Five actions: 5 color dots (highlight), «Заметка»
// (inline note textarea), «В карточку» (QuickCardDialog), «Спросить» (chat
// prefill), «Копировать». Handles iPad Safari's quirky selection events.
//
// M5-T3 polish: pill with subtle shadow + downward arrow indicator, 40px
// touch targets for action buttons, color dots with ring on hover.

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { MarkRect, SourceMarkColor } from '@neuronexus/shared';
import { MARK_RECTS_MAX, SOURCE_MARK_COLORS } from '@neuronexus/shared';
import { clientRectsToMarkRects } from '@/lib/pdf-ink';

type T = (key: string, params?: Record<string, string | number>) => string;

const MARK_COLOR_HEX: Record<SourceMarkColor, string> = {
  lime:   'var(--lime-500)',
  amber:  'var(--amber-400)',
  rose:   'var(--rose-400)',
  sky:    'var(--sky-400)',
  violet: 'var(--violet-400)',
};

export interface SelectionInfo {
  text: string;
  rects: MarkRect[];
  page: number;
  anchorX: number;
  anchorY: number;
  /** Bottom edge of the first selection rect — used to flip the pill below
   *  the selection when there's no room above. */
  anchorBottom: number;
}

export interface SelectionPopoverProps {
  pageEls: Map<number, HTMLDivElement>;
  handMode: boolean;
  onHighlight: (info: SelectionInfo, color: SourceMarkColor) => void;
  onNote: (info: SelectionInfo, noteText: string) => void;
  onCard: (info: SelectionInfo) => void;
  onAsk: (info: SelectionInfo) => void;
  t: T;
}

interface PopoverState {
  info: SelectionInfo;
  noteOpen: boolean;
  noteText: string;
}

export function SelectionPopover({
  pageEls,
  handMode,
  onHighlight,
  onNote,
  onCard,
  onAsk,
  t,
}: SelectionPopoverProps) {
  const [state, setState] = useState<PopoverState | null>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!handMode) setState(null);
  }, [handMode]);

  const capture = useCallback(() => {
    if (!handMode) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      setState(null);
      return;
    }
    const range = sel.getRangeAt(0);
    const text = range.toString().trim();
    if (!text) { setState(null); return; }

    let page = 0;
    let pageBox: DOMRect | null = null;
    for (const [n, el] of pageEls) {
      if (el.contains(range.commonAncestorContainer)) {
        page = n;
        pageBox = el.getBoundingClientRect();
        break;
      }
    }
    if (!page || !pageBox) { setState(null); return; }

    const clientRects = Array.from(range.getClientRects());
    const rects = clientRectsToMarkRects(clientRects, {
      left: pageBox.left,
      top: pageBox.top,
      width: pageBox.width,
      height: pageBox.height,
    }).slice(0, MARK_RECTS_MAX);

    if (rects.length === 0) { setState(null); return; }

    const firstRect = clientRects[0]!;
    const anchorX = (firstRect.left + firstRect.right) / 2;
    const anchorY = firstRect.top;
    const anchorBottom = firstRect.bottom;

    setState((prev) => ({
      info: { text, rects, page, anchorX, anchorY, anchorBottom },
      noteOpen: prev?.noteOpen ?? false,
      noteText: prev?.noteText ?? '',
    }));
  }, [handMode, pageEls]);

  useEffect(() => {
    const onUp = () => { requestAnimationFrame(capture); };
    let selTimer: ReturnType<typeof setTimeout> | null = null;
    const onSC = () => {
      if (selTimer) clearTimeout(selTimer);
      selTimer = setTimeout(capture, 60);
    };
    window.addEventListener('pointerup', onUp);
    document.addEventListener('selectionchange', onSC);
    return () => {
      window.removeEventListener('pointerup', onUp);
      document.removeEventListener('selectionchange', onSC);
      if (selTimer) clearTimeout(selTimer);
    };
  }, [capture]);

  useEffect(() => {
    if (!state) return;
    const onDown = (e: MouseEvent) => {
      const el = document.getElementById('nn-sel-popover');
      if (el && !el.contains(e.target as Node)) {
        setState(null);
      }
    };
    window.addEventListener('mousedown', onDown, { capture: true });
    return () => window.removeEventListener('mousedown', onDown, { capture: true });
  }, [state]);

  if (!state) return null;

  const { info, noteOpen, noteText } = state;

  // Pill width: note-open is wider for the textarea.
  const popW = noteOpen ? 264 : 280;
  const vpW = window.innerWidth;
  let left = info.anchorX - popW / 2;
  if (left < 8) left = 8;
  if (left + popW > vpW - 8) left = vpW - popW - 8;
  // Position above the selection with a small gap + room for the arrow. When
  // there is no room above (the selection is near the top of the viewport),
  // flip BELOW the selection bottom and hide the arrow (which only points up).
  const popH = noteOpen ? 160 : 52;
  const aboveTop = info.anchorY - popH - 10;
  const flipped = aboveTop < 8;
  const top = flipped ? Math.max(8, info.anchorBottom + 10) : aboveTop;

  return (
    <div
      id="nn-sel-popover"
      style={{
        position: 'fixed',
        left,
        top,
        zIndex: 1000,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-lg)',
        boxShadow: 'var(--shadow-lg)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        minWidth: popW,
        width: popW,
      }}
    >
      {/* Main row — color dots + action buttons */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          padding: '6px 8px',
        }}
      >
        {/* Color dots → highlight */}
        {SOURCE_MARK_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            title={t(`notebooks.marks.color_${c}`)}
            aria-label={t(`notebooks.marks.color_${c}`)}
            onMouseDown={(e) => {
              e.preventDefault();
              onHighlight(info, c);
              setState(null);
            }}
            style={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              background: MARK_COLOR_HEX[c],
              border: '2px solid transparent',
              cursor: 'pointer',
              padding: 0,
              flexShrink: 0,
              boxShadow: 'var(--mark-swatch-shadow)',
              transition: 'transform 80ms ease, box-shadow 80ms ease',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.transform = 'scale(1.18)';
              (e.currentTarget as HTMLElement).style.boxShadow = `0 0 0 2px var(--surface), 0 0 0 3px ${MARK_COLOR_HEX[c]}`;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.transform = '';
              (e.currentTarget as HTMLElement).style.boxShadow = 'var(--mark-swatch-shadow)';
            }}
          />
        ))}

        <span style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 3px', flexShrink: 0 }} />

        {/* «Заметка» */}
        <PopBtn
          active={noteOpen}
          onMouseDown={(e) => {
            e.preventDefault();
            setState((s) => s ? { ...s, noteOpen: !s.noteOpen } : s);
            if (!noteOpen) requestAnimationFrame(() => noteRef.current?.focus());
          }}
          label={t('notebooks.marks.note')}
        />

        {/* «В карточку» */}
        <PopBtn
          onMouseDown={(e) => {
            e.preventDefault();
            onCard(info);
            setState(null);
          }}
          label={t('notebooks.marks.cardAction')}
        />

        {/* «Спросить» */}
        <PopBtn
          onMouseDown={(e) => {
            e.preventDefault();
            onAsk(info);
            setState(null);
          }}
          label={t('notebooks.marks.askAction')}
        />

        {/* «Копировать» */}
        <PopBtn
          onMouseDown={(e) => {
            e.preventDefault();
            void navigator.clipboard.writeText(info.text).catch(() => {});
            setState(null);
          }}
          label={t('notebooks.marks.copyAction')}
        />
      </div>

      {/* Inline note textarea */}
      {noteOpen && (
        <div
          style={{
            borderTop: '1px solid var(--border)',
            padding: 8,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <textarea
            ref={noteRef}
            value={noteText}
            onChange={(e) => setState((s) => s ? { ...s, noteText: e.target.value } : s)}
            placeholder={t('notebooks.marks.notePlaceholder')}
            rows={3}
            style={{
              width: '100%',
              padding: '6px 8px',
              borderRadius: 'var(--r-sm)',
              border: '1px solid var(--border)',
              background: 'var(--surface-2)',
              color: 'var(--text)',
              fontSize: 12.5,
              fontFamily: 'var(--font-sans)',
              resize: 'none',
              boxSizing: 'border-box',
              lineHeight: 1.5,
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onNote(info, noteText);
                setState(null);
              }}
              style={{
                height: 30,
                padding: '0 12px',
                borderRadius: 'var(--r-sm)',
                border: 'none',
                background: 'var(--lime-500)',
                color: 'var(--text-on-accent)',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 700,
                fontFamily: 'var(--font-sans)',
              }}
            >
              {t('notebooks.marks.noteSave')}
            </button>
          </div>
        </div>
      )}

      {/* Downward arrow indicator — hidden when the pill is flipped below the
          selection (the arrow only points down toward the selection). */}
      {!flipped && (
      <div
        className="nn-sel-arrow"
        style={{
          position: 'absolute',
          bottom: -7,
          left: Math.min(Math.max(info.anchorX - left - 6, 12), popW - 24),
          width: 12,
          height: 7,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: 10,
            height: 10,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            transform: 'rotate(45deg)',
            marginTop: -6,
            marginLeft: 1,
            boxShadow: 'var(--mark-arrow-shadow)',
          }}
        />
      </div>
      )}
    </div>
  );
}

function PopBtn({
  active,
  onMouseDown,
  label,
}: {
  active?: boolean;
  onMouseDown: React.MouseEventHandler<HTMLButtonElement>;
  label: string;
}) {
  return (
    <button
      type="button"
      onMouseDown={onMouseDown}
      aria-pressed={active}
      style={{
        height: 30,
        padding: '0 7px',
        borderRadius: 'var(--r-sm)',
        border: active ? '1px solid var(--lime-500)' : '1px solid var(--border)',
        background: active
          ? 'color-mix(in srgb, var(--lime-500) 16%, transparent)'
          : 'var(--surface-2)',
        color: active ? 'var(--lime-300)' : 'var(--text-muted)',
        cursor: 'pointer',
        fontSize: 11.5,
        fontWeight: 600,
        fontFamily: 'var(--font-sans)',
        whiteSpace: 'nowrap',
        flexShrink: 0,
        transition: 'background 80ms, color 80ms',
      }}
    >
      {label}
    </button>
  );
}
