/** Parsed content does not depend on successful embedding. Parser failures and
 * in-progress parsing must not turn old chunks into current source evidence. */
export function isSourceTextReadable(status: string, errorCode?: string | null): boolean {
  return status === 'ready' || status === 'indexing' || status === 'error' && errorCode === 'index_failed';
}
