import { notFound } from 'next/navigation';
import { ComponentLab } from '@/components/design-system/component-lab';

export default function DesignPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <ComponentLab />;
}
