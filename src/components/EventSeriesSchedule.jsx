import { useEffect, useMemo, useState } from 'react';
import { generateGregorianOccurrences, generateHijriOccurrences } from '../services/recurrenceService';
import { getHijriParts, HIJRI_MONTHS } from '../services/hijriService';
import { getHijriSettings } from '../services/settingsService';

function HijriFields({ label, value, onChange }) {
  return <fieldset className="series-hijri-fields"><legend>{label}</legend>
    <label>Day<input type="number" min="1" max="30" value={value.day} onChange={e => onChange({...value,day:e.target.value})}/></label>
    <label>Month<select value={value.month} onChange={e => onChange({...value,month:e.target.value})}>
      {HIJRI_MONTHS.map(month => <option key={month.value} value={month.value}>{month.name}</option>)}
    </select></label>
    <label>Year<input type="number" min="1300" max="1800" value={value.year} onChange={e => onChange({...value,year:e.target.value})}/></label>
  </fieldset>;
}

export default function EventSeriesSchedule({ source, onChange, disabled }) {
  const initialRule = source.recurrenceRuleSnapshot || {}, count = source.__futureIds.length;
  const [mode,setMode] = useState('keep'), [calendar,setCalendar] = useState(initialRule.calendarType || 'gregorian');
  const [start,setStart] = useState(source.eventDate), [frequency,setFrequency] = useState(initialRule.frequency || 'week');
  const [every,setEvery] = useState(initialRule.repeatEvery || 1), [endMode,setEndMode] = useState('count');
  const [end,setEnd] = useState(source.seriesEndDate || source.__futureOccurrences.at(-1).eventDate);
  const [hijriStart,setHijriStart] = useState({day:source.hijriDay || 1,month:source.hijriMonth || 1,year:source.hijriYear || 1448});
  const [hijriEnd,setHijriEnd] = useState(initialRule.endHijri || hijriStart);
  const [settings,setSettings] = useState({ready:false,overrides:[],error:''});
  useEffect(() => {
    let active = true;
    getHijriSettings().then(value => {
      if (!active) return;
      const overrides = value.overrides || [];
      if (!source.hijriDay) setHijriStart(getHijriParts(new Date(source.eventDate + 'T12:00:00'),overrides));
      if (!initialRule.endHijri) setHijriEnd(getHijriParts(new Date(end + 'T12:00:00'),overrides));
      setSettings({ready:true,overrides,error:''});
    }).catch(() => { if (active) setSettings({ready:false,overrides:[],error:'Calendar settings could not be loaded. Reopen Edit Series to retry.'}); });
    return () => { active = false; };
  }, [source]);
  const preview = useMemo(() => {
    if (mode === 'keep') return {schedule:null,error:''};
    if (!settings.ready) return {schedule:null,error:settings.error || 'Loading calendar settings…'};
    try {
      const recurrence = {calendarType:calendar,frequency,repeatEvery:Number(every),endMode,
        endDate:end,endHijri:hijriEnd,occurrenceCount:count};
      const occurrences = calendar === 'hijri'
        ? generateHijriOccurrences({...recurrence,startHijri:hijriStart,overrides:settings.overrides})
        : generateGregorianOccurrences({...recurrence,startDate:start,overrides:settings.overrides});
      if (occurrences.length !== count) throw new Error('Choose a schedule with exactly ' + count + ' remaining occurrences.');
      return {schedule:{occurrences,recurrence},error:''};
    } catch (error) { return {schedule:null,error:error.message}; }
  },[mode,settings,calendar,frequency,every,endMode,end,hijriEnd,hijriStart,start,count]);
  useEffect(() => { onChange(preview); },[preview,onChange]);
  return <section className="card series-schedule">
    <h2>Series dates</h2>
    <p>The same {count} future occurrences will be updated. Past and live events keep their dates and details.</p>
    <fieldset disabled={disabled} className="series-schedule-fields">
      <label>Schedule<select value={mode} onChange={e=>setMode(e.target.value)}>
        <option value="keep">Keep current dates</option><option value="change">Change dates and repeat pattern</option>
      </select></label>
      {mode === 'change' && <>
        <div className="series-schedule-grid">
          <label>Calendar<select value={calendar} onChange={e=>setCalendar(e.target.value)}><option value="gregorian">Gregorian</option><option value="hijri">Hijri</option></select></label>
          {calendar === 'gregorian' && <label>First future event date<input type="date" value={start} onChange={e=>setStart(e.target.value)}/></label>}
          <label>Repeat<select value={frequency} onChange={e=>setFrequency(e.target.value)}>
            <option value="day">Daily</option><option value="week">Weekly</option><option value="month">Monthly</option><option value="year">Yearly</option>
          </select></label>
          <label>Repeat every<input type="number" min="1" max="100" value={every} onChange={e=>setEvery(e.target.value)}/></label>
          <label>End schedule<select value={endMode} onChange={e=>setEndMode(e.target.value)}><option value="count">After {count} occurrences</option><option value="date">On a date</option></select></label>
          {endMode === 'date' && calendar === 'gregorian' && <label>Last recurrence date<input type="date" value={end} onChange={e=>setEnd(e.target.value)}/></label>}
        </div>
        {calendar === 'hijri' && <HijriFields label="First future Hijri date" value={hijriStart} onChange={setHijriStart}/>}
        {calendar === 'hijri' && endMode === 'date' && <HijriFields label="Last Hijri date" value={hijriEnd} onChange={setHijriEnd}/>}
        <p>Review every changed date before saving. Prayer-based start times will be recalculated for each new date.</p>
        {preview.error && <p role="alert">{preview.error}</p>}
        {preview.schedule && <ol className="series-schedule-preview" aria-label="Proposed occurrence dates">
          {preview.schedule.occurrences.map((item,index)=><li key={source.__futureIds[index]}>
            <span>{source.__futureOccurrences[index].eventDate} → {item.eventDate}</span>
            {calendar === 'hijri' && <span> · {item.hijriDate}</span>}
          </li>)}
        </ol>}
      </>}
    </fieldset>
  </section>;
}
