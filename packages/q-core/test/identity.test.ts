import { test } from 'node:test';
import assert from 'node:assert/strict';
import { identityFromSeed, signerFor, openerFor } from '../src/passkey';
import { toDid, publicKeyFrom, x25519PublicFromEd25519 } from '../src/did';
import { sealTo, openWith, isSealedToPeople } from '../src/seal';
import { canonical, sha256, unb64url } from '../src/canonical';

const seedA = new Uint8Array(32).map((_, i) => i + 1);
const seedB = new Uint8Array(32).map((_, i) => 200 - i);

test('the same secret gives the same identity, every time', async () => {
	const a1 = await identityFromSeed(seedA);
	const a2 = await identityFromSeed(seedA.slice());
	const b = await identityFromSeed(seedB);
	assert.equal(a1.did, a2.did);
	assert.notEqual(a1.did, b.did);
	assert.match(a1.did, /^did:key:z6Mk/);
	assert.equal(seedA[0], 1, 'the caller’s seed is left alone');
});

test('the DID and the receipt key are one key spelled two ways', async () => {
	const a = await identityFromSeed(seedA);
	assert.equal(toDid(a.publicKey), a.did);
	assert.equal(toDid(a.did), a.did);
	assert.throws(() => publicKeyFrom('did:key:zNotAKey'));
});

test('the X25519 key worked out from the DID matches the one the passkey rebuilds', async () => {
	const a = await identityFromSeed(seedA);
	const fromDid = x25519PublicFromEd25519(publicKeyFrom(a.did));
	const probe = (await crypto.subtle.generateKey({ name: 'X25519' }, true, ['deriveBits'])) as CryptoKeyPair;
	const theirs = await crypto.subtle.importKey('raw', fromDid, { name: 'X25519' }, false, []);
	const s1 = new Uint8Array(await crypto.subtle.deriveBits({ name: 'X25519', public: theirs }, probe.privateKey, 256));
	const s2 = new Uint8Array(await crypto.subtle.deriveBits({ name: 'X25519', public: probe.publicKey }, a.opening, 256));
	assert.deepEqual(s1, s2);
});

test('a signer signs canonical(document), and it verifies against the DID', async () => {
	const a = await identityFromSeed(seedA);
	const doc = { b: 2, a: [1, { d: 4, c: 3 }] };
	const sig = await signerFor(a).signCanonical(doc);
	const key = await crypto.subtle.importKey('raw', publicKeyFrom(a.did), { name: 'Ed25519' }, false, ['verify']);
	assert.ok(await crypto.subtle.verify({ name: 'Ed25519' }, key, unb64url(sig), new TextEncoder().encode(canonical(doc))));
	assert.ok(!(await crypto.subtle.verify({ name: 'Ed25519' }, key, unb64url(sig), new TextEncoder().encode(canonical({ ...doc, b: 3 })))));
});

test('sealed to two people: both open it, a stranger and a forged entry do not', async () => {
	const a = await identityFromSeed(seedA);
	const b = await identityFromSeed(seedB);
	const stranger = await identityFromSeed(new Uint8Array(32).fill(7));
	const note = { note: 'Only the reviewer should read this.' };
	const { sealed, contentHash } = await sealTo(note, [b.did, a.publicKey], 'the reviewer and the author');
	assert.equal(contentHash, await sha256(canonical(note)));
	assert.ok(isSealedToPeople(sealed));
	assert.equal(sealed.recipients.length, 2);
	assert.ok(!JSON.stringify(sealed).includes('Only the reviewer'));

	for (const who of [a, b]) {
		const r = await openerFor(who).open(sealed);
		assert.ok(r.ok);
		if (r.ok) assert.deepEqual(r.body, note);
	}
	const no = await openWith(sealed, stranger);
	assert.ok(!no.ok);
	assert.match(no.says, /not one of the 2/);

	const forged = structuredClone(sealed);
	forged.recipients.push({ ...forged.recipients[0], did: stranger.did });
	assert.ok(!(await openWith(forged, stranger)).ok);
});

test('the signing key the page keeps cannot be exported', async () => {
	const a = await identityFromSeed(seedA);
	assert.equal(a.signing.privateKey.extractable, false);
	await assert.rejects(crypto.subtle.exportKey('jwk', a.signing.privateKey));
});

test('a kept session carries on for 30 quiet minutes, 12 hours at most, and never from the future', async () => {
	const { sessionStillGood, SESSION_IDLE_MS, SESSION_MAX_MS } = await import('../src/passkey');
	const now = Date.parse('2026-09-25T18:00:00Z');
	assert.equal(sessionStillGood(null, now), false);
	assert.equal(sessionStillGood({ since: now - 1000, seen: now - 1000 }, now), true);
	assert.equal(sessionStillGood({ since: now - 60_000, seen: now - SESSION_IDLE_MS - 1 }, now), false);
	assert.equal(sessionStillGood({ since: now - SESSION_MAX_MS - 1, seen: now - 1000 }, now), false);
	assert.equal(sessionStillGood({ since: now, seen: now + 10 * 60_000 }, now), false);
});
