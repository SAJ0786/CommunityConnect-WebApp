import React, { useEffect, useState } from 'react';
import { getCalendarFeed, icsInstructions } from '../services/calendarService';

// Feed URL: communityevents.siza.info/cal?t=uid

export default function CalendarSync({ user }) {
  const [copied, setCopied] = useState(false);
  const [tab, setTab]       = useState('iphone');
  const [feedUrl,setFeedUrl] = useState('');
  const [feedError,setFeedError] = useState('');
  useEffect(() => { let active=true;getCalendarFeed(user?.uid).then(url=>{if(active)setFeedUrl(url);}).catch(error=>{if(active)setFeedError(error.message);});return()=>{active=false;};},[user?.uid]);
  const inst    = icsInstructions();

  const copy = () => {
    if (!feedUrl) return;
    navigator.clipboard.writeText(feedUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  // Direct calendar subscription URLs
  // iOS: webcal:// triggers Apple Calendar directly
  const iosCalendarUrl = `webcal://${feedUrl.replace('https://', '').replace('http://', '')}`;

  // Google Calendar previously worked best with webcal:// in the cid parameter.
  const webcalFeedUrl      = feedUrl.replace('https://', 'webcal://').replace('http://', 'webcal://');
  const googleCalendarUrl  = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalFeedUrl)}`;

  // Raw function URL as fallback — more reliable for external calendar apps
  const rawFeedUrl = feedUrl;
  const googleCalendarUrlRaw = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(rawFeedUrl.replace('https://', 'webcal://'))}`;

  const TAB_LABELS = {
    iphone:  'iPhone / iPad',
    android: 'Android / Google',
  };

  return (
    <div style={{ margin: '0 16px 16px' }}>

      {feedError && <p role="alert">{feedError}</p>}
      {!feedUrl && !feedError && <p role="status">Creating your secure calendar link…</p>}
      {/* Hero */}
      <div className="card" style={{
        background: 'linear-gradient(135deg,var(--teal),var(--teal-dark))',
        border: 'none', color: 'var(--cc-on-primary)'
      }}>
        <p style={{ color: 'color-mix(in srgb, var(--cc-surface) 88%, transparent)', margin: 0, fontSize: '0.875rem' }}>
          Subscribe once — your calendar automatically stays up to date as events are added or removed.
        </p>
      </div>

      {/* One-tap sync buttons */}
      <div className="card">
        <h3 style={{ margin: '0 0 6px' }}>Quick Sync</h3>
        <p className="small" style={{ margin: '0 0 16px' }}>
          Tap your device type to add the Community Events calendar directly.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {/* iPhone / Apple Calendar */}
          <a
            href={feedUrl ? iosCalendarUrl : undefined} aria-disabled={!feedUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              background: 'var(--teal-l,var(--cc-accent-soft))', border: '1px solid var(--teal,var(--cc-accent-border))',
              borderRadius: 16, padding: '16px 12px',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: 10, cursor: 'pointer',
              textDecoration: 'none', boxSizing: 'border-box'
            }}
          >
            <div style={{
              width: 48, height: 48, borderRadius: '50%', background: 'var(--card,var(--cc-surface))',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <span style={{ fontSize: '2rem', lineHeight: 1 }}>🍎</span>
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--teal)' }}>iPhone / iPad</div>
              <div style={{ fontSize: '0.6875rem', color: 'var(--muted)', marginTop: 2 }}>Apple Calendar</div>
            </div>
          </a>

          {/* Android / Google Calendar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <a
              href={feedUrl ? googleCalendarUrl : undefined} aria-disabled={!feedUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                background: 'var(--teal-l,var(--cc-accent-soft))', border: '1px solid var(--teal,var(--cc-accent-border))',
                borderRadius: 16, padding: '16px 12px',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: 10, cursor: 'pointer', width: '100%',
                textDecoration: 'none', boxSizing: 'border-box'
              }}
            >
              <div style={{
                width: 48, height: 48, borderRadius: '50%', background: 'var(--card,var(--cc-surface))',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <span style={{ fontSize: '2rem', lineHeight: 1 }}>🤖</span>
              </div>
              <div>
                <div style={{ fontWeight: 900, fontSize: '0.9375rem', color: 'var(--red,var(--cc-accent-strong))' }}>Android</div>
                <div style={{ fontSize: '0.6875rem', color: 'var(--muted)', marginTop: 2 }}>Google Calendar</div>
              </div>
            </a>
            <a
              href={feedUrl ? googleCalendarUrlRaw : undefined} aria-disabled={!feedUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                background: 'var(--cc-background)', color: 'var(--muted)',
                border: '1px solid var(--border)',
                borderRadius: 10, padding: '6px',
                fontSize: '0.6875rem', cursor: 'pointer',
                textDecoration: 'none', textAlign: 'center'
              }}
            >
              Try alternate link if above fails
            </a>
          </div>
        </div>

        <div className="notice" style={{ marginTop: 14 }}>
          <p className="small" style={{ margin: 0 }}>
            <strong>iPhone:</strong> Tapping opens Apple Calendar and asks you to subscribe.<br />
            <strong>Android:</strong> Opens Google Calendar on browser — click "Add calendar".<br />
            Your calendar follows your saved default city. Changes appear on your calendar provider's next refresh; timing varies.
          </p>
        </div>
      </div>

      {/* Feed URL — copy manually */}
      <div className="card">
        <h3 style={{ margin: '0 0 8px' }}>Your Personal Feed URL</h3>
        <p className="small" style={{ margin: '0 0 10px' }}>
          Use this if the buttons above don't work, or to add to Outlook or any other calendar app.
        </p>
        <div style={{
          background: 'var(--card,var(--cc-background))', borderRadius: 10, padding: '10px 14px',
          fontSize: '0.75rem', wordBreak: 'break-all', color: 'var(--teal)',
          fontFamily: 'monospace', border: '1px solid var(--border)', marginBottom: 10
        }}>
          {feedUrl}
        </div>
        <button onClick={copy} style={{ width: '100%', marginBottom: 8 }}>
          {copied ? '✓ Copied!' : '📋 Copy Feed URL'}
        </button>
        <p className="small" style={{ margin: '0 0 6px', color: 'var(--muted)' }}>
          If your calendar app doesn't accept the short URL above, use this direct URL:
        </p>
        <div style={{
          background: 'var(--card,var(--cc-background))', borderRadius: 10, padding: '10px 14px',
          fontSize: '0.6875rem', wordBreak: 'break-all', color: 'var(--teal)',
          fontFamily: 'monospace', border: '1px solid var(--border)', marginBottom: 10
        }}>
          {rawFeedUrl}
        </div>
        <button onClick={() => {
          navigator.clipboard.writeText(rawFeedUrl);
          window.showToast && window.showToast('Direct URL copied!', 'success');
        }} className="btn-light" style={{ width: '100%' }}>
          📋 Copy Direct URL
        </button>
      </div>

      {/* Step-by-step instructions */}
      <div className="card">
        <h3 style={{ margin: '0 0 14px' }}>Manual Setup Instructions</h3>

        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {Object.entries(TAB_LABELS).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)} style={{
              flex: 1, padding: '8px 10px', fontSize: '0.8125rem', borderRadius: 10,
              border: '1px solid var(--border)',
              background: tab === key ? 'var(--teal)' : 'var(--card,var(--cc-surface))',
              color: tab === key ? 'var(--cc-on-primary)' : 'var(--text)',
              fontWeight: tab === key ? 900 : 400, cursor: 'pointer'
            }}>{label}</button>
          ))}
        </div>

        <ol style={{ margin: 0, paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {inst[tab === 'android' ? 'android' : 'iphone'].map((step, i) => (
            <li key={i} style={{ fontSize: '0.875rem', lineHeight: 1.6 }}>{step}</li>
          ))}
        </ol>

        <div className="notice" style={{ marginTop: 14 }}>
          Your calendar follows your saved default city and updates on your calendar provider's next refresh. Entries show title, date, time and suburb. Keep your personal feed link private.
        </div>
      </div>
    </div>
  );
}
