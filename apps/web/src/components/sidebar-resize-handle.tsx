'use client';
import { useRef, useState, type PointerEvent } from 'react';
import { useT } from '@/lib/i18n';
import { useUI, SIDEBAR_WIDTH_MIN, SIDEBAR_WIDTH_FULL_MIN, SIDEBAR_WIDTH_MAX, SIDEBAR_WIDTH_EXPANDED } from '@/lib/ui-store';

export function SidebarResizeHandle() {
  const t = useT();
  const width = useUI(state => state.sidebarWidth);
  const setWidth = useUI(state => state.setSidebarWidth);
  const drag = useRef<{ x: number; width: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const finish = (event: PointerEvent<HTMLDivElement>) => {
    drag.current = null; setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return <div className="nn-sidebar-resizer" role="separator" tabIndex={0}
    aria-label={t('chrome.resizeSidebar')} aria-orientation="vertical" aria-controls="app-sidebar-slot"
    aria-valuemin={SIDEBAR_WIDTH_MIN} aria-valuemax={SIDEBAR_WIDTH_MAX} aria-valuenow={width}
    data-dragging={dragging || undefined}
    onPointerDown={event => {
      if (event.button !== 0) return;
      event.preventDefault(); event.currentTarget.focus();
      drag.current = { x: event.clientX, width }; setDragging(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={event => { if (drag.current) setWidth(drag.current.width + event.clientX - drag.current.x); }}
    onPointerUp={finish} onPointerCancel={finish}
    onLostPointerCapture={() => { drag.current = null; setDragging(false); }}
    onDoubleClick={() => setWidth(SIDEBAR_WIDTH_EXPANDED)}
    onKeyDown={event => {
      const next = event.key === 'ArrowRight' ? (width === SIDEBAR_WIDTH_MIN ? SIDEBAR_WIDTH_FULL_MIN : width + 8) : event.key === 'ArrowLeft' ? (width === SIDEBAR_WIDTH_FULL_MIN ? SIDEBAR_WIDTH_MIN : width - 8) : event.key === 'Home' ? SIDEBAR_WIDTH_MIN : event.key === 'End' ? SIDEBAR_WIDTH_MAX : null;
      if (next !== null) { event.preventDefault(); setWidth(next); }
    }} />;
}
