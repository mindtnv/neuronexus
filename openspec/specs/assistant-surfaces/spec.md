# assistant-surfaces

## Purpose

Make the same assistant available beside the user's current work and in Chats without losing conversation state or interrupting reading and study.

## Requirements

### Requirement: Non-modal floating assistant
On viewports at least 720 pixels wide, authenticated users SHALL be able to open a floating assistant, move and resize it within the usable viewport, minimize it, and expand it to Chats. The floating window SHALL NOT reserve a sidebar column or prevent interaction with the underlying page. Position and size preferences SHALL recover safely after viewport changes or unavailable storage.

#### Scenario: Read while discussing
- **WHEN** a user opens the assistant over a book and moves the window
- **THEN** the reader remains interactive and its page, selection, and reading position remain unchanged

#### Scenario: Window no longer fits
- **WHEN** the viewport shrinks or stored geometry is invalid
- **THEN** the window is constrained to the usable viewport with its header, close control, and composer reachable

### Requirement: Full-screen mobile presentation
Below 720 pixels the assistant SHALL occupy the available screen, respect safe areas and the on-screen keyboard, and provide a close/back action that restores the underlying page at its previous position. Changing presentation SHALL retain the conversation, draft, attachments, and pending context.

#### Scenario: Return to reading on mobile
- **WHEN** a user opens the assistant from a passage, types a draft, and closes it
- **THEN** the same passage remains visible and reopening the assistant restores the draft and attached passage

### Requirement: Shared conversations across presentations
The floating window, mobile view, notebook entry points, and Chats SHALL use the same conversation identity and state. Navigation, minimization, and expansion SHALL NOT duplicate a message, restart or cancel an active response, or lose a pending approval. Explicit Stop SHALL continue to stop the response; network failure or reload SHALL use the existing recoverable stopped-turn behavior rather than imply background completion.

#### Scenario: Expand during generation
- **WHEN** a response is streaming in the floating window and the user expands it to Chats
- **THEN** the same response continues in the same conversation without a second request or duplicate user message

#### Scenario: Pending approval follows the conversation
- **WHEN** a write preview is opened in the floating window and the user visits Chats
- **THEN** Chats shows the same pending operation and approving it can apply the operation only once

### Requirement: Switching conversations preserves active responses
Selecting another conversation SHALL NOT stop a response in progress while the application remains connected. Streaming state, drafts, context, approvals, Stop actions, errors, and completion indicators SHALL remain associated with their originating conversation. Multiple conversations SHALL be able to respond concurrently within disclosed admission limits; only one turn at a time SHALL execute per conversation. Reaching a concurrency limit SHALL reject the new send without stopping existing turns or discarding its draft. Browser closure, reload, or a lost connection SHALL NOT imply guaranteed background execution.

#### Scenario: Two conversations respond independently
- **WHEN** conversation A is streaming and the user switches to B and sends a message
- **THEN** A continues, B can respond within the admission limit, and reopening A shows only A's response and context

#### Scenario: Stop one response
- **WHEN** two conversations are responding and the user stops one
- **THEN** only that conversation's response is stopped and the other continues

#### Scenario: Hidden conversation needs confirmation
- **WHEN** an unselected conversation reaches a write preview
- **THEN** it waits for explicit approval and displays an attention indicator without applying the action or replacing the currently selected conversation

### Requirement: Accessible operation and focus
Opening, closing, minimizing, and resetting the floating window SHALL be keyboard accessible. Moving/resizing SHALL have a keyboard-accessible alternative to pointer dragging. Desktop operation SHALL not trap focus outside a modal confirmation; mobile operation SHALL manage focus within its full-screen surface and restore focus on close. Study keyboard shortcuts SHALL not fire while the composer or its menus have focus.

#### Scenario: Compose during review
- **WHEN** a user types a number or presses Space in the assistant over a study session
- **THEN** the input affects the assistant and does not reveal or grade the underlying card

### Requirement: Session isolation and graceful unavailability
Assistant state SHALL be isolated by authenticated user and cleared from the active surface on sign-out or account change. If chat is unavailable, the assistant SHALL show an actionable unavailable state while preserving access to reading and manual study functions.

#### Scenario: Account changes during a response
- **WHEN** the user signs out or changes account while the assistant has an active response or draft
- **THEN** the prior account's response, objects, and draft are not displayed or continued in the new account

#### Scenario: No chat model configured
- **WHEN** a user opens the assistant without an available chat model
- **THEN** an unavailable explanation appears without preventing reading or manual card creation
