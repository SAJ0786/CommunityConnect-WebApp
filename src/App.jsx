import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signInAnonymously, signOut } from 'firebase/auth';
import { auth, firebaseConfigured } from './firebase/firebase';
import { ensureUserProfile, updateProfile } from './services/userService';
import { deleteEvent, getActiveEvents, listenLiveEvents } from './services/eventService';
import { requestNotificationPermission } from './services/notificationService';
import Header from './components/Header';
import AuthPage from './pages/AuthPage';
import Home from './pages/Home';
import BottomNav from './components/BottomNav';
import AppWalkthrough from './components/AppWalkthrough';
import ToastContainer from './components/Toast';
import ShareSheet from './components/ShareSheet';
import DefaultCityPrompt from './components/DefaultCityPrompt';
import { normalizeCity } from './utils/cities';
import {
  clearPrivateEventCaches,
  readEventCache,
  readProfileCache,
  writeEventCache,
  writeProfileCache,
} from './services/eventCache';

const AddEvent = lazy(() => import('./pages/AddEvent'));
const EditEvent = lazy(() => import('./pages/EditEvent'));
const AISearch = lazy(() => import('./pages/AISearch'));
const MyEvents = lazy(() => import('./pages/MyEvents'));
const Profile = lazy(() => import('./pages/Profile'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const StreamCard = lazy(() => import('./pages/StreamCard'));
const Favourites = lazy(() => import('./pages/Favourites'));
const AddSeriesEvents = lazy(() => import('./pages/AddSeriesEvents'));
const BulkShare = lazy(() => import('./pages/BulkShare'));
const InstallApp = lazy(() => import('./pages/InstallApp'));
const CalendarView = lazy(() => import('./pages/CalendarView'));
const StreamedVideos = lazy(() => import('./pages/StreamedVideos'));

function PageLoadingFallback() {
  return (
    <div className="page-loading-skeleton" role="status" aria-label="Loading page">
      <div className="skeleton-line wide" />
      <div className="skeleton-card" />
      <div className="skeleton-card short" />
    </div>
  );
}

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
  const [profileVerified, setProfileVerified] = useState(false);
  const [events, setEvents]             = useState([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [offlineMode, setOfflineMode]   = useState(() => typeof navigator !== 'undefined' ? !navigator.onLine : false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [loading, setLoading]           = useState(true);
  const [authMode, setAuthMode]         = useState(null);
  const [activeStream,   setActiveStream]   = useState(null); // { event, role }
  const [streamRecovery, setStreamRecovery] = useState(null);

  useEffect(() => {
    const dataEntryPages = new Set(['add', 'edit', 'series', 'bulkshare', 'admin']);
    window.__communityCanAutoUpdate = () => {
      const activeElement = document.activeElement;
      const enteringData = activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(activeElement.tagName);
      return !activeStream && !dataEntryPages.has(page) && !enteringData;
    };
    return () => { delete window.__communityCanAutoUpdate; };
  }, [activeStream, page]);
  const onStreamStart = useCallback((event, channel, role, hostUrl, nativeStream) => {
    setActiveStream({ event, role, hostUrl, nativeStream, show: true });
    setStreamRecovery(null);
    if (role === 'host' && nativeStream?.sessionId) {
      try {
        localStorage.setItem('communityActiveStream', JSON.stringify({
          eventId: event.id,
          sessionId: nativeStream.sessionId,
          watchUrl: nativeStream.watchUrl || null,
          savedAt: Date.now(),
        }));
      } catch {}
    }
  }, []);
  const [savedIds,       setSavedIds]       = useState([]); // null | 'guest' | 'user'
  const [authError, setAuthError]       = useState('');
  const [redirectChecked, setRedirectChecked] = useState(false);

  const processingUidRef       = useRef(null);
  const registrationInProgress = useRef(false); // true while AuthPage collects name/email
  const eventsRequestRef        = useRef(0);

  const loadEvents = useCallback(async (guestMode = authMode === 'guest') => {
    const requestId = ++eventsRequestRef.current;
    const uid = guestMode ? 'guest' : auth.currentUser?.uid;
    const cached = readEventCache(guestMode, uid);
    if (cached?.events?.length) {
      setEvents(cached.events);
      setOfflineMode(typeof navigator !== 'undefined' ? !navigator.onLine : false);
    }
    setEventsLoading(true);
    try {
      const latest = await getActiveEvents(guestMode);
      if (requestId !== eventsRequestRef.current) return;
      setEvents(latest);
      writeEventCache(guestMode, uid, latest);
      setOfflineMode(false);
    } catch (e) {
      if (requestId !== eventsRequestRef.current) return;
      console.error('Failed to load events:', e);
      setOfflineMode(true);
      if (!cached?.events?.length) setEvents([]);
    } finally {
      if (requestId === eventsRequestRef.current) setEventsLoading(false);
    }
  }, [authMode]);

  const resetAuthState = useCallback(() => {
    eventsRequestRef.current += 1;
    setUser(null);
    setProfile(null);
    setProfileVerified(false);
    setEvents([]);
    setEventsLoading(false);
    setAuthMode(null);
    clearPrivateEventCaches();
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

  // Android may reload a PWA tab under memory or network pressure. A media
  // stream cannot survive that reload, but this marker restores a prominent
  // route back to the same resumable YouTube session.
  useEffect(() => {
    if (authMode !== 'user' || activeStream || !events.length) return;
    try {
      const saved = JSON.parse(localStorage.getItem('communityActiveStream') || 'null');
      if (!saved?.eventId || !saved?.sessionId) return;
      const liveEvent = events.find(event =>
        event.id === saved.eventId && event.isLive && event.liveUrl === saved.sessionId
      );
      if (liveEvent) {
        setStreamRecovery({ event: liveEvent, sessionId: saved.sessionId });
      } else {
        localStorage.removeItem('communityActiveStream');
        setStreamRecovery(null);
      }
    } catch {
      localStorage.removeItem('communityActiveStream');
    }
  }, [authMode, activeStream, events]);

  useEffect(() => {
    if (authMode !== 'guest') return undefined;
    const timer = window.setInterval(() => {
      loadEvents(true);
    }, 60000);
    return () => window.clearInterval(timer);
  }, [authMode, loadEvents]);

  useEffect(() => {
    const updateOnlineState = () => {
      const offline = !navigator.onLine;
      setOfflineMode(offline);
      if (!offline && authMode) loadEvents(authMode === 'guest');
    };
    window.addEventListener('online', updateOnlineState);
    window.addEventListener('offline', updateOnlineState);
    return () => {
      window.removeEventListener('online', updateOnlineState);
      window.removeEventListener('offline', updateOnlineState);
    };
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
    setProfileVerified(false);

    // Restore the last verified local snapshot immediately. Network profile
    // verification and event refresh continue below in parallel.
    const cachedProfile = readProfileCache(authenticatedUser.uid);
    const cachedEvents = readEventCache(false, authenticatedUser.uid);
    const startupProfile = cachedProfile || buildFallbackProfile(authenticatedUser);
    setUser(authenticatedUser);
    setProfile(startupProfile);
    setAuthMode('user');
    setEvents(cachedEvents?.events || []);
    setEventsLoading(!cachedEvents?.events?.length);
    setLoading(false);
    const eventRefresh = loadEvents(false);

    try {
      console.log('Processing authenticated user:', authenticatedUser.uid);

      let p = null;
      let verifiedProfile = false;
      try {
        p = await ensureUserProfile(authenticatedUser, extraData);
        verifiedProfile = true;
        setAuthError('');
      } catch (profileErr) {
        console.error('Profile load/create failed:', profileErr.code, profileErr.message);

        // Only force sign-out for banned users — not for Firestore/App Check errors
        if (profileErr.message?.startsWith('BANNED:')) {
          throw profileErr;
        }

        // A transient profile-read failure must not discard a previously
        // verified cached role/name while the device is offline or slow.
        p = cachedProfile || buildFallbackProfile(authenticatedUser);
        setAuthError(
          profileErr.code === 'permission-denied' || profileErr.code === 'failed-precondition'
            ? 'Signed in, but the user profile could not be read. Please check Firestore rules and Firebase App Check configuration.'
            : profileErr.message || 'Signed in, but the user profile could not be loaded.'
        );
      }

      setUser(authenticatedUser);
      setProfile(p);
      setProfileVerified(verifiedProfile);
      writeProfileCache(authenticatedUser.uid, p);
      setAuthMode('user');
      try { localStorage.removeItem('socialLoginStarted'); } catch (_) {}
      setPage('home');
      // Load saved event IDs
      try {
        const { getSavedEvents } = await import('./services/userService');
        getSavedEvents(authenticatedUser.uid).then(setSavedIds).catch(() => {});
      } catch {}
      // Request push notification permission after login (non-blocking)
      requestNotificationPermission(authenticatedUser.uid).catch(() => {});

      await eventRefresh;

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
        if (!navigator.onLine) {
          const cachedGuestEvents = readEventCache(true, 'guest');
          if (cachedGuestEvents?.events?.length) {
            setUser({ uid: 'guest', isAnonymous: true, offlineOnly: true });
            setProfile(null);
            setAuthMode('guest');
            setAuthError('');
            setEvents(cachedGuestEvents.events);
            setEventsLoading(false);
            setOfflineMode(true);
            setLoading(false);
            return;
          }
        }
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
        setLoading(false);
        await loadEvents(true);
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
        // AuthPage sets registrationInProgress before confirming the OTP.
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
      setLoading(false);
      await loadEvents(true);
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
      notes:               event.notes               || '',
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

  const saveDefaultCity = async city => {
    const defaultCity = normalizeCity(city);
    await updateProfile(user.uid, { defaultCity });
    const nextProfile = { ...profile, defaultCity };
    setProfile(nextProfile);
    writeProfileCache(user.uid, nextProfile);
  };

  // Force light mode — single theme only (before any conditional returns)
  useEffect(() => {
    document.documentElement.removeAttribute('data-theme');
    try { localStorage.removeItem('theme'); } catch {}
  }, []);

  useEffect(() => {
    if (authMode === 'user' && user?.uid && profile && !profile.isProfileFallback) {
      writeProfileCache(user.uid, profile);
    }
  }, [authMode, user?.uid, profile]);

  if (!firebaseConfigured) return <MissingConfig />;

  if (loading) return (
    <div className="startup-splash" role="status" aria-label="Starting Community Events Australia">
      <img src="/icons/icon-1024.png" alt="" width="148" height="148" />
      <h1 style={{ margin:'8px 0 0', color:'#071733', fontSize:'1.55rem', lineHeight:1.15, textAlign:'center' }}>
        Community Events Australia
      </h1>
      <div className="startup-splash-progress" aria-hidden="true"><span /></div>
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
  const shared     = { user, profile, events, eventsLoading, offlineMode, setPage, setEditingEvent, handleDelete, handleCopy, isGuest, loadEvents, savedIds, onSaveToggle: handleSaveToggle, onStreamStart, focusEventId, setFocusEventId };
  const guestPage  = ['home','search','calendar','streams'].includes(page) ? page : 'home';
  const activePage = isGuest ? guestPage : page;

  return (
    <div className="app-shell">
      <ToastContainer />

      {/* ── Full-screen stream card — stays MOUNTED while active so the   ── */}
      {/* ── camera + WebSocket session persist when minimised.            ── */}
      {activeStream && (
        <Suspense fallback={null}>
        <StreamCard
          event={activeStream.event}
          role={activeStream.role}
          nativeStream={activeStream.nativeStream}
          hidden={!activeStream.show}
          onClose={() => {
            try { localStorage.removeItem('communityActiveStream'); } catch {}
            setActiveStream(null);
            setStreamRecovery(null);
            loadEvents();
          }}
          onMinimise={() => setActiveStream(s => ({ ...s, show: false }))}
          onEnded={async (endedId) => {
            try { localStorage.removeItem('communityActiveStream'); } catch {}
            setStreamRecovery(null);
            // Optimistically flip the card to "not live" instantly so the UI
            // updates immediately, without waiting for Firestore to propagate.
            setEvents(prev => prev.map(ev =>
              ev.id === endedId
                ? { ...ev, isLive: false, liveUrl: null, liveWatchUrl: null, liveSource: null }
                : ev
            ));
            // Then re-fetch from server to stay authoritative.
            await loadEvents();
          }}
        />
        </Suspense>
      )}

      {/* ── Floating "Return to Stream" button when minimised ── */}
      {activeStream && !activeStream.show && (
        <button
          onClick={() => setActiveStream(s => ({ ...s, show: true }))}
          style={{
            position: 'fixed', bottom: 80, right: 16, zIndex: 9998,
            background: '#0f766e', color: 'white', border: 'none',
            borderRadius: 50, padding: '12px 18px',
            display: 'flex', alignItems: 'center', gap: 8,
            fontWeight: 900, fontSize: '0.8125rem', cursor: 'pointer',
            boxShadow: '0 4px 20px rgba(15,118,110,0.5)',
            animation: 'returnPulse 2s infinite',
          }}>
          <span style={{ animation: 'liveBlink 1s infinite' }}>🔴</span>
          Return to Stream
          <style>{`
            @keyframes returnPulse{0%,100%{box-shadow:0 4px 20px rgba(15,118,110,0.5)}50%{box-shadow:0 4px 32px rgba(15,118,110,0.9)}}
            @keyframes liveBlink{0%,100%{opacity:1}50%{opacity:0.3}}
          `}</style>
        </button>
      )}

      {!activeStream && streamRecovery && (
        <button
          onClick={() => {
            setPage('home');
            setFocusEventId(streamRecovery.event.id);
          }}
          style={{
            position:'fixed', bottom:80, right:16, zIndex:9998,
            background:'#b45309', color:'white', border:'2px solid white',
            borderRadius:50, padding:'13px 18px', display:'flex', alignItems:'center', gap:8,
            fontWeight:900, fontSize:'0.8125rem', cursor:'pointer',
            boxShadow:'0 5px 24px rgba(180,83,9,.5)',
          }}>
          <span>↻</span> Resume Stream
        </button>
      )}
      <ShareSheet />
      {!isGuest && profileVerified && profile && !profile.defaultCity && (
        <DefaultCityPrompt onSave={saveDefaultCity} />
      )}
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

      {offlineMode && events.length > 0 && (
        <div className="card" style={{ margin: '10px auto 0', maxWidth: 900, borderColor: '#99d6cf', background: '#e9fbf8' }}>
          <p className="small" style={{ margin: 0, color: '#0f766e', lineHeight: 1.5, fontWeight: 700 }}>
            Offline mode: showing saved events from this device. Sharing and directions can use saved event details; live status and new updates will refresh when internet returns.
          </p>
        </div>
      )}

      <div className={`app-content-frame ${activePage === 'home' ? 'is-home' : 'is-subpage'}`} style={{ display:'flex', alignItems:'flex-start',
        maxWidth: activePage === 'home' ? 1720 : 1200, margin:'0 auto' }}>
        <div className={`app-page-main ${activePage === 'home' ? 'is-home' : 'is-subpage'} page-${activePage}`} style={{ flex:1, minWidth:0 }}>
          {/* Prominent back button on all sub-pages (not Home) */}
          {activePage !== 'home' && (
            <div style={{ padding:'10px 16px 4px' }}>
              <button onClick={() => setPage(activePage === 'edit' ? 'my' : 'home')}
                style={{
                  display:'inline-flex', alignItems:'center', gap:8,
                  background:'white', border:'1px solid var(--border,#e8edec)',
                  borderRadius:12, padding:'9px 16px 9px 12px', cursor:'pointer',
                  fontSize:'0.875rem', fontWeight:800, color:'var(--teal,#0f766e)',
                  boxShadow:'0 2px 8px rgba(0,0,0,0.05)',
                }}>
                <span style={{ fontSize:'1.25rem', lineHeight:1 }}>‹</span>
                Back
              </button>
            </div>
          )}

          <Suspense fallback={<PageLoadingFallback />}>
          {activePage === 'home'      && <Home      {...shared} />}
          {activePage === 'search'    && <AISearch   {...shared} />}
          {activePage === 'streams'   && <StreamedVideos isGuest={isGuest} />}

          {activePage === 'calendar'  && (
            isGuest
              ? <div className="card center" style={{ marginTop: 24 }}>
                  <p style={{ fontSize: '2.5rem', margin: '0 0 12px' }}>🔒</p>
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
          </Suspense>

          {isGuest && !['home','search','calendar','streams'].includes(page) && (
            <div className="card center" style={{ margin: '40px 16px' }}>
              <div style={{ fontSize: '2rem', marginBottom: 12 }}>🔒</div>
              <h3 style={{ margin: '0 0 8px' }}>Login Required</h3>
              <p className="small" style={{ marginBottom: 16 }}>
                Please create an account or log in to access this feature.
              </p>
              <button onClick={() => setPage('home')}>← Back to Events</button>
            </div>
          )}
        </div>

        {activePage !== 'home' && <div className="desktop-sidebar">
          <div className="card" style={{ margin: '16px 16px 16px 0' }}>
            <h3 style={{ margin: '0 0 10px', fontSize: '0.9375rem', color: 'var(--teal)' }}>📅 Community Events</h3>
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
        </div>}
      </div>

      <style>{`
        .desktop-sidebar { display: none; width: 280px; flex-shrink: 0; position: sticky; top: 88px; align-self: flex-start; }
        @media (min-width: 900px) { .desktop-sidebar { display: block; } }
      `}</style>

      <BottomNav page={activePage} setPage={setPage} isGuest={isGuest} />

      {/* First-time walkthrough */}
      <AppWalkthrough
        isGuest={isGuest}
        userId={user?.uid}
        completed={profile?.walkthroughCompleted !== false}
        onComplete={() => {
          if (isGuest || !user?.uid) return;
          setProfile(prev => prev ? { ...prev, walkthroughCompleted: true } : prev);
          updateProfile(user.uid, { walkthroughCompleted: true }).catch(error => {
            console.error('Could not save walkthrough completion:', error);
          });
        }}
      />
    </div>
  );
}
