import * as sdk from 'firebase/firestore';
import { auth, db } from '../firebase/firebase';
import { canEditEvent } from '../utils/permissions';
import { classifyMetroArea } from '../utils/cities';
import { calculatePrayerTimes, applyPrayerOffset, prayerLabel } from './prayerTimeService';
import { createEventSeriesEditor } from './eventSeriesEdit.mjs';
const editor = createEventSeriesEditor({ db, sdk, currentUser: () => auth.currentUser, canEdit: canEditEvent,
  readOnly: import.meta.env.VITE_READ_ONLY_PREVIEW === 'true',
  prepareFields(updates, previous) {
    const data = { ...updates, metroArea: classifyMetroArea(updates.address || previous.address) };
    const address = updates.address || previous.address;
    if (String(address?.fullAddress || '').trim().length < 5) throw new Error('An event address is required.');
    if (data.timeMode === 'prayer') {
      const times = calculatePrayerTimes(previous.eventDate, address);
      if (!times?.[data.prayerName]) throw new Error('Prayer time could not be calculated for every occurrence.');
      data.startTime = applyPrayerOffset(times[data.prayerName], Number(data.prayerOffsetMinutes || 0));
      data.prayerLabel = prayerLabel(data.prayerName); data.prayerTimeZone = times.timeZone;
    }
    if (!data.startTime) throw new Error('A start time is required.');
    return data;
  } });
export function prepareFutureSeriesEdit(source) { return editor.prepare(source); }
export function saveFutureSeriesEdit(source, payload, schedule = null) { return editor.save(source, payload, schedule); }
