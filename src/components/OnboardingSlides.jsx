import React, { useState } from 'react';

const SLIDES = [
  {
    icon: '🌙',
    title: 'Welcome to Community Events',
    subtitle: 'Your free hub for Australian Muslim community events — Majalis, Milad programmes, and more.',
    color: '#0f766e', bg: '#e6f4f1',
  },
  {
    icon: '📅',
    title: 'Discover Events',
    subtitle: 'Browse upcoming events from centres and community members. Filter by suburb, organiser type, or time period.',
    color: '#0f766e', bg: '#e6f4f1',
    tip: 'Tip: Use AI Search — try "Majlis this Friday in Lakemba" and get instant results.',
  },
  {
    icon: '📤',
    title: 'Share Events Instantly',
    subtitle: 'Tap Share on any event card and a fully formatted WhatsApp or SMS message is created for you — no typing needed.',
    color: '#7c3aed', bg: '#ede9fe',
    tip: 'Tip: Admins can bulk-share multiple events at once from the Bulk Share menu.',
  },
  {
    icon: '🗺️',
    title: 'Navigate Directly',
    subtitle: 'Every event has a Directions button. Tap it to open Apple Maps or Google Maps and get turn-by-turn directions straight from the app.',
    color: '#2563eb', bg: '#eff6ff',
    tip: 'Tip: Centre events show the full address. Private events show the suburb to protect privacy.',
  },
  {
    icon: '📅',
    title: 'Series Events',
    subtitle: 'Hosting a multi-day programme like Muharram or Ramadan? Add all consecutive days at once with one form — both Gregorian and Hijri dates supported.',
    color: '#b45309', bg: '#fef3c7',
    tip: 'Tip: Series events appear individually in the calendar so attendees can RSVP day by day.',
  },
  {
    icon: '➕',
    title: 'Add & Manage Events',
    subtitle: 'Register free to add your own events, edit them anytime, and receive evening reminders before upcoming events.',
    color: '#0f766e', bg: '#e6f4f1',
    tip: 'Tip: Sync the live calendar feed to your phone — events update automatically.',
  },
  {
    icon: '📲',
    title: 'Install as an App',
    subtitle: 'Add Community Events to your home screen — it loads instantly, works offline, and feels like a native app.',
    color: '#0f766e', bg: '#e6f4f1',
    tip: 'iPhone: Safari → Share → Add to Home Screen. Android: Chrome → ⋮ → Install App.',
  },
];

export default function OnboardingSlides({ onComplete }) {
  const [current, setCurrent] = useState(0);

  const goTo = (idx) => setCurrent(idx);

  const next = () => {
    if (current < SLIDES.length - 1) setCurrent(c => c + 1);
    else finish();
  };

  const finish = () => {
    try { localStorage.setItem('onboardingDone', '1'); } catch {}
    onComplete();
  };

  const slide = SLIDES[current];

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.72)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16,
    }}>
      <div style={{
        background: 'var(--card,white)', borderRadius: 24,
        width: '100%', maxWidth: 400,
        boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
        overflow: 'hidden', border: '1px solid var(--border)',
      }}>
        {/* Slide header */}
        <div style={{
          background: slide.bg, padding: '32px 24px 20px',
          textAlign: 'center', borderBottom: `3px solid ${slide.color}`,
          transition: 'background 0.25s',
        }}>
          <div style={{ fontSize: 52, lineHeight: 1, marginBottom: 14 }}>{slide.icon}</div>
          <h2 style={{ margin: '0 0 10px', fontSize: 19, fontWeight: 700, color: slide.color }}>
            {slide.title}
          </h2>
          <p style={{ margin: 0, fontSize: 13, color: '#374151', lineHeight: 1.65 }}>
            {slide.subtitle}
          </p>
        </div>

        {/* Tip */}
        <div style={{ minHeight: 60, padding: '0 24px' }}>
          {slide.tip && (
            <div style={{
              margin: '14px 0 0', padding: '10px 14px',
              background: 'var(--teal-l,#e6f4f1)', borderRadius: 10,
              fontSize: 12, color: 'var(--teal,#0f766e)', lineHeight: 1.5,
              borderLeft: `3px solid var(--teal,#0f766e)`,
            }}>
              {slide.tip}
            </div>
          )}
        </div>

        {/* Dots */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, padding: '14px 24px 0' }}>
          {SLIDES.map((_, i) => (
            <button key={i} onClick={() => goTo(i)} style={{
              width: i === current ? 22 : 7, height: 7, borderRadius: 4,
              background: i === current ? slide.color : 'var(--border,#d1d5db)',
              border: 'none', cursor: 'pointer', padding: 0, transition: 'all 0.25s',
            }} />
          ))}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, padding: '14px 24px 20px' }}>
          <button className="btn-light" onClick={finish} style={{ flex: 1, fontSize: 13 }}>
            Skip
          </button>
          <button onClick={next} style={{
            flex: 2, fontSize: 14, fontWeight: 600,
            background: slide.color, border: `1px solid ${slide.color}`, color: 'white',
          }}>
            {current < SLIDES.length - 1 ? 'Next →' : '🚀 Get Started'}
          </button>
        </div>

        <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--muted)', margin: '0 0 14px' }}>
          {current + 1} of {SLIDES.length}
        </p>
      </div>
    </div>
  );
}
