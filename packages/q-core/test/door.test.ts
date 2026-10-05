import { test } from 'node:test';
import assert from 'node:assert/strict';
import { identityFromSeed, signerFor } from '../src/passkey';
import { requestLink, approveLink, unlinkKey } from '../src/links';
import { givePass, takePass, passList, isLetIn, OPENING_SOON } from '../src/door';

const seed = (n: number) => new Uint8Array(32).fill(n);
const HOST = 'did:key:z6MkHost';
const DAY = 86_400_000;

test('the root is let in; a stranger is told the door is opening soon', async () => {
	const root = await identityFromSeed(seed(1));
	const tess = await identityFromSeed(seed(2));
	assert.deepEqual(await isLetIn(root.did, { root: root.did, host: HOST, mode: 'test' }), { in: true, as: 'root' });
	assert.deepEqual(await isLetIn(tess.did, { root: root.did, host: HOST, mode: 'test' }), { in: false, says: OPENING_SOON });
});

test('going live opens the door to everyone', async () => {
	const root = await identityFromSeed(seed(1));
	const tess = await identityFromSeed(seed(2));
	assert.deepEqual(await isLetIn(tess.did, { root: root.did, host: HOST, mode: 'live' }), { in: true, as: 'open' });
});

test('a key linked to the root comes in; once unlinked it does not', async () => {
	const root = await identityFromSeed(seed(1));
	const site = await identityFromSeed(seed(3));
	const link = await approveLink(signerFor(root), await requestLink(signerFor(site), root.did, 'inqbeta.com'));
	assert.equal((await isLetIn(site.did, { root: root.did, host: HOST, mode: 'test', links: [link] })).in, true);
	const later = Date.now() + 1000;
	const un = await unlinkKey(signerFor(root), link);
	const after = await isLetIn(site.did, { root: root.did, host: HOST, mode: 'test', links: [link, un], now: later });
	assert.equal(after.in, false);
});

test('a key linked to someone else is not let in', async () => {
	const root = await identityFromSeed(seed(1));
	const other = await identityFromSeed(seed(4));
	const site = await identityFromSeed(seed(3));
	const link = await approveLink(signerFor(other), await requestLink(signerFor(site), other.did, 'elsewhere'));
	assert.equal((await isLetIn(site.did, { root: root.did, host: HOST, mode: 'test', links: [link] })).in, false);
});

test('a pass lets Tess in for 30 days, then it runs out', async () => {
	const root = await identityFromSeed(seed(1));
	const tess = await identityFromSeed(seed(2));
	const now = Date.parse('2026-10-05T12:00:00Z');
	const pass = await givePass(root, { host: HOST, holder: tess.did, now });
	const inside = await isLetIn(tess.did, { root: root.did, host: HOST, mode: 'test', passes: [pass], now: now + 29 * DAY });
	assert.equal(inside.in, true);
	assert.equal(inside.in && inside.as, 'pass');
	const outside = await isLetIn(tess.did, { root: root.did, host: HOST, mode: 'test', passes: [pass], now: now + 31 * DAY });
	assert.equal(outside.in, false);
});

test('a pass taken back shuts the door; a newer pass opens it again', async () => {
	const root = await identityFromSeed(seed(1));
	const tess = await identityFromSeed(seed(2));
	const t0 = Date.parse('2026-10-05T12:00:00Z');
	const given = await givePass(root, { host: HOST, holder: tess.did, now: t0 });
	const taken = await takePass(root, { host: HOST, holder: tess.did, now: t0 + DAY });
	const at = t0 + 2 * DAY;
	assert.equal((await isLetIn(tess.did, { root: root.did, host: HOST, mode: 'test', passes: [given, taken], now: at })).in, false);
	const again = await givePass(root, { host: HOST, holder: tess.did, now: t0 + 3 * DAY });
	assert.equal((await isLetIn(tess.did, { root: root.did, host: HOST, mode: 'test', passes: [taken, given, again], now: t0 + 4 * DAY })).in, true);
});

test('a pass signed by anyone but the root, for another host, or altered, counts for nothing', async () => {
	const root = await identityFromSeed(seed(1));
	const tess = await identityFromSeed(seed(2));
	const mallory = await identityFromSeed(seed(5));
	const self = await givePass(mallory, { host: HOST, holder: tess.did });
	const elsewhere = await givePass(root, { host: 'did:key:z6MkOther', holder: tess.did });
	const altered = structuredClone(await givePass(root, { host: HOST, holder: mallory.did }));
	(altered.content as { holder: string }).holder = tess.did;
	const o = { root: root.did, host: HOST, mode: 'test' as const, passes: [self, elsewhere, altered] };
	assert.equal((await isLetIn(tess.did, o)).in, false);
	assert.equal((await passList(o.passes, o)).size, 0);
});

test('nonsense for a DID is refused, not thrown', async () => {
	const root = await identityFromSeed(seed(1));
	assert.equal((await isLetIn('not a did', { root: root.did, host: HOST, mode: 'test' })).in, false);
});
