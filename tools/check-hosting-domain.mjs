// Read-only authenticated inventory. Never prints/persists tokens or raw API responses.
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
const require = createRequire(path.resolve(process.env.APPDATA,'npm/node_modules/firebase-tools/package.json'));
const {getGlobalDefaultAccount} = require('./lib/auth.js');
const {requireAuth} = require('./lib/requireAuth.js');
const hosting = require('./lib/hosting/api.js');
const {Client} = require('./lib/apiv2.js');
const {hostingApiOrigin} = require('./lib/api.js');
const project = 'community-event-8b639', domain = 'communityconnect.siza.info';
const report = {checkedAt:new Date().toISOString(),project,domain,status:'incomplete',sites:[],productionChanged:false};
let phase='account';
const timer = setTimeout(() => { console.error('Read-only Hosting check timed out. Earlier accepted evidence is retained.'); process.exit(1); },60000);
try {
  const account = getGlobalDefaultAccount();
  if (!account) throw Object.assign(new Error(),{code:'NO_LOCAL_ACCOUNT'});
  phase='authentication';
  await requireAuth({project,nonInteractive:true,user:account.user,tokens:account.tokens});
  const api = new Client({urlPrefix:hostingApiOrigin(),apiVersion:'v1beta1',auth:true});
  phase='sites';
  for (const site of await hosting.listSites(project)) {
    const id = site.name.split('/').at(-1);
    let pageToken, domains = [];
    phase='domains';
    do {
      const response = await api.get('/projects/'+project+'/sites/'+id+'/customDomains',
        {queryParams:{pageSize:100,...(pageToken ? {pageToken} : {})}});
      domains.push(...(response.body.customDomains || []).map(item=>({
        domain:item.name.split('/').at(-1),hostState:item.hostState || null,
        ownershipState:item.ownershipState || null,certState:item.cert?.state || null,
      })));
      pageToken=response.body.nextPageToken;
    } while (pageToken);
    phase='live-release';
    const live=await hosting.getChannel(project,id,'live');
    report.sites.push({id,domains,liveVersion:live?.release?.version?.name || null,
      liveRelease:live?.release?.name || null,releaseTime:live?.release?.releaseTime || null});
  }
  const matches=report.sites.filter(site=>site.domains.some(item=>item.domain===domain));
  report.status=matches.length===1 && matches[0].liveVersion ? 'domain-and-rollback-verified' : 'needs-review';
  report.targetSite=matches.length===1 ? matches[0].id : null;
} catch(error) {
  report.errorCode=String(error.code || error.status || 'READ_FAILED').slice(0,80);
  // FirebaseError defaults to status 500 even without an HTTP response.
  report.httpStatus=error.context?.response?.status || error.context?.response?.statusCode || null;
  report.failureKind=/credentials|authentication|authoriz|access.?token/i.test(error.message || '') ? 'authentication' : report.httpStatus ? 'http-response' : 'client-error';
  report.failedPhase=phase;
  const causes=[];
  for(let cause=error,depth=0;cause && depth<5;depth++,cause=cause.original || cause.cause || cause.context?.original) {
    causes.push({code:String(cause.code || cause.status || 'UNKNOWN').slice(0,80),syscall:cause.syscall || null});
  }
  report.causes=causes;
  console.error('Read-only Hosting inventory could not complete. No Firebase changes were made.');
  process.exitCode=1;
} finally { clearTimeout(timer); }
// Separate from the earlier successful site/function inventory.
await fs.writeFile('.qa-hosting-domain-2026-10-12.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,targetSite:report.targetSite || null,errorCode:report.errorCode || null,httpStatus:report.httpStatus,failureKind:report.failureKind,failedPhase:report.failedPhase,causes:report.causes}));
