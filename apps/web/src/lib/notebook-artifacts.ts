// Pure helpers for the «Блокноты 2.0» N2 studio artifact viewer. DOM-free so
// they unit-test under `bun test` (the repo has no component-render harness).
//
// An artifact's `content_md` carries `[src:<chunkId>]` grounding tokens (the
// server has already intersected them against the sampled context, Р5). The
// viewer renders the prose WITHOUT the raw tokens and shows a numbered,
// clickable footnote row instead — these helpers do the token bookkeeping.

import { SRC_TOKEN_RE } from '@neuronexus/shared';

export interface ArtifactFootnote {
  n: number;
  chunkId: string;
}

/**
 * Split artifact markdown into (token-stripped) prose + a numbered footnote list
 * of the distinct `[src:<chunkId>]` ids in order of first appearance. Each
 * surviving token is replaced inline by a superscript «[n]» marker so the reader
 * sees where each citation lands; the clickable chips live in the footnote row.
 */
export function parseArtifactCitations(content: string): {
  prose: string;
  footnotes: ArtifactFootnote[];
} {
  const order: string[] = [];
  const indexOf = new Map<string, number>();
  const re = new RegExp(SRC_TOKEN_RE);
  const prose = content.replace(re, (_whole, id: string) => {
    let n = indexOf.get(id);
    if (n === undefined) {
      n = order.length + 1;
      indexOf.set(id, n);
      order.push(id);
    }
    return ` <sup>[${n}]</sup>`;
  });
  return {
    prose,
    footnotes: order.map((chunkId, i) => ({ n: i + 1, chunkId })),
  };
}

/** Strip `[src:]` tokens entirely + collapse leftover runs of spaces (for «copy»). */
export function stripSrcTokens(content: string): string {
  return content.replace(new RegExp(SRC_TOKEN_RE), '').replace(/[ \t]{2,}/g, ' ').trim();
}
