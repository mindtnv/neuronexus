'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { NNBtn, NNIcon } from '@/components/ui';
import { useT } from '@/lib/i18n';

// ─────────────────────────────────────────────
// NeuroNexus — promise-based dialog system
//
// Drop-in replacement for window.confirm / prompt / alert, styled to the
// design system. Get the imperative API via useDialog():
//
//   const { confirm, prompt, select, alert } = useDialog();
//   if (!(await confirm({ title: '…', danger: true }))) return;
//
// One dialog is rendered at a time (single, not queued). Esc / backdrop
// cancel; Enter confirms (except inside a textarea). Focus is trapped and
// restored on close; body scroll is locked while open.
// ─────────────────────────────────────────────

interface ConfirmOpts {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface PromptOpts {
  title: string;
  message?: string;
  label?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Return an error string to block, or null/undefined to allow. */
  validate?: (value: string) => string | null | undefined;
}

interface SelectOption<T> {
  value: T;
  label: string;
  /** CSS color string — renders a chip swatch (e.g. for the recolor picker). */
  swatch?: string;
}

interface SelectOpts<T> {
  title: string;
  message?: string;
  options: SelectOption<T>[];
  value?: T;
  confirmLabel?: string;
  cancelLabel?: string;
  /**
   * Show a search filter box above the option list. Defaults to auto: enabled
   * once there are >= 8 options (short pickers like recolor stay searchless).
   */
  searchable?: boolean;
}

interface AlertOpts {
  title: string;
  message?: string;
  okLabel?: string;
}

export interface DialogApi {
  confirm: (opts: ConfirmOpts) => Promise<boolean>;
  prompt: (opts: PromptOpts) => Promise<string | null>;
  select: <T>(opts: SelectOpts<T>) => Promise<T | null>;
  alert: (opts: AlertOpts) => Promise<void>;
}

// Discriminated union of the active dialog request.
type ActiveDialog =
  | { kind: 'confirm'; opts: ConfirmOpts; resolve: (v: boolean) => void }
  | { kind: 'prompt'; opts: PromptOpts; resolve: (v: string | null) => void }
  // `select` is type-erased here; the public API re-types it via the hook.
  | { kind: 'select'; opts: SelectOpts<unknown>; resolve: (v: unknown) => void }
  | { kind: 'alert'; opts: AlertOpts; resolve: () => void };

const DialogCtx = createContext<DialogApi | null>(null);

export function useDialog(): DialogApi {
  const ctx = useContext(DialogCtx);
  if (!ctx) {
    throw new Error('useDialog must be used within a DialogProvider');
  }
  return ctx;
}

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState<ActiveDialog | null>(null);

  const confirm = useCallback(
    (opts: ConfirmOpts) =>
      new Promise<boolean>((resolve) => {
        setActive({ kind: 'confirm', opts, resolve });
      }),
    [],
  );

  const prompt = useCallback(
    (opts: PromptOpts) =>
      new Promise<string | null>((resolve) => {
        setActive({ kind: 'prompt', opts, resolve });
      }),
    [],
  );

  const select = useCallback(
    <T,>(opts: SelectOpts<T>) =>
      new Promise<T | null>((resolve) => {
        setActive({
          kind: 'select',
          opts: opts as SelectOpts<unknown>,
          resolve: resolve as (v: unknown) => void,
        });
      }),
    [],
  );

  const alert = useCallback(
    (opts: AlertOpts) =>
      new Promise<void>((resolve) => {
        setActive({ kind: 'alert', opts, resolve });
      }),
    [],
  );

  const api = useMemo<DialogApi>(
    () => ({ confirm, prompt, select, alert }),
    [confirm, prompt, select, alert],
  );

  const handleClose = useCallback(() => setActive(null), []);

  return (
    <DialogCtx.Provider value={api}>
      {children}
      {active && <DialogHost dialog={active} onClose={handleClose} />}
    </DialogCtx.Provider>
  );
}

// ─────────────────────────────────────────────
// DialogHost — renders the single active dialog + handles a11y/focus/keys.
// ─────────────────────────────────────────────

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function DialogHost({ dialog, onClose }: { dialog: ActiveDialog; onClose: () => void }) {
  const t = useT();
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectSearchRef = useRef<HTMLInputElement>(null);
  const titleId = useRef(`nn-dialog-title-${Math.random().toString(36).slice(2, 8)}`);
  const prevFocus = useRef<HTMLElement | null>(null);

  const [value, setValue] = useState(
    dialog.kind === 'prompt' ? dialog.opts.defaultValue ?? '' : '',
  );
  const [error, setError] = useState<string | null>(null);
  const [selectValue, setSelectValue] = useState<unknown>(
    dialog.kind === 'select' ? dialog.opts.value : undefined,
  );
  const [selectQuery, setSelectQuery] = useState('');

  // Auto-enable the search box for long option lists (>= 8); short pickers
  // (recolor swatches) stay searchless unless `searchable` is set explicitly.
  const selectSearchable =
    dialog.kind === 'select' &&
    (dialog.opts.searchable ?? dialog.opts.options.length >= 8);

  const filteredSelectOptions =
    dialog.kind === 'select'
      ? selectSearchable && selectQuery.trim()
        ? dialog.opts.options.filter((o) =>
            o.label.toLowerCase().includes(selectQuery.trim().toLowerCase()),
          )
        : dialog.opts.options
      : [];

  // Cancel: resolve with the negative value for this dialog kind.
  const cancel = useCallback(() => {
    if (dialog.kind === 'confirm') dialog.resolve(false);
    else if (dialog.kind === 'prompt') dialog.resolve(null);
    else if (dialog.kind === 'select') dialog.resolve(null);
    else dialog.resolve();
    onClose();
  }, [dialog, onClose]);

  const accept = useCallback(() => {
    if (dialog.kind === 'confirm') {
      dialog.resolve(true);
      onClose();
    } else if (dialog.kind === 'prompt') {
      const trimmed = value.trim();
      const validationError = dialog.opts.validate?.(trimmed);
      if (validationError) {
        setError(validationError);
        return;
      }
      // Empty after trim → treat as cancel unless validate explicitly allowed it.
      if (!trimmed && !dialog.opts.validate) {
        dialog.resolve(null);
        onClose();
        return;
      }
      dialog.resolve(trimmed);
      onClose();
    } else if (dialog.kind === 'select') {
      if (selectValue === undefined) return;
      dialog.resolve(selectValue);
      onClose();
    } else {
      dialog.resolve();
      onClose();
    }
  }, [dialog, value, selectValue, onClose]);

  // Mount: remember the previously-focused element, lock scroll, focus primary.
  useEffect(() => {
    prevFocus.current = (document.activeElement as HTMLElement) ?? null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Focus the primary control after the panel mounts.
    const id = window.requestAnimationFrame(() => {
      if (dialog.kind === 'prompt' && inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
      } else if (selectSearchable && selectSearchRef.current) {
        // Searchable select: focus the search box so the user can type to filter.
        selectSearchRef.current.focus();
      } else {
        const focusables = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
        // Prefer the primary (last) button for confirm/select/alert.
        const last = focusables?.[focusables.length - 1];
        last?.focus();
      }
    });

    return () => {
      window.cancelAnimationFrame(id);
      document.body.style.overflow = prevOverflow;
      prevFocus.current?.focus?.();
    };
    // Only run on mount for this dialog instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Key handling: Esc cancels, Enter confirms (not in a textarea), Tab traps.
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
        return;
      }
      if (e.key === 'Enter') {
        const target = e.target as HTMLElement;
        if (target.tagName === 'TEXTAREA') return;
        e.preventDefault();
        accept();
        return;
      }
      if (e.key === 'Tab') {
        const focusables = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
        if (!focusables || focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const activeEl = document.activeElement;
        if (e.shiftKey && activeEl === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && activeEl === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [cancel, accept],
  );

  const danger = dialog.kind === 'confirm' && dialog.opts.danger;
  const confirmVariant = danger ? 'danger' : 'primary';

  const confirmLabel =
    dialog.kind === 'confirm'
      ? dialog.opts.confirmLabel ?? (danger ? t('actions.delete') : t('actions.confirm'))
      : dialog.kind === 'prompt'
        ? dialog.opts.confirmLabel ?? t('actions.confirm')
        : dialog.kind === 'select'
          ? dialog.opts.confirmLabel ?? t('actions.confirm')
          : dialog.opts.okLabel ?? t('actions.ok');

  const cancelLabel =
    dialog.kind === 'confirm'
      ? dialog.opts.cancelLabel ?? t('actions.cancel')
      : dialog.kind === 'prompt'
        ? dialog.opts.cancelLabel ?? t('actions.cancel')
        : dialog.kind === 'select'
          ? dialog.opts.cancelLabel ?? t('actions.cancel')
          : null;

  const message = dialog.opts.message;

  return (
    <div
      onMouseDown={(e) => {
        // Cancel only when the click starts on the backdrop itself.
        if (e.target === e.currentTarget) cancel();
      }}
      onKeyDown={onKeyDown}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 120,
        background: 'var(--scrim-strong)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '4vw',
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId.current}
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: 420,
          maxWidth: '100%',
          background: 'var(--surface)',
          border: '1px solid var(--border-2)',
          borderRadius: 18,
          boxShadow: '0 32px 80px var(--scrim-strong), 0 0 0 1px var(--hairline-contrast)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'nn-dialog-pop 160ms cubic-bezier(.34,1.56,.64,1)',
          fontFamily: 'var(--font-sans)',
        }}
      >
        <style>{`@keyframes nn-dialog-pop { from { transform: scale(0.96); opacity: 0; } to { transform: scale(1); opacity: 1; } }`}</style>

        {/* Body */}
        <div style={{ padding: '20px 22px 16px' }}>
          <div
            id={titleId.current}
            style={{
              fontSize: 15.5,
              fontWeight: 600,
              color: 'var(--text)',
              letterSpacing: -0.2,
              lineHeight: 1.35,
              whiteSpace: 'pre-wrap',
            }}
          >
            {dialog.opts.title}
          </div>

          {message && (
            <div
              style={{
                fontSize: 13,
                color: 'var(--text-muted)',
                marginTop: 8,
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
              }}
            >
              {message}
            </div>
          )}

          {dialog.kind === 'prompt' && (
            <div style={{ marginTop: 16 }}>
              {dialog.opts.label && (
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--text-dim)',
                    textTransform: 'uppercase',
                    letterSpacing: 0.8,
                    marginBottom: 6,
                  }}
                >
                  {dialog.opts.label}
                </div>
              )}
              <input
                ref={inputRef}
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  if (error) setError(null);
                }}
                placeholder={dialog.opts.placeholder}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 10,
                  background: 'var(--surface-2)',
                  border: `1px solid ${error ? 'var(--rose-500)' : 'var(--border)'}`,
                  color: 'var(--text)',
                  fontFamily: 'var(--font-sans)',
                  fontSize: 14,
                  outline: 'none',
                  caretColor: 'var(--accent-400)',
                }}
              />
              {error && (
                <div style={{ fontSize: 11.5, color: 'var(--rose-500)', marginTop: 6 }}>{error}</div>
              )}
            </div>
          )}

          {dialog.kind === 'select' && (
            <div style={{ marginTop: 16 }}>
              {selectSearchable && (
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ position: 'absolute', left: 10, display: 'flex', pointerEvents: 'none' }}>
                    <NNIcon name="search" size={14} color="var(--text-dim)" />
                  </span>
                  <input
                    ref={selectSearchRef}
                    value={selectQuery}
                    onChange={(e) => setSelectQuery(e.target.value)}
                    placeholder={t('selectSearch')}
                    aria-label={t('selectSearch')}
                    style={{
                      width: '100%',
                      padding: '9px 12px 9px 30px',
                      borderRadius: 10,
                      background: 'var(--surface-2)',
                      border: '1px solid var(--border)',
                      color: 'var(--text)',
                      fontFamily: 'var(--font-sans)',
                      fontSize: 13.5,
                      outline: 'none',
                      boxSizing: 'border-box',
                      caretColor: 'var(--accent-400)',
                    }}
                  />
                </div>
              )}
              <div
                className="nn-scroll"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  maxHeight: 320,
                  overflowY: 'auto',
                }}
              >
                {filteredSelectOptions.length === 0 ? (
                  <div style={{ padding: '14px 12px', fontSize: 13, color: 'var(--text-dim)', textAlign: 'center' }}>
                    {t('noResults')}
                  </div>
                ) : (
                  filteredSelectOptions.map((opt, i) => {
                    const selected = opt.value === selectValue;
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setSelectValue(opt.value)}
                        onDoubleClick={() => {
                          setSelectValue(opt.value);
                          dialog.resolve(opt.value);
                          onClose();
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          width: '100%',
                          padding: '10px 12px',
                          borderRadius: 10,
                          background: selected ? 'var(--surface-3)' : 'transparent',
                          border: `1px solid ${selected ? 'var(--border-2)' : 'var(--border)'}`,
                          color: 'var(--text)',
                          fontFamily: 'var(--font-sans)',
                          fontSize: 13.5,
                          textAlign: 'left',
                          cursor: 'pointer',
                          transition: 'background 80ms',
                        }}
                      >
                        {opt.swatch !== undefined && (
                          <span
                            aria-hidden
                            style={{
                              width: 18,
                              height: 18,
                              borderRadius: '50%',
                              background: opt.swatch,
                              border: '1px solid var(--border-2)',
                              flexShrink: 0,
                            }}
                          />
                        )}
                        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {opt.label}
                        </span>
                        {selected && (
                          <span
                            aria-hidden
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              background: 'var(--accent-400)',
                              flexShrink: 0,
                            }}
                          />
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
            padding: '12px 22px',
            borderTop: '1px solid var(--border)',
            background: 'var(--surface-2)',
          }}
        >
          {cancelLabel && (
            <NNBtn size="md" variant="ghost" onClick={cancel}>
              {cancelLabel}
            </NNBtn>
          )}
          <NNBtn size="md" variant={confirmVariant} onClick={accept}>
            {confirmLabel}
          </NNBtn>
        </div>
      </div>
    </div>
  );
}
