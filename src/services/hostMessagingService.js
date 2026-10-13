import * as sdk from 'firebase/firestore';
import { auth, db } from '../firebase/firebase';
import { createHostMessaging } from './hostMessaging.mjs';
const service = createHostMessaging({ db, sdk, currentUser: () => auth.currentUser, readOnly: import.meta.env.VITE_READ_ONLY_PREVIEW === 'true' });
export function sendHostMessage(eventId, text) { return service.send(eventId, text); }
export function sendHostReply(threadId, text) { return service.reply(threadId, text); }
export function markHostThreadRead(threadId) { return service.markRead(threadId); }
export function listenHostThreads(next, error) { return service.watchThreads(next, error); }
export function listenHostMessages(threadId, next, error) { return service.watchMessages(threadId, next, error); }
