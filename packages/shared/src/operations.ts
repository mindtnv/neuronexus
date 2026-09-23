export const OPERATION_GROUPS = ['active', 'attention', 'recent'] as const;
export type OperationGroup = typeof OPERATION_GROUPS[number];
export type OperationKind = 'source' | 'artifact';
export type OperationPhase = 'queued' | 'parsing' | 'search_preparing' | 'search_unavailable' | 'generating' | 'ready' | 'failed';
export type OperationDestination = { kind: 'source'; id: string }
  | { kind: 'source-artifact'; id: string; sourceId: string | null }
  | { kind: 'notebook-artifact'; id: string; notebookId: string };
export interface OperationItem {
  id: string;
  kind: OperationKind;
  runId: string;
  title: string;
  artifactType: string | null;
  phase: OperationPhase;
  canRead: boolean;
  canSearch: boolean;
  progress: { completed: number; total: number } | null;
  startedAt: string | null;
  finishedAt: string | null;
  retry: { allowed: boolean; reason: 'ai_unavailable' | 'source_unavailable' | 'not_failed' | null; needsDefaults: boolean };
  destination: OperationDestination;
}
export interface OperationPage { items: OperationItem[]; total: number; nextCursor: string | null }
export type OperationsFeed = Record<OperationGroup, OperationPage> & { serverTime: string };
export interface OperationRetryInput {
  kind: OperationKind;
  id: string;
  runId: string;
  requestId: string;
  acceptDefaults?: boolean;
}
export interface OperationRetryResult { id: string; kind: OperationKind; runId: string; replayed: boolean; stale: boolean }
