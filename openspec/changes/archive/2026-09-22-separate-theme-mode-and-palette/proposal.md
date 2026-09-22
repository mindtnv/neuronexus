# Proposal

## Why
Current palettes lock users into light or dark appearance. Users need the same color identity in either mode.

## What Changes
- Independent Light, Dark or System mode and one of 17 palettes (Reomi plus the 16 existing named palettes).
- Both modes for every palette, with readable semantic colors and matching browser chrome.
- Migrate existing theme choices without losing their palette or mode, and paint the resolved choice before hydration.

## Capabilities
### New Capabilities
- `appearance-preferences`: Independent mode and palette, persistent selection and legacy migration.
### Modified Capabilities
None.

## Impact
Frontend palette tokens, settings, component lab and head bootstrap. No API, database or deployment changes.
