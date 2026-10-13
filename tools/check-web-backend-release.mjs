// Read-only deployment verification plus unauthenticated rejection probes.
// Never sends SMS, push or a signed-in mutation.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(path.resolve(process.env.APPDATA,'npm/node_modules/firebase-tools/package.json'));
const {getGlobalDefaultAccount}=require('./lib/auth.js'),{requireAuth}=require('./lib/requireAuth.js');
const {getFunction}=require('./lib/gcp/cloudfunctionsv2.js'),{Client}=require('./lib/apiv2.js');
const project='community-event-8b639',region='australia-southeast1';
const manifest=JSON.parse(await fs.readFile('.qa-web-release/backend-manifest.json','utf8'));
const account=getGlobalDefaultAccount();
await requireAuth({project,nonInteractive:true,user:account?.user,tokens:account?.tokens});
const deployed=await Promise.all(manifest.functions.map(async name=>{
  const fn=await getFunction(project,region,name);
  return {name,state:fn.state,codebase:fn.labels?.['firebase-functions-codebase'],runtime:fn.buildConfig?.runtime,updatedAt:fn.updateTime};
}));
const probes=[];
for(const name of manifest.functions.filter(name=>!['recordMemberRegistrationDate','deliverWebEventReminders'].includes(name))) {
  const data=name==='callWebMemberOperation'?{operation:'sendBusinessEnquiry',payload:{}}:{};
  const response=await fetch(`https://${region}-${project}.cloudfunctions.net/${name}`,{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({data}),signal:AbortSignal.timeout(60000),
  });
  const body=await response.json();
  probes.push({name,httpStatus:response.status,error:body?.error?.status,
    rejectedWithoutSignIn:response.status===401 && body?.error?.status==='UNAUTHENTICATED'});
}
// Verify the exact worker query against real Firestore indexes, without dispatch.
const client=new Client({urlPrefix:'https://firestore.googleapis.com'});
const query=await client.post(`/v1/projects/${project}/databases/(default)/documents:runQuery`,{structuredQuery:{
  from:[{collectionId:'webEventReminders'}],
  where:{fieldFilter:{field:{fieldPath:'status'},op:'IN',value:{arrayValue:{values:[{stringValue:'pending'},{stringValue:'dispatching'}]}}}},
  orderBy:[{field:{fieldPath:'__name__'},direction:'ASCENDING'}],limit:1,
  select:{fields:[{fieldPath:'status'}]},
}});
const report={checkedAt:new Date().toISOString(),project,deployed,probes,workerQuerySucceeded:query.status===200};
report.passed=deployed.every(fn=>fn.state==='ACTIVE' && fn.codebase==='community-connect-web' && fn.runtime==='nodejs22')
  && probes.every(probe=>probe.rejectedWithoutSignIn) && report.workerQuerySucceeded;
await fs.writeFile('.qa-web-release/backend-verification.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(!report.passed) process.exitCode=1;
