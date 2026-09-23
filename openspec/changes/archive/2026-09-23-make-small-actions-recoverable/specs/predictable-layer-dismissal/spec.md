# Spec Delta

## Purpose

Let users leave menus, selections and temporary panels predictably without losing input, dismissing unrelated layers or breaking their browser navigation context.

## ADDED Requirements

### Requirement: Only the top applicable layer handles dismissal
Menus, dialogs, mobile sheets, temporary inspector panels and PDF/text selection controls SHALL share a topmost-layer dismissal policy. Escape SHALL close or request closure of one applicable layer only. Outside interaction SHALL be evaluated against that layer and its owned portals, including nested pickers. Closing a layer SHALL never activate a destructive control underneath it or count as write approval. Stable desktop workspace panels SHALL retain their existing explicit controls rather than closing on every outside click.

#### Scenario: Menu inside an editor dialog
- **WHEN** the user presses Escape with a picker open inside an editor dialog
- **THEN** only the picker closes, leaving the dialog, input and pending approval unchanged

#### Scenario: Click inside an owned portal
- **WHEN** a user interacts with a color picker or menu rendered outside its parent layer's DOM subtree
- **THEN** the parent does not interpret that interaction as an outside dismissal

### Requirement: Dirty content guards every closing path
Escape, close buttons, outside dismissal and mobile Back SHALL all respect the same applicable save/keep/discard/stay decision for dirty editors. A selection's passage and location snapshot SHALL survive editing and failed submission. Closing a display-only selection toolbar SHALL not remove saved marks or comments. An in-progress or uncertain write SHALL not be implicitly cancelled, submitted again or assumed successful by closing its layer.

#### Scenario: Escape from an unsaved annotation comment
- **WHEN** a user edits a comment attached to a selected passage and presses Escape
- **THEN** the dirty-input decision appears, and Stay restores the same passage, comment input and editing context

#### Scenario: Outside click after save failure
- **WHEN** a note save fails and the user clicks outside its editor
- **THEN** dismissal cannot silently erase the text or close the editor without the applicable explicit decision

### Requirement: Mobile Back closes temporary UI before leaving context
On mobile, application/browser Back SHALL close the top temporary layer before leaving its underlying route. Route-addressed readers and editors SHALL continue to use their own navigation entries. Back/Forward, repeated Back during a guard, explicit object links and same-tab reload SHALL preserve existing navigation guarantees without phantom route entries, loops or automatically replayed actions. Closing the software keyboard alone SHALL not discard a layer or its input.

#### Scenario: Back through nested mobile UI
- **WHEN** a mobile user opens a menu inside a sheet and uses Back twice
- **THEN** the first Back closes the menu and the second closes the sheet, retaining the underlying route and work

#### Scenario: Guard remains open during repeated Back
- **WHEN** a user presses Back repeatedly while a dirty-layer decision is open
- **THEN** only one decision remains active and Stay preserves the current layer, route and input without a navigation loop

#### Scenario: Reload does not resurrect a menu
- **WHEN** a user reloads while a temporary menu is open
- **THEN** the route and independently managed draft recover normally, without reopening or getting stuck behind a stale transient-layer history entry

### Requirement: Dismissal restores usable focus
Modal layers SHALL contain keyboard focus while active. Escape and explicit close SHALL return focus to the invoking control or a logical surviving target without scrolling the reader. Outside-click dismissal of a nonmodal menu SHALL preserve the user's clicked focus destination. Layers SHALL remain usable with reduced motion, narrow viewports and an open mobile keyboard, and account changes SHALL remove outgoing transient content without exposing it to the next account.

#### Scenario: Invoker no longer exists
- **WHEN** a menu closes after its original row disappears
- **THEN** focus moves to an accessible surviving list or workspace control without jumping to the top of the document

#### Scenario: Account changes with a selection panel open
- **WHEN** another account becomes active while a source selection panel is open
- **THEN** the outgoing passage and controls disappear and stale callbacks cannot reopen them
