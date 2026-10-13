// Read-only audit of the exact source generations recorded by the inventory.
// Archives can contain configuration: keep them ignored and never print contents.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const require=createRequire(path.resolve(process.env.APPDATA,'npm/node_modules/firebase-tools/package.json'));
const {getGlobalDefaultAccount}=require('./lib/auth.js'),{requireAuth}=require('./lib/requireAuth.js');
const {Client}=require('./lib/apiv2.js'),{storageOrigin}=require('./lib/api.js');
const inventory=JSON.parse(await fs.readFile('.qa-live-functions/inventory.json','utf8'));
if(inventory.project!=='community-event-8b639') throw new Error('Unexpected source project.');
const account=getGlobalDefaultAccount();
await requireAuth({project:inventory.project,nonInteractive:true,user:account?.user,tokens:account?.tokens});
const client=new Client({urlPrefix:storageOrigin()});
const results=[];
for(const fn of inventory.functions) {
  if(!/^[A-Za-z0-9]+$/.test(fn.name) || !fn.source?.generation) throw new Error('Invalid function source inventory.');
  const {bucket,object,generation}=fn.source;
  const response=await client.get(`/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(object)}?alt=media&generation=${encodeURIComponent(generation)}`,
    {responseType:'stream',resolveOnHTTPError:true});
  if(response.status!==200) { response.body.destroy(); throw new Error(`Source read failed for ${fn.name}: HTTP ${response.status}`); }
  const chunks=[];let total=0;
  for await(const chunk of response.body) {
    total+=chunk.length;
    if(total>64*1024*1024) {response.body.destroy();throw new Error('Source archive exceeds audit size limit.');}
    chunks.push(chunk);
  }
  const bytes=Buffer.concat(chunks),file=`.qa-live-functions/${fn.name}.zip`;
  await fs.writeFile(file,bytes);
  results.push({name:fn.name,file,bytes:total,sha256:createHash('sha256').update(bytes).digest('hex'),generation});
  console.log(`Saved deployed source: ${fn.name} (${total} bytes)`);
}
await fs.writeFile('.qa-live-functions/downloads.json',JSON.stringify(results,null,2)+'\n');
