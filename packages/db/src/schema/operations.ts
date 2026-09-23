import { sql } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uuid, uniqueIndex } from 'drizzle-orm/pg-core';
import { user } from './auth';

/** Retry receipts contain identities only, never source or generated content. */
export const operationRetryReceipts = pgTable('operation_retry_receipts', {
  id: uuid('id').primaryKey().default(sql`uuidv7()`),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  requestId: uuid('request_id').notNull(),
  kind: text('kind').notNull().$type<'source' | 'artifact'>(),
  entityId: uuid('entity_id').notNull(),
  observedRunId: uuid('observed_run_id').notNull(),
  resultRunId: uuid('result_run_id').notNull(),
  requestHash: text('request_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [uniqueIndex('operation_retry_owner_request_idx').on(t.userId, t.requestId),
  index('operation_retry_created_idx').on(t.createdAt)]);
