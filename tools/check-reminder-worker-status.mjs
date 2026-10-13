// Read-only scheduler/worker health. Does not dispatch a notification.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(path.resolve(process.env.APPDATA,'npm/node_modules/firebase-tools/package.json'));
const {getGlobalDefaultAccount}=require('./lib/auth.js'),{requireAuth}=require('./lib/requireAuth.js'),{Client}=require('./lib/apiv2.js');
const project='community-event-8b639',region='australia-southeast1';
const account=getGlobalDefaultAccount();
await requireAuth({project,nonInteractive:true,user:account?.user,tokens:account?.tokens});
const scheduler=new Client({urlPrefix:'https://cloudscheduler.googleapis.com'});
const jobs=(await scheduler.get(`/v1/projects/${project}/locations/${region}/jobs`)).body.jobs || [];
const job=jobs.find(item=>item.name.endsWith(`/firebase-schedule-deliverWebEventReminders-${region}`));
if(!job) throw new Error('Web reminder schedule not found.');
const firestore=new Client({urlPrefix:'https://firestore.googleapis.com'});
const fields=(await firestore.get(`/v1/projects/${project}/databases/(default)/documents/webReminderWorkerState/sweep?mask.fieldPaths=updatedAt&mask.fieldPaths=examined&mask.fieldPaths=acknowledged`)).body.fields || {};
const lastSweep=Number(fields.updatedAt?.integerValue || fields.updatedAt?.doubleValue || 0);
const report={checkedAt:new Date().toISOString(),state:job.state,schedule:job.schedule,lastAttemptTime:job.lastAttemptTime,
  lastAttemptStatus:job.status?.code || 0,lastSweep:lastSweep?new Date(lastSweep).toISOString():null,
  lastSweepExamined:Number(fields.examined?.integerValue || 0),lastSweepAcknowledged:Number(fields.acknowledged?.integerValue || 0),
  healthy:job.state==='ENABLED' && !job.status?.code && lastSweep> Date.now()-5*60000,
  deviceDeliveryVerified:false};
await fs.writeFile('.qa-web-release/reminder-worker-health.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(!report.healthy) process.exitCode=1;
