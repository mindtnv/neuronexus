# Design

## Context
The UI store persists collapsed state and calculates window-control offsets from a fixed sidebar width. The shell uses CSS breakpoints for tablet and mobile presentation.

## Goals / Non-Goals
Goal: one shared width value drives desktop rendering and window-control offsets. No server-side preference or mobile drawer change.

## Decisions
Use the existing UI store and guarded localStorage with a 232 px default, a 72 px compact snap below 160 px, and 208–360 px expanded bounds. Pointer capture keeps dragging reliable outside the narrow handle; a focusable separator supports arrow keys, Home/End and double-click reset. CSS uses the same manual preference on all non-mobile viewports and retains the mobile drawer. A generic split-pane dependency would be disproportionate.

## Risks / Trade-offs
Unavailable or malformed storage → fall back safely. Resizing across a breakpoint → hide the handle only below 720 px without changing mobile behavior. Store updates during dragging → only the small shell and offset subscribers update; no domain data requests.

## Conversation list extension
A reusable resize handle and guarded `nn:chat:rail-width` preference size the conversation list. Its rendered width is constrained to 45% of available non-mobile workspace, keeping the message area usable. Mobile uses the existing full-width list.
