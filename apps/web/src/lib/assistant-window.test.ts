import { expect, test } from 'bun:test';
import { clampAssistantWindow, defaultAssistantWindow, moveAssistantWindow, resizeAssistantWindow, readAssistantWindow } from './assistant-window';

test('floating geometry stays inside resized viewports and invalid storage safely falls back', () => {
  const viewport = { width: 900, height: 600 };
  const rect = clampAssistantWindow({ x: 3000, y: -200, width: 9000, height: 9000 }, viewport);
  expect(rect.x).toBeGreaterThanOrEqual(12); expect(rect.y).toBeGreaterThanOrEqual(12);
  expect(rect.x + rect.width).toBeLessThanOrEqual(888); expect(rect.y + rect.height).toBeLessThanOrEqual(588);
  expect(readAssistantWindow({ getItem: () => '{broken' }, viewport)).toEqual(defaultAssistantWindow(viewport));
  expect(readAssistantWindow({ getItem: () => { throw new Error('disabled'); } }, viewport)).toEqual(defaultAssistantWindow(viewport));
});

test('movement and keyboard-sized resize honor bounds without resizing underlying content', () => {
  const viewport = { width: 1400, height: 900 };
  const original = defaultAssistantWindow(viewport);
  const moved = moveAssistantWindow(original, -100, -50, viewport);
  expect(moved.width).toBe(original.width); expect(moved.height).toBe(original.height);
  expect(moved.x).toBe(original.x - 100);
  const resized = resizeAssistantWindow(moved, 16, 16, viewport);
  expect(resized.width).toBe(moved.width + 16); expect(resized.height).toBe(moved.height + 16);
  expect(original).toEqual(defaultAssistantWindow(viewport));
});

test('floating geometry reserves the installed-window titlebar area', () => {
  const viewport = { width: 1200, height: 800, insetTop: 38 };
  const rect = clampAssistantWindow({ x: 12, y: 0, width: 440, height: 900 }, viewport);
  expect(rect.y).toBe(50); expect(rect.y + rect.height).toBeLessThanOrEqual(788);
  expect(moveAssistantWindow(rect, 0, -1000, viewport).y).toBe(50);
});
