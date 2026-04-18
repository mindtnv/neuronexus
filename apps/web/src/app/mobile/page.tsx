import { NNMobilePreviewShell } from '@/components/mobile/mobile-preview-shell';
import { NNMobile } from '@/components/mobile/mobile-view';

export default function Page() {
  return (
    <NNMobilePreviewShell>
      <NNMobile />
    </NNMobilePreviewShell>
  );
}
