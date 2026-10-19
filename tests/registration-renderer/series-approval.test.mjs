import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import path from 'node:path';import {fileURLToPath} from 'node:url';import {build} from 'esbuild';import React from 'react';import Renderer,{act} from 'react-test-renderer';
const require=createRequire(import.meta.url),root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),outfile=path.join(root,'.qa-series-approval.cjs');
await build({entryPoints:[path.join(root,'src/registration/SeriesApproval.jsx')],outfile,bundle:true,platform:'node',format:'cjs',loader:{'.css':'empty'},plugins:[{name:'react-fixture',setup(builder){builder.onResolve({filter:/^react$/},()=>({path:require.resolve('react'),external:true}));}}]});
const Panel=require(outfile).default,text=node=>typeof node==='string'?node:(node?.children||[]).map(text).join('');
async function click(view,label){const button=view.root.findAllByType('button').find(node=>text(node)===label);assert.ok(button,label);assert.ok(!button.props.disabled,label);await act(async()=>button.props.onClick());}
async function check(view,label){const input=view.root.findAllByType('label').find(node=>text(node)===label).findByType('input');assert.ok(!input.props.disabled);await act(async()=>input.props.onChange({target:{checked:!input.props.checked}}));}
test('series approval reviews selected dates and posters before approving, with exact retry',async()=>{
 const requests=[];let completed=0;const rows=['one','two'].map((eventId,index)=>({eventId,date:`2099-12-0${index+1}`,revision:index+1}));
 const api={load:async(id,_,list)=>list?{reviewOccurrences:rows}:{event:{id,title:id,date:rows.find(row=>row.eventId===id).date,revision:rows.find(row=>row.eventId===id).revision},canApprove:true,form:{fields:[],purpose:'Purpose'},privateDetails:{hasPoster:id==='two',address:'Private venue'}},poster:async()=>({mime:'image/png',base64:'c3ludGhldGlj'}),approveSeries:async request=>{requests.push(structuredClone(request));if(requests.length===1)throw Error('Response unconfirmed');return {events:rows};}};
 let view;await act(async()=>{view=Renderer.create(React.createElement(Panel,{api,event:{id:'one'},onApproved:()=>completed++}));});
 await click(view,'Review series occurrences for approval');await check(view,'Select all awaiting approval');await click(view,'Review selected occurrences (2)');
 const approval=()=>view.root.findAllByType('button').find(node=>text(node).startsWith('Approve selected'));
 assert.equal(approval().props.disabled,true);await click(view,'View submitted poster');await check(view,'I have reviewed the submitted details, venue, form and poster for every selected occurrence.');await click(view,'Approve selected occurrences (2)');
 await click(view,'Retry same approval');assert.equal(completed,1);assert.equal(requests.length,2);assert.deepEqual(requests[0],requests[1]);assert.deepEqual(requests[0].occurrences,rows.map(row=>({eventId:row.eventId,expectedRevision:row.revision})));view.unmount();
});
test('stale selected date blocks the review and approval request',async()=>{
 let called=false;const api={load:async(id,_,list)=>list?{reviewOccurrences:[{eventId:'one',date:'2099-12-01',revision:1}]}:{event:{id,revision:2},canApprove:true},approveSeries:async()=>{called=true;}};
 let view;await act(async()=>{view=Renderer.create(React.createElement(Panel,{api,event:{id:'one'}}));});await click(view,'Review series occurrences for approval');await click(view,'Review selected occurrences (1)');assert.ok(text(view.toJSON()).includes('The series changed'));assert.equal(called,false);view.unmount();
});
