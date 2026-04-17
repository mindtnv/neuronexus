// NeuroNexus — Home screen
// Dashboard: review queue, garden preview, streak, activity, graph peek

// ─────────────────────────────────────────────
// Heatmap — GitHub-style contribution grid
// ─────────────────────────────────────────────
const NNHeatmap = () => {
  const weeks = 20, days = 7;
  const seed = (w, d) => {
    const x = Math.sin(w * 13.1 + d * 7.3) * 10000;
    return Math.floor((x - Math.floor(x)) * 5);
  };
  const colors = ['#1a1d23', 'rgba(154,209,85,0.18)', 'rgba(154,209,85,0.38)', 'rgba(154,209,85,0.6)', 'var(--lime-500)'];
  return (
    <div style={{ display: 'flex', gap: 3 }}>
      {Array.from({ length: weeks }).map((_, w) => (
        <div key={w} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {Array.from({ length: days }).map((_, d) => {
            const lvl = (w > weeks - 4 && d > 4) ? 0 : seed(w, d);
            return <div key={d} style={{ width: 11, height: 11, borderRadius: 2, background: colors[lvl] }} />;
          })}
        </div>
      ))}
    </div>
  );
};

// ─────────────────────────────────────────────
// Mini garden plant SVG (isometric, stylized)
// ─────────────────────────────────────────────
const NNPlant = ({ stage = 3, size = 80, species = 'fern' }) => {
  // stage 0-5
  const grow = stage / 5;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      {/* Pot */}
      <ellipse cx="50" cy="85" rx="22" ry="4" fill="rgba(0,0,0,0.3)"/>
      <path d="M32 72 L35 85 L65 85 L68 72 Z" fill="#5a4027" stroke="#3a2817" strokeWidth="0.8"/>
      <ellipse cx="50" cy="72" rx="18" ry="3" fill="#3a2817"/>
      {/* Soil */}
      <ellipse cx="50" cy="72" rx="16" ry="2.5" fill="#2a1d10"/>
      {stage > 0 && (
        <g opacity={Math.min(1, grow * 1.5)}>
          {species === 'fern' && (
            <>
              <path d={`M50 72 Q48 ${72 - 25 * grow} 44 ${72 - 40 * grow}`} stroke="#7bb53a" strokeWidth={2} fill="none" strokeLinecap="round"/>
              <path d={`M50 72 Q52 ${72 - 22 * grow} 56 ${72 - 38 * grow}`} stroke="#9ad155" strokeWidth={2} fill="none" strokeLinecap="round"/>
              <path d={`M50 72 Q50 ${72 - 30 * grow} 50 ${72 - 45 * grow}`} stroke="#5a8f2a" strokeWidth={2.2} fill="none" strokeLinecap="round"/>
              {stage > 2 && <>
                <ellipse cx="44" cy={72 - 38 * grow} rx="4" ry="2.5" fill="#9ad155" transform={`rotate(-40 44 ${72 - 38 * grow})`}/>
                <ellipse cx="56" cy={72 - 36 * grow} rx="4" ry="2.5" fill="#c4e78a" transform={`rotate(40 56 ${72 - 36 * grow})`}/>
                <ellipse cx="50" cy={72 - 45 * grow} rx="3" ry="2" fill="#7bb53a"/>
              </>}
              {stage >= 4 && (
                <circle cx="50" cy={72 - 48 * grow} r="3" fill="#e89a2b"/>
              )}
              {stage >= 5 && (
                <>
                  <circle cx="44" cy={72 - 40 * grow} r="2" fill="#f3b655"/>
                  <circle cx="56" cy={72 - 38 * grow} r="2" fill="#f3b655"/>
                </>
              )}
            </>
          )}
        </g>
      )}
    </svg>
  );
};

// ─────────────────────────────────────────────
// Graph mini preview (svg nodes)
// ─────────────────────────────────────────────
const NNMiniGraph = ({ width = '100%', height = 180 }) => {
  const nodes = [
    { id: 'a', x: 60, y: 90, r: 7, c: 'var(--lime-400)' },
    { id: 'b', x: 130, y: 50, r: 5, c: 'var(--sky-400)' },
    { id: 'c', x: 160, y: 120, r: 9, c: 'var(--violet-400)' },
    { id: 'd', x: 230, y: 80, r: 5, c: 'var(--amber-400)' },
    { id: 'e', x: 210, y: 150, r: 4, c: 'var(--text-muted)' },
    { id: 'f', x: 90, y: 150, r: 5, c: 'var(--rose-400)' },
    { id: 'g', x: 280, y: 50, r: 6, c: 'var(--sky-400)' },
    { id: 'h', x: 300, y: 130, r: 4, c: 'var(--text-muted)' },
  ];
  const edges = [['a','b'],['a','c'],['b','c'],['c','d'],['c','e'],['a','f'],['d','g'],['d','h'],['e','h']];
  const byId = Object.fromEntries(nodes.map(n => [n.id, n]));
  return (
    <svg width={width} height={height} viewBox="0 0 340 200" style={{ display: 'block' }}>
      {edges.map(([a,b], i) => (
        <line key={i} x1={byId[a].x} y1={byId[a].y} x2={byId[b].x} y2={byId[b].y}
          stroke="var(--border-2)" strokeWidth="1" />
      ))}
      {nodes.map(n => (
        <g key={n.id}>
          <circle cx={n.x} cy={n.y} r={n.r + 3} fill={n.c} opacity="0.15"/>
          <circle cx={n.x} cy={n.y} r={n.r} fill={n.c} stroke="var(--bg)" strokeWidth="1.5"/>
        </g>
      ))}
    </svg>
  );
};

// ─────────────────────────────────────────────
// Home screen
// ─────────────────────────────────────────────
const NNHome = () => {
  return (
    <div className="nn-scroll" style={{ flex: 1, overflow: 'auto', padding: '24px 32px 80px' }}>

      {/* Hero: today */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 16, marginBottom: 20,
      }}>
        {/* Queue card */}
        <div style={{
          padding: 24, borderRadius: 16,
          background: 'linear-gradient(140deg, var(--surface) 0%, var(--surface-2) 100%)',
          border: '1px solid var(--border)',
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', right: -40, top: -40,
            width: 200, height: 200, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(154,209,85,0.18), transparent 70%)',
          }}/>
          <div style={{
            fontSize: 11, fontWeight: 600, letterSpacing: 0.8,
            color: 'var(--lime-400)', textTransform: 'uppercase', marginBottom: 12,
          }}>Today · Apr 17</div>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 8 }}>
            <div style={{
              fontFamily: 'var(--font-serif)', fontSize: 72, lineHeight: 1,
              color: 'var(--text)', fontWeight: 400, letterSpacing: -2,
            }}>42</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 15 }}>cards due</div>
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 20, maxWidth: 420 }}>
            Est. <span className="mono" style={{ color: 'var(--text)' }}>11 min</span> · 28 review,
            9 learning, <span style={{ color: 'var(--amber-400)' }}>5 critical</span> (forgetting &gt; 60%)
          </div>

          {/* Progress segments */}
          <div style={{ display: 'flex', gap: 2, marginBottom: 20, height: 6, borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ flex: 28, background: 'var(--lime-500)' }}/>
            <div style={{ flex: 9, background: 'var(--violet-500)' }}/>
            <div style={{ flex: 5, background: 'var(--amber-500)' }}/>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <NNBtn size="lg" variant="primary" icon="bolt">Start review</NNBtn>
            <NNBtn size="lg" variant="outline" icon="sparkle">AI generate from queue</NNBtn>
            <div style={{ flex: 1 }}/>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-dim)', fontSize: 12 }}>
              <NNIcon name="clock" size={13}/> last session 2h ago
            </div>
          </div>
        </div>

        {/* Streak + XP card */}
        <div style={{
          padding: 20, borderRadius: 16, background: 'var(--surface)',
          border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 14,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>Streak · Level 3 Botanist</span>
            <NNBadge tone="amber" size="sm" icon="flame">23 days</NNBadge>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 16,
            padding: '4px 0',
          }}>
            <NNPlant stage={3} size={80}/>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 3 }}>Daily goal</div>
              <div style={{ fontSize: 22, fontWeight: 600, color: 'var(--text)', letterSpacing: -0.5 }}>
                <span className="mono">18</span>
                <span style={{ color: 'var(--text-dim)', fontSize: 14 }}> / 30 min</span>
              </div>
              <div style={{
                marginTop: 8, height: 6, borderRadius: 3, background: 'var(--surface-3)', overflow: 'hidden',
              }}>
                <div style={{ width: '60%', height: '100%', background: 'var(--lime-500)' }}/>
              </div>
            </div>
          </div>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8,
            padding: '12px 0 4px', borderTop: '1px solid var(--border)',
          }}>
            {[
              { v: '847', l: 'cards' },
              { v: '93%', l: 'retention' },
              { v: '2.4k', l: 'XP' },
            ].map(s => (
              <div key={s.l}>
                <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }} className="mono">{s.v}</div>
                <div style={{ fontSize: 10.5, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.6 }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row 2: heatmap + graph peek */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 16, marginBottom: 20 }}>
        <NNCard padding={20}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Activity</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                <span className="mono" style={{ color: 'var(--lime-400)' }}>1,284</span> reviews this month · best day <span className="mono">Thu</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <NNBadge size="sm" tone="neutral">Reviews</NNBadge>
              <NNBadge size="sm">New</NNBadge>
            </div>
          </div>
          <NNHeatmap/>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginTop: 14, fontSize: 11, color: 'var(--text-dim)',
          }}>
            <span className="mono">Oct</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              less
              {['#1a1d23','rgba(154,209,85,0.25)','rgba(154,209,85,0.5)','var(--lime-500)'].map((c, i) => (
                <div key={i} style={{ width: 10, height: 10, borderRadius: 2, background: c }}/>
              ))}
              more
            </div>
            <span className="mono">Today</span>
          </div>
        </NNCard>

        <NNCard padding={20}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Knowledge graph</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                847 nodes · 2,103 links · 4 clusters
              </div>
            </div>
            <NNBtn size="sm" variant="ghost" iconRight="arrow">Open</NNBtn>
          </div>
          <div style={{ margin: '4px -4px -4px' }}>
            <NNMiniGraph height={170}/>
          </div>
        </NNCard>
      </div>

      {/* Row 3: Upcoming + AI suggestions */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <NNCard padding={0}>
          <div style={{
            padding: '16px 20px 12px', borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Forecast</div>
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>next 7 days</span>
          </div>
          <div style={{ padding: '8px 8px' }}>
            {[
              { day: 'Today',    date: 'Apr 17', n: 42, clr: 'lime' },
              { day: 'Tomorrow', date: 'Apr 18', n: 31, clr: 'lime' },
              { day: 'Saturday', date: 'Apr 19', n: 58, clr: 'amber' },
              { day: 'Sunday',   date: 'Apr 20', n: 22, clr: 'lime' },
              { day: 'Monday',   date: 'Apr 21', n: 74, clr: 'amber' },
              { day: 'Tuesday',  date: 'Apr 22', n: 19, clr: 'lime' },
              { day: 'Wednesday',date: 'Apr 23', n: 44, clr: 'lime' },
            ].map((r, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px',
                borderRadius: 8,
              }}>
                <div style={{ width: 90, fontSize: 12.5, color: 'var(--text)', fontWeight: 500 }}>{r.day}</div>
                <div style={{ width: 60, fontSize: 11.5, color: 'var(--text-dim)' }} className="mono">{r.date}</div>
                <div style={{
                  flex: 1, height: 6, background: 'var(--surface-3)', borderRadius: 3, overflow: 'hidden',
                }}>
                  <div style={{
                    width: `${(r.n / 80) * 100}%`, height: '100%',
                    background: r.clr === 'amber' ? 'var(--amber-500)' : 'var(--lime-500)',
                  }}/>
                </div>
                <div style={{ width: 32, textAlign: 'right', fontSize: 12.5, color: 'var(--text)', fontWeight: 500 }} className="mono">{r.n}</div>
              </div>
            ))}
          </div>
        </NNCard>

        <NNCard padding={0}>
          <div style={{
            padding: '16px 20px 12px', borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <NNIcon name="sparkle" size={14} color="var(--violet-400)"/>
              <div style={{ fontSize: 14, fontWeight: 600 }}>AI suggestions</div>
            </div>
            <NNBadge tone="violet" size="sm">4 new</NNBadge>
          </div>
          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              {
                t: 'Weak area detected', d: '12 cards around "mutex vs semaphore" — retention 61%',
                cta: 'Generate drill', tone: 'violet', icon: 'target',
              },
              {
                t: 'Create link', d: '"Nachbarn" ↔ "neighbor" semantic link missing',
                cta: 'Link', tone: 'sky', icon: 'link',
              },
              {
                t: 'Mnemonic ready', d: 'For "Vergeßlichkeit" — forgotten → Ver-guess-lich-keit',
                cta: 'Review', tone: 'amber', icon: 'bulb',
              },
              {
                t: 'Import PDF', d: 'Drop your "B2 Modalverben.pdf" to auto-make 30+ cards',
                cta: 'Import', tone: 'lime', icon: 'plus',
              },
            ].map((s, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'flex-start', gap: 12, padding: 12,
                borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)',
              }}>
                <div style={{
                  width: 30, height: 30, borderRadius: 7, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: `rgba(${s.tone==='violet'?'167,136,255':s.tone==='sky'?'85,196,214':s.tone==='amber'?'243,182,85':'154,209,85'},0.15)`,
                  color: `var(--${s.tone}-400)`,
                }}>
                  <NNIcon name={s.icon} size={14}/>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', marginBottom: 3 }}>{s.t}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.4 }}>{s.d}</div>
                </div>
                <NNBtn size="sm" variant="soft">{s.cta}</NNBtn>
              </div>
            ))}
          </div>
        </NNCard>
      </div>
    </div>
  );
};

Object.assign(window, { NNHome, NNPlant, NNMiniGraph, NNHeatmap });
