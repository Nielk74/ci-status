import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {injectFixtureScript} from '../scripts/fixtures/inject-script.mjs';
test('native fixture embeds bundle text literally, including replacement tokens',()=>{
  const html=injectFixtureScript('<html><body><textarea></textarea></body></html>',"globalThis.value='$&';");
  const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];const context={};vm.runInNewContext(script,context);assert.equal(context.value,'$&');
  assert.match(html,/<textarea><\/textarea>/);
});
