// NeuroNexus — Mobile view (iOS frame)

const NNMobile = () => {
  const [tab, setTab] = React.useState('home');
  return (
    <IOSDevice width={390} height={844} dark>
      <div style={{
        height: '100%', display: 'flex', flexDirection: 'column',
        background: '#0a0b0d', color: '#eaecf1',
        fontFamily: '-apple-system, "Inter Tight", system-ui',
      }}>
        {/* spacer for status bar */}
        <div style={{ height: 54 }}/>

        {/* Screen content */}
        {tab === 'home' && <MobHome/>}
        {tab === 'review' && <MobReview/>}
        {tab === 'graph' && <MobGraph/>}
        {tab === 'garden' && <MobGarden/>}

        {/* Bottom tab */}
        <div style={{
          height: 82, paddingBottom: 22, paddingTop: 6,
          borderTop: '1px solid #1c1f25',
          background: 'rgba(10,11,13,0.85)',
          backdropFilter: 'blur(20px)',
          display: 'flex', justifyContent: 'space-around', alignItems: 'center',
        }}>
          {[
            { id: 'home', i: 'home', l: 'Home' },
            { id: 'review', i: 'bolt', l: 'Review' },
            { id: 'graph', i: 'graph', l: 'Graph' },
            { id: 'garden', i: 'garden', l: 'Garden' },
          ].map(t => (
            <div key={t.id} onClick={() => setTab(t.id)} style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              color: tab === t.id ? 'var(--lime-400)' : 'var(--text-dim)',
              padding: '6px 10px', cursor: 'pointer',
            }}>
              <NNIcon name={t.i} size={22}/>
              <span style={{ fontSize: 10.5, fontWeight: 500 }}>{t.l}</span>
            </div>
          ))}
        </div>
      </div>
    </IOSDevice>
  );
};

const MobHome = () => (
  <div style={{ flex: 1, overflow: 'auto', padding: '8px 18px 20px' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Morning, Alex</div>
        <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: -0.5 }}>Apr 17</div>
      </div>
      <NNBadge tone="amber" size="sm" icon="flame">23</NNBadge>
    </div>

    <div style={{
      padding: 20, borderRadius: 16,
      background: 'linear-gradient(140deg, var(--surface), var(--surface-2))',
      border: '1px solid var(--border)', marginBottom: 12,
    }}>
      <div style={{ fontSize: 10.5, color: 'var(--lime-400)', letterSpacing: 0.8, textTransform: 'uppercase', fontWeight: 600, marginBottom: 6 }}>Due today</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14 }}>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 60, lineHeight: 1, letterSpacing: -1.5 }}>42</div>
        <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>cards · ~11 min</div>
      </div>
      <NNBtn block size="lg" variant="primary" icon="bolt">Start review</NNBtn>
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
      <NNCard padding={14}>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 }}>Mastery</div>
        <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--lime-400)' }} className="mono">93%</div>
        <div style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>847 cards</div>
      </NNCard>
      <NNCard padding={14}>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 }}>Level</div>
        <div style={{ fontSize: 22, fontWeight: 600 }} className="mono">3</div>
        <div style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>Botanist</div>
      </NNCard>
    </div>

    <div style={{ fontSize: 12, color: 'var(--text-muted)', margin: '16px 0 8px', fontWeight: 500 }}>Decks</div>
    {[
      { n: 'German vocab', d: 18, c: 'amber' },
      { n: 'System Design', d: 12, c: 'violet' },
      { n: 'Rust std lib', d: 8, c: 'sky' },
    ].map((d, i) => (
      <div key={i} style={{
        padding: 14, borderRadius: 12, background: 'var(--surface)',
        border: '1px solid var(--border)', marginBottom: 8,
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div style={{ width: 8, height: 36, borderRadius: 2, background: `var(--${d.c}-500)` }}/>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 500 }}>{d.n}</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>{d.d} due</div>
        </div>
        <NNIcon name="chevr" size={14} color="var(--text-dim)"/>
      </div>
    ))}
  </div>
);

const MobReview = () => (
  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '8px 16px 12px' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
      <NNIcon name="x" size={18} color="var(--text-muted)"/>
      <div style={{ flex: 1, height: 5, background: 'var(--surface-3)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: '34%', height: '100%', background: 'var(--lime-500)' }}/>
      </div>
      <span className="mono" style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>14/42</span>
    </div>
    <div style={{
      flex: 1, padding: '24px 20px', borderRadius: 18,
      background: 'var(--surface)', border: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
        <NNTag color="amber">german</NNTag>
        <NNTag color="sky">b1</NNTag>
      </div>
      <div style={{ fontFamily: 'var(--font-serif)', fontSize: 44, letterSpacing: -1, lineHeight: 1.1 }}>
        der Nachbar
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic', marginTop: 8 }}>
        /ˈnaːx.baːɐ̯/
      </div>
      <div style={{ flex: 1 }}/>
      <div style={{ height: 1, background: 'var(--border)', margin: '18px 0' }}/>
      <div style={{ fontSize: 22, color: 'var(--lime-400)', fontFamily: 'var(--font-serif)' }}>the neighbor</div>
      <div style={{
        marginTop: 12, padding: 10, borderRadius: 8,
        background: 'rgba(167,136,255,0.08)', border: '1px solid rgba(167,136,255,0.2)',
        fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.45,
      }}>
        <span style={{ color: 'var(--violet-400)', fontWeight: 500 }}>Mnemonic: </span>
        Nacht-bar — the night bar where you meet neighbors.
      </div>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginTop: 12 }}>
      {[
        { l: 'Again', t: '<1m', c: 'rose' },
        { l: 'Hard', t: '8m', c: 'amber' },
        { l: 'Good', t: '3d', c: 'lime' },
        { l: 'Easy', t: '9d', c: 'sky' },
      ].map(r => (
        <div key={r.l} style={{
          padding: '10px 6px', borderRadius: 10, textAlign: 'center',
          background: `rgba(var(--${r.c}-rgb, 154,209,85),0.1)`,
          border: `1px solid var(--${r.c}-500)`,
        }}>
          <div style={{ fontSize: 12, fontWeight: 600 }}>{r.l}</div>
          <div style={{ fontSize: 10, color: 'var(--text-dim)' }} className="mono">{r.t}</div>
        </div>
      ))}
    </div>
  </div>
);

const MobGraph = () => (
  <div style={{ flex: 1, position: 'relative', background: '#06070a', overflow: 'hidden' }}>
    <div style={{
      position: 'absolute', top: 12, left: 16, right: 16, zIndex: 5,
      display: 'flex', gap: 8, alignItems: 'center',
    }}>
      <div style={{
        flex: 1, padding: '8px 12px', background: 'var(--surface)',
        border: '1px solid var(--border)', borderRadius: 10,
        display: 'flex', gap: 8, alignItems: 'center', fontSize: 13,
      }}>
        <NNIcon name="search" size={14} color="var(--text-dim)"/>
        <span style={{ color: 'var(--text-dim)' }}>Search graph…</span>
      </div>
      <NNBtn size="md" variant="soft" icon="filter"/>
    </div>
    <NNMiniGraph height="100%" width="100%"/>
    <div style={{
      position: 'absolute', bottom: 16, left: 16, right: 16,
      padding: 14, background: 'rgba(20,22,30,0.9)', backdropFilter: 'blur(12px)',
      border: '1px solid var(--border)', borderRadius: 14,
    }}>
      <div style={{ fontFamily: 'var(--font-serif)', fontSize: 20 }}>der Nachbar</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>7 links · 91% mastery</div>
      <div style={{ display: 'flex', gap: 6 }}>
        <NNBadge tone="sky" size="xs">der Freund</NNBadge>
        <NNBadge tone="sky" size="xs">wohnen</NNBadge>
        <NNBadge tone="violet" size="xs">+5</NNBadge>
      </div>
    </div>
  </div>
);

const MobGarden = () => (
  <div style={{ flex: 1, overflow: 'auto', padding: '8px 18px 20px' }}>
    <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.4, marginBottom: 2 }}>Your garden</div>
    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>Level 3 · 5 plants growing</div>
    <div style={{
      padding: 20, borderRadius: 16, background: 'linear-gradient(180deg, #12171f, #1b2418)',
      border: '1px solid var(--border)', position: 'relative', overflow: 'hidden', height: 220,
      marginBottom: 14,
    }}>
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 30,
        background: 'linear-gradient(180deg, #3a2817, #1a0f07)' }}/>
      <div style={{ position: 'absolute', bottom: 10, left: '5%' }}><NNPlant stage={5} size={100}/></div>
      <div style={{ position: 'absolute', bottom: 5, left: '35%' }}><NNPlant stage={3} size={90}/></div>
      <div style={{ position: 'absolute', bottom: 8, left: '65%' }}><NNPlant stage={4} size={90}/></div>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      {[
        { n: 'German', s: 4, c: 'amber' },
        { n: 'Systems', s: 3, c: 'violet' },
        { n: 'Rust', s: 2, c: 'sky' },
        { n: 'Biases', s: 5, c: 'rose' },
      ].map((p, i) => (
        <NNCard key={i} padding={12}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>
            <NNPlant stage={p.s} size={70}/>
          </div>
          <div style={{ fontSize: 13, fontWeight: 500, textAlign: 'center' }}>{p.n}</div>
          <div style={{ fontSize: 10.5, color: `var(--${p.c}-400)`, textAlign: 'center' }} className="mono">stage {p.s}/5</div>
        </NNCard>
      ))}
    </div>
  </div>
);

Object.assign(window, { NNMobile });
