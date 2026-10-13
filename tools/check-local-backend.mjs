import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { waitForFirestore } from '../tests/firebase-integration/emulatorRest.mjs';
const project = fileURLToPath(new URL('../', import.meta.url));
process.chdir(project);
const evidence = path.join(project, '.qa-firebase-evidence', process.env.DIRECTORY_RULE_VARIANT === 'candidate' ? 'candidate' : 'reference');
await fs.mkdir(evidence, { recursive: true });
function run(args, logName) {
  return new Promise((resolve, reject) => {
    let output = '';
    const child = spawn(process.execPath, args, { cwd: project, windowsHide: true, stdio: ['inherit', 'pipe', 'pipe'] });
    child.stdout.on('data', data => { process.stdout.write(data); output += data; });
    child.stderr.on('data', data => { process.stderr.write(data); output += data; });
    child.on('error', reject);
    child.on('close', async code => {
      try { if (logName) await fs.writeFile(path.join(evidence, logName), output); resolve(code ?? 1); } catch (error) { reject(error); }
    });
  });
}
// Run sequentially: both suites seed the same isolated database.
const runStarted = new Date().toISOString();
await Promise.all(['rules-results.txt', 'backend-results.txt'].map(name =>
  fs.writeFile(path.join(evidence, name), `Run started ${runStarted}\nNOT RUN: waiting for Firestore setup.\n`)));
console.log('Waiting for the local Firestore database to answer before running acceptance checks…');
try {
  await waitForFirestore();
  await fs.writeFile(path.join(evidence, 'setup-results.txt'), 'Firestore readiness check passed.\n');
} catch (error) {
  await fs.writeFile(path.join(evidence, 'setup-results.txt'), `${error.message}\n${error.cause?.message || ''}\n`);
  console.error(error.message);
  process.exit(1);
}
const rules = await run(['--test', 'tests/firebase-integration/rules.test.mjs'], 'rules-results.txt');
const backend = await run(['--test', 'tests/firebase-integration/backend.test.mjs'], 'backend-results.txt');
if (rules || backend) console.error('Acceptance checks failed. This is not release approval; inspect .qa-firebase-evidence.');
if (process.argv.includes('--preview')) {
  const seed = await run(['tests/firebase-integration/seed.mjs']);
  if (!seed) await run(['tools/check-firebase-workspace.mjs']);
}
process.exitCode = rules || backend ? 1 : 0;
