import React, { useEffect, useState } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase/firebase';
import { deleteMyAccountAndEvents, updateAdminAlertPreference, updateProfile, updateReminderPreference, updateUserContactProfile } from '../services/userService';
import { isAdminRole } from '../utils/permissions';
import CitySelector from '../components/CitySelector';
import { DEFAULT_CITY, normalizeCity } from '../utils/cities';

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
  const [preferenceError, setPreferenceError] = useState('');
  const [savingPreference, setSavingPreference] = useState('');
  const [editingDetails, setEditingDetails] = useState(false);
  const [profileName, setProfileName] = useState(profile?.fullName || '');
  const [profileEmail, setProfileEmail] = useState(profile?.email || '');
  const [savingDetails, setSavingDetails] = useState(false);
  const [detailsMessage, setDetailsMessage] = useState({ text: '', type: '' });
  const [defaultCity, setDefaultCity] = useState(normalizeCity(profile?.defaultCity || DEFAULT_CITY));
  const [savingCity, setSavingCity] = useState(false);
  const isAdmin = isAdminRole(profile?.role);

  useEffect(() => {
    if (editingDetails) return;
    setProfileName(profile?.fullName || '');
    setProfileEmail(profile?.email || '');
  }, [profile?.fullName, profile?.email, editingDetails]);

  useEffect(() => {
    setDefaultCity(normalizeCity(profile?.defaultCity || DEFAULT_CITY));
  }, [profile?.defaultCity]);

  const saveCity = async () => {
    setSavingCity(true);
    setPreferenceError('');
    try {
      await updateProfile(user.uid, { defaultCity });
      setProfile(prev => ({ ...prev, defaultCity }));
    } catch (error) {
      setPreferenceError(error.message || 'Could not update your default city.');
    } finally {
      setSavingCity(false);
    }
  };

  const saveProfileDetails = async () => {
    const fullName = profileName.trim().replace(/\s+/g, ' ');
    const email = profileEmail.trim().toLowerCase();
    if (fullName.length < 2) {
      setDetailsMessage({ text: 'Please enter your full name.', type: 'error' });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setDetailsMessage({ text: 'Please enter a valid email address.', type: 'error' });
      return;
    }

    setSavingDetails(true);
    setDetailsMessage({ text: '', type: '' });
    try {
      const updated = await updateUserContactProfile(user.uid, fullName, email);
      setProfile(prev => ({ ...prev, ...updated }));
      setEditingDetails(false);
      setDetailsMessage({ text: 'Profile details updated.', type: 'success' });
    } catch (error) {
      setDetailsMessage({
        text: error.code === 'functions/already-exists'
          ? (error.message || 'This phone number or email is already used by another account.')
          : (error.message || 'Could not update profile.'),
        type: 'error',
      });
    } finally {
      setSavingDetails(false);
    }
  };

  const toggleReminder = async () => {
    const next = !profile?.reminderEmailEnabled;
    setSavingPreference('reminders');
    setPreferenceError('');
    try {
      await updateReminderPreference(user.uid, next);
      setProfile({ ...profile, reminderEmailEnabled: next });
    } catch (error) {
      setPreferenceError(error.message || 'Could not update email reminders.');
    } finally {
      setSavingPreference('');
    }
  };

  const toggleAdminAlerts = async () => {
    const enabled = profile?.adminAlertEmailEnabled !== false;
    const next = !enabled;
    setSavingPreference('admin');
    setPreferenceError('');
    try {
      await updateAdminAlertPreference(user.uid, next);
      setProfile({ ...profile, adminAlertEmailEnabled: next });
    } catch (error) {
      setPreferenceError(error.message || 'Could not update admin alerts.');
    } finally {
      setSavingPreference('');
    }
  };

  const [deleteStep, setDeleteStep] = useState(null); // null | 'askEvents' | 'confirm'
  const [archiveEventsNow, setArchiveEventsNow] = useState(null);

  const startDelete = () => setDeleteStep('askEvents');
  const buildNumber = formatBuildNumber(BUILD_TIME);
  const cancelDelete = () => { setDeleteStep(null); setArchiveEventsNow(null); };

  const confirmDelete = async () => {
    setDeleteStep(null);
    try {
      await deleteMyAccountAndEvents(auth.currentUser, archiveEventsNow);
      location.reload();
    } catch (e) {
      if (e.code === 'auth/requires-recent-login') {
        alert('For security, please sign out and sign back in before deleting your account.');
      } else {
        alert('Error deleting account: ' + e.message);
      }
      setArchiveEventsNow(null);
    }
  };

  return (
    <div className="card profile-page">
      <h2>Profile &amp; Settings</h2>

      <div style={{ padding:16, border:'1px solid var(--border)', borderRadius:8, background:'var(--card-alt, #f8fafc)', marginBottom:16 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, marginBottom:editingDetails ? 14 : 0 }}>
          <h3 style={{ margin:0, fontSize:'1rem' }}>Personal Details</h3>
          {!editingDetails && (
            <button className="btn-light" style={{ padding:'7px 12px', margin:0 }} onClick={() => {
              setProfileName(profile?.fullName || '');
              setProfileEmail(profile?.email || '');
              setDetailsMessage({ text:'', type:'' });
              setEditingDetails(true);
            }}>Edit</button>
          )}
        </div>
        {editingDetails ? (
          <>
            <label htmlFor="profile-full-name">Full name</label>
            <input id="profile-full-name" value={profileName} maxLength={100}
              onChange={event => setProfileName(event.target.value)} autoComplete="name" />
            <label htmlFor="profile-email">Email</label>
            <input id="profile-email" type="email" value={profileEmail} maxLength={254}
              onChange={event => setProfileEmail(event.target.value)} autoComplete="email" />
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={saveProfileDetails} disabled={savingDetails}>
                {savingDetails ? 'Saving...' : 'Save Details'}
              </button>
              <button className="btn-muted" disabled={savingDetails} onClick={() => {
                setEditingDetails(false);
                setDetailsMessage({ text:'', type:'' });
              }}>Cancel</button>
            </div>
          </>
        ) : (
          <div style={{ marginTop:12 }}>
            <p style={{ margin:'0 0 6px' }}><b>Name:</b> {profile?.fullName || 'Not provided'}</p>
            <p style={{ margin:0 }}><b>Email:</b> {profile?.email || 'Not provided'}</p>
          </div>
        )}
        {detailsMessage.text && (
          <div className={detailsMessage.type === 'error' ? 'error' : 'success'} style={{ marginTop:10 }} role="status">
            {detailsMessage.text}
          </div>
        )}
      </div>

      <div style={{ padding:16, border:'1px solid var(--border)', borderRadius:8,
        background:'var(--card-alt, #f8fafc)', marginBottom:16 }}>
        <h3 style={{ margin:'0 0 6px', fontSize:'1rem' }}>Default City</h3>
        <p className="small" style={{ margin:'0 0 12px', color:'var(--muted)', lineHeight:1.5 }}>
          Home will open with events from this city. You can temporarily view another city from Home.
        </p>
        <CitySelector value={defaultCity} onChange={setDefaultCity} />
        <button className="btn-light" onClick={saveCity} disabled={savingCity || defaultCity === profile?.defaultCity}
          style={{ marginTop:10 }}>
          {savingCity ? 'Saving...' : 'Save Default City'}
        </button>
      </div>

      <p><b>Role:</b> {profile?.role}</p>
      <p>
        <b>Email Reminders:</b>{' '}
        {profile?.reminderEmailEnabled ? 'Enabled' : 'Disabled'}
      </p>

      <button className="btn-light" onClick={toggleReminder} disabled={!!savingPreference}>
        {savingPreference === 'reminders'
          ? 'Saving...'
          : `${profile?.reminderEmailEnabled ? 'Disable' : 'Enable'} Email Reminders`}
      </button>

      {isAdmin && (
        <div style={{ marginTop:16, padding:16, border:'1px solid var(--border)',
          borderRadius:10, background:'var(--card-alt, #f8fafc)' }}>
          <h3 style={{ margin:'0 0 6px', fontSize:'1rem' }}>Admin Email Alerts</h3>
          <p className="small" style={{ margin:'0 0 12px', lineHeight:1.55 }}>
            Operational alerts for new users and events added or deleted. This setting is separate from your event reminders.
          </p>
          <p style={{ margin:'0 0 10px', fontSize:'0.875rem' }}>
            <b>Status:</b> {profile?.adminAlertEmailEnabled !== false ? 'Enabled' : 'Disabled'}
          </p>
          <button className="btn-light" onClick={toggleAdminAlerts} disabled={!!savingPreference}>
            {savingPreference === 'admin'
              ? 'Saving...'
              : `${profile?.adminAlertEmailEnabled !== false ? 'Unsubscribe from' : 'Subscribe to'} Admin Alerts`}
          </button>
        </div>
      )}

      {preferenceError && <div className="error" role="alert">{preferenceError}</div>}

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
          window.__showShareSheet({
            text: msg,
            imageUrl: '/community-events-app-poster.jpg',
            title: 'Share the App',
            fileName: 'community-events-australia-poster.jpg',
          });
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
      <p><a href="/shia-events-australia.html" target="_blank">Shia Majlis and Muharram programs across Australia</a></p>
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
          <p style={{ fontWeight:800, fontSize:'0.875rem', margin:'0 0 8px', color:'#9a3412' }}>
            What should happen to your events?
          </p>
          <p style={{ fontSize:'0.8125rem', color:'#92400e', margin:'0 0 14px', lineHeight:1.5 }}>
             Your events will not be deleted. Choose when your currently active events should become inactive.
          </p>
          <div style={{ display:'flex', gap:10 }}>
            <button onClick={() => { setArchiveEventsNow(false); setDeleteStep('confirm'); }}
              style={{ flex:1, padding:'11px', borderRadius:11, fontWeight:800, fontSize:'0.8125rem',
                background:'var(--teal,#0f766e)', color:'white', border:'none', cursor:'pointer' }}>
              Keep Active Until Expiry
            </button>
            <button onClick={() => { setArchiveEventsNow(true); setDeleteStep('confirm'); }}
              style={{ flex:1, padding:'11px', borderRadius:11, fontWeight:800, fontSize:'0.8125rem',
                background:'#dc2626', color:'white', border:'none', cursor:'pointer' }}>
              Make Inactive Now
            </button>
          </div>
          <button onClick={cancelDelete}
            style={{ width:'100%', marginTop:8, padding:'9px', borderRadius:11,
              fontWeight:700, fontSize:'0.8125rem', background:'transparent',
              color:'var(--muted)', border:'1px solid var(--border)', cursor:'pointer' }}>
            Cancel
          </button>
        </div>
      )}

      {/* Step 2: Confirm deletion */}
      {deleteStep === 'confirm' && (
        <div style={{ marginTop:16, background:'#fef2f2', border:'1px solid #fecaca',
          borderRadius:14, padding:18 }}>
          <p style={{ fontWeight:800, fontSize:'0.875rem', margin:'0 0 8px', color:'#991b1b' }}>
            ⚠️ This cannot be undone
          </p>
          <p style={{ fontSize:'0.8125rem', color:'#7f1d1d', margin:'0 0 14px', lineHeight:1.5 }}>
            Your account will be permanently deleted.{' '}
            {archiveEventsNow
              ? 'Your active events will be moved to the inactive archive now. Event, host and submission details will be retained.'
              : 'Your events will remain active until their normal expiry date, then move to the inactive archive. Event, host and submission details will be retained.'}
          </p>
          <div style={{ display:'flex', gap:10 }}>
            <button onClick={confirmDelete}
              style={{ flex:1, padding:'11px', borderRadius:11, fontWeight:800, fontSize:'0.8125rem',
                background:'#dc2626', color:'white', border:'none', cursor:'pointer' }}>
              Yes, Delete My Account
            </button>
            <button onClick={cancelDelete}
              style={{ flex:1, padding:'11px', borderRadius:11, fontWeight:800, fontSize:'0.8125rem',
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
          fontWeight: 900, fontSize: '1.5rem', letterSpacing: 2,
          backgroundImage: 'linear-gradient(135deg,#1e3a8a,#3b82f6)',
          WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
          marginBottom: 2, fontFamily: 'Georgia, serif',
        }}>
          SIZA
        </div>
        <div style={{
          fontSize: '0.625rem', letterSpacing: 3, color: 'var(--muted)',
          fontWeight: 700, marginBottom: 12,
        }}>
          CREATE · SHARE · CONNECT
        </div>
        <p style={{ margin: '0 0 6px', fontWeight: 800, fontSize: '0.875rem', color: 'var(--text)' }}>
          Community Events Australia
        </p>
        <p style={{ margin: '0 0 12px', fontSize: '0.78125rem', color: 'var(--muted)', lineHeight: 1.6 }}>
          An initiative by <b>SIZA Apps</b>, offered as a service to the
          community — empowering smarter community event management and
          sharing to help build stronger, more connected communities.
        </p>
        <div style={{
          display: 'inline-block', background: 'var(--card,white)',
          border: '1px solid var(--border)', borderRadius: 10,
          padding: '6px 14px', fontSize: '0.71875rem', color: 'var(--muted)',
          fontFamily: 'monospace',
        }}>
          Build {buildNumber}
        </div>
      </div>

    </div>
  );
}
