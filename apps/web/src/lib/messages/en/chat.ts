const m = {
  // Thread list (left rail)
  threads: {
    title: 'Conversations',
    newThread: 'New chat',
    empty: 'No conversations yet.',
    untitled: 'New conversation',
    delete: 'Delete conversation',
    deleteConfirm: 'Delete this conversation? Its messages are removed for good.',
    rename: 'Rename',
    // Relative "updated N ago" line under each thread title. `{time}` is the
    // pre-formatted relative duration (e.g. "3 h", "2 d"), built in code.
    updatedAgo: 'updated {time} ago',
    relativeNow: 'just now',
    relativeMinutes: '{count} min',
    relativeHours: '{count} h',
    relativeDays: '{count} d',
    // Search + date groups + pin (agentic-environment pack, A1/A2/C4).
    searchPlaceholder: 'Search conversations…',
    searchNoResults: 'No conversations match.',
    groupPinned: 'Pinned',
    groupToday: 'Today',
    groupYesterday: 'Yesterday',
    groupWeek: 'Previous 7 days',
    groupOlder: 'Older',
    pin: 'Pin',
    unpin: 'Unpin',
  },
  // Message stream (right pane)
  stream: {
    emptyTitle: 'Ask your cards.',
    emptySubtitle:
      'Chat is grounded in your own cards. Answers cite the cards they came from; anything outside your cards is labelled as such.',
    you: 'You',
    assistant: 'Assistant',
    thinking: 'Thinking…',
    sources: 'From your cards',
    sourcesCount: 'Cards used: {count}',
    sourceDeck: 'Deck',
    // Smart scroll (B1) + day separators (B2).
    jumpToBottom: 'Jump to latest',
    newMessages: 'New messages',
    today: 'Today',
    yesterday: 'Yesterday',
  },
  // Composer
  composer: {
    placeholder: 'Ask about your cards or tell me what to do…',
    send: 'Send',
    sending: 'Sending…',
    // Stop the in-flight stream (toggles in for Send while streaming).
    stop: 'Stop',
    // Model (reasoning-level) picker — hidden when no allow-list is configured.
    model: 'Model',
    // Optional per-turn deck scope picker.
    deckScope: 'Scope to deck',
    allDecks: 'All cards',
    // @-mention popover sections (D1).
    mentionDecks: 'Decks',
    mentionCards: 'Cards',
    mentionNoResults: 'No matches',
    removeMention: 'Remove mention',
    // Deep-research mode toggle (visible when the server offers fetch_page).
    research: 'Deep research',
    researchHint: 'Deep research mode: the agent reads pages thoroughly before answering and drafting cards',
    researchPlaceholder: 'Paste a link or name a topic to research in depth…',
    attach: 'Attach a file',
    removeAttachment: 'Remove attachment',
    attachLimit: 'Up to 4 attachments per message',
    attachTooBig: 'File is too large',
    attachUnsupported: 'Unsupported file type',
    attachFailed: 'Upload failed',
  },
  // Slash-command templates (D2) — `/` at the start of the draft opens the menu;
  // picking one inserts the localized template ({deck} = the biggest deck).
  slash: {
    quizLabel: 'Quiz',
    quizTemplate: 'Quiz me on {deck}: 5 questions, one at a time, grade my answers.',
    forecastLabel: 'Forecast',
    forecastTemplate: 'What does my review load look like for the next 2 weeks?',
    statsLabel: 'Stats',
    statsTemplate: 'How did I study over the last 30 days? What should I improve?',
    reviewLabel: 'Review',
    reviewTemplate: 'What should I review today in {deck} and why?',
    researchLabel: 'Research',
    researchTemplate: 'Study this page in depth and turn it into atomic flashcards: ',
  },
  // Suggested prompts — pills on the empty state of a NEW conversation, built
  // client-side from the store mirror (deck names / due counts). Click = send.
  suggested: {
    dueToday: 'What should I review today?',
    deckProgress: 'How am I doing in {name}?',
    failing: 'What do I fail most often?',
    quiz: 'Quiz me on {name}',
  },
  // Setup notice (chatEnabled === false)
  setup: {
    title: 'Chat isn\'t configured yet.',
    body:
      'Grounded chat needs an OpenAI-compatible chat model. Set CHAT_API_KEY (and optionally CHAT_BASE_URL / CHAT_MODEL) in the server environment, then restart the API.',
    indexNote:
      'Embeddings (for retrieval) are configured separately via OPENAI_API_KEY — leave both unset to keep AI features off.',
    docsHint: 'See the AI / RAG section of the project README for the full variable list.',
  },
  // Streamed reasoning trace (collapsible, ephemeral — never persisted)
  reasoning: {
    label: 'Reasoning',
    show: 'Show reasoning',
    hide: 'Hide reasoning',
  },
  // Per-assistant-message actions (copy prose, regenerate the turn).
  message: {
    copy: 'Copy',
    copied: 'Copied',
    regenerate: 'Regenerate',
    openCard: 'Open card',
    // Recovery affordance on a trailing user turn with no answer (stopped/torn).
    stoppedRetry: 'Stopped — regenerate?',
    // Edit-and-rerun the last user message (Codex-like redesign, AC4.1).
    edit: 'Edit',
    editSave: 'Save and re-run',
    editCancel: 'Cancel edit',
    // Code-block copy buttons (B3) + the model · tokens badge (B6) + queue (D4).
    codeCopy: 'Copy code',
    codeCopied: 'Copied',
    tokens: '{count} tok',
    queued: 'Queued',
    queuedCancel: 'Cancel queued message',
  },
  // Agentic tool calls (search_cards / web_search) surfaced as cards in the stream
  tool: {
    search_cards: 'Searched your cards',
    web_search: 'Searched the web',
    card_progress: 'Checked card progress',
    study_stats: 'Checked study stats',
    due_forecast: 'Checked upcoming load',
    list_decks: 'Listed your decks',
    browse_cards: 'Browsed your cards',
    get_card: 'Opened a card',
    fetch_page: 'Read a page',
    // Write/SRS tool labels (B5) — `{front}` = the card's front excerpt,
    // `{deck}` = the target deck name; never a UUID.
    create_card: 'Drafted a card for {deck}',
    create_card_nodeck: 'Drafted a card',
    create_card_batch: 'Drafted {count} cards for {deck}',
    create_card_batch_nodeck: 'Drafted {count} cards',
    edit_card: 'Edited «{front}»',
    suspend: 'Suspended «{front}»',
    set_due: 'Rescheduled «{front}»',
    forget: 'Reset «{front}»',
    // Notebook write tool (Р14 / N3) — `{title}` = the note's title.
    save_note: 'Saved a note: «{title}»',
    save_note_untitled: 'Saved a note',
    // Pluralized labels for a contiguous run of the same tool (AC2.2 collapse).
    get_card_n: 'Reviewed {count} cards',
    card_progress_n: 'Checked progress on {count} cards',
    browse_cards_n: 'Browsed cards {count} times',
    due_forecast_n: 'Checked upcoming load {count} times',
    fetch_page_n: 'Read {count} pages',
    running: 'Running…',
    done: 'Done',
    failed: 'Failed',
    awaiting: 'Needs approval',
    resultToggle: 'Show result',
  },
  // Condensed activity group (Codex-like redesign) — the timed, collapsible work
  // block that wraps an assistant turn's reasoning + tool steps.
  activity: {
    worked: 'Worked for {time}',
    working: 'Working…',
    workedSub: '<1s',
    workedSeconds: '{count}s',
    workedMinutes: '{m}m {s}s',
    workedHours: '{h}h {m}m',
    steps: '{count} steps',
    step: '{count} step',
    appliedCreated: 'Created {count} cards in {deck} · open',
    appliedCreatedNodeck: 'Created {count} cards · open',
    appliedCreatedOne: 'Card created in {deck} · open',
    appliedCreatedOneNodeck: 'Card created · open',
    appliedEdited: 'Card updated · open',
  },
  // Confirm-before-write controls (Phase B) — a write/SRS tool pauses the turn
  // and asks for explicit human approval, rendered inside the pending tool card.
  confirm: {
    pendingTitle: 'Awaiting your confirmation',
    apply: 'Apply',
    reject: 'Reject',
    applied: 'Applied',
    rejected: 'Rejected',
    // Blast-radius summary shown above Apply so destructive writes are deliberate.
    willCreate: 'Will create {count} cards',
    willDelete: 'Will DELETE {count} cards — FSRS history lost',
    affectsSiblings: 'Affects other cards of this note',
    // Confirm previews (B4/C8): before/after diff rows + proposed content.
    changes: 'Proposed changes',
    proposed: 'New card content',
    // Batch create_card preview — per-card section heading.
    cardN: 'Card {n}',
    // Per-card confirm editor (batch create): include/exclude + inline edits +
    // a note to the agent.
    applyN: 'Apply ({count})',
    excludeCard: 'Exclude',
    includeCard: 'Include',
    feedbackPlaceholder: 'Optional note for the agent — what to change…',
    // One-card-at-a-time confirm wizard (batch create).
    cardOf: 'Card {n} of {total}',
    acceptCard: 'Accept',
    back: 'Back',
    acceptedBadge: 'Accepted',
    excludedBadge: 'Excluded',
    reviewJump: 'Open this card again',
    // Source provenance preview (NotebookLM M3) — the passages the new card(s)
    // will be linked to.
    provenanceTitle: 'Linked sources',
    provenanceRow: 'Source: {title}',
    provenanceRowPage: 'Source: {title}, p. {n}',
    // save_note proposal (Р14 / N3) — the note the agent proposes to save.
    noteTitle: 'Note',
  },
  // Source-passage citations (NotebookLM M2) — chips under a grounded answer.
  source: {
    open: 'Open in the reader',
    untitled: 'Source',
    page: 'p. {n}',
  },
  // Errors surfaced in the stream
  errors: {
    generic: 'Something went wrong. Please try again.',
    disabled: 'Chat is disabled on the server.',
    turnInProgress: 'A reply is already running in this thread — wait for it to finish.',
  },
};

export default m;
