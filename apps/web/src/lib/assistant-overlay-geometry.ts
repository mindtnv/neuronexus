import { readWindowControlsOverlay } from './ui-store';
export interface VisibleAssistantViewport { left: number; top: number; width: number; height: number }
export function visibleAssistantViewport(): VisibleAssistantViewport {
  const viewport = window.visualViewport;
  const visualTop = viewport?.offsetTop ?? 0, visualHeight = viewport?.height ?? window.innerHeight;
  const wco = readWindowControlsOverlay(navigator);
  const top = Math.max(visualTop, wco.active && wco.rect ? wco.rect.y + wco.rect.height : 0);
  return { left: viewport?.offsetLeft ?? 0, top,
    width: viewport?.width ?? window.innerWidth, height: Math.max(1, visualTop + visualHeight - top) };
}
export function assistantOverlayShift(rect: { left: number; top: number; width: number; height: number }, viewport: VisibleAssistantViewport) {
  const left = Math.max(viewport.left + 12, Math.min(rect.left, viewport.left + viewport.width - rect.width - 12));
  const top = Math.max(viewport.top + 12, Math.min(rect.top, viewport.top + viewport.height - rect.height - 12));
  return { x: left - rect.left, y: top - rect.top };
}
