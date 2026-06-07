'use client';

import React, { useEffect, useState } from 'react';
import { CommandPalette } from './command-palette';
import { KbdCheatsheet } from './cheatsheet';
import { useUI } from '@/lib/ui-store';

// NeuroNexus — Global overlay controller
// Mounts invisibly at the top of the (app) route tree and opens
// the command palette or keyboard cheatsheet on demand.

export const GlobalOverlays = () => {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [cheatsheetOpen, setCheatsheetOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const key = e.key;

      // Close active overlay on Escape
      if (key === 'Escape') {
        if (paletteOpen || cheatsheetOpen) {
          e.preventDefault();
          setPaletteOpen(false);
          setCheatsheetOpen(false);
        }
        return;
      }

      // ⌘K / Ctrl+K — toggle palette
      if ((e.metaKey || e.ctrlKey) && (key === 'k' || key === 'K')) {
        e.preventDefault();
        setCheatsheetOpen(false);
        setPaletteOpen((v) => !v);
        return;
      }

      // ⌘B / Ctrl+B — toggle the desktop sidebar (skip while typing).
      if ((e.metaKey || e.ctrlKey) && (key === 'b' || key === 'B')) {
        const target = e.target as HTMLElement | null;
        const tag = target?.tagName;
        const editable =
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          tag === 'SELECT' ||
          (target?.isContentEditable ?? false);
        if (editable) return;
        // Desktop-only: tablet/mobile keep their drawer/rail behavior (spec).
        if (window.innerWidth < 1100) return;
        e.preventDefault();
        useUI.getState().toggleSidebar();
        return;
      }

      // ? — toggle cheatsheet, but only when not typing
      if (key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const target = e.target as HTMLElement | null;
        const tag = target?.tagName;
        const editable =
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          tag === 'SELECT' ||
          (target?.isContentEditable ?? false);
        if (editable) return;
        e.preventDefault();
        setPaletteOpen(false);
        setCheatsheetOpen((v) => !v);
        return;
      }
    };

    window.addEventListener('keydown', handler);

    // Custom window events so any component can trigger overlays without importing state.
    const onOpenPalette = () => {
      setCheatsheetOpen(false);
      setPaletteOpen(true);
    };
    const onOpenCheatsheet = () => {
      setPaletteOpen(false);
      setCheatsheetOpen(true);
    };
    window.addEventListener('nn:open-palette', onOpenPalette);
    window.addEventListener('nn:open-cheatsheet', onOpenCheatsheet);

    return () => {
      window.removeEventListener('keydown', handler);
      window.removeEventListener('nn:open-palette', onOpenPalette);
      window.removeEventListener('nn:open-cheatsheet', onOpenCheatsheet);
    };
  }, [paletteOpen, cheatsheetOpen]);

  if (!paletteOpen && !cheatsheetOpen) return null;

  return (
    <>
      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
      {cheatsheetOpen && <KbdCheatsheet onClose={() => setCheatsheetOpen(false)} />}
    </>
  );
};

export default GlobalOverlays;
