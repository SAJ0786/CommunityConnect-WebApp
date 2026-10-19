import test from 'node:test';
import assert from 'node:assert/strict';
import {EVENT_TYPES,parseEventOptions,buildEventTypeGroups} from '../src/utils/eventOptions.mjs';
test('event catalogue includes native built-ins and saved subcategories in their categories',()=>{
 const options=parseEventOptions({eventTypes:[{label:'Art & Creativity',category:'community'},{label:'Badminton Tournament',category:'community'},'Legacy choice',null,{label:'Friday Prayers',category:'other'}]});
 const groups=buildEventTypeGroups(options,'Retired type');
 assert.ok(EVENT_TYPES.includes('Marriage'));assert.ok(EVENT_TYPES.includes('Dua-e-Kumail'));
 assert.ok(groups.find(g=>g.key==='community').eventTypes.includes('Art & Creativity'));
 assert.ok(groups.find(g=>g.key==='community').eventTypes.includes('Badminton Tournament'));
 assert.ok(groups.find(g=>g.key==='faith').eventTypes.includes('Friday Prayers'));
 assert.deepEqual(groups.find(g=>g.key==='other').eventTypes,['Custom','Legacy choice','Retired type']);
 const types=groups.flatMap(g=>g.eventTypes);assert.equal(types.length,new Set(types).size);
});
test('empty or malformed saved catalogue retains all built-ins',()=>{
 for(const input of [{},{eventTypes:null},{eventTypes:[{},false]}])assert.deepEqual(buildEventTypeGroups(parseEventOptions(input)).flatMap(g=>g.eventTypes),EVENT_TYPES);
});
