/* Drops: a card shared by a short link, locked in the storage unit. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { identityFromSeed } from '../src/passkey';
import { sealWith } from '../src/seal';
import { lockForLink, unlockFromLink, makeDrop } from '../src/drop';

const seed = (n: number) => new Uint8Array(32).fill(n);

test('a card is locked, dropped, checked by the gate, and opened only with the key from the link', async () => {
	// @ts-expect-error — plain JS, no types
	const { checkDrop } = await import('../../../node/gate/server.mjs');
	const me = await identityFromSeed(seed(3));
	const card = await sealWith(me, { schema: 'inqbeta.card-link/1', name: 'Personal', details: { 'q:person/called': 'Darren', 'q:person/cover': 'data:image/jpeg;base64,' + 'A'.repeat(200_000) }, at: new Date().toISOString() });
	const { box, key } = await lockForLink(card);
	assert.ok(!box.ct.includes('Darren'), 'the storage unit sees no name');
	const drop = await makeDrop(me, box);
	assert.equal(await checkDrop(drop), null);

	/* Opened with the key: the very same signed card, full cover and all. */
	assert.deepEqual(await unlockFromLink(box, key), JSON.parse(JSON.stringify(card)));
	/* The wrong key opens nothing. */
	const other = await lockForLink({});
	await assert.rejects(unlockFromLink(box, other.key));
});

test('the gate refuses a drop nobody signed for, one that was changed, and one kept too long', async () => {
	// @ts-expect-error — plain JS, no types
	const { checkDrop } = await import('../../../node/gate/server.mjs');
	const me = await identityFromSeed(seed(3));
	const { box } = await lockForLink({ hello: 1 });
	const drop = await makeDrop(me, box);
	assert.ok(await checkDrop({ ...drop, signature: drop.signature.replace(/^./, (c: string) => (c === 'A' ? 'B' : 'A')) }));
	assert.ok(await checkDrop({ ...drop, content: { ...(drop.content as object), until: new Date(Date.now() + 90 * 86400000).toISOString() } }));
	const old = await makeDrop(me, box, 1, new Date('2020-01-01'));
	assert.ok(await checkDrop(old));
});

test('a shared card opens for one person only: the first to claim it, or whoever made it', async () => {
	// @ts-expect-error — plain JS, no types
	const { checkClaim, mayOpen } = await import('../../../node/gate/server.mjs');
	const maker = await identityFromSeed(seed(3));
	const friend = await identityFromSeed(seed(9));
	const stranger = await identityFromSeed(seed(10));
	const { box } = await lockForLink({ hello: 1 });
	const drop = await makeDrop(maker, box);
	const claimBy = (who: typeof friend, at = new Date()) => sealWith(who, { schema: 'inqbeta.drop-claim/1', source: 'inqbeta:q/drop-claim', drop: 'abcdefghijklmnop', at: at.toISOString() });

	assert.equal(await checkClaim(await claimBy(friend), 'abcdefghijklmnop'), friend.did);
	assert.equal(await checkClaim(await claimBy(friend), 'someotherdropid1'), null, 'a claim for a different drop');
	assert.equal(await checkClaim(await claimBy(friend, new Date(Date.now() - 3600000)), 'abcdefghijklmnop'), null, 'an old claim can’t be replayed');

	assert.equal(mayOpen(drop, null).ok, false, 'signed out: nothing');
	assert.deepEqual(mayOpen(drop, friend.did), { ok: true, claim: true }, 'the first to open claims it');
	const claimed = { ...drop, claimedBy: friend.did };
	assert.deepEqual(mayOpen(claimed, friend.did), { ok: true });
	assert.equal(mayOpen(claimed, stranger.did).ok, false, 'a forwarded link opens nothing for anyone else');
	assert.deepEqual(mayOpen(claimed, maker.did), { ok: true }, 'the maker can always look');
});
