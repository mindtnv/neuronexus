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
    create: 'New notebook',
    createTitle: 'New notebook',
    createLabel: 'Title',
    createPlaceholder: 'e.g. Machine Learning',
    rename: 'Rename notebook',
    renameTitle: 'Rename notebook',
    delete: 'Delete notebook',
    deleteConfirm: 'Delete this notebook? Its sources are removed for good.',
    sourceCount: '{count} sources',
    tooMany: 'You\'ve reached the notebook limit.',
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
