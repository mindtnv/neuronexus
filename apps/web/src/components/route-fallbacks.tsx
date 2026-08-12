import { NNPageSkeleton, NNSkeleton } from './ui';

export function RouteContentFallback({ compact = false }: { compact?: boolean }) {
  return <NNPageSkeleton compact={compact} />;
}

export function ReaderRouteFallback() {
  return (
    <div aria-busy="true" aria-label="Loading reader" style={{ minHeight: 0, flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          height: 52,
          padding: '0 16px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface)',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
        }}
      >
        <NNSkeleton width={36} height={36} radius={9} />
        <NNSkeleton width="min(42vw, 280px)" height={14} />
      </div>
      <div style={{ minHeight: 0, flex: 1, display: 'grid', placeItems: 'start center', padding: 24, overflow: 'hidden' }}>
        <NNSkeleton width="min(760px, 86vw)" height="min(900px, 78vh)" radius={4} />
      </div>
    </div>
  );
}

export function AuthFormFallback() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading form"
      style={{
        width: 'min(420px, 100%)',
        padding: 28,
        borderRadius: 20,
        border: '1px solid var(--border)',
        background: 'var(--surface)',
        boxShadow: 'var(--shadow-lg)',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      <NNSkeleton width={132} height={20} />
      <NNSkeleton width="55%" height={24} />
      <NNSkeleton width="84%" height={12} />
      <NNSkeleton height={42} radius={10} />
      <NNSkeleton height={42} radius={10} />
      <NNSkeleton height={42} radius={10} />
    </div>
  );
}
