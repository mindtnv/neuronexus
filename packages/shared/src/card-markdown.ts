import type MarkdownIt from 'markdown-it';
import { parseClozeAt, renderClozeSource } from './cloze';
import { CARD_MEDIA_TOKEN_RE } from './note-content';

/** Same image surface as the render sink, so rejected images cannot count as questions. */
export function cardMediaPlugin(md: InstanceType<typeof MarkdownIt>): void {
  const image = md.renderer.rules.image!;
  md.renderer.rules.image = (tokens, index, options, env, renderer) => {
    if (!CARD_MEDIA_TOKEN_RE.test(String(tokens[index].attrGet('src') ?? ''))) return '';
    return image(tokens, index, options, env, renderer);
  };
}

export interface CardMarkdownEnvironment {
  renderMath?: (source: string, display: boolean) => string;
  cloze?: { side: 'front' | 'back'; number: number; legacy?: boolean };
  onClozeNumber?: (number: number) => void;
  clozeDepth?: number;
}

function mathContent(source: string, env: CardMarkdownEnvironment): string {
  return env.cloze ? renderClozeSource(source, env.cloze.side === 'front' ? 'prompt' : 'answer', env.cloze.number,
    env.onClozeNumber, true, env.cloze.legacy, env.clozeDepth ?? 0) : source;
}

/** Cloze parsing belongs inside Markdown, where code/links remain opaque. */
export function cardClozePlugin(md: InstanceType<typeof MarkdownIt>): void {
  md.inline.ruler.before('escape', 'nn_cloze', (state, silent) => {
    const env = state.env as CardMarkdownEnvironment;
    if (!env.cloze || !state.src.startsWith('{{c', state.pos)) return false;
    const node = parseClozeAt(state.src, state.pos, env.clozeDepth ?? 0, env.cloze.legacy);
    if (!node) return false;
    if (!silent) {
      const token = state.push('nn_cloze', '', 0);
      token.meta = { cloze: node };
    }
    state.pos = node.end;
    return true;
  });
  md.renderer.rules.nn_cloze = (tokens, index, _options, environment) => {
    const env = environment as CardMarkdownEnvironment;
    const node = tokens[index].meta?.cloze as NonNullable<ReturnType<typeof parseClozeAt>>;
    env.onClozeNumber?.(node.number);
    const hidden = env.cloze?.side === 'front' && (env.cloze.number === 0 || env.cloze.number === node.number);
    const text = hidden ? `[${node.hint?.trim() || '…'}]` : node.answer;
    return `<span>${md.renderInline(text, { ...env, clozeDepth: (env.clozeDepth ?? 0) + 1 })}</span>`;
  };
}

/** Parse math as inline syntax so Markdown's code and link rules stay in charge.
 * Code spans/fences consume their source before this rule can see its contents.
 * The supplied linear-time grammar also bounds unterminated delimiter scans.
 */
export function cardMathPlugin(md: InstanceType<typeof MarkdownIt>, grammar: RegExp): void {
  const atStart = new RegExp(`^(?:${grammar.source})`);
  // html:false makes raw tags literal. Keep their attribute examples literal
  // too; URLs/autolinks are excluded by requiring a tag-name boundary.
  md.inline.ruler.before('escape', 'nn_literal_tag', (state, silent) => {
    if (state.src[state.pos] !== '<') return false;
    const match = /^<\/?[a-z][a-z\d-]*(?=[\s/>])[^<>]*>/i.exec(state.src.slice(state.pos));
    if (!match) return false;
    if (!silent) state.push('text', '', 0).content = match[0];
    state.pos += match[0].length;
    return true;
  });
  md.inline.ruler.before('escape', 'nn_math', (state, silent) => {
    if (state.src[state.pos] !== '\\') return false;
    const next = state.src[state.pos + 1];
    if (next !== '(' && next !== '[') return false;
    const match = atStart.exec(state.src.slice(state.pos));
    if (!match || (match[1] === undefined && match[2] === undefined)) return false;
    if (!silent) {
      const display = match[1] !== undefined;
      const source = match[1] ?? match[2] ?? '';
      const env = state.env as CardMarkdownEnvironment;
      const content = mathContent(source, env);
      const token = state.push('nn_math', '', 0);
      token.content = env.renderMath?.(content, display) ?? content;
    }
    state.pos += match[0].length;
    return true;
  });
  md.renderer.rules.nn_math = (tokens, index) => md.utils.escapeHtml(tokens[index].content);
  // A display formula can span blank lines; paragraph splitting must not turn
  // it into several unrelated fields of text. Indented code still wins.
  md.block.ruler.before('fence', 'nn_math_block', (state, startLine, endLine, silent) => {
    if (state.sCount[startLine] - state.blkIndent >= 4) return false;
    const start = state.bMarks[startLine] + state.tShift[startLine];
    if (!state.src.startsWith('\\[', start)) return false;
    const match = atStart.exec(state.src.slice(start));
    if (!match || match[1] === undefined) return false;
    const end = start + match[0].length;
    let last = startLine;
    while (last + 1 < endLine && state.bMarks[last + 1] < end) last++;
    if (end > state.eMarks[last] || state.src.slice(end, state.eMarks[last]).trim()) return false;
    if (silent) return true;
    const token = state.push('nn_math_block', '', 0);
    token.content = match[1];
    token.map = [startLine, last + 1];
    state.line = last + 1;
    return true;
  });
  md.renderer.rules.nn_math_block = (tokens, index, _options, environment) => {
    const source = tokens[index].content;
    const env = environment as CardMarkdownEnvironment;
    const content = mathContent(source, env);
    return md.utils.escapeHtml(env.renderMath?.(content, true) ?? content);
  };
}
