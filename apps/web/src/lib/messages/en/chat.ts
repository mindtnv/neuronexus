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
  },
  // Composer
  composer: {
    placeholder: 'Ask a question about your cards…',
    send: 'Send',
    sending: 'Sending…',
    // Stop the in-flight stream (toggles in for Send while streaming).
    stop: 'Stop',
    // Model (reasoning-level) picker — hidden when no allow-list is configured.
    model: 'Model',
    // Optional per-turn deck scope picker.
    deckScope: 'Scope to deck',
    allDecks: 'All cards',
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
  },
  // Agentic tool calls (search_cards / web_search) surfaced as cards in the stream
  tool: {
    search_cards: 'Searched your cards',
    web_search: 'Searched the web',
    card_progress: 'Checked card progress',
    study_stats: 'Checked study stats',
    list_decks: 'Listed your decks',
    browse_cards: 'Browsed your cards',
    get_card: 'Opened a card',
    // Pluralized labels for a contiguous run of the same tool (AC2.2 collapse).
    get_card_n: 'Reviewed {count} cards',
    card_progress_n: 'Checked progress on {count} cards',
    browse_cards_n: 'Browsed cards {count} times',
    running: 'Running…',
    done: 'Done',
    failed: 'Failed',
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
  },
  // Errors surfaced in the stream
  errors: {
    generic: 'Something went wrong. Please try again.',
    disabled: 'Chat is disabled on the server.',
  },
};

export default m;
