'use client';

import type { ReactNode } from 'react';
import { NNTopbar } from './shell';

export const NNAppPage = ({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) => (
  <>
    <NNTopbar title={title} subtitle={subtitle} actions={actions} />
    {children}
  </>
);
