# Lossless Card Pagination Specification

## Purpose

Provide deterministic, lossless traversal of a user's cards even when multiple records share the same creation timestamp.

## Requirements

### Requirement: Card pages have a stable total order
`GET /cards` SHALL order the default card stream by creation timestamp descending and card identifier descending.

#### Scenario: Cards share a creation timestamp
- **WHEN** two or more matching cards have the same creation timestamp
- **THEN** their identifiers determine a stable relative order

### Requirement: Composite cursors resume after one exact row
When `GET /cards` returns a next cursor, that cursor SHALL identify both the creation timestamp and identifier of the last returned card, and using it SHALL resume strictly after that card in the same order.

#### Scenario: Equal-timestamp rows cross a page boundary
- **WHEN** a full page ends in the middle of a group of cards with the same creation timestamp
- **THEN** subsequent pages return every remaining card exactly once without skips or duplicates

#### Scenario: Final page is shorter than the limit
- **WHEN** fewer matching cards remain than the requested page limit
- **THEN** the response returns those cards and a null next cursor

### Requirement: Legacy timestamp cursors remain accepted
`GET /cards` SHALL continue to accept timestamp-only cursors produced by earlier versions and SHALL treat them as a request for rows with an older creation timestamp.

#### Scenario: Existing client sends a legacy cursor
- **WHEN** the cursor contains a valid ISO creation timestamp without an identifier
- **THEN** the endpoint returns only matching cards created before that timestamp
