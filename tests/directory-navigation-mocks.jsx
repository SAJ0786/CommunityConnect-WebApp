import React from 'react';
import EventCard from '../src/components/EventCard';
import { freshData } from './workspace-preview/model.mjs';
export * from './ui-preview/mocks.js';
export {
  auth, firebaseConfigured, onAuthStateChanged, signOut, signInAnonymously,
  setPersistence, browserLocalPersistence, RecaptchaVerifier, signInWithPhoneNumber,
  completeMemberProfile, updateProfile,
} from './member-preview/mocks.js';

export const profile = { uid: 'synthetic-member', fullName: 'Existing Member', email: 'member@example.test',
  role: 'user', defaultCity: 'sydney', defaultModule: 'events', savedEvents: [], walkthroughCompleted: true };
export const ensureUserProfile = async () => profile;
export const onSnapshot = (_, next) => { next({ exists: () => false, docs: [] }); return () => {}; };
export const useCityCatalogue = () => 0;
export const useCityCatalogueRefresh = () => 0;
export const listenPublicBusinesses = next => { next({ businesses: [], fromCache: false }); return () => {}; };
export const listenPublicPromotions = next => { next({ promotions: [], fromCache: false }); return () => {}; };
export const createLiveDirectorySession = () => ({
  subscribe(next) { next({ data: freshData(), status: 'ready', profile }); return () => {}; },
  action: async () => {}, close() {},
});
export const emptyDirectoryData = freshData;
export function Home({ user, profile, isGuest }) {
  const [expanded, setExpanded] = React.useState('niaz-event');
  return <EventCard event={{ id: 'niaz-event', createdByUserId: 'synthetic-member', metroArea: 'melbourne',
    eventType: 'Majlis', hostName: 'Synthetic Niaz host', eventDate: '2026-12-01',
    startTime: '18:00', address: { suburb: 'Coburg', state: 'VIC' } }}
    user={user} profile={profile} isGuest={isGuest} isExpanded={expanded === 'niaz-event'} onExpand={setExpanded} />;
}
