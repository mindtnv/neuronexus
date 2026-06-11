// NotebookLM M1 — экран библиотеки /notebooks (T8). Полный паритет ключей с
// en/notebooks.ts (проверяется i18n-parity.test.ts). `status.*` сопоставляет
// машинный errorCode (INGEST_ERROR_CODES из @neuronexus/shared) с текстом.

const notebooks = {
  title: 'Блокноты',
  subtitle: 'Библиотеки источников для заземлённого обучения.',

  setup: {
    title: 'Блокноты ещё не настроены.',
    body:
      'Блокноты индексируют источники с помощью эмбеддингов. Задайте OPENAI_API_KEY (и оставьте INDEXING_ENABLED включённым) в окружении сервера и перезапустите API.',
    docsHint: 'Полный список переменных — в разделе AI / RAG README проекта.',
  },

  list: {
    heading: 'Ваши блокноты',
    empty: 'Пока нет блокнотов. Создайте, чтобы добавить источники.',
    create: 'Новый блокнот',
    createTitle: 'Новый блокнот',
    createLabel: 'Название',
    createPlaceholder: 'напр. Машинное обучение',
    rename: 'Переименовать блокнот',
    renameTitle: 'Переименовать блокнот',
    delete: 'Удалить блокнот',
    deleteConfirm: 'Удалить этот блокнот? Его источники будут удалены безвозвратно.',
    sourceCount: 'Источников: {count}',
    tooMany: 'Достигнут лимит блокнотов.',
  },

  sources: {
    heading: 'Источники',
    empty: 'Пока нет источников. Добавьте PDF, EPUB, веб-страницу или текст.',
    add: 'Добавить источник',
    addTitle: 'Добавить источник',
    rename: 'Переименовать источник',
    renameTitle: 'Переименовать источник',
    renameLabel: 'Название',
    delete: 'Удалить источник',
    deleteConfirm: 'Удалить этот источник? Его индекс будет удалён.',
    tooMany: 'Достигнут лимит источников для этого блокнота.',
    progress: '{indexed} / {total} проиндексировано',
    back: 'К блокнотам',
  },

  add: {
    kindFile: 'Загрузка (PDF / EPUB)',
    kindUrl: 'Веб-страница',
    kindText: 'Вставить текст',
    fileLabel: 'Выберите файл',
    filePlaceholder: 'Файл не выбран',
    fileHint: 'PDF или EPUB, до {mb} МБ.',
    urlLabel: 'URL',
    urlPlaceholder: 'https://…',
    titleLabel: 'Название',
    titlePlaceholder: 'Название источника',
    textLabel: 'Текст',
    textPlaceholder: 'Вставьте текст для индексации…',
    submit: 'Добавить',
    uploading: 'Загрузка…',
    failed: 'Не удалось добавить источник. Попробуйте ещё раз.',
  },

  // Трёхпанельный workspace (M2): источники │ читалка │ чат.
  workspace: {
    tabSources: 'Источники',
    tabReader: 'Чтение',
    tabChat: 'Чат',
    inChat: 'В чате',
    cardsButton: 'Карточки',
    cardsCount: '{count} карточек',
    cardsLoading: 'Загрузка…',
    cardsEmpty: 'Из этого источника пока нет карточек.',
    // W5(a) — сворачиваемая колонка чата.
    chatCollapse: 'Свернуть чат',
    chatExpand: 'Развернуть чат',
  },

  // Центральная читалка (M2 текст + M4 PDF) — содержимое активного источника.
  reader: {
    empty: 'Выберите источник, чтобы прочитать его здесь.',
    notReady: 'Этот источник ещё индексируется.',
    noText: 'В этом источнике нет читаемого текста.',
    page: 'стр. {n}',
    chunkCount: 'разделов: {count}',
    loadMore: 'Загрузить ещё',
    loading: 'Загрузка…',
    // M4 PDF-читалка: загрузка / ошибка.
    loadingBytes: '{loaded} / {total} КБ',
    loadError: 'Не удалось открыть этот PDF.',
    openText: 'Открыть текстовый вид',
    // Переключатель режима.
    modePdf: 'PDF',
    modeText: 'Текст',
    // Тулбар (инструменты разметки + зум + переход к странице + статус сохранения).
    toolbar: 'Инструменты читалки',
    toolHand: 'Перемещение / прокрутка',
    toolPen: 'Ручка',
    toolHighlighter: 'Маркер',
    toolEraser: 'Ластик',
    toolSmartCard: 'Умная карточка — выделите область, ИИ предложит карточку',
    fingerDraw: 'Рисовать пальцем',
    undo: 'Отменить',
    redo: 'Повторить',
    width: 'Толщина {n}',
    color_lime: 'Лаймовый',
    color_amber: 'Янтарный',
    color_rose: 'Розовый',
    color_sky: 'Голубой',
    color_violet: 'Фиолетовый',
    color_white: 'Белый',
    zoomIn: 'Приблизить',
    zoomOut: 'Отдалить',
    zoomReset: 'По ширине',
    pageJump: 'Перейти к странице',
    saving: 'Сохранение…',
    saved: 'Сохранено',
    saveError: 'Ошибка сохранения — повторить',
  },

  // Бэклинки карточка → источник (M3) — панель «Источники» на карточке.
  backlinks: {
    title: 'Источники',
    open: 'Открыть в блокноте',
    tombstone: 'Источник удалён',
    untitled: 'Источник',
    page: 'стр. {n}',
  },

  // M5 — выделения (подсветки + заметки) в PDF-читалке.
  marks: {
    panelTitle: 'Разметка',
    panelEmpty: 'Выделите текст в PDF, чтобы добавить подсветку или заметку.',
    panelInkPage: 'стр. {n} — рисунок',
    pageGroup: 'Страница {n}',
    highlight: 'Подсветка',
    note: 'Заметка',
    delete: 'Удалить',
    deleteConfirm: 'Удалить эту метку?',
    notePlaceholder: 'Добавить заметку…',
    noteSave: 'Сохранить',
    copyAction: 'Копировать',
    askAction: 'Спросить',
    cardAction: 'Карточка',
    openCard: 'Открыть карточку',
    export: 'Экспорт в Markdown',
    color_lime: 'Лаймовый',
    color_amber: 'Янтарный',
    color_rose: 'Розовый',
    color_sky: 'Голубой',
    color_violet: 'Фиолетовый',
  },

  // M5 — Быстрая карточка (выделение → флэшкарта).
  quickcard: {
    title: 'Новая карточка',
    deckLabel: 'Колода',
    deckPlaceholder: 'Выберите колоду…',
    frontLabel: 'Лицо',
    frontPlaceholder: 'Вопрос…',
    backLabel: 'Оборот',
    backPlaceholder: 'Ответ…',
    formulateBtn: '✨ Сформулировать',
    formulateHint: 'Сгенерировать с помощью ИИ',
    formulateError: 'Не удалось сгенерировать. Заполните вручную.',
    createBtn: 'Создать карточку',
    creating: 'Создание…',
    createError: 'Не удалось создать карточку. Попробуйте ещё раз.',
    created: 'Карточка создана',
    createdOpen: 'открыть',
    source: 'стр. {n} · {title}',
    noDeck: 'Колода не выбрана',
  },

  status: {
    pending: 'В очереди',
    parsing: 'Разбор…',
    indexing: 'Индексация…',
    ready: 'Готово',
    error: 'Ошибка',
    deleting: 'Удаление…',
    too_large: 'Файл слишком большой.',
    too_many_chunks: 'Источник слишком длинный для индексации.',
    parse_failed: 'Не удалось прочитать этот источник.',
    fetch_failed: 'Не удалось загрузить этот URL.',
    unsupported_mime: 'Неподдерживаемый тип файла.',
    empty_source: 'Не найден читаемый текст.',
  },
};

export default notebooks;
