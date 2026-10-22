import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import path from 'node:path';
import {build} from 'esbuild';
import React from 'react';
import Renderer,{act} from 'react-test-renderer';
const require=createRequire(import.meta.url),outfile=path.join(process.cwd(),'.qa-business-transfer.cjs');
await build({entryPoints:['src/business/AdminScreens.jsx'],outfile,bundle:true,platform:'node',format:'cjs',plugins:[{name:'react-fixture',setup(builder){builder.onResolve({filter:/^react$/},()=>({path:require.resolve('react'),external:true}));}}]});
const {Reviews}=require(outfile),text=node=>typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):(node?.children||[]).map(text).join('');
const business={id:'shop',name:'Test Shop',ownerId:'old',status:'approved',location:{city:'sydney'},contact:{}};
const members=[{id:'old',fullName:'Previous Owner',phone:'0400000000',defaultCity:'sydney'},{id:'new',fullName:'Asim Raza',phone:'0496504950',defaultCity:'sydney',role:'superAdmin',migratedToUid:'new'},
 {id:'inactive',fullName:'Asim Inactive',isActive:false,defaultCity:'sydney'},{id:'other',fullName:'Asim Melbourne',defaultCity:'melbourne'}];
const props={businesses:[business],promotions:[],profile:{role:'admin',defaultCity:'sydney'},members,management:true};
async function click(view,label){const button=view.root.findAllByType('button').find(node=>text(node)===label);assert.ok(button,label);assert.ok(!button.props.disabled,label);await act(async()=>button.props.onClick());}
test('business management reuses member autocomplete and requires explicit transfer confirmation',async()=>{
 const calls=[];let view;await act(async()=>{view=Renderer.create(React.createElement(Reviews,{...props,onAction:async(...args)=>calls.push(args)}));});
 await click(view,'Transfer ownership');
 const search=view.root.findAllByType('input').find(node=>node.props.type==='search');assert.ok(search);await act(async()=>search.props.onChange({target:{value:'Asim'}}));
 assert.ok(text(view.toJSON()).includes('0496504950'));assert.equal(text(view.toJSON()).includes('Asim Inactive'),false);assert.equal(text(view.toJSON()).includes('Asim Melbourne'),false);
 const candidate=view.root.findAllByType('button').find(node=>text(node).startsWith('Asim Raza'));await act(async()=>candidate.props.onClick());
 await click(view,'Transfer to selected member');assert.equal(calls.length,0);await click(view,'Confirm transfer');
 assert.deepEqual(calls,[['business.transfer',{id:'shop',toUid:'new',expectedOwnerId:'old',confirmation:'TRANSFER BUSINESS'}]]);view.unmount();
});
test('approval-only and historical business views do not offer transfer',async()=>{
 for(const extra of [{management:false},{businesses:[{...business,status:'archived'}]},{businesses:[{...business,status:'deleted'}]}]){
  let view;await act(async()=>{view=Renderer.create(React.createElement(Reviews,{...props,...extra,onAction:async()=>{throw Error('No transfer');}}));});
  assert.equal(view.root.findAllByType('button').some(node=>text(node)==='Transfer ownership'),false);view.unmount();
 }
});
