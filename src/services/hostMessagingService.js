import * as sdk from 'firebase/firestore';
import { auth, db } from '../firebase/firebase';
import { createHostMessaging } from './hostMessaging.mjs';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase/firebase';
import { REGISTRATION_ENABLED } from '../config/releaseGates.mjs';
const service = createHostMessaging({ db, sdk, currentUser: () => auth.currentUser, readOnly: import.meta.env.VITE_READ_ONLY_PREVIEW === 'true',
  registrationEvent: async eventId => {
    if (!REGISTRATION_ENABLED) throw new Error('Event registration is not enabled.');
    return (await httpsCallable(functions, 'getRegistrationEvent')({ eventId })).data;
  } });
export function sendHostMessage(eventId, text, options) { return service.send(eventId, text, options); }
export function sendHostReply(threadId, text) { return service.reply(threadId, text); }
export function markHostThreadRead(threadId) { return service.markRead(threadId); }
export function listenHostThreads(next, error) { return service.watchThreads(next, error); }
export function listenHostMessages(threadId, next, error) { return service.watchMessages(threadId, next, error); }
