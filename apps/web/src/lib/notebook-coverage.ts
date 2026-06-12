// Pure helper for the «Блокноты 2.0» N3 coverage block (Р9). DOM-free unit-test
// target: the «карточки по этому разделу» chat-prefill prompt built from a gap
// row. The coverage block itself is SQL-only (no AI) and renders without a chat
// key — only the prefill buttons are gated by chatEnabled.

import type { NotebookCoverageGap } from './types';

/**
 * Build the chat-prefill prompt for a coverage gap (Р9): «Сделай карточки по
 * разделу "<heading>" источника "<sourceTitle>"». A NULL heading (unstructured
 * text bucket) falls back to a localized «без заголовка» label so the prompt is
 * still actionable. `template` carries `{heading}` + `{source}` placeholders.
 */
export function buildGapPrompt(
  gap: NotebookCoverageGap,
  opts: { template: string; noHeadingLabel: string },
): string {
  const heading = (gap.heading ?? '').trim() || opts.noHeadingLabel;
  const source = (gap.sourceTitle ?? '').trim();
  return opts.template
    .replace('{heading}', heading)
    .replace('{source}', source);
}
