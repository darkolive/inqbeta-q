/*
 * Releases signed under the site key (ADR-Q-003 §5). Real keys, real UCAN.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { identityFromSeed, signerFor } from '../src/passkey';
import { foundSite, grantSite, SITE_COMMANDS } from '../src/sites';
import { checkRelease, releaseId, signRelease } from '../src/releases';
import { checkSite } from '../src/site';

const seed = (n: number) => new Uint8Array(32).map((_, i) => (i * 13 + n) % 251);
const H = (c: string) => c.repeat(64);
const map = { domain: 'darkolive.co.uk', files: { 'index.html': H('a'), 'blog/index.html': H('b') }, pages: { '/blog/ten-years': `content://sha256/${H('c')}` } };

async function setup() {
	const me = await identityFromSeed(seed(1));
	const founded = await foundSite(signerFor(me), { name: 'Dark Olive', domain: 'darkolive.co.uk' });
	return { me, founded, site: founded.key.did };
}

test('the founder releases the site with its authority, and anyone can check it', async () => {
	const { me, founded, site } = await setup();
	const r = await signRelease(me, map, { site, grants: [founded.grant] });
	const c = await checkRelease(r, { founding: founded.founding });
	assert.equal(c.ok, true, c.ok ? '' : c.says);
	/* Still a site map: the files check exactly as before. */
	assert.equal((await checkSite(r, map.files, { all: true })).ok, true);
});

test('releases chain: each names the one before', async () => {
	const { me, founded, site } = await setup();
	const first = await signRelease(me, map, { site, grants: [founded.grant] });
	const second = await signRelease(me, { ...map, previous: await releaseId(first.content) }, { site, grants: [founded.grant] });
	const c = await checkRelease(second, { founding: founded.founding });
	assert.equal(c.ok, true);
	assert.equal(second.content.previous, await releaseId(first.content));
});

test('an editor cannot release; someone given /site/publish can', async () => {
	const { me, founded, site } = await setup();
	const theo = await identityFromSeed(seed(2));
	const edit = await grantSite(signerFor(me), { site, to: theo.did, cmd: SITE_COMMANDS.edit });
	const no = await signRelease(theo, map, { site, grants: [founded.grant, edit] });
	assert.equal((await checkRelease(no, { founding: founded.founding })).ok, false);
	const pub = await grantSite(signerFor(me), { site, to: theo.did, cmd: SITE_COMMANDS.publish });
	const yes = await signRelease(theo, map, { site, grants: [founded.grant, pub] });
	assert.equal((await checkRelease(yes, { founding: founded.founding })).ok, true);
});

test('a stranger, another site, or a changed map is refused', async () => {
	const { me, founded, site } = await setup();
	const stranger = await identityFromSeed(seed(9));
	assert.equal((await checkRelease(await signRelease(stranger, map, { site, grants: [founded.grant] }), { founding: founded.founding })).ok, false);

	const other = await foundSite(signerFor(me), { name: 'Other', domain: 'example.org' });
	const r = await signRelease(me, map, { site, grants: [founded.grant] });
	assert.equal((await checkRelease(r, { founding: other.founding })).ok, false);

	const tampered = structuredClone(r);
	tampered.content.files['index.html'] = H('f');
	assert.equal((await checkRelease(tampered, { founding: founded.founding })).ok, false);
});
