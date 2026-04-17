'use client';

import { useEffect } from 'react';
import { seedIfEmpty } from './seed';
import { useNN } from './store';

let bootstrapPromise: Promise<void> | null = null;

export function Bootstrap() {
  const bootstrap = useNN((s) => s.bootstrap);
  useEffect(() => {
    if (!bootstrapPromise) {
      bootstrapPromise = (async () => {
        try {
          await seedIfEmpty();
          await bootstrap();
        } catch (err) {
          console.error('[neuronexus] bootstrap failed', err);
          bootstrapPromise = null;
        }
      })();
    }
  }, [bootstrap]);
  return null;
}
