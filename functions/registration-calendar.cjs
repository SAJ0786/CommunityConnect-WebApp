'use strict';

function calendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) throw new Error('Invalid registration calendar date.');
  const date = new Date(value + 'T00:00:00Z');
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error('Invalid registration calendar date.');
  return date;
}
function utc(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new Error('Registration schedule needs a server-derived UTC instant.');
  }
  return new Date(value).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}
exports.registrationCalendarLines = (id, event, { escape, stamp }) => {
  if (event.status !== 'approved' || event.deletedAt || event.hidden) return [];
  const date = calendarDate(event.date);
  const lines = ['BEGIN:VEVENT', `UID:registration-${escape(id)}@community-events`, `DTSTAMP:${stamp}`];
  if (event.startTime) {
    lines.push(`DTSTART:${utc(event.startAt)}`);
    if (event.endTime) {
      if (Date.parse(event.endAt) <= Date.parse(event.startAt)) throw new Error('Invalid registration schedule range.');
      lines.push(`DTEND:${utc(event.endAt)}`);
    }
  } else {
    if (event.endTime) throw new Error('Registration end time requires a start time.');
    lines.push(`DTSTART;VALUE=DATE:${event.date.replaceAll('-', '')}`);
    date.setUTCDate(date.getUTCDate() + 1);
    lines.push(`DTEND;VALUE=DATE:${date.toISOString().slice(0, 10).replaceAll('-', '')}`);
  }
  lines.push(`SUMMARY:${escape(event.title || event.eventType || 'Community event')}`);
  if (event.suburb) lines.push(`LOCATION:${escape(event.suburb)}`);
  lines.push('DESCRIPTION:Community Connect - Events');
  lines.push('END:VEVENT');
  return lines;
};
