export function registrationFixture(date, user, role, guest, registered = false, staged = false, participants = false, series = false, deleted = false, cancelOnSubmit = false, detailedForm = false) {
  const calls = [];
  const rows = new Map([
    ['registration-approved', { id:'registration-approved', title:'Registration Workshop', date, eventType:'Workshop', city:'sydney', suburb:'Parramatta', status:'approved', revision:1, ownerUid:'synthetic-member', capacity:30, formVersion:1, startTime:'18:00', endTime:'19:00', startAt:`${date}T07:00:00Z`, endAt:`${date}T08:00:00Z` }],
    ['registration-pending', { id:'registration-pending', title:'Pending Workshop', date, eventType:'Workshop', city:'sydney', suburb:'Parramatta', status:'pending', revision:1, ownerUid:'synthetic-member', capacity:30, formVersion:1 }],
  ]);
  if(series){for(const row of rows.values())row.seriesId='synthetic-series';for(const [id,status,offset] of [['series-approved','approved',7],['series-pending','pending',14]])rows.set(id,{...rows.get('registration-approved'),id,title:'Series Workshop',status,date:new Date(Date.parse(`${date}T00:00:00Z`)+offset*86400000).toISOString().slice(0,10)});}
  const seriesBookings=new Set();
  if (deleted) Object.assign(rows.get('registration-approved'),{status:'cancelled',deleted:true});
  let attending = registered, hasPoster = true;
  const member = !guest, manage = row => member && (row.ownerUid === user.uid || ['admin','superAdmin'].includes(role));
  const hasChanges = row => staged && row.id === 'registration-approved';
  const decorate = row => ({ ...row, registrationOnly:true, submittedByName:'Example Organiser', canManage:manage(row), ...(manage(row) && hasChanges(row) ? {hasPendingChanges:true} : {}), canApprove:member && role === 'superAdmin' && (row.status === 'pending' || hasChanges(row)),
    isRegistered:attending && row.id === 'registration-approved', canRegister:row.status === 'approved', canEditRegistration:attending && row.status === 'approved', ...(row.status === 'approved' && (manage(row) || attending) ? { hasPoster } : {}) });
  const fields = participants ? [{id:'email',type:'email',label:'Booking email',required:true},{id:'name',type:'text',label:'Full name',required:true,perParticipant:true},{id:'age',type:'number',label:'Age',required:true,perParticipant:true}] : [{ id:'name', type:'text', label:'Your name', required:true }];
  if(detailedForm) fields.push({id:'school',type:'text',label:'School Year (Optional)',perParticipant:true},{id:'experience',type:'checkboxes',label:'Has the student recited in any gathering, majlis, school or community programs?',description:'Recitation Experience',options:['Yes','No'],required:true,perParticipant:true},{id:'where',type:'textarea',label:'If yes, where?',description:'Details of recitation experience',perParticipant:true},{id:'interests',type:'radio',label:'Areas of interest or experience',description:'Share your interest or experience',options:['Soz/Salam','Marsiyah','Noha'],required:true,perParticipant:true});
  fields.push({id:'consent',type:'consent',label:'Parent or guardian consent',required:true,terms:'By registering, I confirm that I am authorised to book these places and that the participant details are correct. I understand that attendees must follow the organiser’s instructions and that I should contact the host about any access or participation needs before the event. I have reviewed the event information and agree to these registration terms.'});
  const api = {
    list: async ({ scope, city }) => {
      calls.push(['list',scope,city]);
      return { events:[...rows.values()].filter(row => !city || row.city === city).filter(row =>
        scope === 'public' ? row.status === 'approved' : scope === 'mine' ? row.ownerUid === user.uid && member
          : scope === 'attending' ? attending && row.id === 'registration-approved'
            : scope === 'review' ? role === 'superAdmin' && (row.status === 'pending' || hasChanges(row)) : ['admin','superAdmin'].includes(role)).map(decorate), nextCursor:null };
    },
    load: async (id,includeOccurrences,includeSeriesReview) => {
      calls.push(['load',id]); const row = rows.get(id); if (!row) throw Error('Event not found.');
      const allowed = row.status === 'approved' && (manage(row) || attending), event = decorate(row);
      return { event, canManage:manage(row), canApprove:event.canApprove, canRegister:row.status === 'approved', canEditRegistration:attending && row.status === 'approved', canCancel:attending,
        form:{ version:1, purpose:'Arrange the workshop.', fields },
        ...(series&&includeOccurrences?{occurrences:[...rows.values()].filter(item=>item.status==='approved').map(item=>({eventId:item.id,date:item.date,startTime:item.startTime,formVersion:1,availablePlaces:30,selectable:!seriesBookings.has(item.id),registered:seriesBookings.has(item.id),reason:seriesBookings.has(item.id)?'Already registered':''}))}:{}),
        ...(series&&includeSeriesReview&&role==='superAdmin'?{reviewOccurrences:[...rows.values()].filter(item=>item.status==='pending').map(item=>({eventId:item.id,date:item.date,revision:item.revision}))}:{}),
        ownRegistration:attending ? { status:'registered', revision:1, places:1, fields, answers:{ name:'Example attendee' } } : null,
        ...(manage(row) && hasChanges(row) ? {pendingChanges:{event:{...event,title:'Submitted Registration Workshop',startTime:'20:00'},form:{version:1,purpose:'Submitted purpose',fields:[{id:'submitted',type:'text',label:'Submitted question',required:true}]},
          privateDetails:{address:'2 Fictional Street, Parramatta NSW',hasPoster:false,venue:{fullAddress:'2 Fictional Street, Parramatta NSW',suburb:'Parramatta',state:'NSW',postcode:'2150',latitude:-33.8,longitude:151}}}} : {}),
        ...(allowed ? { privateDetails:{ address:'1 Fictional Street, Parramatta NSW', hasPoster, venue:{ fullAddress:'1 Fictional Street, Parramatta NSW', suburb:'Parramatta', state:'NSW', postcode:'2150', latitude:-33.8, longitude:151 } } } : {}) };
    },
    poster: async id => {
      calls.push(['poster',id]); if (rows.get(id).status !== 'approved' || (!manage(rows.get(id)) && !attending)) throw Error('Poster not authorised.');
      return { mime:'image/png', base64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jG6kAAAAASUVORK5CYII=' };
    },
    approve: async (id, revision) => { calls.push(['approve',id,revision]); if (role !== 'superAdmin') throw Error('Superadmin required.'); rows.set(id, { ...rows.get(id), ...(staged && id === 'registration-approved' ? {title:'Submitted Registration Workshop',startTime:'20:00'} : {}), status:'approved', revision:revision + 1 }); if(id==='registration-approved')staged=false; },
    approveSeries:async data=>{calls.push(['approveSeries',data]);if(role!=='superAdmin')throw Error('Superadmin required.');for(const item of data.occurrences)rows.set(item.eventId,{...rows.get(item.eventId),status:'approved'});return {events:data.occurrences};},
    submitOccurrences:async data=>{calls.push(['submitOccurrences',data]);for(const item of data.occurrences)seriesBookings.add(item.eventId);attending=true;return {registrations:data.occurrences};},
    deleteEvent: async (id, revision) => { calls.push(['delete',id,revision]); rows.set(id, { ...rows.get(id), status:'cancelled', deletedAt:'now', revision:revision + 1 }); },
    templates: async () => ({ templates:[], nextCursor:null }),
    responses: async id => { calls.push(['responses',id]); return { registrations:[
      { registrationId:'opaque-response-reference', revision:1, status:'registered', places:1, fields,
        answers:{ name:'Example attendee' } },
    ], nextCursor:null }; },
    removePoster: async () => { hasPoster = false; },
    submit: async data => { calls.push(['submit',data.eventId]); attending = true; if(cancelOnSubmit) { rows.set(data.eventId,{...rows.get(data.eventId),status:'cancelled'}); throw Error('Event was cancelled.'); } },
    cancel: async (id,revision) => {calls.push(['cancel',id,revision]);attending=false;},
    save: async ({ eventId, draft }) => { calls.push(['save',eventId]); const row = rows.get(eventId); rows.set(eventId, { ...row, ...draft, revision:row.revision + 1 }); return { eventId, revision:row.revision + 1 }; },
  };
  return { api, calls, publicRows:() => [...rows.values()].filter(row => row.status === 'approved').map(decorate) };
}
