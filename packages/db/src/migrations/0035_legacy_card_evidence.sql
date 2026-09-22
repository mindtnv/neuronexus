-- Match the shared UTF-16 character budgets without splitting a Unicode scalar.
-- This helper exists only for this migration connection.
CREATE FUNCTION pg_temp.reomi_evidence_excerpt(value text, max_units integer)
RETURNS text LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT COALESCE(string_agg(ch, '' ORDER BY n), '')
  FROM (
    SELECT n, ch, sum(CASE WHEN ascii(ch) > 65535 THEN 2 ELSE 1 END) OVER (ORDER BY n) AS units
    FROM (
      SELECT n, substring(value FROM n FOR 1) AS ch
      FROM generate_series(1, least(char_length(value), max_units)) AS positions(n)
    ) characters
  ) bounded
  WHERE units <= max_units
$$;
--> statement-breakpoint
WITH origins AS (
  SELECT link.id, source.id AS source_id, source.title, source.updated_at,
    chunk.id AS chunk_id, chunk.position, chunk.page, chunk.text AS chunk_text, chunk.source_hash
  FROM card_sources link
  JOIN cards card ON card.id = link.card_id AND card.user_id = link.user_id
  JOIN sources source ON source.id = link.source_id AND source.user_id = link.user_id
  LEFT JOIN source_chunks chunk ON chunk.id = link.source_chunk_id
    AND chunk.source_id = source.id AND chunk.user_id = link.user_id
  WHERE link.source_snapshot IS NULL
)
UPDATE card_sources link
SET source_snapshot = CASE WHEN origin.chunk_id IS NOT NULL THEN
  jsonb_strip_nulls(jsonb_build_object(
    'version', 1, 'kind', 'chunk', 'sourceId', origin.source_id,
    'sourceTitle', pg_temp.reomi_evidence_excerpt(origin.title, 200),
    'chunkId', origin.chunk_id, 'position', origin.position, 'page', origin.page,
    'quote', pg_temp.reomi_evidence_excerpt(origin.chunk_text, 320),
    -- JSON.stringify([text, sourceHash, position, page]) without PostgreSQL's
    -- default spaces between array items. This matches cardEvidenceFingerprint.
    'textHash', encode(sha256(convert_to(
      '[' || to_json(origin.chunk_text)::text || ',' || COALESCE(to_json(origin.source_hash)::text, 'null') || ',' ||
      origin.position::text || ',' || COALESCE(origin.page::text, 'null') || ']', 'UTF8')), 'hex')
  ))
ELSE
  jsonb_build_object(
    'version', 1, 'kind', 'user_quote', 'sourceId', origin.source_id,
    'sourceTitle', pg_temp.reomi_evidence_excerpt(origin.title, 200),
    'sourceVersion', to_char(origin.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'quote', ''
  )
END
FROM origins origin
WHERE link.id = origin.id AND link.source_snapshot IS NULL;
--> statement-breakpoint
DROP FUNCTION pg_temp.reomi_evidence_excerpt(text, integer);
