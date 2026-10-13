// Read-only rules inventory. Saves deployed rule source for comparison/rollback.
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const require=createRequire(path.resolve(process.env.APPDATA,'npm/node_modules/firebase-tools/package.json'));
const {getGlobalDefaultAccount}=require('./lib/auth.js'), {requireAuth}=require('./lib/requireAuth.js');
const rules=require('./lib/gcp/rules.js'), project='community-event-8b639';
const timer=setTimeout(()=>{console.error('Rules read timed out.');process.exit(1);},60000);
try {
  const account=getGlobalDefaultAccount();
  if(!account) throw new Error('No existing Firebase login.');
  await requireAuth({project,nonInteractive:true,user:account.user,tokens:account.tokens});
  const releases=await rules.listAllReleases(project), output=[];
  await fs.mkdir('.qa-live-rules',{recursive:true});
  for(const release of releases) {
    const data=await rules.getRulesetContent(release.rulesetName);
    const files=[];
    if(!Array.isArray(data) || !data.length) throw new Error('Deployed rule source was not returned.');
    for(const [index,file] of data.entries()) {
      const name=release.name.split('/releases/')[1].replace(/[^a-zA-Z0-9._-]/g,'_')+'-'+index+'.rules';
      await fs.writeFile(path.join('.qa-live-rules',name),file.content);
      files.push({path:name,sha256:createHash('sha256').update(file.content).digest('hex')});
    }
    output.push({name:release.name,rulesetName:release.rulesetName,updatedAt:release.updateTime,files});
  }
  await fs.writeFile('.qa-live-rules/inventory.json',JSON.stringify({checkedAt:new Date().toISOString(),project,releases:output},null,2)+'\n');
  console.log('Read '+output.length+' deployed rules releases. Saved source and hashes; no production changes.');
} catch(error) {
  console.error('Rules inventory failed: '+(/auth|credentials/i.test(error.message || '')?'authentication':String(error.code || error.status || 'read error')));
  process.exitCode=1;
} finally {clearTimeout(timer);}
