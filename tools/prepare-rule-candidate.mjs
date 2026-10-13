import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { buildRuleCandidate } from '../tests/firebase-integration/ruleCandidate.mjs';
const root = new URL('../tests/firebase-integration/', import.meta.url);
const bytes = await fs.readFile(new URL('firestore.rules', root));
const hash = createHash('sha256').update(bytes).digest('hex');
if (hash !== '529fb93d87e74327365efae6bd5c8af425f3d0226152c1869a434520a59ef97d') {
  throw new Error('The reference rules hash changed. Review it before generating a new candidate.');
}
const candidate = buildRuleCandidate(bytes.toString('utf8').replaceAll('\r\n', '\n'));
await fs.writeFile(new URL('firestore.candidate.rules', root), candidate);
const config = JSON.parse(await fs.readFile(new URL('firebase.json', root), 'utf8'));
config.firestore.rules = 'firestore.candidate.rules';
await fs.writeFile(new URL('firebase.candidate.json', root), JSON.stringify(config, null, 2) + '\n');
console.log('Prepared a separate emulator-only rule candidate. Reference and deployable rules are unchanged.');
