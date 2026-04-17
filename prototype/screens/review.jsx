// NeuroNexus — Review screen
// The core: card review session with ratings, graph context, AI help

const NNReview = ({ variant = 'classic' }) => {
  if (variant === 'focus') return <NNReviewFocus/>;
  if (variant === 'context') return <NNReviewContext/>;
  return <NNReviewClassic/>;
};

// ─────────────────────────────────────────────
// Shared: rating buttons with FSRS intervals
// ─────────────────────────────────────────────
const RatingBar = ({ compact }) => {
  const ratings = [
    { k: '1', label: 'Again', interval: '<1m',  tone: 'rose',  hue: 'var(--rose-500)',  bg: 'rgba(232,120,138,0.12)' },
    { k: '2', label: 'Hard',  interval: '8m',   tone: 'amber', hue: 'var(--amber-500)', bg: 'rgba(243,182,85,0.12)' },
    { k: '3', label: 'Good',  interval: '3d',   tone: 'lime',  hue: 'var(--lime-500)',  bg: 'rgba(154,209,85,0.12)' },
    { k: '4', label: 'Easy',  interval: '9d',   tone: 'sky',   hue: 'var(--sky-500)',   bg: 'rgba(85,196,214,0.12)' },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, width: '100%' }}>
      {ratings.map(r => (
        <button key={r.k} style={{
          padding: compact ? '12px 10px' : '16px 14px',
          borderRadius: 12, cursor: 'pointer',
          background: r.bg,
          border: `1px solid ${r.hue}`,
          color: 'var(--text)',
          display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4,
          fontFamily: 'var(--font-sans)',
          transition: 'transform 120ms ease',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
            <NNKbd>{r.k}</NNKbd>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{r.label}</span>
            <div style={{ flex: 1 }}/>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }} className="mono">
            next in {r.interval}
          </div>
        </button>
      ))}
    </div>
  );
};

// ─────────────────────────────────────────────
// Variant A: Classic — flip card, minimal
// ─────────────────────────────────────────────
const NNReviewClassic = () => {
  const [revealed, setRevealed] = React.useState(false);
  return (
    <div style={{
      flex: 1, overflow: 'auto', padding: '0 32px',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
    }}>
      {/* progress */}
      <div style={{
        width: '100%', maxWidth: 760, padding: '18px 0 24px',
        display: 'flex', alignItems: 'center', gap: 16,
      }}>
        <NNBadge icon="stack" size="sm">German vocab</NNBadge>
        <div style={{
          flex: 1, height: 6, background: 'var(--surface-3)',
          borderRadius: 3, overflow: 'hidden', display: 'flex', gap: 2,
        }}>
          <div style={{ width: '34%', background: 'var(--lime-500)' }}/>
          <div style={{ width: '8%',  background: 'var(--amber-500)' }}/>
        </div>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }} className="mono">
          14 / 42 · <span style={{ color: 'var(--lime-400)' }}>+180 XP</span>
        </span>
      </div>

      {/* Card */}
      <div
        onClick={() => setRevealed(v => !v)}
        style={{
          width: '100%', maxWidth: 760, minHeight: 380,
          borderRadius: 18, background: 'var(--surface)',
          border: '1px solid var(--border)',
          padding: '36px 44px', cursor: 'pointer',
          display: 'flex', flexDirection: 'column', position: 'relative',
          boxShadow: 'var(--shadow-lg)',
        }}>
        {/* top chips */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 28 }}>
          <NNBadge size="xs" tone="neutral">B1 · noun · der</NNBadge>
          <NNTag color="amber">german</NNTag>
          <NNTag color="sky">workplace</NNTag>
          <div style={{ flex: 1 }}/>
          <NNBadge size="xs" tone="violet" icon="sparkle">AI hint</NNBadge>
        </div>

        {/* Question */}
        <div style={{
          fontFamily: 'var(--font-serif)', fontSize: 56, lineHeight: 1.1,
          letterSpacing: -1.2, color: 'var(--text)', fontWeight: 400,
        }}>
          der Nachbar
        </div>
        <div style={{ fontSize: 16, color: 'var(--text-muted)', marginTop: 12, fontStyle: 'italic' }}>
          /ˈnaːx.baːɐ̯/ · pl. die Nachbarn
        </div>

        {/* Divider */}
        <div style={{
          margin: '28px 0', height: 1,
          background: 'linear-gradient(to right, transparent, var(--border-2), transparent)',
        }}/>

        {/* Answer */}
        {revealed ? (
          <div>
            <div style={{
              fontSize: 32, fontWeight: 500, color: 'var(--lime-400)', letterSpacing: -0.6,
              fontFamily: 'var(--font-serif)',
            }}>
              the neighbor
            </div>
            <div style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6, marginTop: 14, maxWidth: 560 }}>
              <span style={{ color: 'var(--text)' }}>Meine Nachbarn sind sehr freundlich.</span> —
              My neighbors are very friendly.
            </div>
            <div style={{
              marginTop: 18, padding: '12px 14px', borderRadius: 10,
              background: 'rgba(167,136,255,0.07)', border: '1px solid rgba(167,136,255,0.2)',
              display: 'flex', alignItems: 'flex-start', gap: 10,
            }}>
              <NNIcon name="bulb" size={14} color="var(--violet-400)"/>
              <div style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                <span style={{ color: 'var(--violet-400)', fontWeight: 500 }}>Mnemonic:</span> think
                "<i>Nacht-bar</i>" — the night bar where you meet your neighbors.
              </div>
            </div>
          </div>
        ) : (
          <div style={{
            fontSize: 14, color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <NNKbd>Space</NNKbd> to reveal answer
          </div>
        )}

        {/* Footer metadata */}
        <div style={{ flex: 1, minHeight: 20 }}/>
        <div style={{
          paddingTop: 20, marginTop: 20, borderTop: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 16, fontSize: 11.5,
          color: 'var(--text-dim)',
        }}>
          <span className="mono">last: 3d ago · ease 2.4</span>
          <span>·</span>
          <span className="mono">reps 7 · lapses 1</span>
          <span>·</span>
          <span>retention <span style={{ color: 'var(--lime-400)' }}>91%</span></span>
          <div style={{ flex: 1 }}/>
          <div style={{ display: 'flex', gap: 6 }}>
            <NNBtn size="sm" variant="ghost" icon="mic"/>
            <NNBtn size="sm" variant="ghost" icon="edit"/>
            <NNBtn size="sm" variant="ghost" icon="sparkle"/>
          </div>
        </div>
      </div>

      {/* Ratings */}
      {revealed && (
        <div style={{ width: '100%', maxWidth: 760, marginTop: 18 }}>
          <RatingBar/>
        </div>
      )}
      {!revealed && (
        <div style={{ marginTop: 18 }}>
          <NNBtn size="lg" variant="soft" onClick={() => setRevealed(true)}>Show answer · Space</NNBtn>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────
// Variant B: Focus — full-bleed zen mode, big type
// ─────────────────────────────────────────────
const NNReviewFocus = () => (
  <div style={{
    flex: 1, display: 'flex', flexDirection: 'column',
    background: 'radial-gradient(ellipse at top, rgba(154,209,85,0.04), transparent 60%), var(--bg)',
    padding: '0 32px',
  }}>
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20,
      padding: '20px 0',
    }}>
      <div style={{
        display: 'flex', gap: 3, alignItems: 'center',
      }}>
        {Array.from({length: 42}).map((_, i) => (
          <div key={i} style={{
            width: 5, height: i === 13 ? 14 : 8,
            background: i < 14 ? 'var(--lime-500)' : i === 14 ? 'var(--text)' : 'var(--surface-3)',
            borderRadius: 1,
          }}/>
        ))}
      </div>
      <span style={{ fontSize: 12, color: 'var(--text-dim)' }} className="mono">14/42</span>
    </div>

    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', textAlign: 'center', gap: 32,
    }}>
      <NNBadge tone="amber" size="sm">B1 · German → English</NNBadge>
      <div style={{
        fontFamily: 'var(--font-serif)', fontSize: 120, lineHeight: 1,
        letterSpacing: -3, color: 'var(--text)', fontWeight: 400,
      }}>
        der Nachbar
      </div>
      <div style={{ fontSize: 16, color: 'var(--text-muted)', fontStyle: 'italic' }}>
        /ˈnaːx.baːɐ̯/
      </div>
      <NNBtn size="xl" variant="soft">Reveal · Space</NNBtn>
    </div>

    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24,
      padding: '30px 0', color: 'var(--text-dim)', fontSize: 11.5,
    }}>
      <span><NNKbd>J</NNKbd> prev</span>
      <span><NNKbd>K</NNKbd> next</span>
      <span><NNKbd>E</NNKbd> edit</span>
      <span><NNKbd>G</NNKbd> graph</span>
      <span><NNKbd>ESC</NNKbd> exit</span>
    </div>
  </div>
);

// ─────────────────────────────────────────────
// Variant C: Context — card + live graph + related
// ─────────────────────────────────────────────
const NNReviewContext = () => (
  <div style={{ flex: 1, overflow: 'auto', padding: 24, display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16 }}>
    {/* Main card */}
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <NNBadge icon="stack" size="sm">German vocab</NNBadge>
        <div style={{ flex: 1, height: 4, background: 'var(--surface-3)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ width: '34%', height: '100%', background: 'var(--lime-500)' }}/>
        </div>
        <span className="mono" style={{ fontSize: 12, color: 'var(--text-muted)' }}>14/42</span>
      </div>

      <div style={{
        padding: '32px 36px', borderRadius: 16, background: 'var(--surface)',
        border: '1px solid var(--border)', minHeight: 320,
      }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
          <NNTag color="amber">german</NNTag>
          <NNTag color="sky">workplace</NNTag>
          <NNTag color="lime">b1</NNTag>
        </div>
        <div style={{
          fontFamily: 'var(--font-serif)', fontSize: 52, lineHeight: 1.1,
          letterSpacing: -1, color: 'var(--text)',
        }}>der Nachbar</div>
        <div style={{
          fontSize: 15, color: 'var(--text-muted)', marginTop: 10, fontStyle: 'italic',
        }}>/ˈnaːx.baːɐ̯/ · pl. die Nachbarn</div>

        <div style={{
          margin: '28px 0 22px', padding: '16px 18px', borderRadius: 10,
          background: 'var(--surface-2)',
        }}>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6 }} className="mono">ANSWER</div>
          <div style={{ fontSize: 26, color: 'var(--lime-400)', fontFamily: 'var(--font-serif)' }}>the neighbor</div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <NNBadge tone="neutral" size="sm" icon="mic">listen</NNBadge>
          <NNBadge tone="neutral" size="sm" icon="image">image</NNBadge>
          <NNBadge tone="neutral" size="sm" icon="sparkle">explain</NNBadge>
          <NNBadge tone="neutral" size="sm" icon="edit">edit</NNBadge>
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <RatingBar/>
      </div>
    </div>

    {/* Sidebar: graph context + related */}
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <NNCard padding={14}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          <NNIcon name="graph" size={14} color="var(--sky-400)"/>
          <span style={{ fontSize: 12, fontWeight: 600 }}>Local graph</span>
        </div>
        <NNMiniGraph height={160}/>
        <div style={{ fontSize: 11.5, color: 'var(--text-dim)', marginTop: 8 }}>
          connected to <span className="mono" style={{ color: 'var(--text)' }}>7 cards</span>
        </div>
      </NNCard>

      <NNCard padding={0}>
        <div style={{ padding: '12px 14px 8px', fontSize: 12, fontWeight: 600, borderBottom: '1px solid var(--border)' }}>
          Related cards
        </div>
        {[
          { q: 'der Freund', a: 'friend', clr: 'lime', s: 96 },
          { q: 'die Familie', a: 'family', clr: 'lime', s: 92 },
          { q: 'wohnen', a: 'to live (reside)', clr: 'amber', s: 74 },
          { q: 'das Haus', a: 'the house', clr: 'lime', s: 98 },
        ].map((c, i) => (
          <div key={i} style={{
            padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10,
            borderTop: i ? '1px solid var(--border)' : 'none',
          }}>
            <div style={{ width: 6, height: 6, borderRadius: 3, background: `var(--${c.clr}-500)` }}/>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, color: 'var(--text)' }}>{c.q}</div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{c.a}</div>
            </div>
            <span className="mono" style={{ fontSize: 11, color: `var(--${c.clr}-400)` }}>{c.s}%</span>
          </div>
        ))}
      </NNCard>

      <NNCard padding={14} style={{
        borderColor: 'rgba(167,136,255,0.25)',
        background: 'linear-gradient(180deg, rgba(167,136,255,0.06), var(--surface))',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <NNIcon name="sparkle" size={13} color="var(--violet-400)"/>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--violet-400)' }}>AI context</span>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.55 }}>
          "Nachbar" shares root with English <span style={{ color: 'var(--text)' }}>"neighbor"</span> via
          Old English <i>nēahgebūr</i> (near-dweller). <span className="mono" style={{ color: 'var(--violet-400)' }}>→ etymology card</span>
        </div>
      </NNCard>
    </div>
  </div>
);

Object.assign(window, { NNReview, RatingBar });
