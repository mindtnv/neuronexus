# Reomi production domain migration

Target: `https://app.reomi.ru` (web), `https://api.reomi.ru` (API).
The apex `reomi.ru` and `www` are outside this migration; no landing page is deployed here.

## Infrastructure and rollback baseline

- Coolify team: `8`; server: `ru-anvgrp-1`, `82.202.165.26`.
- API: `u6kweu7gzzw9kidpuq7i0n7y`, image `ghcr.io/mindtnv/neuronexus-api`.
- Web: `tmc5k98iayyj0g28qr7inbaj`, image `ghcr.io/mindtnv/neuronexus-web`.
- Both verified baseline image tags on 2026-09-21: `40c5833c66ae990e34fd2b2683f9266bab4aa77f`.
- Old web: `https://neuronexus.mihailantonov.pro`.
- Old API: `https://api.neuronexus.mihailantonov.pro`.
- Existing S3 endpoint/public media base, database and auth secret remain unchanged.

Nonsecret routing/environment snapshots and the original bucket CORS are saved on the operator Mac under `~/.codex/reomi-domain-migration/`. Do not commit credentials or full environment dumps.

## Stage without cutting over

1. DNS must ultimately return A records for `app` and `api` pointing to `82.202.165.26`. The existing wildcard can provide these records. Do not change nameservers while propagation is pending.
2. Add new HTTPS domains to their existing Coolify applications, keeping the old domains first. Redeploy the same baseline images; verify old endpoints and both applications remain healthy.
3. Preserve storage CORS rules and add `https://app.reomi.ru` to the rule permitting the former web origin. Check OPTIONS for POST with `content-type` returns that allowed origin.
4. Prepare the web image changes on a branch. Do not merge the new API build URL and old-host redirect into main until the DNS/TLS gate passes.

## Cutover gate and execution

- Verify both authoritative nameservers and public recursive DNS return `82.202.165.26` for `app.reomi.ru` and `api.reomi.ru`.
- Verify HTTPS normally, without disabling certificate validation, on both hostnames. Certificate provisioning may need a same-image redeploy once DNS becomes available.
- Require the existing CI gates: strict OpenSpec validation, typecheck, migration-faithful `test:ci`, web/API build and real-S3 tests.
- Update API runtime `WEB_ORIGIN=https://app.reomi.ru` and `BETTER_AUTH_URL=https://api.reomi.ru`.
- Update web runtime `NEXT_PUBLIC_API_URL=https://api.reomi.ru`; the production workflow MUST also bake this value into the web image. Runtime alone cannot change browser JavaScript/CSP.
- Release through the existing main workflow, which deploys API before web. Verify both immutable tags match the released commit and both apps reach `running:healthy`.
- The old web hostname now returns 307 to the new origin, preserving paths and query strings. The canonical hostname and local development do not match that redirect.
- Keep the old API hostname as an alias for existing MCP/PAT clients; do not redirect POST/SSE traffic or broaden CORS/cookies.

## Acceptance

- New API `/health` and `/ready` respond; record degradation separately from availability.
- New web `/auth/sign-in` loads with valid TLS and CSP `connect-src` allowing the new API and existing S3 origin.
- Old web `/cards?focus=example` redirects exactly to `https://app.reomi.ru/cards?focus=example`.
- API session response and CORS allow credentials from the new web origin. Unauthenticated protected endpoints still reject access.
- S3 upload preflight succeeds for both new and old origins.
- Existing user signs in and sees their own data; test media upload if an authorized browser session is available. Record explicitly when a real authenticated browser check cannot be performed.

Accounts, stored cards, notebooks, media and personal tokens are unchanged. Cookies, local preferences, and unsaved local drafts belong to the old browser origin and are not copied. Users must sign in again; installed PWAs should be reinstalled from the new hostname. Save any local drafts before switching.

## Rollback

Restore API `WEB_ORIGIN` and `BETTER_AUTH_URL` to the old web/API values and web runtime `NEXT_PUBLIC_API_URL` to the old API. Point both Coolify apps at the recorded baseline immutable tag and deploy API then web. Verify health and old-origin sign-in again. Keep both domain aliases and the additive S3 rule; they do not require rollback. The temporary redirect disappears with the old image. Revert the repository's build URL/redirect change before the next main deploy so automation does not reapply the cutover.

No database or storage rollback is necessary.
