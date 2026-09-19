## Purpose
Allow independent color palette and light/dark appearance choices throughout the application without losing existing preferences.

## ADDED Requirements

### Requirement: Independent mode and palette
Users SHALL choose Light, Dark or System independently of a palette. Every palette SHALL provide both light and dark appearances. Changing one choice SHALL preserve the other.

#### Scenario: Switch mode
- **WHEN** a user changes mode with Nord selected
- **THEN** Nord remains selected and all application surfaces use the selected mode

#### Scenario: Follow the operating system
- **WHEN** the OS changes appearance while System is selected
- **THEN** the effective mode changes and the chosen palette remains selected

### Requirement: Persistent and compatible appearance
The application SHALL restore the mode and palette before its first painted content and keep browser chrome consistent. Old named themes SHALL retain their palette and original mode; old light/dark/system choices SHALL map to the default palette.

#### Scenario: Legacy preference
- **WHEN** a user with an old Dracula preference reloads
- **THEN** Dracula and Dark are selected without a wrong-theme first frame

#### Scenario: Invalid or unavailable storage
- **WHEN** the preference is malformed or storage is unavailable
- **THEN** the app remains usable, starts with System and the default palette when no valid preference exists, and permits temporary live changes

#### Scenario: Another tab changes appearance
- **WHEN** another tab updates the preference
- **THEN** the current tab updates its appearance and controls

### Requirement: Readable paired palettes
Body and secondary text and filled-button labels SHALL maintain at least 4.5:1 contrast against their intended backgrounds in both modes. Decorative dim text SHALL maintain at least 3:1 contrast.

#### Scenario: Every palette pair
- **WHEN** any supported palette is resolved in Light or Dark
- **THEN** its semantic text and filled-button colors satisfy the stated contrast thresholds
