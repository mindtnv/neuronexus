'use client';

import React, { useState, useEffect } from 'react';
import { NNIcon, NNBtn, NNKbd } from '@/components/ui';
import { NNTopbar } from '@/components/shell';
import { NNReview } from '@/components/screens/review';
import { useBreakpoint } from '@/lib/use-breakpoint';
import { useT } from '@/lib/i18n';

// NeuroNexus — Keyboard shortcut cheatsheet
// Triggered by pressing ? — full overlay, grouped by context

type KbdGroupsBuilder = (t: (k: string) => string) => Array<{
  title: string;
  icon: string;
  color: string;
  shortcuts: { keys: string[]; desc: string }[];
}>;

const buildKbdGroups: KbdGroupsBuilder = (t) => [
  {
    title: t('overlays.cheatsheet.groups.review'),
    icon: 'bolt',
    color: 'lime',
    shortcuts: [
      { keys: ['Space'],     desc: t('overlays.cheatsheet.review.reveal') },
      { keys: ['1'],         desc: t('overlays.cheatsheet.review.again') },
      { keys: ['2'],         desc: t('overlays.cheatsheet.review.hard') },
      { keys: ['3'],         desc: t('overlays.cheatsheet.review.good') },
      { keys: ['4'],         desc: t('overlays.cheatsheet.review.easy') },
      { keys: ['J'],         desc: t('overlays.cheatsheet.review.skip') },
      { keys: ['E'],         desc: t('overlays.cheatsheet.review.edit') },
      { keys: ['⌘', 'Z'],   desc: t('overlays.cheatsheet.review.undo') },
    ],
  },
  {
    title: t('overlays.cheatsheet.groups.navigation'),
    icon: 'home',
    color: 'sky',
    shortcuts: [
      { keys: ['G', 'H'],   desc: t('overlays.cheatsheet.navigation.home') },
      { keys: ['G', 'R'],   desc: t('overlays.cheatsheet.navigation.review') },
      { keys: ['G', 'G'],   desc: t('overlays.cheatsheet.navigation.graph') },
      { keys: ['G', 'D'],   desc: t('overlays.cheatsheet.navigation.garden') },
      { keys: ['G', 'S'],   desc: t('overlays.cheatsheet.navigation.stats') },
      { keys: ['G', ','],   desc: t('overlays.cheatsheet.navigation.settings') },
    ],
  },
  {
    title: t('overlays.cheatsheet.groups.graph'),
    icon: 'graph',
    color: 'violet',
    shortcuts: [
      { keys: ['F'],         desc: t('overlays.cheatsheet.graph.find') },
      { keys: ['⌘', '+'],   desc: t('overlays.cheatsheet.graph.zoomIn') },
      { keys: ['⌘', '−'],   desc: t('overlays.cheatsheet.graph.zoomOut') },
      { keys: ['⌘', '0'],   desc: t('overlays.cheatsheet.graph.resetZoom') },
      { keys: ['Esc'],       desc: t('overlays.cheatsheet.graph.deselect') },
      { keys: ['⌘', 'A'],   desc: t('overlays.cheatsheet.graph.selectAll') },
    ],
  },
  {
    title: t('overlays.cheatsheet.groups.editor'),
    icon: 'edit',
    color: 'amber',
    shortcuts: [
      { keys: ['⌘', 'S'],   desc: t('overlays.cheatsheet.editor.save') },
      { keys: ['⌘', 'D'],   desc: t('overlays.cheatsheet.editor.duplicate') },
      { keys: ['⌘', '⌫'],   desc: t('overlays.cheatsheet.editor.delete') },
      { keys: ['Tab'],       desc: t('overlays.cheatsheet.editor.nextField') },
      { keys: ['⌘', 'B'],   desc: t('overlays.cheatsheet.editor.bold') },
      { keys: ['⌘', 'I'],   desc: t('overlays.cheatsheet.editor.italic') },
      { keys: ['⌘', '['],   desc: t('overlays.cheatsheet.editor.cloze') },
    ],
  },
  {
    title: t('overlays.cheatsheet.groups.global'),
    icon: 'sparkle',
    color: 'neutral',
    shortcuts: [
      { keys: ['⌘', 'K'],   desc: t('overlays.cheatsheet.global.palette') },
      { keys: ['?'],         desc: t('overlays.cheatsheet.global.cheat') },
      { keys: ['⌘', '/'],   desc: t('overlays.cheatsheet.global.toggleShortcuts') },
      { keys: ['⌘', ','],   desc: t('overlays.cheatsheet.global.settings') },
      { keys: ['⌘', 'N'],   desc: t('overlays.cheatsheet.global.newCard') },
      { keys: ['⌘', 'I'],   desc: t('overlays.cheatsheet.global.importPdf') },
    ],
  },
];

const COLOR_MAP: Record<string, string> = {
  lime:    'var(--lime-400)',
  sky:     'var(--sky-400)',
  violet:  'var(--violet-400)',
  amber:   'var(--amber-400)',
  neutral: 'var(--text-muted)',
};

export const KbdCheatsheet = ({ onClose }: { onClose?: () => void }) => {
  const t = useT();
  const bp = useBreakpoint();
  const isMobile = bp === 'mobile';
  const isDesktop = bp === 'desktop';
  const KBD_GROUPS = buildKbdGroups(t);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' || e.key === '?') onClose?.(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: isMobile ? '2vw' : 0,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        width: isMobile ? '96vw' : 780,
        maxWidth: '100%',
        maxHeight: isMobile ? '90vh' : 600,
        background: 'var(--surface)',
        border: '1px solid var(--border-2)',
        borderRadius: 20,
        boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        animation: 'kbd-pop 180ms cubic-bezier(.34,1.56,.64,1)',
      }}>
        <style>{`@keyframes kbd-pop { from { transform: scale(0.94); opacity: 0; } to { transform: scale(1); opacity: 1; } }`}</style>

        {/* Header */}
        <div style={{
          padding: '16px 22px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{ fontSize: 15, fontWeight: 600, flex: 1 }}>{t('overlays.cheatsheet.title')}</div>
          <NNKbd>?</NNKbd>
          <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 2 }}>{t('overlays.cheatsheet.toToggle')}</span>
          <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 6px' }}/>
          <NNBtn size="sm" variant="ghost" icon="x" onClick={onClose}/>
        </div>

        {/* Grid of groups */}
        <div className="nn-scroll" style={{
          flex: 1, overflowY: 'auto',
          display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
          gap: 1, background: 'var(--border)',
        }}>
          {KBD_GROUPS.map(group => (
            <div key={group.title} style={{
              background: 'var(--surface)',
              padding: '18px 20px',
            }}>
              {/* Group header */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14,
              }}>
                <NNIcon name={group.icon} size={14} color={COLOR_MAP[group.color]}/>
                <span style={{
                  fontSize: 11, fontWeight: 600, letterSpacing: 0.8,
                  textTransform: 'uppercase', color: COLOR_MAP[group.color],
                }}>{group.title}</span>
              </div>

              {/* Rows */}
              {group.shortcuts.map((s, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '5px 0',
                  borderTop: i ? '1px solid var(--border)' : 'none',
                }}>
                  <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                    {s.keys.map((k, j) => <NNKbd key={j}>{k}</NNKbd>)}
                  </div>
                  <span style={{ fontSize: 12.5, color: 'var(--text-muted)', flex: 1 }}>{s.desc}</span>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          padding: '10px 22px', borderTop: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 11, color: 'var(--text-dim)',
        }}>
          <NNKbd>Esc</NNKbd>
          <span>{t('overlays.cheatsheet.toClose')}</span>
          <span style={{ flex: 1 }}/>
          <span>{t('overlays.cheatsheet.footerNote')}</span>
          <NNKbd>⌘</NNKbd><NNKbd>K</NNKbd>
        </div>
      </div>
    </div>
  );
};

// Demo: graph screen with cheatsheet open on top
export const NNKbdCheatsheetDemo = () => {
  const t = useT();
  const [open, setOpen] = useState(true);
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
      <NNTopbar title={t('overlays.cheatsheet.demoTopbar.title')} subtitle={t('overlays.cheatsheet.demoTopbar.subtitle')}/>
      <div style={{ flex: 1, overflow: 'hidden', filter: open ? 'blur(1px)' : 'none' }}>
        <NNReview variant="classic"/>
      </div>
      {open && <KbdCheatsheet onClose={() => setOpen(false)}/>}
      {!open && (
        <div style={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)' }}>
          <NNBtn variant="soft" onClick={() => setOpen(true)}>
            {t('overlays.cheatsheet.openCheatsheet')} <NNKbd>?</NNKbd>
          </NNBtn>
        </div>
      )}
    </div>
  );
};
