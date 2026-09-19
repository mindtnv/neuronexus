'use client';
import { useRef, useState, type PointerEvent } from 'react';

export function ResizeHandle({ width, min, max, defaultWidth, label, edge = 'right', onChange }: {
  width: number; min: number; max: number; defaultWidth: number; label: string; edge?: 'left' | 'right'; onChange: (value: number) => void;
}) {
  const direction = edge === 'left' ? -1 : 1;
  const start = useRef<{ x: number; width: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const finish = (event: PointerEvent<HTMLDivElement>) => {
    start.current = null; setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return <div className="reomi-resize-handle" data-edge={edge} role="separator" tabIndex={0} aria-label={label} aria-orientation="vertical"
    aria-valuemin={min} aria-valuemax={max} aria-valuenow={width} data-dragging={dragging || undefined}
    onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); event.currentTarget.focus(); start.current = { x: event.clientX, width: event.currentTarget.parentElement?.getBoundingClientRect().width ?? width }; setDragging(true); event.currentTarget.setPointerCapture(event.pointerId); }}
    onPointerMove={event => { if (start.current) onChange(start.current.width + (event.clientX - start.current.x) * direction); }}
    onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={() => { start.current = null; setDragging(false); }}
    onDoubleClick={() => onChange(defaultWidth)}
    onKeyDown={event => { const next = event.key === 'ArrowLeft' ? width - 8 * direction : event.key === 'ArrowRight' ? width + 8 * direction : event.key === 'Home' ? min : event.key === 'End' ? max : null; if (next !== null) { event.preventDefault(); onChange(next); } }} />;
}
