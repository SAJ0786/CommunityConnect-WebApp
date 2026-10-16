import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import React from 'react';
import Renderer, { act } from 'react-test-renderer';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outfile = path.join(root, '.qa-registration-stream-renderer.cjs');
await build({
  stdin:{ contents:"export { GoLiveButton } from './src/components/LiveStream.jsx'; export { default as StreamCard } from './src/pages/StreamCard.jsx';", resolveDir:root, loader:'jsx' },
  outfile, bundle:true, platform:'node', format:'cjs', loader:{ '.css':'empty' },
  plugins:[{ name:'offline-stream-test', setup(builder) {
    builder.onResolve({ filter:/^react$/ }, () => ({ path:require.resolve('react'), external:true }));
    const modules = {
      'firebase/functions':"export const httpsCallable=(_functions,name)=>async data=>{const state=globalThis.__streamTest;state.calls.push([name,data]);return {data:await state.call(name,data)};};",
      'firebase/firestore':"export const doc=()=>({});export const serverTimestamp=()=>0;export const updateDoc=async()=>{globalThis.__streamTest.direct.push('updateDoc');};",
      config:"export const functions={};export const db={};",
      events:"export const goLive=async()=>{globalThis.__streamTest.direct.push('goLive');};export const endLive=async()=>{globalThis.__streamTest.direct.push('endLive');};",
      native:"export class NativeStreamer {}",
      precheck:"import React from 'react';export default function PreCheck({onConfirm}){return React.createElement('button',{onClick:()=>onConfirm(globalThis.__streamTest.streamer)},'Confirm synthetic camera');}",
    };
    builder.onResolve({ filter:/^firebase\/(functions|firestore)$/ }, args => ({ path:args.path, namespace:'stream-test' }));
    builder.onResolve({ filter:/firebase[\\/]firebase$/ }, () => ({ path:'config', namespace:'stream-test' }));
    builder.onResolve({ filter:/services[\\/]eventService$/ }, () => ({ path:'events', namespace:'stream-test' }));
    builder.onResolve({ filter:/nativeStreamService$/ }, () => ({ path:'native', namespace:'stream-test' }));
    builder.onResolve({ filter:/PreCheckCard$/ }, () => ({ path:'precheck', namespace:'stream-test' }));
    builder.onLoad({ filter:/.*/, namespace:'stream-test' }, args => ({ contents:modules[args.path], loader:'js' }));
  } }],
});
const { GoLiveButton, StreamCard } = require(outfile);
globalThis.window = { innerWidth:1440, innerHeight:850, addEventListener(){}, removeEventListener(){} };
const event = { id:'registration', registrationOnly:true, status:'approved', eventType:'Workshop', eventSubject:'Public workshop' };
const text = node => typeof node === 'string' ? node : (node?.children || []).map(text).join('');
async function click(view, match) {
  const node = view.root.findAllByType('button').find(node => typeof match === 'string' ? text(node) === match : match.test(text(node)));
  assert.ok(node, `Missing button ${match}`); assert.ok(!node.props.disabled);
  await act(async () => { await node.props.onClick?.({ preventDefault(){} }); });
}
function fixture() {
  const state = { calls:[], direct:[], started:[], ended:[], failEnd:false,
    streamer:{ async connect(){}, async startRecording(){}, stop(){} },
    async call(name) {
      if (state.failEnd && name === 'endExternalYouTubeStream') throw Error('Synthetic backend unavailable');
      return { sessionId:'synthetic-session', wsUrl:'wss://example.invalid', streamToken:'synthetic-token',
        watchUrl:'https://www.youtube.com/watch?v=abcdefghijk', broadcastStatus:'live' };
    },
  };
  globalThis.__streamTest = state;
  return state;
}
async function mount(Component, props) {
  let view;
  await act(async () => { view = Renderer.create(React.createElement(Component, props)); });
  return view;
}

test('actual registration Go Live submits native collection identity without legacy writes or notifications', async () => {
  const state = fixture();
  const view = await mount(GoLiveButton, { event, onLiveStarted:(...args) => state.started.push(args) });
  await click(view, /Go Live$/);
  await click(view, 'Stream from this device');
  await click(view, 'Confirm synthetic camera');
  const start = state.calls.find(([name]) => name === 'nativeStreamStart');
  assert.equal(start[1].eventCollection, 'registrationEvents');
  assert.equal(state.started[0][0].registrationOnly, true);
  assert.equal(state.started[0][0].isLive, true);
  assert.equal(state.started[0][0].liveUrl, 'synthetic-session');
  assert.deepEqual(state.direct, []);
  assert.equal(state.calls.some(([name]) => ['notifyEventLive', 'sendPrivateStreamLinkEmail'].includes(name)), false);
  await act(async () => view.unmount());
});

test('external unlisted registration start and reopened management use exact authorised URLs', async () => {
  const state = fixture();
  const view = await mount(GoLiveButton, { event, onLiveStarted:(...args) => state.started.push(args) });
  await click(view, /Go Live$/);
  await act(async () => { view.root.findAllByType('input').find(node => node.props.value === 'unlisted').props.onChange(); });
  await click(view, 'Use another device');
  await act(async () => {
    view.root.findByProps({ id:'external-youtube-url' }).props.onChange({ target:{ value:'https://youtu.be/abcdefghijk' } });
  });
  await act(async () => { await view.root.findByType('form').props.onSubmit({ preventDefault(){} }); });
  const start = state.calls.find(([name]) => name === 'startExternalYouTubeStream');
  assert.equal(start[1].eventCollection, 'registrationEvents');
  assert.equal(start[1].privacyStatus, 'unlisted');
  assert.equal(state.started[0][0].liveWatchUrl, null);
  assert.equal(state.calls.some(([name]) => name === 'notifyEventLive'), false);
  await act(async () => view.unmount());
  const reopened = await mount(GoLiveButton, { event:{ ...event, isLive:true, liveSource:'external-youtube', liveAppVisibility:'private' },
    onLiveStarted:(...args) => state.started.push(args) });
  await click(reopened, 'Manage Live');
  assert.equal(state.calls.at(-1)[0], 'getEventStream');
  assert.equal(state.calls.at(-1)[1].eventCollection, 'registrationEvents');
  assert.equal(state.started.at(-1)[4].watchUrl, 'https://www.youtube.com/watch?v=abcdefghijk');
  await act(async () => reopened.unmount());
});

test('registration stream-end failure remains retryable and never falls back to legacy event writes', async () => {
  const state = fixture(); state.failEnd = true;
  const view = await mount(StreamCard, { event, role:'host', nativeStream:{ mode:'external', watchUrl:'https://youtu.be/abcdefghijk' },
    onEnded:id => state.ended.push(id) });
  await click(view, /End Stream$/); await click(view, 'Yes, End Stream');
  assert.equal(state.calls.at(-1)[1].eventCollection, 'registrationEvents');
  assert.deepEqual(state.direct, []);
  assert.deepEqual(state.ended, []);
  assert.match(text(view.root.findByProps({ role:'alert' })), /Retry End Stream/);
  state.failEnd = false;
  await click(view, /End Stream$/); await click(view, 'Yes, End Stream');
  assert.deepEqual(state.ended, ['registration']);
  await act(async () => view.unmount());
});
