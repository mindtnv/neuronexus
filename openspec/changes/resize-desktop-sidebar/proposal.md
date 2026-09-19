# Proposal

## Why
The fixed desktop sidebar cannot accommodate a user's preferred navigation width. A draggable edge lets users balance navigation labels against the active workspace.

## What Changes
- Resize the expanded desktop sidebar from its right edge, with a 72px compact snap or 208–360px expanded width.
- Remember the width locally; support keyboard adjustments and reset to 232 pixels.
- Retain the manual width on tablet screens; keep mobile navigation and hidden-sidebar behavior unchanged.

## Capabilities

### New Capabilities
- `sidebar-sizing`: Bounded, persistent desktop sidebar resizing.

### Modified Capabilities
None.

- Extend the same resize interaction to the chat conversation list (220–420px, default 280), with a separate local preference.

## Impact
Web UI store, shell sizing and window-controls insets. No API, database, dependencies or deployment changes. Other requested visual refinements and the existing deck-creation flow are independent of this capability.
