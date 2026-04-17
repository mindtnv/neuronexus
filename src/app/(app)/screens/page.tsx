'use client';

import Link from 'next/link';
import { NNTopbar } from '@/components/shell';
import { NNBadge, NNCard, NNIcon } from '@/components/ui';
import { useBreakpoint } from '@/lib/use-breakpoint';
import { useT } from '@/lib/i18n';

type ScreenEntry = {
  href: string;
  key: string;
  sectionKey: 'core' | 'library' | 'workflows' | 'cardTypes' | 'sessions' | 'empty' | 'overlays' | 'onboarding' | 'mobile';
  tone?: 'lime' | 'amber' | 'violet' | 'sky' | 'rose' | 'neutral';
  icon?: string;
};

const SCREENS: ScreenEntry[] = [
  { sectionKey: 'core', href: '/', key: 'home', tone: 'lime', icon: 'home' },
  { sectionKey: 'core', href: '/review', key: 'review', tone: 'lime', icon: 'bolt' },
  { sectionKey: 'core', href: '/graph', key: 'graph', tone: 'sky', icon: 'graph' },
  { sectionKey: 'core', href: '/garden', key: 'garden', tone: 'lime', icon: 'garden' },

  { sectionKey: 'library', href: '/decks', key: 'decks', tone: 'amber', icon: 'stack' },
  { sectionKey: 'library', href: '/editor', key: 'editor', tone: 'violet', icon: 'edit' },

  { sectionKey: 'workflows', href: '/import', key: 'import', tone: 'violet', icon: 'sparkle' },
  { sectionKey: 'workflows', href: '/stats', key: 'stats', tone: 'sky', icon: 'graph' },
  { sectionKey: 'workflows', href: '/settings', key: 'settings', tone: 'neutral', icon: 'settings' },

  { sectionKey: 'cardTypes', href: '/cards/cloze', key: 'cloze', tone: 'violet' },
  { sectionKey: 'cardTypes', href: '/cards/occlusion', key: 'occlusion', tone: 'rose' },
  { sectionKey: 'cardTypes', href: '/cards/type', key: 'type', tone: 'sky' },

  { sectionKey: 'sessions', href: '/session/complete', key: 'sessionComplete', tone: 'lime' },
  { sectionKey: 'sessions', href: '/achievements', key: 'achievements', tone: 'amber', icon: 'trophy' },
  { sectionKey: 'sessions', href: '/leagues', key: 'leagues', tone: 'amber' },

  { sectionKey: 'empty', href: '/empty/first-run', key: 'firstRun', tone: 'neutral' },
  { sectionKey: 'empty', href: '/empty/done', key: 'inboxZero', tone: 'lime' },
  { sectionKey: 'empty', href: '/empty/graph', key: 'graphEmpty', tone: 'sky' },

  { sectionKey: 'overlays', href: '/tutor', key: 'tutor', tone: 'violet', icon: 'sparkle' },
  { sectionKey: 'overlays', href: '/graph-hover', key: 'graphHover', tone: 'sky', icon: 'graph' },
  { sectionKey: 'overlays', href: '/cheatsheet', key: 'cheatsheet', tone: 'neutral' },
  { sectionKey: 'overlays', href: '/palette', key: 'palette', tone: 'lime', icon: 'search' },

  { sectionKey: 'onboarding', href: '/onboarding', key: 'onboarding', tone: 'lime' },

  { sectionKey: 'mobile', href: '/mobile', key: 'mobileOverview', tone: 'sky' },
  { sectionKey: 'mobile', href: '/mobile/review', key: 'mobileReview', tone: 'lime' },
];

export default function ScreensIndex() {
  const t = useT();
  const bp = useBreakpoint();
  const isMobile = bp === 'mobile';
  const isDesktop = bp === 'desktop';
  const sections = Array.from(new Set(SCREENS.map((s) => s.sectionKey)));
  return (
    <>
      <NNTopbar title={t('screens.topbarTitle')} subtitle={t('screens.topbarSubtitle')} />
      <div className="nn-scroll" style={{ flex: 1, overflow: 'auto', padding: isMobile ? '16px 14px 60px' : '24px 32px 80px' }}>
        <div
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: isMobile ? 32 : 42,
            lineHeight: 1.05,
            color: 'var(--text)',
            letterSpacing: -1,
            marginBottom: 8,
          }}
        >
          {t('screens.heading')}
        </div>
        <div style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 28, maxWidth: 720 }}>
          {t('screens.intro')}
        </div>

        {sections.map((section) => (
          <div key={section} style={{ marginBottom: 32 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: 1.2,
                color: 'var(--text-dim)',
                textTransform: 'uppercase',
                marginBottom: 14,
              }}
            >
              {t(`screens.sections.${section}`)}
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                gap: 14,
              }}
            >
              {SCREENS.filter((s) => s.sectionKey === section).map((s) => (
                <Link key={s.href} href={s.href} style={{ textDecoration: 'none' }}>
                  <NNCard hoverable padding={18} style={{ height: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                      {s.icon && (
                        <div
                          style={{
                            width: 30,
                            height: 30,
                            borderRadius: 8,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: `rgba(${
                              s.tone === 'violet'
                                ? '167,136,255'
                                : s.tone === 'sky'
                                ? '85,196,214'
                                : s.tone === 'amber'
                                ? '243,182,85'
                                : s.tone === 'rose'
                                ? '232,120,138'
                                : s.tone === 'lime'
                                ? '154,209,85'
                                : '120,126,140'
                            },0.12)`,
                            color: `var(--${s.tone ?? 'neutral'}-400)`,
                          }}
                        >
                          <NNIcon name={s.icon} size={14} />
                        </div>
                      )}
                      <div style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--text)', flex: 1 }}>{t(`screens.screens.${s.key}.title`)}</div>
                      <NNBadge size="xs" tone={s.tone ?? 'neutral'}>
                        {s.href}
                      </NNBadge>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{t(`screens.screens.${s.key}.subtitle`)}</div>
                  </NNCard>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
