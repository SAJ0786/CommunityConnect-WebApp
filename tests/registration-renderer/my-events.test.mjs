import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import path from 'node:path';
import {build} from 'esbuild';
import React from 'react';
import Renderer,{act} from 'react-test-renderer';
const require=createRequire(import.meta.url),root=process.cwd(),outfile=path.join(root,'.qa-my-events-renderer.cjs');
await build({entryPoints:[path.join(root,'src/pages/MyEvents.jsx')],outfile,bundle:true,platform:'node',format:'cjs',plugins:[{name:'my-events-transports',setup(b){
 b.onResolve({filter:/^react$/},()=>({path:require.resolve('react'),external:true}));
 b.onResolve({filter:/EventCard$/},()=>({path:'card',namespace:'fixture'}));
 b.onResolve({filter:/eventService$/},()=>({path:'events',namespace:'fixture'}));
 b.onResolve({filter:/RegistrationContext$/},()=>({path:'registration',namespace:'fixture'}));
 b.onResolve({filter:/dateUtils$/},()=>({path:'dates',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='card'?'const React=require("react");export default p=>React.createElement("article",{"data-id":p.event.id},p.event.title);':args.path==='events'?'export const getMyEvents=uid=>globalThis.__myEventsFetch(uid);export const toggleEventVisibility=async()=>{};':args.path==='registration'?'export const useRegistration=()=>globalThis.__myEventsRegistration;export const useRegistrationFeed=(_,scope)=>({events:globalThis.__myEventsFeeds[scope],loading:false,error:""});':'export const compareEventsByDateTime=(a,b)=>a.id.localeCompare(b.id);'}));
}}]});
const MyEvents=require(outfile).default;
const props=uid=>({user:{uid},profile:{},setPage(){},setEditingEvent(){},handleDelete(){},handleCopy(){}});
const ids=view=>view.root.findAllByType('article').map(n=>n.props['data-id']);
test('organised events and bookings have independent views, including organiser self-bookings',async()=>{
 globalThis.__myEventsFetch=async()=>[{id:'normal',title:'Own normal event'}];globalThis.__myEventsRegistration={api:{},open(){}};
 const hosted={id:'hosted',title:'Own registration event',registrationOnly:true,canManage:true,ownerUid:'a',isRegistered:true};
 globalThis.__myEventsFeeds={mine:[hosted],attending:[hosted,{id:'booking',title:'Someone else’s event',registrationOnly:true,isRegistered:true,canManage:false,ownerUid:'other'}]};
 let view;await act(async()=>{view=Renderer.create(React.createElement(MyEvents,props('a')));});assert.deepEqual(ids(view),['hosted','normal']);
 await act(async()=>view.root.findByProps({id:'my-attending'}).props.onClick());assert.deepEqual(ids(view),['booking','hosted']);
 await act(async()=>view.root.findByProps({id:'my-organising'}).props.onClick());assert.deepEqual(ids(view),['hosted','normal']);view.unmount();
});
test('late results from the previous account cannot replace current My Events',async()=>{
 let finish;globalThis.__myEventsFetch=uid=>uid==='a'?new Promise(resolve=>finish=resolve):Promise.resolve([{id:'b-own',title:'B event'}]);
 globalThis.__myEventsRegistration={api:{},open(){}};globalThis.__myEventsFeeds={mine:[],attending:[]};
 let view;await act(async()=>{view=Renderer.create(React.createElement(MyEvents,props('a')));});
 await act(async()=>view.update(React.createElement(MyEvents,props('b'))));assert.deepEqual(ids(view),['b-own']);
 await act(async()=>finish([{id:'a-old',title:'A old event'}]));assert.deepEqual(ids(view),['b-own']);view.unmount();
});
