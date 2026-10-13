import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const mapping={archiveEventRecords:'event-archive.cjs',archiveFutureSeriesEvents:'event-archive.cjs',
  adminDeleteUser:'lifecycle.cjs',adminRestoreUser:'lifecycle.cjs',lookupBusinessAbnForSubmission:'abn.cjs',verifyBusinessAbn:'abn.cjs'};
const normalize=value=>value.replaceAll('\r\n','\n').trim();
const hash=value=>createHash('sha256').update(value).digest('hex');
const results=[];
for(const [name,local] of Object.entries(mapping)) {
  const live=normalize(await fs.readFile(`.qa-live-functions/${name}/index.js`,'utf8'));
  const start=live.indexOf(`exports.${name} =`);
  if(start<0) throw new Error(`Missing source export ${name}`);
  const tail=live.slice(start),end=tail.search(/\n(?:\}\);|\);)(?:\n|$)/);
  if(end<0) throw new Error(`Unrecognized export boundary ${name}`);
  const body=tail.slice(0,end+tail.slice(end).indexOf(';')+1);
  const snapshot=normalize(await fs.readFile(`tests/firebase-integration/functions/native/${local}`,'utf8'));
  results.push({name,handlerMatches:snapshot.includes(body),deployedHandlerSha256:hash(body)});
}
const liveEnquiry=normalize(await fs.readFile('.qa-live-functions/sendBusinessEnquiry/index.js','utf8'));
const enquiry=liveEnquiry.slice(liveEnquiry.indexOf('exports.sendBusinessEnquiry ='),liveEnquiry.indexOf('exports.recordBusinessInteraction =')).trim();
const enquirySnapshot=normalize(await fs.readFile('tests/firebase-integration/functions/native/enquiry.cjs','utf8'));
results.push({name:'sendBusinessEnquiry',handlerMatches:enquirySnapshot.includes(enquiry.replace('exports.sendBusinessEnquiry = ','return ')),deployedHandlerSha256:hash(enquiry)});
const liveSupport=normalize(await fs.readFile('.qa-live-functions/submitSupportRequest/support-workflow.js','utf8'));
results.push({name:'submitSupportRequest',handlerMatches:liveSupport===normalize(await fs.readFile('tests/firebase-integration/functions/native/support-workflow.js','utf8')),deployedHandlerSha256:hash(liveSupport)});
await fs.writeFile('.qa-live-functions/source-comparison.json',JSON.stringify({checkedAt:new Date().toISOString(),scope:'Exact handler bodies; emulator adds web guard and stubs external delivery/ABR transport.',results},null,2)+'\n');
console.log(JSON.stringify(results,null,2));
if(results.some(result=>!result.handlerMatches)) process.exitCode=1;
