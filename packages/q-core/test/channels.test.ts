import { test } from 'node:test';
import assert from 'node:assert/strict';
import { identityFromSeed, signerFor } from '../src/passkey';
import { publicKeyFrom } from '../src/did';
import { canonical, b64url, unb64url } from '../src/canonical';
import {
	addressHash,
	buildChannel,
	checkChannelProof,
	proofDoc,
	channelHash,
	isVerifiedChannel,
	matchesAddress,
	newestPerChannel,
	normaliseAddress,
	openChannelAddress
} from '../src/channels';

const mine = new Uint8Array(32).map((_, i) => i * 7 + 1);
const service = new Uint8Array(32).map((_, i) => i * 11 + 3);
const stranger = new Uint8Array(32).fill(4);

test('one address written many ways is one channel', async () => {
	assert.equal(normaliseAddress('email', '  Darren@DarkOlive.co.UK '), 'darren@darkolive.co.uk');
	assert.equal(normaliseAddress('sms', '+44 (0)7700 900 123'), '+4407700900123');
	assert.equal(normaliseAddress('sms', '07700-900-123'), '07700900123');

	const me = await identityFromSeed(mine);
	const a = await channelHash(me.did, 'email', 'Darren@DarkOlive.co.uk');
	const b = await channelHash(me.did, 'email', ' darren@darkolive.co.uk ');
	assert.equal(a, b);
});

test('the same address under another identity is another channel', async () => {
	const me = await identityFromSeed(mine);
	const them = await identityFromSeed(stranger);
	const a = await channelHash(me.did, 'email', 'darren@darkolive.co.uk');
	const b = await channelHash(them.did, 'email', 'darren@darkolive.co.uk');
	assert.notEqual(a, b);
});

test('the receipt says nothing in the clear, and the hash checks an address without giving one', async () => {
	const me = await identityFromSeed(mine);
	const svc = await identityFromSeed(service);
	const channel = await buildChannel({
		did: me.did,
		kind: 'email',
		address: 'darren@darkolive.co.uk',
		uses: ['sign-in'],
		serviceDid: svc.did
	});

	const asText = JSON.stringify(channel);
	for (const leak of ['darren@', 'darkolive.co.uk', 'DarkOlive']) assert.ok(!asText.includes(leak), leak);

	assert.ok(isVerifiedChannel(channel));
	assert.equal(channel.id, channel.hash.slice(0, 16));
	assert.ok(await matchesAddress(channel, 'DARREN@darkolive.co.uk'));
	assert.ok(!(await matchesAddress(channel, 'someone@else.com')));
});

test('both the owner and the service open it; nobody else does', async () => {
	const me = await identityFromSeed(mine);
	const svc = await identityFromSeed(service);
	const them = await identityFromSeed(stranger);
	const channel = await buildChannel({
		did: me.did,
		kind: 'email',
		address: 'darren@darkolive.co.uk',
		uses: ['sign-in', 'notify'],
		serviceDid: svc.did
	});

	assert.equal(await openChannelAddress(channel, me), 'darren@darkolive.co.uk');
	assert.equal(await openChannelAddress(channel, svc), 'darren@darkolive.co.uk');
	assert.equal(await openChannelAddress(channel, them), null);
	assert.deepEqual(channel.openableBy, [me.did, svc.did]);
});

test('without a service key, only the owner opens it — and nothing can be sent while signed out', async () => {
	const me = await identityFromSeed(mine);
	const svc = await identityFromSeed(service);
	const channel = await buildChannel({
		did: me.did,
		kind: 'sms',
		address: '+44 7700 900123',
		uses: ['sign-in']
	});
	assert.deepEqual(channel.openableBy, [me.did]);
	assert.equal(await openChannelAddress(channel, me), '+447700900123');
	assert.equal(await openChannelAddress(channel, svc), null);
});

test('a hash swapped onto another channel does not pass', async () => {
	const me = await identityFromSeed(mine);
	const svc = await identityFromSeed(service);
	const real = await buildChannel({ did: me.did, kind: 'email', address: 'darren@darkolive.co.uk', uses: ['sign-in'], serviceDid: svc.did });
	const other = await buildChannel({ did: me.did, kind: 'email', address: 'someone@else.com', uses: ['sign-in'], serviceDid: svc.did });

	/* The seal still opens — it was sealed to this key — but the address inside
	 * is not the one this receipt claims, so the channel is refused. */
	const forged = { ...real, address: other.address };
	assert.equal(await openChannelAddress(forged, svc), null);
});

test('the newest verification of each channel wins', async () => {
	const me = await identityFromSeed(mine);
	const svc = await identityFromSeed(service);
	const old = await buildChannel({ did: me.did, kind: 'email', address: 'darren@darkolive.co.uk', uses: ['sign-in'], serviceDid: svc.did, verifiedAt: '2026-01-01T00:00:00.000Z' });
	const now = await buildChannel({ did: me.did, kind: 'email', address: 'darren@darkolive.co.uk', uses: ['sign-in', 'marketing'], serviceDid: svc.did, verifiedAt: '2026-09-19T00:00:00.000Z' });
	const sms = await buildChannel({ did: me.did, kind: 'sms', address: '+447700900123', uses: ['sign-in'], serviceDid: svc.did });

	const kept = newestPerChannel([old, now, sms]);
	assert.equal(kept.length, 2);
	assert.deepEqual(kept.find((c) => c.kind === 'email')?.uses, ['sign-in', 'marketing']);
});

test('the service attests to an identity AND an address, and to nothing it did not see', async () => {
	const me = await identityFromSeed(mine);
	const svc = await identityFromSeed(service);
	const them = await identityFromSeed(stranger);

	const hash = await addressHash('email', 'Darren@DarkOlive.co.uk');
	const verifiedAt = '2026-09-19T09:00:00.000Z';
	const sign = async (signer: typeof svc, did: string) =>
		b64url(
			await crypto.subtle.sign(
				{ name: 'Ed25519' },
				signer.signing.privateKey,
				new TextEncoder().encode(canonical(proofDoc(did, 'email', hash, verifiedAt)))
			)
		);

	const channel = await buildChannel({
		did: me.did,
		kind: 'email',
		address: 'darren@darkolive.co.uk',
		uses: ['sign-in'],
		serviceDid: svc.did,
		proof: { by: svc.did, did: me.did, addressHash: hash, verifiedAt, signature: await sign(svc, me.did) }
	});

	assert.equal(channel.verifiedAt, verifiedAt);
	assert.ok(await checkChannelProof(channel, 'darren@darkolive.co.uk'));
	assert.ok(!(await checkChannelProof(channel, 'someone@else.com')));

	/* Signed by someone who is not the service it names. */
	const forgedBy = { ...channel, proof: { ...channel.proof!, signature: await sign(them, me.did) } };
	assert.ok(!(await checkChannelProof(forgedBy, 'darren@darkolive.co.uk')));

	/* A proof lifted onto a channel about a different address. */
	const lifted = await buildChannel({
		did: me.did,
		kind: 'email',
		address: 'someone@else.com',
		uses: ['sign-in'],
		serviceDid: svc.did,
		proof: channel.proof
	});
	assert.ok(!(await checkChannelProof(lifted, 'someone@else.com')));

	/* A proof about one person, moved onto another person's channel. The
	 * signature is real; it simply is not about them. */
	const theirChannel = await buildChannel({
		did: them.did,
		kind: 'email',
		address: 'darren@darkolive.co.uk',
		uses: ['sign-in'],
		serviceDid: svc.did,
		proof: channel.proof
	});
	assert.ok(!(await checkChannelProof(theirChannel, 'darren@darkolive.co.uk')));
});

test('a claim and its confirmation are signed by the identity, or they are nothing', async () => {
	const me = await identityFromSeed(mine);
	const them = await identityFromSeed(stranger);

	/* Exactly the documents apps/q/src/routes/api/channels/* sign and check. */
	const at = '2026-09-19T10:00:00.000Z';
	const claimDoc = { act: 'channel.claim', did: me.did, kind: 'email', address: 'darren@darkolive.co.uk', at };
	const witness = b64url(new Uint8Array(32).map((_, i) => i * 5 + 2));
	const confirmDoc = { act: 'channel.confirm', did: me.did, witness };

	const check = async (did: string, doc: unknown, signature: string) => {
		try {
			const key = await crypto.subtle.importKey('raw', publicKeyFrom(did), { name: 'Ed25519' }, false, ['verify']);
			return await crypto.subtle.verify({ name: 'Ed25519' }, key, unb64url(signature), new TextEncoder().encode(canonical(doc)));
		} catch {
			return false;
		}
	};

	const claimSig = await signerFor(me).signCanonical(claimDoc);
	const confirmSig = await signerFor(me).signCanonical(confirmDoc);

	assert.ok(await check(me.did, claimDoc, claimSig));
	assert.ok(await check(me.did, confirmDoc, confirmSig));

	/* Someone else's DID on the same document. A DID is public; the signature is not. */
	assert.ok(!(await check(them.did, claimDoc, claimSig)));

	/* The same signature over a document that says something else — another
	 * address to send to, or another witness. */
	assert.ok(!(await check(me.did, { ...claimDoc, address: 'someone@else.com' }, claimSig)));
	assert.ok(!(await check(me.did, { ...confirmDoc, witness: b64url(new Uint8Array(32)) }, confirmSig)));

	/* A claim signature replayed as a confirmation, and the reverse. */
	assert.ok(!(await check(me.did, confirmDoc, claimSig)));
	assert.ok(!(await check(me.did, claimDoc, confirmSig)));
});
