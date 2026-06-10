const m = {
  // Thread list (left rail)
  threads: {
    title: 'Беседы',
    newThread: 'Новый чат',
    empty: 'Бесед пока нет.',
    untitled: 'Новая беседа',
    delete: 'Удалить беседу',
    deleteConfirm: 'Удалить эту беседу? Её сообщения исчезнут безвозвратно.',
    rename: 'Переименовать',
    // Строка «обновлено N назад» под названием беседы. `{time}` — готовая
    // относительная длительность (например «3 ч», «2 дн»), собирается в коде.
    updatedAgo: 'обновлено {time} назад',
    relativeNow: 'только что',
    relativeMinutes: '{count} мин',
    relativeHours: '{count} ч',
    relativeDays: '{count} дн',
    // Поиск + группы по датам + закрепление (агентская среда, A1/A2/C4).
    searchPlaceholder: 'Поиск по беседам…',
    searchNoResults: 'Ничего не найдено.',
    groupPinned: 'Закреплённые',
    groupToday: 'Сегодня',
    groupYesterday: 'Вчера',
    groupWeek: 'Последние 7 дней',
    groupOlder: 'Ранее',
    pin: 'Закрепить',
    unpin: 'Открепить',
  },
  // Message stream (right pane)
  stream: {
    emptyTitle: 'Спросите свои карточки.',
    emptySubtitle:
      'Чат опирается на ваши собственные карточки. Ответы ссылаются на карточки-источники; всё, что вне ваших карточек, помечается отдельно.',
    you: 'Вы',
    assistant: 'Ассистент',
    thinking: 'Думаю…',
    sources: 'Из ваших карточек',
    sourcesCount: 'Использовано карточек: {count}',
    sourceDeck: 'Колода',
    // Умный скролл (B1) + разделители дней (B2).
    jumpToBottom: 'К последнему',
    newMessages: 'Новые сообщения',
    today: 'Сегодня',
    yesterday: 'Вчера',
  },
  // Composer
  composer: {
    placeholder: 'Спросите о карточках или попросите что-то сделать…',
    send: 'Отправить',
    sending: 'Отправка…',
    // Остановить текущий поток (заменяет «Отправить» во время генерации).
    stop: 'Стоп',
    // Выбор модели (уровня рассуждений) — скрыт, если список не настроен.
    model: 'Модель',
    // Необязательная привязка хода к колоде.
    deckScope: 'В колоде',
    allDecks: 'Все карточки',
    // Секции @-меншен поповера (D1).
    mentionDecks: 'Колоды',
    mentionCards: 'Карточки',
    mentionNoResults: 'Совпадений нет',
    removeMention: 'Убрать упоминание',
    // Тумблер режима дипресёрча (виден, когда сервер предлагает fetch_page).
    research: 'Дипресёрч',
    researchHint: 'Режим глубокого исследования: агент тщательно читает страницы перед ответом и черновиками карточек',
    researchPlaceholder: 'Вставьте ссылку или назовите тему для глубокого изучения…',
    attach: 'Прикрепить файл',
    removeAttachment: 'Убрать вложение',
    attachLimit: 'Не больше 4 вложений в сообщении',
    attachTooBig: 'Файл слишком большой',
    attachUnsupported: 'Неподдерживаемый тип файла',
    attachFailed: 'Не удалось загрузить файл',
  },
  // Шаблоны slash-команд (D2) — `/` в начале черновика открывает меню; выбор
  // вставляет локализованный шаблон ({deck} = самая большая колода).
  slash: {
    quizLabel: 'Квиз',
    quizTemplate: 'Проверь мои знания по «{deck}»: 5 вопросов, по одному, оценивай мои ответы.',
    forecastLabel: 'Прогноз',
    forecastTemplate: 'Какая у меня нагрузка повторений на ближайшие 2 недели?',
    statsLabel: 'Статистика',
    statsTemplate: 'Как я занимался последние 30 дней? Что стоит улучшить?',
    reviewLabel: 'Повторение',
    reviewTemplate: 'Что мне сегодня повторить в «{deck}» и почему?',
    researchLabel: 'Рисёрч',
    researchTemplate: 'Глубоко изучи эту страницу и нарежь её на атомарные карточки: ',
  },
  // Подсказки первых вопросов — пилюли на пустом экране НОВОЙ беседы, собираются
  // на клиенте из зеркала store (имена колод / due-счётчики). Клик = отправить.
  suggested: {
    dueToday: 'Что мне сегодня повторить?',
    deckProgress: 'Как мои успехи в колоде {name}?',
    failing: 'Что я чаще всего заваливаю?',
    quiz: 'Проверь мои знания по «{name}»',
  },
  // Setup notice (chatEnabled === false)
  setup: {
    title: 'Чат ещё не настроен.',
    body:
      'Для чата нужна OpenAI-совместимая модель. Задайте CHAT_API_KEY (и при необходимости CHAT_BASE_URL / CHAT_MODEL) в окружении сервера и перезапустите API.',
    indexNote:
      'Эмбеддинги (для поиска) настраиваются отдельно через OPENAI_API_KEY — оставьте обе переменные пустыми, чтобы выключить ИИ-функции.',
    docsHint: 'Полный список переменных — в разделе AI / RAG README проекта.',
  },
  // Streamed reasoning trace (collapsible, ephemeral — never persisted)
  reasoning: {
    label: 'Размышления',
    show: 'Показать размышления',
    hide: 'Скрыть размышления',
  },
  // Действия над сообщением ассистента (копировать текст, сгенерировать заново).
  message: {
    copy: 'Копировать',
    copied: 'Скопировано',
    regenerate: 'Сгенерировать заново',
    openCard: 'Открыть карточку',
    // Восстановление на «висящем» ходе пользователя без ответа (стоп/обрыв).
    stoppedRetry: 'Остановлено — сгенерировать заново?',
    // Редактирование последнего сообщения пользователя и перезапуск (AC4.1).
    edit: 'Изменить',
    editSave: 'Сохранить и перезапустить',
    editCancel: 'Отменить правку',
    // Кнопки копирования код-блоков (B3) + бейдж модель · токены (B6) + очередь (D4).
    codeCopy: 'Копировать код',
    codeCopied: 'Скопировано',
    tokens: '{count} ток',
    queued: 'В очереди',
    queuedCancel: 'Отменить отложенное сообщение',
  },
  // Agentic tool calls (search_cards / web_search) surfaced as cards in the stream
  tool: {
    search_cards: 'Поиск по вашим карточкам',
    web_search: 'Поиск в интернете',
    card_progress: 'Проверка прогресса карточки',
    study_stats: 'Проверка статистики занятий',
    due_forecast: 'Прогноз предстоящей нагрузки',
    list_decks: 'Список ваших колод',
    browse_cards: 'Просмотр ваших карточек',
    get_card: 'Открыта карточка',
    fetch_page: 'Прочитана страница',
    // Лейблы write/SRS-тулов (B5) — `{front}` = фронт карточки, `{deck}` =
    // имя колоды; никогда не UUID.
    create_card: 'Черновик карточки для «{deck}»',
    create_card_nodeck: 'Черновик карточки',
    create_card_batch: 'Черновики карточек ({count}) для «{deck}»',
    create_card_batch_nodeck: 'Черновики карточек ({count})',
    edit_card: 'Правка «{front}»',
    suspend: 'Приостановлена «{front}»',
    set_due: 'Перенесена «{front}»',
    forget: 'Сброшена «{front}»',
    // Множественные формы для серии одинаковых вызовов подряд (свёртка AC2.2).
    get_card_n: 'Просмотрено карточек: {count}',
    card_progress_n: 'Проверен прогресс карточек: {count}',
    browse_cards_n: 'Просмотров карточек: {count}',
    due_forecast_n: 'Прогноз нагрузки запрошен {count} раз(а)',
    fetch_page_n: 'Прочитано страниц: {count}',
    running: 'Выполняется…',
    done: 'Готово',
    failed: 'Ошибка',
    awaiting: 'Ждёт подтверждения',
    resultToggle: 'Показать результат',
  },
  // Свёрнутая группа активности (редизайн в стиле Codex) — таймированный,
  // сворачиваемый блок работы вокруг хода ассистента (размышления + шаги).
  activity: {
    worked: 'Заняло {time}',
    working: 'Работаю…',
    workedSub: '<1 с',
    workedSeconds: '{count} с',
    workedMinutes: '{m} мин {s} с',
    workedHours: '{h} ч {m} мин',
    steps: 'шагов: {count}',
    step: 'шаг: {count}',
    appliedCreated: 'Создано карточек: {count} — в {deck} · открыть',
    appliedCreatedNodeck: 'Создано карточек: {count} · открыть',
    appliedCreatedOne: 'Карточка создана в {deck} · открыть',
    appliedCreatedOneNodeck: 'Карточка создана · открыть',
    appliedEdited: 'Карточка обновлена · открыть',
  },
  // Confirm-before-write controls (Phase B) — a write/SRS tool pauses the turn
  // and asks for explicit human approval, rendered inside the pending tool card.
  confirm: {
    pendingTitle: 'Ожидает вашего подтверждения',
    apply: 'Применить',
    reject: 'Отклонить',
    applied: 'Применено',
    rejected: 'Отклонено',
    // Blast-radius summary shown above Apply so destructive writes are deliberate.
    willCreate: 'Будет создано карточек: {count}',
    willDelete: 'Будет УДАЛЕНО карточек: {count} — история FSRS потеряна',
    affectsSiblings: 'Затрагивает другие карточки этой заметки',
    // Превью подтверждения (B4/C8): строки до/после + предлагаемое содержимое.
    changes: 'Предлагаемые изменения',
    proposed: 'Содержимое новой карточки',
    // Заголовок секции карточки в батч-превью create_card.
    cardN: 'Карточка {n}',
    // Пер-карточный confirm-редактор: включить/убрать + правки инлайн + заметка агенту.
    applyN: 'Применить ({count})',
    excludeCard: 'Убрать',
    includeCard: 'Вернуть',
    feedbackPlaceholder: 'Заметка агенту — что поправить (необязательно)…',
    // Пошаговый confirm-визард (батч): по одной карточке за раз.
    cardOf: 'Карточка {n} из {total}',
    acceptCard: 'Принять',
    back: 'Назад',
    acceptedBadge: 'Принята',
    excludedBadge: 'Убрана',
    reviewJump: 'Открыть карточку ещё раз',
  },
  // Errors surfaced in the stream
  errors: {
    generic: 'Что-то пошло не так. Попробуйте ещё раз.',
    disabled: 'Чат отключён на сервере.',
    turnInProgress: 'В этой беседе уже идёт ответ — дождитесь завершения.',
  },
};

export default m;
