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
  // Errors surfaced in the stream
  errors: {
    generic: 'Что-то пошло не так. Попробуйте ещё раз.',
    disabled: 'Чат отключён на сервере.',
  },
};

export default m;
