import React, { useCallback, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signInAnonymously, signOut } from 'firebase/auth';
import { auth, firebaseConfigured } from './firebase/firebase';
import { ensureUserProfile } from './services/userService';
import { deleteEvent, getActiveEvents, listenLiveEvents } from './services/eventService';
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
import InstallApp from './pages/InstallApp';
import CalendarView from './pages/CalendarView';
import BottomNav from './components/BottomNav';
import AppWalkthrough from './components/AppWalkthrough';
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

  // Scroll to top whenever the active page changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [page]);
  const [focusEventId, setFocusEventId] = useState(null);
  const [user, setUser]                 = useState(null);
  const [profile, setProfile]           = useState(null);
  const [events, setEvents]             = useState([]);
  const [editingEvent, setEditingEvent] = useState(null);
  const [loading, setLoading]           = useState(true);
  const [authMode, setAuthMode]         = useState(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [activeStream,   setActiveStream]   = useState(null); // { event, role }
  const onStreamStart = useCallback((event, channel, role, hostUrl, nativeStream) => {
    setActiveStream({ event, role, hostUrl, nativeStream, show: true });
  }, []);
  const [savedIds,       setSavedIds]       = useState([]); // null | 'guest' | 'user'
  const [authError, setAuthError]       = useState('');
  const [redirectChecked, setRedirectChecked] = useState(false);

  const processingUidRef       = useRef(null);
  const registrationInProgress = useRef(false); // true while AuthPage collects name/email

  const loadEvents = useCallback(async (guestMode = authMode === 'guest') => {
    try {
      setEvents(await getActiveEvents(guestMode));
    } catch (e) {
      console.error('Failed to load events:', e);
      setEvents([]);
    }
  }, [authMode]);

  const resetAuthState = useCallback(() => {
    setUser(null);
    setProfile(null);
    setEvents([]);
    setAuthMode(null);
  }, []);

  // ── Real-time sync for isLive status ──────────────────────────────────────
  // Keeps "LIVE NOW" / "Watch on YouTube" badges current across all open apps
  // — e.g. when another host ends their stream, viewers see it disappear
  // within seconds without needing to reload.
  useEffect(() => {
    if (authMode !== 'user') return undefined;
    const unsub = listenLiveEvents((liveEvents) => {
      const liveById = new Map(liveEvents.map(e => [e.id, e]));
      setEvents(prev => prev.map(ev => {
        if (liveById.has(ev.id)) {
          return { ...ev, ...liveById.get(ev.id) }; // still live — sync latest fields
        }
        if (ev.isLive) {
          // Was live, no longer in the live set — clear it
          return { ...ev, isLive: false, liveUrl: null, liveWatchUrl: null };
        }
        return ev;
      }));
    });
    return unsub;
  }, [authMode]);

  useEffect(() => {
    if (authMode !== 'guest') return undefined;
    const timer = window.setInterval(() => {
      loadEvents(true);
    }, 60000);
    return () => window.clearInterval(timer);
  }, [authMode, loadEvents]);

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
      await loadEvents(false);
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
        await loadEvents(true);
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

    // Social login redirect handling removed — app now uses phone-only auth
    setRedirectChecked(true);

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
      audienceType:        event.audienceType        || 'Family Event',
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
  const shared     = { user, profile, events, setPage, setEditingEvent, handleDelete, handleCopy, isGuest, loadEvents, savedIds, onSaveToggle: handleSaveToggle, onStreamStart, focusEventId, setFocusEventId };
  const guestPage  = ['home','search','calendar'].includes(page) ? page : 'home';
  const activePage = isGuest ? guestPage : page;

  return (
    <div className="app-shell">
      <ToastContainer />

      {/* ── Full-screen stream card — stays MOUNTED while active so the   ── */}
      {/* ── camera + WebSocket session persist when minimised.            ── */}
      {activeStream && (
        <StreamCard
          event={activeStream.event}
          role={activeStream.role}
          nativeStream={activeStream.nativeStream}
          hidden={!activeStream.show}
          onClose={() => { setActiveStream(null); loadEvents(); }}
          onMinimise={() => setActiveStream(s => ({ ...s, show: false }))}
          onEnded={async (endedId) => {
            // Optimistically flip the card to "not live" instantly so the UI
            // updates immediately, without waiting for Firestore to propagate.
            setEvents(prev => prev.map(ev =>
              ev.id === endedId
                ? { ...ev, isLive: false, liveUrl: null, liveWatchUrl: null }
                : ev
            ));
            // Then re-fetch from server to stay authoritative.
            await loadEvents();
          }}
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
        events={events}
        onOpenEvent={(id) => { setFocusEventId(id); setPage('home'); }}
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
          {/* Prominent back button on all sub-pages (not Home) */}
          {activePage !== 'home' && (
            <div style={{ padding:'10px 16px 4px' }}>
              <button onClick={() => setPage(activePage === 'edit' ? 'my' : 'home')}
                style={{
                  display:'inline-flex', alignItems:'center', gap:8,
                  background:'white', border:'1px solid var(--border,#e8edec)',
                  borderRadius:12, padding:'9px 16px 9px 12px', cursor:'pointer',
                  fontSize:14, fontWeight:800, color:'var(--teal,#0f766e)',
                  boxShadow:'0 2px 8px rgba(0,0,0,0.05)',
                }}>
                <span style={{ fontSize:20, lineHeight:1 }}>‹</span>
                Back
              </button>
            </div>
          )}

          {activePage === 'home'      && <Home      {...shared} />}
          {activePage === 'search'    && <AISearch   {...shared} />}

          {activePage === 'calendar'  && (
            isGuest
              ? <div className="card center" style={{ marginTop: 24 }}>
                  <p style={{ fontSize: 40, margin: '0 0 12px' }}>🔒</p>
                  <h3 style={{ margin: '0 0 8px' }}>Login Required</h3>
                  <p className="small" style={{ margin: '0 0 16px', color: 'var(--muted)' }}>
                    Please sign in to view and sync community events to your calendar.
                  </p>
                </div>
              : <CalendarView {...shared} />
          )}

          {!isGuest && activePage === 'add'        && <AddEvent      user={user} profile={profile} onSaved={afterSave} setPage={setPage} events={events} initialEvent={editingEvent?.id === undefined ? editingEvent : null} />}
          {!isGuest && activePage === 'edit'       && <EditEvent     editingEvent={editingEvent} onSaved={afterSave} user={user} profile={profile} events={events} />}
          {!isGuest && activePage === 'my'         && <MyEvents      {...shared} />}
          {!isGuest && activePage === 'favourites'  && <Favourites    {...shared} />}
          {!isGuest && activePage === 'profile'    && <Profile       user={user} profile={profile} setProfile={setProfile} />}
          {!isGuest && activePage === 'admin'      && <AdminDashboard {...shared} />}
          {!isGuest && activePage === 'series'     && <AddSeriesEvents user={user} profile={profile} setPage={setPage} />}
          {!isGuest && activePage === 'bulkshare'  && <BulkShare     events={events} profile={profile} user={user} />}
          {!isGuest && activePage === 'install'    && <InstallApp />}

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

      <BottomNav page={activePage} setPage={setPage} isGuest={isGuest} />

      {/* First-time walkthrough */}
      <AppWalkthrough isGuest={isGuest} userId={user?.uid} />
    </div>
  );
}
