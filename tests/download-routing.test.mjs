import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const root=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8').match(/<script>\s*([\s\S]*?)<\/script>/)[1];
const download=fs.readFileSync(new URL('../public/download.html',import.meta.url),'utf8').match(/<script>\s*([\s\S]*?)<\/script>/)[1];
test('new and legacy download hosts route to the dedicated download page, preserving query and fragment',()=>{
 for(const hostname of ['download.communityconnect.siza.info','download.communityevents.siza.info','communityconnect.siza.info','communityevents.siza.info']){
 let destination;vm.runInNewContext(root,{window:{location:{hostname,search:'?app-update=123',hash:'#download',replace:value=>destination=value}}});
 assert.equal(destination,hostname.startsWith('download.')?'/download.html?app-update=123#download':undefined);
 }
});
test('download page sends iPhone, Android and desktop-mode iPad to the proper store with a manual fallback',()=>{
 for(const [userAgent,platform,maxTouchPoints,expected] of [
 ['Mozilla iPhone','iPhone',5,'apps.apple.com'],['Mozilla Android','Linux',5,'play.google.com'],['Mozilla Macintosh','MacIntel',5,'apps.apple.com'],['Mozilla Windows','Win32',0,'apps.microsoft.com']]){
 const nodes={storeLink:{},message:{}};let destination;
 vm.runInNewContext(download,{navigator:{userAgent,platform,maxTouchPoints},document:{getElementById:id=>nodes[id]},window:{location:{replace:value=>destination=value}}});
 assert.equal(new URL(destination).hostname,expected);assert.equal(nodes.storeLink.href,destination);assert.ok(nodes.storeLink.textContent.startsWith('Open '));
 }
});
