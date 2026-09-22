# Tasks

## 1. Prepare and verify routing changes

- [x] 1.1 Add a focused redirect behavior test, observe it fail, then implement legacy-host-only redirect preserving paths/query; verify canonical, lookalike and localhost requests are not redirected.
- [x] 1.2 Update the production web API build argument and MCP deployment docs; verify strict OpenSpec validation, typecheck, migration-faithful tests, build and real-S3 CI gates.
- [x] 1.3 Document cutover and rollback with the actual Coolify apps, env names and session/PWA implications; verify the recorded rollback image matches current live deployment.

## 2. Stage production infrastructure

- [x] 2.1 Save routing and nonsecret environment rollback state, add new Coolify domains alongside old ones, redeploy unchanged images and verify both old endpoints remain healthy.
- [x] 2.2 Read existing S3 CORS, preserve existing rules and allow the new web origin if needed; verify browser upload preflight succeeds.

## 3. Cut over after DNS propagation

- [x] 3.1 Verify authoritative/public DNS resolves both new hostnames to the production server and both have valid HTTPS certificates.
- [x] 3.2 Align API auth/CORS and web runtime values, release the tested web build and verify both applications become running:healthy.
- [x] 3.3 Verify live redirect path/query preservation, readiness, CSP, CORS, auth session endpoint and legacy API compatibility; record the result and any limitation on authenticated browser acceptance.
