/*
 * The passkey's home domain. One root is the constant; Q may live anywhere
 * under it. Anywhere else, the browser's own exact-address rule stands.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { passkeyDomain, setPasskeyDomain } from '../src/passkey';

test('unset: every address keeps its own passkeys', () => {
	setPasskeyDomain(undefined);
	assert.equal(passkeyDomain('q.example.org'), undefined);
});

test('the root and anything under it share one passkey domain', () => {
	setPasskeyDomain('Example.org.');
	assert.equal(passkeyDomain('example.org'), 'example.org');
	assert.equal(passkeyDomain('q.example.org'), 'example.org');
	assert.equal(passkeyDomain('app.q.example.org'), 'example.org');
});

test('anywhere else is a test identity, never a borrowed root', () => {
	setPasskeyDomain('example.org');
	assert.equal(passkeyDomain('localhost'), undefined);
	assert.equal(passkeyDomain('q-abc.vercel.app'), undefined);
	assert.equal(passkeyDomain('notexample.org'), undefined, 'a lookalike is not under the root');
	setPasskeyDomain('');
});
