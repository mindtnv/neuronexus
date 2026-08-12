'use client';

import { Suspense } from 'react';
import { AuthForm } from '@/components/auth-form';
import { AuthFormFallback } from '@/components/route-fallbacks';

export default function SignUpPage() {
  return (
    <Suspense fallback={<AuthFormFallback />}>
      <AuthForm mode="sign-up" />
    </Suspense>
  );
}
