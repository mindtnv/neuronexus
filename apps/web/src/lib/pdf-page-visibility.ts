/** Separate viewport state from the overscan used to keep nearby PDF canvases
 * ready. IntersectionObserver callbacks contain changed entries, not a complete
 * visibility snapshot. */
export class PdfPageVisibility {
  private nearby = new Set<number>();
  private areas = new Map<number, number>();
  constructor(private readonly total: number) {}
  private valid(page: number) { return Number.isInteger(page) && page >= 1 && page <= this.total; }

  updateNearby(entries: { page: number; visible: boolean }[]): Set<number> {
    for (const entry of entries) {
      if (!this.valid(entry.page)) continue;
      if (entry.visible) this.nearby.add(entry.page); else this.nearby.delete(entry.page);
    }
    const rendered = new Set<number>();
    for (const page of this.nearby) for (let offset = -2; offset <= 2; offset++) {
      if (this.valid(page + offset)) rendered.add(page + offset);
    }
    return rendered;
  }

  updateViewport(entries: { page: number; area: number }[]): number | undefined {
    for (const entry of entries) {
      if (!this.valid(entry.page)) continue;
      if (Number.isFinite(entry.area) && entry.area > 0) this.areas.set(entry.page, entry.area);
      else this.areas.delete(entry.page);
    }
    let current: number | undefined, largest = 0;
    for (const [page, area] of this.areas) if (area > largest || area === largest && (current === undefined || page < current)) {
      current = page; largest = area;
    }
    return current;
  }
}
