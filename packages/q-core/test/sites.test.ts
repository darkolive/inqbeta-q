/*
 * A website is a key, founded by you (ADR-Q-003). Real keys, real UCAN.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { identityFromSeed, signerFor } from '../src/passkey';
import { SITE_COMMANDS, actFor, checkAuthority, checkFounding, foundSite, grantSite, openSiteKey } from '../src/sites';
import { revoke } from '../src/ucan/revoke';

const seed = (n: number) => new Uint8Array(32).map((_, i) => (i * 13 + n) % 251);

async function setup() {
	const me = await identityFromSeed(seed(1));
	const theo = await identityFromSeed(seed(2));
	const stranger = await identityFromSeed(seed(3));
	const founded = await foundSite(signerFor(me), { name: 'Dark Olive', domain: 'https://DarkOlive.co.uk/' });
	return { me, theo, stranger, founded };
}

test('founding is signed by the founder and the new site key', async () => {
	const { me, founded } = await setup();
	const f = founded.founding;
	assert.equal(f.root, me.did);
	assert.equal(f.site, founded.key.did);
	assert.equal(f.domain, 'darkolive.co.uk');
	assert.notEqual(f.site, me.did, 'the site is its own key, not the founder');
	assert.equal((await checkFounding(f)).ok, true);
});

test('changing a founding, or dropping a signature, is caught', async () => {
	const { founded } = await setup();
	assert.equal((await checkFounding({ ...founded.founding, domain: 'evil.org' })).ok, false);
	assert.equal((await checkFounding({ ...founded.founding, signatures: founded.founding.signatures.filter((s) => s.by === 'root') })).ok, false);
	assert.equal((await checkFounding({ ...founded.founding, signatures: founded.founding.signatures.filter((s) => s.by === 'site') })).ok, false);
});

test('the site key is random: two foundings, two keys', async () => {
	const me = await identityFromSeed(seed(1));
	const a = await foundSite(signerFor(me), { name: 'A', domain: 'a.org' });
	const b = await foundSite(signerFor(me), { name: 'A', domain: 'a.org' });
	assert.notEqual(a.key.did, b.key.did);
});

test('only the owner opens the site key, and it is the same key', async () => {
	const { me, stranger, founded } = await setup();
	const opened = await openSiteKey(founded.sealedKey, me);
	assert.equal(opened.did, founded.key.did);
	await assert.rejects(openSiteKey(founded.sealedKey, stranger));
	assert.ok(!JSON.stringify(founded.sealedKey).includes(founded.key.did.slice(8)), 'nothing of the key is readable in the sealed form');
});

test('the founder may do anything for the site; a stranger may do nothing', async () => {
	const { me, stranger, founded } = await setup();
	const site = founded.key.did;
	const mine = await actFor(signerFor(me), { site, cmd: SITE_COMMANDS.publish, proofs: [founded.grant] });
	assert.equal(checkAuthority(mine, { site, cmd: SITE_COMMANDS.publish, proofs: [founded.grant] }).ok, true);
	const theirs = await actFor(signerFor(stranger), { site, cmd: SITE_COMMANDS.publish, proofs: [founded.grant] });
	assert.equal(checkAuthority(theirs, { site, cmd: SITE_COMMANDS.publish, proofs: [founded.grant] }).ok, false);
});

test('an editor may edit and may not publish', async () => {
	const { me, theo, founded } = await setup();
	const site = founded.key.did;
	const toTheo = await grantSite(signerFor(me), { site, to: theo.did, cmd: SITE_COMMANDS.edit, label: 'Theo' });
	const proofs = [founded.grant, toTheo];
	const edit = await actFor(signerFor(theo), { site, cmd: SITE_COMMANDS.edit, proofs });
	assert.equal(checkAuthority(edit, { site, cmd: SITE_COMMANDS.edit, proofs }).ok, true);
	const publish = await actFor(signerFor(theo), { site, cmd: SITE_COMMANDS.publish, proofs });
	const c = checkAuthority(publish, { site, cmd: SITE_COMMANDS.publish, proofs });
	assert.equal(c.ok, false);
});

test('revoking an editor ends their authority from then on', async () => {
	const { me, theo, founded } = await setup();
	const site = founded.key.did;
	const toTheo = await grantSite(signerFor(me), { site, to: theo.did, cmd: SITE_COMMANDS.edit });
	const proofs = [founded.grant, toTheo];
	const edit = await actFor(signerFor(theo), { site, cmd: SITE_COMMANDS.edit, proofs });
	const r = await revoke(signerFor(me), toTheo, proofs);
	const revocations = [{ revoked: toTheo.cid, by: me.did, at: r.payload.iat ?? 0 }];
	assert.equal(checkAuthority(edit, { site, cmd: SITE_COMMANDS.edit, proofs, revocations }).ok, false);
});

test('bad input is refused', async () => {
	const me = signerFor(await identityFromSeed(seed(1)));
	await assert.rejects(foundSite(me, { name: 'X', domain: 'not a domain' }));
	await assert.rejects(foundSite(me, { name: ' ', domain: 'x.org' }));
	await assert.rejects(foundSite(me, { name: 'X', domain: 'darkolive-8ccsqf2ra-darkolives-projects.vercel.app' }), /own domain/);
	await assert.rejects(grantSite(me, { site: me.did, to: me.did, cmd: '/other' }));
});
