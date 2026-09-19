import { NNPageSkeleton, NNSkeleton } from './ui';

export function RouteContentFallback({ compact = false }: { compact?: boolean }) {
  return <NNPageSkeleton compact={compact} />;
}

export function EditorRouteFallback() {
  return <div className="reomi-page-surface reomi-editor-workspace" aria-busy="true" aria-label="Loading editor">
    <div style={{ width: '100%', maxWidth: 940, marginInline: 'auto', padding: 28, display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><NNSkeleton width={180} height={20} /><NNSkeleton width={110} height={38} radius={10} /></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 18 }}><NNSkeleton height={42} radius={12} /><NNSkeleton height={42} radius={12} /></div>
      <NNSkeleton height={150} radius={14} /><NNSkeleton height={180} radius={14} /><NNSkeleton height={42} radius={12} />
    </div>
  </div>;
}

export function ReaderRouteFallback() {
  return (
    <div className="reomi-library-reader" aria-busy="true" aria-label="Loading reader">
      <div className="reomi-reader-header">
        <NNSkeleton width={100} height={32} radius={10} />
        <NNSkeleton width="min(42vw, 280px)" height={14} />
      </div>
      <div className="reomi-reader-workspace" style={{ display: 'grid', placeItems: 'start center', padding: 24 }}>
        <NNSkeleton width="min(760px, 100%)" height="min(900px, 78vh)" radius={8} />
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
