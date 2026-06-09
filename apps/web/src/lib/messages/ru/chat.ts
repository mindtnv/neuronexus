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
  },
  // Composer
  composer: {
    placeholder: 'Задайте вопрос о ваших карточках…',
    send: 'Отправить',
    sending: 'Отправка…',
    // Остановить текущий поток (заменяет «Отправить» во время генерации).
    stop: 'Стоп',
    // Выбор модели (уровня рассуждений) — скрыт, если список не настроен.
    model: 'Модель',
    // Необязательная привязка хода к колоде.
    deckScope: 'В колоде',
    allDecks: 'Все карточки',
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
  },
  // Agentic tool calls (search_cards / web_search) surfaced as cards in the stream
  tool: {
    search_cards: 'Поиск по вашим карточкам',
    web_search: 'Поиск в интернете',
    card_progress: 'Проверка прогресса карточки',
    study_stats: 'Проверка статистики занятий',
    list_decks: 'Список ваших колод',
    browse_cards: 'Просмотр ваших карточек',
    get_card: 'Открыта карточка',
    // Множественные формы для серии одинаковых вызовов подряд (свёртка AC2.2).
    get_card_n: 'Просмотрено карточек: {count}',
    card_progress_n: 'Проверен прогресс карточек: {count}',
    browse_cards_n: 'Просмотров карточек: {count}',
    running: 'Выполняется…',
    done: 'Готово',
    failed: 'Ошибка',
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
    appliedCreated: 'Создано {count} карточек в {deck} · открыть',
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
  },
  // Errors surfaced in the stream
  errors: {
    generic: 'Что-то пошло не так. Попробуйте ещё раз.',
    disabled: 'Чат отключён на сервере.',
  },
};

export default m;
