# Design

## Context
Cards currently render each header/row as an independent grid with a template whose minimum tracks exceed the row box. Visibility only depends on the mobile breakpoint.

## Goals / Non-Goals
Goals: reuse the column metadata for rendering, visibility controls and shared minimum width. Non-goals: column reordering, manual track resizing, server preferences, and changes to card data.

## Decisions
- Put header and rows in one minimum-width canvas inside the existing scroll area; retain the grid renderer instead of replacing table interactions.
- Store a versioned list of visible IDs per viewport class in localStorage; keep in-memory changes if storage is unavailable. Keep Question mandatory to identify rows.
- Use a keyboard-accessible floating picker with checkboxes, reset, outside click and Escape dismissal.

## Risks / Trade-offs
- More visible columns require horizontal scrolling → expose one scroll container and keep common track widths.
- Small screens cannot fit every column → preserve the compact default, while respecting explicit mobile choices.
