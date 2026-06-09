const m = {
  // Thread list (left rail)
  threads: {
    title: 'Беседы',
    newThread: 'Новый чат',
    empty: 'Бесед пока нет.',
    untitled: 'Новая беседа',
    delete: 'Удалить беседу',
    deleteConfirm: 'Удалить эту беседу? Её сообщения исчезнут безвозвратно.',
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
  // Agentic tool calls (search_cards / web_search) surfaced as cards in the stream
  tool: {
    search_cards: 'Поиск по вашим карточкам',
    web_search: 'Поиск в интернете',
    running: 'Выполняется…',
    done: 'Готово',
    failed: 'Ошибка',
    resultToggle: 'Показать результат',
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
