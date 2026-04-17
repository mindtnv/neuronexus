'use client';

import { NNTopbar } from '@/components/shell';
import { NNImportPDF } from '@/components/screens/import-pdf';
import { useT } from '@/lib/i18n';

export default function Page() {
  const t = useT();
  return (
    <>
      <NNTopbar title={t('import.pageTitle')} subtitle={t('import.pageSubtitle')} />
      <NNImportPDF />
    </>
  );
}
