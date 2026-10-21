import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import path from 'node:path';import {build} from 'esbuild';import React from 'react';import Renderer,{act} from 'react-test-renderer';
const require=createRequire(import.meta.url),outfile=path.join(process.cwd(),'.qa-hidden-moderation.cjs');
await build({entryPoints:['src/registration/RegistrationEventPanel.jsx'],outfile,bundle:true,platform:'node',format:'cjs',loader:{'.css':'empty'},plugins:[{name:'moderation-fixture',setup(b){
 b.onResolve({filter:/^react$/},()=>({path:require.resolve('react'),external:true}));
 b.onResolve({filter:/EventCard$/},()=>({path:'card',namespace:'fixture'}));
 b.onResolve({filter:/RegistrationContext$/},()=>({path:'context',namespace:'fixture'}));
 b.onResolve({filter:/CitySelector$/},()=>({path:'city',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='context'?'export const useRegistration=()=>globalThis.__moderation;export const useRegistrationFeed=()=>({events:globalThis.__moderationRows,loading:false,error:""});':args.path==='card'?'export default ()=>{throw Error("Hidden entries must not mount EventCard");};':'export default ()=>null;'}));
}}]});
const Panel=require(outfile).default;
test('hidden non-owned admin entry offers deletion without mounting a full card',async()=>{
 const calls=[];let refreshes=0;globalThis.window={confirm:()=>true};globalThis.document={hidden:false,addEventListener(){},removeEventListener(){}};
 globalThis.__moderationRows=[{id:'hidden',title:'Hidden event',date:'2099-12-01',revision:4,hidden:true,moderationOnly:true,canDelete:true,canManage:false}];
 globalThis.__moderation={api:{deleteEvent:async(...args)=>calls.push(args),load:async()=>{throw Error('No hidden form access');}},refresh:()=>refreshes++};
 let view;await act(async()=>{view=Renderer.create(React.createElement(Panel,{scope:'management',city:'sydney',user:{uid:'admin'},profile:{role:'superAdmin'}}));});
 const buttons=view.root.findAllByType('button');assert.equal(buttons.length,2);
 const button=buttons.find(node=>node.props.children==='Delete event');assert.ok(button);
 await act(async()=>button.props.onClick());assert.deepEqual(calls,[['hidden',4]]);assert.equal(refreshes,1);
 await act(async()=>view.unmount());
});
