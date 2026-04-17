import { NNMobileReviewDetail } from '@/components/mobile/mobile-review';

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
      <NNMobileReviewDetail />
    </div>
  );
}
