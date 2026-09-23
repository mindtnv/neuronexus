export interface UiActionEnvelope { requestId: string; sessionId: string }
export type UiActionKind = 'study-note-create' | 'study-note-edit' | 'study-note-pin' | 'source-metadata'
  | 'notebook-title' | 'deck-metadata' | 'deck-move' | 'card-note-save' | 'note-type-save';
export interface UiActionTarget {
  kind: 'study-note' | 'source' | 'notebook' | 'deck' | 'deck-tree' | 'card-note' | 'note-type';
  id: string;
  revision: string;
}
export type UiActionInverse = { kind: 'source' | 'notebook' | 'deck' | 'study-note'; patch: Record<string, unknown> }
  | { kind: 'deck-tree'; rows: Array<{ id: string; parentId: string | null; position: number }>;
    order: Array<{ parentId: string | null; ids: string[] }> };
export interface UiActionReceipt {
  id: string;
  requestId: string;
  kind: UiActionKind;
  target: UiActionTarget;
  label: string;
  createdAt: string;
  undoUntil: string | null;
  consumedAt: string | null;
}
export interface UiActionResult<T = unknown> {
  receipt: UiActionReceipt;
  result: T | null;
  outcome: 'applied' | 'changed' | 'unavailable' | 'undone';
  replayed: boolean;
  serverTime: string;
}
export interface UiActionOffers { items: UiActionReceipt[]; nextCursor: string | null; serverTime: string }
