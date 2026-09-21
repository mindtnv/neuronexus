# Design

## Context

See proposal.md for motivation. Production uses separate Coolify Docker-image applications in team 8 on `82.202.165.26`, with immutable GHCR images. The web API URL is baked into the image by `.github/workflows/deploy.yml`. API CORS and Better Auth share `WEB_ORIGIN`; auth and reset URLs use `BETTER_AUTH_URL` and `WEB_ORIGIN`. Media lives at `https://s3.1dedic.ru/neuronexus` and is not moving.

## Goals / Non-Goals

**Goals:** staged routing, a verifiable cutover, and a recorded rollback.

**Non-Goals:** apex routing, new infrastructure, account duplication, database migrations or index changes, and copying cross-origin browser storage.

## Decisions

- Add each new HTTPS domain alongside its old Coolify domain before changing runtime origins. This preserves the currently deployed image and enables certificate provisioning once DNS propagates.
- Use an exact-host Next.js redirect for the former web address, preserving path/query. Initially use temporary 307 to make rollback effective without cached permanent redirects. Do not redirect API traffic: token clients retain their existing URL and HTTP methods.
- Cut over API `WEB_ORIGIN=https://app.reomi.ru` and `BETTER_AUTH_URL=https://api.reomi.ru`; update the web build argument and runtime metadata to the new API. Keep auth secrets, database, S3, AI settings and immutable-image deployment flow unchanged.
- Host-only API cookies remain sufficient: both new origins share `reomi.ru`, and browser fetch already includes credentials. Do not broaden cookie domains or CORS wildcards.
- Verify production S3 preflight for the new browser origin, adding only that origin if necessary. Preserve existing allowed origins and storage location.

## Risks / Trade-offs

- New registration/DNS lag → do not merge/deploy the redirect and new web image until public DNS and HTTPS pass.
- Old browser sessions and local preferences cannot transfer → users sign in again; their server data is unchanged. Installed PWAs must be installed from the new origin.
- Brief API-first rollout gap → prepare all images and DNS first, then align API origins immediately before the gated rollout; restore prior values on failure.
- Forgotten build argument → verify the deployed CSP and JS reference the new API.

## Migration Plan

1. Record current image tags, domains, labels and relevant nonsecret environment values locally for rollback.
2. Add new Coolify domains, preserving old aliases; deploy the same current images and verify old service health.
3. Prepare redirect, build configuration and deployed endpoint documentation; run focused routing checks and required CI gates.
4. Wait for authoritative/public A records and valid HTTPS on both new domains.
5. Set new API auth/CORS origins and web runtime API metadata, then deploy the tested commit through the existing main workflow.
6. Verify both applications are `running:healthy`, readiness, TLS, web redirects/CSP, new-origin CORS, session endpoint and storage preflight. Check a real account in the browser if a session is available; otherwise explicitly record that authenticated acceptance remains unproven.
7. Roll back by restoring the recorded image tags and old runtime origins, redeploying API and web, and retaining both sets of domain aliases. No data rollback is required.
