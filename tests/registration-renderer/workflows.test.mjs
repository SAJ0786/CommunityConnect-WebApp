import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
const require = createRequire(import.meta.url), root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outfile = path.join(root, '.qa-registration-renderer.cjs');
await build({ entryPoints:[path.join(root,'src/registration/RegistrationWorkspace.jsx')],outfile,bundle:true,platform:'node',format:'cjs',loader:{'.css':'empty'},plugins:[{name:'isolated-ui-test',setup(builder){
  builder.onResolve({filter:/^react$/},()=>({path:require.resolve('react'),external:true}));
  builder.onResolve({filter:/AddressAutocomplete/},()=>({path:path.join(root,'tests/registration-workspace-preview/address.jsx')}));
  builder.onResolve({filter:/services\/(settingsService|organisationsService|imageService)$/},args=>({path:args.path,namespace:'shared-form-fixture'}));
  builder.onLoad({filter:/.*/,namespace:'shared-form-fixture'},()=>({contents:'export const getHijriSettings=async()=>({overrides:[]}); export const getOrganisations=async()=>[]; export const getFallbackImage=()=>""; export const uploadEventImage=()=>{throw Error("Registration must never use public poster upload");};'}));
}}] });
const Workspace = require(outfile).default;
const listeners = new Map();
globalThis.document = { hidden:false,addEventListener:(name, fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name) };
const venue = { fullAddress:'1 Fictional Street, Parramatta NSW',suburb:'Parramatta',state:'NSW',postcode:'2150',latitude:-33.8,longitude:151 };
const fields = [{id:'name',label:'Full name',type:'text',required:true,options:[]},{id:'consent',label:'Agreement',type:'consent',required:true,terms:'Fictional review terms',options:[]}];
const text = node => typeof node === 'string' ? node : (node?.children || []).map(text).join('');
const button = (view, label) => view.root.findAllByType('button').find(node=>text(node)===label);
async function click(view,label) { const node=button(view,label); assert.ok(node,`Missing button: ${label}`);assert.ok(!node.props.disabled,`Disabled: ${label}`); await act(async()=>{if(node.props.type==='submit'){let form=node.parent;while(form&&form.type!=='form')form=form.parent;await form.props.onSubmit({preventDefault(){}});}else await node.props.onClick?.({preventDefault(){}});}); }
async function fill(view,label,value) { const node=view.root.findAllByType('label').find(node=>text(node).startsWith(label));assert.ok(node,label);const input=node.props.htmlFor ? view.root.findAll(inputNode=>['input','textarea','select'].includes(inputNode.type)&&inputNode.props.id===node.props.htmlFor)[0] : node.findAll(node=>['input','textarea','select'].includes(node.type))[0];await act(async()=>{input.props.onChange({target:{value,checked:value}});}); }
async function submit(view){await act(async()=>{await view.root.findByType('form').props.onSubmit({preventDefault(){}});});}
function fixture({manager=false,registered=false,closed=false,failFirstSubmission=false,failFirstPoster=false,staged=false}={}) {
  const calls=[];let booking=registered?{registrationId:'booking',revision:2,status:'registered',places:3,formVersion:1,fields:structuredClone(fields),answers:{name:'Fictional member',consent:true}}:null;
  let event={id:'example',title:'Fictional workshop',date:'2099-12-01',eventType:'Workshop',suburb:'Parramatta',notes:'',capacity:10,closes:'',allowCancellation:true,status:'approved',revision:4,city:'sydney'};
  let form={version:1,purpose:'Organise a fictional workshop.',fields:structuredClone(fields)};
  let templates=[];let firstSubmit=true,firstPoster=true,pendingChanges=null;
  const detail=()=>({event:{...structuredClone(event),...(manager&&pendingChanges?{hasPendingChanges:true}:{})},form:structuredClone(form),ownRegistration:booking,canManage:manager,canApprove:manager&&(event.status==='pending'||!!pendingChanges),canRegister:!closed&&event.status==='approved',canEditRegistration:!!booking&&event.status==='approved',canCancel:!!booking,registrationNeedsReview:false,...(manager&&pendingChanges?{pendingChanges:structuredClone(pendingChanges)}:{}),...(manager||booking&&event.status!=='cancelled'?{privateDetails:{address:venue.fullAddress,venue,hasPoster:false}}:{})});
  const api={
    async list(data){calls.push(['list',data]);return data.cursor||data.scope!=='public'?{events:[event],nextCursor:null}:{events:[],nextCursor:'empty-page-next'};},
    async load(){return detail();},async templates(){return {templates,nextCursor:null};},
    async saveTemplate(data){calls.push(['template',data]);templates=[{...data,id:data.templateId}];},
    async save(data){calls.push(['save',data]);if(staged&&event.status==='approved'){event={...event,revision:event.revision+1};pendingChanges={event:{...event,...data.draft},form:{...form,fields:data.draft.fields,purpose:data.draft.purpose},privateDetails:{address:data.draft.address||venue.fullAddress,venue:data.draft.venue||venue,hasPoster:false,hostPhone:data.draft.hostPhone,hostContactOptional:data.draft.hostContactOptional}};}else{event={...event,...data.draft,revision:event.revision+1};form={...form,fields:data.draft.fields,purpose:data.draft.purpose,version:form.version+1};}return {eventId:event.id,revision:event.revision};},
    async submit(data){calls.push(['submit',data]);booking={registrationId:'booking',revision:3,status:'registered',places:data.places,answers:data.answers,fields:form.fields,formVersion:form.version};if(firstSubmit&&failFirstSubmission){firstSubmit=false;throw Error('Response lost after write');}},
    async cancel(...data){calls.push(['cancel',data]);booking=null;},
    async cancelEvent(...data){calls.push(['cancelEvent',data]);event.status='cancelled';},
    async approve(...data){calls.push(['approve',data]);if(pendingChanges){event={...pendingChanges.event,revision:event.revision+1};form={...pendingChanges.form,version:form.version+1};pendingChanges=null;}event.status='approved';},
    async uploadPoster(...data){calls.push(['poster',data]);if(firstPoster&&failFirstPoster){firstPoster=false;throw Error('Upload failed');}},
    async removePoster(){},async poster(){throw Error('No poster');},
    async responses(data,cursor){calls.push(['responses',data,cursor]);return {registrations:booking?[booking]:[],nextCursor:cursor?null:'response-next'};},
    async deleteAnswers(...data){calls.push(['deleteAnswers',data]);booking={...booking,fields:[],answers:{},answersDeletedAt:'today'};},
  };
  return {api,calls,detail,setPending:()=>{event.status='pending';}};
}
async function mount(f,extra={}){let view;await act(async()=>{view=Renderer.create(React.createElement(Workspace,{api:f.api,enabled:true,user:{uid:'fixture'},profile:{role:'superAdmin'},city:'sydney',onBack:()=>{},...extra}));});return view;}
async function card(view){await click(view,'Load more events');await click(view,'View event');}
test('disabled route makes no calls; empty scan page retains Load more and public card hides venue',async()=>{
  const f=fixture();const off=await mount(f,{enabled:false});assert.equal(f.calls.length,0);off.unmount();
  const view=await mount(f);assert.ok(button(view,'Load more events'));await card(view);assert.ok(!text(view.toJSON()).includes(venue.fullAddress));assert.equal(f.calls[1][1].cursor,'empty-page-next');view.unmount();
});
test('lost submission response retries the same request and confirms server-owned places',async()=>{
  const f=fixture({failFirstSubmission:true}),view=await mount(f);await card(view);await click(view,'Register for event');
  await fill(view,'Full name','Fictional member');await fill(view,'I agree to these terms',true);await submit(view);
  assert.ok(button(view,'Retry same submission'));await submit(view);
  const sent=f.calls.filter(row=>row[0]==='submit');assert.equal(sent.length,2);assert.equal(sent[0][1].requestId,sent[1][1].requestId);
  assert.ok(text(view.toJSON()).includes('Registration confirmed'));assert.ok(text(view.toJSON()).includes(venue.fullAddress));assert.ok(view.root.findAllByType('a').some(a=>a.props.href.includes('destination=')));view.unmount();
});
test('after closing, answers and reduced places are allowed but more places are rejected',async()=>{
  const f=fixture({registered:true,closed:true}),view=await mount(f);await card(view);await click(view,'Edit registration');
  assert.equal(view.root.findAllByType('input').find(input=>input.props.type==='checkbox').props.checked,false);
  await fill(view,'Number of attendees','4');await fill(view,'I agree to these terms',true);await submit(view);
  assert.equal(f.calls.filter(row=>row[0]==='submit').length,0);assert.ok(text(view.toJSON()).includes('cannot add places'));
  await fill(view,'Number of attendees','2');await submit(view);assert.equal(f.calls.find(row=>row[0]==='submit')[1].places,2);view.unmount();
});
test('host edits use templates, preview and expected revision; approved status is retained',async()=>{
  const f=fixture({manager:true}),view=await mount(f);await card(view);await click(view,'Edit event and form');await click(view,'Choose registration form');await click(view,'Continue current form');
  await fill(view,'Save reusable template as','Fictional template');await click(view,'Save template without venue or answers');
  assert.equal(f.calls.find(row=>row[0]==='template')[1].venue,undefined);
  await click(view,'Preview attendee form');await click(view,'Save event and registration form');
  const saved=f.calls.find(row=>row[0]==='save')[1];assert.equal(saved.expectedRevision,4);assert.equal(saved.draft.venue.latitude,venue.latitude);assert.ok(text(view.toJSON()).includes('remains approved'));view.unmount();
});
test('new host flow requires venue, saves a form and recovers a partial poster upload',async()=>{
  globalThis.FileReader=class { readAsDataURL(){this.result='data:image/png;base64,c3ludGhldGlj';this.onload();} };
  const f=fixture({manager:true,failFirstPoster:true}),view=await mount(f,{initialCreate:true});
  await fill(view,'Event title','New fictional event');await fill(view,'Date *','2099-12-01');await click(view,'Select fictional private venue');
  await fill(view,'Host Name','Example host');await fill(view,'Start time','18:30');await fill(view,'End Time','20:00');
  const picker=view.root.findAllByType('input').find(input=>input.props.type==='file');
  await act(async()=>{picker.props.onChange({target:{files:[{type:'image/png',size:50}]}});});
  await click(view,'Choose registration form');await click(view,'Continue current form');await click(view,'Preview attendee form');await click(view,'Save event and registration form');
  const saved=f.calls.find(row=>row[0]==='save')[1];assert.ok(saved.createKey);assert.equal(saved.eventId,undefined);
  assert.equal(saved.draft.startTime,'18:30');assert.equal(saved.draft.endTime,'20:00');assert.equal(saved.draft.hostName,'Example host');
  assert.ok(text(view.toJSON()).includes('poster upload was not confirmed'));await click(view,'Retry selected poster upload');
  const uploads=f.calls.filter(row=>row[0]==='poster');assert.equal(uploads.length,2);assert.equal(uploads[1][1][1],5);view.unmount();delete globalThis.FileReader;
});
test('approval and attendee deletion retain confirmations without a separate whole-event cancellation control',async()=>{
  const f=fixture({manager:true,registered:true}),view=await mount(f);f.setPending();await card(view);
  await click(view,'Approve event');await click(view,'Confirm approve event');assert.equal(f.calls.find(row=>row[0]==='approve')[1][1],4);
  assert.equal(view.root.findAllByType('button').some(button=>text(button.props.children)==='Cancel whole event'),false);
  assert.equal(f.calls.filter(row=>row[0]==='cancelEvent').length,0);
  await click(view,'Delete my registration');await click(view,'Confirm delete registration');assert.equal(f.calls.find(row=>row[0]==='cancel')[1][1],2);view.unmount();
});
test('responses paginate and answer deletion does not cancel reserved places',async()=>{
  const f=fixture({manager:true,registered:true}),view=await mount(f);await card(view);await click(view,'Registration responses');await click(view,'Load more responses');
  const response=view.root.findByProps({className:'card registration-response'});
  assert.equal(text(response.findByType('summary')),'Fictional member');
  assert.equal(response.props.open,undefined,'Responses start collapsed');
  assert.equal(view.root.findAllByType('h3').some(node=>text(node)==='booking'),false);
  assert.equal(f.calls.filter(row=>row[0]==='responses')[1][2],'response-next');await click(view,'Permanently delete answers only');await click(view,'Confirm delete answers');
  assert.equal(f.calls.find(row=>row[0]==='deleteAnswers')[1][3],'DELETE ANSWERS');assert.equal(f.detail().ownRegistration.places,3);view.unmount();
});
test('production submission returns to the event card with current registration, not a confirmation route',async()=>{
  const f=fixture(),returned=[];
  const view=await mount(f,{operationsOnly:true,initialEventId:'example',initialAction:'register',onSubmitted:event=>returned.push(event)});
  await fill(view,'Full name','Example attendee');await fill(view,'I agree to these terms',true);await submit(view);
  assert.equal(returned.length,1);assert.equal(returned[0].id,'example');assert.equal(f.detail().ownRegistration.status,'registered');
  view.unmount();
});
test('registration event details reuse normal fields and preserve private contacts, audience, subject and exact time',async()=>{
  const f=fixture({manager:true}),view=await mount(f);await card(view);await click(view,'Edit event and form');
  await fill(view,'Host Name','Example host');await fill(view,'Host Phone Number','0400000000');
  await fill(view,'Subject','Example subject');await fill(view,'Audience Type','Ladies only');
  await fill(view,'Start time','23:00');await fill(view,'End Time','01:00');
  assert.ok(button(view,'Prayer Time (Variable)'));assert.ok(button(view,'🌙 Hijri'));
  await click(view,'Choose registration form');await click(view,'Continue current form');await click(view,'Preview attendee form');await click(view,'Save event and registration form');
  const saved=f.calls.find(row=>row[0]==='save')[1].draft;
  assert.equal(saved.hostName,'Example host');assert.equal(saved.hostPhone,'0400000000');assert.equal(saved.eventSubject,'Example subject');
  assert.equal(saved.audienceType,'Ladies only');assert.equal(saved.startTime,'23:00');assert.equal(saved.endTime,'01:00');
  assert.equal(f.calls.filter(row=>row[0]==='poster').length,0);
  view.unmount();
});
test('registration prayer-time selection saves its calculated clock and survives reopening the event details step',async()=>{
  const f=fixture({manager:true}),view=await mount(f);await card(view);await click(view,'Edit event and form');
  await click(view,'Prayer Time (Variable)');await fill(view,'Prayer Time *','maghreb');
  const clock=text(view.toJSON()).match(/Event start time: (\d{2}:\d{2})/)?.[1];assert.ok(clock,'Calculated clock must be visible');
  await click(view,'Choose registration form');await click(view,'Event details');
  assert.ok(text(view.toJSON()).includes(`Event start time: ${clock}`));
  await click(view,'Choose registration form');await click(view,'Continue current form');await click(view,'Preview attendee form');await click(view,'Save event and registration form');
  const saved=f.calls.find(row=>row[0]==='save')[1].draft;
  assert.equal(saved.startTime,clock);assert.equal(saved.timeMode,'prayer');assert.equal(saved.prayerName,'maghreb');assert.equal(saved.prayerTimeZone,'Australia/Sydney');
  view.unmount();
});
test('staged approved-event edits reopen in editor/review but self-registration still uses the published form',async()=>{
  const f=fixture({manager:true,staged:true});
  const original=f.detail();
  await f.api.save({eventId:'example',expectedRevision:4,draft:{title:'Submitted replacement',date:'2099-12-02',eventType:'Workshop',startTime:'19:30',endTime:'',
    address:venue.fullAddress,venue,suburb:'Parramatta',capacity:10,purpose:'Changed purpose',fields:[{id:'changed',type:'text',label:'Unapproved question',required:true}]}});
  assert.equal(f.detail().event.title,original.event.title);assert.equal(f.detail().form.version,original.form.version);
  let view=await mount(f,{operationsOnly:true,initialEventId:'example',initialAction:'edit'});
  assert.equal(view.root.findAllByType('label').find(node=>text(node).startsWith('Event title')).findByType('input').props.value,'Submitted replacement');
  assert.equal(view.root.findAllByType('input').find(input=>input.props.type==='time').props.value,'19:30');view.unmount();
  view=await mount(f,{operationsOnly:true,initialEventId:'example',initialAction:'register'});
  assert.ok(text(view.toJSON()).includes('Full name'));assert.ok(!text(view.toJSON()).includes('Unapproved question'));
  await fill(view,'Full name','Example host');await fill(view,'I agree to these terms',true);await submit(view);
  assert.equal(f.calls.find(row=>row[0]==='submit')[1].formVersion,1);view.unmount();
  view=await mount(f,{operationsOnly:true,initialEventId:'example',initialAction:'approve'});
  assert.ok(text(view.toJSON()).includes('Submitted replacement'));assert.ok(text(view.toJSON()).includes('Unapproved question'));
  await click(view,'Confirm approve event');
  assert.equal(f.calls.find(row=>row[0]==='approve')[1][1],5);
  assert.equal(f.detail().event.title,'Submitted replacement');assert.equal(f.detail().event.hasPendingChanges,undefined);view.unmount();
});
test('submitted poster preview explicitly requests the manager-only pending view and stays separate from published poster',async()=>{
  const f=fixture({manager:true,staged:true});
  await f.api.save({draft:{title:'Submitted replacement',fields:structuredClone(fields),purpose:'Review purpose'}});
  const load=f.api.load;f.api.load=async()=>{const detail=await load();detail.pendingChanges.privateDetails.hasPoster=true;return detail;};
  f.api.poster=async(...args)=>{f.calls.push(['poster-view',...args]);return {mime:'image/png',base64:'c3ludGhldGlj'};};
  const view=await mount(f,{operationsOnly:true,initialEventId:'example',initialAction:'approve'});
  await click(view,'View submitted poster');
  assert.deepEqual(f.calls.find(row=>row[0]==='poster-view'),['poster-view','example','pending']);
  assert.equal(view.root.findAllByType('img').find(image=>image.props.alt==='Submitted event poster').props.src,'data:image/png;base64,c3ludGhldGlj');
  assert.equal(view.root.findAllByType('img').some(image=>image.props.alt==='Private event poster'),false);
  view.unmount();
});
test('backgrounding clears private rendered content and foreground reloads authorised detail',async()=>{
  const f=fixture({registered:true}),view=await mount(f);await card(view);assert.ok(text(view.toJSON()).includes(venue.fullAddress));
  await act(async()=>{document.hidden=true;listeners.get('visibilitychange')();});assert.ok(!text(view.toJSON()).includes(venue.fullAddress));
  await f.api.cancel();await act(async()=>{document.hidden=false;listeners.get('visibilitychange')();});assert.ok(!text(view.toJSON()).includes(venue.fullAddress));view.unmount();
});

const cityOut = path.join(root,'.qa-city-renderer.cjs');
await build({entryPoints:[path.join(root,'src/components/CityManagementPanel.jsx')],outfile:cityOut,bundle:true,platform:'node',format:'cjs',plugins:[{name:'isolated-city-ui',setup(builder){
  builder.onResolve({filter:/^react$/},()=>({path:require.resolve('react'),external:true}));
  builder.onResolve({filter:/firebase|releaseGates|services\/cityCatalogue/},args=>({path:args.path,namespace:'fixture'}));
  builder.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path.includes('releaseGates')?'export const CITY_MANAGEMENT_ENABLED=true;':args.path.includes('cityCatalogue')?'export const acceptCityCatalogue=data=>globalThis.acceptFixtureCatalogue(data);':args.path==='firebase/functions'?'export const httpsCallable=(_,name)=>async data=>({data:await globalThis.cityRpc(name,data)});':'export const functions={};',loader:'js'}));
}}]});
const CityPanel=require(cityOut).default;
test('Add City is hidden from non-superadmins and blocks a preview with missing coordinates',async()=>{
  let view;await act(async()=>{view=Renderer.create(React.createElement(CityPanel,{profile:{role:'admin'}}));});assert.equal(view.toJSON(),null);view.unmount();
  const calls=[];globalThis.cityRpc=async(name,data)=>{calls.push([name,data]);return name==='searchCatalogueCities'?{suggestions:[{placeId:'place',label:'Darwin'}]}:{placeId:'place',fingerprint:'fingerprint',city:{id:'darwin',label:'Darwin',latitude:null,longitude:130.8,timeZone:'Australia/Darwin'}};};
  await act(async()=>{view=Renderer.create(React.createElement(CityPanel,{profile:{role:'superAdmin'}}));});await fill(view,'City name','Darwin');await click(view,'Search cities');await click(view,'Darwin');await fill(view,'City short code','DRW');
  assert.ok(button(view,'Confirm and add city').props.disabled);assert.ok(text(view.toJSON()).includes('Missing'));assert.equal(calls.filter(row=>row[0]==='addCatalogueCity').length,0);view.unmount();
});
test('Add City displays verified coordinates and sends only confirmed fingerprint/code',async()=>{
  const calls=[];globalThis.acceptFixtureCatalogue=()=>true;globalThis.cityRpc=async(name,data)=>{calls.push([name,data]);return name==='searchCatalogueCities'?{suggestions:[{placeId:'place',label:'Darwin'}]}:name==='previewCatalogueCity'?{placeId:'place',fingerprint:'fingerprint',city:{id:'darwin',label:'Darwin',latitude:-12.46,longitude:130.8,timeZone:'Australia/Darwin'}}:{catalogue:{schemaVersion:1}};};
  let view;await act(async()=>{view=Renderer.create(React.createElement(CityPanel,{profile:{role:'superAdmin'}}));});await fill(view,'City name','Darwin');await click(view,'Search cities');await click(view,'Darwin');
  assert.ok(text(view.toJSON()).includes('-12.46'));assert.ok(text(view.toJSON()).includes('130.8'));assert.ok(text(view.toJSON()).includes('Australia/Darwin'));
  await fill(view,'City short code','DRW');await click(view,'Confirm and add city');assert.deepEqual(calls.at(-1),['addCatalogueCity',{placeId:'place',fingerprint:'fingerprint',code:'DRW'}]);assert.ok(text(view.toJSON()).includes('City added'));view.unmount();
});
