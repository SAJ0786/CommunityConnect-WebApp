import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const project = fileURLToPath(new URL('../', import.meta.url));
const source = path.resolve(project, '../sdk51-package-backup/backend/functions-business-workflow');
const destination = path.join(project, 'tests/firebase-integration/functions');
await fs.mkdir(path.join(destination, 'native'), { recursive: true });
const hashes = {};
const files = new Map();
for (const name of ['support-workflow.js', 'notification-policy.js']) {
  const bytes = await fs.readFile(path.join(source, name));
  hashes[name] = createHash('sha256').update(bytes).digest('hex');
  files.set(name, bytes);
}
files.set('email-template.js', "'use strict';\n// Delivery/rendering is intentionally unavailable in the isolated callable harness.\nconst disabled = () => { throw new Error('Email rendering and delivery are disabled in this rehearsal.'); };\nmodule.exports = { renderEmail: disabled, detailRows: disabled, escapeHtml: disabled, emailBrand: disabled };\n");
const original = await fs.readFile(path.join(source, 'index.js'), 'utf8');
const start = original.indexOf('exports.sendBusinessEnquiry = onCall(');
const end = original.indexOf('exports.recordBusinessInteraction = onCall(', start);
if (start < 0 || end < start) throw new Error('Native enquiry boundaries changed; review the source before copying.');
const body = original.slice(start, end).trim();
hashes['enquiry-source-excerpt'] = createHash('sha256').update(body).digest('hex');
const wrapped = `'use strict';\n// Unchanged native handler body, wrapped for isolated dependency injection.\nexports.register = function ({ admin, db, onCall, HttpsError, REGION }) {\nconst clean = value => String(value || '').trim();\n${body.replace('exports.sendBusinessEnquiry = ', 'return ')}\n};\n`;
files.set('enquiry.cjs', wrapped);
// Additional snapshots are isolated wrappers, never imports of a production
// entrypoint (which would initialise credentials and export delivery triggers).
const excerpt = (text, from, to) => {
  const begin = text.indexOf(from), end = text.indexOf(to, begin);
  if (begin < 0 || end < begin) throw new Error(`Reviewed source boundary changed: ${from}`);
  return text.slice(begin, end).trim();
};
const lifecycle = await fs.readFile(path.resolve(source, '../functions-lifecycle/index.js'), 'utf8');
const eventBody = [
  excerpt(lifecycle, 'function city(value)', 'exports.archiveEventRecords ='),
  excerpt(lifecycle, 'exports.archiveEventRecords =', 'exports.deleteUserData ='),
].join('\n');
hashes['event-archive-source-excerpt'] = createHash('sha256').update(eventBody).digest('hex');
files.set('event-archive.cjs', `'use strict';\n// Native handler snapshot; isolated dependencies and candidate guards are supplied by index.cjs.\nconst { isFutureSeriesEvent } = require('./seriesScope.cjs');\nexports.register = function ({ admin, db, onCall, HttpsError, REGION }) {\nconst exports = {};\nconst DEFAULT_CITY = 'sydney';\n${eventBody}\nreturn exports;\n};\n`);
const seriesScope = await fs.readFile(path.resolve(source, '../functions-lifecycle/seriesScope.js'));
hashes['seriesScope.cjs'] = createHash('sha256').update(seriesScope).digest('hex');
files.set('seriesScope.cjs', seriesScope);
const lifecycleBody = [
  excerpt(lifecycle, 'function city(value)', 'exports.archiveEventRecords ='),
  excerpt(lifecycle, 'exports.adminDeleteUser =', 'exports.adminUnbanUser ='),
  lifecycle.slice(lifecycle.indexOf('exports.adminRestoreUser =')).trim(),
].join('\n');
if (!lifecycle.includes('exports.adminRestoreUser =')) throw new Error('Restore handler boundary changed.');
hashes['lifecycle-source-excerpt'] = createHash('sha256').update(lifecycleBody).digest('hex');
files.set('lifecycle.cjs', `'use strict';\nexports.register = function ({ admin, db, onCall, HttpsError, REGION }) {\nconst exports = {};\nconst DEFAULT_CITY = 'sydney';\n${lifecycleBody}\nreturn exports;\n};\n`);
const abrSource = path.resolve(process.env.USERPROFILE, 'OneDrive - SIZA Family/1. Professional/AI Apps/Community Event/App/functions/index.js');
const abr = await fs.readFile(abrSource, 'utf8');
const abrBody = [
  excerpt(abr, 'const ABN_WEIGHTS =', 'function decodeAbrXml('),
  excerpt(abr, 'function abrBusinessNames(', 'exports.helloWorld ='),
  excerpt(abr, 'exports.verifyBusinessAbn =', '// Temporary app store reviewer login.'),
].join('\n');
hashes['abr-source-excerpt'] = createHash('sha256').update(abrBody).digest('hex');
files.set('abn.cjs', `'use strict';\n// Native decisions; ABR transport is injected and cannot access a real secret.\nexports.register = function ({ admin, db, onCall, HttpsError, REGION, lookupAbrByAbn }) {\nconst exports = {};\nconst ABR_AUTH_GUID = null;\n${abrBody}\nreturn exports;\n};\n`);
try {
  const previous = JSON.parse(await fs.readFile(path.join(destination, 'native/source-hashes.json'), 'utf8'));
  if (Object.entries(previous).some(([name, hash]) => hashes[name] !== hash)) throw new Error('Native handler source changed. Review and test the new snapshot before updating its recorded hashes.');
} catch (error) { if (error.code !== 'ENOENT') throw error; }
for (const [name, contents] of files) await fs.writeFile(path.join(destination, 'native', name), contents);
await fs.writeFile(path.join(destination, 'native/source-hashes.json'), JSON.stringify(hashes, null, 2) + '\n');
// Reuse already-installed SDKs; do not install or modify the native project.
const modules = path.join(destination, 'node_modules');
try { await fs.lstat(modules); } catch (error) {
  if (error.code !== 'ENOENT') throw error;
  if (process.argv.includes('--source-only')) {
    console.log('Native source snapshots prepared; SDK dependency linking was not requested.');
    process.exit(0);
  }
  const nativeModules = path.join(source, 'node_modules');
  await fs.access(path.join(nativeModules, 'firebase-admin/package.json'));
  try { await fs.symlink(nativeModules, modules, 'junction'); }
  catch (error) { throw new Error('Could not link the installed Firebase SDKs. Run this preparation from your normal PowerShell session, where workspace links are permitted.', { cause: error }); }
}
console.log('Prepared isolated enquiry, support, ABN, account and event archive handlers with source hashes. ABR uses synthetic fixtures; no deployment or external delivery is enabled.');
