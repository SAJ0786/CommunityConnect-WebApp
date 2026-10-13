'use strict';
// No production configuration, credentials, SMTP transport or background triggers.
const { assertLocalBackend } = require('./isolation.cjs');
assertLocalBackend(process.env);
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue, Timestamp, FieldPath } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
initializeApp({ projectId: 'demo-community-connect-web' });
const db = getFirestore();
const memberRegistration=require('./member-registration.cjs').createMemberRegistrationHandlers({
  db,auth:getAuth(),serverTimestamp:()=>FieldValue.serverTimestamp(),HttpsError,
});
exports.completeMemberRegistration=onCall({region:'australia-southeast1'},async request=>{
  assertLocalBackend(process.env);
  if(!/^review-/.test(request.auth?.uid || '')) throw new HttpsError('unauthenticated','Choose a synthetic account.');
  return memberRegistration.complete(request);
});
// The emulator can wrap the legacy admin.firestore function without its static
// properties. Supply the native handlers' dependency from the modular export.
const admin = { firestore: { FieldValue, Timestamp }, auth: () => getAuth() };
const reviewGuard = require('./review-guards.cjs').createReviewGuard({ db, HttpsError });
const guardedCall = (options, handler) => onCall(options, async request => {
  assertLocalBackend(process.env);
  await reviewGuard('', request);
  return handler(request);
});
const dependencies = { admin, db, FieldPath, onCall: guardedCall, HttpsError, REGION: 'australia-southeast1',
  onDocumentCreated: () => undefined, EMAIL_SECRETS: [],
  buildTransporter: () => { throw new Error('Email delivery is disabled in this rehearsal.'); }, logger: console };
exports.sendBusinessEnquiry = require('./native/enquiry.cjs').register(dependencies);
exports.submitSupportRequest = require('./native/support-workflow.js').register(dependencies).submitSupportRequest;
Object.assign(exports, require('./directory-operations.cjs').register(dependencies));
const reminders = require('./event-reminders.cjs').createReminderHandlers({ db, HttpsError });
for (const [name, handler] of Object.entries({ getEventReminder: reminders.get, setEventReminder: reminders.set, removeEventReminder: reminders.remove })) {
  exports[name] = guardedCall({ region: dependencies.REGION }, handler);
}
// Register handler bodies first, then apply operation-specific candidate guards.
// Discard native secret declarations; no real ABR transport is imported.
const raw = { ...dependencies, onCall: (_, handler) => handler,
  lookupAbrByAbn: require('./abr-fixtures.cjs').lookupAbrFixture };
const additional = { ...require('./native/abn.cjs').register(raw), ...require('./native/lifecycle.cjs').register(raw),
  ...require('./native/event-archive.cjs').register(raw) };
for (const [name, handler] of Object.entries(additional)) {
  exports[name] = guardedCall({ region: dependencies.REGION, timeoutSeconds: 30 }, async request => {
    await reviewGuard(name, request);
    return handler(request);
  });
}
// Same production web guard and handler contract; dispatch remains entirely
// inside this demo project and never calls a deployed endpoint.
const rawHandlers={...additional,
  sendBusinessEnquiry:require('./native/enquiry.cjs').register(raw),
  submitSupportRequest:require('./native/support-workflow.js').register(raw).submitSupportRequest,
};
const {createWebMemberOperation}=require('../../../functions/web-member-operation.cjs');
exports.callWebMemberOperation=onCall({region:dependencies.REGION,timeoutSeconds:60},createWebMemberOperation({db,HttpsError,
  delegate:async(name,payload,request)=>{
    assertLocalBackend(process.env);
    const forwarded={...request,data:payload};
    await reviewGuard(name,forwarded);
    return rawHandlers[name](forwarded);
  },
}));
