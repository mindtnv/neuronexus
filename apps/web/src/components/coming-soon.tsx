'use client';

import Link from 'next/link';
import { NNBtn, NNIcon } from './ui';
import type { IconName } from './ui';

/**
 * Placeholder for routes that are designed but not yet implemented. Used for
 * /leagues, /tutor, /import etc. so that neither the nav nor direct links land
 * the user in fully-mocked screens. The copy tells them what's coming and
 * sends them back to something that works.
 */
export function NNComingSoon({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon?: IconName;
}) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '32px 20px',
        color: 'var(--text-muted)',
      }}
    >
      <div
        style={{
          width: 88,
          height: 88,
          borderRadius: 22,
          display: 'grid',
          placeItems: 'center',
          background: 'linear-gradient(135deg, rgba(154,209,85,0.12), rgba(85,196,214,0.08))',
          border: '1px solid var(--border)',
          marginBottom: 20,
        }}
      >
        <NNIcon name={icon ?? 'sparkle'} size={34} color="var(--lime-400)" />
      </div>
      <div
        style={{
          fontFamily: 'var(--font-serif)',
          fontSize: 32,
          letterSpacing: -0.6,
          color: 'var(--text)',
          marginBottom: 8,
        }}
      >
        {title}
      </div>
      <div style={{ fontSize: 14, maxWidth: 420, marginBottom: 24, lineHeight: 1.5 }}>
        {description}
      </div>
      <Link href="/">
        <NNBtn size="md" variant="primary" icon="home">
          На главную
        </NNBtn>
      </Link>
    </div>
  );
}
