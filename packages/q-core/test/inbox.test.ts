/* Inboxes and posts: a message reaches someone through the storage, readable only by them. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { identityFromSeed } from '../src/passkey';
import { sealWith, sealTo, openWith, checkReceipt } from '../src/seal';
import { inboxOf, inboxIdFor, makePost, MESSAGE_SCHEMA } from '../src/inbox';

const seed = (n: number) => new Uint8Array(32).fill(n);

test('an inbox is the same on every device, and only its owner can make its key', async () => {
	const me = await identityFromSeed(seed(4));
	const again = await identityFromSeed(seed(4));
	const someone = await identityFromSeed(seed(5));
	const a = await inboxOf(me);
	assert.deepEqual(await inboxOf(again), a);
	assert.notEqual((await inboxOf(someone)).id, a.id);
	assert.equal(await inboxIdFor(a.key), a.id);
	assert.match(a.id, /^[A-Za-z0-9_-]{22}$/);
});

test('a message is posted, checked by the gate, and opened only by the person it is for', async () => {
	// @ts-expect-error — plain JS, no types
	const { checkPost, ownsInbox } = await import('../../../node/gate/server.mjs');
	const sam = await identityFromSeed(seed(6));
	const darren = await identityFromSeed(seed(7));
	const box = await inboxOf(darren);
	const msg = await sealWith(sam, { schema: MESSAGE_SCHEMA, source: 'inqbeta:q/message', kind: 'message', to: darren.did, text: 'Lunch on Friday?', at: new Date().toISOString() });
	const { sealed } = await sealTo(msg, [darren.did], 'message');
	const post = await makePost(sam, box.id, sealed);
	assert.equal(await checkPost(post, box.id), null);
	assert.ok(await checkPost(post, (await inboxOf(sam)).id), 'posted to a different inbox');
	assert.ok(!JSON.stringify(post).includes('Lunch'), 'the storage sees no words');

	assert.equal(await ownsInbox(box.id, box.key), true);
	assert.equal(await ownsInbox(box.id, (await inboxOf(sam)).key), false);

	const opened = await openWith(sealed, { did: darren.did, opening: darren.opening });
	assert.ok(opened.ok);
	const back = opened.ok ? opened.body : null;
	assert.equal((await checkReceipt(back)).ok, true);
	assert.equal((back as { content: { text: string } }).content.text, 'Lunch on Friday?');
	assert.equal((await openWith(sealed, { did: sam.did, opening: sam.opening })).ok, false, 'not even the sender can open the sealed copy');
});

test('a voice message is compressed before sealing: smaller, still checked, and old seals still open', async () => {
	// @ts-expect-error — plain JS, no types
	const { checkPost } = await import('../../../node/gate/server.mjs');
	const sam = await identityFromSeed(seed(8));
	const darren = await identityFromSeed(seed(9));
	const box = await inboxOf(darren);
	/* Random bytes, like real audio: they don't compress, only their base64 does. */
	const bytes = crypto.getRandomValues(new Uint8Array(60_000));
	const audio = `data:audio/webm;codecs=opus;base64,${Buffer.from(bytes).toString('base64')}`;
	const msg = await sealWith(sam, { schema: MESSAGE_SCHEMA, source: 'inqbeta:q/message', kind: 'voicemail', to: darren.did, audio, seconds: 10, at: new Date().toISOString() });

	const plain = await sealTo(msg, [darren.did], 'message');
	const zipped = await sealTo(msg, [darren.did], 'message', { zip: true });
	assert.equal(zipped.sealed.zip, 'gzip');
	assert.equal(zipped.contentHash, plain.contentHash, 'sealing never changes what was signed');
	const saved = 1 - zipped.sealed.ciphertext.length / plain.sealed.ciphertext.length;
	assert.ok(saved > 0.2, `about a quarter smaller (saved ${Math.round(saved * 100)}%)`);
	assert.equal(await checkPost(await makePost(sam, box.id, zipped.sealed), box.id), null, 'the gate takes it');

	for (const s of [zipped.sealed, plain.sealed]) {
		const opened = await openWith(s, { did: darren.did, opening: darren.opening });
		assert.ok(opened.ok);
		const back = opened.ok ? (opened.body as { content: { audio: string } }) : null;
		assert.equal(back?.content.audio, audio);
		assert.equal((await checkReceipt(back)).ok, true);
	}
});

test('the free allowance: a day’s sending through storage is capped, and starts again tomorrow', async () => {
	// @ts-expect-error — plain JS, no types
	const { fitsToday, TERMS } = await import('../../../node/gate/server.mjs');
	const terms = { ...TERMS, sendBytesPerDay: 1000 };
	const day = Date.parse('2026-10-02T10:00:00Z');
	assert.equal(fitsToday('did:key:zAllowance', 600, day, terms), true);
	assert.equal(fitsToday('did:key:zAllowance', 600, day, terms), false, 'over the day’s amount');
	assert.equal(fitsToday('did:key:zSomeoneElse', 600, day, terms), true, 'each person has their own');
	assert.equal(fitsToday('did:key:zAllowance', 600, day + 86400000, terms), true, 'a new day');
	assert.equal(TERMS.schema, 'inqbeta.storage-terms/1');
});
