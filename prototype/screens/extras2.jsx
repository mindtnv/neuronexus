// NeuroNexus — more screens: session complete, empty states, card types, achievements, leagues

// ─────────────────────────────────────────────
// SESSION COMPLETE
// ─────────────────────────────────────────────
const NNSessionComplete = () => (
  <div style={{ flex: 1, display: 'flex', overflow: 'hidden', background: 'radial-gradient(ellipse at 50% 0%, rgba(154,209,85,0.08), transparent 60%)' }}>
    {/* Main */}
    <div className="nn-scroll" style={{ flex: 1, overflow: 'auto', padding: '48px 64px' }}>
      <div style={{ fontSize: 11, color: 'var(--lime-400)', textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 600, marginBottom: 8 }}>Session complete</div>
      <div style={{ fontFamily: 'var(--font-serif)', fontSize: 56, lineHeight: 1.05, letterSpacing: -1.5, marginBottom: 8 }}>
        Nicely done, Alex.
      </div>
      <div style={{ fontSize: 16, color: 'var(--text-muted)', marginBottom: 36 }}>
        You reviewed <span style={{ color: 'var(--text)' }} className="mono">42 cards</span> in <span style={{ color: 'var(--text)' }} className="mono">18 min 22 sec</span> — your fern grew a new frond.
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 28 }}>
        {[
          { l: 'Retention', v: '95%', sub: '+2% session', c: 'lime' },
          { l: 'Pace', v: '26s', sub: 'per card', c: 'sky' },
          { l: 'Streak', v: '24', sub: 'days · +1', c: 'amber' },
          { l: 'XP earned', v: '+184', sub: '2,847 total', c: 'violet' },
        ].map(k => (
          <div key={k.l} style={{ padding: 18, borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6 }}>{k.l}</div>
            <div style={{ fontSize: 32, fontWeight: 600, color: `var(--${k.c}-400)`, letterSpacing: -0.8, marginTop: 4 }} className="mono">{k.v}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Grade breakdown bar */}
      <NNCard padding={20} style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>How it went</div>
          <div style={{ flex: 1 }}/>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>42 cards</div>
        </div>
        <div style={{ height: 14, borderRadius: 7, overflow: 'hidden', display: 'flex' }}>
          {[
            { n: 2,  c: 'var(--rose-500)' },
            { n: 6,  c: 'var(--amber-500)' },
            { n: 30, c: 'var(--lime-500)' },
            { n: 4,  c: 'var(--sky-500)' },
          ].map((s, i) => (
            <div key={i} style={{ flex: s.n, background: s.c, borderRight: i < 3 ? '2px solid var(--bg)' : 'none' }}/>
          ))}
        </div>
        <div style={{ display: 'flex', marginTop: 12, fontSize: 12, color: 'var(--text-muted)' }}>
          <div style={{ flex: 1 }}>
            <span style={{ display: 'inline-block', width: 8, height: 8, background: 'var(--rose-500)', borderRadius: 2, marginRight: 6, verticalAlign: 'middle' }}/>
            Again · <span className="mono" style={{ color: 'var(--text)' }}>2</span>
          </div>
          <div style={{ flex: 1 }}>
            <span style={{ display: 'inline-block', width: 8, height: 8, background: 'var(--amber-500)', borderRadius: 2, marginRight: 6, verticalAlign: 'middle' }}/>
            Hard · <span className="mono" style={{ color: 'var(--text)' }}>6</span>
          </div>
          <div style={{ flex: 1 }}>
            <span style={{ display: 'inline-block', width: 8, height: 8, background: 'var(--lime-500)', borderRadius: 2, marginRight: 6, verticalAlign: 'middle' }}/>
            Good · <span className="mono" style={{ color: 'var(--text)' }}>30</span>
          </div>
          <div style={{ flex: 1 }}>
            <span style={{ display: 'inline-block', width: 8, height: 8, background: 'var(--sky-500)', borderRadius: 2, marginRight: 6, verticalAlign: 'middle' }}/>
            Easy · <span className="mono" style={{ color: 'var(--text)' }}>4</span>
          </div>
        </div>
      </NNCard>

      {/* Struggled cards */}
      <NNCard padding={20} style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Cards that need attention</div>
          <NNBadge tone="rose" size="sm" style={{ marginLeft: 10 }}>2 again</NNBadge>
          <div style={{ flex: 1 }}/>
          <NNBtn size="sm" variant="soft">Re-queue all</NNBtn>
        </div>
        {[
          { q: 'der Umstand', a: 'circumstance', lapses: 3 },
          { q: 'sich kümmern um', a: 'to take care of', lapses: 2 },
        ].map((c, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '10px 0', borderTop: i ? '1px solid var(--border)' : 'none' }}>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: 20, color: 'var(--text)', width: 200 }}>{c.q}</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', flex: 1 }}>{c.a}</div>
            <NNBadge tone="rose" size="sm">lapses {c.lapses}</NNBadge>
            <NNBtn size="sm" variant="ghost" icon="sparkle" style={{ marginLeft: 8 }}>Mnemonic</NNBtn>
          </div>
        ))}
      </NNCard>

      {/* Up next */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <NNCard padding={18}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6 }}>Tomorrow</div>
          <div style={{ fontSize: 24, fontWeight: 600, marginTop: 4 }} className="mono">38 due</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>~16 min · best at 9:30am</div>
        </NNCard>
        <NNCard padding={18}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6 }}>New cards available</div>
          <div style={{ fontSize: 24, fontWeight: 600, marginTop: 4 }} className="mono">12 in queue</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Learn now · extend session?</div>
        </NNCard>
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 32 }}>
        <NNBtn size="lg" variant="soft" icon="garden">Visit garden</NNBtn>
        <NNBtn size="lg" variant="soft" icon="graph">View graph</NNBtn>
        <div style={{ flex: 1 }}/>
        <NNBtn size="lg" variant="ghost">Finish</NNBtn>
        <NNBtn size="lg" variant="primary" icon="bolt">Learn 12 new</NNBtn>
      </div>
    </div>

    {/* Right celebration panel */}
    <aside style={{ width: 340, borderLeft: '1px solid var(--border)', background: 'var(--surface)', padding: 32, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ fontSize: 11, color: 'var(--lime-400)', textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: 600 }}>Fern grew</div>
      <div style={{ fontFamily: 'var(--font-serif)', fontSize: 22, marginTop: 4, marginBottom: 16 }}>Stage 3 → 4</div>

      <div style={{ width: 200, height: 220, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', position: 'relative' }}>
        {/* glow */}
        <div style={{ position: 'absolute', width: 200, height: 200, borderRadius: '50%', background: 'radial-gradient(circle, rgba(154,209,85,0.3), transparent 70%)', filter: 'blur(20px)' }}/>
        <NNPlant stage={4} size={200}/>
      </div>

      <div style={{ marginTop: 20, padding: 14, background: 'var(--surface-2)', borderRadius: 10, width: '100%' }}>
        <div style={{ fontSize: 12, color: 'var(--lime-400)', fontWeight: 600, marginBottom: 10 }}>+ New badges</div>
        {[
          { n: 'Perfect streak', d: '5 good in a row', icon: 'flame' },
          { n: 'Early bird', d: 'Reviewed before 9am', icon: 'sparkle' },
        ].map(b => (
          <div key={b.n} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0' }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(154,209,85,0.12)', border: '1px solid rgba(154,209,85,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <NNIcon name={b.icon} size={16} color="var(--lime-400)"/>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{b.n}</div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{b.d}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 8, padding: 12, background: 'rgba(243,182,85,0.06)', borderRadius: 10, width: '100%', border: '1px solid rgba(243,182,85,0.2)' }}>
        <NNIcon name="flame" size={20} color="var(--amber-400)"/>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: 'var(--amber-400)', fontWeight: 600 }}>24-day streak</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Next milestone: 30 days · Oak sapling</div>
        </div>
      </div>
    </aside>
  </div>
);

// ─────────────────────────────────────────────
// EMPTY STATES
// ─────────────────────────────────────────────
const NNEmpty = ({ kind = 'first-run' }) => {
  if (kind === 'first-run') {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
        <div style={{ textAlign: 'center', maxWidth: 480 }}>
          <div style={{ width: 120, height: 120, borderRadius: 24, background: 'rgba(154,209,85,0.06)', border: '1px solid rgba(154,209,85,0.15)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
            <NNPlant stage={1} size={90}/>
          </div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 38, lineHeight: 1.1, letterSpacing: -1 }}>
            A quiet garden.
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 10, lineHeight: 1.6 }}>
            Plant your first deck and start reviewing. You can import from Anki, drop in a PDF,
            or create cards from scratch — we'll help.
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 24 }}>
            <NNBtn size="lg" variant="primary" icon="plus">New deck</NNBtn>
            <NNBtn size="lg" variant="soft" icon="sparkle">Import PDF</NNBtn>
            <NNBtn size="lg" variant="ghost" icon="stack">From Anki</NNBtn>
          </div>
          {/* sample decks */}
          <div style={{ marginTop: 32, paddingTop: 24, borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 }}>Or try a starter deck</div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              {['Top 1000 English words', '50 US states', 'Basic French', 'Python syntax', 'Chemistry 101'].map(n => (
                <span key={n} style={{ padding: '6px 12px', fontSize: 12, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 999, color: 'var(--text-muted)' }}>{n}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (kind === 'done') {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
        <div style={{ textAlign: 'center', maxWidth: 420 }}>
          <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'rgba(154,209,85,0.1)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <NNIcon name="check" size={38} color="var(--lime-400)" strokeWidth={2.2}/>
          </div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 34, lineHeight: 1.1, letterSpacing: -0.8 }}>
            Inbox zero for your brain.
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 10, lineHeight: 1.6 }}>
            Nothing due right now. Next batch unlocks in <span className="mono" style={{ color: 'var(--lime-400)' }}>6h 14m</span>.
            Your fern is already the happiest in the garden.
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 24 }}>
            <NNBtn size="lg" variant="soft" icon="bolt">Learn 12 new</NNBtn>
            <NNBtn size="lg" variant="ghost" icon="graph">Explore graph</NNBtn>
          </div>
        </div>
      </div>
    );
  }
  // empty graph
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
      <div style={{ textAlign: 'center', maxWidth: 440 }}>
        {/* floating nodes */}
        <svg width="160" height="120" style={{ marginBottom: 16 }}>
          <circle cx="30" cy="40" r="8" fill="var(--surface-3)"/>
          <circle cx="90" cy="25" r="6" fill="var(--surface-3)"/>
          <circle cx="140" cy="60" r="10" fill="var(--surface-3)"/>
          <circle cx="60" cy="90" r="7" fill="var(--surface-3)"/>
          <circle cx="110" cy="100" r="5" fill="var(--surface-3)"/>
          <line x1="30" y1="40" x2="90" y2="25" stroke="var(--border-2)" strokeDasharray="2 3"/>
          <line x1="90" y1="25" x2="140" y2="60" stroke="var(--border-2)" strokeDasharray="2 3"/>
          <line x1="60" y1="90" x2="110" y2="100" stroke="var(--border-2)" strokeDasharray="2 3"/>
        </svg>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 30, lineHeight: 1.1, letterSpacing: -0.6 }}>
          Not enough constellation yet.
        </div>
        <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 10, lineHeight: 1.6 }}>
          The graph comes alive after ~40 cards. You have <span style={{ color: 'var(--text)' }} className="mono">6</span>.
          Keep going — AI will start linking related concepts automatically.
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 24 }}>
          <NNBtn size="lg" variant="primary" icon="plus">Add cards</NNBtn>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// CARD TYPES (Cloze, Image occlusion, Type-answer)
// ─────────────────────────────────────────────
const CardTypeCloze = () => (
  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40, background: 'radial-gradient(ellipse at top, rgba(167,136,255,0.04), transparent 60%)' }}>
    <div style={{ width: 640 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <NNBadge tone="violet" size="sm" icon="sparkle">Cloze · fill the blank</NNBadge>
        <NNBadge tone="neutral" size="sm">History · #24</NNBadge>
        <div style={{ flex: 1 }}/>
        <span style={{ fontSize: 11, color: 'var(--text-dim)' }} className="mono">c{'{'}{'{'}c1{'}'}{'}'}</span>
      </div>
      <div style={{ padding: 48, borderRadius: 18, background: 'var(--surface)', border: '1px solid var(--border-2)', minHeight: 280, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 32, lineHeight: 1.4, textAlign: 'center', maxWidth: 520 }}>
          The Treaty of <span style={{
            padding: '4px 18px', background: 'rgba(167,136,255,0.15)',
            border: '1.5px dashed var(--violet-400)', borderRadius: 8,
            color: 'var(--violet-400)', fontStyle: 'italic', fontSize: 24,
            verticalAlign: 'middle', margin: '0 4px',
          }}>[ ... ]</span> was signed in <span style={{ color: 'var(--violet-400)' }}>1648</span>, ending the <span style={{ color: 'var(--text-muted)' }}>Thirty Years' War</span>.
        </div>
      </div>
      <div style={{ marginTop: 16, display: 'flex', gap: 10, justifyContent: 'center' }}>
        <NNKbd>space</NNKbd>
        <span style={{ fontSize: 12, color: 'var(--text-dim)', alignSelf: 'center' }}>reveal answer</span>
      </div>
    </div>
  </div>
);

const CardTypeImageOcclusion = () => (
  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
    <div style={{ width: 640 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <NNBadge tone="sky" size="sm" icon="image">Image occlusion</NNBadge>
        <NNBadge tone="neutral" size="sm">Anatomy · #87</NNBadge>
        <div style={{ flex: 1 }}/>
        <span style={{ fontSize: 11, color: 'var(--text-dim)' }} className="mono">mask 2 of 5</span>
      </div>
      {/* Fake anatomical image */}
      <div style={{ padding: 20, borderRadius: 18, background: 'var(--surface)', border: '1px solid var(--border-2)' }}>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12, textAlign: 'center' }}>What is the highlighted structure?</div>
        <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', aspectRatio: '16/10', background: '#2a1f18' }}>
          {/* sketched heart diagram */}
          <svg viewBox="0 0 640 400" style={{ width: '100%', height: '100%', display: 'block' }}>
            <defs>
              <radialGradient id="hbg" cx="50%" cy="50%">
                <stop offset="0" stopColor="#3a2818"/>
                <stop offset="1" stopColor="#1a0f08"/>
              </radialGradient>
            </defs>
            <rect width="640" height="400" fill="url(#hbg)"/>
            {/* chambers */}
            <path d="M 200 100 Q 180 180 220 240 L 280 240 L 280 100 Z" fill="#6b2b2b" stroke="#9a3c3c" strokeWidth="2"/>
            <path d="M 280 100 L 280 240 L 360 240 Q 400 180 380 100 Z" fill="#8a3a3a" stroke="#9a3c3c" strokeWidth="2"/>
            <path d="M 200 240 Q 180 300 220 340 L 280 340 L 280 240 Z" fill="#c44848" stroke="#da6060" strokeWidth="2"/>
            <path d="M 280 240 L 280 340 L 360 340 Q 400 300 380 240 Z" fill="#a23a3a" stroke="#da6060" strokeWidth="2"/>
            {/* arteries */}
            <path d="M 220 100 Q 220 50 280 30 Q 340 50 340 100" fill="none" stroke="#da8080" strokeWidth="12"/>
            <path d="M 260 100 Q 260 60 300 50" fill="none" stroke="#6a8ebc" strokeWidth="10"/>
            {/* masks */}
            <rect x="250" y="140" width="90" height="50" rx="6" fill="rgba(85,196,214,0.4)" stroke="var(--sky-400)" strokeWidth="2" strokeDasharray="4 3"/>
            <text x="295" y="172" fontSize="18" fill="var(--sky-400)" textAnchor="middle" fontFamily="var(--font-mono)" fontWeight="600">?</text>
            <rect x="210" y="260" width="80" height="40" rx="6" fill="rgba(120,120,140,0.25)" stroke="rgba(200,200,210,0.4)" strokeWidth="1.5"/>
            <rect x="300" y="260" width="80" height="40" rx="6" fill="rgba(120,120,140,0.25)" stroke="rgba(200,200,210,0.4)" strokeWidth="1.5"/>
          </svg>
          {/* toggle pills */}
          <div style={{ position: 'absolute', bottom: 12, left: 12, display: 'flex', gap: 6 }}>
            {[1,2,3,4,5].map(n => (
              <div key={n} style={{
                width: 24, height: 24, borderRadius: 6, fontSize: 11, fontFamily: 'var(--font-mono)',
                background: n === 2 ? 'var(--sky-500)' : 'rgba(255,255,255,0.08)',
                color: n === 2 ? '#0a0b0d' : 'var(--text-muted)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600,
              }}>{n}</div>
            ))}
          </div>
        </div>
      </div>
      <div style={{ marginTop: 14, display: 'flex', gap: 10, justifyContent: 'center' }}>
        <NNKbd>space</NNKbd>
        <span style={{ fontSize: 12, color: 'var(--text-dim)', alignSelf: 'center' }}>reveal · </span>
        <NNKbd>n</NNKbd>
        <span style={{ fontSize: 12, color: 'var(--text-dim)', alignSelf: 'center' }}>next mask</span>
      </div>
    </div>
  </div>
);

const CardTypeTypeAnswer = () => (
  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
    <div style={{ width: 560 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <NNBadge tone="lime" size="sm" icon="edit">Type the answer</NNBadge>
        <NNBadge tone="neutral" size="sm">German vocab · #342</NNBadge>
      </div>
      <div style={{ padding: 36, borderRadius: 18, background: 'var(--surface)', border: '1px solid var(--border-2)' }}>
        <div style={{ fontSize: 13, color: 'var(--text-dim)', textAlign: 'center', marginBottom: 20, textTransform: 'uppercase', letterSpacing: 0.8 }}>
          English meaning
        </div>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 38, textAlign: 'center', marginBottom: 32 }}>
          neighbor
        </div>
        <div style={{
          padding: '14px 18px', borderRadius: 10, border: '1px solid var(--lime-500)',
          background: 'rgba(154,209,85,0.04)', fontSize: 18, fontFamily: 'var(--font-serif)',
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          <span>der Nachba</span>
          <span style={{ display: 'inline-block', width: 2, height: 22, background: 'var(--lime-400)', animation: 'blink 1s infinite' }}/>
          <div style={{ flex: 1 }}/>
          <NNBadge tone="neutral" size="xs">enter to check</NNBadge>
        </div>
        {/* diff preview after submission (visualized here) */}
        <div style={{ marginTop: 20, padding: 12, background: 'var(--surface-2)', borderRadius: 8, fontSize: 12, color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 10.5, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>Character-level match preview</div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 20 }}>
            <span style={{ color: 'var(--lime-400)' }}>der Nachba</span>
            <span style={{ color: 'var(--rose-400)', textDecoration: 'line-through', opacity: 0.6 }}>_</span>
            <span style={{ color: 'var(--rose-400)', background: 'rgba(232,120,138,0.12)', padding: '0 3px', borderRadius: 3 }}>r</span>
          </div>
        </div>
      </div>
    </div>
  </div>
);

const NNCardTypes = ({ variant = 'cloze' }) => {
  const Comp = { cloze: CardTypeCloze, occlusion: CardTypeImageOcclusion, type: CardTypeTypeAnswer }[variant];
  return <Comp/>;
};

// ─────────────────────────────────────────────
// ACHIEVEMENTS
// ─────────────────────────────────────────────
const NNAchievements = () => {
  const badges = [
    // streaks
    { g: 'Streaks', items: [
      { n: 'First step', d: '1 day streak', earned: true, icon: 'sparkle', tone: 'lime' },
      { n: 'Week runner', d: '7 day streak', earned: true, icon: 'flame', tone: 'amber' },
      { n: 'Thirty-something', d: '30 day streak', progress: 0.8, icon: 'flame', tone: 'amber', sub: '24 / 30' },
      { n: 'Century', d: '100 day streak', progress: 0.24, icon: 'trophy', tone: 'amber' },
      { n: 'Eternal', d: '365 day streak', progress: 0.07, icon: 'trophy', tone: 'violet' },
    ]},
    { g: 'Garden', items: [
      { n: 'Green thumb', d: 'Plant 3 decks', earned: true, icon: 'garden', tone: 'lime' },
      { n: 'Botanist', d: 'All plants to stage 3', progress: 0.67, icon: 'garden', tone: 'lime', sub: '4 / 6' },
      { n: 'Bonsai master', d: 'One plant to stage 5', earned: true, icon: 'stars', tone: 'lime' },
      { n: 'Forest', d: '10 active decks', progress: 0.6, icon: 'stack', tone: 'lime', sub: '6 / 10' },
    ]},
    { g: 'Mastery', items: [
      { n: 'Polyglot', d: '500 language cards', earned: true, icon: 'bulb', tone: 'sky' },
      { n: 'Perfectionist', d: 'Session with 100% good', earned: true, icon: 'check', tone: 'lime' },
      { n: 'Graph weaver', d: '100 cards in knowledge graph', progress: 0.42, icon: 'graph', tone: 'violet' },
      { n: 'Speed reader', d: 'Average <15s per card', locked: true, icon: 'bolt', tone: 'neutral' },
    ]},
    { g: 'Time', items: [
      { n: 'Early bird', d: 'Session before 8am', earned: true, icon: 'sparkle', tone: 'amber' },
      { n: 'Night owl', d: 'Session after 11pm', earned: true, icon: 'sparkle', tone: 'violet' },
      { n: 'Consistent', d: 'Review every day for a week at same time', progress: 0.43, icon: 'clock', tone: 'sky' },
      { n: 'Marathon', d: 'Review 200 cards in one session', locked: true, icon: 'trophy', tone: 'neutral' },
    ]},
  ];
  const earned = badges.flatMap(g => g.items).filter(b => b.earned).length;
  const total = badges.flatMap(g => g.items).length;

  return (
    <div className="nn-scroll" style={{ flex: 1, overflow: 'auto', padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
        <NNCard padding={20}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6 }}>Badges earned</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
            <div style={{ fontSize: 40, fontWeight: 600, letterSpacing: -1.2 }} className="mono">{earned}</div>
            <div style={{ fontSize: 14, color: 'var(--text-dim)' }}>of {total}</div>
            <div style={{ flex: 1 }}/>
            <NNBadge tone="amber" size="md" icon="trophy">Level 3 Botanist</NNBadge>
          </div>
          <div style={{ marginTop: 14, height: 6, background: 'var(--surface-3)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${(earned/total)*100}%`, height: '100%', background: 'linear-gradient(90deg, var(--lime-500), var(--amber-500))' }}/>
          </div>
          <div style={{ marginTop: 6, display: 'flex', fontSize: 11, color: 'var(--text-dim)' }}>
            <span>{earned}/{total}</span>
            <div style={{ flex: 1 }}/>
            <span>next milestone · Silver botanist @ 12</span>
          </div>
        </NNCard>
        <NNCard padding={20}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6 }}>XP</div>
          <div style={{ fontSize: 32, fontWeight: 600, letterSpacing: -0.8, marginTop: 4 }} className="mono">2,847</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>+184 today · to lvl 4: 653</div>
          <div style={{ marginTop: 10, height: 4, background: 'var(--surface-3)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ width: '68%', height: '100%', background: 'var(--violet-400)' }}/>
          </div>
        </NNCard>
        <NNCard padding={20}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6 }}>Rarest</div>
          <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>Bonsai master</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Only 4% of users · earned Apr 12</div>
        </NNCard>
      </div>

      {/* Badge groups */}
      {badges.map(g => (
        <div key={g.g} style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>{g.g}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
            {g.items.map(b => {
              const glowColors = { lime: '154,209,85', amber: '243,182,85', sky: '85,196,214', violet: '167,136,255', neutral: '100,100,110' };
              const rgb = glowColors[b.tone];
              return (
                <div key={b.n} style={{
                  padding: 18, borderRadius: 12, textAlign: 'center',
                  background: b.earned ? `rgba(${rgb},0.06)` : 'var(--surface)',
                  border: b.earned ? `1px solid rgba(${rgb},0.3)` : '1px solid var(--border)',
                  opacity: b.locked ? 0.4 : 1,
                  position: 'relative',
                }}>
                  <div style={{
                    width: 56, height: 56, borderRadius: '50%', margin: '0 auto 10px',
                    background: b.earned ? `radial-gradient(circle, rgba(${rgb},0.25), rgba(${rgb},0.05))` : 'var(--surface-2)',
                    border: b.earned ? `1.5px solid rgba(${rgb},0.5)` : '1.5px solid var(--border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    position: 'relative',
                  }}>
                    <NNIcon name={b.icon} size={24} color={b.earned ? `var(--${b.tone}-400)` : 'var(--text-dim)'} strokeWidth={1.8}/>
                    {b.earned && (
                      <div style={{ position: 'absolute', bottom: -2, right: -2, width: 18, height: 18, borderRadius: '50%', background: 'var(--lime-500)', border: '2px solid var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <NNIcon name="check" size={10} color="#0a0b0d" strokeWidth={3}/>
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: b.earned ? 'var(--text)' : 'var(--text-muted)' }}>{b.n}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{b.d}</div>
                  {b.progress != null && (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ height: 3, background: 'var(--surface-3)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ width: `${b.progress*100}%`, height: '100%', background: `var(--${b.tone}-500)` }}/>
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>{b.sub || `${Math.round(b.progress*100)}%`}</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

// ─────────────────────────────────────────────
// LEAGUES / FRIENDS LEADERBOARD
// ─────────────────────────────────────────────
const NNLeagues = () => {
  const leagues = ['Seed', 'Sprout', 'Sapling', 'Oak', 'Redwood', 'Ancient'];
  const rows = [
    { rank: 1, n: 'Mira',   xp: 3420, streak: 31, me: false, tone: 'amber', avatar: '#f3b655', initials: 'M' },
    { rank: 2, n: 'Kenji',  xp: 3180, streak: 28, me: false, tone: 'amber', avatar: '#e8788a', initials: 'K' },
    { rank: 3, n: 'Lena',   xp: 2960, streak: 22, me: false, tone: 'amber', avatar: '#a788ff', initials: 'L' },
    { rank: 4, n: 'Alex',   xp: 2847, streak: 24, me: true,  tone: 'lime',  avatar: '#9ad155', initials: 'A' },
    { rank: 5, n: 'Jordan', xp: 2510, streak: 14, me: false, tone: 'lime',  avatar: '#55c4d6', initials: 'J' },
    { rank: 6, n: 'Priya',  xp: 2340, streak: 19, me: false, tone: 'neutral', avatar: '#fd9a86', initials: 'P' },
    { rank: 7, n: 'Sam',    xp: 2180, streak: 9,  me: false, tone: 'neutral', avatar: '#8ad6ff', initials: 'S' },
    { rank: 8, n: 'Yuki',   xp: 1920, streak: 12, me: false, tone: 'neutral', avatar: '#f5b4c5', initials: 'Y' },
    { rank: 9, n: 'Malik',  xp: 1640, streak: 6,  me: false, tone: 'rose',    avatar: '#b6cbff', initials: 'M' },
    { rank: 10,n: 'Tuna',   xp: 1420, streak: 4,  me: false, tone: 'rose',    avatar: '#d0d0d0', initials: 'T' },
  ];
  return (
    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 320px', gap: 0, overflow: 'hidden' }}>
      {/* Main */}
      <div className="nn-scroll" style={{ overflow: 'auto', padding: 24 }}>
        {/* League progression */}
        <NNCard padding={20} style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'baseline' }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6 }}>Current league</div>
              <div style={{ fontFamily: 'var(--font-serif)', fontSize: 32, letterSpacing: -0.6, marginTop: 2 }}>Sapling League</div>
            </div>
            <div style={{ flex: 1 }}/>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6 }}>Ends in</div>
              <div style={{ fontSize: 20, color: 'var(--amber-400)', fontWeight: 600 }} className="mono">3d 14h</div>
            </div>
          </div>
          {/* League ladder */}
          <div style={{ marginTop: 20, display: 'flex', gap: 4 }}>
            {leagues.map((l, i) => {
              const current = i === 2;
              const past = i < 2;
              return (
                <div key={l} style={{
                  flex: 1, padding: '10px 8px', borderRadius: 8, textAlign: 'center',
                  background: current ? 'rgba(154,209,85,0.1)' : past ? 'var(--surface-2)' : 'transparent',
                  border: current ? '1px solid var(--lime-500)' : past ? '1px solid var(--border)' : '1px solid var(--border)',
                  opacity: !current && !past ? 0.5 : 1,
                }}>
                  <div style={{ fontSize: 11, color: current ? 'var(--lime-400)' : 'var(--text-muted)', fontWeight: 500 }}>{l}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }} className="mono">{i * 500 + 1000}+ xp</div>
                </div>
              );
            })}
          </div>
        </NNCard>

        {/* Leaderboard */}
        <NNCard padding={0}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Leaderboard · this week</div>
            <NNBadge tone="lime" size="sm" style={{ marginLeft: 10 }}>Top 3 promote</NNBadge>
            <NNBadge tone="rose" size="sm" style={{ marginLeft: 4 }}>Bottom 2 demote</NNBadge>
            <div style={{ flex: 1 }}/>
            <NNBtn size="sm" variant="ghost">All time</NNBtn>
          </div>
          <div>
            {rows.map((r, i) => (
              <div key={r.rank} style={{
                display: 'grid', gridTemplateColumns: '40px 40px 1fr 100px 80px 40px',
                gap: 16, alignItems: 'center', padding: '12px 20px',
                background: r.me ? 'rgba(154,209,85,0.06)' : 'transparent',
                borderTop: i ? '1px solid var(--border)' : 'none',
                borderLeft: r.me ? '2px solid var(--lime-500)' : '2px solid transparent',
              }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: r.rank <= 3 ? 'var(--amber-400)' : r.rank >= 9 ? 'var(--rose-400)' : 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  {r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : `#${r.rank}`}
                </div>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: r.avatar, color: '#0a0b0d', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-serif)' }}>{r.initials}</div>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 500, color: r.me ? 'var(--lime-400)' : 'var(--text)' }}>
                    {r.n} {r.me && <span style={{ fontSize: 10, color: 'var(--lime-400)', fontWeight: 400, marginLeft: 4 }}>(you)</span>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{r.rank === 1 ? 'Lvl 5 · Redwood' : r.rank <= 3 ? 'Lvl 4 · Oak' : 'Lvl 3 · Botanist'}</div>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>{r.xp.toLocaleString()} xp</div>
                <div style={{ fontSize: 12, color: 'var(--amber-400)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <NNIcon name="flame" size={12} color="var(--amber-400)"/>
                  <span className="mono">{r.streak}d</span>
                </div>
                <div>
                  {r.rank <= 3 && <div style={{ width: 6, height: 24, borderRadius: 3, background: 'var(--lime-500)' }}/>}
                  {r.rank >= 9 && <div style={{ width: 6, height: 24, borderRadius: 3, background: 'var(--rose-500)' }}/>}
                </div>
              </div>
            ))}
          </div>
        </NNCard>
      </div>

      {/* Right rail: friends + challenges */}
      <aside style={{ borderLeft: '1px solid var(--border)', background: 'var(--surface)', overflow: 'auto', padding: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Friends</div>
        <NNBtn size="sm" variant="soft" icon="plus" block>Add friend</NNBtn>
        <div style={{ marginTop: 16 }}>
          {[
            { n: 'Mira',  avatar: '#f3b655', initials: 'M', streak: 31, status: 'reviewing now', live: true },
            { n: 'Kenji', avatar: '#e8788a', initials: 'K', streak: 28, status: '42 due' },
            { n: 'Lena',  avatar: '#a788ff', initials: 'L', streak: 22, status: 'grew a bamboo 🎋' },
            { n: 'Jordan',avatar: '#55c4d6', initials: 'J', streak: 14, status: 'idle 2h' },
            { n: 'Priya', avatar: '#fd9a86', initials: 'P', streak: 19, status: '98% retention' },
          ].map(f => (
            <div key={f.n} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ position: 'relative' }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: f.avatar, color: '#0a0b0d', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-serif)' }}>{f.initials}</div>
                {f.live && <div style={{ position: 'absolute', bottom: -1, right: -1, width: 10, height: 10, borderRadius: '50%', background: 'var(--lime-500)', border: '2px solid var(--surface)' }}/>}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{f.n}</div>
                <div style={{ fontSize: 11, color: f.live ? 'var(--lime-400)' : 'var(--text-dim)' }}>{f.status}</div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--amber-400)', display: 'flex', alignItems: 'center', gap: 3 }}>
                <NNIcon name="flame" size={11} color="var(--amber-400)"/>
                <span className="mono">{f.streak}</span>
              </div>
            </div>
          ))}
        </div>

        <div style={{ fontSize: 13, fontWeight: 600, marginTop: 24, marginBottom: 12 }}>Weekly challenges</div>
        {[
          { n: '500 XP this week', progress: 0.57, sub: '285 / 500' },
          { n: 'Beat Kenji in 7d', progress: 0.4, sub: '3 days left' },
          { n: 'Water every day', progress: 0.71, sub: '5 of 7' },
        ].map(c => (
          <div key={c.n} style={{ padding: '10px 12px', marginBottom: 8, borderRadius: 8, background: 'var(--surface-2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 500 }}>{c.n}</div>
              <div style={{ flex: 1 }}/>
              <div style={{ fontSize: 10, color: 'var(--text-dim)' }} className="mono">{c.sub}</div>
            </div>
            <div style={{ height: 4, background: 'var(--surface-3)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ width: `${c.progress*100}%`, height: '100%', background: 'var(--lime-500)' }}/>
            </div>
          </div>
        ))}
      </aside>
    </div>
  );
};

Object.assign(window, { NNSessionComplete, NNEmpty, NNCardTypes, NNAchievements, NNLeagues });
