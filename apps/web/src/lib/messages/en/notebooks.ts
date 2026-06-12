// NotebookLM M1 — the /notebooks library screen (T8). A notebook holds sources
// (pdf/epub uploads + url/text); each source is parsed + embedded asynchronously
// by the server ingest worker, so the screen polls GET /sources/:id while the
// status is non-terminal and renders a status badge + indexed/total progress.
//
// `status.*` maps the machine `errorCode` (from @neuronexus/shared
// INGEST_ERROR_CODES) onto human prose — every error code MUST have an entry in
// BOTH locales (enforced by i18n-parity.test.ts).

const notebooks = {
  title: 'Notebooks',
  subtitle: 'Sourced libraries for grounded study.',

  // Setup notice (degrade, never crash) — shown when /ai/status.notebooksEnabled
  // is false (no embedding key / dimension-degraded).
  setup: {
    title: 'Notebooks aren\'t configured yet.',
    body:
      'Notebooks index your sources with embeddings. Set OPENAI_API_KEY (and keep INDEXING_ENABLED on) in the server environment, then restart the API.',
    docsHint: 'See the AI / RAG section of the project README for the full variable list.',
  },

  // Notebook list (left / top).
  list: {
    heading: 'Your notebooks',
    empty: 'No notebooks yet. Create one to add sources.',
    emptyArchived: 'The archive is empty.',
    searchEmpty: 'Nothing found.',
    create: 'New notebook',
    createTitle: 'New notebook',
    createLabel: 'Title',
    createPlaceholder: 'e.g. Machine Learning',
    rename: 'Rename notebook',
    renameTitle: 'Rename notebook',
    delete: 'Delete notebook',
    deleteConfirm: 'Delete this notebook? Its notes and links go away, but its sources stay in the library.',
    sourceCount: '{count} sources',
    tooMany: 'You\'ve reached the notebook limit.',
    search: 'Search notebooks…',
    showArchive: 'Archive',
    showActive: 'Active',
  },

  // «Notebooks 2.0» (N1) — metadata, list tiles, the create dialog.
  meta: {
    sourcesChip: '{count} sources',
    notesChip: '{count} notes',
    cardsChip: '{count} cards',
    updated: 'updated {time}',
    relativeNow: 'just now',
    relativeMinutes: '{count}m ago',
    relativeHours: '{count}h ago',
    relativeDays: '{count}d ago',
    pin: 'Pin',
    unpin: 'Unpin',
    archive: 'Archive',
    unarchive: 'Unarchive',
    pinned: 'Pinned',
    emojiLabel: 'Icon',
    emojiNone: 'No icon',
    colorLabel: 'Color',
    createDescription: 'Description (optional)',
    saveFailed: 'Could not save. Please try again.',
  },

  // «Notebooks 2.0» (N1) — the notes panel in the right dock.
  notes: {
    tab: 'Notes',
    heading: 'Notes',
    dockExpand: 'Expand notes',
    dockCollapse: 'Collapse notes',
    search: 'Search notes…',
    empty: 'No notes yet. Save chat answers or write your own.',
    searchEmpty: 'Nothing found.',
    add: 'Note',
    addTitle: 'New note',
    titlePlaceholder: 'Title',
    contentPlaceholder: 'Note body (Markdown)…',
    save: 'Save',
    saving: 'Saving…',
    cancel: 'Cancel',
    edit: 'Edit',
    delete: 'Delete',
    deleteConfirm: 'Delete this note?',
    pin: 'Pin',
    unpin: 'Unpin',
    badgeAnswer: 'answer',
    toCards: 'To cards',
    toCardsPrompt: 'Make flashcards from this note:\n\n{content}',
    back: 'Back to list',
    charCount: '{count} / {max}',
    tooLong: 'The note is too long.',
    createFailed: 'Could not save the note.',
    savedFromChat: 'Saved to notes',
    saveAnswer: 'To notes',
  },

  // «Notebooks 2.0» (N2) — the Overview tab (right dock, default).
  overview: {
    tab: 'Overview',
    heading: 'Overview',
    generate: 'Generate overview',
    generating: 'Reading your sources…',
    retry: 'Retry',
    failed: 'Could not generate the overview.',
    stale: 'Sources changed since this overview was generated.',
    refresh: 'Refresh overview',
    suggestedHeading: 'Suggested questions',
    empty: 'Add sources to generate an overview.',
    setupHint: 'Connect a chat model to generate overviews.',
    // Section headings for the overview tab's coverage + concept-map blocks.
    coverageHeading: 'Card coverage',
    mapHeading: 'Concept map',
  },

  // «Notebooks 2.0» (N2) — the Studio tab (generated artifacts).
  studio: {
    tab: 'Studio',
    heading: 'Studio',
    generateHeading: 'Generate',
    listHeading: 'Documents',
    empty: 'No documents yet. Generate one from your sources.',
    setupHint: 'Connect a chat model to generate study documents.',
    // Generation tiles (icon + name + one-line description).
    type_summary: 'Summary',
    type_summaryDesc: 'A structured briefing of the material.',
    type_study_guide: 'Study guide',
    type_study_guideDesc: 'Key concepts, themes, and self-check questions.',
    type_faq: 'FAQ',
    type_faqDesc: 'The most useful questions, answered.',
    type_timeline: 'Timeline',
    type_timelineDesc: 'Events and stages in order.',
    type_glossary: 'Glossary',
    type_glossaryDesc: 'Key terms with concise definitions.',
    type_quiz: 'Quiz',
    type_quizDesc: 'Self-check questions with grading.',
    // Artifact status badges.
    statusPending: 'Queued',
    statusGenerating: 'Generating…',
    statusError: 'Failed',
    // Row actions + viewer.
    regenerate: 'Regenerate',
    delete: 'Delete',
    deleteConfirm: 'Delete this document?',
    back: 'Back',
    copy: 'Copy',
    copied: 'Copied',
    toNote: 'To a note',
    savedToNote: 'Saved to notes',
    // Toasts keyed by the machine error code (ARTIFACT_ERROR_CODES) + route codes.
    createFailed: 'Could not generate. Please try again.',
    err_no_sources: 'Select at least one ready source.',
    err_invalid_type: 'That document type is unavailable.',
    err_too_many_artifacts: 'You\'ve reached the document limit.',
    err_generation_in_progress: 'Wait for the current generation to finish.',
    err_not_terminal: 'This document is still generating.',
    err_ai_disabled: 'Connect a chat model first.',
    // Per-artifact error-code prose (notebook_artifacts.error_code).
    error_ai_disabled: 'Chat is not configured.',
    error_timeout: 'Generation timed out.',
    error_generation_failed: 'Generation failed.',
    error_invalid_quiz: 'The generated quiz was malformed.',
    error_no_sources: 'No ready sources to generate from.',
    error_interrupted: 'Generation was interrupted — regenerate it.',
  },

  // «Notebooks 2.0» (N3) — the quiz player.
  quiz: {
    // Question-count dialog (studio tile click).
    dialogTitle: 'How many questions?',
    dialogHint: 'Pick how many questions the quiz should have.',
    dialogGenerate: 'Generate quiz',
    // Intro screen.
    introTitle: 'Test yourself',
    questionCount: '{count} questions',
    start: 'Start',
    // In-progress.
    questionOf: 'Question {n} of {total}',
    prev: 'Back',
    next: 'Next',
    finish: 'Finish',
    submitting: 'Scoring…',
    submitFailed: 'Could not submit the attempt.',
    openPlaceholder: 'Type your answer…',
    showAnswer: 'Show answer',
    modelAnswer: 'Model answer',
    selfCorrect: 'I was right',
    selfIncorrect: 'I was wrong',
    tfTrue: 'True',
    tfFalse: 'False',
    empty: 'This quiz has no questions.',
    // Result screen.
    scorePct: '{pct}% correct',
    retry: 'Try again',
    weakSpots: 'Weak spots → cards',
    weakSpotsPrompt: 'Make flashcards for the topics I got wrong:',
    weakSpotsAnswer: 'Answer:',
    breakdownHeading: 'Review',
    inSource: 'Show in source',
    // History.
    history: 'Attempt history',
    historyHeading: 'Attempt history',
    historyEmpty: 'No attempts yet.',
    back: 'Back',
  },

  // «Notebooks 2.0» (N3, Р9) — card-coverage block in the Overview tab. SQL-only
  // (renders without a chat key); only the gap prefill buttons are gated.
  coverage: {
    noSources: 'Add sources to see card coverage.',
    emptyHint: 'No cards from these sources yet — ask the agent to make some.',
    aggregate: '{covered}/{total} chunks · {cards} cards',
    sourceMeta: '{covered}/{total} chunks · {cards} cards',
    gapsHeading: 'Uncovered topics',
    gapMeta: '{count} uncovered chunks · {source}',
    gapAction: 'Make cards for this section',
    gapPrompt: 'Make flashcards for the section "{heading}" of the source "{source}".',
    noHeading: 'untitled',
  },

  // «Notebooks 2.0» (N4, Р10) — concept map block in the Overview tab.
  // Vectors-only (renders without a chat key); degrades to «not indexed».
  map: {
    heading: 'Concept map',
    hint: 'Sections of your sources, linked by similarity. Click a node to open it.',
    part: 'part {n}',
    empty: 'Add sources to see the concept map.',
    notIndexed: 'Your sources aren\'t indexed yet — the map appears once indexing finishes.',
  },

  // «Notebooks 2.0» (N4, Р11) — recommendations in the «Add from library» picker.
  attach: {
    suggestedHeading: 'Recommended',
    suggestedMatch: '{pct}% match',
  },

  // Source list (inside an open notebook).
  sources: {
    heading: 'Sources',
    empty: 'No sources yet. Add a PDF, EPUB, web page, or pasted text.',
    add: 'Add source',
    addTitle: 'Add a source',
    rename: 'Rename source',
    renameTitle: 'Rename source',
    renameLabel: 'Title',
    delete: 'Delete source',
    deleteConfirm: 'Delete this source? Its indexed content is removed.',
    tooMany: 'You\'ve reached the source limit for this notebook.',
    progress: '{indexed} / {total} indexed',
    back: 'Back to notebooks',
  },

  // Add-source dialog: kind picker + per-kind fields.
  add: {
    kindFile: 'Upload (PDF / EPUB)',
    kindUrl: 'Web page',
    kindText: 'Paste text',
    fileLabel: 'Choose a file',
    filePlaceholder: 'No file selected',
    fileHint: 'PDF or EPUB, up to {mb} MB.',
    urlLabel: 'URL',
    urlPlaceholder: 'https://…',
    titleLabel: 'Title',
    titlePlaceholder: 'Source title',
    textLabel: 'Text',
    textPlaceholder: 'Paste the text to index…',
    submit: 'Add',
    uploading: 'Uploading…',
    failed: 'Could not add the source. Please try again.',
  },

  // Three-panel workspace (M2): sources │ reader │ chat.
  workspace: {
    tabSources: 'Sources',
    tabReader: 'Reading',
    tabChat: 'Chat',
    tabDock: 'Notebook',
    // Per-source "include in chat" checkbox + the generated-cards count button.
    inChat: 'In chat',
    cardsButton: 'Cards',
    cardsCount: '{count} cards',
    cardsLoading: 'Loading…',
    cardsEmpty: 'No cards from this source yet.',
    // W5(a) — collapsible chat column.
    chatCollapse: 'Collapse chat',
    chatExpand: 'Expand chat',
  },

  // Center reader (M2 text mode + M4 PDF mode) — the active source's content.
  reader: {
    empty: 'Select a source to read it here.',
    notReady: 'This source is still being indexed.',
    noText: 'No readable text in this source.',
    page: 'p. {n}',
    chunkCount: '{count} sections',
    loadMore: 'Load more',
    loading: 'Loading…',
    // M4 PDF reader: loading / error.
    loadingBytes: '{loaded} / {total} KB',
    loadError: 'Could not open this PDF.',
    openText: 'Open the text view',
    // Mode toggle.
    modePdf: 'PDF',
    modeText: 'Text',
    // Toolbar (ink tools + zoom + page jump + save state).
    toolbar: 'Reader tools',
    toolHand: 'Move / scroll',
    toolPen: 'Pen',
    toolHighlighter: 'Highlighter',
    toolEraser: 'Eraser',
    toolSmartCard: 'Smart Card — drag to select, AI proposes a flashcard',
    fingerDraw: 'Draw with finger',
    undo: 'Undo',
    redo: 'Redo',
    width: 'Width {n}',
    color_lime: 'Lime',
    color_amber: 'Amber',
    color_rose: 'Rose',
    color_sky: 'Sky',
    color_violet: 'Violet',
    color_white: 'White',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    zoomReset: 'Fit width',
    pageJump: 'Go to page',
    saving: 'Saving…',
    saved: 'Saved',
    saveError: 'Save failed — retry',
  },

  // Card → source backlinks (M3) — the "Sources" panel on a card.
  backlinks: {
    title: 'Sources',
    open: 'Open in the notebook',
    tombstone: 'Source removed',
    untitled: 'Source',
    page: 'p. {n}',
  },

  // M5 — selection marks (highlights + notes) in the PDF reader.
  marks: {
    panelTitle: 'Markup',
    panelEmpty: 'Select text in the PDF to highlight it or add a note.',
    panelInkPage: 'p. {n} — drawing',
    pageGroup: 'Page {n}',
    highlight: 'Highlight',
    note: 'Note',
    delete: 'Delete',
    deleteConfirm: 'Delete this mark?',
    notePlaceholder: 'Add a note…',
    noteSave: 'Save',
    copyAction: 'Copy',
    askAction: 'Ask',
    cardAction: 'Card',
    openCard: 'Open card',
    export: 'Export to Markdown',
    color_lime: 'Lime',
    color_amber: 'Amber',
    color_rose: 'Rose',
    color_sky: 'Sky',
    color_violet: 'Violet',
  },

  // M5 — Quick card dialog (selection → flashcard).
  quickcard: {
    title: 'New card',
    deckLabel: 'Deck',
    deckPlaceholder: 'Select a deck…',
    frontLabel: 'Front',
    frontPlaceholder: 'Question…',
    backLabel: 'Back',
    backPlaceholder: 'Answer…',
    formulateBtn: '✨ Formulate',
    formulateHint: 'Generate with AI',
    formulateError: 'Could not generate. Fill in manually.',
    createBtn: 'Create card',
    creating: 'Creating…',
    createError: 'Could not create the card. Try again.',
    created: 'Card created',
    createdOpen: 'open',
    source: 'p. {n} · {title}',
    noDeck: 'No deck selected',
  },

  // Status badge + machine error codes (errorCode → status.<code>).
  status: {
    pending: 'Queued',
    parsing: 'Parsing…',
    indexing: 'Indexing…',
    ready: 'Ready',
    error: 'Failed',
    deleting: 'Removing…',
    // INGEST_ERROR_CODES — one entry per code (parity-enforced).
    too_large: 'File is too large.',
    too_many_chunks: 'Source is too long to index.',
    parse_failed: 'Could not read this source.',
    fetch_failed: 'Could not fetch this URL.',
    unsupported_mime: 'Unsupported file type.',
    empty_source: 'No readable text found.',
  },
};

export default notebooks;
