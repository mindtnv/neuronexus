export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        padding: '24px',
        background:
          'var(--auth-bg)',
      }}
    >
      {children}
    </div>
  );
}
