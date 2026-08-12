/**
 * pdf.js cleanup differs across the vendored/native-ESM and package builds.
 * Treat both the loading task and resolved document as runtime capabilities so
 * leaving the reader can never throw when one build omits `destroy()`.
 */
export async function destroyPdfResources(
  loadingTask: unknown,
  document: unknown,
): Promise<void> {
  for (const candidate of [loadingTask, document]) {
    if (!candidate || typeof candidate !== 'object') continue;
    const destroy = Reflect.get(candidate, 'destroy');
    if (typeof destroy !== 'function') continue;
    try {
      await Promise.resolve(destroy.call(candidate));
      return;
    } catch {
      // A partially initialized loading task can reject cleanup. The resolved
      // document remains a safe fallback when it is available.
    }
  }
}
