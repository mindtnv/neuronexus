export interface ReadingProgress { page?: number; chunkPos?: number; percent?: number }
/** One source/account-bound writer. Flushing on exit must never retarget the
 * last page to a newly opened source or a replacement account. */
export function createReadingProgressWriter(sourceId: string, ownerId: string | undefined, currentOwner: () => string | undefined,
  persist: (sourceId: string, state: ReadingProgress) => Promise<unknown>, delayMs = 5000) {
  let pending: ReadingProgress | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    const state = pending; pending = undefined;
    if (state && ownerId && currentOwner() === ownerId) void persist(sourceId, state).catch(() => {});
  };
  return {
    write(state: ReadingProgress) {
      pending = { ...state };
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(flush, delayMs);
    },
    flush,
  };
}
