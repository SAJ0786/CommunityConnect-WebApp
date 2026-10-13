const guarded = new Set(['sendBusinessEnquiry','submitSupportRequest','lookupBusinessAbnForSubmission',
  'verifyBusinessAbn','adminDeleteUser','adminRestoreUser','archiveEventRecords','archiveFutureSeriesEvents']);
export function memberCallableRequest(name,payload) {
  return guarded.has(name)
    ? {name:'callWebMemberOperation',payload:{operation:name,payload}}
    : {name,payload};
}
export function callMemberOperation(httpsCallable,functions,name,payload) {
  const request=memberCallableRequest(name,payload);
  return httpsCallable(functions,request.name)(request.payload);
}
