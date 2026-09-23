/** A bounded, non-overlapping maintenance loop that drains before DB shutdown. */
export function createReceiptMaintenance(run: () => Promise<unknown>, onError: (error: unknown) => void, intervalMs = 3600_000) {
  let stopped = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: Promise<void> | null = null;
  const tick = () => {
    if (stopped || pending) return;
    pending = Promise.resolve().then(run).then(() => {}, onError).finally(() => {
      pending = null;
      if (!stopped) { timer = setTimeout(tick, intervalMs); timer.unref?.(); }
    });
  };
  return {
    start() { stopped = false; tick(); },
    cancel() { stopped = true; clearTimeout(timer); },
    async drain() { stopped = true; clearTimeout(timer); await pending; },
  };
}
