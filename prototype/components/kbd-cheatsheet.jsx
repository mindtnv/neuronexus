// NeuroNexus — Keyboard shortcut cheatsheet
// Triggered by pressing ? — full overlay, grouped by context

const KBD_GROUPS = [
  {
    title: 'Review',
    icon: 'bolt',
    color: 'lime',
    shortcuts: [
      { keys: ['Space'],     desc: 'Reveal answer' },
      { keys: ['1'],         desc: 'Grade: Again (<1 min)' },
      { keys: ['2'],         desc: 'Grade: Hard (8 min)' },
      { keys: ['3'],         desc: 'Grade: Good (3 days)' },
      { keys: ['4'],         desc: 'Grade: Easy (9 days)' },
      { keys: ['J'],         desc: 'Skip card (bury)' },
      { keys: ['E'],         desc: 'Edit current card' },
      { keys: ['⌘', 'Z'],   desc: 'Undo last rating' },
    ],
  },
  {
    title: 'Navigation',
    icon: 'home',
    color: 'sky',
    shortcuts: [
      { keys: ['G', 'H'],   desc: 'Go to Home' },
      { keys: ['G', 'R'],   desc: 'Go to Review' },
      { keys: ['G', 'G'],   desc: 'Go to Graph' },
      { keys: ['G', 'D'],   desc: 'Go to Garden' },
      { keys: ['G', 'S'],   desc: 'Go to Stats' },
      { keys: ['G', ','],   desc: 'Go to Settings' },
    ],
  },
  {
    title: 'Graph',
    icon: 'graph',
    color: 'violet',
    shortcuts: [
      { keys: ['F'],         desc: 'Find node (focus search)' },
      { keys: ['⌘', '+'],   desc: 'Zoom in' },
      { keys: ['⌘', '−'],   desc: 'Zoom out' },
      { keys: ['⌘', '0'],   desc: 'Reset zoom' },
      { keys: ['Esc'],       desc: 'Deselect node' },
      { keys: ['⌘', 'A'],   desc: 'Select all visible' },
    ],
  },
  {
    title: 'Editor',
    icon: 'edit',
    color: 'amber',
    shortcuts: [
      { keys: ['⌘', 'S'],   desc: 'Save card' },
      { keys: ['⌘', 'D'],   desc: 'Duplicate card' },
      { keys: ['⌘', '⌫'],   desc: 'Delete card' },
      { keys: ['Tab'],       desc: 'Next field' },
      { keys: ['⌘', 'B'],   desc: 'Bold' },
      { keys: ['⌘', 'I'],   desc: 'Italic' },
      { keys: ['⌘', '['],   desc: 'Create cloze' },
    ],
  },
  {
    title: 'Global',
    icon: 'sparkle',
    color: 'neutral',
    shortcuts: [
      { keys: ['⌘', 'K'],   desc: 'Command palette' },
      { keys: ['?'],         desc: 'This cheatsheet' },
      { keys: ['⌘', '/'],   desc: 'Toggle shortcuts' },
      { keys: ['⌘', ','],   desc: 'Open settings' },
      { keys: ['⌘', 'N'],   desc: 'New card' },
      { keys: ['⌘', 'I'],   desc: 'Import PDF' },
    ],
  },
];

const COLOR_MAP = {
  lime:    'var(--lime-400)',
  sky:     'var(--sky-400)',
  violet:  'var(--violet-400)',
  amber:   'var(--amber-400)',
  neutral: 'var(--text-muted)',
};

const KbdCheatsheet = ({ onClose }) => {
  React.useEffect(() => {
    const h = e => { if (e.key === 'Escape' || e.key === '?') onClose?.(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 100,
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 780, maxHeight: 600,
        background: 'var(--surface)',
        border: '1px solid var(--border-2)',
        borderRadius: 20,
        boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        animation: 'kbd-pop 180ms cubic-bezier(.34,1.56,.64,1)',
      }}>
        <style>{`@keyframes kbd-pop { from { transform: scale(0.94); opacity: 0; } to { transform: scale(1); opacity: 1; } }`}</style>

        {/* Header */}
        <div style={{
          padding: '16px 22px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{ fontSize: 15, fontWeight: 600, flex: 1 }}>Keyboard shortcuts</div>
          <NNKbd>?</NNKbd>
          <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 2 }}>to toggle</span>
          <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 6px' }}/>
          <NNBtn size="sm" variant="ghost" icon="x" onClick={onClose}/>
        </div>

        {/* Grid of groups */}
        <div className="nn-scroll" style={{
          flex: 1, overflowY: 'auto',
          display: 'grid', gridTemplateColumns: '1fr 1fr',
          gap: 1, background: 'var(--border)',
        }}>
          {KBD_GROUPS.map(group => (
            <div key={group.title} style={{
              background: 'var(--surface)',
              padding: '18px 20px',
            }}>
              {/* Group header */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14,
              }}>
                <NNIcon name={group.icon} size={14} color={COLOR_MAP[group.color]}/>
                <span style={{
                  fontSize: 11, fontWeight: 600, letterSpacing: 0.8,
                  textTransform: 'uppercase', color: COLOR_MAP[group.color],
                }}>{group.title}</span>
              </div>

              {/* Rows */}
              {group.shortcuts.map((s, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '5px 0',
                  borderTop: i ? '1px solid var(--border)' : 'none',
                }}>
                  <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                    {s.keys.map((k, j) => <NNKbd key={j}>{k}</NNKbd>)}
                  </div>
                  <span style={{ fontSize: 12.5, color: 'var(--text-muted)', flex: 1 }}>{s.desc}</span>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          padding: '10px 22px', borderTop: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 11, color: 'var(--text-dim)',
        }}>
          <NNKbd>Esc</NNKbd>
          <span>to close</span>
          <span style={{ flex: 1 }}/>
          <span>All shortcuts also accessible via</span>
          <NNKbd>⌘</NNKbd><NNKbd>K</NNKbd>
        </div>
      </div>
    </div>
  );
};

// Demo: graph screen with cheatsheet open on top
const NNKbdCheatsheetDemo = () => {
  const [open, setOpen] = React.useState(true);
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
      <NNTopbar title="Review" subtitle="German vocab · 42 due"/>
      <div style={{ flex: 1, overflow: 'hidden', filter: open ? 'blur(1px)' : 'none' }}>
        <NNReview variant="classic"/>
      </div>
      {open && <KbdCheatsheet onClose={() => setOpen(false)}/>}
      {!open && (
        <div style={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)' }}>
          <NNBtn variant="soft" onClick={() => setOpen(true)}>
            Open cheatsheet <NNKbd>?</NNKbd>
          </NNBtn>
        </div>
      )}
    </div>
  );
};

Object.assign(window, { KbdCheatsheet, NNKbdCheatsheetDemo });
