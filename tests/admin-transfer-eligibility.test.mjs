import test from 'node:test';
import assert from 'node:assert/strict';
import {isTransferMemberEligible,userMatchesSearch} from '../src/utils/adminUserSearch.mjs';

test('active self-migration profiles remain eligible regardless of Super Admin status',()=>{
 for(const user of [{id:'iram',fullName:'Iram Rizvi',migratedToUid:'iram',role:'superAdmin'},{id:'sajjad',fullName:'Sajjad Zaheer',migratedToUid:'sajjad',role:'superAdmin'}]){
   assert.equal(isTransferMemberEligible({...user,isActive:true}),true);assert.equal(userMatchesSearch(user,user.fullName),true);
   assert.equal(isTransferMemberEligible({...user,isActive:false}),false);
   assert.equal(isTransferMemberEligible({...user,migratedToUid:'different-account'}),false);
   assert.equal(isTransferMemberEligible({...user,accountStatus:'banned'}),false);
 }
});
