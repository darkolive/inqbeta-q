/*
 * Checking a receipt.
 *
 * Every receipt Q has written has been signed, and until today nothing checked
 * one. These tests use real crypto, because a verifier asserted rather than
 * exercised is the same decoration as the signature it was meant to justify.
 *
 * The forgery that matters most is the cheap one: take somebody else's receipt,
 * swap in your own key, keep their DID. did:key is derived FROM the key, so
 * that is arithmetic to catch — and it is caught here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { identityFromSeed } from '../src/passkey';
import { sealWith, checkReceipt, whose } from '../src/seal';
import { canonical, sha256 } from '../src/canonical';

const seedOf = (n: number) => new Uint8Array(32).map((_, i) => (i * 7 + n) % 251);

async function sealedBy(n: number, content: object) {
	const me = await identityFromSeed(seedOf(n));
	return { receipt: await sealWith(me, content), me };
}

test('a receipt Q wrote checks out, with nothing outstanding', async () => {
	const { receipt } = await sealedBy(1, { source: 'inqbeta:answers/1', what: 'hello' });
	const c = await checkReceipt(receipt);
	assert.equal(c.ok, true);
	assert.equal(c.isWhoItSays, true);
	assert.equal(c.signatureHolds, true);
	assert.equal(c.hashMatches, true);
	assert.deepEqual(c.takenOnTrust, []);
	assert.match(c.says, /unchanged since/i);
});

test('changing a word after signing is caught', async () => {
	const { receipt } = await sealedBy(2, { source: 'x', amount: 100 });
	const tampered = { ...receipt, content: { source: 'x', amount: 1000 } };
	const c = await checkReceipt(tampered);
	assert.equal(c.ok, false);
	assert.match(c.says, /contents have changed/i);
});

test('the forgery that matters: somebody else’s name, your own key', async () => {
	const { receipt: mine } = await sealedBy(3, { source: 'x', claim: 'I am trustworthy' });
	const theirs = await identityFromSeed(seedOf(9));

	/* Wear their DID, keep my key and my signature. */
	const worn = { ...mine, did: theirs.did };
	const c = await checkReceipt(worn);
	assert.equal(c.ok, false);
	assert.equal(c.isWhoItSays, false);
	assert.match(c.says, /names one identity and carries another/i);
});

test('a signature from the wrong key does not hold', async () => {
	const { receipt } = await sealedBy(4, { source: 'x', a: 1 });
	const { receipt: other } = await sealedBy(5, { source: 'x', a: 1 });
	const swapped = { ...receipt, signature: other.signature };
	const c = await checkReceipt(swapped);
	assert.equal(c.ok, false);
	assert.equal(c.signatureHolds, false);
	assert.match(c.says, /was not written by that key/i);
});

test('a hash that matches a lie is still caught by the signature', async () => {
	const { receipt } = await sealedBy(6, { source: 'x', a: 1 });
	const content = { source: 'x', a: 2 };
	/* Recompute the hash so only the signature disagrees. */
	const forged = { ...receipt, content, contentHash: await sha256(canonical(content)) };
	const c = await checkReceipt(forged);
	assert.equal(c.hashMatches, true, 'the hash was made to agree');
	assert.equal(c.signatureHolds, false, 'and the signature still refuses');
	assert.equal(c.ok, false);
});

test('anything that is not a receipt is reported, never thrown', async () => {
	for (const junk of [null, 'hello', {}, { did: 'did:key:z1' }, { content: {} }]) {
		const c = await checkReceipt(junk);
		assert.equal(c.ok, false);
		assert.equal(c.says, 'This is not a receipt.');
	}
	/* And a signature made of nonsense fails rather than exploding. */
	const { receipt } = await sealedBy(7, { source: 'x' });
	const c = await checkReceipt({ ...receipt, signature: 'not base64url!!' });
	assert.equal(c.ok, false);
});

test('what a signature CANNOT reach is named, not quietly passed', async () => {
	/* present and verified are the signer's own word — the authenticator data
	 * that would prove them carries a hardware fingerprint, and assurance.ts
	 * refuses to let that travel. So the check says so. */
	const { receipt } = await sealedBy(8, { source: 'inqbeta:answers/1', held: 'verified' });
	const c = await checkReceipt(receipt);
	assert.equal(c.ok, true, 'the signature is still good');
	assert.deepEqual(c.takenOnTrust, ['that a fingerprint, face or PIN was given']);
	assert.match(c.says, /taken on their word/i);

	const { receipt: signed } = await sealedBy(8, { source: 'inqbeta:answers/1', held: 'signed' });
	assert.deepEqual((await checkReceipt(signed)).takenOnTrust, [], 'signed is checkable and claims nothing more');
});

/*
 * Whose it is.
 *
 * A folder holds three things that are not failures of each other: your own
 * receipts, ones somebody gave you, and ones that do not hold up. The rule
 * under test is the last: a receipt that fails is NEVER hidden. It is the one
 * a person most needs to see, and a folder that looks clean because the
 * evidence of it not being clean was swallowed is worse than no folder.
 */
test('yours, theirs, unsigned and broken are four different answers', async () => {
	const { receipt, me } = await sealedBy(11, { source: 'x', a: 1 });
	const check = await checkReceipt(receipt);

	assert.equal(whose(receipt, check, me.did).whose, 'yours');
	assert.equal(whose(receipt, check, 'did:key:zSomebodyElse').whose, 'theirs');
	assert.equal(whose(receipt, check, null).whose, 'theirs', 'signed in by nobody does not make it yours');

	const plain = { source: 'x', a: 1 };
	assert.equal(whose(plain, await checkReceipt(plain), me.did).whose, 'unsigned');
});

test('a broken receipt is reported as broken, whoever it claims to be from', async () => {
	const { receipt, me } = await sealedBy(12, { source: 'x', a: 1 });
	const tampered = { ...receipt, content: { source: 'x', a: 2 } };
	const check = await checkReceipt(tampered);

	/* Broken wins over yours: being signed in as the DID on a file that does
	 * not verify must not make it look like your own good receipt. */
	const mine = whose(tampered, check, me.did);
	assert.equal(mine.whose, 'broken');
	assert.match(mine.says, /contents have changed/i);
	assert.equal(whose(tampered, check, 'did:key:zOther').whose, 'broken');
});

test('an unsigned file says what it is without sounding like an error', async () => {
	const plain = { source: 'x' };
    const o = whose(plain, await checkReceipt(plain), null);
	assert.match(o.says, /readable, and that is all/i);
	assert.doesNotMatch(o.says, /fail|invalid|error|corrupt/i);
});
