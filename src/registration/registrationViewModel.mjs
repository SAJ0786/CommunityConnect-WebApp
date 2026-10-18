import { createDraft, validateDraft, registrationFields } from './prototypeModel.mjs';

const EVENT_DETAIL_FIELDS = ['hostName', 'organiserType', 'organiserId', 'organiserName', 'organisationType', 'isOnBehalfOf',
  'eventSubject', 'audienceType', 'speakerName', 'reciters', 'timeMode', 'prayerName', 'prayerLabel',
  'prayerOffsetMinutes', 'prayerTimeZone', 'hijriDate', 'enteredAsHijri', 'hijriDay', 'hijriMonth', 'hijriYear'];
const pickDetails = event => Object.fromEntries(EVENT_DETAIL_FIELDS.filter(key => event[key] !== undefined).map(key => [key, event[key]]));

export function registrationReviewDetail(detail) {
  return detail?.canManage && detail.pendingChanges ? { ...detail, event:detail.pendingChanges.event,
    form:detail.pendingChanges.form, privateDetails:detail.pendingChanges.privateDetails } : detail;
}

export function registrationEventForm(draft) {
  return { ...pickDetails(draft), hostPhone: draft.hostPhone || '', hostContactOptional: draft.hostContactOptional || '',
    eventDate: draft.date, startTime: draft.startTime || '', endTime: draft.endTime || '',
    eventType: draft.eventType, customEventType: draft.customEventType || '', notes: draft.notes || '',
    address: draft.venue || { fullAddress: draft.address || '' } };
}

export function registrationDraftFromEventForm(draft, form) {
  return { ...draft, ...pickDetails(form), hostPhone: form.hostPhone || '', hostContactOptional: form.hostContactOptional || '',
    date: form.eventDate, startTime: form.startTime || '', endTime: form.endTime || '',
    eventType: form.eventType, customEventType: form.customEventType || '', notes: form.notes || '',
    venue: form.address, address: form.address?.fullAddress || '',
    suburb: form.address?.fullAddress !== draft.address ? form.address?.suburb || draft.suburb : draft.suburb };
}

export function validateRegistrationDraft(draft) {
  const errors = validateDraft(draft);
  for (const key of ['startTime', 'endTime']) if (draft[key] && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(draft[key])) errors.push('Enter event times as HH:mm.');
  if (draft.endTime && (!draft.startTime || draft.endTime === draft.startTime)) errors.push('End time requires a different start time. Earlier end times mean the following day.');
  return errors;
}

export function eventDraftFromDetail(detail, eventTypes) {
  detail = registrationReviewDetail(detail);
  if (!detail?.canManage || !detail.privateDetails || !detail.form) throw new Error('Reload an event you can manage before editing.');
  const event = detail.event;
  const knownType = eventTypes.includes(event.eventType);
  return { ...createDraft(), ...pickDetails(event), hostName: event.hostName || '', hostPhone: detail.privateDetails.hostPhone || '',
    hostContactOptional: detail.privateDetails.hostContactOptional || '', title: event.title, eventType: knownType ? event.eventType : 'Custom',
    customEventType: knownType ? '' : event.eventType, date: event.date, startTime: event.startTime || '', endTime: event.endTime || '', suburb: event.suburb,
    address: detail.privateDetails.address, venue: detail.privateDetails.venue, notes: event.notes || '',
    capacity: event.capacity, closes: event.closes || '', allowCancellation: event.allowCancellation,
    ...(event.seriesId ? { seriesId:event.seriesId, occurrenceIndex:event.occurrenceIndex, occurrenceCount:event.occurrenceCount, recurrenceRule:event.recurrenceRule } : {}),
    purpose: detail.form.purpose, fields: JSON.parse(JSON.stringify(detail.form.fields)), poster: null };
}

// Preserve compatible saved answers, never auto-agree to old or changed terms.
export function answersForReview(detail) {
  const previous = detail.ownRegistration;
  const answers = {};
  for (const field of registrationFields(detail.form?.fields || [], previous?.places || 1)) {
    const oldField = previous?.fields?.find(item => item.id === field.id);
    if (field.type === 'consent') { answers[field.id] = false; continue; }
    if (!oldField || oldField.type !== field.type || oldField.label !== field.label) continue;
    const answer = previous.answers?.[field.id];
    if (answer !== undefined) Object.defineProperty(answers, field.id, { value: JSON.parse(JSON.stringify(answer)), enumerable: true, writable: true, configurable: true });
  }
  return answers;
}

export function mergeRegistrationPage(previous, incoming) {
  return [...new Map([...previous, ...incoming].map(row => [row.id || row.registrationId, row])).values()];
}

export function registrantName(registration) {
  const participantNames = (registration.fields || []).filter(field => field.participantIndex && /name/i.test(field.originalLabel || field.label) && !/parent|guardian/i.test(field.originalLabel || field.label)).map(field => String(registration.answers?.[field.id] || '').trim()).filter(Boolean);
  if (participantNames.length) return participantNames.join(', ');
  const names = (registration.fields || []).filter(field =>
    field.type === 'text' && /\bname\b/i.test(field.label)
    && !/\b(parent|guardian|host|organis[ez]r|school|company|team|event|group)\b/i.test(field.label)
    && typeof registration.answers?.[field.id] === 'string' && registration.answers[field.id].trim());
  const full = names.find(field => !/\b(first|last|given|family|surname)\b/i.test(field.label)
    && /\b(full|participant|registrant|attendee|your)\b/i.test(field.label));
  if (full) return registration.answers[full.id].trim();
  return names.map(field => registration.answers[field.id].trim()).join(' ') || 'Registrant name unavailable';
}
