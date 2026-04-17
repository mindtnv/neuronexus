// NeuroNexus — Shell: sidebar + topbar + mobile nav
// Used by all desktop screens

const NN_NAV = [
  { id: 'home',    label: 'Home',    icon: 'home' },
  { id: 'review',  label: 'Review',  icon: 'bolt',  badge: 42 },
  { id: 'graph',   label: 'Graph',   icon: 'graph' },
  { id: 'decks',   label: 'Decks',   icon: 'stack' },
  { id: 'garden',  label: 'Garden',  icon: 'garden' },
  { id: 'editor',  label: 'Editor',  icon: 'edit' },
  { id: 'stats',   label: 'Stats',   icon: 'graph' },
  { id: 'settings',label: 'Settings',icon: 'settings' },
];

const NNSidebar = ({ active, onNav, collapsed }) => (
  <aside style={{
    width: collapsed ? 60 : 232,
    flexShrink: 0,
    background: 'var(--surface)',
    borderRight: '1px solid var(--border)',
    display: 'flex', flexDirection: 'column',
    transition: 'width 180ms ease',
  }}>
    {/* Header */}
    <div style={{
      padding: collapsed ? '18px 12px' : '18px 18px',
      borderBottom: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      height: 61,
    }}>
      <NNLogo showText={!collapsed} />
    </div>

    {/* Workspace switcher */}
    {!collapsed && (
      <div style={{ padding: '12px 14px 4px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 10px', borderRadius: 8,
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          cursor: 'pointer',
        }}>
          <div style={{
            width: 22, height: 22, borderRadius: 6,
            background: 'linear-gradient(135deg, #9ad155, #55c4d6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 700, color: '#0a0b0d',
          }}>AK</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text)' }}>alex's brain</div>
            <div style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>free · 847 cards</div>
          </div>
          <NNIcon name="chevd" size={12} color="var(--text-dim)" />
        </div>
      </div>
    )}

    {/* Nav */}
    <nav style={{ padding: collapsed ? '8px 6px' : '8px 10px', flex: 1 }}>
      {!collapsed && (
        <div style={{
          fontSize: 10.5, fontWeight: 500, color: 'var(--text-dim)',
          textTransform: 'uppercase', letterSpacing: 0.8,
          padding: '10px 8px 6px',
        }}>Workspace</div>
      )}
      {NN_NAV.map(item => {
        const isActive = active === item.id;
        return (
          <div
            key={item.id}
            onClick={() => onNav?.(item.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: collapsed ? '9px 0' : '8px 10px',
              justifyContent: collapsed ? 'center' : 'flex-start',
              borderRadius: 8, marginBottom: 2, cursor: 'pointer',
              background: isActive ? 'var(--surface-3)' : 'transparent',
              color: isActive ? 'var(--text)' : 'var(--text-muted)',
              fontSize: 13, fontWeight: 500, letterSpacing: -0.1,
              position: 'relative',
            }}
          >
            <NNIcon name={item.icon} size={16} />
            {!collapsed && <span style={{ flex: 1 }}>{item.label}</span>}
            {!collapsed && item.badge != null && (
              <span style={{
                fontSize: 10.5, fontWeight: 600,
                background: 'var(--lime-500)', color: '#0d1608',
                padding: '2px 6px', borderRadius: 999,
                minWidth: 20, textAlign: 'center',
              }}>{item.badge}</span>
            )}
            {collapsed && item.badge != null && (
              <span style={{
                position: 'absolute', top: 4, right: 4,
                width: 6, height: 6, borderRadius: 3, background: 'var(--lime-500)',
              }} />
            )}
          </div>
        );
      })}

      {/* Decks tree */}
      {!collapsed && (
        <>
          <div style={{
            fontSize: 10.5, fontWeight: 500, color: 'var(--text-dim)',
            textTransform: 'uppercase', letterSpacing: 0.8,
            padding: '20px 8px 6px',
          }}>Recent decks</div>
          {[
            { name: 'German vocab', count: 342, color: 'amber' },
            { name: 'System Design', count: 118, color: 'violet' },
            { name: 'Rust std lib', count: 87, color: 'sky' },
            { name: 'Cognitive biases', count: 64, color: 'rose' },
          ].map(d => (
            <div key={d.name} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '7px 10px', borderRadius: 8, marginBottom: 1,
              color: 'var(--text-muted)', fontSize: 12.5, cursor: 'pointer',
            }}>
              <div style={{
                width: 7, height: 7, borderRadius: 2,
                background: `var(--${d.color}-500)`,
              }} />
              <span style={{ flex: 1 }}>{d.name}</span>
              <span style={{ color: 'var(--text-dim)', fontSize: 11 }} className="mono">{d.count}</span>
            </div>
          ))}
        </>
      )}
    </nav>

    {/* Footer: streak */}
    {!collapsed && (
      <div style={{ padding: 10, borderTop: '1px solid var(--border)' }}>
        <div style={{
          padding: '12px 14px', borderRadius: 10,
          background: 'linear-gradient(135deg, rgba(232,154,43,0.12), rgba(243,182,85,0.06))',
          border: '1px solid rgba(243,182,85,0.2)',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{ fontSize: 22 }}>
            <NNIcon name="flame" size={22} color="var(--amber-500)" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
              <span className="mono">23</span>-day streak
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>next: level 4</div>
          </div>
        </div>
      </div>
    )}
  </aside>
);

// Top bar — search + actions
const NNTopbar = ({ title, subtitle, actions }) => (
  <header style={{
    height: 61, padding: '0 24px', borderBottom: '1px solid var(--border)',
    display: 'flex', alignItems: 'center', gap: 16,
    background: 'var(--bg)', flexShrink: 0,
  }}>
    <div style={{ flex: 1, display: 'flex', alignItems: 'baseline', gap: 12 }}>
      <h1 style={{
        margin: 0, fontSize: 18, fontWeight: 600, letterSpacing: -0.4,
        color: 'var(--text)',
      }}>{title}</h1>
      {subtitle && (
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{subtitle}</span>
      )}
    </div>
    {/* search */}
    <div style={{
      height: 34, minWidth: 260, padding: '0 12px',
      display: 'flex', alignItems: 'center', gap: 8,
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 9,
    }}>
      <NNIcon name="search" size={14} color="var(--text-dim)" />
      <span style={{ fontSize: 13, color: 'var(--text-dim)', flex: 1 }}>Search cards, tags, topics…</span>
      <NNKbd>⌘K</NNKbd>
    </div>
    {actions}
    <NNBtn size="md" variant="primary" icon="plus">New card</NNBtn>
  </header>
);

Object.assign(window, { NNSidebar, NNTopbar, NN_NAV });
