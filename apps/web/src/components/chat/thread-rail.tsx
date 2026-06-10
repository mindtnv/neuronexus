'use client';

// ThreadRail — the chat screen's left rail, extracted from chat.tsx (A-pack).
// Adds: search-as-you-filter (A1), date-grouped sections with a Pinned group on
// top (A2/C4 — pure helpers from lib/chat-threads), and a pin/unpin affordance
// per row. Inline rename + delete behave exactly as before (state moved here).
// Hand-rolled styles (inline + CSS vars, Principle 4); primitives from ui.tsx.

import React, { useMemo, useState } from 'react';
import { NNBtn, NNIcon, NNSkeleton } from '@/components/ui';
import {
  conversationTitle,
  filterThreads,
  groupThreads,
  relativeUpdated,
  type ConversationVM,
  type ThreadGroupKey,
} from '@/lib/chat-threads';

type T = (key: string, params?: Record<string, string | number>) => string;

const GROUP_LABEL_KEY: Record<ThreadGroupKey, string> = {
  pinned: 'chat.threads.groupPinned',
  today: 'chat.threads.groupToday',
  yesterday: 'chat.threads.groupYesterday',
  week: 'chat.threads.groupWeek',
  older: 'chat.threads.groupOlder',
};

export interface ThreadRailProps {
  conversations: ConversationVM[];
  activeId: string | null;
  loaded: boolean;
  isMobile: boolean;
  onOpen: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onTogglePin: (id: string, pinned: boolean) => void;
  t: T;
}

export const ThreadRail = ({
  conversations,
  activeId,
  loaded,
  isMobile,
  onOpen,
  onNew,
  onRename,
  onDelete,
  onTogglePin,
  t,
}: ThreadRailProps) => {
  const [search, setSearch] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  const groups = useMemo(() => {
    const filtered = filterThreads(conversations, search, t('chat.threads.untitled'));
    return groupThreads(filtered);
  }, [conversations, search, t]);

  const startRename = (c: ConversationVM) => {
    setRenamingId(c.id);
    setRenameDraft((c.title ?? '').trim());
  };
  const commitRename = () => {
    const id = renamingId;
    if (!id) return;
    const draftTitle = renameDraft;
    setRenamingId(null);
    setRenameDraft('');
    if (draftTitle.trim().length > 0) onRename(id, draftTitle);
  };

  const hasQuery = search.trim().length > 0;

  return (
    <aside
      style={{
        width: isMobile ? '100%' : 268,
        flexShrink: 0,
        borderRight: isMobile ? 'none' : '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--surface)',
      }}
    >
      <div
        style={{
          padding: '12px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          borderBottom: '1px solid var(--border)',
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 1.4,
            textTransform: 'uppercase',
            color: 'var(--text-dim)',
            fontFamily: 'var(--font-sans)',
          }}
        >
          {t('chat.threads.title')}
        </span>
        <NNBtn size="sm" variant="soft" icon="plus" onClick={onNew}>
          {t('chat.threads.newThread')}
        </NNBtn>
      </div>

      {/* Search (A1) — client-side filter over effective titles. */}
      <div style={{ padding: '8px 10px 0' }}>
        <div style={{ position: 'relative' }}>
          <span
            style={{
              position: 'absolute',
              left: 9,
              top: '50%',
              transform: 'translateY(-50%)',
              display: 'inline-flex',
              pointerEvents: 'none',
            }}
          >
            <NNIcon name="search" size={13} color="var(--text-dim)" />
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && search.length > 0) {
                e.preventDefault();
                e.stopPropagation();
                setSearch('');
              }
            }}
            placeholder={t('chat.threads.searchPlaceholder')}
            aria-label={t('chat.threads.searchPlaceholder')}
            style={{
              width: '100%',
              padding: '7px 28px 7px 28px',
              borderRadius: 'var(--r-md)',
              border: '1px solid var(--border-2)',
              background: 'var(--surface-2)',
              color: 'var(--text)',
              fontFamily: 'var(--font-sans)',
              fontSize: 13,
              outline: 'none',
            }}
          />
          {hasQuery && (
            <button
              type="button"
              aria-label={t('chat.threads.searchPlaceholder')}
              onClick={() => setSearch('')}
              style={{
                position: 'absolute',
                right: 6,
                top: '50%',
                transform: 'translateY(-50%)',
                display: 'inline-flex',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-dim)',
                padding: 2,
              }}
            >
              <NNIcon name="x" size={13} />
            </button>
          )}
        </div>
      </div>

      <div className="nn-scroll" style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
        {!loaded ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 4 }}>
            <NNSkeleton height={38} />
            <NNSkeleton height={38} />
            <NNSkeleton height={38} />
          </div>
        ) : conversations.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-dim)', padding: '12px 8px', margin: 0 }}>
            {t('chat.threads.empty')}
          </p>
        ) : groups.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-dim)', padding: '12px 8px', margin: 0 }}>
            {t('chat.threads.searchNoResults')}
          </p>
        ) : (
          groups.map((group) => (
            <div key={group.key} style={{ display: 'flex', flexDirection: 'column' }}>
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  letterSpacing: 1.2,
                  textTransform: 'uppercase',
                  color: 'var(--text-dim)',
                  fontFamily: 'var(--font-sans)',
                  padding: '10px 8px 4px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                {group.key === 'pinned' && <NNIcon name="pin" size={11} color="var(--text-dim)" />}
                {t(GROUP_LABEL_KEY[group.key])}
              </span>
              {group.items.map((c) => {
                const isActive = c.id === activeId;
                const isRenaming = renamingId === c.id;
                return (
                  <div
                    key={c.id}
                    className="nn-thread-row"
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      if (!isRenaming) onOpen(c.id);
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      startRename(c);
                    }}
                    onKeyDown={(e) => {
                      if (isRenaming) return;
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onOpen(c.id);
                      }
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 6,
                      padding: '9px 10px',
                      borderRadius: 'var(--r-md)',
                      cursor: 'pointer',
                      background: isActive ? 'var(--surface-3)' : 'transparent',
                      transition: 'background 120ms ease',
                    }}
                  >
                    {isRenaming ? (
                      <input
                        autoFocus
                        value={renameDraft}
                        maxLength={200}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setRenameDraft(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            commitRename();
                          } else if (e.key === 'Escape') {
                            e.preventDefault();
                            setRenamingId(null);
                            setRenameDraft('');
                          }
                        }}
                        style={{
                          flex: 1,
                          minWidth: 0,
                          padding: '4px 8px',
                          borderRadius: 'var(--r-sm)',
                          border: '1px solid var(--border-2)',
                          background: 'var(--surface-2)',
                          color: 'var(--text)',
                          fontFamily: 'var(--font-sans)',
                          fontSize: 13.5,
                          outline: 'none',
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          minWidth: 0,
                          gap: 1,
                          flex: 1,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 13.5,
                            fontWeight: isActive ? 600 : 500,
                            color: isActive ? 'var(--text)' : 'var(--text-muted)',
                            fontFamily: 'var(--font-sans)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {conversationTitle(c, t('chat.threads.untitled'))}
                        </span>
                        {relativeUpdated(c.updatedAt, t) && (
                          <span
                            style={{
                              fontSize: 10.5,
                              color: 'var(--text-dim)',
                              fontFamily: 'var(--font-sans)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {relativeUpdated(c.updatedAt, t)}
                          </span>
                        )}
                      </div>
                    )}
                    {!isRenaming && (
                      <span style={{ display: 'inline-flex', gap: 2, flexShrink: 0 }}>
                        <button
                          type="button"
                          aria-label={c.pinned ? t('chat.threads.unpin') : t('chat.threads.pin')}
                          title={c.pinned ? t('chat.threads.unpin') : t('chat.threads.pin')}
                          onClick={(e) => {
                            e.stopPropagation();
                            onTogglePin(c.id, !c.pinned);
                          }}
                          style={{
                            display: 'flex',
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            color: c.pinned ? 'var(--lime-400)' : 'var(--text-dim)',
                            padding: 2,
                          }}
                        >
                          <NNIcon name="pin" size={14} />
                        </button>
                        <button
                          type="button"
                          aria-label={t('chat.threads.rename')}
                          title={t('chat.threads.rename')}
                          onClick={(e) => {
                            e.stopPropagation();
                            startRename(c);
                          }}
                          style={{
                            display: 'flex',
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'var(--text-dim)',
                            padding: 2,
                          }}
                        >
                          <NNIcon name="edit" size={14} />
                        </button>
                        <button
                          type="button"
                          aria-label={t('chat.threads.delete')}
                          title={t('chat.threads.delete')}
                          onClick={(e) => {
                            e.stopPropagation();
                            onDelete(c.id);
                          }}
                          style={{
                            display: 'flex',
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'var(--text-dim)',
                            padding: 2,
                          }}
                        >
                          <NNIcon name="x" size={14} />
                        </button>
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>
    </aside>
  );
};
