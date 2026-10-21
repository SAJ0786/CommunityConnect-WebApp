import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import path from 'node:path';
import {build} from 'esbuild';
import React from 'react';
import Renderer,{act} from 'react-test-renderer';
const require=createRequire(import.meta.url),root=process.cwd(),outfile=path.join(root,'.qa-event-landing.cjs');
await build({stdin:{contents:"export {default as Landing} from './src/registration/RegistrationEventLanding';export {RegistrationContext} from './src/registration/RegistrationContext';",resolveDir:root,loader:'jsx'},outfile,bundle:true,platform:'node',format:'cjs',jsx:'automatic',loader:{'.css':'empty'},define:{'import.meta.env':'{}'},plugins:[{name:'landing-test-transports',setup(b){
 b.onResolve({filter:/^react(\/jsx-runtime)?$/},args=>({path:require.resolve(args.path),external:true}));
 b.onResolve({filter:/services\/imageService$/},()=>({path:'images',namespace:'fixture'}));
 b.onResolve({filter:/services\/hijriService$/},()=>({path:'hijri',namespace:'fixture'}));
 b.onResolve({filter:/services\/settingsService$/},()=>({path:'settings',namespace:'fixture'}));
 b.onResolve({filter:/\/(LiveStream|EventSeriesArchiveDialog|ContactHostDialog|EventReminderDialog)$/},()=>({path:'dialogs',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='images'?'export const getEventImage=()=>({src:"",isLogo:true});export const getFallbackImageAsync=async()=>"";':args.path==='hijri'?'export const getHijriDisplay=()=>"";export const hijriDisplayFromParts=()=>"";':args.path==='settings'?'export const getHijriSettings=async()=>({overrides:[]});':'export default ()=>null;export const GoLiveButton=()=>null;export const WatchLiveButton=()=>null;'}));
}}]});
const {Landing,RegistrationContext}=require(outfile);
const listeners=new Set();
globalThis.document={hidden:false,addEventListener:(_,fn)=>listeners.add(fn),removeEventListener:(_,fn)=>listeners.delete(fn)};
globalThis.window={};
const text=node=>Array.isArray(node)?node.map(text).join(' '):node&&typeof node==='object'?text(node.children||node.props?.children||[]):String(node??'');
const detail=(overrides={})=>({event:{id:'example',title:'Example registration event',date:'2099-12-01',eventType:'Workshop',city:'sydney',suburb:'Parramatta',ownerUid:'host',revision:2,status:'approved'},canManage:false,canRegister:true,ownRegistration:null,...overrides});
function fixture(initial=detail()){
 const calls=[],opens=[];let result=initial;
 const api={card:async id=>{calls.push(id);return result;},load:async()=>{throw Error('Notification landing must not load a form');},poster:async()=>{throw Error('No poster');}};
 const props={api,enabled:true,eventId:'example',user:{uid:'member'},profile:{role:'user'},onBack(){}};
 const render=(extra={})=>React.createElement(RegistrationContext.Provider,{value:{api:extra.api||api,revision:0,open:(...args)=>opens.push(args),refresh(){}}},React.createElement(Landing,{...props,...extra}));
 return{api,calls,opens,render,setResult:value=>{result=value;}};
}
test('notification landing uses the actual expanded event card with one lightweight read and no form',async()=>{
 const f=fixture();let view;await act(async()=>{view=Renderer.create(f.render());});
 assert.equal(f.calls.length,1,'Prefetched card is handed to EventCard without a second read');
 assert.ok(text(view.toJSON()).includes('Registration Only - Event details'));
 assert.ok(view.root.findByProps({className:'event-card-details'}));
 assert.equal(view.root.findAllByProps({className:'registration-workspace'}).length,0);
 assert.equal(view.root.findAllByType('form').length,0);
 await act(async()=>view.unmount());
});
test('organiser notification exposes responses only as a deliberate event-card action',async()=>{
 const f=fixture(detail({canManage:true,privateDetails:{address:'Private test address',hasPoster:false}}));let view;await act(async()=>{view=Renderer.create(f.render({user:{uid:'host'}}));});
 const responses=view.root.findAllByType('button').find(n=>n.props['aria-label']==='Registration responses');assert.ok(responses);assert.equal(responses.props.disabled,false);
 await act(async()=>responses.props.onClick({stopPropagation(){}}));assert.equal(f.opens.at(-1)[1],'responses');
 assert.ok(text(view.toJSON()).includes('Private test address'));await act(async()=>view.unmount());
});
test('cancelled notification displays event status and does not render a registration form',async()=>{
 const cancelled=detail({ownRegistration:{status:'registered',revision:2},canRegister:false});cancelled.event={...cancelled.event,status:'cancelled',deletedAt:'2026-10-21'};
 const f=fixture(cancelled);let view;await act(async()=>{view=Renderer.create(f.render());});
 assert.ok(text(view.toJSON()).includes('Event deleted')||text(view.toJSON()).includes('Event cancelled'));
 assert.equal(view.root.findAllByType('form').length,0);await act(async()=>view.unmount());
});
test('background clears private card data and foreground reauthorises without duplicate reads',async()=>{
 const f=fixture(detail({canManage:true,privateDetails:{address:'Private test address',hasPoster:false}}));let view;await act(async()=>{view=Renderer.create(f.render({user:{uid:'host'}}));});
 await act(async()=>{document.hidden=true;for(const fn of [...listeners])fn();});assert.ok(!text(view.toJSON()).includes('Private test address'));
 f.setResult(detail());await act(async()=>{document.hidden=false;for(const fn of [...listeners])fn();});assert.equal(f.calls.length,2);assert.ok(!text(view.toJSON()).includes('Private test address'));
 await act(async()=>view.unmount());
});
test('late event details cannot cross accounts and failed loads provide retry instead of a form',async()=>{
 let finish;const old=fixture();old.api.card=()=>new Promise(resolve=>{finish=resolve;});let view;await act(async()=>{view=Renderer.create(old.render());});
 const next=fixture();next.api.card=async()=>{throw Error('No access to this event');};
 await act(async()=>view.update(next.render({user:{uid:'another'}})));assert.ok(text(view.toJSON()).includes('No access'));
 await act(async()=>finish(detail({privateDetails:{address:'Previous account private address'}})));assert.ok(!text(view.toJSON()).includes('Previous account private address'));
 next.api.card=async()=>detail();const retry=view.root.findAllByType('button').find(n=>text(n.props.children)==='Retry event');await act(async()=>retry.props.onClick());
 assert.ok(text(view.toJSON()).includes('Example registration event'));await act(async()=>view.unmount());
});
