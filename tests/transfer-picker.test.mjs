import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { buildSync } from 'esbuild';

const code=buildSync({entryPoints:[fileURLToPath(new URL('../src/components/UserTransferPicker.jsx',import.meta.url))],bundle:true,platform:'node',format:'cjs',write:false,external:['react']}).outputFiles[0].text;
const flatten=node=>Array.isArray(node)?node.flatMap(flatten):node?.props?[node,...flatten(node.props.children)]:[];
function fixture(users){
 let query='',value='';const react={createElement:(type,props,...children)=>({type,props:{...props,children}}),useState:()=>[query,next=>{query=next;}],useEffect:()=>{}};
 const module={exports:{}};vm.runInNewContext(code,{module,exports:module.exports,require:name=>{assert.equal(name,'react');return react;}});
 const render=()=>flatten(module.exports.default({users,value,onChange:next=>{value=next;}}));
 return {render,type:text=>render().find(n=>n.type==='input').props.onChange({target:{value:text}}),selected:()=>value};
}
test('transfer autocomplete searches one field by name, email and formatted Australian phone',()=>{
 const f=fixture([{id:'one',fullName:'Amina Example',email:'contact@example.com',phone:'+61 496 504 950'},{id:'two',fullName:'Another Member',email:'other@example.org'}]);
 assert.equal(f.render().filter(n=>n.type==='button').length,0);
 for(const query of ['amina','CONTACT@','0496 504 950','+61 496504950']){
  f.type(query);const result=f.render().filter(n=>n.type==='button');assert.equal(result.length,1,query);assert.match(JSON.stringify(result),/Amina Example/);
 }
 f.render().find(n=>n.type==='button').props.onClick();assert.equal(f.selected(),'one');
 f.type('Another');assert.equal(f.selected(),'');assert.match(JSON.stringify(f.render()),/Another Member/);
});
test('transfer autocomplete limits suggestions and explains empty/large results',()=>{
 const f=fixture(Array.from({length:50},(_,i)=>({id:String(i),fullName:'Member '+i})));
 f.type('Member');assert.equal(f.render().filter(n=>n.type==='button').length,8);assert.match(JSON.stringify(f.render()),/Keep typing/);
 f.type('missing');assert.equal(f.render().filter(n=>n.type==='button').length,0);assert.match(JSON.stringify(f.render()),/No matching active members/);
});
