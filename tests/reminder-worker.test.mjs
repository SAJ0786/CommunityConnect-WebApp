import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
async function worker() {
  const source=await fs.readFile(new URL('../public/firebase-messaging-sw.js',import.meta.url),'utf8');
  const listeners=[],shown=[],opened=[];
  let receive;
  vm.runInNewContext(source,{
    URL,encodeURIComponent,importScripts(){},
    firebase:{initializeApp(){},messaging:()=>({onBackgroundMessage:handler=>{receive=handler;}})},
    self:{location:{origin:'https://communityconnect.siza.info'},
      addEventListener:(name,handler)=>listeners.push([name,handler]),
      registration:{showNotification:async(...args)=>shown.push(args)}},
    clients:{matchAll:async()=>[],openWindow:async url=>opened.push(url)},
  });
  return {listeners,shown,opened,receive};
}
test('background reminder renders exactly once with its tag and event data',async()=>{
  const context=await worker();
  await context.receive({data:{type:'event-reminder',title:'Event reminder',body:'Example event',eventId:'abc',tag:'revision-1'}});
  assert.equal(context.shown.length,1);
  assert.equal(context.shown[0][1].tag,'revision-1');
  assert.equal(context.shown[0][1].data.eventId,'abc');
  await context.receive({notification:{title:'Automatic Firebase display'},data:{}});
  assert.equal(context.shown.length,1,'Automatic notification payloads must not be displayed a second time.');
});
test('reminder click opens only the local event route and cannot follow an injected external URL',async()=>{
  const context=await worker(),tasks=[];
  let stopped=false,closed=false;
  const event={notification:{data:{type:'event-reminder',eventId:'event/a & b',url:'https://evil.example'},close(){closed=true;}},
    stopImmediatePropagation(){stopped=true;},waitUntil:task=>tasks.push(task)};
  for(const [,handler] of context.listeners) { handler(event); if(stopped)break; }
  await Promise.all(tasks);
  assert.equal(closed,true);
  assert.deepEqual(context.opened,['https://communityconnect.siza.info/?event=event%2Fa%20%26%20b']);
});
