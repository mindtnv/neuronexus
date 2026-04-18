import type { ReactNode } from 'react';

export const NNMobilePreviewShell = ({ children }: { children: ReactNode }) => (
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
    {children}
  </div>
);
