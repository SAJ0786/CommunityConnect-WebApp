import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { registerAppWorker } from '../src/services/workerRegistration.mjs';

function worker({offline=false,failInstall=false,quota=false}={}) {
  const handlers={}, stores=new Map(), deleted=[], fetched=[], precached=[];
  const key=value=>new URL(typeof value==='string'?value:value.url,'https://preview.test').href;
  const caches={
    async keys(){return [...stores.keys()];},
    async delete(name){deleted.push(name);return stores.delete(name);},
    async open(name){
      if(!stores.has(name))stores.set(name,new Map()); const data=stores.get(name);
      return {async addAll(urls){precached.push(...urls);if(failInstall)throw new Error('network failed');for(const url of urls)data.set(key(url),new Response(url));},
        async match(url){return data.get(key(url))?.clone();},
        async put(url,response){if(quota)throw new Error('quota');data.set(key(url),response.clone());}};
    }
  };
  const context={URL,Response,caches,fetch:async request=>{fetched.push(key(request));if(offline)throw new Error('offline');return new Response('network response');},self:{location:{origin:'https://preview.test'},clients:{claim:async()=>{}},skipWaiting:()=>{},addEventListener:(type,fn)=>{handlers[type]=fn;}}};
  vm.runInNewContext(fs.readFileSync('public/sw.js','utf8').replace('__BUILD_TIME__','300').replace('/* __BUILD_ASSETS__ */ []','["/assets/app-new.js","/assets/app-new.css"]'),context);
  return {caches,deleted,fetched,precached,stores,
    async lifecycle(type){let pending;handlers[type]({waitUntil:value=>{pending=value;}});return pending;},
    async request(path,{accept='text/html',method='GET'}={}){let pending;handlers.fetch({request:{url:new URL(path,'https://preview.test').href,method,headers:new Headers({accept})},respondWith:value=>{pending=value;}});return pending;}
  };
}

test('worker install includes built code and rejects incomplete shell installation',async()=>{
  const w=worker();await w.lifecycle('install');assert.ok(w.precached.includes('/assets/app-new.js'));assert.ok(w.precached.includes('/offline.html'));
  await assert.rejects(worker({failInstall:true}).lifecycle('install'),/network failed/);
});
test('activation retains previous complete app generation and unrelated caches',async()=>{
  const w=worker();await w.lifecycle('install');
  for(const name of ['ce-v100-static','ce-v100-runtime','ce-v200-static','ce-v200-runtime','other-app-cache'])await (await w.caches.open(name)).put('/index.html',new Response(name));
  await w.lifecycle('activate');assert.deepEqual(w.deleted.sort(),['ce-v100-runtime','ce-v100-static']);
  assert.ok(w.stores.has('ce-v200-static'));assert.ok(w.stores.has('other-app-cache'));
});
test('offline public deep link receives app shell and missing static page receives offline page',async()=>{
  const w=worker({offline:true});await w.lifecycle('install');
  assert.equal(await (await w.request('/businesses/view/example?city=sydney')).text(),'/index.html');
  assert.equal(await (await w.request('/install.html')).text(),'/offline.html');
  await (await w.caches.open('ce-v300-static')).put('/install.html',new Response('cached installation guide'));
  assert.equal(await (await w.request('/install.html')).text(),'cached installation guide');
});
test('server-backed action URLs, unknown endpoints, foreign requests and writes bypass cache',async()=>{
  const w=worker();
  for(const url of ['/cal?token=test','/unsubscribe.html?token=test','/report-ai-content.html','/__/auth/handler','/api/private','/sw.js','/firebase-messaging-sw.js','https://remote.test/image'])assert.equal(await w.request(url),undefined,url);
  assert.equal(await w.request('/private-data',{accept:'application/json'}),undefined);
  assert.equal(await w.request('/businesses',{method:'POST'}),undefined);assert.equal(w.fetched.length,0);
});
test('offline current and previous hashed assets remain available without network',async()=>{
  const w=worker({offline:true});await w.lifecycle('install');
  await (await w.caches.open('ce-v200-static')).put('/assets/app-old.js',new Response('old code'));
  assert.equal(await (await w.request('/assets/app-new.js',{accept:'*/*'})).text(),'/assets/app-new.js');
  assert.equal(await (await w.request('/assets/app-old.js',{accept:'*/*'})).text(),'old code');assert.equal(w.fetched.length,0);
});
test('cache quota failure does not replace successful network HTML with stale content',async()=>{
  const w=worker({quota:true});assert.equal(await (await w.request('/')).text(),'network response');
});

async function client({safe=true,controlled=true,storageBlocked=false,href='https://preview.test/businesses/view/example?city=sydney#offers'}={}){
  const events={},windowEvents={},intervals=[],replaced=[],messages=[];let allowed=safe;
  const reg={waiting:{postMessage:value=>messages.push(value)},addEventListener(){},update:async()=>{}};
  const window={location:{href,replace:value=>replaced.push(value)},__communityCanAutoUpdate:()=>allowed,setInterval:fn=>{intervals.push(fn);return intervals.length;},clearInterval(){},addEventListener:(type,fn)=>{windowEvents[type]=fn;},removeEventListener(){}};
  const document={visibilityState:'visible',addEventListener(){},removeEventListener(){}};
  const context={registerAppWorker,URL,Date,console,window,document,navigator:{serviceWorker:{controller:controlled?{}:null,register:async()=>reg,addEventListener:(type,fn)=>{events[type]=fn;}}},sessionStorage:{getItem(){if(storageBlocked)throw new Error('blocked');return null;},setItem(){if(storageBlocked)throw new Error('blocked');}}};
  vm.runInNewContext(fs.readFileSync('src/services/swService.js','utf8').replace(/^import .*workerRegistration.*;\r?\n/m,'').replace('export async function','async function')+'\nthis.start=registerSW;',context);await context.start();
  return {events,intervals,replaced,messages,window,document,setSafe:value=>{allowed=value;}};
}
test('controller update preserves pathname, query and hash and reloads once',async()=>{
  const c=await client();c.events.controllerchange();c.events.controllerchange();assert.equal(c.replaced.length,1);
  const dest=new URL(c.replaced[0],'https://preview.test');assert.equal(dest.pathname,'/businesses/view/example');assert.equal(dest.searchParams.get('city'),'sydney');assert.equal(dest.hash,'#offers');assert.ok(dest.searchParams.has('app-update'));
});
test('another tab activating a worker cannot reload a busy client until safe',async()=>{
  const c=await client({safe:false});assert.equal(c.messages.length,0);c.events.controllerchange();assert.equal(c.replaced.length,0);
  c.setSafe(true);for(const tick of c.intervals)tick();assert.equal(c.replaced.length,1);
});
test('blocked session storage does not break activation or safe reload',async()=>{
  const c=await client({storageBlocked:true});assert.equal(c.messages.length,1);c.events.controllerchange();assert.equal(c.replaced.length,1);
});
test('first installation does not reload and safety-check errors defer updates',async()=>{
  const fresh=await client({controlled:false});fresh.events.controllerchange();assert.equal(fresh.replaced.length,0);
  const busy=await client({safe:false});busy.window.__communityCanAutoUpdate=()=>{throw new Error('unavailable');};busy.events.controllerchange();assert.equal(busy.replaced.length,0);
});

test('Directory guard composes with Events guard and defers reload until both are safe',async()=>{
  const c=await client();let directorySafe=false;
  c.window.__communityDirectoryCanAutoUpdate=()=>directorySafe;
  c.events.controllerchange();assert.equal(c.replaced.length,0);
  directorySafe=true;c.setSafe(false);for(const tick of c.intervals)tick();assert.equal(c.replaced.length,0);
  c.setSafe(true);for(const tick of c.intervals)tick();assert.equal(c.replaced.length,1);
});
test('focused fields and modal dialogs defer automatic reload even without an app guard',async()=>{
  const c=await client();delete c.window.__communityCanAutoUpdate;
  c.document.activeElement={tagName:'TEXTAREA'};c.events.controllerchange();assert.equal(c.replaced.length,0);
  c.document.activeElement=null;c.document.querySelector=()=>({});for(const tick of c.intervals)tick();assert.equal(c.replaced.length,0);
  c.document.querySelector=()=>null;for(const tick of c.intervals)tick();assert.equal(c.replaced.length,1);
});
