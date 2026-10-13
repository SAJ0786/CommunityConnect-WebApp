function cell(value) {
  let text = String(value ?? '');
  if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"','""') + '"';
}
export function upcomingEventsCsv(events, today) {
  const headings = ['Date','Time','Event type','Host','City','Suburb'];
  const rows = events.filter(event => event.eventDate >= today && event.hidden !== true && event.isActive !== false)
    .sort((a,b) => (a.eventDate+a.startTime).localeCompare(b.eventDate+b.startTime))
    .map(event => [event.eventDate,event.startTime,event.eventTypeDisplay||event.eventType,event.hostName,event.metroArea,event.address?.suburb]);
  return [headings,...rows].map(row => row.map(cell).join(',')).join('\r\n');
}
