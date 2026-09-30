/*
 * ADR-Q-005 step 5: the recovery card signs you in as the same DID.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addWay, formatRecoveryKey, newRecoveryKey } from '../src/continuity';
import { current, forget, identityFromSeed } from '../src/passkey';
import { recoverWithCard } from '../src/ways-back-in';

test('the card, typed as a person would, signs in as the same DID', async () => {
	const seed = crypto.getRandomValues(new Uint8Array(32));
	const me = await identityFromSeed(seed);
	const key = newRecoveryKey();
	const card = await formatRecoveryKey(key);
	const env = await addWay(me, seed, null, key, { kind: 'recovery', label: 'Card' });

	const typed = card.toLowerCase().split('-').join('  ');
	const out = await recoverWithCard(env, typed);
	assert.ok(out.ok);
	assert.equal(out.recovered.identity.did, me.did);
	assert.equal(current()?.did, me.did);
	out.recovered.done();
	forget();
});

test('a wrong card signs nobody in', async () => {
	const seed = crypto.getRandomValues(new Uint8Array(32));
	const me = await identityFromSeed(seed);
	const env = await addWay(me, seed, null, newRecoveryKey(), { kind: 'recovery', label: 'Card' });
	const out = await recoverWithCard(env, await formatRecoveryKey(newRecoveryKey()));
	assert.equal(out.ok, false);
	assert.equal(current(), null);
});
