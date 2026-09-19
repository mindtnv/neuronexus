import { expect, test } from 'bun:test';
import { boundedPanelWidth, compactToolText } from './panel-width';
test('chat panel width is bounded and handles invalid stored values', () => {
  expect(boundedPanelWidth(800, 220, 420, 280)).toBe(420);
  expect(boundedPanelWidth(12, 220, 420, 280)).toBe(220);
  expect(boundedPanelWidth(NaN, 220, 420, 280)).toBe(280);
});
test('tool preview removes protocol references and bounds long output without losing detail', () => {
  const text = compactToolText('- React [deck:abc] — 9 cards\n- CSS [deck:def]\n- JS\n- HTML');
  expect(text.preview).not.toContain('[deck:');
  expect(text.preview).not.toContain('HTML');
  expect(text.full).toContain('HTML');
  expect(text.truncated).toBe(true);
  expect(compactToolText('No matches.').truncated).toBe(false);
});
