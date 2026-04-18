export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        padding: '24px',
        background:
          'radial-gradient(1200px 600px at 50% -10%, rgba(163, 230, 53, 0.08), transparent 60%), var(--surface, #0b0f10)',
      }}
    >
      {children}
    </div>
  );
}
