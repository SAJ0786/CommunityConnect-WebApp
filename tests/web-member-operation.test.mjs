import test from 'node:test';
import assert from 'node:assert/strict';
import {createMemberOperationGuard,createWebMemberOperation,createProductionDelegate} from '../functions/web-member-operation.cjs';
import {callMemberOperation} from '../src/services/memberCallable.mjs';
class HttpsError extends Error { constructor(code,message) {super(message);this.code=code;} }
const auth={uid:'real-member',token:{firebase:{sign_in_provider:'phone'}}};
function setup(profile={role:'admin',adminCity:'sydney'},business={status:'approved',location:{city:'sydney'}}) {
  const db={collection:name=>({doc:()=>({get:async()=>({exists:true,data:()=>name==='users'?profile:business})})})};
  return {db,HttpsError};
}
test('web operation guard rejects anonymous and inactive callers before delegation',async()=>{
  for(const profile of [undefined,{isActive:false},{active:false},{accountStatus:'banned'},{accountStatus:'deleted'},{accountStatus:'archived'}]) {
    const options=setup(profile===undefined?null:profile);
    const handler=createWebMemberOperation({...options,delegate:()=>assert.fail('Must not delegate')});
    await assert.rejects(handler({auth,data:{operation:'sendBusinessEnquiry',payload:{}}}),{code:'permission-denied'});
  }
  await assert.rejects(createMemberOperationGuard(setup())('sendBusinessEnquiry',{auth:{...auth,token:{firebase:{sign_in_provider:'anonymous'}}}}),{code:'unauthenticated'});
});
test('web operation guard enforces ABN city/status and safe event/account selections',async()=>{
  const request=data=>({auth,data});
  await assert.rejects(createMemberOperationGuard(setup(undefined,{status:'approved',location:{city:'melbourne'}}))('verifyBusinessAbn',request({businessId:'business'})),{code:'permission-denied'});
  await assert.rejects(createMemberOperationGuard(setup(undefined,{status:'archived',location:{city:'sydney'}}))('verifyBusinessAbn',request({businessId:'business'})),{code:'failed-precondition'});
  const guard=createMemberOperationGuard(setup());
  await guard('verifyBusinessAbn',request({businessId:'business'}));
  await guard('archiveFutureSeriesEvents',request({seriesId:'series',expectedIds:['one','two']}));
  for(const [name,data] of [['archiveEventRecords',{eventId:'one',seriesId:'series'}],['archiveFutureSeriesEvents',{seriesId:'series',expectedIds:['one','one']}],['adminDeleteUser',{targetUid:'nested/id'}]]) {
    await assert.rejects(guard(name,request(data)),{code:'invalid-argument'});
  }
  await assert.rejects(createMemberOperationGuard(setup({role:'user'}))('archiveFutureSeriesEvents',request({seriesId:'series',expectedIds:['one']})),{code:'permission-denied'});
});
test('production delegate pins destination and forwards only the verified caller token without retries',async()=>{
  const calls=[],delegate=createProductionDelegate({HttpsError,fetchImpl:async(...args)=>{calls.push(args);return {ok:true,json:async()=>({result:{archived:1}})};}});
  const request={rawRequest:{headers:{authorization:'Bearer original-caller-token','x-arbitrary':'ignored'}}};
  assert.deepEqual(await delegate('archiveEventRecords',{eventId:'event'},request),{archived:1});
  assert.equal(calls[0][0],'https://australia-southeast1-community-event-8b639.cloudfunctions.net/archiveEventRecords');
  assert.deepEqual(calls[0][1].headers,{'Content-Type':'application/json',Authorization:'Bearer original-caller-token'});
  assert.equal(calls[0][1].redirect,'error');
  assert.deepEqual(JSON.parse(calls[0][1].body),{data:{eventId:'event'}});
  await assert.rejects(delegate('https://other.example',{},request),{code:'invalid-argument'});
  await assert.rejects(delegate('archiveEventRecords',{},{}),{code:'unauthenticated'});
  assert.equal(calls.length,1);
  let failures=0;
  const failing=createProductionDelegate({HttpsError,fetchImpl:async()=>{failures++;throw new Error('Connection lost');}});
  await assert.rejects(failing('archiveEventRecords',{},request),/could not be confirmed/);
  assert.equal(failures,1);
});
test('web operation preserves backend errors and blocks arbitrary operations',async()=>{
  const handler=createWebMemberOperation({...setup(),delegate:()=>assert.fail('Must not delegate')});
  await assert.rejects(handler({auth,data:{operation:'deleteUserData',payload:{}}}),{code:'invalid-argument'});
  const delegate=createProductionDelegate({HttpsError,fetchImpl:async()=>({ok:false,json:async()=>({error:{status:'FAILED_PRECONDITION',message:'End the live stream first.'}})})});
  await assert.rejects(delegate('archiveEventRecords',{}, {rawRequest:{headers:{authorization:'Bearer token'}}}),{code:'failed-precondition',message:'End the live stream first.'});
});
test('web client routes legacy member operations through the guard and new callables directly',async()=>{
  const calls=[],callable=(_,name)=>async payload=>{calls.push({name,payload});return {data:{ok:true}};};
  await callMemberOperation(callable,{},'sendBusinessEnquiry',{businessId:'example',text:'Hello'});
  await callMemberOperation(callable,{},'listDirectoryOperations',{view:'moderation'});
  assert.deepEqual(calls,[{name:'callWebMemberOperation',payload:{operation:'sendBusinessEnquiry',payload:{businessId:'example',text:'Hello'}}},
    {name:'listDirectoryOperations',payload:{view:'moderation'}}]);
});
