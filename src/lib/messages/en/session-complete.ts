const m = {
  complete: 'Session complete',
  heading: 'Nicely done, {name}.',
  defaultUserName: 'there',
  empty: {
    title: 'No recent session',
    subtitle: 'Finish a review to see your session summary here.',
    startReview: 'Start review',
  },
  intro: {
    prefix: 'You reviewed',
    cardsCount: '{n} cards',
    in: 'in',
    suffix: '— your fern grew a new frond.',
  },
  kpi: {
    cardsReviewed: 'Cards reviewed',
    retention: 'Retention',
    retentionSub: 'good + easy',
    duration: 'Duration',
    durationSub: 'mm:ss',
    xpEarned: 'XP earned',
    xpSub: '{total} total',
  },
  ratings: {
    again: 'Again',
    hard: 'Hard',
    good: 'Good',
    easy: 'Easy',
  },
  breakdown: {
    title: 'How it went',
    cardsCount: '{n} cards',
  },
  attention: {
    title: 'Cards that need attention',
    againBadge: '{n} again',
    requeueAll: 'Re-queue all',
    bodyBase: "Per-card struggle data isn't tracked for this session yet.",
    someAgain: '{n} cards were graded "Again" — they\'ll surface again soon.',
    noneAgain: 'Every card landed on Hard or better this round.',
  },
  tomorrow: {
    title: 'Tomorrow',
    due: '{n} due',
    eta: '~{min} min · best at 9:30am',
  },
  newAvailable: {
    title: 'New cards available',
    inQueue: '{n} in queue',
    hint: 'Learn now · extend session?',
  },
  actions: {
    visitGarden: 'Visit garden',
    viewGraph: 'View graph',
    finish: 'Finish',
    learnNew: 'Learn {n} new',
  },
  fern: {
    grew: 'Fern grew',
    stage: 'Stage {n}',
  },
  badges: {
    title: '+ New badges',
    perfectStreak: {
      name: 'Perfect streak',
      desc: '5 good in a row',
    },
    earlyBird: {
      name: 'Early bird',
      desc: 'Reviewed before 9am',
    },
  },
  streak: {
    label: '{days}-day streak',
    next: 'Next milestone: 30 days · Oak sapling',
  },
};

export default m;
