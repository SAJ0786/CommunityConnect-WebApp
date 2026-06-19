import React, { useState } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase/firebase';
import { deleteMyAccountAndEvents, updateReminderPreference } from '../services/userService';

// Injected at build time by vite.config.js — Date.now() when `npm run build` ran
const BUILD_TIME = typeof __APP_BUILD_TIME__ !== 'undefined' ? __APP_BUILD_TIME__ : null;

function formatBuildNumber(ts) {
  if (!ts) return 'dev';
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return `${date} ${time} (v${ts})`;
}

export default function Profile({ user, profile, setProfile }) {
  const toggleReminder = async () => {
    const next = !profile?.reminderEmailEnabled;
    await updateReminderPreference(user.uid, next);
    setProfile({ ...profile, reminderEmailEnabled: next });
  };

  const [deleteStep, setDeleteStep] = useState(null); // null | 'askEvents' | 'confirm'
  const [keepEvents, setKeepEvents] = useState(null);

  const startDelete = () => setDeleteStep('askEvents');
  const buildNumber = formatBuildNumber(BUILD_TIME);
  const cancelDelete = () => { setDeleteStep(null); setKeepEvents(null); };

  const confirmDelete = async () => {
    setDeleteStep(null);
    try {
      await deleteMyAccountAndEvents(auth.currentUser, keepEvents);
      location.reload();
    } catch (e) {
      if (e.code === 'auth/requires-recent-login') {
        alert('For security, please sign out and sign back in before deleting your account.');
      } else {
        alert('Error deleting account: ' + e.message);
      }
      setKeepEvents(null);
    }
  };

  return (
    <div className="card">
      <h2>Profile &amp; Settings</h2>

      <p><b>Email:</b> {user?.email}</p>
      <p><b>Role:</b> {profile?.role}</p>
      <p>
        <b>Email Reminders:</b>{' '}
        {profile?.reminderEmailEnabled ? 'Enabled' : 'Disabled'}
      </p>

      <button className="btn-light" onClick={toggleReminder}>
        {profile?.reminderEmailEnabled ? 'Disable' : 'Enable'} Email Reminders
      </button>

      <button className="btn-muted" onClick={() => signOut(auth)}>
        Logout
      </button>

      <div className="divider" />

      <h3>Share the App</h3>
      <p className="small" style={{ marginBottom: 12 }}>
        Invite your community to join Community Events Australia.
      </p>
      <button style={{ width: '100%' }} onClick={() => {
        const url = 'https://communityevents.siza.info';
        const msg = [
          '🌙 *Community Events Australia*',
          '_Your free community events app_',
          '',
          '*Features:*',
          '📅 Browse upcoming Majalis, Milads & community events',
          '🔔 Get push notifications before events',
          '📲 Install as an app on iPhone & Android',
          '📤 Share events to WhatsApp instantly',
          '🗺️ Get directions to any event',
          '🌙 Hijri dates on every event',
          '📅 Sync events to your phone calendar',
          '🤖 AI Search — ask anything about events',
          '⭐ Save your favourite events',
          '➕ Add & manage your own events',
          '',
          `👉 *${url}*`,
          '',
          '_Open in Safari (iPhone) or Chrome (Android) → Add to Home Screen_',
        ].join('\n');
        if (window.__showShareSheet) {
          window.__showShareSheet(msg);
        } else if (navigator.share) {
          navigator.share({ text: msg }).catch(() => {});
        } else {
          navigator.clipboard.writeText(msg).then(() => alert('Message copied! Paste it in WhatsApp.'));
        }
      }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="white" style={{ flexShrink: 0 }}>
          <path d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.37 5.07L2 22l5.09-1.34A9.94 9.94 0 0012 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm0 18c-1.66 0-3.22-.46-4.55-1.26l-.32-.19-3.03.8.81-2.96-.21-.34A7.96 7.96 0 014 12c0-4.42 3.58-8 8-8s8 3.58 8 8-3.58 8-8 8zm4.45-5.95c-.24-.12-1.43-.7-1.65-.78-.22-.08-.38-.12-.54.12-.16.24-.62.78-.76.94-.14.16-.28.18-.52.06-.24-.12-1.01-.37-1.92-1.18-.71-.63-1.19-1.41-1.33-1.65-.14-.24-.01-.37.1-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.54-1.3-.74-1.78-.19-.47-.39-.4-.54-.41h-.46c-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2s.86 2.32.98 2.48c.12.16 1.69 2.58 4.1 3.62.57.25 1.02.39 1.37.5.57.18 1.09.16 1.5.1.46-.07 1.43-.58 1.63-1.15.2-.57.2-1.06.14-1.15-.06-.1-.22-.16-.46-.28z"/>
        </svg>
        Share the App
      </button>

      <div className="divider" />

      <h3>Help &amp; Policies</h3>
      <p><a href="/docs/user-guide.html" target="_blank">📘 User Guide</a></p>
      <p><a href="/privacy.html"       target="_blank">Privacy Policy</a></p>
      <p><a href="/terms.html"         target="_blank">Terms of Use</a></p>
      <p><a href="/support.html"       target="_blank">Support &amp; Contact</a></p>
      <p><a href="/delete-account.html" target="_blank">Account Deletion Policy</a></p>

      <div className="divider" />

      <button className="btn-danger" onClick={startDelete}>
        Delete My Account
      </button>

      {/* Step 1: Ask about events */}
      {deleteStep === 'askEvents' && (
        <div style={{ marginTop:16, background:'#fff7ed', border:'1px solid #fed7aa',
          borderRadius:14, padding:18 }}>
          <p style={{ fontWeight:800, fontSize:14, margin:'0 0 8px', color:'#9a3412' }}>
            What should happen to your events?
          </p>
          <p style={{ fontSize:13, color:'#92400e', margin:'0 0 14px', lineHeight:1.5 }}>
            You have created events in the app. Would you like to keep them visible to the community, or delete them along with your account?
          </p>
          <div style={{ display:'flex', gap:10 }}>
            <button onClick={() => { setKeepEvents(true); setDeleteStep('confirm'); }}
              style={{ flex:1, padding:'11px', borderRadius:11, fontWeight:800, fontSize:13,
                background:'var(--teal,#0f766e)', color:'white', border:'none', cursor:'pointer' }}>
              Keep My Events
            </button>
            <button onClick={() => { setKeepEvents(false); setDeleteStep('confirm'); }}
              style={{ flex:1, padding:'11px', borderRadius:11, fontWeight:800, fontSize:13,
                background:'#dc2626', color:'white', border:'none', cursor:'pointer' }}>
              Delete My Events
            </button>
          </div>
          <button onClick={cancelDelete}
            style={{ width:'100%', marginTop:8, padding:'9px', borderRadius:11,
              fontWeight:700, fontSize:13, background:'transparent',
              color:'var(--muted)', border:'1px solid var(--border)', cursor:'pointer' }}>
            Cancel
          </button>
        </div>
      )}

      {/* Step 2: Confirm deletion */}
      {deleteStep === 'confirm' && (
        <div style={{ marginTop:16, background:'#fef2f2', border:'1px solid #fecaca',
          borderRadius:14, padding:18 }}>
          <p style={{ fontWeight:800, fontSize:14, margin:'0 0 8px', color:'#991b1b' }}>
            ⚠️ This cannot be undone
          </p>
          <p style={{ fontSize:13, color:'#7f1d1d', margin:'0 0 14px', lineHeight:1.5 }}>
            Your account will be permanently deleted.{' '}
            {keepEvents
              ? 'Your events will be kept and remain visible to the community.'
              : 'Your account and all your events will be permanently deleted.'}
          </p>
          <div style={{ display:'flex', gap:10 }}>
            <button onClick={confirmDelete}
              style={{ flex:1, padding:'11px', borderRadius:11, fontWeight:800, fontSize:13,
                background:'#dc2626', color:'white', border:'none', cursor:'pointer' }}>
              Yes, Delete My Account
            </button>
            <button onClick={cancelDelete}
              style={{ flex:1, padding:'11px', borderRadius:11, fontWeight:800, fontSize:13,
                background:'transparent', color:'var(--text)', border:'1px solid var(--border)',
                cursor:'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )}
      <div className="divider" />

      <h3>About</h3>
      <div style={{
        background: 'var(--card-alt, #f8fafc)', border: '1px solid var(--border)',
        borderRadius: 14, padding: 18, textAlign: 'center',
      }}>
        {/* SIZA brand mark — lightbulb/arrow icon + wordmark */}
        <svg width="56" height="56" viewBox="0 0 100 100" style={{ marginBottom: 6 }}>
          <defs>
            <linearGradient id="sizaGold" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#d4a857" />
              <stop offset="100%" stopColor="#6b4f1f" />
            </linearGradient>
          </defs>
          {/* bulb outline */}
          <circle cx="46" cy="34" r="20" fill="none" stroke="url(#sizaGold)" strokeWidth="4" />
          {/* bulb base */}
          <rect x="38" y="58" width="16" height="5" fill="url(#sizaGold)" />
          <rect x="40" y="65" width="12" height="5" fill="url(#sizaGold)" />
          <path d="M40 72 Q46 80 52 72 Z" fill="url(#sizaGold)" />
          {/* swoosh + arrow */}
          <path d="M14 70 Q14 50 50 35 L78 22" fill="none" stroke="url(#sizaGold)" strokeWidth="6" strokeLinecap="round" />
          <path d="M68 14 L82 20 L70 30 Z" fill="url(#sizaGold)" />
        </svg>
        <div style={{
          fontWeight: 900, fontSize: 24, letterSpacing: 2,
          backgroundImage: 'linear-gradient(135deg,#1e3a8a,#3b82f6)',
          WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
          marginBottom: 2, fontFamily: 'Georgia, serif',
        }}>
          SIZA
        </div>
        <div style={{
          fontSize: 10, letterSpacing: 3, color: 'var(--muted)',
          fontWeight: 700, marginBottom: 12,
        }}>
          CREATE · SHARE · CONNECT
        </div>
        <p style={{ margin: '0 0 6px', fontWeight: 800, fontSize: 14, color: 'var(--text)' }}>
          Community Events Australia
        </p>
        <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.6 }}>
          An initiative by <b>SIZA Apps</b>, offered as a service to the
          community — empowering smarter community event management and
          sharing to help build stronger, more connected communities.
        </p>
        <div style={{
          display: 'inline-block', background: 'var(--card,white)',
          border: '1px solid var(--border)', borderRadius: 10,
          padding: '6px 14px', fontSize: 11.5, color: 'var(--muted)',
          fontFamily: 'monospace',
        }}>
          Build {buildNumber}
        </div>
      </div>

    </div>
  );
}
