import { describe, expect, test } from 'bun:test';
import { THEME_CHROME_COLORS, THEME_IDS } from './theme';

describe('theme chrome colors', () => {
  test('every concrete theme has a PWA chrome color', () => {
    for (const id of THEME_IDS) {
      expect(THEME_CHROME_COLORS[id]).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  test('custom dark themes use surface colors, not black fallback', () => {
    expect(THEME_CHROME_COLORS.dracula).toBe('#343746');
    expect(THEME_CHROME_COLORS.gruvbox).toBe('#32302f');
    expect(THEME_CHROME_COLORS.rosepine).toBe('#211f30');
  });
});
