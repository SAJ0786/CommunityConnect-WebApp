import React, { useState } from 'react';
import { buildFeedUrl, icsInstructions } from '../services/calendarService';

// Feed URL: communityevents.siza.info/cal?t=uid

export default function CalendarSync({ user }) {
  const [copied, setCopied] = useState(false);
  const [tab, setTab]       = useState('iphone');
  const feedUrl = buildFeedUrl(null, null, user?.uid);
  const inst    = icsInstructions();

  const copy = () => {
    navigator.clipboard.writeText(feedUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  // Direct calendar subscription URLs
  // iOS: webcal:// triggers Apple Calendar directly
  const iosCalendarUrl = `webcal://${feedUrl.replace('https://', '').replace('http://', '')}`;

  // Google Calendar requires webcal:// in the cid parameter (not https://)
  const webcalFeedUrl      = feedUrl.replace('https://', 'webcal://').replace('http://', 'webcal://');
  const googleCalendarUrl  = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalFeedUrl)}`;

  // Raw function URL as fallback — more reliable for external calendar apps
  const rawFeedUrl = user?.uid
    ? `https://australia-southeast1-community-event-8b639.cloudfunctions.net/calendarFeed?t=${user.uid}`
    : feedUrl;
  const googleCalendarUrlRaw = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(rawFeedUrl.replace('https://', 'webcal://'))}`;

  const openIphone = () => {
    window.location.href = iosCalendarUrl;
  };

  const openGoogle = () => {
    // Try the short URL first, fall back to raw function URL
    window.open(googleCalendarUrl, '_blank');
  };

  const TAB_LABELS = {
    iphone:  'iPhone / iPad',
    android: 'Android / Google',
  };

  return (
    <div style={{ margin: '0 16px 16px' }}>

      {/* Hero */}
      <div className="card" style={{
        background: 'linear-gradient(135deg,var(--teal),var(--teal-dark))',
        border: 'none', color: 'white'
      }}>
        <h2 style={{ color: 'white', margin: '0 0 6px' }}>Community Event Calendar</h2>
        <p style={{ color: 'rgba(255,255,255,.88)', margin: 0, fontSize: 14 }}>
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
          <button
            onClick={openIphone}
            style={{
              background: 'var(--teal-l,#e6f4f1)', border: '1px solid var(--teal,#a7d9ce)',
              borderRadius: 16, padding: '16px 12px',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: 10, cursor: 'pointer'
            }}
          >
            <div style={{
              width: 48, height: 48, borderRadius: '50%', background: 'var(--card,white)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <span style={{ fontSize: 32, lineHeight: 1 }}>🍎</span>
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--teal)' }}>iPhone / iPad</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Apple Calendar</div>
            </div>
          </button>

          {/* Android / Google Calendar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button
              onClick={openGoogle}
              style={{
                background: 'var(--teal-l,#e6f4f1)', border: '1px solid var(--teal,#a7d9ce)',
                borderRadius: 16, padding: '16px 12px',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: 10, cursor: 'pointer', width: '100%'
              }}
            >
              <div style={{
                width: 48, height: 48, borderRadius: '50%', background: 'var(--card,white)',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <span style={{ fontSize: 32, lineHeight: 1 }}>🤖</span>
              </div>
              <div>
                <div style={{ fontWeight: 900, fontSize: 15, color: 'var(--red,#c0392b)' }}>Android</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Google Calendar</div>
              </div>
            </button>
            <button
              onClick={() => window.open(googleCalendarUrlRaw, '_blank')}
              style={{
                background: '#f3f4f6', color: 'var(--muted)',
                border: '1px solid var(--border)',
                borderRadius: 10, padding: '6px',
                fontSize: 11, cursor: 'pointer'
              }}
            >
              Try alternate link if above fails
            </button>
          </div>
        </div>

        <div className="notice" style={{ marginTop: 14 }}>
          <p className="small" style={{ margin: 0 }}>
            <strong>iPhone:</strong> Tapping opens Apple Calendar and asks you to subscribe.<br />
            <strong>Android:</strong> Opens Google Calendar on browser — click "Add calendar".<br />
            Calendar updates automatically within ~1 hour when events change.
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
          background: 'var(--card,#f4f7f7)', borderRadius: 10, padding: '10px 14px',
          fontSize: 12, wordBreak: 'break-all', color: 'var(--teal)',
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
          background: 'var(--card,#f4f7f7)', borderRadius: 10, padding: '10px 14px',
          fontSize: 11, wordBreak: 'break-all', color: 'var(--teal)',
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
              flex: 1, padding: '8px 10px', fontSize: 13, borderRadius: 10,
              border: '1px solid var(--border)',
              background: tab === key ? 'var(--teal)' : 'var(--card,white)',
              color: tab === key ? 'white' : 'var(--text)',
              fontWeight: tab === key ? 900 : 400, cursor: 'pointer'
            }}>{label}</button>
          ))}
        </div>

        <ol style={{ margin: 0, paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {inst[tab === 'android' ? 'android' : 'iphone'].map((step, i) => (
            <li key={i} style={{ fontSize: 14, lineHeight: 1.6 }}>{step}</li>
          ))}
        </ol>

        <div className="notice" style={{ marginTop: 14 }}>
          Calendar entries include host name, event type, date & time, address and audience type.
        </div>
      </div>
    </div>
  );
}
