import test from 'node:test';
import assert from 'node:assert/strict';
import {isTrustedFrame} from '../src/desktop/trust.mjs';
test('desktop bridge accepts only the trusted top-level app frame',()=>{
 assert.equal(isTrustedFrame('app://localhost/index.html',true),true);
 for(const [u,m]of [['https://evil.test',true],['app://localhost.evil',true],['app://localhost/index.html',false],['file:///index.html',true]])assert.equal(isTrustedFrame(u,m),false);
});
