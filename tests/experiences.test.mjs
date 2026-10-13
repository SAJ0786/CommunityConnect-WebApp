import test from 'node:test';
import assert from 'node:assert/strict';
import { getExperience, readExperience, saveExperience } from '../src/config/experiences.mjs';

test('each experience has its own post-login destination', () => {
  assert.equal(getExperience('events').page, 'home');
  assert.equal(getExperience('businesses').page, 'businesses');
  assert.equal(getExperience('unknown').page, 'home');
});
test('the selected experience survives refresh in this browser tab', () => {
  const data = new Map();
  const storage = { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) };
  assert.equal(readExperience(storage), 'events');
  saveExperience(storage, 'businesses');
  assert.equal(getExperience(readExperience(storage)).page, 'businesses');
  saveExperience(storage, 'events');
  assert.equal(readExperience(storage), 'events');
});
test('unavailable storage does not stop experience selection', () => {
  const storage = { getItem() { throw Error('disabled'); }, setItem() { throw Error('disabled'); } };
  assert.equal(readExperience(storage), 'events');
  assert.equal(saveExperience(storage, 'businesses').page, 'businesses');
});
