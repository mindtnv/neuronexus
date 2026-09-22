# Design

## Context
The existing screen builds and flattens a deck tree and stores collapsed IDs locally. Aggregate counts already drive each row.

## Goals / Non-Goals
Provide local filtering and consistent controls. Do not change scheduling, counts, CRUD or server contracts.

## Decisions
Prune a copy of the tree with a pure helper, retaining ancestor nodes. Maintain a separate temporary collapsed set while filtering; the saved unfiltered set remains untouched. Reuse TextInput and PageSurface. Status segments are retired; search is independent of study counts.

## Risks / Trade-offs
A parent retained for context may not itself satisfy the filter. Its children expose why it remains. Counts intentionally retain the existing screen's semantics and loaded-data scope.
