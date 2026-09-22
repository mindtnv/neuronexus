import { and, eq, inArray, or } from 'drizzle-orm';
import { sources } from '@neuronexus/db';

export { isSourceTextReadable } from '@neuronexus/shared';
export const sourceTextReadableWhere = () => or(inArray(sources.status, ['ready', 'indexing']),
  and(eq(sources.status, 'error'), eq(sources.errorCode, 'index_failed')))!;
