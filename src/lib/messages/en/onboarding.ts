const m = {
  steps: {
    welcome: 'Welcome',
    goals: 'Goals',
    import: 'Import',
    plantSeed: 'Plant seed',
  },
  stepOf: 'Step {n} of {total}',
  stepLabel: 'step {n} of {total}',
  skipSetup: 'Skip setup · you can do this later',
  welcome: {
    title: 'Welcome to NeuroNexus.',
    sub: "Build a garden from what you're learning. Every card you review is a drop of water. Every streak is a bloom. Let's get you set up in under a minute.",
  },
  goals: {
    title: 'What are you learning?',
    sub: "Pick anything — we'll tune the SRS and suggest starter decks.",
    dailyGoal: 'Daily goal',
    minutesOption: '{n} min',
  },
  topics: {
    languages: { n: 'Languages', d: 'vocab · grammar' },
    medicine: { n: 'Medicine', d: 'anat · pharm' },
    cs: { n: 'CS / Tech', d: 'algorithms · systems' },
    law: { n: 'Law', d: 'cases · statutes' },
    math: { n: 'Math', d: 'proofs · formulas' },
    other: { n: 'Other', d: 'custom topic' },
  },
  import: {
    title: 'Bring your existing cards.',
    sub: "Anki .apkg, CSV, or just a PDF — we'll turn notes into cards for you.",
    anki: { n: 'Anki .apkg', d: 'full fidelity · decks + media' },
    csv: { n: 'CSV / TSV', d: 'basic front/back mapping' },
    pdf: { n: 'PDF → AI', d: 'automatic converter' },
    popular: 'POPULAR',
    dropPdf: 'Drop a PDF here',
    dropPdfSub: 'AI will turn it into a deck with questions, mnemonics, and links',
    skipHint: 'Or start from scratch — skip this step',
  },
  seed: {
    title: 'Plant your first seed.',
    sub: 'Every deck grows into a plant. Pick a species for your first — you can always add more.',
    species: {
      fern: { n: 'Fern', d: 'steady · low-drama' },
      bamboo: { n: 'Bamboo', d: 'coming soon' },
      succulent: { n: 'Succulent', d: 'coming soon' },
      oak: { n: 'Oak', d: 'coming soon' },
    },
    yourName: 'Your name',
    namePlaceholder: 'Alex',
  },
  nav: {
    back: 'Back',
    continue: 'Continue',
    enter: 'Enter NeuroNexus',
  },
};
export default m;
