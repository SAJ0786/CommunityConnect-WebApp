import test from 'node:test';
import assert from 'node:assert/strict';
import { categoryAddition, supportPayload, scopedOperations, moderationOptions, diagnosticSummary } from '../src/business/operationsModel.mjs';
import { emptyListing, listingSubmission } from '../src/business/workspaceModel.mjs';
import { freshData, applyDemoAction } from './workspace-preview/model.mjs';
const member={uid:'review-member',role:'user',defaultCity:'sydney'};
const admin={...member,role:'admin',adminCity:'sydney'};
const superAdmin={...member,role:'superAdmin'};
const submit={senderName:'Example Member',senderEmail:'member@example.test',category:'Incorrect information',message:'Please review the published hours.',businessId:'example',requestId:'support_test-reference-1234'};
const decide=(data,id,decision,profile=admin)=>applyDemoAction(data,'moderation.decide',{id,decision,reason:'Reviewed the supplied information carefully.'},profile).next;

test('category additions normalise names and reject punctuation-equivalent duplicates',()=>{
  const row=categoryAddition([],{label:'  Arts   & Crafts  '});
  assert.equal(row.label,'Arts & Crafts'); assert.equal(row.id,'arts-and-crafts');
  assert.throws(()=>categoryAddition([row],{label:'Arts and Crafts'}),/already exists/);
  for(const label of ['a','!@#','x'.repeat(61)]) assert.throws(()=>categoryAddition([],{label}));
  assert.throws(()=>categoryAddition([row],{label:'Painting',categoryId:'missing'},true),/parent/);
});
test('added categories and services are submitted with their labels by listing forms',()=>{
  let data=applyDemoAction(freshData(),'category.add',{label:'Arts & Crafts'},admin).next;
  data=applyDemoAction(data,'category.addService',{label:'Pottery',categoryId:'arts-and-crafts'},admin).next;
  const result=listingSubmission({...emptyListing(),categoryIds:['arts-and-crafts'],subcategoryIds:['pottery']},data.categories);
  assert.deepEqual(result.categories,['Arts & Crafts']); assert.deepEqual(result.subcategories,['Pottery']);
  assert.throws(()=>applyDemoAction(data,'category.addService',{label:'POTTERY',categoryId:'arts-and-crafts'},admin),/already exists/);
  assert.throws(()=>applyDemoAction(data,'category.add',{label:'Another category'},member),/Administrator/);
});
test('support payloads validate and discard caller-supplied routing and authority fields',()=>{
  const payload=supportPayload({...submit,city:'melbourne',role:'superAdmin',kind:'app-feedback'}, {id:'example'});
  assert.equal(payload.kind,'business-report'); assert.equal('city' in payload,false); assert.equal('role' in payload,false);
  for(const field of [{message:'short'},{senderEmail:'bad'},{senderName:''},{category:'made up'},{message:'x'.repeat(2501)}]) assert.throws(()=>supportPayload({...submit,...field},{id:'example'}));
});
test('support retry is idempotent and derives the business city from supplied public data',()=>{
  const first=applyDemoAction(freshData(),'support.submit',{...submit,city:'melbourne'},member);
  const retry=applyDemoAction(first.next,'support.submit',submit,member);
  assert.equal(retry.next.supportRequests.length,first.next.supportRequests.length);
  assert.equal(retry.next.moderationCases.length,first.next.moderationCases.length);
  assert.equal(retry.next.supportRequests[0].city,'sydney');
  assert.match(retry.result.receiptMessage,/No email was sent/);
  assert.throws(()=>applyDemoAction(retry.next,'support.submit',{...submit,message:'Different report with same reference.'},member),/different request/);
  assert.throws(()=>applyDemoAction(freshData(),'support.submit',{...submit,businessId:'missing'},member),/not available/);
});
test('staff scopes exclude other cities, unassigned records and non-administrators',()=>{
  const data=freshData();
  assert.equal(scopedOperations(data.supportRequests,admin).length,1);
  assert.equal(scopedOperations(data.supportRequests,superAdmin).length,3);
  assert.deepEqual(scopedOperations(data.moderationCases,member),[]);
  assert.throws(()=>decide(data,'case-melbourne','closed'),/scope/);
  assert.throws(()=>decide(data,'case-business','closed',member),/scope/);
});
test('diagnostic projection excludes private fields and scopes counts',()=>{
  const data=freshData(), summary=diagnosticSummary(data,admin,'ready');
  const json=JSON.stringify(summary);
  for(const value of ['@example.test','Please review','10 Example Street','0400000000','senderName','referrer']) assert.equal(json.includes(value),false);
  assert.equal(summary.counts.listings,5); assert.equal(summary.counts.supportRecords,1); assert.equal(summary.counts.moderationCases,3);
});
test('moderation cannot apply destructive decisions to missing or already archived targets',()=>{
  const data=freshData();
  assert.deepEqual(moderationOptions({businessId:'missing',reportedThreadId:'thread'},data.businesses,data.threads),['under-review','dismissed','closed']);
  assert.equal(moderationOptions(data.moderationCases[2],data.businesses,data.threads).includes('takedown'),false);
  assert.throws(()=>decide(data,'case-business','conversation-blocked'),/unavailable/);
  assert.throws(()=>applyDemoAction(data,'moderation.decide',{id:'case-business',decision:'closed',reason:'short'},admin),/reason/);
});
test('takedown withdraws public listing and promotions while retaining history and owner notice',()=>{
  const data=decide(freshData(),'case-business','takedown');
  assert.equal(data.publicBusinesses.some(row=>row.id==='example'),false);
  assert.equal(data.publicPromotions.some(row=>row.businessId==='example'),false);
  assert.ok(data.promotions.every(row=>row.businessId!=='example'||row.status==='archived'));
  assert.equal(data.moderationCases[0].history.length,1);
  assert.equal(data.notifications[0].businessId,'example');
  const appealed=applyDemoAction(data,'notification.appeal',{id:data.notifications[0].id,reason:'Please review the corrected listing information.'},member).next;
  assert.equal(appealed.moderationCases[0].category,'business-appeal');
  const reviewed=decide(appealed,appealed.moderationCases[0].id,'closed');
  assert.equal(reviewed.businesses[0].status,'archived');
  assert.equal(reviewed.publicBusinesses.some(row=>row.id==='example'),false);
});
test('administrator conversation blocks survive member unblock actions and deny replies',()=>{
  let data=decide(freshData(),'case-conversation','conversation-blocked');
  data=applyDemoAction(data,'thread.block',{id:'thread',blocked:false},member).next;
  assert.throws(()=>applyDemoAction(data,'thread.reply',{id:'thread',text:'A reply'},member),/blocked/);
  assert.equal(data.moderationCases[1].history.length,2);
});

test('connected moderation choices preserve verified block/unblock options and reject unknown actions',()=>{
  assert.deepEqual(moderationOptions({availableDecisions:['under-review','conversation-blocked','conversation-unblocked','made-up']},[],[]),
    ['under-review','conversation-blocked','conversation-unblocked']);
});
