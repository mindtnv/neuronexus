import type { CardTemplate, FieldValues, NoteField, RenderKind } from './note-type';

export const normalizeFieldName = (name: string) => name.trim().normalize('NFC');
export function validFieldNames(fields: readonly NoteField[]): boolean {
  const names = fields.map((field) => normalizeFieldName(field.name));
  return names.length > 0 && names.every((name) => name.length > 0 && name.length <= 128 && !/[{}\u0000-\u001f\u007f]/.test(name) && !/^[#^/]/.test(name)) &&
    new Set(names.map((name) => name.toLowerCase())).size === names.length;
}

export function typedAnswerField(fields: readonly NoteField[]): NoteField | undefined {
  return fields.find((field) => field.typeinAnswer) ?? [...fields].sort((a, b) => b.ord - a.ord)[0];
}

/** Existing JSON needs no destructive backfill: the first edit persists IDs. */
export function identifiedFields(typeId: string, fields: readonly NoteField[], kind?: RenderKind | string): NoteField[] {
  const answer = kind === 'typein' ? typedAnswerField(fields) : undefined;
  return fields.map((field) => ({ ...field, id: field.id ?? `legacy:${typeId}:field:${field.ord}`,
    ...(answer === field ? { typeinAnswer: true } : {}) }));
}

export function identifiedTemplates(typeId: string, templates: readonly CardTemplate[]): CardTemplate[] {
  return templates.map((template) => ({ ...template, id: template.id ?? `legacy:${typeId}:template:${template.ord}` }));
}

export function renameTemplateFields(template: string, renames: ReadonlyMap<string, string>): string {
  return template.replace(/\{\{\s*([#^/]?)\s*([^{}]*?)\s*\}\}/g, (whole, sigil: string, name: string) => {
    const replacement = renames.get(name.trim()) ?? normalizeFieldName(name);
    return `{{${sigil}${replacement}}}`;
  });
}

export function renameFieldValues(values: FieldValues, renames: ReadonlyMap<string, string>): FieldValues | null {
  const entries = Object.entries(values).map(([name, value]) => [renames.get(name) ?? name, value] as const);
  if (new Set(entries.map(([name]) => name)).size !== entries.length) return null;
  return Object.fromEntries(entries);
}
