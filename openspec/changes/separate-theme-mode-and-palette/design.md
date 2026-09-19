# Design

## Context
The existing preference is one string in nn:theme, and palette CSS hardcodes a single color scheme. Head bootstrap duplicates the mode and chrome tables.

## Goals / Non-Goals
Independent choices, predictable migration and readable paired palettes. No server preferences, account sync or new external styling dependency.

## Decisions
Store version 2 with mode and palette under the same local key. Base light/dark map to Reomi; named legacy palettes retain their original mode. A pure palette catalog provides paired tokens, swatches and chrome colors. A self-contained preference runtime is used directly by live switching and serialized into the head bootstrap, eliminating duplicated parsing. Derived complementary neutral colors retain the original hue; semantic foregrounds are adjusted for contrast. Root-generated CSS has both palette and mode selectors.

## Risks / Trade-offs
Storage unavailable → keep choices in memory for the tab. System and storage events → reapply using the current preference. Foreground contrast adjustments can slightly change accent brightness while preserving palette identity. No migration or database rollback is needed; legacy preferences are read before conversion.
