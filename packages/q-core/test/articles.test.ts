/*
 * Article versions (ADR-Q-003 §4). Real keys, real UCAN, real pages.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { identityFromSeed, signerFor } from '../src/passkey';
import { foundSite, grantSite, SITE_COMMANDS } from '../src/sites';
import { publish } from '../src/pages';
import { checkVersion, slugOf, writeVersion } from '../src/articles';

const seed = (n: number) => new Uint8Array(32).map((_, i) => (i * 17 + n) % 251);

async function setup() {
	const me = await identityFromSeed(seed(1));
	const theo = await identityFromSeed(seed(2));
	const founded = await foundSite(signerFor(me), { name: 'Dark Olive', domain: 'darkolive.co.uk' });
	const out = await publish('Ten years', [{ kind: 'heading', id: 'h', says: 'Ten years' }, { kind: 'text', id: 't', says: 'Dark Olive is **ten**.' }]);
	if (!out.ok) throw new Error();
	return { me, theo, founded, page: out.page, site: founded.key.did };
}

test('the founder signs a version, and it checks out against the founded site', async () => {
	const { me, founded, page, site } = await setup();
	const v = await writeVersion(me, { site, domain: 'darkolive.co.uk', section: 'posts', slug: 'ten-years', page, parent: null, grants: [founded.grant] });
	const c = await checkVersion(v, { founding: founded.founding });
	assert.equal(c.ok, true, c.ok ? '' : c.says);
});

test('an editor may write a version; a stranger with the same grants may not', async () => {
	const { me, theo, founded, page, site } = await setup();
	const toTheo = await grantSite(signerFor(me), { site, to: theo.did, cmd: SITE_COMMANDS.edit });
	const ok = await writeVersion(theo, { site, domain: 'darkolive.co.uk', section: 'posts', slug: 'ten-years', page, parent: null, grants: [founded.grant, toTheo] });
	assert.equal((await checkVersion(ok, { founding: founded.founding })).ok, true);
	const stranger = await identityFromSeed(seed(9));
	const bad = await writeVersion(stranger, { site, domain: 'darkolive.co.uk', section: 'posts', slug: 'ten-years', page, parent: null, grants: [founded.grant, toTheo] });
	assert.equal((await checkVersion(bad, { founding: founded.founding })).ok, false);
});

test('changing the page after signing is caught', async () => {
	const { me, founded, page, site } = await setup();
	const v = await writeVersion(me, { site, domain: 'darkolive.co.uk', section: 'posts', slug: 'ten-years', page, parent: null, grants: [founded.grant] });
	const edited = structuredClone(v);
	(edited.content as { page: { called: string } }).page.called = 'Defaced';
	assert.equal((await checkVersion(edited)).ok, false);
});

test('a version for one site is refused by another', async () => {
	const { me, founded, page, site } = await setup();
	const other = await foundSite(signerFor(me), { name: 'Other', domain: 'other.org' });
	const v = await writeVersion(me, { site, domain: 'darkolive.co.uk', section: 'posts', slug: 'ten-years', page, parent: null, grants: [founded.grant] });
	assert.equal((await checkVersion(v, { founding: other.founding })).ok, false);
});

test('addresses must be tidy, and titles become them', async () => {
	const { me, founded, page, site } = await setup();
	await assert.rejects(writeVersion(me, { site, domain: 'darkolive.co.uk', section: 'posts', slug: '../etc', page, parent: null, grants: [founded.grant] }));
	await assert.rejects(writeVersion(me, { site, domain: 'darkolive.co.uk', section: 'secret' as never, slug: 'x', page, parent: null, grants: [founded.grant] }));
	assert.equal(slugOf('Ten Years — and Next!'), 'ten-years-and-next');
	assert.equal(slugOf('Café Ynys Môn'), 'cafe-ynys-mon');
});
