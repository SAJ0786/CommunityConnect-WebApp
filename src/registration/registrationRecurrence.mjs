import { addDays, formatLocalDate, generateGregorianOccurrences, generateHijriOccurrences, parseLocalDate } from '../services/recurrenceService.js';
import { applyPrayerOffset, calculatePrayerTimes } from '../services/prayerTimeService.js';
import { closingDateError } from './prototypeModel.mjs';

export const REGISTRATION_FREQUENCIES = [
  ['day', 'Daily'], ['week', 'Weekly'], ['fortnight', 'Fortnightly'], ['month', 'Monthly'], ['year', 'Yearly'],
];

const ordinal = value => {
  const date = parseLocalDate(value);
  if (!date) throw new Error('Choose a valid event and closing date.');
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000;
};

export function registrationSeriesPlan(draft, overrides = []) {
  if (draft.frequency !== 'recurring') return null;
  if (!REGISTRATION_FREQUENCIES.some(([value]) => value === draft.repeatFrequency)) throw new Error('Select a recurrence frequency.');
  const count = Number(draft.occurrenceCount);
  const maximum = draft.repeatFrequency === 'year' ? 5 : 100;
  if (!Number.isSafeInteger(count) || count < 2 || count > maximum) throw new Error(`Choose between 2 and ${maximum} occurrences.`);
  const closingError = closingDateError(draft);
  if (closingError) throw new Error(closingError);
  const recurrence = {
    calendarType: draft.enteredAsHijri ? 'hijri' : 'gregorian',
    frequency: draft.repeatFrequency === 'fortnight' ? 'week' : draft.repeatFrequency,
    repeatEvery: draft.repeatFrequency === 'fortnight' ? 2 : 1,
    endMode: 'count',
    occurrenceCount: count,
    ...(draft.enteredAsHijri ? { startHijri: { day: draft.hijriDay, month: draft.hijriMonth, year: draft.hijriYear } } : {}),
  };
  const dates = draft.enteredAsHijri
    ? generateHijriOccurrences({ ...recurrence, overrides })
    : generateGregorianOccurrences({ ...recurrence, startDate: draft.date, overrides });
  const closingOffset = draft.closes ? ordinal(draft.closes.slice(0, 10)) - ordinal(draft.date) : null;
  const occurrences = dates.map(row => {
    let startTime = draft.startTime || '';
    if (draft.timeMode === 'prayer') {
      const times = calculatePrayerTimes(row.eventDate, draft.venue);
      if (!times?.[draft.prayerName]) throw new Error(`Prayer time could not be calculated for ${row.eventDate}. Check the date and selected venue.`);
      startTime = applyPrayerOffset(times[draft.prayerName], draft.prayerOffsetMinutes || 0);
    }
    const custom = draft.occurrenceSettings?.[row.eventDate] || {};
    const occurrence = {
      date: row.eventDate,
      closes: custom.closes ?? (closingOffset === null ? '' : `${formatLocalDate(addDays(parseLocalDate(row.eventDate), closingOffset))}${draft.closes.slice(10)}`),
      capacity: Number(custom.capacity ?? draft.capacity),
      startTime, endTime: draft.endTime || '',
      hijriDate: row.hijriDate,
      enteredAsHijri: row.enteredAsHijri,
      ...(row.enteredAsHijri ? { hijriDay: row.hijriDay, hijriMonth: row.hijriMonth, hijriYear: row.hijriYear } : {}),
    };
    const error = closingDateError(occurrence);
    if (error) throw new Error(`${row.eventDate}: ${error}`);
    if (!Number.isSafeInteger(occurrence.capacity) || occurrence.capacity < 1 || occurrence.capacity > 10000) throw new Error(`${row.eventDate}: capacity must be between 1 and 10,000 places.`);
    if (occurrence.endTime && (!occurrence.startTime || occurrence.endTime === occurrence.startTime)) throw new Error(`${row.eventDate}: end time must differ from the start time.`);
    return occurrence;
  });
  if (occurrences[0]?.date !== draft.date) throw new Error('The first recurrence date no longer matches the event date. Re-select the event date.');
  return { recurrence, occurrences };
}
