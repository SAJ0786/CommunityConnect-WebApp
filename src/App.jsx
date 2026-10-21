import BackControl from './components/BackControl';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from './firebase/firebase';
import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, signInAnonymously, signOut } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { auth, firebaseConfigured, functions } from './firebase/firebase';
import { ensureUserProfile, completeMemberProfile, updateProfile } from './services/userService';
import { deleteEvent, getActiveEvents, listenLiveEvents } from './services/eventService';
import { saveNativePushToken, startForegroundPushNotifications, syncGrantedNotificationToken } from './services/notificationService';
import { REGISTRATION_ENABLED } from './config/releaseGates.mjs';
import { registrationEntry } from './registration/registrationLinks.mjs';
import { createRegistrationClient } from './registration/registrationClient.mjs';
import { accountBoundTransport } from './registration/sessionTransport.mjs';
import { RegistrationContext, useRegistrationFeed } from './registration/RegistrationContext';
import { mergePublicEvents } from './registration/eventFeed.mjs';
import PagePanel from './components/PagePanel';
import Header from './components/Header';
import EventsSidebar from './components/EventsSidebar';
import ExperienceSwitch from './components/ExperienceSwitch';
import CompleteMemberProfile from './components/CompleteMemberProfile';
import { memberEntryState } from './utils/memberProfile.mjs';
import './styles/directory.css';
import ExperienceEntry from './pages/ExperienceEntry';
import { getExperience, readExperience, saveExperience } from './config/experiences.mjs';
import { DIRECTORY_NAVIGATION_EVENT, directoryBrowseRoute } from './utils/businessRoutes.mjs';
import Home from './pages/Home';
import BottomNav from './components/BottomNav';
import AppWalkthrough from './components/AppWalkthrough';
import ToastContainer from './components/Toast';
import ShareSheet from './components/ShareSheet';
import DefaultCityPrompt from './components/DefaultCityPrompt';
import { DEFAULT_CITY, normalizeCity } from './utils/cities';
import {
  clearPrivateEventCaches,
  readEventCache,
  writeEventCache,
  writeProfileCache,
  readProfileCache,
} from './services/eventCache';

const RegistrationRoute = REGISTRATION_ENABLED ? lazy(() => import('./registration/RegistrationRoute')) : null;
const AddEvent = lazy(() => import('./pages/AddEvent'));
const EditEvent = lazy(() => import('./pages/EditEvent'));
const AISearch = lazy(() => import('./pages/AISearch'));
const MyEvents = lazy(() => import('./pages/MyEvents'));
const HostInbox = lazy(() => import('./pages/HostInbox'));
const Profile = lazy(() => import('./pages/Profile'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const StreamCard = lazy(() => import('./pages/StreamCard'));
const Favourites = lazy(() => import('./pages/Favourites'));
const BulkShare = lazy(() => import('./pages/BulkShare'));
const InstallApp = lazy(() => import('./pages/InstallApp'));
const CalendarView = lazy(() => import('./pages/CalendarView'));
const StreamedVideos = lazy(() => import('./pages/StreamedVideos'));
const HijriCalendar = lazy(() => import('./pages/HijriCalendar'));
const BusinessDirectory = lazy(() => import('./pages/BusinessDirectory'));
const MemberDirectory = lazy(() => import('./business/MemberDirectory'));

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
      <div style={{ background: 'var(--cc-danger-soft)', border: '1px solid var(--cc-danger-border)', borderRadius: 16, padding: 24 }}>
        <h2 style={{ color: 'var(--cc-danger)', margin: '0 0 12px' }}>⚠️ Firebase Not Configured</h2>
        <p style={{ color: 'var(--cc-danger)', margin: '0 0 8px' }}>
          Copy <code>.env.example</code> to <code>.env</code>, fill in your Firebase values, then run <code>npm run build && firebase deploy</code>.
        </p>
      </div>
    </div>
  );
}

export default function App() {
  const directoryNavigation = useRef(null);
  const directoryLocation = useRef(window.location.pathname + window.location.search);
  const explicitExperienceChoice = useRef(!!directoryBrowseRoute(window.location.pathname));
  const [directoryRevision, setDirectoryRevision] = useState(0);
  const registerDirectoryNavigation = useCallback(handler => { directoryNavigation.current = handler; }, []);
  const openAccountMenu = () => window.dispatchEvent(new CustomEvent('community-events-walkthrough-menu', { detail: { open: true } }));
  const logoutFromDirectory = async () => {
    try { localStorage.removeItem('socialLoginStarted'); await signOut(auth); }
    catch { window.alert('Unable to sign out. Please try again.'); }
  };
  const [selectedExperience, setSelectedExperience] = useState(() => directoryBrowseRoute(window.location.pathname) ? 'businesses' : (new URLSearchParams(window.location.search).has('event') || new URLSearchParams(window.location.search).has('registration')) ? 'events' : readExperience(window.sessionStorage));
  const experienceRef = useRef(selectedExperience);
  const [page, setPage] = useState(() => getExperience(selectedExperience).page);
  const [hostInboxThreadId, setHostInboxThreadId] = useState('');
  const selectExperience = useCallback(id => {
    if (id === 'events' && directoryBrowseRoute(window.location.pathname)) window.history.pushState(null, '', '/');
    directoryLocation.current = window.location.pathname + window.location.search;
    explicitExperienceChoice.current = true;
    const experience = saveExperience(window.sessionStorage, id);
    experienceRef.current = experience.id;
    setSelectedExperience(experience.id);
    setPage(experience.page);
    setAuthError('');
  }, []);
  useEffect(() => {
    const open = event => {
      event.preventDefault();
      window.history.pushState(null, '', event.detail.href);
      setSelectedCity(normalizeCity(new URLSearchParams(window.location.search).get('city') || DEFAULT_CITY));
      setDirectoryRevision(value => value + 1);
      selectExperience('businesses');
    };
    const restore = () => {
      const next = window.location.pathname + window.location.search;
      if (directoryLocation.current === next) return;
      const directory = directoryBrowseRoute(window.location.pathname);
      if (directory) {
        const city = new URLSearchParams(window.location.search).get('city');
        if (city) setSelectedCity(normalizeCity(city));
        setDirectoryRevision(value => value + 1);
      }
      selectExperience(directory ? 'businesses' : 'events');
    };
    window.addEventListener(DIRECTORY_NAVIGATION_EVENT, open);
    window.addEventListener('popstate', restore);
    return () => {
      window.removeEventListener(DIRECTORY_NAVIGATION_EVENT, open);
      window.removeEventListener('popstate', restore);
    };
  }, [selectExperience]);

  // Scroll to top whenever the active page changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [page]);
  const [focusEventId, setFocusEventId] = useState(() => new URLSearchParams(window.location.search).get('event'));
  const [user, setUser]                 = useState(null);
  const [profile, setProfile]           = useState(null);
  useEffect(() => {
    if (!user?.uid || user.isAnonymous) return;
    return onSnapshot(doc(db, 'users', user.uid), snapshot => { if (snapshot.exists() && auth.currentUser?.uid === user.uid) setProfile(snapshot.data()); }, () => {});
  }, [user?.uid, user?.isAnonymous]);
  const [registrationTarget, setRegistrationTarget] = useState(null);
  const [registrationAction, setRegistrationAction] = useState('card');
  const [registrationRevision, setRegistrationRevision] = useState(0);
  const [profileVerified, setProfileVerified] = useState(false);
  const registrationApi = useMemo(() => !REGISTRATION_ENABLED || !user?.uid ? null : createRegistrationClient(
    accountBoundTransport((name, data) => httpsCallable(functions, name)(data), user.uid, () => auth.currentUser?.uid),
    { enabled: true }), [user?.uid, profileVerified, profile?.role, profile?.adminCity]);
  const [profileLoading, setProfileLoading] = useState(false);
  const profileRequestRef = useRef(0);
  useEffect(() => {
    if (!REGISTRATION_ENABLED || !user?.uid || !profileVerified) return;
    const notice = new URLSearchParams(window.location.search);
    if (notice.get('recipient') === user.uid && ['host-inbox','notifications','favourites'].includes(notice.get('notice'))) {
      setSelectedExperience('events');
      if (notice.get('notice') === 'host-inbox') setHostInboxThreadId(notice.get('thread') || '');
      setPage(notice.get('notice'));
      return;
    }
    const target = registrationEntry(window.location.search, user.uid);
    if (target) { setRegistrationTarget(target); setRegistrationAction('card'); setPage('registration'); }
  }, [user?.uid, profileVerified]);
  const [events, setEvents]             = useState([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [offlineMode, setOfflineMode]   = useState(() => typeof navigator !== 'undefined' ? !navigator.onLine : false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [loading, setLoading]           = useState(true);
  const [authMode, setAuthMode]         = useState(null);
  const [selectedCity, setSelectedCity] = useState(() => {
    const city = directoryBrowseRoute(window.location.pathname) && new URLSearchParams(window.location.search).get('city');
    if (city) return normalizeCity(city);
    try {
      return normalizeCity(localStorage.getItem('communitySelectedCity') || DEFAULT_CITY);
    } catch {
      return DEFAULT_CITY;
    }
  });
  const registrationFeed = useRegistrationFeed(registrationApi, 'public', selectedCity, registrationRevision);
  useEffect(() => {
    if (!registrationApi) return;
    const refresh = () => { if (!document.hidden) setRegistrationRevision(value => value + 1); };
    const timer = window.setInterval(refresh, 60000);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, [registrationApi]);
  const [activeStream,   setActiveStream]   = useState(null); // { event, role }
  const [streamRecovery, setStreamRecovery] = useState(null);

  useEffect(() => {
    const dataEntryPages = new Set(['add', 'edit', 'bulkshare', 'admin', 'registration', 'registration-create']);
    window.__communityCanAutoUpdate = () => {
      const activeElement = document.activeElement;
      const enteringData = activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(activeElement.tagName);
      return !activeStream && !dataEntryPages.has(page) && !enteringData;
    };
    return () => { delete window.__communityCanAutoUpdate; };
  }, [activeStream, page]);
  const onStreamStart = useCallback((event, channel, role, hostUrl, nativeStream) => {
    setActiveStream({ event, role, hostUrl, nativeStream, show: true });
    if (event.registrationOnly) setRegistrationRevision(value => value + 1);
    setStreamRecovery(null);
    if (role === 'host' && nativeStream?.sessionId) {
      try {
        localStorage.setItem('communityActiveStream', JSON.stringify({
          eventId: event.id,
          eventCollection:event.registrationOnly ? 'registrationEvents' : 'events',
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
  const eventsRequestRef        = useRef(0);
  const authStateSettledRef     = useRef(false);

  useEffect(() => {
    if (!user?.uid || !profileVerified || memberEntryState(user, profile, false) !== 'ready') return undefined;
    const preferenceEnabled = profile.pushNotificationsEnabled !== undefined
      ? profile.pushNotificationsEnabled !== false
      : profile.reminderEmailEnabled !== false;
    if (!preferenceEnabled) return undefined;

    const saveToken = event => {
      const detail = event?.detail || {};
      const token = detail.token || window.__communityEventsNativePushToken;
      if (!token) return;
      saveNativePushToken(user.uid, token, detail.platform || 'android-native').catch(() => {});
    };

    window.addEventListener('community-events-native-push-token', saveToken);
    saveToken({ detail: { token: window.__communityEventsNativePushToken, platform: 'android-native' } });
    startForegroundPushNotifications().catch(() => {});
    return () => window.removeEventListener('community-events-native-push-token', saveToken);
  }, [user?.uid, profileVerified, profile?.pushNotificationsEnabled, profile?.reminderEmailEnabled, profile]);

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
    profileRequestRef.current += 1;
    processingUidRef.current = null;
    setProfileLoading(false);
    setSavedIds([]);
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
    if (authMode !== 'user' || activeStream || eventsLoading || registrationFeed.loading) return;
    try {
      const saved = JSON.parse(localStorage.getItem('communityActiveStream') || 'null');
      if (!saved?.eventId || !saved?.sessionId) return;
      if (saved.eventCollection === 'registrationEvents' && (!registrationApi || registrationFeed.error)) return;
      const liveEvent = (saved.eventCollection === 'registrationEvents' ? registrationFeed.events : events).find(event =>
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
  }, [authMode, activeStream, events, eventsLoading, registrationApi, registrationFeed.events, registrationFeed.loading, registrationFeed.error]);

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

  const processAuthenticatedUser = useCallback(async authenticatedUser => {
    if (!authenticatedUser || authenticatedUser.isAnonymous || auth.currentUser?.uid !== authenticatedUser.uid) return;
    if (processingUidRef.current === authenticatedUser.uid) return;
    processingUidRef.current = authenticatedUser.uid;
    const request = ++profileRequestRef.current;
    const current = () => request === profileRequestRef.current && auth.currentUser?.uid === authenticatedUser.uid;
    setUser(authenticatedUser);
    setProfile(null);
    setProfileVerified(false);
    setProfileLoading(true);
    setLoading(false);
    setAuthError('');
    const cached = readProfileCache(authenticatedUser.uid);
    if (memberEntryState(authenticatedUser, cached, false) === 'ready') {
      // Restore menu/profile presentation immediately; protected admin pages wait for the server check.
      setProfile({...cached, isSessionHint:true}); setProfileLoading(false);
      if (['admin','superAdmin'].includes(cached.role)) void import('./pages/AdminDashboard').catch(() => {});
      setAuthMode('user'); setPage(getExperience(experienceRef.current).page);
    }
    try {
      const p = await ensureUserProfile(authenticatedUser);
      if (!current()) return;
      setProfile(p);
      if (!explicitExperienceChoice.current && !(new URLSearchParams(window.location.search).has('event') || new URLSearchParams(window.location.search).has('registration')) && ['events','directory'].includes(p.defaultModule)) {
        const preferred = saveExperience(window.sessionStorage, p.defaultModule === 'directory' ? 'businesses' : 'events');
        experienceRef.current = preferred.id; setSelectedExperience(preferred.id);
      }
      setProfileVerified(true);
      setProfileLoading(false);
      if (['admin','superAdmin'].includes(p.role)) void import('./pages/AdminDashboard').catch(() => {});
      // Refresh and existing sessions use the same gate as first registration.
      if (memberEntryState(authenticatedUser, p, false) !== 'ready') return;
      writeProfileCache(authenticatedUser.uid, p);
      setAuthMode('user');
      setPage(getExperience(experienceRef.current).page);
      setSavedIds(p.savedEvents || []);
      syncGrantedNotificationToken(authenticatedUser.uid, p).catch(() => {});
      void loadEvents(false);
    } catch (error) {
      if (current()) {
        setProfile(null);
        setProfileVerified(false);
        setAuthError('Your profile could not be verified. Please reconnect and try again.');
      }
    } finally {
      if (current()) {
        processingUidRef.current = null;
        setProfileLoading(false);
      }
    }
  }, [loadEvents]);

  const authHandlersRef = useRef({});
  authHandlersRef.current = { loadEvents, processAuthenticatedUser, resetAuthState };

  const finishMemberProfile = async details => {
    const account = auth.currentUser;
    if (!account || account.uid !== user?.uid) throw new Error('Please sign in again.');
    const p = await completeMemberProfile(account, details);
    if (auth.currentUser?.uid !== account.uid) return;
    if (memberEntryState(account, p, false) !== 'ready') throw new Error('Your profile could not be confirmed. Please try again.');
    await processAuthenticatedUser(account);
  };

  useEffect(() => {
    if (!firebaseConfigured) {
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    authStateSettledRef.current = false;

    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (cancelled) return;
      authStateSettledRef.current = true;

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
        // Ignore any social-login marker left by old app versions.
        // The app is phone-only now, so startup should never wait here.
        try {
          const raw = localStorage.getItem('socialLoginStarted');
          if (false && raw && !redirectChecked) {
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
        authHandlersRef.current.resetAuthState();
        setLoading(false);
        return;
      }

      if (u.isAnonymous) {
        profileRequestRef.current += 1;
        processingUidRef.current = null;
        setProfileLoading(false);
        setProfileVerified(false);
        setUser(u);
        setProfile(null);
        setAuthMode('guest');
        setAuthError('');
        setLoading(false);
        await authHandlersRef.current.loadEvents(true);
        console.log('Login complete — authMode=guest');
        return;
      }

      await authHandlersRef.current.processAuthenticatedUser(u);
    });

    // Social login redirect handling removed — app now uses phone-only auth
    setRedirectChecked(true);
    const startupTimer = window.setTimeout(() => {
      if (cancelled || authStateSettledRef.current) return;
      console.warn('Firebase auth startup timed out; releasing splash screen.');
      const current = auth.currentUser;
      if (current && !current.isAnonymous) {
        authHandlersRef.current.processAuthenticatedUser(current).catch((err) => {
          console.warn('Timed startup user processing failed:', err);
          setLoading(false);
        });
        return;
      }
      if (current?.isAnonymous) {
        setUser(current);
        setProfile(null);
        setAuthMode('guest');
        setAuthError('');
      } else {
        authHandlersRef.current.resetAuthState();
      }
      setLoading(false);
    }, 8000);

    return () => {
      cancelled = true;
      window.clearTimeout(startupTimer);
      unsubscribe();
    };
  }, [redirectChecked]);

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

  const afterSave = async (message = 'Event saved successfully.') => {
    await loadEvents();
    setEditingEvent(null);
    setPage('home');
    window.showToast?.(message, 'success');
  };

  const saveDefaultCity = async city => {
    const defaultCity = normalizeCity(city);
    await updateProfile(user.uid, { defaultCity });
    const nextProfile = { ...profile, defaultCity };
    setProfile(nextProfile);
    setSelectedCity(defaultCity);
    writeProfileCache(user.uid, nextProfile);
  };

  useEffect(() => {
    if (authMode === 'user' && user?.uid && profileVerified && memberEntryState(user, profile, false) === 'ready') {
      writeProfileCache(user.uid, profile);
    }
  }, [authMode, user?.uid, profile, profileVerified]);

  useEffect(() => {
    if (profile?.defaultCity && !(directoryBrowseRoute(window.location.pathname) && new URLSearchParams(window.location.search).has('city'))) {
      setSelectedCity(normalizeCity(profile.defaultCity));
    }
  }, [profile?.defaultCity]);

  useEffect(() => {
    try { localStorage.setItem('communitySelectedCity', selectedCity); } catch {}
  }, [selectedCity]);

  if (!firebaseConfigured) return <MissingConfig />;

  if (loading) return (
    <div className="startup-splash" role="status" aria-label="Starting Community Connect Australia">
      <img src="/icons/icon-1024.png" alt="" width="148" height="148" />
      <h1 style={{ margin:'8px 0 0', color:'var(--cc-heading)', fontSize:'1.55rem', lineHeight:1.15, textAlign:'center' }}>
        Community Connect Australia
      </h1>
      <div className="startup-splash-progress" aria-hidden="true"><span /></div>
    </div>
  );

  // Choose an experience before sign-in; the destination survives auth callbacks.
  if (!user) return (
    <div className="app-shell">
      {import.meta.env.VITE_LOCAL_PREVIEW === 'true' && <p className="local-preview-notice" role="status">Local development build · live Firebase connection. Sign-in uses your real account. Nothing has been published.</p>}
      <ExperienceEntry
        selected={selectedExperience}
        onSelect={selectExperience}
        authError={authError}
        onAuthComplete={async u => {
          if (!u) {
            await enterAsGuest();
            return;
          }
          await processAuthenticatedUser(u);
        }}
      />
    </div>
  );

  const entryState = memberEntryState(user, profile, profileLoading);
  if (!['guest', 'ready'].includes(entryState)) return <CompleteMemberProfile
    key={user.uid + ':' + entryState} user={user} profile={profile} state={entryState}
    onComplete={finishMemberProfile} onRetry={() => processAuthenticatedUser(user)}
    onSignOut={async () => { await signOut(auth); resetAuthState(); }}
  />;

  const openRegistrationUpdate = row => {
    if (!REGISTRATION_ENABLED || row.module !== 'registration') return false;
    const target = registrationEntry('?registration=' + encodeURIComponent(row.eventId || row.targetId || '') + '&recipient=' + encodeURIComponent(row.recipientUid || user.uid), user.uid);
    if (!target) return false;
    selectExperience('events'); setRegistrationTarget(target); setRegistrationAction('card'); setPage('registration'); return true;
  };
  const isGuest    = authMode === 'guest';
  const openRegistration = (event, action = 'card') => {
    if (isGuest) { signOut(auth).catch(error => window.showToast?.(error.message, 'error')); return; }
    setRegistrationTarget(event.id); setRegistrationAction(action); setPage('registration');
  };
  const unifiedEvents = mergePublicEvents(events, registrationFeed.events);
  const shared     = { user, profile, events: unifiedEvents, eventsLoading: eventsLoading || registrationFeed.loading, offlineMode, setPage, setEditingEvent, handleDelete, handleCopy, isGuest, loadEvents, savedIds, onSaveToggle: handleSaveToggle, onStreamStart, focusEventId, setFocusEventId, selectedCity, setSelectedCity };
  const guestPage  = ['home','businesses','search','calendar','hijri-calendar','streams', ...(REGISTRATION_ENABLED ? ['registration'] : [])].includes(page) ? page : 'home';
  const activePage = isGuest ? guestPage : (page === 'series' ? 'add' : page);

  return (
    <div className="app-shell">
      {import.meta.env.VITE_LOCAL_PREVIEW === 'true' && <p className="local-preview-notice" role="status">Local development build · live data. Changes you make affect your real account.</p>}
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
            if (activeStream.event.registrationOnly) setRegistrationRevision(value => value + 1);
            loadEvents();
          }}
          onMinimise={() => setActiveStream(s => ({ ...s, show: false }))}
          onEnded={async (endedId) => {
            try { localStorage.removeItem('communityActiveStream'); } catch {}
            setStreamRecovery(null);
            if (activeStream.event.registrationOnly) {
              setRegistrationRevision(value => value + 1);
              return;
            }
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
            background: 'var(--cc-accent-strong)', color: 'var(--cc-on-primary)', border: 'none',
            borderRadius: 50, padding: '12px 18px',
            display: 'flex', alignItems: 'center', gap: 8,
            fontWeight: 900, fontSize: '0.8125rem', cursor: 'pointer',
            boxShadow: '0 4px 20px var(--cc-shadow-strong)',
            animation: 'returnPulse 2s infinite',
          }}>
          <span style={{ animation: 'liveBlink 1s infinite' }}>🔴</span>
          Return to Stream
          <style>{`
            @keyframes returnPulse{0%,100%{box-shadow:0 4px 20px var(--cc-shadow-strong)}50%{box-shadow:0 4px 32px var(--cc-shadow-strong)}}
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
            background:'var(--cc-warning-strong)', color:'var(--cc-on-primary)', border:'2px solid var(--cc-surface)',
            borderRadius:50, padding:'13px 18px', display:'flex', alignItems:'center', gap:8,
            fontWeight:900, fontSize:'0.8125rem', cursor:'pointer',
            boxShadow:'0 5px 24px var(--cc-shadow-strong)',
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
        events={unifiedEvents}
        onDirectoryCommand={activePage === 'businesses' && !isGuest && import.meta.env.VITE_DIRECTORY_WORKSPACE_ENABLED === 'true' && import.meta.env.VITE_READ_ONLY_PREVIEW !== 'true' ? command => directoryNavigation.current?.(command) : undefined}
        onOpenEvent={(id) => { setFocusEventId(id); setPage('home'); }}
      />
      <ExperienceSwitch directory={activePage === 'businesses'}
        onEvents={() => { if (activePage === 'businesses') { if (directoryNavigation.current?.('leave') === false) return; selectExperience('events'); } }}
        onBusinesses={() => {
          if (['add', 'edit', 'admin'].includes(activePage)
            && !window.confirm('Open Business Directory? Any unsaved changes on this page may be lost.')) return;
          selectExperience('businesses');
        }} />

      {!isGuest && authError && (
        <div className="card" style={{ margin: '12px auto', maxWidth: 900, borderColor: 'var(--cc-warning)', background: 'var(--cc-warning-soft)' }}>
          <p className="small" style={{ margin: 0, color: 'var(--cc-warning-strong)', lineHeight: 1.5 }}>
            ⚠️ {authError}
          </p>
        </div>
      )}

      {activePage !== 'businesses' && offlineMode && events.length > 0 && (
        <div className="card" style={{ margin: '10px auto 0', maxWidth: 900, borderColor: 'var(--cc-accent-border)', background: 'var(--cc-accent-soft)' }}>
          <p className="small" style={{ margin: 0, color: 'var(--cc-accent-strong)', lineHeight: 1.5, fontWeight: 700 }}>
            Offline mode: showing saved events from this device. Sharing and directions can use saved event details; live status and new updates will refresh when internet returns.
          </p>
        </div>
      )}

      <div className={`app-content-frame ${activePage === 'home' ? 'is-home' : 'is-subpage'} ${activePage !== 'businesses' ? 'cc-events-workspace' : ''}`} style={{ display:'flex', alignItems:'flex-start',
        maxWidth: activePage === 'home' ? 1720 : 1200, margin:'0 auto' }}>
        {activePage !== 'businesses' && <EventsSidebar page={activePage} onNavigate={nextPage => { if (nextPage === 'host-inbox') setHostInboxThreadId(''); setPage(nextPage); }} isGuest={isGuest} profile={profile}/>}
        <div className={`app-page-main ${activePage === 'home' ? 'is-home' : 'is-subpage'} page-${activePage}`} style={{ flex:1, minWidth:0 }}>
          {/* Prominent back button on all sub-pages (not Home) */}
          {!['home', 'businesses', 'registration', 'registration-create'].includes(activePage) && (
            <div style={{ padding:'10px 16px 4px' }}>
              <BackControl onClick={() => {
                if (activePage === 'add' && window.__communityAddEventBack?.()) return;
                setPage(activePage === 'edit' ? 'my' : 'home');
              }} label="Back"/>
            </div>
          )}

          <RegistrationContext.Provider key={[user.uid, profile?.role, profile?.adminCity].join(':')} value={{ api: registrationApi, open: openRegistration, revision: registrationRevision, refresh: () => setRegistrationRevision(value => value + 1) }}>
          {!['businesses', 'registration', 'registration-create', 'notifications'].includes(activePage) && <PagePanel page={activePage}/>}
          {registrationFeed.error && activePage === 'home' && <div className="card" role="alert">{registrationFeed.error} <button onClick={() => setRegistrationRevision(value => value + 1)}>Retry registration events</button></div>}
          <Suspense fallback={<PageLoadingFallback />}>
          {activePage === 'businesses' && (!isGuest && import.meta.env.VITE_DIRECTORY_WORKSPACE_ENABLED === 'true' && import.meta.env.VITE_READ_ONLY_PREVIEW !== 'true'
            ? <MemberDirectory key={`${user.uid}:${directoryRevision}`} user={user} profile={profile} initialCity={selectedCity} onRegisterNavigation={registerDirectoryNavigation} onOpenNotification={openRegistrationUpdate} renderProfile={() => <Profile user={user} profile={profile} setProfile={setProfile}/>} onSignOut={logoutFromDirectory}/>
            : <BusinessDirectory key={directoryRevision} selectedCity={selectedCity} setSelectedCity={setSelectedCity} />)}
          {activePage === 'home'      && <Home      {...shared} />}
          {activePage === 'search'    && <AISearch   {...shared} />}
          {activePage === 'streams'   && <StreamedVideos isGuest={isGuest} />}

          {activePage === 'calendar'  && (
            false
              ? <div className="card center" style={{ marginTop: 24 }}>
                  <p style={{ fontSize: '2.5rem', margin: '0 0 12px' }}>🔒</p>
                  <h3 style={{ margin: '0 0 8px' }}>Login Required</h3>
                  <p className="small" style={{ margin: '0 0 16px', color: 'var(--muted)' }}>
                    Please sign in to view and sync community events to your calendar.
                  </p>
                </div>
              : <CalendarView {...shared} />
          )}

          {REGISTRATION_ENABLED && ['registration', 'registration-create'].includes(activePage) && <RegistrationRoute key={[user?.uid, profile?.role, profile?.adminCity, selectedCity, activePage, registrationTarget, registrationAction].join(':')} user={user} profile={profile} city={selectedCity} savedIds={savedIds} onSaveToggle={handleSaveToggle} onStreamStart={onStreamStart} onCalendar={() => setPage('calendar')} isGuest={isGuest} operationsOnly initialAction={registrationAction} initialCreate={activePage === 'registration-create'} initialEventId={activePage === 'registration' ? registrationTarget : null} onSubmitted={event => { setRegistrationTarget(null); setRegistrationRevision(value => value + 1); setFocusEventId(event.id); setPage('home'); }} onBack={() => { setRegistrationTarget(null); setRegistrationRevision(value => value + 1); setPage('home'); }} onRequireSignIn={() => signOut(auth).catch(error => window.showToast?.(error.message, 'error'))}/>}
          {!isGuest && activePage === 'add'        && <AddEvent      user={user} profile={profile} onSaved={afterSave} setPage={setPage} events={events} initialEvent={editingEvent?.id === undefined ? editingEvent : null} />}
          {!isGuest && activePage === 'edit'       && <EditEvent     editingEvent={editingEvent} onSaved={afterSave} user={user} profile={profile} events={events} />}
          {!isGuest && activePage === 'my'         && <MyEvents      {...shared} />}
          {!isGuest && activePage === 'host-inbox' && <HostInbox key={`${user?.uid}-${hostInboxThreadId}`} user={user} initialThreadId={hostInboxThreadId} />}
          {!isGuest && activePage === 'favourites'  && <Favourites    {...shared} />}
          {!isGuest && activePage === 'notifications' && <MemberDirectory key={user.uid} user={user} profile={profile} view="notifications" onOpenNotification={row => {
            if (openRegistrationUpdate(row)) return;
            if (row.module === 'events') {
              if (row.threadId) setHostInboxThreadId(row.threadId);
              setPage(row.threadId ? 'host-inbox' : row.type === 'event.favourite_reminder' ? 'favourites' : 'home');
              return;
            }
            const destination = ['owner','detail','inbox','reviews','moderation'].includes(row.destination) ? row.destination : 'owner';
            window.location.hash = `/${destination}/${encodeURIComponent(row.targetId || '')}`;
            selectExperience('businesses');
          }}/>}
          {!isGuest && activePage === 'profile'    && <Profile       user={user} profile={profile} setProfile={setProfile} />}
          {!isGuest && !profileVerified && activePage === 'admin' && <div className="card" role="status">Opening dashboard…</div>}
          {!isGuest && profileVerified && activePage === 'admin'      && <AdminDashboard {...shared} />}
          {!isGuest && activePage === 'bulkshare'  && <BulkShare     events={events} profile={profile} user={user} />}
          {!isGuest && activePage === 'install'    && <InstallApp />}
          {activePage === 'hijri-calendar' && <HijriCalendar profile={profile} selectedCity={selectedCity} />}
          </Suspense>
          </RegistrationContext.Provider>

          {isGuest && !['home','businesses','search','calendar','hijri-calendar','streams', ...(REGISTRATION_ENABLED ? ['registration'] : [])].includes(page) && (
            <div className="card center" style={{ margin: '40px 16px' }}>
              <div style={{ fontSize: '2rem', marginBottom: 12 }}>🔒</div>
              <h3 style={{ margin: '0 0 8px' }}>Login Required</h3>
              <p className="small" style={{ marginBottom: 16 }}>
                Please create an account or log in to access this feature.
              </p>

            </div>
          )}
        </div>

      </div>

      {activePage !== 'businesses' && <BottomNav page={activePage} setPage={setPage} isGuest={isGuest} profile={profile} user={user} onOpenMenu={openAccountMenu} />}
      {activePage === 'businesses' && (isGuest || import.meta.env.VITE_DIRECTORY_WORKSPACE_ENABLED !== 'true' || import.meta.env.VITE_READ_ONLY_PREVIEW === 'true') && <BottomNav directory page="home" isGuest profile={profile} user={user} onOpenMenu={openAccountMenu} setPage={key => { if (key === 'promotions') window.location.assign('/businesses/promotions'); else window.scrollTo({ top: 0 }); }}/>}

      {/* First-time walkthrough */}
      {activePage !== 'businesses' && <AppWalkthrough
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
      />}
    </div>
  );
}
