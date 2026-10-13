'use strict';
const {createMemberOperationGuard}=require('../../../functions/web-member-operation.cjs');
const testUid=value=>/^review-(member|customer|admin|super|inactive)$/.test(value || '');
exports.createReviewGuard=dependencies=>{
  const guard=createMemberOperationGuard(dependencies),{HttpsError}=dependencies;
  return async(name,request)=>{
    if(!testUid(request.auth?.uid)) throw new HttpsError('unauthenticated','Choose an isolated test identity.');
    if(['adminDeleteUser','adminRestoreUser'].includes(name) && !testUid(request.data?.targetUid)) {
      throw new HttpsError('invalid-argument','Choose a synthetic test account.');
    }
    return guard(name,request);
  };
};
