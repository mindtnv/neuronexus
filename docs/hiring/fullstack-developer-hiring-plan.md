# NeuroNexus Fullstack Developer Hiring Plan

## Recommendation

Hire one product-oriented fullstack engineer now.

This should be a net-new hire, not a redistribution of current capacity. The current codebase already spans a meaningful frontend surface area (`apps/web`), a typed Bun/Elysia API (`apps/api`), shared auth/database packages, and a growing production-hardening/test burden. Recent repo history also shows repeated fixes for basic UX wiring and interaction regressions, which is a sign that execution bandwidth is too thin at the product layer.

## Why A New Hire Is Warranted

The product is already beyond "one builder plus occasional cleanup" shape:

- The frontend has broad surface area: auth, review flow, decks, graph, garden, stats, settings, mobile preview, overlays, and multiple routed screens.
- The backend owns business-critical logic: auth, review queueing, FSRS grading, gamification rollups, GDPR endpoints, rate limiting, health checks, and structured logging.
- The architecture is intentionally server-of-truth, which means shipping user-facing work usually requires coordinated frontend and backend changes rather than isolated UI polish.
- There are still visible placeholders and mocked metrics in the product, which creates a backlog of integration work rather than pure design work.
- The CTO should not remain the default executor for roadmap throughput, production hardening, and hiring definition at the same time.

Redistributing this work across the current team would trade one bottleneck for another. The right move is to add a strong IC who can own product delivery across the app boundary without heavy hand-holding.

## Role Scope

Title: Fullstack Product Engineer

Mission: own feature delivery from UI interaction through API/data model changes for the NeuroNexus core product.

Primary responsibilities:

- Ship user-facing product work across Next.js/React and Bun/Elysia.
- Turn currently partial or mocked flows into fully integrated product behavior.
- Reduce UX regressions by owning interaction wiring, state transitions, and end-to-end testing.
- Carry schema/API changes through to the web store, mappers, and screens without handoff gaps.
- Participate in production hardening where it directly affects feature velocity: migrations, observability, auth flows, and release safety.

This is not a platform or infra hire. It is also not a pure frontend role. The hire should be strongest where product work crosses the frontend/backend boundary.

## Required Stack Coverage

Must-have:

- TypeScript across frontend and backend
- React 19 and Next.js App Router
- API design in Bun/Elysia or a comparable typed TypeScript backend
- PostgreSQL schema work and ORM-based data modeling
- Ownership of auth/session flows and user-facing product state
- Comfort working in a monorepo with shared packages and typed client/server contracts
- Testing discipline for integration-heavy product changes

Strong pluses:

- Zustand or similar client-state systems
- Drizzle ORM
- BetterAuth or equivalent session/cookie auth systems
- Spaced-repetition, learning-product, or other stateful consumer product experience
- Experience cleaning up partially mocked or prototype-era product surfaces

Avoid hiring profiles that are:

- pure frontend stylists with weak backend instincts
- backend-heavy platform engineers who do not enjoy product polish work
- junior generalists who still need task decomposition on every cross-stack change

## Expected Leverage On The Roadmap

One strong fullstack IC should materially improve delivery in four areas:

1. Product completion

- Convert partially mocked screens and metrics into real server-backed features.
- Close gaps between visible UI affordances and actual routed/working functionality.

2. Throughput

- Allow the CTO to stop being the primary executor for routine cross-stack product work.
- Let roadmap items move in parallel instead of serializing on one engineer.

3. Quality

- Catch interaction regressions earlier by owning both implementation and verification.
- Add or extend integration coverage when changes cross API/UI boundaries.

4. Technical debt containment

- Clean up leftover prototype-era or placeholder behavior while feature work is still manageable.
- Prevent the monorepo from drifting into a split-brain frontend/backend ownership model too early.

## Reporting Line

The hire should report directly to the CTO initially.

Reasoning:

- The role sits at the center of architecture and roadmap execution.
- Early success depends on good judgment across product, API, schema, and release concerns.
- The codebase is still compact enough that direct technical coaching from the CTO is the fastest ramp path.

Revisit reporting only after there is enough engineering headcount to justify a separate frontend or product-engineering lead.

## Proposed Agent Profile

Profile summary:

- Senior or strong mid-level fullstack product engineer
- Biased toward shipping, debugging, and tightening incomplete flows
- Comfortable moving from schema to endpoint to Zustand store to React screen in one pass
- Writes tests when behavior crosses boundaries
- Can improve the product without waiting for perfectly pre-sliced tickets

What success looks like in the first 60 days:

- Ships multiple cross-stack product improvements independently
- Removes at least one currently mocked or placeholder-heavy surface
- Reduces UX bug churn by closing wiring and state-management gaps
- Demonstrates good judgment around when to keep logic shared vs app-specific

## Initial Backlog For This Hire

The first owned backlog should be concrete and product-facing:

1. Reviewer and queue hardening

- Tighten review-session UX, empty states, and session-complete follow-through.
- Ensure queue behavior, grading edge cases, and suspended-card flows are robust end to end.

2. Replace mocked or placeholder product surfaces

- Turn stats approximations and placeholder comparisons into real server-backed metrics.
- Finish editor side panels and other visible TODO areas only if they are tied to real product value.
- Audit "coming soon" and partially wired interactions; either ship them or remove them.

3. Deck and graph workflows

- Improve nested-deck management, graph discoverability, and cross-navigation between study surfaces.
- Own the remaining UX gaps in deck actions, graph entry points, and state synchronization.

4. Mobile usability pass

- Bring the current mobile-facing flows from preview quality toward product quality where they affect retention.
- Prioritize review, decks, and core navigation over novelty screens.

5. Release-safety improvements that support product velocity

- Add targeted integration coverage for new cross-stack flows.
- Tighten API/web contracts where `any` casts or mapper gaps create regression risk.

## Hiring Decision

Proceed with a new hire.

This role is justified because NeuroNexus already has enough real product and backend complexity that cross-stack execution is a bottleneck. A strong fullstack product engineer will create leverage immediately; redistribution of current capacity will not.
