import { isFutureSeriesEvent } from '../utils/eventSeriesScope.mjs';
import { planSeriesSchedule } from './eventSeriesSchedule.mjs';
const editable = ['hostName', 'hostPhone', 'hostContactOptional', 'startTime', 'endTime', 'timeMode',
  'prayerName', 'prayerLabel', 'prayerOffsetMinutes', 'prayerTimeZone', 'eventType', 'customEventType',
  'eventTypeDisplay', 'eventSubject', 'notes', 'audienceType', 'isOnBehalfOf', 'organiserType',
  'organiserName', 'organisationName', 'organisationType', 'organiserCategory', 'address', 'speakerName',
  'reciters', 'imageUrl', 'imagePath'];
// Older clients may update a field without updating updatedAt. Compare all
// fields in a stable order so their edits cannot be silently overwritten.
const version = event => JSON.stringify(event, (_, value) => value && typeof value === 'object' && !Array.isArray(value)
  ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) : value);
export function createEventSeriesEditor({ db, sdk, currentUser, canEdit, prepareFields, readOnly = false, now = () => new Date() }) {
  const reference = value => {
    if (typeof value !== 'string' || !value.trim() || value.includes('/')) throw new Error('A valid series reference is required.');
    return value;
  };
  const active = profile => profile && profile.isActive !== false && profile.active !== false && !['archived','banned','deleted'].includes(profile.accountStatus);
  async function session() {
    if (readOnly) throw new Error('Disabled in the read-only preview.');
    const user = currentUser();
    if (!user?.uid || user.isAnonymous) throw new Error('Sign in to edit a series.');
    const profile = (await sdk.getDocFromServer(sdk.doc(db, 'users', user.uid))).data();
    if (!active(profile) || currentUser()?.uid !== user.uid) throw new Error('An active, unchanged account is required.');
    return { uid: user.uid, profile };
  }
  async function selection(source, member) {
    const seriesId = reference(source.seriesId || source.recurringSeriesId);
    const snapshots = await Promise.all(['seriesId', 'recurringSeriesId'].map(field =>
      sdk.getDocsFromServer(sdk.query(sdk.collection(db, 'events'), sdk.where(field, '==', seriesId)))));
    const rows = [...new Map(snapshots.flatMap(s => s.docs).map(row => [row.id, { ...row.data(), id: row.id }])).values()]
      .filter(row => isFutureSeriesEvent(row, now())).sort((a, b) => a.eventDate.localeCompare(b.eventDate) || a.id.localeCompare(b.id));
    if (!rows.length || rows.length > 450) throw new Error('Choose a series with 1–450 future occurrences.');
    if (rows.some(row => !canEdit(member.profile, row, member.uid))) throw new Error('You cannot edit every future occurrence in this series.');
    if (currentUser()?.uid !== member.uid) throw new Error('Your account changed. Reopen Edit Series.');
    return rows;
  }
  async function prepare(source) {
    const member = await session(), rows = await selection(source, member);
    return { ...rows[0], __editSeries: true, __seriesEditorUid: member.uid, __futureIds: rows.map(row => row.id),
      __futureVersions: Object.fromEntries(rows.map(row => [row.id, version(row)])), __futureOccurrences: rows };
  }
  async function save(source, payload, schedule = null) {
    const member = await session();
    if (member.uid !== source.__seriesEditorUid) throw new Error('Your account changed. Reopen Edit Series.');
    const rows = await selection(source, member), expected = source.__futureIds;
    if (!Array.isArray(expected) || rows.length !== expected.length || rows.some(row => !expected.includes(row.id) || source.__futureVersions?.[row.id] !== version(row))) {
      throw new Error('The series changed. Reopen Edit Series to review the latest occurrences.');
    }
    const updates = Object.fromEntries(editable.filter(key => Object.hasOwn(payload, key) && payload[key] !== undefined).map(key => [key, payload[key]]));
    const planned = planSeriesSchedule(source, rows, schedule);
    await sdk.runTransaction(db, async transaction => {
      const profile = (await transaction.get(sdk.doc(db, 'users', member.uid))).data();
      const snapshots = await Promise.all(rows.map(row => transaction.get(sdk.doc(db, 'events', row.id))));
      if (!active(profile) || currentUser()?.uid !== member.uid) throw new Error('Your account changed. Reopen Edit Series.');
      const changes = snapshots.map((snapshot, index) => {
        const previous = snapshot.data(), before = rows[index];
        if (!snapshot.exists() || version({ ...previous, id: snapshot.id }) !== source.__futureVersions[before.id]
          || !isFutureSeriesEvent(previous, now())) throw new Error('The series changed. Reopen Edit Series before saving.');
        const occurrence = planned?.[index] || {};
        const data = { ...prepareFields(updates, { ...previous, ...occurrence }), ...occurrence };
        if (!canEdit(profile, previous, member.uid) || !canEdit(profile, { ...previous, ...data }, member.uid)) throw new Error('You no longer have permission to edit this series.');
        if (!isFutureSeriesEvent({ ...previous, ...data }, now())) throw new Error('Every updated occurrence must still start in the future.');
        return { ref: snapshot.ref, data };
      });
      changes.forEach(row => transaction.update(row.ref, { ...row.data, updatedAt: sdk.serverTimestamp() }));
    });
    if (currentUser()?.uid !== member.uid) throw new Error('Your account changed. Reload Events to check the saved result.');
    return rows.length;
  }
  return { prepare, save };
}
