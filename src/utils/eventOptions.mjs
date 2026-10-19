// Same event catalogue and settings/eventOptions contract as the native app.
export const EVENT_TYPE_GROUPS = [
  { key:'faith', label:'Faith & Worship', eventTypes:['Majlis','Milad','Prayers','Friday Prayers','Dua','Prayers & Amal','Dua-e-Kumail','Dua-e-Tawassul','Dua-e-Nutba'] },
  { key:'community', label:'Community & Social', eventTypes:['Birthday','Marriage','Informal get together'] },
  { key:'other', label:'Other', eventTypes:['Custom'] },
];
export const EVENT_TYPES = EVENT_TYPE_GROUPS.flatMap(group => group.eventTypes);
export function parseEventOptions(data = {}) {
  const entries = (Array.isArray(data.eventTypes) ? data.eventTypes : []).filter(Boolean);
  return { eventTypes:entries.map(item => typeof item === 'string' ? item : item.label).filter(value => typeof value === 'string' && value.trim()),
    eventTypeCategories:Object.fromEntries(entries.map(item => [typeof item === 'string' ? item : item.label, item.category]).filter(([label]) => label)) };
}
export function buildEventTypeGroups(options = {}, retainedType = '') {
  const dynamic = Array.isArray(options.eventTypes) ? options.eventTypes : [];
  const labels = [...new Set([...EVENT_TYPES, ...dynamic, ...(retainedType ? [retainedType] : [])])];
  return EVENT_TYPE_GROUPS.map(group => ({ ...group, eventTypes:labels.filter(label => {
    const builtIn = EVENT_TYPE_GROUPS.find(row => row.eventTypes.includes(label));
    const category = builtIn?.key || options.eventTypeCategories?.[label];
    return (EVENT_TYPE_GROUPS.some(row => row.key === category) ? category : 'other') === group.key;
  }) }));
}
