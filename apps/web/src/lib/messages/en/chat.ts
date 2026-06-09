const m = {
  // Thread list (left rail)
  threads: {
    title: 'Conversations',
    newThread: 'New chat',
    empty: 'No conversations yet.',
    untitled: 'New conversation',
    delete: 'Delete conversation',
    deleteConfirm: 'Delete this conversation? Its messages are removed for good.',
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
  // Agentic tool calls (search_cards / web_search) surfaced as cards in the stream
  tool: {
    search_cards: 'Searched your cards',
    web_search: 'Searched the web',
    running: 'Running…',
    done: 'Done',
    failed: 'Failed',
    resultToggle: 'Show result',
  },
  // Errors surfaced in the stream
  errors: {
    generic: 'Something went wrong. Please try again.',
    disabled: 'Chat is disabled on the server.',
  },
};

export default m;
