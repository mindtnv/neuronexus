const m = {
  firstRun: {
    title: 'A quiet garden.',
    subtitle:
      'Three ways to start — build a deck, load a book, or just ask the AI.',
    cards: {
      deck: {
        title: 'Build a deck',
        desc: 'Create flashcards from scratch and start reviewing.',
      },
      library: {
        title: 'Load material',
        desc: 'Drop a PDF, EPUB, or URL — read it and make cards from it.',
      },
      chat: {
        title: 'Ask the AI',
        desc: 'Chat grounded on your own cards and sources.',
      },
    },
  },
  done: {
    title: 'Inbox zero for your brain.',
    subtitle: 'Nothing due right now. Your fern is already the happiest in the garden.',
    learnNew: 'Learn {n} new',
    exploreGraph: 'Explore graph',
  },
  graph: {
    title: 'Not enough constellation yet.',
    subtitlePrefix: 'The graph comes alive after ~40 cards. You have',
    subtitleSuffix: 'Keep going — AI will start linking related concepts automatically.',
    addCards: 'Add cards',
  },
};

export default m;
