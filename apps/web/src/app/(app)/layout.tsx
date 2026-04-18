import { AppShellWrapper } from '@/components/app-shell';
import { AuthGate } from '@/components/auth-gate';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <AppShellWrapper>{children}</AppShellWrapper>
    </AuthGate>
  );
}
