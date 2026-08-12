import { AppLink } from '@/components/navigation';

export default function NotFound() {
  return (
    <main style={{ minHeight: '100dvh', padding: 24, display: 'grid', placeItems: 'center', background: 'var(--bg)' }}>
      <section style={{ width: 'min(480px, 100%)', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <span className="mono" style={{ color: 'var(--accent-400)', fontSize: 12 }}>404</span>
        <h1 style={{ margin: 0, fontSize: 26 }}>Страница не найдена</h1>
        <p style={{ margin: 0, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Возможно, ссылка устарела или страница была перемещена.
        </p>
        <AppLink
          href="/"
          style={{
            width: 'fit-content',
            minHeight: 40,
            padding: '0 16px',
            borderRadius: 10,
            background: 'var(--accent-500)',
            color: 'var(--text-on-accent)',
            display: 'inline-flex',
            alignItems: 'center',
            fontWeight: 600,
          }}
        >
          На главную
        </AppLink>
      </section>
    </main>
  );
}
