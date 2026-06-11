'use client';

import { NNAppPage } from '@/components/app-page';
import { NotebooksScreen } from '@/components/screens/notebooks';
import { useT } from '@/lib/i18n';

export default function Page() {
  const t = useT();
  return (
    <NNAppPage title={t('nav.notebooks')}>
      <NotebooksScreen />
    </NNAppPage>
  );
}
