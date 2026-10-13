const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const validDate = value => typeof value === 'string' && datePattern.test(value)
  && Number.isFinite(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0,10) === value;

// Keep existing occurrence IDs, ownership and history, as in the native editor.
export function planSeriesSchedule(source, rows, schedule) {
  if (schedule == null) return null;
  const { occurrences, recurrence = {} } = schedule;
  if (!Array.isArray(occurrences) || occurrences.length !== rows.length) throw new Error('Keep the same number of remaining occurrences. Reopen Edit Series if an event has started.');
  if (!['gregorian','hijri'].includes(recurrence.calendarType) || !['day','week','month','year'].includes(recurrence.frequency)
    || !['count','date'].includes(recurrence.endMode) || !Number.isInteger(Number(recurrence.repeatEvery))
    || Number(recurrence.repeatEvery) < 1 || Number(recurrence.repeatEvery) > 100) throw new Error('Choose a valid recurrence pattern.');
  if (recurrence.endMode === 'count' && Number(recurrence.occurrenceCount) !== rows.length) throw new Error('Keep the same number of remaining occurrences.');
  const hijri = value => value && Number.isInteger(Number(value.day)) && Number(value.day) >= 1 && Number(value.day) <= 30
    && Number.isInteger(Number(value.month)) && Number(value.month) >= 1 && Number(value.month) <= 12
    && Number.isInteger(Number(value.year)) && Number(value.year) >= 1300 && Number(value.year) <= 1800;
  if (recurrence.endMode === 'date' && (recurrence.calendarType === 'gregorian' ? !validDate(recurrence.endDate) : !hijri(recurrence.endHijri))) throw new Error('Choose a valid recurrence end date.');
  const dates = occurrences.map((item,index) => {
    if (!validDate(item?.eventDate) || index && item.eventDate <= occurrences[index-1].eventDate) throw new Error('Occurrence dates must be valid, distinct and in increasing order.');
    if (recurrence.calendarType === 'hijri' && !hijri({day:item.hijriDay,month:item.hijriMonth,year:item.hijriYear})) throw new Error('Each Hijri occurrence needs a valid Hijri date.');
    return {eventDate:item.eventDate,hijriDate:typeof item.hijriDate === 'string' ? item.hijriDate : '',
      hijriDay:recurrence.calendarType === 'hijri' ? Number(item.hijriDay) : null,
      hijriMonth:recurrence.calendarType === 'hijri' ? Number(item.hijriMonth) : null,
      hijriYear:recurrence.calendarType === 'hijri' ? Number(item.hijriYear) : null,
      enteredAsHijri:recurrence.calendarType === 'hijri'};
  });
  const rule = {calendarType:recurrence.calendarType,frequency:recurrence.frequency,repeatEvery:Number(recurrence.repeatEvery),
    endMode:recurrence.endMode,endDate:recurrence.endMode === 'date' && recurrence.calendarType === 'gregorian' ? recurrence.endDate : null,
    endHijri:recurrence.endMode === 'date' && recurrence.calendarType === 'hijri'
      ? {day:Number(recurrence.endHijri.day),month:Number(recurrence.endHijri.month),year:Number(recurrence.endHijri.year)} : null,
    occurrenceCount:recurrence.endMode === 'count' ? rows.length : null};
  const total = Math.max(rows.length,...rows.map(row => Number.isInteger(row.recurrenceTotal) ? row.recurrenceTotal : 0));
  return dates.map((item,index) => ({...item,recurrenceRuleSnapshot:rule,
    recurrenceIndex:rows[index].recurrenceIndex || index+1,recurrenceTotal:total,
    seriesStartDate:source.seriesStartDate || rows[0].eventDate,seriesEndDate:dates.at(-1).eventDate}));
}
