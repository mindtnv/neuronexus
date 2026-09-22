# sidebar-sizing

## Purpose
Allow users to balance desktop navigation and workspace space through a bounded sidebar width preference.

## Requirements

### Requirement: Resize desktop sidebar
The non-mobile sidebar SHALL expose a right-edge resize handle with a compact width of 72 CSS pixels or an expanded range of 208–360 CSS pixels and default width of 232 pixels.

#### Scenario: Pointer resizing
- **WHEN** the user drags the handle beyond either limit
- **THEN** the sidebar stops at that limit and the workspace follows its right edge

#### Scenario: Keyboard sizing and reset
- **WHEN** the focused handle receives arrow keys, Home or End, or is double-clicked
- **THEN** arrows adjust the width, Home and End choose the bounds, and double-click restores the default

### Requirement: Local preference and responsive compatibility
The width SHALL survive reloads locally, degrade safely when storage is unavailable or invalid, and preserve mobile navigation and sidebar hiding while retaining the chosen width on tablet-sized screens.

#### Scenario: Restore valid width
- **WHEN** the application reloads after resizing
- **THEN** the saved bounded width is restored on desktop

#### Scenario: Unavailable storage
- **WHEN** preference storage cannot be read or written
- **THEN** navigation and resizing remain usable with an in-memory preference

#### Scenario: Manual compact navigation
- **WHEN** dragging reduces the requested width below 160 pixels
- **THEN** the sidebar snaps to 72 pixels and shows icon navigation; dragging back past the threshold restores expanded navigation

#### Scenario: Tablet viewport
- **WHEN** the viewport narrows but remains at least 720 pixels wide
- **THEN** the saved sidebar choice remains active, with no automatic compact transition

#### Scenario: Mobile viewport
- **WHEN** the viewport is below 720 pixels or the sidebar is hidden
- **THEN** the resize handle is absent and existing mobile navigation remains available

### Requirement: Resizable conversation list
The non-mobile chat conversation list SHALL expose a draggable right edge with a preferred width of 220–420 pixels, default 280, constrained to the available workspace. The preference SHALL survive reload, support arrow keys and reset, and degrade safely when storage is unavailable.

#### Scenario: Adjust the list
- **WHEN** the user drags or keyboard-adjusts the conversation list edge
- **THEN** the list width changes within its bounds and the message area uses the remaining space

#### Scenario: Restore the preference
- **WHEN** the user reloads after changing the list width
- **THEN** the preferred width is restored while mobile retains its full-width conversation list
