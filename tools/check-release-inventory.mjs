// Read-only Firebase CLI inventory. No login, deployment, account writes or rule changes.
// Never persist raw Functions output: it may contain environment configuration.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
const root = fileURLToPath(new URL('../', import.meta.url));
const cli = path.resolve(process.env.APPDATA, 'npm/node_modules/firebase-tools/lib/bin/firebase.js');
await fs.access(cli);
const project = 'community-event-8b639';
async function read(args) {
  return new Promise(resolve => {
    let output = '', excessive = false;
    const child = spawn(process.execPath, [cli, ...args, '--project', project, '--json', '--non-interactive'], {
      cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'],
    });
    const timer = setTimeout(() => child.kill(), 60000);
    child.stdout.on('data', bytes => {
      output += bytes;
      if (output.length > 32 * 1024 * 1024) { excessive = true; child.kill(); }
    });
    child.on('error', () => { clearTimeout(timer); resolve({ ok: false }); });
    child.on('close', code => {
      clearTimeout(timer);
      try { const value = JSON.parse(output); resolve({ ok: code === 0 && !excessive && value.status === 'success', result: value.result }); }
      catch { resolve({ ok: false }); }
    });
  });
}
const report = { checkedAt: new Date().toISOString(), project, requestedDomain: 'communityconnect.siza.info',
  status: 'incomplete', sites: [], functions: [], checks: {},
  limitations: ['Custom-domain mapping and deployed rules still require verification.',
    'A function name in this inventory does not prove source revision, behaviour or native-client compatibility.',
    'No live or preview release is authorised by this report.'] };
console.log('Reading Hosting sites and function names. No Firebase changes will be made.');
const sites = await read(['hosting:sites:list']);
report.checks.sites = sites.ok;
if (sites.ok && Array.isArray(sites.result?.sites)) {
  for (const site of sites.result.sites) {
    const id = site.name?.split('/').at(-1);
    if (!/^[a-z0-9-]+$/.test(id || '')) continue;
    const channels = await read(['hosting:channel:list', '--site', id]);
    const live = channels.result?.channels?.find(channel => channel.name?.split('/').at(-1) === 'live');
    report.sites.push({ id, defaultUrl: site.defaultUrl || null, channelsRead: channels.ok,
      liveRelease: live?.release?.name || null, liveVersion: live?.release?.version?.name || null,
      releaseTime: live?.release?.releaseTime || null });
  }
}
const functions = await read(['functions:list']);
report.checks.functions = functions.ok;
if (functions.ok && Array.isArray(functions.result)) report.functions = functions.result.map(item => ({
  name: item.id, region: item.region, runtime: item.runtime, platform: item.platform,
}));
const prerequisites = ['completeMemberRegistration', 'recordMemberRegistrationDate', 'archiveEventRecords', 'archiveFutureSeriesEvents',
  'lookupBusinessAbnForSubmission', 'verifyBusinessAbn', 'adminDeleteUser', 'adminRestoreUser', 'sendBusinessEnquiry', 'submitSupportRequest'];
report.prerequisites = Object.fromEntries(prerequisites.map(name => [name, functions.ok
  ? report.functions.some(item => item.name === name && item.region === 'australia-southeast1') : null]));
report.status = sites.ok && functions.ok && report.sites.length && report.sites.every(site => site.channelsRead) ? 'inventory-collected' : 'incomplete';
const destination = path.join(root, '.qa-release-inventory.json');
await fs.writeFile(destination, JSON.stringify(report, null, 2) + '\n');
console.log(`Inventory ${report.status}. Sanitised report: ${destination}`);
console.log('Custom-domain mapping, deployed-rule comparison and release acceptance remain separate checks.');
if (report.status === 'incomplete') { console.error('One or more read-only CLI checks failed in this session. Run this command in your normal authenticated PowerShell.'); process.exitCode = 1; }
