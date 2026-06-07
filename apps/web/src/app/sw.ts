/// <reference lib="webworker" />
//
// Inert PWA service worker (ralplan Phase B — INERT install insurance).
//
// CACHES NOTHING by design. This worker exists purely as cross-engine PWA
// install insurance and is the strongest possible defense of the
// server-of-truth invariant (P2): there is no cache layer to ever go stale.
//
//  - self.__SW_MANIFEST is []   -> the precache manifest is forced empty by
//                                  next.config.ts (manifestTransforms drops every
//                                  entry; globPublicPatterns:[]). So precaching is
//                                  a no-op even though the token is present.
//  - NO runtimeCaching key      -> every request goes straight to network
//  - NO defaultCache            -> FORBIDDEN (it NetworkFirst-caches HTML)
//
// Adding ANY caching (precache, runtimeCaching, or defaultCache) is a
// P2-level re-review — not a routine change.
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { Serwist } from 'serwist';

// Declares the precache-manifest injection point for TypeScript. serwist's
// build step replaces `self.__SW_MANIFEST` with the actual manifest (empty
// here, because globPublicPatterns:[] + no additionalPrecacheEntries).
declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// `self.__SW_MANIFEST` is the serwist build-plugin injection point. With
// globPublicPatterns:[] and no additionalPrecacheEntries (next.config.ts), the
// plugin replaces it with an EMPTY manifest ([]) — so precache stays empty
// while still satisfying the plugin, which requires this token in the source.
const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
});

serwist.addEventListeners();
