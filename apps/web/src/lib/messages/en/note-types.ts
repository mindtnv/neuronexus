const m = {
  pageTitle: 'Note types',
  // List
  list: {
    title: 'Your note types',
    back: 'Back',
    builtin: 'built-in',
    custom: 'custom',
    empty: 'No note types yet.',
    fieldsCount: '{n} fields',
    templatesCount: '{n} templates',
    edit: 'Edit',
    clone: 'Clone to edit',
    delete: 'Delete',
    newType: 'New type',
  },
  // Editor
  editor: {
    newTitle: 'New note type',
    editTitle: 'Editing “{name}”',
    cloneTitle: 'Editing built-in “{name}” (a copy will be saved)',
    nameLabel: 'Name',
    namePlaceholder: 'e.g. Vocabulary',
    cloneNotice:
      'This is a built-in note type. Saving creates an editable copy you own — the built-in stays untouched.',
    back: 'Back to list',
  },
  // Fields editor
  fields: {
    title: 'Fields',
    hint: 'The named blanks a note fills in. The first field is required.',
    addField: 'Add field',
    namePlaceholder: 'Field name',
    moveUp: 'Move up',
    moveDown: 'Move down',
    remove: 'Remove field',
    duplicate: 'Field names must be unique.',
    atLeastOne: 'At least one field is required.',
  },
  // Templates editor
  templates: {
    title: 'Card templates',
    hint: 'Each template generates one card. Use {syntax} to insert a field.',
    addTemplate: 'Add template',
    namePlaceholder: 'Template name',
    frontLabel: 'Front',
    backLabel: 'Back',
    remove: 'Remove template',
    atLeastOne: 'At least one template is required.',
    availableFields: 'Available fields',
    insert: 'Insert',
    syntaxHint:
      'Insert a field with {field}. Show a block only when a field is filled with {cond}…{condEnd}; invert it with {inv}…{condEnd}.',
  },
  // Styling
  styling: {
    title: 'Styling (CSS)',
    hint: 'Optional CSS applied to this note type’s cards.',
    placeholder: '.card { font-size: 18px; }',
  },
  // Preview
  preview: {
    title: 'Live preview',
    hint: 'Filled with sample values for each field.',
    sampleLabel: 'Sample values',
    front: 'Front',
    back: 'Back',
    noCard: 'No card generated (front renders empty).',
    template: 'Template',
  },
  // Actions
  actions: {
    save: 'Save note type',
    saveCopy: 'Save as copy',
    saving: 'Saving…',
    cancel: 'Cancel',
  },
  // Errors
  errors: {
    nameRequired: 'Give the note type a name.',
    noFields: 'Add at least one field.',
    noTemplates: 'Add at least one template.',
    duplicateFields: 'Field names must be unique.',
    duplicateTemplates: 'Template names must be unique.',
    saveFailed: 'Could not save the note type.',
    deleteFailed: 'Could not delete the note type.',
  },
  // Delete confirmation
  deleteConfirm:
    'Delete “{name}”? This also deletes every note and card created with it. This cannot be undone.',
};
export default m;
