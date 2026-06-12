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
