// Read-only preflight. Never prints API keys, tokens, document IDs or user data.
import fs from 'node:fs';
import path from 'node:path';
const envFile = process.argv[process.argv.indexOf('--env-file') + 1];
const previewHost = process.argv.includes('--preview-host') ? process.argv[process.argv.indexOf('--preview-host') + 1] : '';
if (previewHost && !/^[a-z0-9-]+\.web\.app$/.test(previewHost)) throw new Error('Supply a Firebase preview hostname only.');
if (!process.argv.includes('--env-file') || !envFile) throw new Error('Supply --env-file with the existing web environment file.');
const source = fs.readFileSync(envFile, 'utf8');
const read = name => source.match(new RegExp(`^\\s*${name}\\s*=\\s*["']?([^"'\\r\\n]+)`, 'm'))?.[1]?.trim() || '';
const projectId = read('VITE_FIREBASE_PROJECT_ID');
const apiKey = read('VITE_FIREBASE_API_KEY');
if (!/^[a-z0-9-]+$/.test(projectId)) throw new Error('Valid Firebase project ID missing.');
const nativeConfig = JSON.parse(fs.readFileSync(path.resolve('../sdk51-package-backup/google-services.json'), 'utf8'));
const report = {
  checkedAt: new Date().toISOString(), projectId,
  sameProjectAsNative: nativeConfig.project_info.project_id === projectId,
  publicDirectory: {}, authConfiguration: {},
  limitations: ['No SMS sent or account sign-in performed.', 'No live writes or deployment.', 'Public REST access does not prove authenticated user permissions.'],
};
const listingUrl = new URL(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/publicBusinesses`);
listingUrl.searchParams.set('pageSize', '100');
for (const field of ['status', 'hidden', 'name', 'location.city', 'location.publicDisplay']) listingUrl.searchParams.append('mask.fieldPaths', field);
try {
  const response = await fetch(listingUrl, { signal: AbortSignal.timeout(20000) });
  const data = await response.json();
  const docs = data.documents || [];
  report.publicDirectory = { httpStatus: response.status, accessibleWithoutSignIn: response.ok, sampledDocuments: docs.length, hasMore: Boolean(data.nextPageToken),
    approvedVisibleInSample: docs.filter(row => row.fields?.status?.stringValue === 'approved' && row.fields?.hidden?.booleanValue !== true).length,
    errorCode: data.error?.status || null };
} catch { report.publicDirectory = { accessibleWithoutSignIn: false, networkError: true }; }
try {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/projects?key=${encodeURIComponent(apiKey)}`, { signal: AbortSignal.timeout(20000) });
  const data = await response.json();
  const domains = data.authorizedDomains || [];
  report.authConfiguration = { httpStatus: response.status, readable: response.ok,
    localhostAuthorized: domains.includes('localhost'), loopbackIpAuthorized: domains.includes('127.0.0.1'),
    proposedDomainAuthorized: domains.includes('communityconnect.siza.info'),
    existingEventsDomainAuthorized: domains.includes('communityevents.siza.info') };
  if (previewHost) report.authConfiguration.previewDomainAuthorized = domains.includes(previewHost);
} catch { report.authConfiguration = { readable: false, networkError: true }; }
console.log(JSON.stringify(report, null, 2));
