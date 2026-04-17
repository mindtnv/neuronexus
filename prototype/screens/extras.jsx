// NeuroNexus — Onboarding + Import PDF + Stats + Settings

// ─────────────────────────────────────────────
// ONBOARDING — 4-step flow
// ─────────────────────────────────────────────
const NNOnboarding = () => {
  const [step, setStep] = React.useState(1);
  const steps = [
    { n: 'Welcome', icon: 'sparkle' },
    { n: 'Goals', icon: 'target' },
    { n: 'Import', icon: 'stack' },
    { n: 'Plant seed', icon: 'garden' },
  ];
  return (
    <div style={{ flex: 1, display: 'flex', background: 'radial-gradient(ellipse at top, rgba(154,209,85,0.05), var(--bg))', overflow: 'hidden' }}>
      {/* Sidebar with steps */}
      <aside style={{ width: 280, padding: '40px 28px', borderRight: '1px solid var(--border)', background: 'var(--surface)' }}>
        <NNLogo size={32}/>
        <div style={{ marginTop: 40, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {steps.map((s, i) => {
            const n = i + 1;
            const done = n < step, active = n === step;
            return (
              <div key={s.n} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                borderRadius: 10, background: active ? 'var(--surface-2)' : 'transparent',
              }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: done ? 'var(--lime-500)' : active ? 'var(--surface-3)' : 'transparent',
                  border: active ? '1px solid var(--lime-500)' : '1px solid var(--border-2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: done ? '#0a0b0d' : active ? 'var(--lime-400)' : 'var(--text-dim)',
                  fontSize: 11, fontWeight: 600,
                }} className="mono">
                  {done ? <NNIcon name="check" size={14} color="#0a0b0d"/> : n}
                </div>
                <div>
                  <div style={{ fontSize: 13, color: active || done ? 'var(--text)' : 'var(--text-dim)', fontWeight: 500 }}>{s.n}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>step {n} of 4</div>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 'auto', fontSize: 11, color: 'var(--text-dim)' }}>Skip setup · you can do this later</div>
      </aside>

      {/* Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '60px 80px' }}>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 600, marginBottom: 8 }}>
          Step {step} of 4
        </div>

        {step === 1 && (
          <>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: 56, lineHeight: 1.05, letterSpacing: -1.5, marginBottom: 16 }}>
              Welcome to NeuroNexus.
            </div>
            <div style={{ fontSize: 16, color: 'var(--text-muted)', maxWidth: 600, lineHeight: 1.55, marginBottom: 40 }}>
              Build a garden from what you're learning. Every card you review is a drop of water. Every streak is a bloom.
              Let's get you set up in under a minute.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 480 }}>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.8 }}>Your name</div>
              <div style={{ padding: '14px 16px', border: '1px solid var(--border-2)', borderRadius: 10, background: 'var(--surface)', fontSize: 16 }}>
                Alex<span style={{ background: 'var(--lime-400)', width: 2, height: 18, display: 'inline-block', marginLeft: 2, verticalAlign: 'middle' }}/>
              </div>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: 48, lineHeight: 1.1, letterSpacing: -1.2, marginBottom: 12 }}>
              What are you learning?
            </div>
            <div style={{ fontSize: 15, color: 'var(--text-muted)', maxWidth: 560, marginBottom: 32 }}>
              Pick anything — we'll tune the SRS and suggest starter decks.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, maxWidth: 680 }}>
              {[
                { n: 'Languages', d: 'vocab · grammar', c: 'amber-500', tint: 'rgba(243,182,85,0.08)', active: true },
                { n: 'Medicine', d: 'anat · pharm', c: 'rose-500', tint: 'rgba(232,120,138,0.08)' },
                { n: 'CS / Tech', d: 'algorithms · systems', c: 'violet-500', tint: 'rgba(167,136,255,0.08)', active: true },
                { n: 'Law', d: 'cases · statutes', c: 'sky-500', tint: 'rgba(85,196,214,0.08)' },
                { n: 'Math', d: 'proofs · formulas', c: 'lime-500', tint: 'rgba(154,209,85,0.08)' },
                { n: 'Other', d: 'custom topic', c: 'text-dim', tint: 'transparent' },
              ].map(c => (
                <div key={c.n} style={{
                  padding: 16, borderRadius: 12,
                  background: c.active ? c.tint : 'var(--surface)',
                  border: c.active ? `1px solid var(--${c.c})` : '1px solid var(--border)',
                }}>
                  <div style={{ width: 28, height: 28, borderRadius: 7, background: `var(--${c.c})`, opacity: c.active ? 1 : 0.3, marginBottom: 10 }}/>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{c.n}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-dim)', marginTop: 2 }}>{c.d}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 32, maxWidth: 500 }}>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>Daily goal</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {['10 min', '20 min', '30 min', '60 min'].map((g, i) => (
                  <div key={g} style={{
                    flex: 1, padding: '10px 12px', borderRadius: 10, textAlign: 'center',
                    background: i === 1 ? 'var(--lime-500)' : 'var(--surface)',
                    color: i === 1 ? '#0a0b0d' : 'var(--text)',
                    border: i === 1 ? '1px solid var(--lime-500)' : '1px solid var(--border)',
                    fontSize: 13, fontWeight: 500,
                  }}>{g}</div>
                ))}
              </div>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: 48, lineHeight: 1.1, letterSpacing: -1.2, marginBottom: 12 }}>
              Bring your existing cards.
            </div>
            <div style={{ fontSize: 15, color: 'var(--text-muted)', maxWidth: 560, marginBottom: 24 }}>
              Anki .apkg, CSV, or just a PDF — we'll turn notes into cards for you.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, maxWidth: 680 }}>
              {[
                { n: 'Anki .apkg', d: 'full fidelity · decks + media', icon: 'stack', recommended: true },
                { n: 'CSV / TSV', d: 'basic front/back mapping', icon: 'grid' },
                { n: 'Mochi / RemNote', d: 'automatic converter', icon: 'sync' },
              ].map(s => (
                <div key={s.n} style={{
                  padding: 16, borderRadius: 12, background: 'var(--surface)',
                  border: s.recommended ? '1px solid var(--lime-500)' : '1px solid var(--border)',
                  position: 'relative',
                }}>
                  {s.recommended && (
                    <div style={{ position: 'absolute', top: 10, right: 10, fontSize: 10, color: 'var(--lime-400)', fontWeight: 600, letterSpacing: 0.6 }}>POPULAR</div>
                  )}
                  <NNIcon name={s.icon} size={22} color="var(--text)"/>
                  <div style={{ fontSize: 14, fontWeight: 600, marginTop: 10 }}>{s.n}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-dim)', marginTop: 2 }}>{s.d}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 20, padding: 24, border: '2px dashed var(--border-2)', borderRadius: 14, textAlign: 'center', maxWidth: 680, background: 'rgba(167,136,255,0.04)' }}>
              <NNIcon name="sparkle" size={20} color="var(--violet-400)"/>
              <div style={{ fontSize: 14, fontWeight: 600, marginTop: 8, color: 'var(--violet-400)' }}>Drop a PDF here</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>AI will turn it into a deck with questions, mnemonics, and links</div>
            </div>
            <div style={{ marginTop: 14, fontSize: 12, color: 'var(--text-dim)' }}>
              Or start from scratch — skip this step
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: 48, lineHeight: 1.1, letterSpacing: -1.2, marginBottom: 12 }}>
              Plant your first seed.
            </div>
            <div style={{ fontSize: 15, color: 'var(--text-muted)', maxWidth: 560, marginBottom: 32 }}>
              Every deck grows into a plant. Pick a species for your first — you can always add more.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, maxWidth: 680 }}>
              {[
                { n: 'Fern', d: 'steady · low-drama', active: true },
                { n: 'Bamboo', d: 'fast · streak-lovers' },
                { n: 'Succulent', d: 'forgiving · few sessions' },
                { n: 'Oak', d: 'long-term · legacy decks' },
              ].map((p, i) => (
                <div key={p.n} style={{
                  padding: 14, borderRadius: 12, background: p.active ? 'rgba(154,209,85,0.08)' : 'var(--surface)',
                  border: p.active ? '1px solid var(--lime-500)' : '1px solid var(--border)',
                  textAlign: 'center',
                }}>
                  <NNPlant stage={3 + (i % 2)} size={80}/>
                  <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>{p.n}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>{p.d}</div>
                </div>
              ))}
            </div>
          </>
        )}

        <div style={{ flex: 1 }}/>
        <div style={{ display: 'flex', gap: 10, marginTop: 32 }}>
          {step > 1 && <NNBtn size="lg" variant="soft" icon="chevl" onClick={() => setStep(s => s - 1)}>Back</NNBtn>}
          <div style={{ flex: 1 }}/>
          <NNBtn size="lg" variant="primary" iconRight="chevr" onClick={() => setStep(s => Math.min(4, s + 1))}>
            {step < 4 ? 'Continue' : 'Enter NeuroNexus'}
          </NNBtn>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// IMPORT PDF → AI cards
// ─────────────────────────────────────────────
const NNImportPDF = () => (
  <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
    {/* Stepper */}
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, fontSize: 12, color: 'var(--text-muted)' }}>
      <span style={{ color: 'var(--lime-400)' }}>① Upload</span>
      <div style={{ width: 24, height: 1, background: 'var(--border-2)' }}/>
      <span style={{ color: 'var(--lime-400)' }}>② Analyze</span>
      <div style={{ width: 24, height: 1, background: 'var(--border-2)' }}/>
      <span style={{ color: 'var(--text)' }}>③ Review cards</span>
      <div style={{ width: 24, height: 1, background: 'var(--border)' }}/>
      <span>④ Save</span>
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 16 }}>
      {/* PDF preview */}
      <div>
        <NNCard padding={0}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <NNIcon name="image" size={14} color="var(--text-muted)"/>
            <div style={{ fontSize: 12.5, fontWeight: 500, flex: 1 }}>B2_Modalverben.pdf</div>
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }} className="mono">24 pp</span>
          </div>
          <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[1, 2, 3, 4].map(p => (
              <div key={p} style={{ aspectRatio: '3/4', background: '#e8e8e8', borderRadius: 4, padding: 12, position: 'relative' }}>
                <div style={{ height: 6, background: '#888', width: '60%', marginBottom: 6, borderRadius: 1 }}/>
                <div style={{ height: 3, background: '#bbb', width: '90%', marginBottom: 3 }}/>
                <div style={{ height: 3, background: '#bbb', width: '85%', marginBottom: 3 }}/>
                <div style={{ height: 3, background: '#bbb', width: '70%', marginBottom: 10 }}/>
                <div style={{ height: 4, background: '#f3b655', width: '40%', marginBottom: 4, borderRadius: 1 }}/>
                <div style={{ height: 3, background: '#bbb', width: '80%', marginBottom: 3 }}/>
                <div style={{ height: 3, background: '#bbb', width: '88%', marginBottom: 3 }}/>
                <span style={{ position: 'absolute', bottom: 4, right: 6, fontSize: 9, color: '#666' }} className="mono">p.{p}</span>
              </div>
            ))}
          </div>
        </NNCard>
        <div style={{ marginTop: 10, padding: 12, borderRadius: 10, background: 'rgba(167,136,255,0.06)', border: '1px solid rgba(167,136,255,0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <NNIcon name="sparkle" size={12} color="var(--violet-400)"/>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--violet-400)' }}>AI analysis</span>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            Detected: German B2 · 6 modal verbs · 38 example sentences · 4 grammar tables
          </div>
        </div>
      </div>

      {/* Card list */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Generated cards</div>
          <NNBadge tone="violet" size="sm" icon="sparkle">32 cards</NNBadge>
          <div style={{ flex: 1 }}/>
          <NNBtn size="sm" variant="ghost">Deselect all</NNBtn>
          <NNBtn size="sm" variant="soft">Regenerate</NNBtn>
        </div>

        {/* Settings bar */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, padding: 10, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
          <NNBadge tone="lime" size="sm">Basic</NNBadge>
          <NNBadge tone="neutral" size="sm">Cloze</NNBadge>
          <NNBadge tone="neutral" size="sm">Reverse</NNBadge>
          <div style={{ flex: 1 }}/>
          <span style={{ fontSize: 11, color: 'var(--text-dim)', alignSelf: 'center' }}>Deck:</span>
          <NNBadge tone="amber" size="sm">German vocab</NNBadge>
        </div>

        {/* List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { q: 'können', a: 'to be able to, can', ex: 'Ich kann Deutsch sprechen.', selected: true, page: 2, quality: 'good' },
            { q: 'dürfen', a: 'to be allowed to, may', ex: 'Darf ich hier rauchen?', selected: true, page: 4, quality: 'good' },
            { q: 'müssen', a: 'to have to, must', ex: 'Du musst das machen.', selected: true, page: 6, quality: 'good' },
            { q: 'sollen', a: 'to be supposed to, should', ex: 'Er soll morgen kommen.', selected: true, page: 9, quality: 'low' },
            { q: 'wollen', a: 'to want to', ex: 'Wir wollen nach Hause.', selected: false, page: 12, quality: 'good' },
            { q: 'mögen', a: 'to like', ex: 'Ich mag Kaffee.', selected: true, page: 15, quality: 'good' },
          ].map((c, i) => (
            <div key={i} style={{
              padding: 14, borderRadius: 10,
              background: c.selected ? 'var(--surface)' : 'var(--surface-2)',
              border: c.selected ? '1px solid var(--lime-500)' : '1px solid var(--border)',
              opacity: c.selected ? 1 : 0.55,
              display: 'flex', alignItems: 'flex-start', gap: 12,
            }}>
              <div style={{
                width: 18, height: 18, borderRadius: 5, marginTop: 2,
                background: c.selected ? 'var(--lime-500)' : 'var(--surface-3)',
                border: c.selected ? 'none' : '1px solid var(--border-2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>{c.selected && <NNIcon name="check" size={12} color="#0a0b0d"/>}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ fontFamily: 'var(--font-serif)', fontSize: 20, color: 'var(--text)' }}>{c.q}</div>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>→ {c.a}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4, fontStyle: 'italic' }}>{c.ex}</div>
              </div>
              <NNBadge tone={c.quality === 'good' ? 'lime' : 'amber'} size="xs">{c.quality === 'good' ? 'high quality' : 'needs edit'}</NNBadge>
              <span style={{ fontSize: 10.5, color: 'var(--text-dim)' }} className="mono">p.{c.page}</span>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 20, display: 'flex', gap: 10, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <NNBtn size="lg" variant="soft" icon="chevl">Back</NNBtn>
          <div style={{ flex: 1 }}/>
          <span style={{ alignSelf: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
            <span style={{ color: 'var(--text)' }}>5</span> of 6 cards selected
          </span>
          <NNBtn size="lg" variant="primary" iconRight="arrow">Save to deck · 5 cards</NNBtn>
        </div>
      </div>
    </div>
  </div>
);

// ─────────────────────────────────────────────
// STATS / ANALYTICS
// ─────────────────────────────────────────────
const NNStats = () => {
  // simple sparkline
  const line = (vals, w = 100, h = 30, color = 'var(--lime-400)') => {
    const max = Math.max(...vals), min = Math.min(...vals);
    const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * w},${h - ((v - min) / (max - min || 1)) * h}`).join(' ');
    return <svg width={w} height={h}><polyline points={pts} fill="none" stroke={color} strokeWidth="1.5"/></svg>;
  };
  return (
    <div className="nn-scroll" style={{ flex: 1, overflow: 'auto', padding: 24 }}>
      {/* Top stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        {[
          { l: 'Retention', v: '93%', sub: '+2.1% vs last month', c: 'lime', trend: [80,82,78,85,88,90,93] },
          { l: 'Reviews today', v: '184', sub: '42 of 42 done', c: 'lime', trend: [40,80,100,120,150,180,184] },
          { l: 'Avg ease', v: '2.41', sub: 'steady', c: 'sky', trend: [2.3,2.35,2.38,2.4,2.4,2.41,2.41] },
          { l: 'Time this week', v: '3h 12m', sub: '~28 min/day', c: 'amber', trend: [10,22,35,40,28,45,32] },
        ].map(s => (
          <NNCard key={s.l} padding={16}>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6 }}>{s.l}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 6 }}>
              <div style={{ fontSize: 28, fontWeight: 600, color: 'var(--text)' }} className="mono">{s.v}</div>
              <div style={{ flex: 1 }}/>
              {line(s.trend, 80, 30, `var(--${s.c}-400)`)}
            </div>
            <div style={{ fontSize: 11, color: `var(--${s.c}-400)`, marginTop: 4 }}>{s.sub}</div>
          </NNCard>
        ))}
      </div>

      {/* Retention curve + distribution */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: 16 }}>
        <NNCard padding={20}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Retention over time</div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>Target <span className="mono" style={{ color: 'var(--lime-400)' }}>90%</span> · actual <span className="mono" style={{ color: 'var(--lime-400)' }}>93%</span></div>
            </div>
            <div style={{ flex: 1 }}/>
            <div style={{ display: 'flex', gap: 4 }}>
              {['7D','30D','90D','1Y'].map((r, i) => (
                <NNBadge key={r} size="sm" tone={i === 1 ? 'lime' : 'neutral'}>{r}</NNBadge>
              ))}
            </div>
          </div>
          {/* chart */}
          <svg viewBox="0 0 600 200" style={{ width: '100%', height: 200 }}>
            {/* grid */}
            {[0, 1, 2, 3, 4].map(i => (
              <line key={i} x1="0" y1={i * 40 + 20} x2="600" y2={i * 40 + 20} stroke="var(--border)" strokeWidth="0.5"/>
            ))}
            {/* target line */}
            <line x1="0" y1="40" x2="600" y2="40" stroke="var(--lime-600)" strokeDasharray="4 4" strokeWidth="1"/>
            <text x="595" y="36" fontSize="10" fill="var(--lime-400)" textAnchor="end" fontFamily="var(--font-mono)">target 90%</text>
            {/* data */}
            <path d="M 0 80 Q 80 70 120 60 T 240 45 T 360 35 T 480 30 T 600 25"
              fill="none" stroke="var(--lime-500)" strokeWidth="2.5"/>
            <path d="M 0 80 Q 80 70 120 60 T 240 45 T 360 35 T 480 30 T 600 25 L 600 200 L 0 200 Z"
              fill="url(#areaG)" opacity="0.3"/>
            <defs>
              <linearGradient id="areaG" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#9ad155"/>
                <stop offset="1" stopColor="#9ad155" stopOpacity="0"/>
              </linearGradient>
            </defs>
            {/* labels */}
            {['Mar 18','Mar 25','Apr 1','Apr 8','Apr 15'].map((t, i) => (
              <text key={t} x={i * 150 + 10} y="195" fontSize="10" fill="var(--text-dim)" fontFamily="var(--font-mono)">{t}</text>
            ))}
          </svg>
        </NNCard>

        <NNCard padding={20}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Grade distribution</div>
          {[
            { l: 'Again', n: 68,  total: 1284, c: 'rose' },
            { l: 'Hard',  n: 196, total: 1284, c: 'amber' },
            { l: 'Good',  n: 864, total: 1284, c: 'lime' },
            { l: 'Easy',  n: 156, total: 1284, c: 'sky' },
          ].map(g => (
            <div key={g.l} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', fontSize: 12, marginBottom: 4 }}>
                <span style={{ color: 'var(--text)', flex: 1 }}>{g.l}</span>
                <span className="mono" style={{ color: `var(--${g.c}-400)` }}>{Math.round(g.n/g.total*100)}%</span>
                <span style={{ width: 48, textAlign: 'right', color: 'var(--text-dim)' }} className="mono">{g.n}</span>
              </div>
              <div style={{ height: 5, background: 'var(--surface-3)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${g.n/g.total*100}%`, height: '100%', background: `var(--${g.c}-500)` }}/>
              </div>
            </div>
          ))}
        </NNCard>
      </div>

      {/* Per-deck breakdown */}
      <NNCard padding={0}>
        <div style={{ padding: '14px 20px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Per-deck performance</div>
          <div style={{ flex: 1 }}/>
          <NNBtn size="sm" variant="ghost" icon="filter">Filter</NNBtn>
        </div>
        <div>
          {[
            { name: 'German vocab',    cards: 342, ret: 91, ease: 2.4, time: '14m', c: 'amber' },
            { name: 'System Design',   cards: 118, ret: 76, ease: 1.9, time: '8m',  c: 'violet' },
            { name: 'Rust std lib',    cards: 87,  ret: 48, ease: 1.6, time: '6m',  c: 'sky' },
            { name: 'Cognitive biases',cards: 64,  ret: 95, ease: 2.8, time: '3m',  c: 'rose' },
            { name: 'Crypto basics',   cards: 42,  ret: 22, ease: 1.4, time: '2m',  c: 'lime' },
          ].map((d, i) => (
            <div key={d.name} style={{
              padding: '12px 20px', display: 'grid', gridTemplateColumns: '1fr 80px 120px 80px 80px',
              gap: 20, alignItems: 'center', borderTop: i ? '1px solid var(--border)' : 'none', fontSize: 12.5,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 6, height: 24, borderRadius: 2, background: `var(--${d.c}-500)` }}/>
                <span style={{ color: 'var(--text)', fontWeight: 500 }}>{d.name}</span>
              </div>
              <span className="mono" style={{ color: 'var(--text-muted)', textAlign: 'right' }}>{d.cards} cards</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, height: 5, background: 'var(--surface-3)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${d.ret}%`, height: '100%', background: d.ret > 80 ? 'var(--lime-500)' : d.ret > 50 ? 'var(--amber-500)' : 'var(--rose-500)' }}/>
                </div>
                <span className="mono" style={{ fontSize: 11, color: d.ret > 80 ? 'var(--lime-400)' : d.ret > 50 ? 'var(--amber-400)' : 'var(--rose-400)', width: 30, textAlign: 'right' }}>{d.ret}%</span>
              </div>
              <span className="mono" style={{ color: 'var(--text-muted)', textAlign: 'right' }}>ease {d.ease}</span>
              <span className="mono" style={{ color: 'var(--text-muted)', textAlign: 'right' }}>{d.time}</span>
            </div>
          ))}
        </div>
      </NNCard>

      {/* Forgetting curve + hour heatmap */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 16 }}>
        <NNCard padding={20}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Forgetting curve</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-dim)', marginBottom: 14 }}>Your personalized memory decay (FSRS-5 stability)</div>
          <svg viewBox="0 0 400 160" style={{ width: '100%', height: 160 }}>
            <path d="M 0 20 Q 60 40 120 70 T 240 110 T 400 140"
              fill="none" stroke="var(--violet-400)" strokeWidth="2"/>
            <path d="M 0 30 Q 60 60 120 95 T 240 135 T 400 155"
              fill="none" stroke="var(--rose-400)" strokeWidth="1.5" strokeDasharray="3 3"/>
            {/* legend */}
            <circle cx="10" cy="155" r="3" fill="var(--violet-400)"/>
            <text x="18" y="159" fontSize="10" fill="var(--text-muted)">you (stability 18d)</text>
            <circle cx="140" cy="155" r="3" fill="var(--rose-400)"/>
            <text x="148" y="159" fontSize="10" fill="var(--text-muted)">avg user (12d)</text>
          </svg>
        </NNCard>

        <NNCard padding={20}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Best time of day</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-dim)', marginBottom: 14 }}>Retention by hour — review at your peak</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(24, 1fr)', gap: 2 }}>
            {Array.from({ length: 24 }).map((_, h) => {
              const v = Math.sin((h - 8) * 0.4) * 0.5 + 0.5;
              return <div key={h} style={{ height: 32, background: `rgba(154,209,85,${0.1 + v * 0.7})`, borderRadius: 2 }}/>;
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 10, color: 'var(--text-dim)' }} className="mono">
            <span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>24h</span>
          </div>
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)' }}>
            Peak: <span style={{ color: 'var(--lime-400)' }} className="mono">9–11am</span> · retention <span className="mono" style={{ color: 'var(--text)' }}>96%</span>
          </div>
        </NNCard>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// SETTINGS — FSRS + algorithm tuning
// ─────────────────────────────────────────────
const NNSettings = () => (
  <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '220px 1fr', overflow: 'hidden' }}>
    {/* Sub-nav */}
    <aside style={{ borderRight: '1px solid var(--border)', padding: '16px 10px', overflow: 'auto' }}>
      {[
        { g: 'Account', items: ['Profile', 'Workspaces', 'Billing'] },
        { g: 'Learning', items: ['Algorithm (FSRS)', 'Daily goals', 'Card defaults', 'AI assistant'] },
        { g: 'Appearance', items: ['Theme', 'Density', 'Sounds'] },
        { g: 'System', items: ['Sync', 'API tokens', 'Import / Export', 'Shortcuts'] },
      ].map(g => (
        <div key={g.g} style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 10.5, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.8, padding: '4px 10px', marginBottom: 4 }}>{g.g}</div>
          {g.items.map(i => {
            const active = i === 'Algorithm (FSRS)';
            return (
              <div key={i} style={{
                padding: '7px 10px', borderRadius: 7, fontSize: 12.5,
                background: active ? 'var(--surface-3)' : 'transparent',
                color: active ? 'var(--text)' : 'var(--text-muted)',
                fontWeight: active ? 500 : 400,
              }}>{i}</div>
            );
          })}
        </div>
      ))}
    </aside>

    {/* Main */}
    <div className="nn-scroll" style={{ overflow: 'auto', padding: '28px 40px' }}>
      <div style={{ fontFamily: 'var(--font-serif)', fontSize: 32, letterSpacing: -0.6, marginBottom: 4 }}>Algorithm (FSRS-5)</div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 24, maxWidth: 600 }}>
        The Free Spaced Repetition Scheduler v5 tuned to your data. Anki compatibility is preserved for imports.
      </div>

      {/* Desired retention */}
      <div style={{ padding: 20, borderRadius: 14, background: 'var(--surface)', border: '1px solid var(--border)', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Desired retention</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>How often you want to remember. Higher = more reviews.</div>
          </div>
          <div style={{ flex: 1 }}/>
          <div style={{ fontSize: 32, fontWeight: 600, color: 'var(--lime-400)', letterSpacing: -1 }} className="mono">90%</div>
        </div>
        <div style={{ height: 6, background: 'var(--surface-3)', borderRadius: 3, position: 'relative', marginTop: 16 }}>
          <div style={{ height: '100%', width: '73%', background: 'linear-gradient(to right, var(--rose-500), var(--amber-500), var(--lime-500))', borderRadius: 3 }}/>
          <div style={{ position: 'absolute', top: -5, left: '73%', width: 16, height: 16, borderRadius: '50%', background: 'var(--lime-500)', border: '2px solid var(--bg)', transform: 'translateX(-50%)' }}/>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 10.5, color: 'var(--text-dim)' }} className="mono">
          <span>70% (relaxed)</span><span>85%</span><span>90% · typical</span><span>95%</span><span>99% (hardcore)</span>
        </div>
        <div style={{ marginTop: 12, padding: 10, borderRadius: 8, background: 'rgba(154,209,85,0.06)', fontSize: 12, color: 'var(--text-muted)' }}>
          <span style={{ color: 'var(--lime-400)' }}>● Estimated workload:</span> ~28 min/day, 1,284 reviews/month at current deck size.
        </div>
      </div>

      {/* FSRS weights */}
      <div style={{ padding: 20, borderRadius: 14, background: 'var(--surface)', border: '1px solid var(--border)', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>FSRS weights · 19 parameters</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Auto-optimized from your review history · last run 2 days ago</div>
          </div>
          <div style={{ flex: 1 }}/>
          <NNBtn size="sm" variant="soft" icon="sync">Re-optimize</NNBtn>
        </div>
        <div style={{
          padding: '12px 14px', borderRadius: 8, background: 'var(--ink-950)',
          fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text-muted)',
          lineHeight: 1.6, overflowX: 'auto', whiteSpace: 'nowrap',
        }}>
          <span style={{ color: 'var(--text-dim)' }}>w = [</span>
          <span style={{ color: 'var(--lime-400)' }}>0.4072, 1.1829, 3.1262, 15.4722, 7.2102, 0.5316, 1.0651, 0.0234, </span>
          <br/>
          <span style={{ color: 'var(--lime-400)' }}>1.616, 0.1544, 1.0824, 1.9813, 0.0953, 0.2975, 2.2042, 0.2407, </span>
          <br/>
          <span style={{ color: 'var(--lime-400)' }}>2.9466, 0.5034, 0.6567</span>
          <span style={{ color: 'var(--text-dim)' }}>]</span>
        </div>
        <div style={{ display: 'flex', gap: 18, marginTop: 12, fontSize: 11.5, color: 'var(--text-muted)' }}>
          <span>Log loss <span className="mono" style={{ color: 'var(--lime-400)' }}>0.312</span></span>
          <span>RMSE(bins) <span className="mono" style={{ color: 'var(--lime-400)' }}>0.041</span></span>
          <span>Reviews <span className="mono" style={{ color: 'var(--text)' }}>12,847</span></span>
          <div style={{ flex: 1 }}/>
          <NNBtn size="sm" variant="ghost">Manual edit</NNBtn>
        </div>
      </div>

      {/* More toggles */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {[
          { t: 'Interleaving', d: 'Mix cards from different decks in one session', on: true },
          { t: 'Fuzz factor', d: 'Randomize intervals ±10% to avoid clustering', on: true },
          { t: 'Lapse steps', d: 'Re-learning sequence for forgotten cards', v: '10m · 1d · 3d' },
          { t: 'Max interval', d: 'Cap the longest interval between reviews', v: '180d' },
          { t: 'Enable AI hints', d: 'Show mnemonics and context during review', on: true },
          { t: 'Siblings burying', d: 'Postpone cards with the same note for 1 day', on: true },
          { t: 'Time-of-day bias', d: 'Schedule harder cards at your peak hours', on: false },
          { t: 'Graph-aware scheduling', d: 'Co-schedule linked cards on same day', on: true, beta: true },
        ].map((o, i) => (
          <div key={i} style={{ padding: '14px 16px', borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                {o.t}
                {o.beta && <NNBadge tone="violet" size="xs">beta</NNBadge>}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-dim)', marginTop: 2 }}>{o.d}</div>
            </div>
            {o.v != null ? (
              <span className="mono" style={{ fontSize: 12, color: 'var(--text)', background: 'var(--surface-2)', padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)' }}>{o.v}</span>
            ) : (
              <div style={{
                width: 36, height: 20, borderRadius: 10, flexShrink: 0,
                background: o.on ? 'var(--lime-500)' : 'var(--surface-3)',
                position: 'relative', transition: 'all 180ms',
              }}>
                <div style={{
                  position: 'absolute', top: 2, left: o.on ? 18 : 2,
                  width: 16, height: 16, borderRadius: '50%', background: '#fff',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
                }}/>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* API + Danger */}
      <div style={{ marginTop: 24, padding: 20, borderRadius: 14, background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Public API</div>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 14 }}>Build your own flows · fully documented REST + webhooks</div>
        <div style={{
          padding: '10px 12px', borderRadius: 8, background: 'var(--ink-950)',
          fontFamily: 'var(--font-mono)', fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ color: 'var(--lime-400)' }}>sk_live_</span>
          <span style={{ color: 'var(--text-muted)', letterSpacing: 2 }}>•••••••••••••••••••••••</span>
          <span style={{ color: 'var(--lime-400)' }}>a3f2</span>
          <div style={{ flex: 1 }}/>
          <NNBtn size="sm" variant="ghost">Copy</NNBtn>
          <NNBtn size="sm" variant="ghost">Rotate</NNBtn>
        </div>
      </div>
    </div>
  </div>
);

Object.assign(window, { NNOnboarding, NNImportPDF, NNStats, NNSettings });
