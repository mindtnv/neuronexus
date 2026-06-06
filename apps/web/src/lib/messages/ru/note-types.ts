const m = {
  pageTitle: 'Типы заметок',
  pageSubtitle: 'Создавайте свои типы карточек — поля, шаблоны и оформление.',
  // List
  list: {
    title: 'Ваши типы заметок',
    builtin: 'встроенный',
    custom: 'свой',
    empty: 'Пока нет типов заметок.',
    fieldsCount: 'полей: {n}',
    templatesCount: 'шаблонов: {n}',
    edit: 'Изменить',
    clone: 'Скопировать и изменить',
    delete: 'Удалить',
    newType: 'Новый тип',
  },
  // Editor
  editor: {
    newTitle: 'Новый тип заметки',
    editTitle: 'Редактирование «{name}»',
    cloneTitle: 'Редактирование встроенного «{name}» (будет сохранена копия)',
    nameLabel: 'Название',
    namePlaceholder: 'напр. Словарь',
    cloneNotice:
      'Это встроенный тип заметки. При сохранении создаётся ваша редактируемая копия — встроенный тип не меняется.',
    back: 'К списку',
  },
  // Fields editor
  fields: {
    title: 'Поля',
    hint: 'Именованные ячейки, которые заполняет заметка. Первое поле обязательно.',
    addField: 'Добавить поле',
    namePlaceholder: 'Название поля',
    moveUp: 'Вверх',
    moveDown: 'Вниз',
    remove: 'Удалить поле',
    duplicate: 'Названия полей должны быть уникальными.',
    atLeastOne: 'Нужно хотя бы одно поле.',
  },
  // Templates editor
  templates: {
    title: 'Шаблоны карточек',
    hint: 'Каждый шаблон создаёт одну карточку. Вставьте поле через {syntax}.',
    addTemplate: 'Добавить шаблон',
    namePlaceholder: 'Название шаблона',
    frontLabel: 'Лицо',
    backLabel: 'Оборот',
    remove: 'Удалить шаблон',
    atLeastOne: 'Нужен хотя бы один шаблон.',
    availableFields: 'Доступные поля',
    insert: 'Вставить',
    syntaxHint:
      'Поле вставляется через {field}. Показать блок только при заполненном поле — {cond}…{condEnd}; инвертировать — {inv}…{condEnd}.',
  },
  // Styling
  styling: {
    title: 'Оформление (CSS)',
    hint: 'Необязательный CSS для карточек этого типа заметки.',
    placeholder: '.card { font-size: 18px; }',
  },
  // Preview
  preview: {
    title: 'Предпросмотр',
    hint: 'Заполнено примерными значениями для каждого поля.',
    sampleLabel: 'Примерные значения',
    front: 'Лицо',
    back: 'Оборот',
    noCard: 'Карточка не создаётся (лицо пустое).',
    template: 'Шаблон',
  },
  // Actions
  actions: {
    save: 'Сохранить тип заметки',
    saveCopy: 'Сохранить как копию',
    saving: 'Сохранение…',
    cancel: 'Отмена',
  },
  // Errors
  errors: {
    nameRequired: 'Укажите название типа заметки.',
    noFields: 'Добавьте хотя бы одно поле.',
    noTemplates: 'Добавьте хотя бы один шаблон.',
    duplicateFields: 'Названия полей должны быть уникальными.',
    duplicateTemplates: 'Названия шаблонов должны быть уникальными.',
    saveFailed: 'Не удалось сохранить тип заметки.',
    deleteFailed: 'Не удалось удалить тип заметки.',
  },
  // Delete confirmation
  deleteConfirm:
    'Удалить «{name}»? Будут также удалены все заметки и карточки этого типа. Это действие необратимо.',
};
export default m;
