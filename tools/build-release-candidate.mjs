// Builds an integrated candidate in a separate directory. Never deploys.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {build} from 'vite';
import config from '../vite.config.js';
const index=process.argv.indexOf('--env-file');
if(index<0 || !process.argv[index+1]) throw new Error('Supply the existing web configuration with --env-file.');
const source=await fs.readFile(process.argv[index+1],'utf8'), values={};
for(const match of source.matchAll(/^\s*(VITE_[A-Z0-9_]+)\s*=\s*["']?([^"'\r\n]+)["']?\s*$/gm)) values[match[1]]=match[2].trim();
const required=['VITE_FIREBASE_API_KEY','VITE_FIREBASE_AUTH_DOMAIN','VITE_FIREBASE_PROJECT_ID','VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID','VITE_FIREBASE_APP_ID','VITE_GOOGLE_PLACES_KEY','VITE_FIREBASE_VAPID_KEY'];
const missing=required.filter(name=>!values[name]);
if(missing.length) throw new Error('Release configuration is missing: '+missing.join(', '));
if(values.VITE_FIREBASE_PROJECT_ID!=='community-event-8b639') throw new Error('Unexpected release project.');
const define={...config.define,...Object.fromEntries(required.map(name=>['import.meta.env.'+name,JSON.stringify(values[name])]))};
for(const [name,value] of Object.entries({VITE_LOCAL_PREVIEW:false,VITE_READ_ONLY_PREVIEW:false,VITE_DIRECTORY_WORKSPACE_ENABLED:true,VITE_EVENT_REMINDERS_ENABLED:true})) {
  define['import.meta.env.'+name]=JSON.stringify(String(value));
}
const destination=path.resolve('.qa-web-release/site');
await build({...config,configFile:false,define,resolve:{...config.resolve,preserveSymlinks:true},
  plugins:[...config.plugins.slice(0,1),{name:'release-source-boundary',generateBundle(_,bundle){
    for(const chunk of Object.values(bundle)) if(chunk.type==='chunk') {
      for(const id of Object.keys(chunk.modules)) if(/\/tests\/|\/RegistrationPrototype\.jsx$/.test(id.replaceAll('\\','/'))) {
        throw new Error('Unreleased prototype/test code reached the production bundle: '+id);
      }
    }
  }}],build:{...config.build,outDir:destination,emptyOutDir:true}});
const buildTime=Date.now();
const assets=(await fs.readdir(path.join(destination,'assets'))).filter(name=>/\.(js|css|woff2?|png|jpe?g|webp|svg)$/i.test(name)).map(name=>'/assets/'+name).sort();
const workerPath=path.join(destination,'sw.js');
let worker=await fs.readFile(workerPath,'utf8');
if(!worker.includes('__BUILD_TIME__') || !worker.includes('/* __BUILD_ASSETS__ */ []')) throw new Error('Service worker build markers are missing.');
worker=worker.replace('__BUILD_TIME__',String(buildTime)).replace('/* __BUILD_ASSETS__ */ []',JSON.stringify(assets));
await fs.writeFile(workerPath,worker);
async function files(directory) {
  const result=[];
  for(const entry of await fs.readdir(directory,{withFileTypes:true})) {
    const file=path.join(directory,entry.name);
    if(entry.isDirectory()) result.push(...await files(file)); else result.push(file);
  }
  return result;
}
const hashes=await Promise.all((await files(destination)).map(async file=>({
  path:path.relative(destination,file).replaceAll('\\','/'),sha256:createHash('sha256').update(await fs.readFile(file)).digest('hex'),
})));
const hosting=JSON.parse(await fs.readFile('firebase.json','utf8')).hosting;
await fs.writeFile('.qa-web-release/firebase.hosting.json',JSON.stringify({hosting:{...hosting,site:'community-event-8b639',public:'site'}},null,2)+'\n');
await fs.writeFile('.qa-web-release/site-manifest.json',JSON.stringify({builtAt:new Date().toISOString(),project:'community-event-8b639',
  targetDomain:'communityconnect.siza.info',serviceWorkerCache:'ce-v'+buildTime,directoryEnabled:true,remindersEnabled:true,deployed:false,files:hashes},null,2)+'\n');
console.log('Integrated candidate built with account workflows and reminders. Nothing deployed.');
