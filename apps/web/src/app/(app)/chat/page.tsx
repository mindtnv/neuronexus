'use client';

import { NNAppPage } from '@/components/app-page';
import { NNChat } from '@/components/screens/chat';
import { useT } from '@/lib/i18n';

export default function Page() {
  const t = useT();
  return (
    <NNAppPage title={t('nav.chat')}>
      <NNChat />
    </NNAppPage>
  );
}
