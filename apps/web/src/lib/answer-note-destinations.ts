import type { MessageVM } from './chat-activity';
export interface AnswerNoteDestination { kind: 'source' | 'notebook'; id: string; label: string }
/** The saved answer's own turn determines its destinations; later pins and
 * navigation are deliberately not inputs. Passage refs deduplicate by source. */
export function answerNoteDestinations(messages: Pick<MessageVM, 'role' | 'context'>[], index: number): AnswerNoteDestination[] {
  const context = messages[index]?.context ?? messages.slice(0, index).findLast(message => message.role === 'user')?.context;
  const result = new Map<string, AnswerNoteDestination>();
  for (const object of context?.refs ?? []) {
    if (!object.available) continue;
    const { kind, id } = object.ref;
    if (kind !== 'notebook' && kind !== 'source' && kind !== 'source_passage') continue;
    const destination = { kind: kind === 'notebook' ? 'notebook' as const : 'source' as const, id, label: object.label };
    result.set(`${destination.kind}:${id}`, destination);
  }
  return [...result.values()];
}
