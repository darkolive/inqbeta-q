/*
 * ADR-Q-005: preserve what signs. A lost passkey is a lost carrier, not a lost DID.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	addWay,
	checkEnvelope,
	formatRecoveryKey,
	newRecoveryKey,
	openEnvelope,
	parseRecoveryKey,
	removeWay,
	signEnvelope,
	passkeyRole,
	wayInHandle,
	envelopeFits,
	keepEnvelope
} from '../src/continuity';
import { identityFromSeed } from '../src/passkey';

const rand = () => crypto.getRandomValues(new Uint8Array(32));

async function founded() {
	const seed = rand(); // today: the founding passkey's PRF output
	const me = await identityFromSeed(seed);
	return { seed, me };
}

test('a recovery key rebuilds the SAME DID the founding passkey made', async () => {
	const { seed, me } = await founded();
	const recovery = newRecoveryKey();
	const env = await addWay(me, seed, null, recovery, { kind: 'recovery', label: 'Recovery card' });
	const back = await openEnvelope(env, recovery, 'recovery');
	assert.ok(back.ok);
	assert.equal(back.identity.did, me.did);
});

test('a second passkey on another domain opens the same identity', async () => {
	const { seed, me } = await founded();
	const macbook = rand(); // a different passkey's PRF output, on q.darkolive.co.uk
	const env = await addWay(me, seed, null, macbook, { kind: 'passkey', label: 'MacBook', rpId: 'q.darkolive.co.uk' });
	const back = await openEnvelope(env, macbook, 'passkey');
	assert.ok(back.ok);
	assert.equal(back.identity.did, me.did);
	assert.equal(back.via.rpId, 'q.darkolive.co.uk');
});

test('a stranger’s passkey or key opens nothing', async () => {
	const { seed, me } = await founded();
	const env = await addWay(me, seed, null, rand(), { kind: 'passkey', label: 'MacBook' });
	assert.equal((await openEnvelope(env, rand(), 'passkey')).ok, false);
	assert.equal((await openEnvelope(env, rand(), 'recovery')).ok, false);
});

test('an envelope changed after signing is refused before anything is tried', async () => {
	const { seed, me } = await founded();
	const recovery = newRecoveryKey();
	const env = await addWay(me, seed, null, recovery, { kind: 'recovery', label: 'Card' });
	const relabelled = { ...env, wraps: env.wraps.map((w) => ({ ...w, label: 'Something else' })) };
	assert.equal((await checkEnvelope(relabelled)).ok, false);
	assert.equal((await openEnvelope(relabelled, recovery, 'recovery')).ok, false);
});

test('a wrap lifted onto someone else’s envelope does not open', async () => {
	const a = await founded();
	const b = await founded();
	const recovery = newRecoveryKey();
	const envA = await addWay(a.me, a.seed, null, recovery, { kind: 'recovery', label: 'Card' });
	/* B signs an envelope carrying A's wrap: the signature holds, the wrap's
	 * additional data names A's DID, so it will not open as B. */
	const envB = await signEnvelope(b.me, envA.wraps);
	assert.equal((await checkEnvelope(envB)).ok, true);
	assert.equal((await openEnvelope(envB, recovery, 'recovery')).ok, false);
});

test('two worlds are two identities: a personal key opens nothing of the business', async () => {
	const personal = await founded();
	const business = await founded();
	assert.notEqual(personal.me.did, business.me.did);
	const pKey = newRecoveryKey();
	const bEnv = await addWay(business.me, business.seed, null, newRecoveryKey(), { kind: 'recovery', label: 'Business card' });
	assert.equal((await openEnvelope(bEnv, pKey, 'recovery')).ok, false);
});

test('the last way in cannot be removed; others can', async () => {
	const { seed, me } = await founded();
	let env = await addWay(me, seed, null, rand(), { kind: 'passkey', label: 'MacBook' });
	await assert.rejects(() => removeWay(me, env, 0), /last way back in/);
	env = await addWay(me, seed, env, newRecoveryKey(), { kind: 'recovery', label: 'Card' });
	env = await removeWay(me, env, 0);
	assert.equal(env.wraps.length, 1);
	assert.equal((await checkEnvelope(env)).ok, true);
});

test('a way cannot be added with a seed that is not this identity’s', async () => {
	const { me } = await founded();
	await assert.rejects(() => addWay(me, rand(), null, rand(), { kind: 'recovery', label: 'x' }), /not this identity/);
});

test('the recovery card reads back exactly, forgives case and spacing, and catches a typo', async () => {
	const key = newRecoveryKey();
	const card = await formatRecoveryKey(key);
	assert.equal(card.split('-').length, 11);
	const back = await parseRecoveryKey(card.toLowerCase().replace(/-/g, ' '));
	assert.ok(back.ok);
	assert.deepEqual([...back.key], [...key]);
	const i = card.search(/[0-9A-Z]/);
	const typo = card.slice(0, i) + (card[i] === 'A' ? 'B' : 'A') + card.slice(i + 1);
	assert.equal((await parseRecoveryKey(typo)).ok, false);
	assert.equal((await parseRecoveryKey(card.slice(0, 20))).ok, false);
});

test('a first-time person is untouched: a new passkey with a random handle is founding', () => {
	/* How "Create" makes a passkey today, and every passkey made before ADR-Q-005. */
	assert.equal(passkeyRole(crypto.getRandomValues(new Uint8Array(16))).role, 'founding');
	assert.equal(passkeyRole(null).role, 'founding');
	/* Even 35 random bytes are founding unless they carry the mark. */
	assert.equal(passkeyRole(crypto.getRandomValues(new Uint8Array(35))).role, 'founding');
});

test('a passkey made as a way in knows which envelope it needs, and no other fits', async () => {
	const a = await founded();
	const b = await founded();
	const role = passkeyRole(await wayInHandle(a.me.did));
	assert.equal(role.role, 'way-in');
	assert.equal(await envelopeFits({ did: a.me.did }, role), true);
	assert.equal(await envelopeFits({ did: b.me.did }, role), false);
	assert.equal(await envelopeFits({ did: a.me.did }, { role: 'founding' }), false);
});

test('an older backup never brings back a way in that was taken out', async () => {
	const { seed, me } = await founded();
	const older = await addWay(me, seed, null, rand(), { kind: 'passkey', label: 'Lost phone' });
	await new Promise((r) => setTimeout(r, 5));
	const withCard = await addWay(me, seed, older, newRecoveryKey(), { kind: 'recovery', label: 'Card' });
	await new Promise((r) => setTimeout(r, 5));
	const newer = await removeWay(me, withCard, 0); // the lost phone taken out
	assert.equal(await keepEnvelope(newer, older, me.did), 'existing');
	assert.equal(await keepEnvelope(older, newer, me.did), 'incoming');
	assert.equal(await keepEnvelope(null, older, me.did), 'incoming');
	const stranger = await founded();
	const theirs = await addWay(stranger.me, stranger.seed, null, rand(), { kind: 'passkey', label: 'x' });
	assert.equal(await keepEnvelope(null, theirs, me.did), 'existing');
});

test('ways back in are counted by fate, weakest said first', async () => {
	const { waysStanding } = await import('../src/continuity');
	assert.equal(waysStanding(null).level, 'danger');
	const { seed, me } = await founded();
	const phone = await addWay(me, seed, null, rand(), { kind: 'passkey', label: 'Q — My iPhone' });
	assert.equal(waysStanding(phone).level, 'warn');
	const withCard = await addWay(me, seed, phone, newRecoveryKey(), { kind: 'recovery', label: 'Card' });
	assert.equal(waysStanding(withCard).level, 'fine');
	const withKey = await addWay(me, seed, phone, rand(), { kind: 'passkey', label: 'YubiKey', carrier: 'security-key' });
	assert.equal(waysStanding(withKey).level, 'fine');
});
