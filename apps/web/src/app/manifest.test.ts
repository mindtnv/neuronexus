import { describe, expect, test } from 'bun:test';
import manifest from './manifest';

describe('manifest route', () => {
  const m = manifest();

  test('identity + display fields', () => {
    expect(m.name).toBe('NeuroNexus');
    expect(m.short_name).toBe('NeuroNexus');
    expect(typeof m.description).toBe('string');
    expect(m.description!.length).toBeGreaterThan(0);
    expect(m.start_url).toBe('/');
    expect(m.scope).toBe('/');
    expect(m.display).toBe('standalone');
  });

  test('color fields are the brand dark', () => {
    expect(m.background_color).toBe('#0a0b0d');
    expect(m.theme_color).toBe('#0a0b0d');
  });

  test('ships 192, 512, and a 512 maskable PNG icon', () => {
    const icons = m.icons ?? [];
    expect(icons.length).toBe(3);

    const i192 = icons.find((i) => i.sizes === '192x192');
    expect(i192).toBeDefined();
    expect(i192!.type).toBe('image/png');
    expect(i192!.src).toBe('/icons/icon-192.png');

    const plain512 = icons.find((i) => i.sizes === '512x512' && i.purpose !== 'maskable');
    expect(plain512).toBeDefined();
    expect(plain512!.type).toBe('image/png');
    expect(plain512!.src).toBe('/icons/icon-512.png');

    const maskable = icons.find((i) => i.purpose === 'maskable');
    expect(maskable).toBeDefined();
    expect(maskable!.sizes).toBe('512x512');
    expect(maskable!.type).toBe('image/png');
    expect(maskable!.src).toBe('/icons/icon-512-maskable.png');
  });
});
