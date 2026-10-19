export function registrationFixture(date, user, role, guest, registered = false, staged = false, participants = false) {
  const calls = [];
  const rows = new Map([
    ['registration-approved', { id:'registration-approved', title:'Registration Workshop', date, eventType:'Workshop', city:'sydney', suburb:'Parramatta', status:'approved', revision:1, ownerUid:'synthetic-member', capacity:30, formVersion:1, startTime:'18:00', endTime:'19:00', startAt:`${date}T07:00:00Z`, endAt:`${date}T08:00:00Z` }],
    ['registration-pending', { id:'registration-pending', title:'Pending Workshop', date, eventType:'Workshop', city:'sydney', suburb:'Parramatta', status:'pending', revision:1, ownerUid:'synthetic-member', capacity:30, formVersion:1 }],
  ]);
  let attending = registered, hasPoster = true;
  const member = !guest, manage = row => member && (row.ownerUid === user.uid || ['admin','superAdmin'].includes(role));
  const hasChanges = row => staged && row.id === 'registration-approved';
  const decorate = row => ({ ...row, registrationOnly:true, canManage:manage(row), ...(manage(row) && hasChanges(row) ? {hasPendingChanges:true} : {}), canApprove:member && role === 'superAdmin' && (row.status === 'pending' || hasChanges(row)),
    isRegistered:attending && row.id === 'registration-approved', canRegister:row.status === 'approved', canEditRegistration:attending, ...(manage(row) || attending ? { hasPoster } : {}) });
  const fields = participants ? [{id:'email',type:'email',label:'Booking email',required:true},{id:'name',type:'text',label:'Full name',required:true,perParticipant:true},{id:'age',type:'number',label:'Age',required:true,perParticipant:true}] : [{ id:'name', type:'text', label:'Your name', required:true }];
  fields.push({id:'consent',type:'consent',label:'Parent or guardian consent',required:true,terms:'By registering, I confirm that I am authorised to book these places and that the participant details are correct. I understand that attendees must follow the organiser’s instructions and that I should contact the host about any access or participation needs before the event. I have reviewed the event information and agree to these registration terms.'});
  const api = {
    list: async ({ scope, city }) => {
      calls.push(['list',scope,city]);
      return { events:[...rows.values()].filter(row => !city || row.city === city).filter(row =>
        scope === 'public' ? row.status === 'approved' : scope === 'mine' ? row.ownerUid === user.uid && member
          : scope === 'attending' ? attending && row.id === 'registration-approved'
            : scope === 'review' ? role === 'superAdmin' && (row.status === 'pending' || hasChanges(row)) : ['admin','superAdmin'].includes(role)).map(decorate), nextCursor:null };
    },
    load: async id => {
      calls.push(['load',id]); const row = rows.get(id); if (!row) throw Error('Event not found.');
      const allowed = manage(row) || attending, event = decorate(row);
      return { event, canManage:manage(row), canApprove:event.canApprove, canRegister:row.status === 'approved', canEditRegistration:attending,
        form:{ version:1, purpose:'Arrange the workshop.', fields },
        ownRegistration:attending ? { status:'registered', revision:1, places:1, fields, answers:{ name:'Example attendee' } } : null,
        ...(manage(row) && hasChanges(row) ? {pendingChanges:{event:{...event,title:'Submitted Registration Workshop',startTime:'20:00'},form:{version:1,purpose:'Submitted purpose',fields:[{id:'submitted',type:'text',label:'Submitted question',required:true}]},
          privateDetails:{address:'2 Fictional Street, Parramatta NSW',hasPoster:false,venue:{fullAddress:'2 Fictional Street, Parramatta NSW',suburb:'Parramatta',state:'NSW',postcode:'2150',latitude:-33.8,longitude:151}}}} : {}),
        ...(allowed ? { privateDetails:{ address:'1 Fictional Street, Parramatta NSW', hasPoster, venue:{ fullAddress:'1 Fictional Street, Parramatta NSW', suburb:'Parramatta', state:'NSW', postcode:'2150', latitude:-33.8, longitude:151 } } } : {}) };
    },
    poster: async id => {
      calls.push(['poster',id]); if (!manage(rows.get(id)) && !attending) throw Error('Poster not authorised.');
      return { mime:'image/png', base64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jG6kAAAAASUVORK5CYII=' };
    },
    approve: async (id, revision) => { calls.push(['approve',id,revision]); if (role !== 'superAdmin') throw Error('Superadmin required.'); rows.set(id, { ...rows.get(id), ...(staged && id === 'registration-approved' ? {title:'Submitted Registration Workshop',startTime:'20:00'} : {}), status:'approved', revision:revision + 1 }); if(id==='registration-approved')staged=false; },
    deleteEvent: async (id, revision) => { calls.push(['delete',id,revision]); rows.set(id, { ...rows.get(id), status:'cancelled', deletedAt:'now', revision:revision + 1 }); },
    templates: async () => ({ templates:[], nextCursor:null }),
    responses: async id => { calls.push(['responses',id]); return { registrations:[
      { registrationId:'opaque-response-reference', revision:1, status:'registered', places:1, fields,
        answers:{ name:'Example attendee' } },
    ], nextCursor:null }; },
    removePoster: async () => { hasPoster = false; },
    submit: async data => { calls.push(['submit',data.eventId]); attending = true; },
    save: async ({ eventId, draft }) => { calls.push(['save',eventId]); const row = rows.get(eventId); rows.set(eventId, { ...row, ...draft, revision:row.revision + 1 }); return { eventId, revision:row.revision + 1 }; },
  };
  return { api, calls, publicRows:() => [...rows.values()].filter(row => row.status === 'approved').map(decorate) };
}
