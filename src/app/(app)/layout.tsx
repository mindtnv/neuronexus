import { AppShellWrapper } from '@/components/app-shell';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShellWrapper>{children}</AppShellWrapper>;
}
