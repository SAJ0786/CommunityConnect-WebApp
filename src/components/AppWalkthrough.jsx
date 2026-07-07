import { useState, useEffect } from 'react';

const STEPS = [
  {
    target: null, // full screen intro
    title: 'Welcome to Community Events Australia! 👋',
    body: 'This quick tour will show you the key features. Tap Next to continue or Skip to go straight to the app.',
    icon: '🕌',
  },
  {
    target: 'bottom-home',
    title: 'Home',
    body: 'Browse upcoming community events. Tap any event card to expand it and see full details.',
    icon: '🏠',
    arrow: 'bottom-left',
  },
  {
    target: 'bottom-search',
    title: 'Search & Filter',
    body: 'Type to search events by name, type, suburb or audience. Tap the sliders icon to open filters.',
    icon: '🔍',
    arrow: 'top',
  },
  {
    target: 'bottom-add',
    title: 'Add Event',
    body: 'Tap the + button to add your own community event. You can upload an event poster too!',
    icon: '➕',
    arrow: 'bottom',
  },
  {
    target: 'bottom-favourites',
    title: 'Favourites',
    body: 'Tap the ❤️ heart on any event to save it. Find all your saved events here.',
    icon: '❤️',
    arrow: 'bottom-right',
  },
  {
    target: 'bottom-calendar',
    title: 'View Calendar',
    body: 'See all events laid out by date. Switch between Month (dot view) and Week (card view). Sync to your phone calendar too.',
    icon: '📅',
    arrow: 'bottom',
  },
  {
    target: 'top-bell',
    title: 'Notifications',
    body: "Tap the 🔔 bell to see tomorrow's events at a glance so you're never caught off guard.",
    icon: '🔔',
    arrow: 'top-right',
  },
  {
    target: 'top-hamburger',
    title: 'Menu',
    body: 'Tap ☰ for quick access to AI Search, Series Events, Calendar, your Profile and more.',
    icon: '☰',
    arrow: 'top-left',
  },
  {
    target: null,
    title: "You're all set! 🎉",
    body: 'Enjoy exploring community events. You can always find help in the menu.',
    icon: '✅',
  },
];

export default function AppWalkthrough({ isGuest, userId, completed, onComplete }) {
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isGuest) {
      setVisible(true);
      return;
    }
    if (!userId) {
      setVisible(false);
      return;
    }
    setVisible(completed === false);
  }, [isGuest, userId, completed]);

  const dismiss = () => {
    setVisible(false);
    if (!isGuest && userId) onComplete?.();
  };

  const next = () => {
    if (step >= STEPS.length - 1) { dismiss(); return; }
    setStep(s => s + 1);
  };

  if (!visible) return null;

  const s = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const isFirst = step === 0;

  // Arrow direction → tooltip positioning
  const arrowStyles = {
    'bottom-left':  { bottom: 86, left: 16, right: 'auto' },
    'bottom-right': { bottom: 86, right: 16, left: 'auto' },
    'bottom':       { bottom: 86, left: '50%', transform: 'translateX(-50%)' },
    'top':          { top: 72, left: '50%', transform: 'translateX(-50%)' },
    'top-right':    { top: 72, right: 16, left: 'auto' },
    'top-left':     { top: 72, left: 16, right: 'auto' },
  };

  const tooltipPos = s.arrow ? arrowStyles[s.arrow] : null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50000,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: tooltipPos ? 'flex-start' : 'center',
      justifyContent: 'center',
    }} onClick={next}>

      {/* Central card (intro/outro steps) */}
      {!tooltipPos && (
        <div onClick={e => e.stopPropagation()}
          style={{
            background: 'white', borderRadius: 24, padding: 28, maxWidth: 320,
            margin: '0 24px', textAlign: 'center',
            boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
          }}>
          <div style={{ fontSize: '3.25rem', marginBottom: 12 }}>{s.icon}</div>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 900, margin: '0 0 10px', lineHeight: 1.2 }}>{s.title}</h2>
          <p style={{ fontSize: '0.84375rem', color: 'var(--muted)', lineHeight: 1.6, margin: '0 0 20px' }}>{s.body}</p>
          <div style={{ display: 'flex', gap: 10 }}>
            {!isFirst && (
              <button onClick={e => { e.stopPropagation(); setStep(s => s - 1); }}
                style={{ flex: 1, padding: '12px', borderRadius: 12, border: '1px solid var(--border)',
                  fontWeight: 800, fontSize: '0.875rem', background: 'white', cursor: 'pointer' }}>
                ← Back
              </button>
            )}
            <button onClick={e => { e.stopPropagation(); next(); }}
              style={{ flex: 2, padding: '12px', borderRadius: 12, border: 'none',
                background: 'linear-gradient(135deg,#16a34a,#0f766e)', color: 'white',
                fontWeight: 800, fontSize: '0.875rem', cursor: 'pointer' }}>
              {isLast ? 'Get Started 🚀' : 'Next →'}
            </button>
          </div>
          {!isLast && (
            <button onClick={e => { e.stopPropagation(); dismiss(); }}
              style={{ marginTop: 10, background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--muted)', fontSize: '0.75rem', fontWeight: 600 }}>
              Skip tour
            </button>
          )}
          {/* Dot progress */}
          <div style={{ display: 'flex', gap: 5, justifyContent: 'center', marginTop: 14 }}>
            {STEPS.map((_, i) => (
              <div key={i} style={{ width: i === step ? 18 : 7, height: 7, borderRadius: 4,
                background: i === step ? 'var(--teal,#0f766e)' : '#d1d5db',
                transition: 'width 0.25s' }} />
            ))}
          </div>
        </div>
      )}

      {/* Tooltip (positioned near UI element) */}
      {tooltipPos && (
        <div onClick={e => e.stopPropagation()}
          style={{
            position: 'absolute', ...tooltipPos,
            background: 'white', borderRadius: 18, padding: '16px 18px',
            maxWidth: 260, boxShadow: '0 12px 40px rgba(0,0,0,0.35)',
            zIndex: 50001,
          }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 10 }}>
            <span style={{ fontSize: '1.5rem', flexShrink: 0 }}>{s.icon}</span>
            <div>
              <div style={{ fontWeight: 800, fontSize: '0.875rem', marginBottom: 4 }}>{s.title}</div>
              <div style={{ fontSize: '0.78125rem', color: 'var(--muted)', lineHeight: 1.5 }}>{s.body}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
            <button onClick={e => { e.stopPropagation(); setStep(s => s - 1); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--muted)', fontSize: '0.75rem', fontWeight: 600 }}>← Back</button>
            <div style={{ display: 'flex', gap: 4 }}>
              {STEPS.map((_, i) => (
                <div key={i} style={{ width: i === step ? 14 : 6, height: 6, borderRadius: 3,
                  background: i === step ? 'var(--teal,#0f766e)' : '#d1d5db',
                  transition: 'width 0.25s' }} />
              ))}
            </div>
            <button onClick={e => { e.stopPropagation(); next(); }}
              style={{ background: 'var(--teal,#0f766e)', border: 'none', cursor: 'pointer',
                color: 'white', fontSize: '0.75rem', fontWeight: 800, padding: '7px 14px',
                borderRadius: 9 }}>
              {isLast ? 'Done ✓' : 'Next →'}
            </button>
          </div>
          <button onClick={e => { e.stopPropagation(); dismiss(); }}
            style={{ display: 'block', margin: '8px auto 0', background: 'none',
              border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '0.6875rem' }}>
            Skip tour
          </button>
        </div>
      )}
    </div>
  );
}
