import { getCityDefinitions } from '../utils/cities.js';
import { isFutureSeriesEvent } from '../utils/eventSeriesScope.mjs';
const reference = value => typeof value === 'string' && value.trim() && !value.includes('/');
export function createEventSeriesArchive({ readSeries, archive, session, now = () => new Date() }) {
  const sameSession = async uid => { if (await session() !== uid) throw new Error('Your account changed. Reopen Delete Series.'); };
  return {
    async prepare(source) {
      const uid = await session(), seriesId = source?.seriesId || source?.recurringSeriesId;
      if (!reference(seriesId)) throw new Error('This series has no valid reference.');
      const groups = await Promise.all(['seriesId', 'recurringSeriesId'].map(field => readSeries(field, seriesId)));
      await sameSession(uid);
      const current = now();
      const events = [...new Map(groups.flat().map(event => [event.id, event])).values()]
        .filter(event => reference(event.id) && (event.seriesId === seriesId || event.recurringSeriesId === seriesId) && isFutureSeriesEvent(event, current, getCityDefinitions()))
        .sort((a, b) => a.eventDate.localeCompare(b.eventDate) || String(a.startTime || '').localeCompare(String(b.startTime || '')) || a.id.localeCompare(b.id));
      if (!events.length) throw new Error('No future events remain in this series.');
      if (events.length > 500) throw new Error('This series is too large for this operation. Contact an administrator.');
      return { seriesId, uid, events, expectedIds: events.map(event => event.id) };
    },
    async confirm(preview) {
      if (!reference(preview?.seriesId) || !Array.isArray(preview?.expectedIds) || !preview.expectedIds.length
        || preview.expectedIds.length > 500 || preview.expectedIds.some(id => !reference(id))
        || new Set(preview.expectedIds).size !== preview.expectedIds.length) throw new Error('Reopen Delete Series to refresh the selected events.');
      await sameSession(preview.uid);
      const result = await archive({ seriesId: preview.seriesId, expectedIds: [...preview.expectedIds] });
      await sameSession(preview.uid);
      const ids = result?.archivedIds;
      if (!Array.isArray(ids) || new Set(ids).size !== ids.length || ids.some(id => !preview.expectedIds.includes(id))
        || !Number.isInteger(result.archived) || result.archived !== ids.length) {
        throw new Error('The archive result could not be confirmed. Refresh the events before trying again.');
      }
      return { archivedIds: ids, archived: ids.length, remaining: preview.expectedIds.length - ids.length };
    },
  };
}
