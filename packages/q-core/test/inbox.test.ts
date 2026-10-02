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
