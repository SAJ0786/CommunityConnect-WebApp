import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const originIndex=process.argv.indexOf('--origin');
const origin=originIndex>=0 ? process.argv[originIndex+1] : 'https://community-event-8b639--web-final-review-rfgev4f9.web.app';
if(!['https://community-event-8b639--web-final-review-rfgev4f9.web.app','https://communityconnect.siza.info','https://community-event-8b639.web.app'].includes(origin)) throw new Error('Unexpected verification origin.');
const manifest=JSON.parse(await fs.readFile('.qa-web-release/site-manifest.json','utf8'));
const results=[];
for(let offset=0;offset<manifest.files.length;offset+=6) {
  results.push(...await Promise.all(manifest.files.slice(offset,offset+6).map(async file=>{
    const response=await fetch(`${origin}/${file.path.split('/').map(encodeURIComponent).join('/')}`,{signal:AbortSignal.timeout(30000),redirect:'error'});
    const bytes=Buffer.from(await response.arrayBuffer());
    return {path:file.path,status:response.status,hashMatches:createHash('sha256').update(bytes).digest('hex')===file.sha256};
  })));
}
const routes=[];
for(const path of ['/businesses','/promotions','/?event=release-route-check']) {
  const response=await fetch(origin+path,{signal:AbortSignal.timeout(30000)});
  routes.push({path,status:response.status,hasAppRoot:(await response.text()).includes('id="root"')});
}
const report={checkedAt:new Date().toISOString(),origin,filesChecked:results.length,
  passed:results.every(file=>file.status===200 && file.hashMatches) && routes.every(route=>route.status===200 && route.hasAppRoot),results,routes};
await fs.writeFile(originIndex>=0 ? '.qa-web-release/live-hosted-file-verification.json' : '.qa-web-release/hosted-file-verification.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({origin,filesChecked:report.filesChecked,passed:report.passed,
  mismatches:results.filter(file=>file.status!==200 || !file.hashMatches),routes},null,2));
if(!report.passed) process.exitCode=1;
