import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { build } from 'esbuild';
import React from 'react';
import Renderer, { act } from 'react-test-renderer';
const require = createRequire(import.meta.url), root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outfile = path.join(root, '.qa-event-creation-renderer.cjs');
const fixtures = {
  firebase: 'export const db={};',
  firestore: `export const collection=(_,name)=>({path:name}); export const doc=ref=>({path:ref.path+'/'+(++globalThis.__saveState.ids)}); export const serverTimestamp=()=>({timestamp:true}); export const writeBatch=()=>{const writes=[];return {set:(ref,data)=>writes.push({ref,data}),commit:()=>globalThis.__saveState.commit(writes)};}; export const setDoc=()=>{throw Error('Must not write the server-only series summary');};`,
  eventService: `export const createEvent=(...args)=>globalThis.__saveState.single(...args); export const validateRequiredEventFields=e=>{if(!e.startTime||!e.eventDate||!e.address)throw Error('Missing fields');};`,
  settingsService: 'export const getHijriSettings=async()=>({overrides:[]});',
  organisationsService: 'export const getOrganisations=async()=>[];',
  eventOptionsService: 'export const getDynamicEventOptions=async()=>({eventTypes:[]});',
  imageService: 'export const getFallbackImage=()=>""; export const uploadEventImage=(...args)=>globalThis.__saveState.upload(...args);',
};
await build({stdin:{contents:'export {default as Recurring} from "./src/pages/AddRecurringEvent.jsx"; export {default as Add} from "./src/pages/AddEvent.jsx"; export {default as Form} from "./src/components/EventForm.jsx"; export {default as Filters} from "./src/components/EventFilters.jsx";',resolveDir:root},outfile,bundle:true,platform:'node',format:'cjs',jsx:'automatic',define:{'import.meta.env':'{}'},loader:{'.css':'empty'},plugins:[{name:'event-save-fixtures',setup(b){
  b.onResolve({filter:/^react(?:\/.*)?$/},args=>({path:require.resolve(args.path),external:true}));
  b.onResolve({filter:/firebase\/firestore$/},()=>({path:'firestore',namespace:'fixture'}));
  b.onResolve({filter:/firebase\/firebase$/},()=>({path:'firebase',namespace:'fixture'}));
  b.onResolve({filter:/services\/(eventService|settingsService|organisationsService|eventOptionsService|imageService)$/},args=>({path:args.path.split('/').at(-1),namespace:'fixture'}));
  b.onResolve({filter:/AddressAutocomplete$/},()=>({path:path.join(root,'tests/registration-workspace-preview/address.jsx')}));
  b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:fixtures[args.path]}));
}}]});
const { Recurring, Add, Form, Filters } = require(outfile);
globalThis.window = {setTimeout, clearTimeout}; globalThis.document = {querySelector:()=>null};
const input = {eventDate:'2099-01-01',startTime:'18:00',address:{fullAddress:'1 Fictional Street NSW',suburb:'Sydney'},hostName:'Fixture host',eventType:'Majlis'};
const baseProps = {user:{uid:'owner',email:'fixture@example.test'},profile:{role:'superAdmin',fullName:'Fixture owner'},setPage(){}};
const text = node => typeof node === 'string' ? node : (node?.children || []).map(text).join('');
const button = (view,label)=>view.root.findAllByType('button').find(node=>text(node)===label);
const deferred = ()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function state(overrides={}) {const value={ids:0,batches:[],rows:new Map(),async commit(writes){this.batches.push(writes);writes.forEach(({ref,data})=>this.rows.set(ref.path,data));},single:async()=>{},upload:async()=>({url:'',path:''}),...overrides};globalThis.__saveState=value;return value;}
async function render(Component,props) {let view;await act(async()=>{view=Renderer.create(React.createElement(Component,props));});return view;}

test('recurring save commits once, confirms before navigation completes and rejects repeated submission',async()=>{
  const gate=deferred(), nav=deferred(), saved=[];const store=state();store.commit=async writes=>{store.batches.push(writes);await gate.promise;writes.forEach(({ref,data})=>store.rows.set(ref.path,data));};
  const view=await render(Recurring,{...baseProps,onSaved:message=>{saved.push(message);return nav.promise;}});
  const submit=view.root.findByType(Form).props.onSubmit;let first,second;
  await act(async()=>{first=submit(input);second=submit(input);});assert.equal(store.batches.length,1);assert.equal(view.root.findByType(Form).props.saving,true);
  await act(async()=>{gate.resolve();await Promise.resolve();});assert.equal(store.rows.size,4);assert.equal(saved.length,1);assert.match(text(view.toJSON()),/4 events? added successfully/);assert.equal(view.root.findAllByType(Form).length,0);
  await act(async()=>{await submit(input);nav.resolve();await first;await second;});assert.equal(store.batches.length,1);await act(async()=>view.unmount());
});
test('lost response retry uses identical event references and creates no second series',async()=>{
  const store=state(), saved=[];let fail=true;store.commit=async writes=>{store.batches.push(writes);writes.forEach(({ref,data})=>store.rows.set(ref.path,data));if(fail){fail=false;throw Error('Response lost');}};
  const view=await render(Recurring,{...baseProps,onSaved:m=>saved.push(m)});
  await act(async()=>view.root.findByType(Form).props.onSubmit(input));assert.equal(saved.length,0);assert.equal(store.rows.size,4);assert.ok(view.root.findByProps({role:'alert'}));assert.equal(view.root.findByType(Form).props.saving,false);assert.equal(view.root.findByType(Form).props.submitDisabled,true);
  await act(async()=>button(view,'Retry same save').props.onClick());assert.equal(store.rows.size,4);assert.deepEqual(store.batches[0],store.batches[1]);assert.equal(saved.length,1);assert.equal(view.root.findAllByType(Form).length,0);await act(async()=>view.unmount());
});
test('failed post-save navigation never restores single-event or recurring creation controls',async()=>{
  const prior=console.error;console.error=()=>{};try {
    for(const Component of [Add,Recurring]) {let writes=0;state({single:async()=>{writes++;}});const view=await render(Component,{...baseProps,...(Component===Add?{initialEvent:input}:{}),onSaved:async()=>{throw Error('Refresh unavailable');}});
      const submit=view.root.findByType(Form).props.onSubmit;await act(async()=>submit(input));assert.equal(view.root.findAllByType(Form).length,0);assert.ok(view.root.findByProps({role:'status'}));await act(async()=>submit(input));if(Component===Add)assert.equal(writes,1);await act(async()=>view.unmount());
    }
  } finally {console.error=prior;}
});
test('shared EventForm locks rapid submit and stays disabled until its parent save resolves',async()=>{
  const gate=deferred();let calls=0;state();const view=await render(Form,{...baseProps,initialEvent:input,onSubmit:()=>{calls++;return gate.promise;}});
  const submit=view.root.findByType('form').props.onSubmit;let first;
  await act(async()=>{first=submit({preventDefault(){}});await submit({preventDefault(){}});});assert.equal(calls,1);assert.equal(view.root.findByProps({type:'submit'}).props.disabled,true);
  await act(async()=>{gate.resolve();await first;});assert.equal(view.root.findByProps({type:'submit'}).props.disabled,false);await act(async()=>view.unmount());
});
test('advanced filter selection applies to newly refreshed events without resetting the selected criteria',async()=>{
  let selected;const old={id:'old',hostName:'Fixture host',eventType:'Majlis',eventDate:'2099-01-01',startTime:'18:00'};
  const view=await render(Filters,{events:[old],onChange:(rows,select)=>{selected={rows,select};}});
  const picker=view.root.findAll(node=>typeof node.type==='function'&&node.props.label==='Host name'&&typeof node.props.onChange==='function')[0];
  await act(async()=>picker.props.onChange('Fixture host'));assert.deepEqual(selected.rows.map(row=>row.id),['old']);
  assert.deepEqual(selected.select([{...old,id:'new'},{...old,id:'other',hostName:'Another host'}]).map(row=>row.id),['new']);await act(async()=>view.unmount());
});
