'use client';

// NeuroNexus — Mobile Review Detail
// Swipe-to-grade, haptic feedback indicator, full-screen, mic button

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { NNIcon, NNTag } from '@/components/ui';
import { IOSDevice } from './ios-frame';
import { useT } from '@/lib/i18n';

// ─────────────────────────────────────────────
// Haptic ripple visual feedback
// ─────────────────────────────────────────────
const HapticRipple = ({ trigger, color }: { trigger?: number | null; color?: string }) => {
  const [visible, setVisible] = React.useState(false);
  React.useEffect(() => {
    if (!trigger) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 420);
    return () => clearTimeout(t);
  }, [trigger]);
  if (!visible) return null;
  return (
    <div style={{
      position: 'absolute', inset: 0, borderRadius: 'inherit',
      border: `2px solid ${color}`,
      animation: 'haptic-pulse 420ms ease-out forwards',
      pointerEvents: 'none', zIndex: 10,
    }}/>
  );
};

// ─────────────────────────────────────────────
// Swipe card shell
// ─────────────────────────────────────────────
const SwipeCard = ({ children, onSwipe, revealed }: { children?: React.ReactNode; onSwipe?: (dir: 'right' | 'left') => void; revealed?: boolean }) => {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = React.useState({ x: 0, dragging: false });
  const startX = useRef(0);

  const THRESHOLD = 80;

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    startX.current = e.clientX;
    setDrag({ x: 0, dragging: true });
    ref.current?.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.dragging) return;
    const dx = e.clientX - startX.current;
    setDrag({ x: dx, dragging: true });
  };
  const onPointerUp = () => {
    if (Math.abs(drag.x) > THRESHOLD) {
      onSwipe?.(drag.x > 0 ? 'right' : 'left');
    }
    setDrag({ x: 0, dragging: false });
  };

  const swipeRatio = Math.min(Math.abs(drag.x) / THRESHOLD, 1);
  const rightHint = drag.x > 20;
  const leftHint  = drag.x < -20;

  return (
    <div
      ref={ref}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={{
        flex: 1, position: 'relative', touchAction: 'none', userSelect: 'none',
        transform: `translateX(${drag.x}px) rotate(${drag.x * 0.025}deg)`,
        transition: drag.dragging ? 'none' : 'transform 300ms cubic-bezier(.34,1.56,.64,1)',
      }}
    >
      {/* RIGHT swipe hint — Good */}
      <div style={{
        position: 'absolute', top: 18, left: 20, zIndex: 5,
        opacity: rightHint ? swipeRatio : 0,
        transition: 'opacity 80ms',
        padding: '6px 14px', borderRadius: 10,
        background: 'rgba(154,209,85,0.18)', border: '2px solid var(--lime-400)',
        fontSize: 14, fontWeight: 700, color: 'var(--lime-400)', letterSpacing: 1.2,
        textTransform: 'uppercase',
      }}>{t('mobile.review.ratings.good')} ✓</div>

      {/* LEFT swipe hint — Again */}
      <div style={{
        position: 'absolute', top: 18, right: 20, zIndex: 5,
        opacity: leftHint ? swipeRatio : 0,
        transition: 'opacity 80ms',
        padding: '6px 14px', borderRadius: 10,
        background: 'rgba(232,120,138,0.18)', border: '2px solid var(--rose-400)',
        fontSize: 14, fontWeight: 700, color: 'var(--rose-400)', letterSpacing: 1.2,
        textTransform: 'uppercase',
      }}>{t('mobile.review.ratings.again')} ↺</div>

      {children}
    </div>
  );
};

// ─────────────────────────────────────────────
// Mic recording overlay
// ─────────────────────────────────────────────
const MicOverlay = ({ onClose }: { onClose?: () => void }) => {
  const t = useT();
  const [level, setLevel] = React.useState(0);
  const [secs, setSecs] = React.useState(0);
  const [transcript, setTranscript] = React.useState('');
  const WORDS = ['the neighbor', 'der Nachbar', 'jemand der nebenan wohnt'];

  React.useEffect(() => {
    const lvl = setInterval(() => setLevel(Math.random()), 80);
    const tick = setInterval(() => setSecs(s => s + 1), 1000);
    const wordTimer = setTimeout(() => setTranscript('the neighbor'), 2200);
    return () => { clearInterval(lvl); clearInterval(tick); clearTimeout(wordTimer); };
  }, []);

  const bars = Array.from({ length: 28 });

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 50,
      background: 'rgba(10,11,13,0.96)', backdropFilter: 'blur(8px)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      borderRadius: 'inherit', gap: 0,
    }}>
      {/* Waveform */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 3, height: 60, marginBottom: 24 }}>
        {bars.map((_, i) => {
          const h = 6 + Math.abs(Math.sin(i * 0.7 + level * 12)) * 46;
          return (
            <div key={i} style={{
              width: 3, height: h, borderRadius: 2,
              background: `var(--lime-${i % 3 === 0 ? '500' : '400'})`,
              opacity: 0.7 + (Math.abs(Math.sin(i * 0.9 + level * 8)) * 0.3),
              transition: 'height 80ms ease',
            }}/>
          );
        })}
      </div>

      {/* Timer */}
      <div className="mono" style={{
        fontSize: 13, color: 'var(--text-dim)', marginBottom: 16, letterSpacing: 1,
      }}>0:{String(secs).padStart(2, '0')}</div>

      {/* Transcript */}
      <div style={{
        minHeight: 44, padding: '10px 24px', borderRadius: 12,
        background: transcript ? 'rgba(154,209,85,0.08)' : 'var(--surface)',
        border: `1px solid ${transcript ? 'rgba(154,209,85,0.3)' : 'var(--border)'}`,
        marginBottom: 32, maxWidth: 280, textAlign: 'center',
        transition: 'all 250ms',
      }}>
        {transcript
          ? <span style={{ fontSize: 18, color: 'var(--lime-400)', fontFamily: 'var(--font-serif)' }}>{transcript}</span>
          : <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>{t('mobile.review.fullscreen.listening')}</span>
        }
      </div>

      {/* Mic button */}
      <div style={{
        width: 72, height: 72, borderRadius: '50%',
        background: 'var(--rose-500)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: `0 0 0 ${8 + level * 12}px rgba(209,85,102,0.15)`,
        transition: 'box-shadow 80ms',
        cursor: 'pointer', marginBottom: 20,
      }} onClick={onClose}>
        <NNIcon name="mic" size={28} color="#fff"/>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{t('mobile.review.fullscreen.micStop')}</div>
    </div>
  );
};

// ─────────────────────────────────────────────
// Full-screen review card (the main component)
// ─────────────────────────────────────────────
export const MobReviewFullscreen = () => {
  const t = useT();
  const [revealed, setRevealed] = React.useState(false);
  const [micOpen, setMicOpen] = React.useState(false);
  const [haptic, setHaptic] = React.useState<{ id: number; color: string } | null>(null);
  const [cardIdx, setCardIdx] = React.useState(0);
  const [grading, setGrading] = React.useState(false);
  const [exitDir, setExitDir] = React.useState<string | null>(null);
  const [progress, setProgress] = React.useState(14);

  const CARDS = [
    { front: 'der Nachbar', phonetic: '/ˈnaːx.baːɐ̯/', tags: [['amber','german'],['sky','b1']],
      back: 'the neighbor', mnemonic: 'Nacht-bar — the night bar where you meet neighbors.' },
    { front: 'die Unterkunft', phonetic: '/ˈʊntɐˌkʊnft/', tags: [['amber','german'],['violet','b2']],
      back: 'the accommodation', mnemonic: 'Unter + Kunft — "under-arrival" — where you land under a roof.' },
    { front: 'überwältigen', phonetic: '/ˌyːbɐˈvɛltɪɡən/', tags: [['amber','german'],['violet','c1']],
      back: 'to overwhelm', mnemonic: 'Über (over) + walten (to rule) — ruled over completely.' },
  ];

  const card = CARDS[cardIdx % CARDS.length];

  const triggerHaptic = (color: string) => {
    setHaptic({ id: Date.now(), color });
  };

  const handleGrade = (grade: string) => {
    triggerHaptic(
      grade === 'again' ? 'var(--rose-400)' :
      grade === 'hard'  ? 'var(--amber-400)' :
      grade === 'good'  ? 'var(--lime-400)' :
                          'var(--sky-400)'
    );
    setGrading(true);
    setTimeout(() => {
      setCardIdx(i => i + 1);
      setRevealed(false);
      setGrading(false);
      setProgress(p => p + 1);
    }, 320);
  };

  const handleSwipe = (dir: 'right' | 'left') => {
    handleGrade(dir === 'right' ? 'good' : 'again');
  };

  const GRADES = [
    { id: 'again', label: t('mobile.review.ratings.again'), interval: '<1m', color: 'var(--rose-400)',  bg: 'rgba(209,85,102,0.1)',  border: 'rgba(209,85,102,0.35)' },
    { id: 'hard',  label: t('mobile.review.ratings.hard'),  interval: '8m',  color: 'var(--amber-400)', bg: 'rgba(243,182,85,0.1)',  border: 'rgba(243,182,85,0.35)' },
    { id: 'good',  label: t('mobile.review.ratings.good'),  interval: '3d',  color: 'var(--lime-400)',  bg: 'rgba(154,209,85,0.1)',  border: 'rgba(154,209,85,0.35)' },
    { id: 'easy',  label: t('mobile.review.ratings.easy'),  interval: '9d',  color: 'var(--sky-400)',   bg: 'rgba(85,196,214,0.1)',  border: 'rgba(85,196,214,0.35)' },
  ];

  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      background: '#0a0b0d', color: '#eaecf1',
      fontFamily: '-apple-system, "Inter Tight", system-ui',
      position: 'relative',
    }}>
      <style>{`
        @keyframes haptic-pulse {
          0%   { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(1.06); }
        }
        @keyframes card-exit-right {
          to { transform: translateX(140%) rotate(18deg); opacity: 0; }
        }
        @keyframes card-exit-left {
          to { transform: translateX(-140%) rotate(-18deg); opacity: 0; }
        }
        @keyframes card-enter {
          from { transform: scale(0.94) translateY(12px); opacity: 0; }
          to   { transform: scale(1) translateY(0); opacity: 1; }
        }
      `}</style>

      {/* Status bar spacer */}
      <div style={{ height: 54 }}/>

      {/* Top bar */}
      <div style={{ padding: '0 16px 10px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ color: 'var(--text-muted)', lineHeight: 0 }}>
          <NNIcon name="x" size={20}/>
        </div>
        <div style={{ flex: 1, height: 5, background: 'var(--surface-3)', borderRadius: 3, overflow: 'hidden', position: 'relative' }}>
          <div style={{
            position: 'absolute', left: 0, top: 0, height: '100%',
            width: `${(progress / 42) * 100}%`,
            background: 'var(--lime-500)',
            transition: 'width 300ms ease',
          }}/>
        </div>
        <span className="mono" style={{ fontSize: 11.5, color: 'var(--text-muted)', letterSpacing: 0.2 }}>{progress}/42</span>
        <div style={{ color: 'var(--text-muted)', lineHeight: 0 }} onClick={() => setMicOpen(true)}>
          <NNIcon name="dots" size={20}/>
        </div>
      </div>

      {/* Swipe hint */}
      {!revealed && (
        <div style={{
          display: 'flex', justifyContent: 'center', gap: 14,
          marginBottom: 6,
          fontSize: 10.5, color: 'var(--text-dim)',
        }}>
          <span>{t('mobile.review.fullscreen.swipeLeft')}</span>
          <span style={{ opacity: 0.4 }}>{t('mobile.review.fullscreen.swipeHint')}</span>
          <span>{t('mobile.review.fullscreen.swipeRight')}</span>
        </div>
      )}

      {/* Card */}
      <div style={{ flex: 1, padding: '0 16px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <SwipeCard onSwipe={handleSwipe} revealed={revealed}>
          <div
            onClick={() => !revealed && setRevealed(true)}
            style={{
              flex: 1, height: '100%',
              padding: '24px 22px 20px',
              borderRadius: 20,
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              display: 'flex', flexDirection: 'column',
              cursor: revealed ? 'default' : 'pointer',
              position: 'relative', overflow: 'hidden',
              animation: grading ? undefined : 'card-enter 280ms ease',
            }}
          >
            {haptic && <HapticRipple trigger={haptic?.id} color={haptic?.color}/>}

            {/* Tags */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
              {card.tags.map(([c, l]) => <NNTag key={l} color={c as 'sky'|'lime'|'violet'|'amber'|'rose'|'neutral'}>{l}</NNTag>)}
            </div>

            {/* Front */}
            <div style={{
              fontFamily: 'var(--font-serif)', fontSize: 48,
              letterSpacing: -1.2, lineHeight: 1.1, marginBottom: 6,
            }}>{card.front}</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic', marginBottom: 16 }}>
              {card.phonetic}
            </div>

            {!revealed && (
              <div style={{
                flex: 1, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 8,
              }}>
                <div style={{
                  fontSize: 13, color: 'var(--text-dim)',
                  padding: '8px 20px', borderRadius: 99,
                  border: '1px dashed var(--border-2)',
                }}>{t('mobile.review.fullscreen.tapReveal')}</div>
              </div>
            )}

            {revealed && (
              <>
                <div style={{ height: 1, background: 'var(--border)', margin: '4px 0 16px' }}/>
                <div style={{
                  fontSize: 26, color: 'var(--lime-400)',
                  fontFamily: 'var(--font-serif)', marginBottom: 14,
                  animation: 'card-enter 200ms ease',
                }}>{card.back}</div>
                <div style={{
                  padding: 12, borderRadius: 10,
                  background: 'rgba(167,136,255,0.08)',
                  border: '1px solid rgba(167,136,255,0.2)',
                  fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.5,
                  animation: 'card-enter 250ms 60ms ease both',
                }}>
                  <span style={{ color: 'var(--violet-400)', fontWeight: 500 }}>{t('mobile.review.fullscreen.mnemonicLabel')}</span>
                  {card.mnemonic}
                </div>
              </>
            )}
          </div>
        </SwipeCard>
      </div>

      {/* Action area */}
      <div style={{ padding: '10px 16px 0' }}>
        {!revealed ? (
          /* Mic row — before reveal */
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', paddingBottom: 10 }}>
            <div
              onClick={() => setMicOpen(true)}
              style={{
                width: 56, height: 56, borderRadius: '50%',
                background: 'var(--surface-2)', border: '1px solid var(--border-2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
                boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
              }}
            >
              <NNIcon name="mic" size={22} color="var(--text-muted)"/>
            </div>
            <div
              onClick={() => setRevealed(true)}
              style={{
                flex: 1, height: 56, borderRadius: 16,
                background: 'var(--surface-2)', border: '1px solid var(--border-2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, fontWeight: 500, cursor: 'pointer', gap: 8,
                color: 'var(--text-muted)',
              }}
            >
              <NNIcon name="eye" size={16} color="var(--text-muted)"/>
              {t('mobile.review.fullscreen.showAnswer')}
            </div>
          </div>
        ) : (
          /* Grade buttons */
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 7, paddingBottom: 10 }}>
            {GRADES.map(g => (
              <div
                key={g.id}
                onClick={() => handleGrade(g.id)}
                style={{
                  padding: '11px 6px', borderRadius: 14, textAlign: 'center',
                  background: g.bg, border: `1.5px solid ${g.border}`,
                  cursor: 'pointer',
                  transition: 'transform 80ms, opacity 80ms',
                  animation: 'card-enter 200ms ease both',
                }}
                onPointerDown={e => { e.currentTarget.style.transform = 'scale(0.96)'; e.currentTarget.style.opacity = '0.8'; }}
                onPointerUp={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.opacity = ''; }}
              >
                <div style={{ fontSize: 13, fontWeight: 600, color: g.color }}>{g.label}</div>
                <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }} className="mono">{g.interval}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom tab bar */}
      <div style={{
        height: 82, paddingBottom: 22, paddingTop: 6,
        borderTop: '1px solid #1c1f25',
        background: 'rgba(10,11,13,0.85)', backdropFilter: 'blur(20px)',
        display: 'flex', justifyContent: 'space-around', alignItems: 'center',
        flexShrink: 0,
      }}>
        {[
          { id: 'home',   i: 'home',   l: t('mobile.tabs.home') },
          { id: 'review', i: 'bolt',   l: t('mobile.tabs.review') },
          { id: 'graph',  i: 'graph',  l: t('mobile.tabs.graph') },
          { id: 'garden', i: 'garden', l: t('mobile.tabs.garden') },
        ].map(tab => (
          <div key={tab.id} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            color: tab.id === 'review' ? 'var(--lime-400)' : 'var(--text-dim)',
            padding: '6px 10px', cursor: 'pointer',
          }}>
            <NNIcon name={tab.i} size={22}/>
            <span style={{ fontSize: 10.5, fontWeight: 500 }}>{tab.l}</span>
          </div>
        ))}
      </div>

      {/* Mic overlay */}
      {micOpen && <MicOverlay onClose={() => setMicOpen(false)}/>}
    </div>
  );
};

// ─────────────────────────────────────────────
// Three states shown side-by-side in a row
// ─────────────────────────────────────────────
export const NNMobileReviewDetail = () => {
  const t = useT();
  const states = [
    { label: t('mobile.review.states.question'),   revealedInit: false, micInit: false  },
    { label: t('mobile.review.states.revealed'),  revealedInit: true,  micInit: false  },
    { label: t('mobile.review.states.voice'), revealedInit: false, micInit: true   },
  ];

  return (
    <div style={{ display: 'flex', gap: 28, alignItems: 'flex-start' }}>
      {states.map((s, i) => (
        <IOSDevice key={i} width={390} height={844} dark>
          <MobReviewStaticSnapshot {...s}/>
        </IOSDevice>
      ))}
    </div>
  );
};

// Static snapshots — each phone shows a fixed state, no interactivity needed
const MobReviewStaticSnapshot = ({ revealedInit, micInit }: { revealedInit: boolean; micInit: boolean }) => {
  const t = useT();
  const [revealed, setRevealed] = React.useState(revealedInit);
  const [micOpen, setMicOpen] = React.useState(micInit);
  const [haptic] = React.useState(null);
  const [progress] = React.useState(14);

  const card = {
    front: 'der Nachbar', phonetic: '/ˈnaːx.baːɐ̯/', tags: [['amber','german'],['sky','b1']],
    back: 'the neighbor', mnemonic: 'Nacht-bar — the night bar where you meet neighbors.',
  };

  const GRADES = [
    { id: 'again', label: t('mobile.review.ratings.again'), interval: '<1m', color: 'var(--rose-400)',  bg: 'rgba(209,85,102,0.1)',  border: 'rgba(209,85,102,0.35)' },
    { id: 'hard',  label: t('mobile.review.ratings.hard'),  interval: '8m',  color: 'var(--amber-400)', bg: 'rgba(243,182,85,0.1)',  border: 'rgba(243,182,85,0.35)' },
    { id: 'good',  label: t('mobile.review.ratings.good'),  interval: '3d',  color: 'var(--lime-400)',  bg: 'rgba(154,209,85,0.1)',  border: 'rgba(154,209,85,0.35)' },
    { id: 'easy',  label: t('mobile.review.ratings.easy'),  interval: '9d',  color: 'var(--sky-400)',   bg: 'rgba(85,196,214,0.1)',  border: 'rgba(85,196,214,0.35)' },
  ];

  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      background: '#0a0b0d', color: '#eaecf1',
      fontFamily: '-apple-system, "Inter Tight", system-ui', position: 'relative',
    }}>
      <style>{`
        @keyframes haptic-pulse { 0%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(1.06)} }
        @keyframes card-enter { from{transform:scale(0.94) translateY(12px);opacity:0} to{transform:scale(1) translateY(0);opacity:1} }
      `}</style>
      <div style={{ height: 54 }}/>

      <div style={{ padding: '0 16px 10px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <NNIcon name="x" size={20} color="var(--text-muted)"/>
        <div style={{ flex: 1, height: 5, background: 'var(--surface-3)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ width: `${(progress / 42) * 100}%`, height: '100%', background: 'var(--lime-500)' }}/>
        </div>
        <span className="mono" style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{progress}/42</span>
        <NNIcon name="dots" size={20} color="var(--text-muted)"/>
      </div>

      {!revealed && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 14, marginBottom: 6, fontSize: 10.5, color: 'var(--text-dim)' }}>
          <span>{t('mobile.review.fullscreen.swipeLeft')}</span>
          <span style={{ opacity: 0.4 }}>{t('mobile.review.fullscreen.swipeHint')}</span>
          <span>{t('mobile.review.fullscreen.swipeRight')}</span>
        </div>
      )}

      <div style={{ flex: 1, padding: '0 16px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{
          flex: 1, padding: '24px 22px 20px', borderRadius: 20,
          background: 'var(--surface)', border: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
            {card.tags.map(([c, l]) => <NNTag key={l} color={c as 'sky'|'lime'|'violet'|'amber'|'rose'|'neutral'}>{l}</NNTag>)}
          </div>
          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 44, letterSpacing: -1, lineHeight: 1.1, marginBottom: 6 }}>
            {card.front}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic', marginBottom: 16 }}>
            {card.phonetic}
          </div>
          {!revealed && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 8 }}>
              <div style={{ fontSize: 13, color: 'var(--text-dim)', padding: '8px 20px', borderRadius: 99, border: '1px dashed var(--border-2)' }}>
                {t('mobile.review.fullscreen.tapReveal')}
              </div>
            </div>
          )}
          {revealed && (
            <>
              <div style={{ height: 1, background: 'var(--border)', margin: '4px 0 16px' }}/>
              <div style={{ fontSize: 26, color: 'var(--lime-400)', fontFamily: 'var(--font-serif)', marginBottom: 14 }}>
                {card.back}
              </div>
              <div style={{ padding: 12, borderRadius: 10, background: 'rgba(167,136,255,0.08)', border: '1px solid rgba(167,136,255,0.2)', fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                <span style={{ color: 'var(--violet-400)', fontWeight: 500 }}>{t('mobile.review.fullscreen.mnemonicLabel')}</span>
                {card.mnemonic}
              </div>
            </>
          )}
        </div>
      </div>

      <div style={{ padding: '10px 16px 0' }}>
        {!revealed ? (
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', paddingBottom: 10 }}>
            <div onClick={() => setMicOpen(true)} style={{
              width: 56, height: 56, borderRadius: '50%', background: 'var(--surface-2)',
              border: '1px solid var(--border-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            }}>
              <NNIcon name="mic" size={22} color="var(--text-muted)"/>
            </div>
            <div onClick={() => setRevealed(true)} style={{
              flex: 1, height: 56, borderRadius: 16, background: 'var(--surface-2)', border: '1px solid var(--border-2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 500, cursor: 'pointer', gap: 8, color: 'var(--text-muted)',
            }}>
              <NNIcon name="eye" size={16} color="var(--text-muted)"/>
              {t('mobile.review.fullscreen.showAnswer')}
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 7, paddingBottom: 10 }}>
            {GRADES.map(g => (
              <div key={g.id} style={{ padding: '11px 6px', borderRadius: 14, textAlign: 'center', background: g.bg, border: `1.5px solid ${g.border}`, cursor: 'pointer' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: g.color }}>{g.label}</div>
                <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 2 }} className="mono">{g.interval}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{
        height: 82, paddingBottom: 22, paddingTop: 6,
        borderTop: '1px solid #1c1f25', background: 'rgba(10,11,13,0.85)', backdropFilter: 'blur(20px)',
        display: 'flex', justifyContent: 'space-around', alignItems: 'center', flexShrink: 0,
      }}>
        {[{ id: 'home', i: 'home', l: t('mobile.tabs.home') }, { id: 'review', i: 'bolt', l: t('mobile.tabs.review') }, { id: 'graph', i: 'graph', l: t('mobile.tabs.graph') }, { id: 'garden', i: 'garden', l: t('mobile.tabs.garden') }].map(tab => (
          <div key={tab.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, color: tab.id === 'review' ? 'var(--lime-400)' : 'var(--text-dim)', padding: '6px 10px' }}>
            <NNIcon name={tab.i} size={22}/>
            <span style={{ fontSize: 10.5, fontWeight: 500 }}>{tab.l}</span>
          </div>
        ))}
      </div>

      {micOpen && <MicOverlay onClose={() => setMicOpen(false)}/>}
    </div>
  );
};

// Interactive single phone for section 10 replacement
export const NNMobileInteractive = () => (
  <IOSDevice width={390} height={844} dark>
    <MobReviewFullscreen/>
  </IOSDevice>
);
