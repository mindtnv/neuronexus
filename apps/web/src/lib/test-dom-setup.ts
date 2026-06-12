// Test-only DOM bootstrap for client sanitizer tests (M2 Phase 3).
//
// DOMPurify needs a real `window`/`document`. We register happy-dom's global DOM
// here. There is ONE quirk to repair: happy-dom defines a working `nodeName` /
// `nodeType` getter on the concrete subclass prototypes (Element, CharacterData,
// …) but a getter on `Node.prototype` that returns "" for element instances.
// DOMPurify CACHES `Node.prototype`'s getter at module-eval time (a deliberate
// DOM-clobbering defense — see purify's "Read nodeName through the cached
// prototype getter" comment), so without this repair it sees every tag as "" and
// strips ALL elements (a silent no-op that would make the security tests
// meaningless — they'd "pass" because everything is dropped).
//
// This shim is STRICTLY a test-harness concern. In a real browser
// `Node.prototype.nodeName` resolves correctly, so production `render-card.tsx`
// needs nothing. Importing this module registers the DOM AND applies the repair
// as a side effect; import it FIRST, before any module that pulls in dompurify.

import { GlobalRegistrator } from '@happy-dom/global-registrator';

/**
 * Idempotent (re-)registration. The side-effect import below covers the first
 * file to load this module, but module caching means it runs ONCE per process —
 * if an earlier suite tore the DOM down via `GlobalRegistrator.unregister()`
 * (render-math / sanitize-img do, deliberately, so DOM globals don't leak into
 * API tests), a later DOM-dependent file must call `ensureTestDom()` in its
 * `beforeAll` to re-register. Test-file execution order differs between macOS
 * and the Linux CI runner, so "it passes locally" does not cover this.
 */
export function ensureTestDom(): void {
  if (typeof (globalThis as { window?: unknown }).window !== 'undefined') return;
  GlobalRegistrator.register();
  repairNodeProtoGetter('nodeName');
  repairNodeProtoGetter('nodeType');
}

GlobalRegistrator.register();

/**
 * Repair `Node.prototype[prop]` so the cached prototype getter delegates to the
 * nearest concrete-subclass getter on the instance (Element/CharacterData/…),
 * falling back to the original Node getter for plain nodes.
 */
function repairNodeProtoGetter(prop: 'nodeName' | 'nodeType'): void {
  const NodeCtor = (globalThis as unknown as { Node?: { prototype: object } }).Node;
  if (!NodeCtor?.prototype) return;
  const nodeProto = NodeCtor.prototype;
  const nodeDesc = Object.getOwnPropertyDescriptor(nodeProto, prop);
  if (!nodeDesc?.get) return;
  const nodeGetter = nodeDesc.get;
  Object.defineProperty(nodeProto, prop, {
    configurable: true,
    get(this: object) {
      let p = Object.getPrototypeOf(this);
      while (p && p !== nodeProto) {
        const d = Object.getOwnPropertyDescriptor(p, prop);
        if (d?.get) return d.get.call(this);
        p = Object.getPrototypeOf(p);
      }
      return nodeGetter.call(this);
    },
  });
}

repairNodeProtoGetter('nodeName');
repairNodeProtoGetter('nodeType');

export { GlobalRegistrator };
