'use strict';
const OPERATIONS = Object.freeze(['sendBusinessEnquiry','submitSupportRequest','lookupBusinessAbnForSubmission',
  'verifyBusinessAbn','adminDeleteUser','adminRestoreUser','archiveEventRecords','archiveFutureSeriesEvents']);
const validId = value => typeof value === 'string' && value.length > 0 && value.length <= 1500
  && value === value.trim() && !value.includes('/') && !['.', '..'].includes(value);

// These web checks supplement the deployed handlers' own ownership checks.
// Native endpoint contracts remain unchanged while older app builds are in use.
function createMemberOperationGuard({db,HttpsError}) {
  return async (name,request) => {
    if (!request.auth?.uid || request.auth.token?.firebase?.sign_in_provider === 'anonymous') {
      throw new HttpsError('unauthenticated','Sign in to continue.');
    }
    const profile=(await db.collection('users').doc(request.auth.uid).get()).data();
    if (!profile || profile.isActive===false || profile.active===false
      || ['archived','banned','deleted'].includes(profile.accountStatus)) {
      throw new HttpsError('permission-denied','An active account is required.');
    }
    const data=request.data || {};
    if (name==='archiveEventRecords' && (!validId(data.eventId) || Object.hasOwn(data,'seriesId'))) {
      throw new HttpsError('invalid-argument','Select one event; use Delete Series for future occurrences.');
    }
    if (name==='archiveFutureSeriesEvents') {
      if (!['admin','superAdmin'].includes(profile.role)) throw new HttpsError('permission-denied','An administrator account is required to manage a series.');
      if (!validId(data.seriesId) || !Array.isArray(data.expectedIds) || !data.expectedIds.length
        || data.expectedIds.length>500 || data.expectedIds.some(id=>!validId(id))
        || new Set(data.expectedIds).size!==data.expectedIds.length) {
        throw new HttpsError('invalid-argument','Refresh the future occurrence selection.');
      }
    }
    if (['adminDeleteUser','adminRestoreUser'].includes(name) && !validId(data.targetUid)) {
      throw new HttpsError('invalid-argument','Choose a valid account.');
    }
    if (name==='verifyBusinessAbn') {
      if (!['admin','superAdmin'].includes(profile.role)) throw new HttpsError('permission-denied','Business administrator access is required.');
      if (!validId(data.businessId) || data.businessId.length>160) throw new HttpsError('invalid-argument','A valid business reference is required.');
      const snapshot=await db.collection('businesses').doc(data.businessId).get();
      if (!snapshot.exists) throw new HttpsError('not-found','Business not found.');
      const business=snapshot.data(),city=value=>String(value || '').trim().toLowerCase();
      if (profile.role!=='superAdmin' && (!city(profile.adminCity || profile.defaultCity)
        || city(profile.adminCity || profile.defaultCity)!==city(business.location?.city))) {
        throw new HttpsError('permission-denied','This listing belongs to another city.');
      }
      if (['archived','deleted'].includes(business.status)) throw new HttpsError('failed-precondition','Restore this listing before verifying its ABN.');
    }
  };
}

function createWebMemberOperation({db,HttpsError,delegate}) {
  const guard=createMemberOperationGuard({db,HttpsError});
  return async request => {
    const {operation,payload}=request.data || {};
    if (!OPERATIONS.includes(operation)) throw new HttpsError('invalid-argument','Unsupported web operation.');
    if (!payload || typeof payload!=='object' || Array.isArray(payload)) throw new HttpsError('invalid-argument','Invalid operation details.');
    await guard(operation,{...request,data:payload});
    return delegate(operation,payload,request);
  };
}

function createProductionDelegate({HttpsError,fetchImpl=globalThis.fetch}) {
  return async (operation,payload,request) => {
    if (!OPERATIONS.includes(operation)) throw new HttpsError('invalid-argument','Unsupported web operation.');
    // Forward only the original, already verified caller token. Never use an
    // Admin credential or accept a destination/token supplied in the payload.
    const authorization=request.rawRequest?.headers?.authorization;
    if (typeof authorization!=='string' || !/^Bearer [^\s]+$/i.test(authorization)) {
      throw new HttpsError('unauthenticated','Your sign-in could not be confirmed.');
    }
    let response,body;
    try {
      response=await fetchImpl(`https://australia-southeast1-community-event-8b639.cloudfunctions.net/${operation}`,{
        method:'POST',headers:{'Content-Type':'application/json',Authorization:authorization},
        redirect:'error',signal:AbortSignal.timeout(45000),body:JSON.stringify({data:payload}),
      });
      body=await response.json();
    } catch {
      throw new HttpsError('unavailable','The operation could not be confirmed. Refresh the saved record before retrying.');
    }
    if(body?.error) {
      const code=String(body.error.status || '').toLowerCase().replaceAll('_','-');
      const allowed=['cancelled','unknown','invalid-argument','deadline-exceeded','not-found','already-exists',
        'permission-denied','resource-exhausted','failed-precondition','aborted','out-of-range','unimplemented','internal','unavailable','data-loss','unauthenticated'];
      throw new HttpsError(allowed.includes(code)?code:'internal',String(body.error.message || 'The operation failed.').slice(0,1000));
    }
    if(!response.ok || !body || (!Object.hasOwn(body,'result') && !Object.hasOwn(body,'data'))) {
      throw new HttpsError('unavailable','The operation could not be confirmed. Refresh the saved record before retrying.');
    }
    return Object.hasOwn(body,'result')?body.result:body.data;
  };
}
module.exports={OPERATIONS,createMemberOperationGuard,createWebMemberOperation,createProductionDelegate};
