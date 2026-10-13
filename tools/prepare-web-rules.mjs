// Prepares only the reviewed Firestore candidate; never deploys.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {buildRuleCandidate} from '../tests/firebase-integration/ruleCandidate.mjs';
const read=async file=>(await fs.readFile(file,'utf8')).replaceAll('\r\n','\n');
const live=await read('.qa-live-rules/cloud.firestore-0.rules');
const reference=await read('tests/firebase-integration/firestore.rules');
const before="          'adminCity', 'permissions', 'security'";
const after=before+",\n          'registeredAt', 'profileCompletedAt', 'legalAcceptedAt'";
if(live.split(before).length!==2 || live.replace(before,after)!==reference) {
  throw new Error('Live rules differ from the reviewed baseline. Review inventory before preparing release rules.');
}
const candidate=await read('tests/firebase-integration/firestore.candidate.rules');
if(candidate!==buildRuleCandidate(reference)) throw new Error('The rule candidate does not match the reviewed generator.');
const release=candidate.replace('// EMULATOR-ONLY CANDIDATE — NOT APPROVED FOR DEPLOYMENT',
  '// Community Connect web release candidate. Deploy only after release acceptance.');
await fs.mkdir('.qa-web-release',{recursive:true});
await fs.writeFile('.qa-web-release/firestore.rules',release);
await fs.writeFile('.qa-web-release/firebase.rules.json',JSON.stringify({firestore:{rules:'firestore.rules'}},null,2)+'\n');
const sha=value=>createHash('sha256').update(value).digest('hex');
await fs.writeFile('.qa-web-release/rules-manifest.json',JSON.stringify({preparedAt:new Date().toISOString(),
  project:'community-event-8b639',deployed:false,liveSource:'.qa-live-rules/cloud.firestore-0.rules',
  liveSha256:sha(live),referenceSha256:sha(reference),testedCandidateSha256:sha(candidate),releaseSha256:sha(release),
  changes:['Protect server registration timestamps on self-profile updates.','Apply reviewed business ownership/city and host-conversation checks.'],
  storageRulesChanged:false},null,2)+'\n');
console.log('Prepared reviewed Firestore rules and rollback-source hashes. Nothing deployed.');
