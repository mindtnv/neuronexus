// NeuroNexus — AI Tutor drawer
// Side panel that opens from the sparkle button in review.
// Uses window.claude.complete for real responses.

const CARD_CONTEXT = {
  front: 'der Nachbar',
  back: 'the neighbor',
  deck: 'German vocab',
  phonetic: '/ˈnaːx.baːɐ̯/',
  tags: ['B1', 'noun', 'people'],
  mnemonic: 'Nacht-bar — the night bar where you meet neighbors.',
};

const SYSTEM_PROMPT = `You are an expert language tutor embedded in a spaced-repetition app called NeuroNexus. 
The user is studying German vocabulary. The current card is:
- Front: "${CARD_CONTEXT.front}" (${CARD_CONTEXT.phonetic})  
- Back: "${CARD_CONTEXT.back}"
- Tags: ${CARD_CONTEXT.tags.join(', ')}
- Mnemonic: "${CARD_CONTEXT.mnemonic}"

Answer questions concisely — 2–4 sentences max. Use examples where helpful. 
Format: plain text only, no markdown headers. Occasional German examples are welcome.`;

const QUICK_PROMPTS = [
  'Why the article "der"?',
  'Give me 3 example sentences',
  'Related words I should know',
  'When is it used formally vs casually?',
];

const TutorMsg = ({ role, content, loading }) => {
  const isAI = role === 'assistant';
  return (
    <div style={{
      display: 'flex', gap: 10, alignItems: 'flex-start',
      flexDirection: isAI ? 'row' : 'row-reverse',
      marginBottom: 14,
    }}>
      {/* Avatar */}
      <div style={{
        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
        background: isAI ? 'linear-gradient(135deg, var(--violet-600), var(--lime-600))' : 'var(--surface-3)',
        border: '1px solid var(--border-2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {isAI
          ? <NNIcon name="sparkle" size={13} color="#fff"/>
          : <NNIcon name="eye" size={13} color="var(--text-muted)"/>
        }
      </div>

      {/* Bubble */}
      <div style={{
        maxWidth: '82%',
        padding: '10px 13px',
        borderRadius: isAI ? '4px 14px 14px 14px' : '14px 4px 14px 14px',
        background: isAI ? 'var(--surface-2)' : 'rgba(154,209,85,0.1)',
        border: `1px solid ${isAI ? 'var(--border)' : 'rgba(154,209,85,0.25)'}`,
        fontSize: 13, lineHeight: 1.55, color: 'var(--text)',
      }}>
        {loading
          ? <LoadingDots/>
          : content
        }
      </div>
    </div>
  );
};

const LoadingDots = () => {
  const [frame, setFrame] = React.useState(0);
  React.useEffect(() => {
    const t = setInterval(() => setFrame(f => (f + 1) % 4), 340);
    return () => clearInterval(t);
  }, []);
  return (
    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center', height: 18 }}>
      {[0,1,2].map(i => (
        <span key={i} style={{
          width: 6, height: 6, borderRadius: '50%',
          background: 'var(--violet-400)',
          opacity: frame === i ? 1 : 0.25,
          transition: 'opacity 200ms',
        }}/>
      ))}
    </span>
  );
};

const NNAITutor = ({ onClose }) => {
  const [messages, setMessages] = React.useState([
    {
      role: 'assistant',
      content: `I see you're reviewing "der Nachbar". What would you like to explore — the grammar, usage, related vocabulary, or something else?`,
    },
  ]);
  const [input, setInput] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const scrollRef = React.useRef(null);

  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const send = async (text) => {
    const q = text || input.trim();
    if (!q || loading) return;
    setInput('');

    const next = [...messages, { role: 'user', content: q }];
    setMessages(next);
    setLoading(true);

    try {
      const history = next.map(m => ({ role: m.role, content: m.content }));
      const reply = await window.claude.complete({
        messages: [
          { role: 'user', content: SYSTEM_PROMPT + '\n\nUser question: ' + q }
        ],
      });
      setMessages(m => [...m, { role: 'assistant', content: reply }]);
    } catch(e) {
      setMessages(m => [...m, { role: 'assistant', content: 'Sorry, I couldn\'t connect right now. Try again in a moment.' }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <div style={{
      width: 340, borderLeft: '1px solid var(--border)',
      background: 'var(--surface)',
      display: 'flex', flexDirection: 'column',
      height: '100%', overflow: 'hidden',
      animation: 'tutor-slide-in 220ms cubic-bezier(.22,1,.36,1)',
    }}>
      <style>{`
        @keyframes tutor-slide-in {
          from { transform: translateX(30px); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>

      {/* Header */}
      <div style={{
        padding: '14px 16px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: 10,
          background: 'linear-gradient(135deg, var(--violet-600), var(--lime-600))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <NNIcon name="sparkle" size={16} color="#fff"/>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>AI Tutor</div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>der Nachbar · German vocab</div>
        </div>
        <NNBtn size="sm" variant="ghost" icon="x" onClick={onClose}/>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="nn-scroll"
        style={{ flex: 1, overflowY: 'auto', padding: '16px 14px 8px' }}
      >
        {messages.map((m, i) => (
          <TutorMsg key={i} role={m.role} content={m.content}/>
        ))}
        {loading && <TutorMsg role="assistant" loading/>}
      </div>

      {/* Quick prompts */}
      {messages.length <= 2 && !loading && (
        <div style={{ padding: '0 14px 10px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {QUICK_PROMPTS.map(q => (
            <button key={q} onClick={() => send(q)} style={{
              padding: '6px 10px', fontSize: 11.5,
              background: 'var(--surface-2)', border: '1px solid var(--border-2)',
              borderRadius: 8, color: 'var(--text-muted)', cursor: 'pointer',
              fontFamily: 'var(--font-sans)', transition: 'all 120ms',
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--violet-500)'; e.currentTarget.style.color = 'var(--text)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-2)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
            >{q}</button>
          ))}
        </div>
      )}

      {/* Input */}
      <div style={{
        padding: '10px 14px 14px',
        borderTop: '1px solid var(--border)',
        display: 'flex', gap: 8, alignItems: 'flex-end',
      }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Ask anything about this card…"
          rows={2}
          style={{
            flex: 1, resize: 'none', padding: '9px 12px',
            background: 'var(--surface-2)', border: '1px solid var(--border-2)',
            borderRadius: 10, color: 'var(--text)', fontSize: 13,
            fontFamily: 'var(--font-sans)', lineHeight: 1.4, outline: 'none',
            caretColor: 'var(--violet-400)',
          }}
        />
        <button
          onClick={() => send()}
          disabled={!input.trim() || loading}
          style={{
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            background: input.trim() && !loading ? 'var(--violet-500)' : 'var(--surface-3)',
            border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: input.trim() && !loading ? 'pointer' : 'default',
            transition: 'background 150ms',
          }}
        >
          <NNIcon name="arrow" size={15} color={input.trim() && !loading ? '#fff' : 'var(--text-dim)'}/>
        </button>
      </div>
    </div>
  );
};

// ─── Review + Tutor combined demo screen ───
const NNReviewWithTutor = () => {
  const [tutorOpen, setTutorOpen] = React.useState(true);
  const [revealed, setRevealed] = React.useState(true);

  const ratings = [
    { k: '1', label: 'Again', interval: '<1m', bg: 'rgba(232,120,138,0.12)', hue: 'var(--rose-500)' },
    { k: '2', label: 'Hard',  interval: '8m',  bg: 'rgba(243,182,85,0.12)',  hue: 'var(--amber-500)' },
    { k: '3', label: 'Good',  interval: '3d',  bg: 'rgba(154,209,85,0.12)',  hue: 'var(--lime-500)' },
    { k: '4', label: 'Easy',  interval: '9d',  bg: 'rgba(85,196,214,0.12)',  hue: 'var(--sky-500)' },
  ];

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      {/* Review column */}
      <div style={{
        flex: 1, overflow: 'auto', padding: '0 32px',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
      }}>
        <div style={{
          width: '100%', maxWidth: 640, padding: '18px 0 24px',
          display: 'flex', alignItems: 'center', gap: 16,
        }}>
          <NNBadge icon="stack" size="sm">German vocab</NNBadge>
          <div style={{ flex: 1, height: 6, background: 'var(--surface-3)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: '34%', height: '100%', background: 'var(--lime-500)' }}/>
          </div>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }} className="mono">14 / 42</span>
        </div>

        <div onClick={() => setRevealed(v => !v)} style={{
          width: '100%', maxWidth: 640, minHeight: 320,
          borderRadius: 18, background: 'var(--surface)',
          border: '1px solid var(--border)',
          padding: '32px 38px', cursor: 'pointer',
          display: 'flex', flexDirection: 'column', position: 'relative',
          boxShadow: 'var(--shadow-lg)',
        }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
            <NNBadge size="xs" tone="neutral">B1 · noun · der</NNBadge>
            <NNTag color="amber">german</NNTag>
            <div style={{ flex: 1 }}/>
            <NNBtn size="sm" variant="soft" icon="sparkle"
              style={{ color: tutorOpen ? 'var(--violet-400)' : undefined, borderColor: tutorOpen ? 'var(--violet-500)' : undefined }}
              onClick={e => { e.stopPropagation(); setTutorOpen(o => !o); }}>
              Ask AI
            </NNBtn>
          </div>

          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 52, lineHeight: 1.1, letterSpacing: -1.2 }}>
            der Nachbar
          </div>
          <div style={{ fontSize: 15, color: 'var(--text-muted)', marginTop: 10, fontStyle: 'italic' }}>
            /ˈnaːx.baːɐ̯/ · pl. die Nachbarn
          </div>

          <div style={{ margin: '22px 0', height: 1, background: 'linear-gradient(to right, transparent, var(--border-2), transparent)' }}/>

          {revealed && (
            <>
              <div style={{ fontSize: 28, fontWeight: 500, color: 'var(--lime-400)', fontFamily: 'var(--font-serif)', marginBottom: 12 }}>
                the neighbor
              </div>
              <div style={{ fontSize: 13.5, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 14, maxWidth: 500 }}>
                <span style={{ color: 'var(--text)' }}>Meine Nachbarn sind sehr freundlich.</span> — My neighbors are very friendly.
              </div>
              <div style={{ padding: '11px 14px', borderRadius: 10, background: 'rgba(167,136,255,0.07)', border: '1px solid rgba(167,136,255,0.2)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <NNIcon name="bulb" size={14} color="var(--violet-400)"/>
                <div style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  <span style={{ color: 'var(--violet-400)', fontWeight: 500 }}>Mnemonic: </span>
                  <em>Nacht-bar</em> — the night bar where you meet your neighbors.
                </div>
              </div>
            </>
          )}

          {!revealed && (
            <div style={{ fontSize: 13, color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <NNKbd>Space</NNKbd> to reveal
            </div>
          )}
        </div>

        {revealed && (
          <div style={{ width: '100%', maxWidth: 640, marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
            {ratings.map(r => (
              <button key={r.k} style={{
                padding: '14px 10px', borderRadius: 12, cursor: 'pointer',
                background: r.bg, border: `1px solid ${r.hue}`,
                color: 'var(--text)', display: 'flex', flexDirection: 'column',
                alignItems: 'flex-start', gap: 4, fontFamily: 'var(--font-sans)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                  <NNKbd>{r.k}</NNKbd>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{r.label}</span>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }} className="mono">next in {r.interval}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Tutor drawer */}
      {tutorOpen && <NNAITutor onClose={() => setTutorOpen(false)}/>}
    </div>
  );
};

Object.assign(window, { NNAITutor, NNReviewWithTutor });
