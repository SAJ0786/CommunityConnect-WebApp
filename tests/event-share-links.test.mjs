import test from 'node:test';
import assert from 'node:assert/strict';
import {eventShareLink,parseEventShareLink} from '../src/utils/eventLinks.mjs';
test('individual event links target a card, contain no recipient identity and distinguish collections',()=>{
 for(const registrationOnly of [false,true]){
  const link=eventShareLink({id:'event-123',registrationOnly});
  assert.deepEqual(parseEventShareLink(link),{id:'event-123',registrationOnly});
  assert.ok(!link.includes('recipient=')&&!link.includes('form='));
 }
 assert.equal(eventShareLink({id:'bad/id'}),'');
 for(const link of ['https://evil.test/?event=id','http://communityconnect.siza.info/?event=id','https://communityconnect.siza.info/?event=../id','https://communityconnect.siza.info/?event=a&registration=b','https://communityconnect.siza.info/app?event=id'])assert.equal(parseEventShareLink(link),null);
});
