export const TRACE_STORAGE_KEY = 'nn:trace-context';

export const TRACE_HEADERS = {
  flowId: 'x-client-flow-id',
  scenarioId: 'x-client-scenario-id',
} as const;

type TraceSource = 'web' | 'smoke';

export type TraceContext = {
  flowId: string;
  scenarioId: string | null;
  source: TraceSource;
  startedAt: string;
};

const fallbackId = () =>
  `nn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const nextId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return fallbackId();
};

function parseTraceContext(raw: string | null): TraceContext | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<TraceContext>;
    if (!parsed.flowId || !parsed.startedAt) return null;
    return {
      flowId: parsed.flowId,
      scenarioId: parsed.scenarioId ?? null,
      source: parsed.source === 'smoke' ? 'smoke' : 'web',
      startedAt: parsed.startedAt,
    };
  } catch {
    return null;
  }
}

export function ensureTraceContext(
  patch: Partial<Pick<TraceContext, 'flowId' | 'scenarioId' | 'source'>> = {},
): TraceContext {
  if (typeof window === 'undefined') {
    return {
      flowId: patch.flowId ?? nextId(),
      scenarioId: patch.scenarioId ?? null,
      source: patch.source ?? 'web',
      startedAt: new Date().toISOString(),
    };
  }

  const existing = parseTraceContext(window.localStorage.getItem(TRACE_STORAGE_KEY));
  const next: TraceContext = {
    flowId: patch.flowId ?? existing?.flowId ?? nextId(),
    scenarioId: patch.scenarioId ?? existing?.scenarioId ?? null,
    source: patch.source ?? existing?.source ?? 'web',
    startedAt: existing?.startedAt ?? new Date().toISOString(),
  };
  window.localStorage.setItem(TRACE_STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function logTrace(event: string, fields: Record<string, unknown> = {}) {
  if (typeof window === 'undefined') return;
  const trace = ensureTraceContext();
  console.info(
    '[nn-trace]',
    JSON.stringify({
      event,
      flowId: trace.flowId,
      scenarioId: trace.scenarioId,
      source: trace.source,
      at: new Date().toISOString(),
      ...fields,
    }),
  );
}
