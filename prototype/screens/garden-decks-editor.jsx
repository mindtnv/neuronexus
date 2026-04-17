// NeuroNexus — Garden + Decks + Editor screens (compact)

// ─────────────────────────────────────────────
// Garden — gamification / plant growing
// ─────────────────────────────────────────────
const NNGarden = ({ variant = 'grid' }) => {
  if (variant === 'terrarium') return <NNGardenTerrarium/>;
  return <NNGardenGrid/>;
};

const NNGardenGrid = () => {
  const plots = [
    { deck: 'German vocab',   stage: 4, streak: 23, mastery: 91, color: 'amber' },
    { deck: 'System Design',  stage: 3, streak: 12, mastery: 76, color: 'violet' },
    { deck: 'Rust std lib',   stage: 2, streak: 5,  mastery: 48, color: 'sky' },
    { deck: 'Cognitive bias', stage: 5, streak: 40, mastery: 95, color: 'rose' },
    { deck: 'Crypto basics',  stage: 1, streak: 2,  mastery: 22, color: 'lime' },
    { deck: 'Empty plot',     stage: 0, empty: true },
  ];
  return (
    <div className="nn-scroll" style={{ flex: 1, overflow: 'auto', padding: 32 }}>
      {/* Banner */}
      <div style={{
        padding: 24, borderRadius: 16, marginBottom: 24,
        background: 'linear-gradient(135deg, rgba(154,209,85,0.1), rgba(85,196,214,0.06))',
        border: '1px solid rgba(154,209,85,0.2)',
        display: 'flex', alignItems: 'center', gap: 24,
      }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--lime-400)', textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 600, marginBottom: 6 }}>Your garden · Level 3 Botanist</div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 40, letterSpacing: -0.8, color: 'var(--text)' }}>
            Your forest is thriving
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 8, maxWidth: 520 }}>
            Each deck grows into a plant as you review. Keep your streak alive to unlock new species and seasonal decorations.
          </div>
        </div>
        <div style={{ flex: 1 }}/>
        <div style={{ display: 'flex', gap: 18 }}>
          {[
            { l: 'Plants', v: '5' }, { l: 'Seeds', v: '3' },
            { l: 'Level', v: '3' }, { l: 'XP to 4', v: '1.2k' },
          ].map(s => (
            <div key={s.l} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 600 }} className="mono">{s.v}</div>
              <div style={{ fontSize: 10.5, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6 }}>{s.l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Plot grid */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14,
      }}>
        {plots.map((p, i) => (
          <div key={i} style={{
            padding: 18, borderRadius: 14,
            background: p.empty
              ? 'repeating-linear-gradient(135deg, var(--surface), var(--surface) 6px, var(--surface-2) 6px, var(--surface-2) 12px)'
              : 'linear-gradient(180deg, var(--surface), var(--surface-2))',
            border: p.empty ? '1px dashed var(--border-2)' : '1px solid var(--border)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
            minHeight: 240,
          }}>
            {p.empty ? (
              <>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
                  <NNIcon name="plus" size={28} color="var(--text-dim)"/>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Plant new deck</div>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 6, width: '100%' }}>
                  <NNBadge size="xs" tone={p.color}>stage {p.stage}/5</NNBadge>
                  <div style={{ flex: 1 }}/>
                  <NNBadge size="xs" icon="flame" tone="amber">{p.streak}d</NNBadge>
                </div>
                <NNPlant stage={p.stage} size={110}/>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{p.deck}</div>
                <div style={{ width: '100%', height: 4, background: 'var(--surface-3)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ width: `${p.mastery}%`, height: '100%', background: `var(--${p.color}-500)` }}/>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)' }} className="mono">{p.mastery}% mastered</div>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Achievements */}
      <div style={{ marginTop: 32 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>Achievements</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
          {[
            { n: 'First bloom', d: 'Reach stage 5', got: true, icon: 'trophy', c: 'amber' },
            { n: 'Consistent', d: '30-day streak', got: false, icon: 'flame', c: 'amber', p: '23/30' },
            { n: 'Polyglot', d: '500 lang cards', got: true, icon: 'stars', c: 'violet' },
            { n: 'Librarian', d: '1000 cards total', got: false, icon: 'stack', c: 'sky', p: '847/1000' },
          ].map((a, i) => (
            <div key={i} style={{
              padding: 14, borderRadius: 12, background: 'var(--surface)',
              border: '1px solid var(--border)', opacity: a.got ? 1 : 0.65,
              display: 'flex', gap: 10,
            }}>
              <div style={{
                width: 38, height: 38, borderRadius: 9,
                background: a.got ? `var(--${a.c}-500)` : 'var(--surface-3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <NNIcon name={a.icon} size={18} color={a.got ? '#0a0b0d' : 'var(--text-dim)'}/>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{a.n}</div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{a.d}</div>
                {a.p && <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 2 }} className="mono">{a.p}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const NNGardenTerrarium = () => (
  <div style={{
    flex: 1, padding: 32, display: 'flex', flexDirection: 'column', alignItems: 'center',
    background: 'radial-gradient(ellipse at bottom, rgba(154,209,85,0.08), var(--bg))',
    overflow: 'auto',
  }}>
    <div style={{ textAlign: 'center', marginBottom: 32, width: '100%' }}>
      <div style={{ fontFamily: 'var(--font-serif)', fontSize: 38, letterSpacing: -0.7, lineHeight: 1.1, whiteSpace: 'nowrap', marginBottom: 8 }}>
        Your terrarium
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
        A single living ecosystem. Every card reviewed waters the soil.
      </div>
    </div>
    {/* Terrarium */}
    <div style={{
      width: '100%', maxWidth: 720, height: 360, position: 'relative',
      borderRadius: 24, overflow: 'hidden',
      background: 'linear-gradient(180deg, #12171f 0%, #1b2418 70%, #2a2916 100%)',
      border: '1px solid var(--border-2)',
      boxShadow: 'var(--shadow-lg), inset 0 0 80px rgba(154,209,85,0.08)',
    }}>
      {/* ground */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 60,
        background: 'linear-gradient(180deg, #3a2817 0%, #1a0f07 100%)',
      }}/>
      {/* sun */}
      <div style={{
        position: 'absolute', top: 40, right: 60, width: 60, height: 60, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(243,182,85,0.7), rgba(243,182,85,0.1) 70%)',
      }}/>
      {/* plants */}
      <div style={{ position: 'absolute', bottom: 20, left: '8%' }}><NNPlant stage={5} size={160}/></div>
      <div style={{ position: 'absolute', bottom: 15, left: '30%' }}><NNPlant stage={3} size={120}/></div>
      <div style={{ position: 'absolute', bottom: 10, left: '50%' }}><NNPlant stage={4} size={140}/></div>
      <div style={{ position: 'absolute', bottom: 20, left: '72%' }}><NNPlant stage={2} size={100}/></div>
      {/* fireflies */}
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} style={{
          position: 'absolute',
          top: 60 + Math.sin(i) * 40 + i * 15,
          left: `${10 + i * 11}%`,
          width: 4, height: 4, borderRadius: '50%', background: 'var(--amber-400)',
          boxShadow: '0 0 10px var(--amber-400), 0 0 20px var(--amber-400)',
        }}/>
      ))}
    </div>
    {/* actions */}
    <div style={{ marginTop: 24, display: 'flex', gap: 10 }}>
      <NNBtn size="lg" variant="primary" icon="bolt">Water plants (review 42)</NNBtn>
      <NNBtn size="lg" variant="soft" icon="plus">Plant new deck</NNBtn>
      <NNBtn size="lg" variant="outline" icon="settings">Customize</NNBtn>
    </div>
    {/* weather */}
    <div style={{ marginTop: 24, display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-muted)', flexWrap: 'wrap', justifyContent: 'center' }}>
      <span style={{ whiteSpace: 'nowrap' }}>☀ sunny · great recall conditions</span>
      <span style={{ whiteSpace: 'nowrap' }}>💧 soil <span className="mono" style={{ color: 'var(--lime-400)' }}>moist</span></span>
      <span style={{ whiteSpace: 'nowrap' }}>🐛 no pests</span>
    </div>
  </div>
);

// ─────────────────────────────────────────────
// Decks screen
// ─────────────────────────────────────────────
const NNDecks = () => {
  const decks = [
    { name: 'German vocab',     c: 342, due: 18, m: 91, tag: 'amber',  updated: '2h ago' },
    { name: 'System Design',    c: 118, due: 12, m: 76, tag: 'violet', updated: 'yesterday' },
    { name: 'Rust std lib',     c: 87,  due: 8,  m: 48, tag: 'sky',    updated: '3d ago' },
    { name: 'Cognitive biases', c: 64,  due: 4,  m: 95, tag: 'rose',   updated: '1w ago' },
    { name: 'Crypto basics',    c: 42,  due: 0,  m: 22, tag: 'lime',   updated: '2w ago' },
    { name: 'French (A2)',      c: 194, due: 0,  m: 68, tag: 'sky',    updated: '1mo ago' },
  ];
  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
        <NNBtn size="sm" variant="soft" icon="grid">Grid</NNBtn>
        <NNBtn size="sm" variant="ghost" icon="stack">List</NNBtn>
        <NNBtn size="sm" variant="ghost" icon="filter">Filter</NNBtn>
        <div style={{ flex: 1 }}/>
        <NNBtn size="sm" variant="soft" icon="sparkle">Import PDF · AI</NNBtn>
        <NNBtn size="sm" variant="primary" icon="plus">New deck</NNBtn>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
        {decks.map((d, i) => (
          <NNCard key={i} padding={0} style={{ overflow: 'hidden' }}>
            <div style={{
              height: 80, background: `linear-gradient(135deg, var(--${d.tag}-500), var(--${d.tag}-600))`,
              position: 'relative', padding: 14, display: 'flex', alignItems: 'flex-end',
            }}>
              <div style={{ position: 'absolute', top: 12, right: 12 }}>
                <NNIcon name="dots" size={14} color="rgba(255,255,255,0.6)"/>
              </div>
              <div style={{ color: '#fff', fontSize: 17, fontWeight: 600, letterSpacing: -0.3, textShadow: '0 1px 3px rgba(0,0,0,0.3)' }}>
                {d.name}
              </div>
            </div>
            <div style={{ padding: 14 }}>
              <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 10.5, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6 }}>Cards</div>
                  <div style={{ fontSize: 16, fontWeight: 500 }} className="mono">{d.c}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10.5, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6 }}>Due</div>
                  <div style={{ fontSize: 16, fontWeight: 500, color: d.due ? 'var(--lime-400)' : 'var(--text-dim)' }} className="mono">{d.due}</div>
                </div>
                <div style={{ flex: 1 }}/>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 10.5, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6 }}>Mastery</div>
                  <div style={{ fontSize: 16, fontWeight: 500, color: `var(--${d.tag}-400)` }} className="mono">{d.m}%</div>
                </div>
              </div>
              <div style={{ height: 4, background: 'var(--surface-3)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ width: `${d.m}%`, height: '100%', background: `var(--${d.tag}-500)` }}/>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', marginTop: 10, fontSize: 11, color: 'var(--text-dim)' }}>
                <span>updated {d.updated}</span>
                <div style={{ flex: 1 }}/>
                {d.due > 0 && <NNBtn size="sm" variant="soft">Review →</NNBtn>}
              </div>
            </div>
          </NNCard>
        ))}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// Editor screen
// ─────────────────────────────────────────────
const NNEditor = () => (
  <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 360px', overflow: 'hidden' }}>
    <div style={{ padding: 24, overflow: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        <NNBadge tone="amber" size="sm">German vocab</NNBadge>
        <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>/</span>
        <span style={{ fontSize: 13, color: 'var(--text)' }}>Editing card #342</span>
        <div style={{ flex: 1 }}/>
        <NNBtn size="sm" variant="ghost" icon="chevl"/>
        <NNBtn size="sm" variant="ghost" icon="chevr"/>
        <NNBtn size="sm" variant="soft">Save draft</NNBtn>
        <NNBtn size="sm" variant="primary">Publish</NNBtn>
      </div>

      {/* Template picker */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        <NNBadge tone="lime" size="md">Basic</NNBadge>
        <NNBadge tone="neutral" size="md">Cloze</NNBadge>
        <NNBadge tone="neutral" size="md">Reverse</NNBadge>
        <NNBadge tone="neutral" size="md">Type-in</NNBadge>
        <NNBadge tone="neutral" size="md">Image occlusion</NNBadge>
        <NNBadge tone="neutral" size="md">Audio prompt</NNBadge>
        <NNBadge tone="violet" size="md" icon="sparkle">AI open-ended</NNBadge>
      </div>

      {/* Fields */}
      {[
        { label: 'Front', val: 'der Nachbar', large: true, serif: true },
        { label: 'Back',  val: 'the neighbor · pl. die Nachbarn', serif: true },
        { label: 'Context', val: 'Meine Nachbarn sind sehr freundlich. — My neighbors are very friendly.' },
        { label: 'Hint / Mnemonic', val: 'Nacht-bar → the night bar where you meet neighbors', violet: true },
      ].map((f, i) => (
        <div key={i} style={{ marginBottom: 14 }}>
          <div style={{
            fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase',
            letterSpacing: 0.8, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span>{f.label}</span>
            {f.violet && <NNIcon name="sparkle" size={11} color="var(--violet-400)"/>}
          </div>
          <div style={{
            padding: f.large ? '20px 18px' : '14px 16px',
            borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)',
            fontFamily: f.serif ? 'var(--font-serif)' : 'var(--font-sans)',
            fontSize: f.large ? 32 : 14, color: 'var(--text)',
            lineHeight: 1.5,
          }}>
            {f.val}
          </div>
        </div>
      ))}

      {/* Tags */}
      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>Tags · Links</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: 10, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
          <NNTag color="amber">german</NNTag>
          <NNTag color="sky">workplace</NNTag>
          <NNTag color="lime">b1</NNTag>
          <NNTag color="neutral">+ add</NNTag>
          <div style={{ width: 1, background: 'var(--border)', margin: '0 6px' }}/>
          <NNBadge size="xs" icon="link" tone="sky">der Freund</NNBadge>
          <NNBadge size="xs" icon="link" tone="sky">wohnen</NNBadge>
          <NNBadge size="xs" tone="neutral">+ link</NNBadge>
        </div>
      </div>
    </div>

    {/* Right: AI + stats */}
    <aside style={{ borderLeft: '1px solid var(--border)', background: 'var(--surface)', overflow: 'auto' }}>
      <div style={{ padding: 18, borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <NNIcon name="sparkle" size={14} color="var(--violet-400)"/>
          <div style={{ fontSize: 13, fontWeight: 600 }}>AI assistant</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <NNBtn block size="sm" variant="soft" icon="bulb">Generate mnemonic</NNBtn>
          <NNBtn block size="sm" variant="soft" icon="graph">Suggest links</NNBtn>
          <NNBtn block size="sm" variant="soft" icon="mic">Text-to-speech</NNBtn>
          <NNBtn block size="sm" variant="soft" icon="image">Pick illustration</NNBtn>
          <NNBtn block size="sm" variant="soft" icon="target">Make variations</NNBtn>
        </div>
      </div>
      <div style={{ padding: 18, borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>FSRS parameters</div>
        {[
          { l: 'Stability', v: '18.4d', c: 'lime' }, { l: 'Difficulty', v: '4.2', c: 'amber' },
          { l: 'Retrievability', v: '91%', c: 'lime' }, { l: 'Last grade', v: 'Good', c: 'lime' },
        ].map(p => (
          <div key={p.l} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 12.5 }}>
            <span style={{ color: 'var(--text-muted)' }}>{p.l}</span>
            <span className="mono" style={{ color: `var(--${p.c}-400)` }}>{p.v}</span>
          </div>
        ))}
      </div>
      <div style={{ padding: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>History · 7 reviews</div>
        <div style={{ display: 'flex', gap: 4, height: 50, alignItems: 'flex-end' }}>
          {[30, 45, 20, 60, 50, 75, 90].map((h, i) => (
            <div key={i} style={{
              flex: 1, height: `${h}%`,
              background: h > 80 ? 'var(--lime-500)' : h > 40 ? 'var(--lime-600)' : 'var(--amber-500)',
              borderRadius: 2,
            }}/>
          ))}
        </div>
      </div>
    </aside>
  </div>
);

Object.assign(window, { NNGarden, NNDecks, NNEditor });
