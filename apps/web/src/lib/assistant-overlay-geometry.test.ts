import { expect, test } from 'bun:test';
import { assistantOverlayShift } from './assistant-overlay-geometry';
test('a popup remains inside the visible viewport after orientation or keyboard panning', () => {
  const rect = { left: 50, top: 560, width: 320, height: 200 };
  const landscape = { left: 0, top: 0, width: 844, height: 390 };
  const shift = assistantOverlayShift(rect, landscape);
  expect(rect.top + shift.y).toBe(178); expect(rect.top + shift.y + rect.height).toBe(378);
  const panned = assistantOverlayShift({ ...rect, top: 20 }, { left: 0, top: 110, width: 390, height: 430 });
  expect(20 + panned.y).toBe(122);
});
