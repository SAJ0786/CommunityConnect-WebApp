import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';

// Render the real JSX component without requiring an installed browser.
const compiled = await build({ entryPoints:['src/business/WorkspaceParts.jsx'], bundle:true, write:false, platform:'node', format:'cjs', external:['react'], preserveSymlinks:true });
const module = { exports:{} };
vm.runInNewContext(compiled.outputFiles[0].text,{module,exports:module.exports,require:createRequire(import.meta.url)});
const { Field } = module.exports;
const render = (label,control,hint) => renderToStaticMarkup(React.createElement(Field,{label,hint},control));
const captionId = html => html.match(/<span id="([^"]+)">/)[1];

test('shared select name references only its caption, independent of option content',()=>{
  for(const choice of ['Under review','Block conversation']){
    const html=render('Moderation decision',React.createElement('select',{defaultValue:choice},React.createElement('option',{value:choice},choice)));
    assert.ok(html.includes(`aria-labelledby="${captionId(html)}"`));
    assert.ok(html.includes(`>${'Moderation decision'}</span>`));
    assert.ok(html.includes(`<option value="${choice}" selected="">${choice}</option>`));
  }
});
test('populated read-only textarea name excludes its content and hint',()=>{
  const html=render('Diagnostic summary',React.createElement('textarea',{readOnly:true,value:'{"session":"synthetic"}'}),'Select and copy');
  const hintId=html.match(/<small id="([^"]+)">/)[1];
  assert.ok(html.includes(`aria-labelledby="${captionId(html)}"`));
  assert.ok(html.includes(`aria-describedby="${hintId}"`));
  assert.match(html,/readonly=""/);
  assert.match(html,/\{&quot;session&quot;:&quot;synthetic&quot;\}/);
});
test('repeated fields have distinct captions and retain existing descriptions',()=>{
  const html=renderToStaticMarkup(React.createElement(React.Fragment,null,
    React.createElement(Field,{label:'Open',hint:'Local time'},React.createElement('input',{'aria-describedby':'existing-note'})),
    React.createElement(Field,{label:'Open'},React.createElement('input'))));
  const ids=[...html.matchAll(/<span id="([^"]+)">/g)].map(match=>match[1]);
  assert.equal(new Set(ids).size,2);
  for(const id of ids)assert.ok(html.includes(`aria-labelledby="${id}"`));
  assert.match(html,/aria-describedby="existing-note [^"]+-hint"/);
});
