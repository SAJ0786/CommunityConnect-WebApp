// Packages only new web/member callables; does not deploy or change existing functions.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root=process.cwd(), destination=path.join(root,'.qa-web-release/functions');
const sources={
  'directory-operations.cjs':'tests/firebase-integration/functions/directory-operations.cjs',
  'legacy-appeals.cjs':'tests/firebase-integration/functions/legacy-appeals.cjs',
  'web-event-reminders.cjs':'functions/web-event-reminders.cjs',
  'web-event-reminder-schedule.cjs':'functions/web-event-reminder-schedule.cjs',
  'memberRegistration.cjs':'functions/member-registration.cjs',
  'web-member-operation.cjs':'functions/web-member-operation.cjs',
};
await fs.mkdir(destination,{recursive:true});
const files=[];
for(const [name,source] of Object.entries(sources)) {
  const content=await fs.readFile(path.resolve(root,source));
  await fs.writeFile(path.join(destination,name),content);
  files.push({name,source,sha256:createHash('sha256').update(content).digest('hex')});
}
const index=`'use strict';
const {initializeApp}=require('firebase-admin/app');
const {getFirestore,FieldValue,FieldPath,Timestamp}=require('firebase-admin/firestore');
const {getAuth}=require('firebase-admin/auth');
const {getMessaging}=require('firebase-admin/messaging');
const {onCall,HttpsError}=require('firebase-functions/v2/https');
const {onDocumentCreated}=require('firebase-functions/v2/firestore');
const {onSchedule}=require('firebase-functions/v2/scheduler');
initializeApp();
const db=getFirestore(), REGION='australia-southeast1';
const admin={firestore:{FieldValue,Timestamp}};
Object.assign(exports,require('./directory-operations.cjs').register({db,admin,FieldPath,HttpsError,onCall,REGION}));
const webOperations=require('./web-member-operation.cjs');
exports.callWebMemberOperation=onCall({region:REGION,timeoutSeconds:60},webOperations.createWebMemberOperation({
  db,HttpsError,delegate:webOperations.createProductionDelegate({HttpsError}),
}));
const registration=require('./memberRegistration.cjs').createMemberRegistrationHandlers({
  db,auth:getAuth(),serverTimestamp:()=>FieldValue.serverTimestamp(),HttpsError,
});
exports.completeMemberRegistration=onCall({region:REGION},registration.complete);
exports.recordMemberRegistrationDate=onDocumentCreated({region:REGION,document:'users/{uid}',retry:true},registration.recordCreated);
Object.assign(exports,require('./web-event-reminder-schedule.cjs').register({
  db,FieldPath,HttpsError,onCall,onSchedule,messaging:getMessaging(),enabled:true,
}));
`;
await fs.writeFile(path.join(destination,'index.cjs'),index);
await fs.writeFile(path.join(destination,'package.json'),JSON.stringify({
  name:'community-connect-web-workflows',private:true,main:'index.cjs',engines:{node:'22'},
  dependencies:{'firebase-admin':'13.10.0','firebase-functions':'7.3.2'},
},null,2)+'\n');
await fs.writeFile(path.join(root,'.qa-web-release/firebase.backend.json'),JSON.stringify({
  functions:[{source:'functions',codebase:'community-connect-web',runtime:'nodejs22',ignore:['node_modules','*.log']}],
},null,2)+'\n');
await fs.writeFile(path.join(root,'.qa-web-release/backend-manifest.json'),JSON.stringify({
  preparedAt:new Date().toISOString(),project:'community-event-8b639',codebase:'community-connect-web',
  deployed:false,functions:['listDirectoryOperations','decideDirectoryReport','submitDirectoryConversationReport',
    'completeMemberRegistration','recordMemberRegistrationDate','getEventReminder','setEventReminder','removeEventReminder','deliverWebEventReminders','callWebMemberOperation'],
  files:[...files,{name:'index.cjs',sha256:createHash('sha256').update(index).digest('hex')}],
},null,2)+'\n');
console.log('Prepared 10 new functions in an isolated release package. Nothing deployed.');
