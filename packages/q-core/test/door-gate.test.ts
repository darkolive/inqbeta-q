import { test } from 'node:test';
import assert from 'node:assert/strict';
import { identityFromSeed, signerFor } from '../src/passkey';
import { requestLink, approveLink, unlinkKey } from '../src/links';
import { givePass, takePass } from '../src/door';

const seed = (n: number) => new Uint8Array(32).fill(n);
const HOST = 'did:key:z6MkHost';
const DAY = 86_400_000;

test('the gate’s door agrees with q-core: root, linked, pass, taken back, run out, live', async () => {
	const { letIn, doorItemOk, OPENING_SOON } = await import('../../../node/gate/server.mjs');
	const root = await identityFromSeed(seed(71));
	const tess = await identityFromSeed(seed(72));
	const site = await identityFromSeed(seed(73));
	const mallory = await identityFromSeed(seed(74));
	const door = { root: root.did, host: HOST, open: false };
	const t0 = Date.parse('2026-10-05T12:00:00Z');

	assert.equal(await letIn(root.did, [], door, t0), null);
	assert.equal(await letIn(tess.did, [], door, t0), OPENING_SOON);
	assert.equal(await letIn('nonsense', [], door, t0), OPENING_SOON);
	assert.equal(await letIn(tess.did, [], { ...door, open: true }, t0), null, 'live: everyone');
	assert.equal(await letIn(tess.did, [], { root: '', host: HOST, open: false }, t0), null, 'no door set: as before');

	const link = await approveLink(signerFor(root), await requestLink(signerFor(site), root.did, 'inqbeta.com'));
	assert.ok(await doorItemOk(link, door));
	assert.equal(await letIn(site.did, [link], door, t0), null);
	const un = await unlinkKey(signerFor(root), link);
	assert.equal(await letIn(site.did, [link, un], door, Date.parse(un.at) + 1), OPENING_SOON);

	const given = await givePass(root, { host: HOST, holder: tess.did, now: t0 });
	assert.ok(await doorItemOk(given, door));
	assert.equal(await letIn(tess.did, [given], door, t0 + DAY), null);
	assert.equal(await letIn(tess.did, [given], door, t0 + 31 * DAY), OPENING_SOON, 'runs out');
	const taken = await takePass(root, { host: HOST, holder: tess.did, now: t0 + 2 * DAY });
	assert.equal(await letIn(tess.did, [given, taken], door, t0 + 3 * DAY), OPENING_SOON, 'taken back');

	const forged = await givePass(mallory, { host: HOST, holder: tess.did, now: t0 });
	assert.equal(await doorItemOk(forged, door), false, 'only the root’s passes go on the door');
	assert.equal(await letIn(tess.did, [forged], door, t0 + DAY), OPENING_SOON);
	const elsewhere = await givePass(root, { host: 'did:key:z6MkOther', holder: tess.did, now: t0 });
	assert.equal(await doorItemOk(elsewhere, door), false, 'a pass for another host');
});
