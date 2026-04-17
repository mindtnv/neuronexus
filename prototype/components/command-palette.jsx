// NeuroNexus — Command Palette (⌘K)
// Full overlay with search, grouped results, quick actions

const CMD_DATA = [
  // Quick actions
  { group: 'Quick actions', id: 'review-now',   icon: 'bolt',    label: 'Start review session',         sub: '42 cards due',       kbd: ['R'] },
  { group: 'Quick actions', id: 'new-card',     icon: 'plus',    label: 'New card',                     sub: 'Add to current deck', kbd: ['N'] },
  { group: 'Quick actions', id: 'new-deck',     icon: 'stack',   label: 'New deck',                     sub: null,                  kbd: [] },
  { group: 'Quick actions', id: 'import-pdf',   icon: 'image',   label: 'Import PDF → AI cards',        sub: null,                  kbd: [] },
  // Decks
  { group: 'Decks',         id: 'deck-german',  icon: 'stack',   label: 'German vocab',                 sub: '18 due · 212 cards',  tag: 'amber' },
  { group: 'Decks',         id: 'deck-sysdes',  icon: 'stack',   label: 'System Design',                sub: '12 due · 188 cards',  tag: 'violet' },
  { group: 'Decks',         id: 'deck-rust',    icon: 'stack',   label: 'Rust std lib',                 sub: '8 due · 147 cards',   tag: 'sky' },
  { group: 'Decks',         id: 'deck-biases',  icon: 'stack',   label: 'Cognitive biases',             sub: '4 due · 62 cards',    tag: 'rose' },
  // Cards
  { group: 'Cards',         id: 'card-nachbar', icon: 'edit',    label: 'der Nachbar — the neighbor',   sub: 'German vocab · #342',  tag: 'amber' },
  { group: 'Cards',         id: 'card-cap',     icon: 'edit',    label: 'CAP theorem',                  sub: 'System Design · #88', tag: 'violet' },
  { group: 'Cards',         id: 'card-hash',    icon: 'edit',    label: 'HashMap::entry',               sub: 'Rust std lib · #21',  tag: 'sky' },
  // Graph nodes
  { group: 'Graph',         id: 'node-wohnen',  icon: 'graph',   label: 'wohnen',                       sub: 'Graph node · 5 links' },
  { group: 'Graph',         id: 'node-consist', icon: 'graph',   label: 'Consistency models',           sub: 'Graph node · 9 links' },
  // Navigation
  { group: 'Navigate',      id: 'nav-home',     icon: 'home',    label: 'Go to Home',                   sub: null,                  kbd: ['G', 'H'] },
  { group: 'Navigate',      id: 'nav-graph',    icon: 'graph',   label: 'Go to Graph',                  sub: null,                  kbd: ['G', 'G'] },
  { group: 'Navigate',      id: 'nav-stats',    icon: 'target',  label: 'Go to Stats',                  sub: null,                  kbd: ['G', 'S'] },
  { group: 'Navigate',      id: 'nav-settings', icon: 'settings',label: 'Go to Settings',               sub: null,                  kbd: ['G', ','] },
];

const TAG_COLORS = {
  amber:  { bg: 'rgba(243,182,85,0.15)',  color: 'var(--amber-400)' },
  violet: { bg: 'rgba(167,136,255,0.15)', color: 'var(--violet-400)' },
  sky:    { bg: 'rgba(85,196,214,0.15)',  color: 'var(--sky-400)' },
  rose:   { bg: 'rgba(232,120,138,0.15)', color: 'var(--rose-400)' },
};

const CommandPalette = ({ defaultQuery = '', onClose }) => {
  const { useState, useEffect, useRef, useMemo } = React;
  const [query, setQuery] = useState(defaultQuery);
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Filter + group
  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    const items = q
      ? CMD_DATA.filter(d =>
          d.label.toLowerCase().includes(q) ||
          (d.sub && d.sub.toLowerCase().includes(q)) ||
          d.group.toLowerCase().includes(q)
        )
      : CMD_DATA;

    // Group
    const groups = {};
    items.forEach(item => {
      if (!groups[item.group]) groups[item.group] = [];
      groups[item.group].push(item);
    });
    return groups;
  }, [query]);

  const flatItems = useMemo(() => Object.values(filtered).flat(), [filtered]);

  useEffect(() => { setActive(0); }, [query]);

  useEffect(() => {
    inputRef.current?.focus();
    const handler = e => {
      if (e.key === 'Escape') onClose?.();
      if (e.key === 'ArrowDown') setActive(a => Math.min(a + 1, flatItems.length - 1));
      if (e.key === 'ArrowUp')   setActive(a => Math.max(a - 1, 0));
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [flatItems.length, onClose]);

  // Scroll active into view
  useEffect(() => {
    const el = listRef.current?.querySelector('[data-active="true"]');
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [active]);

  let runningIdx = 0;

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 100,
      background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      paddingTop: 100,
    }} onClick={() => onClose?.()}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 620, maxHeight: 520,
        background: 'var(--surface)',
        border: '1px solid var(--border-2)',
        borderRadius: 18,
        boxShadow: '0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>

        {/* Search input */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '14px 18px',
          borderBottom: '1px solid var(--border)',
        }}>
          <NNIcon name="search" size={18} color="var(--text-muted)"/>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search cards, decks, nodes — or type a command…"
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              fontSize: 15, color: 'var(--text)', fontFamily: 'var(--font-sans)',
              caretColor: 'var(--lime-400)',
            }}
          />
          {query && (
            <span onClick={() => setQuery('')} style={{ cursor: 'pointer', color: 'var(--text-dim)', lineHeight: 1 }}>
              <NNIcon name="x" size={14}/>
            </span>
          )}
          <NNKbd>esc</NNKbd>
        </div>

        {/* Results */}
        <div ref={listRef} style={{ overflowY: 'auto', flex: 1, padding: '6px 0 8px' }} className="nn-scroll">
          {Object.entries(filtered).map(([groupName, items]) => (
            <div key={groupName}>
              <div style={{
                padding: '8px 18px 4px',
                fontSize: 10.5, fontWeight: 600, letterSpacing: 0.8,
                textTransform: 'uppercase', color: 'var(--text-dim)',
              }}>{groupName}</div>
              {items.map(item => {
                const idx = runningIdx++;
                const isActive = idx === active;
                return (
                  <div
                    key={item.id}
                    data-active={isActive}
                    style={{
                      margin: '1px 6px',
                      padding: '9px 12px',
                      borderRadius: 10,
                      display: 'flex', alignItems: 'center', gap: 10,
                      cursor: 'pointer',
                      background: isActive ? 'var(--surface-3)' : 'transparent',
                      transition: 'background 60ms',
                    }}
                    onMouseEnter={() => setActive(idx)}
                  >
                    <div style={{
                      width: 30, height: 30, borderRadius: 8,
                      background: isActive ? 'var(--surface-2)' : 'var(--surface-2)',
                      border: '1px solid var(--border)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <NNIcon name={item.icon} size={14} color={isActive ? 'var(--lime-400)' : 'var(--text-muted)'}/>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--text)', letterSpacing: -0.1 }}>
                        {item.label}
                      </div>
                      {item.sub && (
                        <div style={{ fontSize: 11.5, color: 'var(--text-dim)', marginTop: 1 }}>{item.sub}</div>
                      )}
                    </div>
                    {item.tag && (() => {
                      const tc = TAG_COLORS[item.tag] || TAG_COLORS.amber;
                      return (
                        <span style={{
                          width: 8, height: 8, borderRadius: '50%', background: tc.color, flexShrink: 0,
                        }}/>
                      );
                    })()}
                    {item.kbd && item.kbd.length > 0 && (
                      <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                        {item.kbd.map((k, i) => <NNKbd key={i}>{k}</NNKbd>)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
          {flatItems.length === 0 && (
            <div style={{
              padding: '40px 20px', textAlign: 'center',
              color: 'var(--text-dim)', fontSize: 13,
            }}>
              No results for <em>"{query}"</em>
            </div>
          )}
        </div>

        {/* Footer hints */}
        <div style={{
          padding: '8px 18px',
          borderTop: '1px solid var(--border)',
          display: 'flex', gap: 16, alignItems: 'center',
        }}>
          {[
            { k: '↑↓', l: 'navigate' },
            { k: '↵',  l: 'open' },
            { k: 'esc',l: 'close' },
          ].map(h => (
            <div key={h.k} style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
              <NNKbd>{h.k}</NNKbd>
              <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{h.l}</span>
            </div>
          ))}
          <div style={{ flex: 1 }}/>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
            <NNKbd>⌘</NNKbd> <NNKbd>K</NNKbd> to toggle
          </span>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// Desktop shell with palette open
// ─────────────────────────────────────────────
const NNCmdPaletteDemo = ({ query = '' }) => {
  const [open, setOpen] = React.useState(true);
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
      {/* Blurred background — home screen */}
      <NNTopbar title="Home" subtitle="Welcome back, Alex"/>
      <div style={{ filter: open ? 'blur(1px)' : 'none', flex: 1, overflow: 'hidden' }}>
        <NNHome/>
      </div>
      {open && <CommandPalette defaultQuery={query} onClose={() => setOpen(false)}/>}
      {!open && (
        <div style={{
          position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
        }}>
          <NNBtn variant="soft" icon="search" onClick={() => setOpen(true)}>
            Open palette <NNKbd>⌘K</NNKbd>
          </NNBtn>
        </div>
      )}
    </div>
  );
};

Object.assign(window, { CommandPalette, NNCmdPaletteDemo });
