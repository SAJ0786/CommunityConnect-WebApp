// Read only selected deployment metadata. Never stores runtime environment values.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(path.resolve(process.env.APPDATA,'npm/node_modules/firebase-tools/package.json'));
const {getGlobalDefaultAccount}=require('./lib/auth.js'),{requireAuth}=require('./lib/requireAuth.js');
const {getFunction}=require('./lib/gcp/cloudfunctionsv2.js');
const project='community-event-8b639',region='australia-southeast1';
const names=['archiveEventRecords','archiveFutureSeriesEvents','lookupBusinessAbnForSubmission','verifyBusinessAbn',
  'adminDeleteUser','adminRestoreUser','sendBusinessEnquiry','submitSupportRequest'];
const account=getGlobalDefaultAccount();
await requireAuth({project,nonInteractive:true,user:account?.user,tokens:account?.tokens});
const results=await Promise.all(names.map(async name=>{
  const fn=await getFunction(project,region,name);
  return {name,updateTime:fn.updateTime,state:fn.state,codebase:fn.labels?.['firebase-functions-codebase'] || 'default',
    runtime:fn.buildConfig?.runtime,source:fn.buildConfig?.source?.storageSource || null};
}));
await fs.mkdir('.qa-live-functions',{recursive:true});
await fs.writeFile('.qa-live-functions/inventory.json',JSON.stringify({checkedAt:new Date().toISOString(),project,functions:results},null,2)+'\n');
console.log(JSON.stringify(results.map(({name,codebase,state,source})=>({name,codebase,state,sourceAvailable:!!source}))));
