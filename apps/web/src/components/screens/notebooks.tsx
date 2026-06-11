'use client';

// NotebooksScreen — the NotebookLM M1 library (T8).
//
//  • Notebook list (create / rename / delete) → open a notebook → its sources.
//  • Add a source: file picker (pdf/epub → claim-presign → POST → finalize,
//    MIRRORING store.uploadMedia) or url / pasted-text inline.
//  • Sources show an indexing-status badge + indexed/total progress; the screen
//    POLLS GET /sources/:id (store.getSource) while any source is non-terminal
//    (pending/parsing/indexing) and stops once everything is ready/error.
//  • errorCode (machine code from the server) maps to `notebooks.status.<code>`.
//  • /ai/status.notebooksEnabled === false → a setup notice (degrade, never
//    crash — mirrors how NNChat shows its setup notice).
//
// All data is screen-local (like chat conversations — NOT the bootstrap mirror);
// the store methods are thin Eden pass-throughs. Inline styles + CSS vars +
// ui.tsx primitives only.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  MAX_SOURCE_BYTES_DEFAULT,
  SOURCE_MIME_TO_KIND,
  SOURCE_NONTERMINAL_STATUSES,
  type IngestErrorCode,
  type SourceMime,
  type SourceStatus,
} from '@neuronexus/shared';
import { NNBtn, NNCard, NNIcon, NNBadge, NNSkeleton } from '@/components/ui';
import { api, ok } from '@/lib/api';
import { useNN } from '@/lib/store';
import type { Notebook, Source } from '@/lib/types';
import { useIsMobile } from '@/lib/use-breakpoint';
import { useT } from '@/lib/i18n';
import { useDialog } from '@/components/dialog';
import { raiseToast } from '@/components/toasts';

type AiStatus = {
  notebooksEnabled: boolean;
};

export const NONTERMINAL = new Set<SourceStatus>(SOURCE_NONTERMINAL_STATUSES);

/** Badge tone per status — error/terminal are visually distinct. */
export function statusTone(status: SourceStatus): string {
  if (status === 'ready') return 'lime';
  if (status === 'error') return 'rose';
  if (status === 'deleting') return 'neutral';
  return 'sky';
}

/** Whether the kind picker maps this file's mime to an allowed upload kind. */
export function mimeFor(file: File): SourceMime | null {
  const mime = file.type;
  if (mime in SOURCE_MIME_TO_KIND) return mime as SourceMime;
  // Fall back on extension (some browsers report empty type for epub).
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.epub')) return 'application/epub+zip';
  return null;
}

export type AddKind = 'file' | 'url' | 'text';

export const NotebooksScreen = ({ notebookId }: { notebookId?: string }) => {
  const t = useT();
  const router = useRouter();
  const isMobile = useIsMobile();
  const { prompt, confirm } = useDialog();

  const listNotebooks = useNN((s) => s.listNotebooks);
  const createNotebook = useNN((s) => s.createNotebook);
  const renameNotebook = useNN((s) => s.renameNotebook);
  const deleteNotebook = useNN((s) => s.deleteNotebook);
  const listSources = useNN((s) => s.listSources);
  const addUrlSource = useNN((s) => s.addUrlSource);
  const addTextSource = useNN((s) => s.addTextSource);
  const uploadSource = useNN((s) => s.uploadSource);
  const getSource = useNN((s) => s.getSource);
  const renameSource = useNN((s) => s.renameSource);
  const deleteSource = useNN((s) => s.deleteSource);

  const [status, setStatus] = useState<AiStatus | null>(null);
  const [statusLoaded, setStatusLoaded] = useState(false);
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [notebooksLoaded, setNotebooksLoaded] = useState(false);
  const [openId, setOpenId] = useState<string | undefined>(notebookId);
  const [sources, setSources] = useState<Source[]>([]);
  const [sourcesLoaded, setSourcesLoaded] = useState(false);

  // Add-source form state.
  const [addOpen, setAddOpen] = useState(false);
  const [addKind, setAddKind] = useState<AddKind>('file');
  const [addTitle, setAddTitle] = useState('');
  const [addUrl, setAddUrl] = useState('');
  const [addText, setAddText] = useState('');
  const [addFile, setAddFile] = useState<File | null>(null);
  const [adding, setAdding] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const maxMb = Math.floor(MAX_SOURCE_BYTES_DEFAULT / (1024 * 1024));

  const openNotebook = useMemo(
    () => notebooks.find((n) => n.id === openId),
    [notebooks, openId],
  );

  // ── AI status (degrade, never crash) ────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = (await ok(await (api as any).ai.status.get())) as AiStatus;
        if (!cancelled) setStatus(s);
      } catch {
        if (!cancelled) setStatus({ notebooksEnabled: false });
      } finally {
        if (!cancelled) setStatusLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Notebook list ─────────────────────────────────────────────────────────────
  const refreshNotebooks = useCallback(async () => {
    try {
      const rows = await listNotebooks();
      setNotebooks(rows);
    } catch {
      /* leave the list as-is; a transient fetch error shouldn't blank the screen */
    } finally {
      setNotebooksLoaded(true);
    }
  }, [listNotebooks]);

  useEffect(() => {
    if (statusLoaded && status?.notebooksEnabled) void refreshNotebooks();
  }, [statusLoaded, status?.notebooksEnabled, refreshNotebooks]);

  // ── Source list for the open notebook ───────────────────────────────────────
  const refreshSources = useCallback(
    async (id: string) => {
      try {
        const rows = await listSources(id);
        setSources(rows);
      } catch {
        /* keep current sources on a transient error */
      } finally {
        setSourcesLoaded(true);
      }
    },
    [listSources],
  );

  useEffect(() => {
    if (!openId) {
      setSources([]);
      setSourcesLoaded(false);
      return;
    }
    setSourcesLoaded(false);
    void refreshSources(openId);
  }, [openId, refreshSources]);

  // ── Poll non-terminal sources ─────────────────────────────────────────────────
  const hasPending = useMemo(
    () => sources.some((s) => NONTERMINAL.has(s.status)),
    [sources],
  );

  useEffect(() => {
    if (!openId || !hasPending) return;
    let cancelled = false;
    const interval = setInterval(async () => {
      const pending = sources.filter((s) => NONTERMINAL.has(s.status));
      if (pending.length === 0) return;
      try {
        const updated = await Promise.all(
          pending.map((s) => getSource(s.id).catch(() => null)),
        );
        if (cancelled) return;
        const byId = new Map(updated.filter(Boolean).map((s) => [s!.id, s!]));
        setSources((prev) => prev.map((s) => byId.get(s.id) ?? s));
      } catch {
        /* transient; next tick retries */
      }
    }, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [openId, hasPending, sources, getSource]);

  // ── Notebook actions ────────────────────────────────────────────────────────
  const onCreateNotebook = useCallback(async () => {
    const title = await prompt({
      title: t('notebooks.list.createTitle'),
      label: t('notebooks.list.createLabel'),
      placeholder: t('notebooks.list.createPlaceholder'),
      confirmLabel: t('actions.create'),
      validate: (v) => (v.trim().length === 0 ? ' ' : null),
    });
    if (title === null) return;
    const trimmed = title.trim();
    if (!trimmed) return;
    try {
      const nb = await createNotebook(trimmed);
      setNotebooks((prev) => [nb, ...prev]);
    } catch {
      raiseToast({ kind: 'info', title: t('notebooks.list.tooMany') });
    }
  }, [prompt, t, createNotebook]);

  const onRenameNotebook = useCallback(
    async (nb: Notebook) => {
      const title = await prompt({
        title: t('notebooks.list.renameTitle'),
        label: t('notebooks.list.createLabel'),
        defaultValue: nb.title,
        confirmLabel: t('actions.rename'),
        validate: (v) => (v.trim().length === 0 ? ' ' : null),
      });
      if (title === null) return;
      const trimmed = title.trim();
      if (!trimmed || trimmed === nb.title) return;
      const updated = await renameNotebook(nb.id, trimmed);
      setNotebooks((prev) => prev.map((n) => (n.id === nb.id ? updated : n)));
    },
    [prompt, t, renameNotebook],
  );

  const onDeleteNotebook = useCallback(
    async (nb: Notebook) => {
      const yes = await confirm({
        title: t('notebooks.list.delete'),
        message: t('notebooks.list.deleteConfirm'),
        danger: true,
        confirmLabel: t('actions.delete'),
      });
      if (!yes) return;
      await deleteNotebook(nb.id);
      setNotebooks((prev) => prev.filter((n) => n.id !== nb.id));
      if (openId === nb.id) setOpenId(undefined);
    },
    [confirm, t, deleteNotebook, openId],
  );

  // ── Source actions ────────────────────────────────────────────────────────────
  const resetAddForm = useCallback(() => {
    setAddOpen(false);
    setAddKind('file');
    setAddTitle('');
    setAddUrl('');
    setAddText('');
    setAddFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const onSubmitAdd = useCallback(async () => {
    if (!openId || adding) return;
    setAdding(true);
    try {
      let created: Source;
      if (addKind === 'url') {
        const url = addUrl.trim();
        if (!url) return;
        created = await addUrlSource(openId, addTitle.trim() || url, url);
      } else if (addKind === 'text') {
        const text = addText;
        if (!text.trim()) return;
        created = await addTextSource(openId, addTitle.trim() || t('notebooks.add.textLabel'), text);
      } else {
        if (!addFile) return;
        const mime = mimeFor(addFile);
        if (!mime) {
          raiseToast({ kind: 'info', title: t('notebooks.status.unsupported_mime') });
          return;
        }
        created = await uploadSource(openId, addFile, addTitle.trim() || addFile.name, mime);
      }
      setSources((prev) => [created, ...prev]);
      resetAddForm();
    } catch {
      raiseToast({ kind: 'info', title: t('notebooks.add.failed') });
    } finally {
      setAdding(false);
    }
  }, [
    openId,
    adding,
    addKind,
    addUrl,
    addText,
    addFile,
    addTitle,
    addUrlSource,
    addTextSource,
    uploadSource,
    resetAddForm,
    t,
  ]);

  const onRenameSource = useCallback(
    async (src: Source) => {
      const title = await prompt({
        title: t('notebooks.sources.renameTitle'),
        label: t('notebooks.sources.renameLabel'),
        defaultValue: src.title,
        confirmLabel: t('actions.rename'),
        validate: (v) => (v.trim().length === 0 ? ' ' : null),
      });
      if (title === null) return;
      const trimmed = title.trim();
      if (!trimmed || trimmed === src.title) return;
      const updated = await renameSource(src.id, trimmed);
      setSources((prev) => prev.map((s) => (s.id === src.id ? updated : s)));
    },
    [prompt, t, renameSource],
  );

  const onDeleteSource = useCallback(
    async (src: Source) => {
      const yes = await confirm({
        title: t('notebooks.sources.delete'),
        message: t('notebooks.sources.deleteConfirm'),
        danger: true,
        confirmLabel: t('actions.delete'),
      });
      if (!yes) return;
      await deleteSource(src.id);
      setSources((prev) => prev.filter((s) => s.id !== src.id));
    },
    [confirm, t, deleteSource],
  );

  // ── Render: setup notice when notebooks are unconfigured ──────────────────────
  if (statusLoaded && status && !status.notebooksEnabled) {
    return (
      <div style={{ padding: isMobile ? 16 : 32, maxWidth: 640, margin: '0 auto' }}>
        <NNCard padding={24} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <NNIcon name="doc" size={20} color="var(--violet-400)" />
            <h2
              style={{
                fontSize: 18,
                fontWeight: 700,
                fontFamily: 'var(--font-sans)',
                color: 'var(--text)',
                margin: 0,
              }}
            >
              {t('notebooks.setup.title')}
            </h2>
          </div>
          <p style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--text-muted)', margin: 0 }}>
            {t('notebooks.setup.body')}
          </p>
          <p style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text-dim)', margin: 0 }}>
            {t('notebooks.setup.docsHint')}
          </p>
        </NNCard>
      </div>
    );
  }

  // ── Render: source view (open notebook) ───────────────────────────────────────
  if (openId) {
    return (
      <div style={{ padding: isMobile ? 16 : 24, maxWidth: 820, margin: '0 auto', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <NNBtn
            variant="ghost"
            size="sm"
            icon="chevl"
            onClick={() => {
              setOpenId(undefined);
              router.push('/notebooks');
            }}
          >
            {t('notebooks.sources.back')}
          </NNBtn>
          <h2
            style={{
              fontSize: 17,
              fontWeight: 700,
              fontFamily: 'var(--font-sans)',
              color: 'var(--text)',
              margin: 0,
              flex: 1,
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {openNotebook?.title ?? t('notebooks.sources.heading')}
          </h2>
          <NNBtn variant="primary" size="sm" icon="plus" onClick={() => setAddOpen(true)}>
            {t('notebooks.sources.add')}
          </NNBtn>
        </div>

        {addOpen && (
          <AddSourceForm
            kind={addKind}
            setKind={setAddKind}
            title={addTitle}
            setTitle={setAddTitle}
            url={addUrl}
            setUrl={setAddUrl}
            text={addText}
            setText={setAddText}
            file={addFile}
            setFile={setAddFile}
            fileInputRef={fileInputRef}
            adding={adding}
            maxMb={maxMb}
            onSubmit={onSubmitAdd}
            onCancel={resetAddForm}
          />
        )}

        {!sourcesLoaded ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
            <NNSkeleton style={{ height: 56 }} />
            <NNSkeleton style={{ height: 56 }} />
          </div>
        ) : sources.length === 0 ? (
          <p style={{ fontSize: 14, color: 'var(--text-dim)', margin: '24px 0' }}>
            {t('notebooks.sources.empty')}
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
            {sources.map((src) => (
              <SourceRow
                key={src.id}
                source={src}
                onRename={() => onRenameSource(src)}
                onDelete={() => onDeleteSource(src)}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Render: notebook list ─────────────────────────────────────────────────────
  return (
    <div style={{ padding: isMobile ? 16 : 24, maxWidth: 820, margin: '0 auto', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <h2
          style={{
            fontSize: 17,
            fontWeight: 700,
            fontFamily: 'var(--font-sans)',
            color: 'var(--text)',
            margin: 0,
            flex: 1,
          }}
        >
          {t('notebooks.list.heading')}
        </h2>
        <NNBtn variant="primary" size="sm" icon="plus" onClick={onCreateNotebook}>
          {t('notebooks.list.create')}
        </NNBtn>
      </div>

      {!notebooksLoaded ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <NNSkeleton style={{ height: 56 }} />
          <NNSkeleton style={{ height: 56 }} />
        </div>
      ) : notebooks.length === 0 ? (
        <p style={{ fontSize: 14, color: 'var(--text-dim)', margin: '24px 0' }}>
          {t('notebooks.list.empty')}
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {notebooks.map((nb) => (
            <NotebookRow
              key={nb.id}
              notebook={nb}
              onOpen={() => {
                setOpenId(nb.id);
                router.push(`/notebooks/${nb.id}`);
              }}
              onRename={() => onRenameNotebook(nb)}
              onDelete={() => onDeleteNotebook(nb)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ── Notebook row ────────────────────────────────────────────────────────────────

const NotebookRow = ({
  notebook,
  onOpen,
  onRename,
  onDelete,
}: {
  notebook: Notebook;
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
}) => {
  const t = useT();
  return (
    <NNCard padding={14} hoverable onClick={onOpen} style={{ cursor: 'pointer' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <NNIcon name="doc" size={18} color="var(--text-muted)" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 14.5,
              fontWeight: 600,
              color: 'var(--text)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {notebook.title}
          </div>
        </div>
        <div
          style={{ display: 'flex', gap: 4 }}
          onClick={(e) => e.stopPropagation()}
        >
          <NNBtn
            variant="ghost"
            size="sm"
            icon="edit"
            ariaLabel={t('notebooks.list.rename')}
            title={t('notebooks.list.rename')}
            onClick={onRename}
          />
          <NNBtn
            variant="ghost"
            size="sm"
            icon="x"
            ariaLabel={t('notebooks.list.delete')}
            title={t('notebooks.list.delete')}
            onClick={onDelete}
          />
        </div>
        <NNIcon name="chevr" size={14} color="var(--text-dim)" />
      </div>
    </NNCard>
  );
};

// ── Source row ──────────────────────────────────────────────────────────────────

export const SourceRow = ({
  source,
  onRename,
  onDelete,
}: {
  source: Source;
  onRename: () => void;
  onDelete: () => void;
}) => {
  const t = useT();
  const isError = source.status === 'error';
  // An error code (if present) wins over the bare 'error' status for the label.
  const statusLabel =
    isError && source.errorCode
      ? t(`notebooks.status.${source.errorCode as IngestErrorCode}`)
      : t(`notebooks.status.${source.status}`);
  const showProgress = source.status === 'indexing' || source.status === 'ready';

  return (
    <NNCard padding={14}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <NNIcon name={sourceIcon(source.kind)} size={18} color="var(--text-muted)" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--text)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {source.title}
          </div>
          {showProgress && source.total > 0 && (
            <div style={{ fontSize: 11.5, color: 'var(--text-dim)', marginTop: 3 }}>
              {t('notebooks.sources.progress', {
                indexed: String(source.indexed),
                total: String(source.total),
              })}
            </div>
          )}
        </div>
        <NNBadge tone={statusTone(source.status)} size="sm">
          {statusLabel}
        </NNBadge>
        <div style={{ display: 'flex', gap: 4 }}>
          <NNBtn
            variant="ghost"
            size="sm"
            icon="edit"
            ariaLabel={t('notebooks.sources.rename')}
            title={t('notebooks.sources.rename')}
            onClick={onRename}
          />
          <NNBtn
            variant="ghost"
            size="sm"
            icon="x"
            ariaLabel={t('notebooks.sources.delete')}
            title={t('notebooks.sources.delete')}
            onClick={onDelete}
          />
        </div>
      </div>
    </NNCard>
  );
};

export function sourceIcon(kind: Source['kind']): 'doc' | 'link' {
  return kind === 'url' ? 'link' : 'doc';
}

// ── Add-source inline form ────────────────────────────────────────────────────

export const AddSourceForm = ({
  kind,
  setKind,
  title,
  setTitle,
  url,
  setUrl,
  text,
  setText,
  file,
  setFile,
  fileInputRef,
  adding,
  maxMb,
  onSubmit,
  onCancel,
}: {
  kind: AddKind;
  setKind: (k: AddKind) => void;
  title: string;
  setTitle: (v: string) => void;
  url: string;
  setUrl: (v: string) => void;
  text: string;
  setText: (v: string) => void;
  file: File | null;
  setFile: (f: File | null) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  adding: boolean;
  maxMb: number;
  onSubmit: () => void;
  onCancel: () => void;
}) => {
  const t = useT();
  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 10px',
    fontSize: 13.5,
    fontFamily: 'var(--font-sans)',
    color: 'var(--text)',
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--r-md)',
    outline: 'none',
    boxSizing: 'border-box',
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 11.5,
    fontWeight: 600,
    color: 'var(--text-dim)',
    marginBottom: 4,
    display: 'block',
  };

  const canSubmit =
    !adding &&
    ((kind === 'file' && !!file) ||
      (kind === 'url' && url.trim().length > 0) ||
      (kind === 'text' && text.trim().length > 0));

  return (
    <NNCard padding={16} style={{ marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {(['file', 'url', 'text'] as AddKind[]).map((k) => (
          <NNBtn
            key={k}
            variant={kind === k ? 'soft' : 'ghost'}
            size="sm"
            active={kind === k}
            onClick={() => setKind(k)}
          >
            {t(`notebooks.add.kind${k === 'file' ? 'File' : k === 'url' ? 'Url' : 'Text'}`)}
          </NNBtn>
        ))}
      </div>

      <div>
        <label style={labelStyle}>{t('notebooks.add.titleLabel')}</label>
        <input
          style={inputStyle}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('notebooks.add.titlePlaceholder')}
          maxLength={300}
        />
      </div>

      {kind === 'file' && (
        <div>
          <label style={labelStyle}>{t('notebooks.add.fileLabel')}</label>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.epub,application/pdf,application/epub+zip"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            style={{ fontSize: 13, color: 'var(--text-muted)' }}
          />
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 5 }}>
            {t('notebooks.add.fileHint', { mb: String(maxMb) })}
          </div>
        </div>
      )}

      {kind === 'url' && (
        <div>
          <label style={labelStyle}>{t('notebooks.add.urlLabel')}</label>
          <input
            style={inputStyle}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={t('notebooks.add.urlPlaceholder')}
            maxLength={2000}
          />
        </div>
      )}

      {kind === 'text' && (
        <div>
          <label style={labelStyle}>{t('notebooks.add.textLabel')}</label>
          <textarea
            style={{ ...inputStyle, minHeight: 120, resize: 'vertical' }}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('notebooks.add.textPlaceholder')}
          />
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <NNBtn variant="ghost" size="sm" onClick={onCancel} disabled={adding}>
          {t('actions.cancel')}
        </NNBtn>
        <NNBtn variant="primary" size="sm" onClick={onSubmit} disabled={!canSubmit}>
          {adding ? t('notebooks.add.uploading') : t('notebooks.add.submit')}
        </NNBtn>
      </div>
    </NNCard>
  );
};
