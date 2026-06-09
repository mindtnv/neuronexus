// Chat model allow-list parser (AC2.1). Pure TS — shared between apps/api (env
// parsing + server-side validation) and apps/web (the picker reads the parsed
// shape via GET /ai/status). No DOM/Node deps.
//
// The env `CHAT_MODELS` is a CSV where each entry is `model` or `model|label`;
// the FIRST entry is the default. The provider's gateway encodes the reasoning
// level in the model name (e.g. `gpt-5.5high`), so the env author owns the
// id→label mapping — no hardcoded provider convention here (provider-agnostic).

import type { ChatModelOption } from './kb-chunk.ts';

/**
 * Parse the CSV `CHAT_MODELS` env into the allow-list. Each entry is `model` or
 * `model|label`; the first entry is the default. Trims whitespace, drops blank
 * entries, de-dups by id (first occurrence wins). Empty/undefined → `[]`.
 */
export function parseChatModels(raw: string | undefined): ChatModelOption[] {
  if (!raw || !raw.trim()) return [];
  const seen = new Set<string>();
  const out: ChatModelOption[] = [];
  for (const entry of raw.split(',')) {
    const [idPart, labelPart] = entry.split('|');
    const id = (idPart ?? '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const label = (labelPart ?? '').trim() || id;
    out.push({ id, label, default: out.length === 0 });
  }
  return out;
}

/**
 * Is `model` in the allow-list? Used by the server to validate a client-supplied
 * model (unknown → 400 `invalid_model`). An EMPTY allow-list means "no selector
 * configured" — the caller decides whether absence is allowed (it is, today).
 */
export function isAllowedModel(models: ChatModelOption[], model: string): boolean {
  return models.some((m) => m.id === model);
}
