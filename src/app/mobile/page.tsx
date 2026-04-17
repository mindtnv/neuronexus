import { NNMobile } from '@/components/mobile/mobile-view';

export default function Page() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 48,
      }}
    >
      <NNMobile />
    </div>
  );
}
