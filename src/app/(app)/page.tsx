'use client';

import { NNTopbar } from '@/components/shell';
import { NNHome } from '@/components/screens/home';
import { useT } from '@/lib/i18n';
import { useNN } from '@/lib/store';

export default function Page() {
  const t = useT();
  const profile = useNN((s) => s.profile);
  const name = profile?.name ?? 'Alex';
  return (
    <>
      <NNTopbar title={t('nav.home')} subtitle={t('home.welcome', { name })} />
      <NNHome />
    </>
  );
}
