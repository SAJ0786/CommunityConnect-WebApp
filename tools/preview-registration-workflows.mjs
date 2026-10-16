import { build, preview } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
const root=process.cwd();
const config={configFile:false,root:path.join(root,'tests/registration-workspace-preview'),publicDir:false,
  plugins:[{name:'isolated-workflow-only',enforce:'pre',resolveId(id){
    if(id.includes('AddressAutocomplete')) return path.join(root,'tests/registration-workspace-preview/address.jsx');
    if(/services\/(settingsService|organisationsService|imageService)$/.test(id)) return '\0registration-form-fixtures';
    if(/firebase|RegistrationRoute|serviceWorker/i.test(id)) throw Error('Live services are forbidden in the isolated workflow review.');
  },load(id){
    if(id==='\0registration-form-fixtures') return 'export const getHijriSettings=async()=>({overrides:[]}); export const getOrganisations=async()=>[]; export const getFallbackImage=()=>""; export const uploadEventImage=()=>{throw Error("Public upload is forbidden in registration preview");};';
  }},react()],resolve:{preserveSymlinks:true},
  build:{outDir:path.join(root,'.qa-registration-workflows'),emptyOutDir:true},
  preview:{host:'127.0.0.1',port:5198,strictPort:true}};
await build(config);
if(!process.argv.includes('--build-only')) (await preview(config)).printUrls();
