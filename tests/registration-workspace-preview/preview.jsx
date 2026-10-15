import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import RegistrationWorkspace from '../../src/registration/RegistrationWorkspace';
import { publicEvent, createDraft } from '../../src/registration/prototypeModel.mjs';
import { venue } from './address';
import '../../src/styles/theme.css';
const initial = { ...createDraft(), title:'Synthetic community workshop', date:'2026-12-01', suburb:'Parramatta', address:venue.fullAddress, venue, eventType:'Workshop', fields:[{id:'name',label:'Full name',type:'text',required:true,options:[]},{id:'consent',label:'Event agreement',type:'consent',required:true,terms:'Fictional preview terms only.',options:[]}] };
let draft = initial, status = 'approved', revision = 1, formVersion = 1, booking = null, savedTemplates = [], requestIds = new Set();
function Preview() {
  const [role, setRole] = useState('member'), [closing, setClosing] = useState(false), [generation, setGeneration] = useState(0);
  const api = useMemo(() => {
    const manager = ['organiser','superAdmin'].includes(role);
    const details = () => ({ event:{ ...publicEvent(draft),id:'synthetic-event',city:'sydney',status,revision,allowCancellation:true,registrationCount:booking ? 1:0 },form:{fields:draft.fields,purpose:draft.purpose,version:formVersion},ownRegistration:role==='member'?booking:null,canManage:manager,canApprove:role==='superAdmin',canRegister:!closing&&status==='approved',canEditRegistration:!!booking&&status==='approved',canCancel:!!booking,registrationNeedsReview:!!booking&&booking.formVersion!==formVersion,...(manager||booking&&role==='member'&&status!=='cancelled'?{privateDetails:{address:draft.address,venue:draft.venue,hasPoster:false}}:{}) });
    return {
      async list({cursor,scope}) { return !cursor&&scope==='public'?{events:[],nextCursor:'next-scanned-page'}:{events:[details().event],nextCursor:null}; },
      async load() { return structuredClone(details()); },
      async templates() { return {templates:savedTemplates,nextCursor:null}; },
      async saveTemplate(template) { savedTemplates.push({...structuredClone(template),id:template.templateId}); },
      async save(data) { draft=structuredClone(data.draft);revision++;formVersion++;return {eventId:'synthetic-event',revision}; },
      async approve() { status='approved';revision++; },
      async submit(data) { if(!requestIds.has(data.requestId)){booking={registrationId:'synthetic-registration',revision:(booking?.revision||0)+1,status:'registered',places:data.places,answers:structuredClone(data.answers),fields:structuredClone(draft.fields),formVersion,submittedAt:'2026-10-16'};requestIds.add(data.requestId);} return {registrationId:booking.registrationId}; },
      async cancel() { booking=null; },
      async cancelEvent() { status='cancelled';revision++; },
      async responses() { return {registrations:booking?[booking]:[],nextCursor:null}; },
      async deleteAnswers() { booking={...booking,answers:{},fields:[],answersDeletedAt:'2026-10-16'}; },
      async uploadPoster(){return {revision:++revision};},async removePoster(){return {revision:++revision};},async poster(){throw Error('No poster in fixture');},
    };
  },[role,closing,generation]);
  return <><aside className="card"><h1>Isolated workflow review</h1><p>Synthetic data only. No Firebase connection, real bookings, emails or push.</p><label>Preview role<select value={role} onChange={e=>setRole(e.target.value)}>{['guest','member','organiser','superAdmin'].map(value=><option key={value}>{value}</option>)}</select></label><label><input type="checkbox" checked={closing} onChange={e=>setClosing(e.target.checked)}/>New registrations closed</label><button onClick={()=>{status='pending';setGeneration(n=>n+1);}}>Make fixture pending review</button></aside><RegistrationWorkspace key={`${role}:${closing}:${generation}`} api={api} enabled user={{uid:role,isAnonymous:role==='guest'}} profile={{role:role==='superAdmin'?'superAdmin':'registered'}} city="sydney" onBack={()=>setGeneration(n=>n+1)} onRequireSignIn={()=>setRole('member')}/></>;
}
createRoot(document.getElementById('root')).render(<Preview/>);
