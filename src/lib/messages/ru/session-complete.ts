const m = {
  complete: 'Сессия завершена',
  heading: 'Отличная работа, {name}.',
  defaultUserName: 'друг',
  empty: {
    title: 'Недавних сессий нет',
    subtitle: 'Заверши повтор, чтобы увидеть здесь итоги сессии.',
    startReview: 'Начать повтор',
  },
  intro: {
    prefix: 'Ты повторил',
    cardsCount: '{n} карт',
    in: 'за',
    suffix: '— твой папоротник выпустил новый лист.',
  },
  kpi: {
    cardsReviewed: 'Повторено карт',
    retention: 'retention',
    retentionSub: 'good + easy',
    duration: 'Время',
    durationSub: 'мм:сс',
    xpEarned: 'Получено XP',
    xpSub: 'всего {total}',
  },
  ratings: {
    again: 'Снова',
    hard: 'Трудно',
    good: 'Хорошо',
    easy: 'Легко',
  },
  breakdown: {
    title: 'Как прошло',
    cardsCount: '{n} карт',
  },
  attention: {
    title: 'Карты, которым нужно внимание',
    againBadge: '{n} снова',
    requeueAll: 'Вернуть все в очередь',
    bodyBase: 'Детализация по каждой карте в этой сессии пока не сохраняется.',
    someAgain: '{n} карт получили оценку «Снова» — они скоро появятся снова.',
    noneAgain: 'В этот раз все карты получили «Трудно» или выше.',
  },
  tomorrow: {
    title: 'Завтра',
    due: '{n} к повтору',
    eta: '~{min} мин · лучше всего в 9:30',
  },
  newAvailable: {
    title: 'Доступны новые карты',
    inQueue: '{n} в очереди',
    hint: 'Учить сейчас · продлить сессию?',
  },
  actions: {
    visitGarden: 'В сад',
    viewGraph: 'Открыть граф',
    finish: 'Готово',
    learnNew: 'Учить {n} новых',
  },
  fern: {
    grew: 'Папоротник вырос',
    stage: 'Стадия {n}',
  },
  badges: {
    title: '+ Новые бейджи',
    perfectStreak: {
      name: 'Идеальный стрик',
      desc: '5 «good» подряд',
    },
    earlyBird: {
      name: 'Ранняя пташка',
      desc: 'Повтор до 9:00',
    },
  },
  streak: {
    label: 'стрик {days} дн.',
    next: 'Следующая цель: 30 дней · Молодой дуб',
  },
};

export default m;
