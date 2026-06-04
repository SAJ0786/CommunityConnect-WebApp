import React, { useCallback, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signInAnonymously, getRedirectResult, signOut } from 'firebase/auth';
import { auth, firebaseConfigured } from './firebase/firebase';
import { ensureUserProfile } from './services/userService';
import { deleteEvent, getActiveEvents } from './services/eventService';
import { requestNotificationPermission } from './services/notificationService';
import Header from './components/Header';
import AuthPage from './pages/AuthPage';
import Home from './pages/Home';
import AddEvent from './pages/AddEvent';
import EditEvent from './pages/EditEvent';
import AISearch from './pages/AISearch';
import CalendarSync from './pages/CalendarSync';
import MyEvents from './pages/MyEvents';
import Profile from './pages/Profile';
import AdminDashboard from './pages/AdminDashboard';
import FixLive from './pages/FixLive';
import StreamCard from './pages/StreamCard';
import Favourites from './pages/Favourites';
import AddSeriesEvents from './pages/AddSeriesEvents';
import BulkShare from './pages/BulkShare';
import ToastContainer from './components/Toast';
import OnboardingSlides from './components/OnboardingSlides';
import ShareSheet from './components/ShareSheet';

function MissingConfig() {
  return (
    <div style={{ maxWidth: 560, margin: '40px auto', padding: 24 }}>
      <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 16, padding: 24 }}>
        <h2 style={{ color: '#991b1b', margin: '0 0 12px' }}>⚠️ Firebase Not Configured</h2>
        <p style={{ color: '#7f1d1d', margin: '0 0 8px' }}>
          Copy <code>.env.example</code> to <code>.env</code>, fill in your Firebase values, then run <code>npm run build && firebase deploy</code>.
        </p>
      </div>
    </div>
  );
}

export default function App() {
  const [page, setPage]                 = useState('home');
  const [user, setUser]                 = useState(null);
  const [profile, setProfile]           = useState(null);
  const [events, setEvents]             = useState([]);
  const [editingEvent, setEditingEvent] = useState(null);
  const [loading, setLoading]           = useState(true);
  const [authMode, setAuthMode]         = useState(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [activeStream,   setActiveStream]   = useState(null); // { event, role }
  const [savedIds,       setSavedIds]       = useState([]); // null | 'guest' | 'user'
  const [authError, setAuthError]       = useState('');
  const [redirectChecked, setRedirectChecked] = useState(false);

  const processingUidRef       = useRef(null);
  const registrationInProgress = useRef(false); // true while AuthPage collects name/email

  const loadEvents = useCallback(async () => {
    try {
      setEvents(await getActiveEvents());
    } catch (e) {
      console.error('Failed to load events:', e);
      setEvents([]);
    }
  }, []);

  const resetAuthState = useCallback(() => {
    setUser(null);
    setProfile(null);
    setEvents([]);
    setAuthMode(null);
  }, []);

  const buildFallbackProfile = useCallback((authenticatedUser) => ({
    uid: authenticatedUser.uid,
    fullName:
      authenticatedUser.displayName ||
      authenticatedUser.email ||
      authenticatedUser.phoneNumber ||
      'Community Member',
    email: authenticatedUser.email || '',
    phoneNumber: authenticatedUser.phoneNumber || '',
    role: 'user',
    isProfileFallback: true,
  }), []);

  const processAuthenticatedUser = useCallback(async (authenticatedUser, extraData = {}) => {
    if (!authenticatedUser) return;

    // Prevent duplicate processing when getRedirectResult and onAuthStateChanged both fire
    if (processingUidRef.current === authenticatedUser.uid) return;
    processingUidRef.current = authenticatedUser.uid;

    setLoading(true);
    try {
      console.log('Processing authenticated user:', authenticatedUser.uid);

      let p = null;
      try {
        p = await ensureUserProfile(authenticatedUser, extraData);
        setAuthError('');
      } catch (profileErr) {
        console.error('Profile load/create failed:', profileErr.code, profileErr.message);

        // Only force sign-out for banned users — not for Firestore/App Check errors
        if (profileErr.message?.startsWith('BANNED:')) {
          throw profileErr;
        }

        p = buildFallbackProfile(authenticatedUser);
        setAuthError(
          profileErr.code === 'permission-denied' || profileErr.code === 'failed-precondition'
            ? 'Signed in, but the user profile could not be read. Please check Firestore rules and Firebase App Check configuration.'
            : profileErr.message || 'Signed in, but the user profile could not be loaded.'
        );
      }

      setUser(authenticatedUser);
      setProfile(p);
      setAuthMode('user');
      try { localStorage.removeItem('socialLoginStarted'); } catch (_) {}
      await loadEvents();
      setPage('home');
      // Load saved event IDs
      try {
        const { getSavedEvents } = await import('./services/userService');
        getSavedEvents(authenticatedUser.uid).then(setSavedIds).catch(() => {});
      } catch {}
      // Show onboarding slides on first visit
      try {
        if (!localStorage.getItem('onboardingDone')) setShowOnboarding(true);
      } catch {}
      // Request push notification permission after login (non-blocking)
      requestNotificationPermission(authenticatedUser.uid).catch(() => {});

      console.log('Login complete — authMode=user');
    } catch (e) {
      console.error('Auth processing error:', e.code, e.message);

      setAuthError(
        e.message?.startsWith('BANNED:')
          ? '🚫 Your account has been suspended. Contact communityeventssydney@gmail.com'
          : e.message || 'Login failed. Please try again.'
      );

      resetAuthState();

      try {
        await signOut(auth);
      } catch (signOutErr) {
        console.warn('Sign-out after failed processing also failed:', signOutErr);
      }
    } finally {
      processingUidRef.current = null;
      setLoading(false);
    }
  }, [buildFallbackProfile, loadEvents, resetAuthState]);

  useEffect(() => {
    if (!firebaseConfigured) {
      setLoading(false);
      return undefined;
    }

    let cancelled = false;

    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (cancelled) return;

      console.log(
        'onAuthStateChanged fired:',
        u?.uid,
        u?.isAnonymous,
        u?.providerData?.[0]?.providerId
      );

      if (!u) {
        // Only wait for redirect result if we explicitly started a social login
        // AND it was within the last 3 minutes AND redirect hasn't been checked yet
        try {
          const raw = localStorage.getItem('socialLoginStarted');
          if (raw && !redirectChecked) {
            const started = JSON.parse(raw);
            const age = Date.now() - Number(started.at || 0);
            // Only block if login was started recently (< 3 min) — not on signout
            if (age < 3 * 60 * 1000) {
              setLoading(true);
              return;
            }
          }
        } catch (_) {}

        // Always clear state and show login page
        try { localStorage.removeItem('socialLoginStarted'); } catch (_) {}
        resetAuthState();
        setLoading(false);
        return;
      }

      if (u.isAnonymous) {
        setUser(u);
        setProfile(null);
        setAuthMode('guest');
        setAuthError('');
        await loadEvents();
        setLoading(false);
        // Show onboarding to guests on first visit
        try {
          if (!localStorage.getItem('onboardingDone')) setShowOnboarding(true);
        } catch {}
        console.log('Login complete — authMode=guest');
        return;
      }

      // Block processing if registration is in progress
      // Also block phone users who may need registration (check after brief delay)
      if (registrationInProgress.current) {
        console.log('Registration in progress — skipping onAuthStateChanged processing');
        setLoading(false);
        return;
      }

      // For phone-only users (no email), give AuthPage time to set the flag
      // before we process — covers the race condition window
      const isPhoneUser = u.providerData?.[0]?.providerId === 'phone';
      if (isPhoneUser) {
        await new Promise(r => setTimeout(r, 800));
        if (registrationInProgress.current) {
          console.log('Registration flag set — skipping phone user processing');
          setLoading(false);
          return;
        }
      }

      await processAuthenticatedUser(u);
    });

    // Handle redirect result — onAuthStateChanged is the source of truth,
    // this only supplements it for the redirect flow
    getRedirectResult(auth)
      .then(async (result) => {
        if (cancelled) return;

        if (result?.user) {
          console.log('Redirect result user:', result.user.uid);
          try { localStorage.removeItem('socialLoginStarted'); } catch (_) {}
          await processAuthenticatedUser(result.user);
          return;
        }

        // If a redirect was started but returned no user
        try {
          const raw = localStorage.getItem('socialLoginStarted');
          if (raw && !auth.currentUser) {
            const started = JSON.parse(raw);
            if (Date.now() - Number(started.at || 0) < 10 * 60 * 1000) {
              setAuthError(
                'Social sign-in returned without a user. This usually means Firebase Auth redirect is not configured correctly for this domain.'
              );
            }
          }
        } catch (_) {}
      })
      .catch((e) => {
        if (cancelled) return;
        console.warn('Redirect result error:', e.code, e.message);
        setAuthError(e.message || 'Login failed after redirect.');
      })
      .finally(() => {
        if (!cancelled) setRedirectChecked(true);
      });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [loadEvents, processAuthenticatedUser, redirectChecked, resetAuthState]);

  const enterAsGuest = async () => {
    setLoading(true);
    try {
      await signInAnonymously(auth);
      // onAuthStateChanged handles the rest (including onboarding)
    } catch (anonErr) {
      console.warn('Anonymous auth failed, using stateless guest:', anonErr.message);
      setUser({ uid: 'guest', isAnonymous: true });
      setProfile(null);
      setAuthMode('guest');
      setAuthError('');
      await loadEvents();
      setLoading(false);
    }
  };

  const handleSaveToggle = async (eventId, save) => {
    try {
      const { toggleSavedEvent } = await import('./services/userService');
      await toggleSavedEvent(user.uid, eventId, save);
      setSavedIds(prev => save ? [...new Set([...prev, eventId])] : prev.filter(id => id !== eventId));
    } catch(e) { console.error('Save toggle failed:', e); }
  };

  const handleDelete = async id => {
    if (!window.confirm('Delete this event?')) return;
    try {
      await deleteEvent(id);
      await loadEvents();
    } catch (e) {
      window.showToast(e.message, 'error');
    }
  };

  const handleCopy = event => {
    const draft = {
      hostName:            event.hostName            || '',
      hostPhone:           event.hostPhone           || '',
      eventDate:           '',
      startTime:           '',
      endTime:             '',
      hijriDate:           '',
      eventType:           event.eventType           || 'Majlis',
      customEventType:     event.customEventType     || '',
      eventTypeDisplay:    event.eventTypeDisplay    || event.eventType || '',
      eventSubject:        event.eventSubject        || '',
      audienceType:        event.audienceType        || 'Mixed Audience',
      organiserType:       event.organiserType       || 'private',
      isOnBehalfOf:        !!event.isOnBehalfOf,
      hostContactOptional: event.hostContactOptional || '',
      address:             event.address             || { fullAddress:'', street:'', suburb:'', state:'NSW', postcode:'', latitude:null, longitude:null },
      speakerName:         event.speakerName         || '',
      reciters:            event.reciters            || [],
    };
    setEditingEvent(draft);
    setPage('add');
  };

  const afterSave = async () => {
    await loadEvents();
    setEditingEvent(null);
    setPage('home');
  };

  // Force light mode — single theme only (before any conditional returns)
  useEffect(() => {
    document.documentElement.removeAttribute('data-theme');
    try { localStorage.removeItem('theme'); } catch {}
  }, []);

  if (!firebaseConfigured) return <MissingConfig />;

  if (loading) return (
    <div className="app-shell">
      {/* ── Full-screen stream card ── */}
      {activeStream && (
        <StreamCard
          event={activeStream.event}
          role={activeStream.role}
          onClose={() => setActiveStream(null)}
        />
      )}
      <Header />
      <div className="card center" style={{ marginTop: 40 }}>
        <p style={{ color: 'var(--muted)' }}>Loading…</p>
      </div>
    </div>
  );

  // ── Not logged in — show AuthPage ─────────────────────────────────────────
  if (!user) return (
    <div className="app-shell">
      <Header showOnly />
      <AuthPage
        authError={authError}
        onRegistrationStart={() => { registrationInProgress.current = true; }}
        onAuthComplete={async (u, extraData) => {
          registrationInProgress.current = false;
          if (!u) {
            await enterAsGuest();
            return;
          }
          await processAuthenticatedUser(u, extraData || {});
        }}
      />
    </div>
  );

  const isGuest    = authMode === 'guest';
  const onStreamStart = (event, channel, role, hostUrl) => setActiveStream({ event, role, hostUrl, show: true });
  const shared     = { user, profile, events, setPage, setEditingEvent, handleDelete, handleCopy, isGuest, loadEvents, savedIds, onSaveToggle: handleSaveToggle, onStreamStart };
  const guestPage  = ['home','search','calendar'].includes(page) ? page : 'home';
  const activePage = isGuest ? guestPage : page;

  return (
    <div className="app-shell">
      <ToastContainer />

      {/* ── Full-screen stream card — persists across navigation ── */}
      {activeStream?.show && (
        <StreamCard
          event={activeStream.event}
          role={activeStream.role}
          hostUrl={activeStream.hostUrl}
          onClose={() => setActiveStream(null)}
          onMinimise={() => setActiveStream(s => ({ ...s, show: false }))}
        />
      )}

      {/* ── Floating "Return to Stream" button when minimised ── */}
      {activeStream && !activeStream.show && (
        <button
          onClick={() => setActiveStream(s => ({ ...s, show: true }))}
          style={{
            position: 'fixed', bottom: 80, right: 16, zIndex: 9998,
            background: '#c0392b', color: 'white', border: 'none',
            borderRadius: 50, padding: '12px 18px',
            display: 'flex', alignItems: 'center', gap: 8,
            fontWeight: 900, fontSize: 13, cursor: 'pointer',
            boxShadow: '0 4px 20px rgba(192,57,43,0.5)',
            animation: 'returnPulse 2s infinite',
          }}>
          <span style={{ animation: 'liveBlink 1s infinite' }}>🔴</span>
          Return to Stream
          <style>{`
            @keyframes returnPulse{0%,100%{box-shadow:0 4px 20px rgba(192,57,43,0.5)}50%{box-shadow:0 4px 32px rgba(192,57,43,0.9)}}
            @keyframes liveBlink{0%,100%{opacity:1}50%{opacity:0.3}}
          `}</style>
        </button>
      )}
      {showOnboarding && (
        <OnboardingSlides onComplete={() => setShowOnboarding(false)} />
      )}
      <ShareSheet />
      <Header
        user={user} profile={profile}
        page={activePage} setPage={setPage}
        isGuest={isGuest}
      />

      {!isGuest && authError && (
        <div className="card" style={{ margin: '12px auto', maxWidth: 900, borderColor: '#f59e0b', background: '#fffbeb' }}>
          <p className="small" style={{ margin: 0, color: '#92400e', lineHeight: 1.5 }}>
            ⚠️ {authError}
          </p>
        </div>
      )}

      <div style={{ display:'flex', alignItems:'flex-start', maxWidth:1200, margin:'0 auto' }}>
        <div style={{ flex:1, minWidth:0 }}>
          {activePage === 'home'      && <Home      {...shared} />}
          {activePage === 'search'    && <AISearch   {...shared} />}

          {activePage === 'calendar'  && (
            isGuest
              ? <div className="card center" style={{ marginTop: 24 }}>
                  <p style={{ fontSize: 40, margin: '0 0 12px' }}>🔒</p>
                  <h3 style={{ margin: '0 0 8px' }}>Login Required</h3>
                  <p className="small" style={{ margin: '0 0 16px', color: 'var(--muted)' }}>
                    Please sign in to sync community events to your calendar.
                  </p>
                </div>
              : <CalendarSync user={user} />
          )}

          {!isGuest && activePage === 'add'        && <AddEvent      user={user} profile={profile} onSaved={afterSave} setPage={setPage} events={events} initialEvent={editingEvent?.id === undefined ? editingEvent : null} />}
          {!isGuest && activePage === 'edit'       && <EditEvent     editingEvent={editingEvent} onSaved={afterSave} user={user} profile={profile} events={events} />}
          {!isGuest && activePage === 'my'         && <MyEvents      {...shared} />}
          {!isGuest && activePage === 'favourites'  && <Favourites    {...shared} />}
          {!isGuest && activePage === 'profile'    && <Profile       user={user} profile={profile} setProfile={setProfile} />}
          {!isGuest && activePage === 'admin'      && <AdminDashboard {...shared} />}
          {!isGuest && activePage === 'series'     && <AddSeriesEvents user={user} profile={profile} setPage={setPage} />}
          {!isGuest && activePage === 'bulkshare'  && <BulkShare     events={events} profile={profile} user={user} />}

          {isGuest && !['home','search','calendar'].includes(page) && (
            <div className="card center" style={{ margin: '40px 16px' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
              <h3 style={{ margin: '0 0 8px' }}>Login Required</h3>
              <p className="small" style={{ marginBottom: 16 }}>
                Please create an account or log in to access this feature.
              </p>
              <button onClick={() => setPage('home')}>← Back to Events</button>
            </div>
          )}
        </div>

        <div className="desktop-sidebar">
          <div className="card" style={{ margin: '16px 16px 16px 0' }}>
            <h3 style={{ margin: '0 0 10px', fontSize: 15, color: 'var(--teal)' }}>📅 Community Events</h3>
            <p className="small" style={{ margin: '0 0 14px', color: 'var(--muted)' }}>Create · Share · Connect</p>
            {!isGuest && (
              <button style={{ width: '100%', marginBottom: 8 }} onClick={() => setPage('add')}>
                ➕ Add Event
              </button>
            )}
            <button className="btn-light" style={{ width: '100%', marginBottom: 8 }} onClick={() => setPage('search')}>
              ✦ AI Search
            </button>
            <button className="btn-light" style={{ width: '100%' }} onClick={() => setPage('calendar')}>
              📅 Sync Calendar
            </button>
          </div>
          <div className="card" style={{ margin: '0 16px 16px 0' }}>
            <p className="small" style={{ margin: 0, color: 'var(--muted)', lineHeight: 1.7 }}>
              🌙 Hijri dates shown on all events<br/>
              🔔 Evening reminders via email<br/>
              📲 Install as app on your phone<br/>
              🤖 AI-powered event search
            </p>
          </div>
        </div>
      </div>

      <style>{`
        .desktop-sidebar { display: none; width: 280px; flex-shrink: 0; position: sticky; top: 88px; align-self: flex-start; }
        @media (min-width: 900px) { .desktop-sidebar { display: block; } }
      `}</style>
    </div>
  );
}
