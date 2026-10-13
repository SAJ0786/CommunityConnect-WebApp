import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {guardSdk,blockedExports,notificationPreviewModule} from '../tools/readonly-preview-policy.mjs';

test('read-only preview blocks every configured data, file and account mutation before reaching Firebase',()=>{
  for(const kind of ['firestore','storage','auth']){
    let calls=0;const sdk=Object.fromEntries(blockedExports[kind].map(name=>[name,()=>{calls++;}]));
    const guarded=guardSdk(sdk,kind);
    for(const name of blockedExports[kind])assert.throws(()=>guarded[name]({}),{code:'preview/read-only'},`${kind}.${name}`);
    assert.equal(calls,0);
  }
});
test('preview forwards ordinary reads and existing-account sign-in but forces tab-session persistence',()=>{
  const calls=[];const sdk={getDoc:()=>42,signInWithPhoneNumber:(...args)=>args,browserSessionPersistence:'session',setPersistence:(...args)=>calls.push(args)};
  assert.equal(guardSdk(sdk,'firestore').getDoc(),42);
  const auth=guardSdk(sdk,'auth');assert.deepEqual(auth.signInWithPhoneNumber('existing-account'),['existing-account']);
  auth.setPersistence('auth-instance','local');assert.deepEqual(calls,[['auth-instance','session']]);
});
test('all callable functions except the audited public reader are blocked',async()=>{
  const calls=[];const guarded=guardSdk({httpsCallable:(_,name)=>async()=>{calls.push(name);return {data:{events:[]}};}},'functions');
  for(const name of ['completeMemberRegistration','deleteUserData','sendRemindersNow','updateUserContactProfile','unknown','https://remote.test'])await assert.rejects(guarded.httpsCallable({},name)({}),{code:'preview/read-only'});
  assert.throws(()=>guarded.httpsCallableFromURL({},'https://remote.test'),{code:'preview/read-only'});
  assert.deepEqual(calls,[]);await guarded.httpsCallable({},'getPublicEvents')();assert.deepEqual(calls,['getPublicEvents']);
});
test('preview messaging cannot register a push token',async()=>{
  let called=false;const guarded=guardSdk({getToken:()=>{called=true;}},'messaging');
  assert.equal(await guarded.isSupported(),false);assert.throws(()=>guarded.getToken(),{code:'preview/read-only'});guarded.onMessage()();assert.equal(called,false);
});

test('generated notification adapter preserves the Promise contract used after sign-in',async()=>{
  const source=fs.readFileSync(new URL('../src/services/notificationService.js',import.meta.url),'utf8');
  const adapter=await import('data:text/javascript;base64,'+Buffer.from(notificationPreviewModule(source)).toString('base64'));
  for(const match of source.matchAll(/export\s+async\s+function\s+(\w+)/g)) {
    const pending=adapter[match[1]]();
    assert.equal(typeof pending.catch,'function',match[1]);
    assert.equal(await pending.catch(()=>assert.fail('adapter should not reject')),null);
  }
  // This is the call made by App's signed-in notification effect.
  await adapter.startForegroundPushNotifications().catch(()=>{});
  assert.deepEqual(adapter.getNotificationPermissionState(),{supported:false,permission:'unsupported',native:false});
});
