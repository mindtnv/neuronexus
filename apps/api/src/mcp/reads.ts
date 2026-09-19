import { z } from 'zod';
import type { McpPrincipal } from './tokens.ts';
import { withInternalRead } from './internal-read.ts';
import { McpToolError, type KnowledgeTool, type McpArgs } from './types.ts';

const id = z.uuid();
const short = z.string().max(500);
const limit = z.int().min(1).max(100).default(30);
const offset = z.int().min(0).max(100_000).default(0);
const page = { offset, limit };
type ReadSpec = { name: string; description: string; path: string; fields?: z.ZodRawShape; arrayPage?: boolean };

// Literal allow-list: no caller-controlled route, method, host, cookies or headers.
const READS: ReadSpec[] = [
  { name: 'get_capabilities', description: 'AI capabilities and available model IDs; no credentials or upstream URLs.', path: '/ai/status' },
  { name: 'list_cards', description: 'Page through cards with an opaque nextCursor. Replay it unchanged.', path: '/cards', fields: { deckId: id.optional(), due: z.boolean().optional(), includeSuspended: z.boolean().optional(), limit, cursor: short.optional() } },
  { name: 'list_tags', description: 'List card tags.', path: '/cards/tags', arrayPage: true },
  { name: 'get_review_queue', description: 'Due/new study queue respecting daily limits. Does not grade cards.', path: '/cards/queue', fields: { deckId: id.optional(), newLimit: z.int().min(0).max(50).default(20), reviewLimit: z.int().min(0).max(100).default(30) } },
  { name: 'get_card_sources', description: 'Source citations and provenance for a card.', path: '/cards/:id/sources', fields: { id } },
  { name: 'get_similar_cards', description: 'Similar cards from stored embeddings; works without live embedding calls.', path: '/cards/:id/similar', fields: { id, k: z.int().min(1).max(20).default(8) } },
  { name: 'get_semantic_graph', description: 'Semantic card graph from stored vectors.', path: '/graph/semantic-edges', fields: { limit: z.int().min(1).max(200).default(100), k: z.int().min(1).max(10).default(5) } },
  { name: 'list_note_types', description: 'Available note types, exact field names and card templates for create_card.', path: '/note-types', arrayPage: true },
  { name: 'list_deck_options', description: 'Study scheduling option presets.', path: '/deck-options', arrayPage: true },
  { name: 'list_filtered_decks', description: 'Saved search-based study decks.', path: '/filtered-decks', arrayPage: true },
  { name: 'get_retention', description: 'Retention by interval, optionally within a deck subtree.', path: '/stats/retention', fields: { days: z.int().min(1).max(365).default(30), deckId: id.optional() } },
  { name: 'list_library', description: 'Page sources by newest-added order. Filter by title, tag, kind or reading status. Replay nextCursor unchanged.', path: '/library', fields: { q: z.string().max(200).optional(), tag: z.string().max(50).optional(), kind: z.enum(['pdf', 'epub', 'url', 'text']).optional(), reading: z.enum(['unread', 'reading', 'finished']).optional(), limit, cursor: short.optional() } },
  { name: 'search_library', description: 'Semantic search over all your sources. Requires configured embeddings.', path: '/library/search', fields: { q: z.string().min(1).max(500), limit: z.int().min(1).max(20).default(10) } },
  { name: 'get_library_item', description: 'Source metadata, reading state, attached notebooks and indexing status.', path: '/library/items/:id', fields: { id } },
  { name: 'read_source_chunks', description: 'Read source text sequentially; continue using nextFrom. No AI needed.', path: '/sources/:id/chunks', fields: { id, from: z.int().min(0).default(0), limit: z.int().min(1).max(20).default(5) } },
  { name: 'get_source_cards', description: 'Cards linked to a source.', path: '/sources/:id/cards', fields: { id }, arrayPage: true },
  { name: 'get_source_marks', description: 'Highlights, bookmarks and margin notes in a source.', path: '/sources/:id/marks', fields: { id }, arrayPage: true },
  { name: 'get_source_annotations', description: 'Page through PDF ink/annotation data.', path: '/sources/:id/annotations', fields: { id }, arrayPage: true },
  { name: 'list_notebooks', description: 'Notebooks with counts and metadata; archived defaults to false.', path: '/notebooks', fields: { archived: z.boolean().default(false) }, arrayPage: true },
  { name: 'get_notebook', description: 'A notebook and its metadata.', path: '/notebooks/:id', fields: { id } },
  { name: 'list_notebook_sources', description: 'Sources attached to a notebook.', path: '/notebooks/:id/sources', fields: { id }, arrayPage: true },
  { name: 'list_notebook_notes', description: 'Written notes and saved answers in a notebook.', path: '/notebooks/:id/notes', fields: { id }, arrayPage: true },
  { name: 'list_artifacts', description: 'Generated summaries, quizzes and other notebook artifacts.', path: '/notebooks/:id/artifacts', fields: { id }, arrayPage: true },
  { name: 'get_artifact', description: 'Read a generated notebook artifact.', path: '/notebooks/:id/artifacts/:artifactId', fields: { id, artifactId: id } },
  { name: 'list_quiz_attempts', description: 'Quiz attempts and outcomes for a notebook artifact.', path: '/notebooks/:id/artifacts/:artifactId/attempts', fields: { id, artifactId: id }, arrayPage: true },
  { name: 'get_notebook_coverage', description: 'Source coverage by cards and the largest uncovered sections.', path: '/notebooks/:id/coverage', fields: { id } },
  { name: 'get_concept_map', description: 'Notebook concept graph from stored vectors.', path: '/notebooks/:id/concept-map', fields: { id } },
];

export function readTools(principal: McpPrincipal, handle: (request: Request) => Promise<Response>): KnowledgeTool[] {
  return READS.map((spec) => ({
    name: spec.name, description: spec.description, readOnly: true,
    schema: z.strictObject({ ...spec.fields, ...(spec.arrayPage ? page : {}) }),
    async execute(_ctx, args: McpArgs) {
      let path = spec.path;
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(args)) {
        if (path.includes(`:${key}`)) path = path.replace(`:${key}`, encodeURIComponent(String(value)));
        else if (value !== undefined && !(spec.arrayPage && (key === 'offset' || key === 'limit'))) query.set(key, String(value));
      }
      const req = new Request(`http://localhost${path}?${query}`);
      const response = await withInternalRead(req, principal.user, () => handle(req));
      if (!response.ok) throw new McpToolError(`read_failed_${response.status}`);
      let data = await response.json();
      if (spec.arrayPage) {
        const rows = Array.isArray(data) ? data : Array.isArray(data.items) ? data.items : null;
        if (rows) {
          const start = Number(args.offset); const end = start + Number(args.limit);
          data = { ...(Array.isArray(data) ? {} : data), items: rows.slice(start, end), total: rows.length, nextOffset: end < rows.length ? end : null };
        }
      }
      return data;
    },
  }));
}
