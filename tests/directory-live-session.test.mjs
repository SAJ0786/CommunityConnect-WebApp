import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveDirectorySession} from '../src/services/directory/liveSession.mjs';
import {recordingFirestore} from './firebase-integration/recordingFirestore.mjs';
import {identities,seedRecords} from './firebase-integration/fixtures.mjs';
function setup(changes={}) {
  const transport=recordingFirestore(seedRecords()), auth={currentUser:identities.admin},calls=[];
  const options={auth,db:{},bucket:{},functions:{},sdk:transport.sdk,storageSdk:{},profile:seedRecords()['users/review-admin'],
    enabled:true,readOnly:false,projectId:'community-event-8b639',storage:null,
    httpsCallable:(_,name)=>async payload=>{calls.push({name,payload});return {data:{supportRequests:[],moderationCases:[],nextCursor:null}};},...changes};
  return {transport,auth,calls,options,create:()=>createLiveDirectorySession(options)};
}
test('live directory requires an explicit release flag, expected project and active member',()=>{
  for(const changes of [{enabled:false},{readOnly:true},{projectId:'other-project'},{profile:{isActive:false}},
    {auth:{currentUser:{uid:'guest',isAnonymous:true}}}]) assert.throws(()=>setup(changes).create());
});
test('live directory reuses the verified gateway and sends real callable contracts without mock identities',async()=>{
  const state=setup(),gateway=state.create();
  await gateway.loadOperations({view:'moderation'});
  assert.deepEqual(state.calls,[{name:'listDirectoryOperations',payload:{view:'moderation',cursor:'',id:'',pageSize:20}}]);
  gateway.close();
  await assert.rejects(gateway.loadOperations({view:'moderation'}),/account changed/);
});
test('live directory invalidates pending actions when the signed-in identity changes',async()=>{
  const state=setup(),gateway=state.create();
  state.auth.currentUser=identities.member;
  await assert.rejects(gateway.loadOperations({view:'moderation'}),/account changed/);
  assert.equal(state.calls.length,0);
});
