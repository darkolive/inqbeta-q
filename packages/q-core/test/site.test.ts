/*
 * A website as one signed map. Real crypto, real hashes.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { identityFromSeed } from '../src/passkey';
import { sha256Hex } from '../src/vault';
import { checkSite, signSite, siteContent, siteId } from '../src/site';

const seed = new Uint8Array(32).map((_, i) => (i * 5 + 9) % 251);
const h = (s: string) => sha256Hex(new TextEncoder().encode(s));

async function site() {
	const files = { 'index.html': await h('home'), 'our-work/aura/index.html': await h('aura'), '_app/immutable/app.abc.js': await h('js') };
	const content = siteContent({ domain: 'DarkOlive.co.uk', files, pages: { '/our-work/aura': `content://sha256/${'a'.repeat(64)}` } });
	return { files, content, receipt: await signSite(await identityFromSeed(seed), content) };
}

test('a whole build checks out against its signed map', async () => {
	const { files, receipt } = await site();
	const c = await checkSite(receipt, files, { all: true });
	assert.equal(c.ok, true, c.says);
	assert.equal(c.matched, 3);
	assert.match(c.says, /All 3 files/);
});

test('one changed file is named', async () => {
	const { files, receipt } = await site();
	const c = await checkSite(receipt, { ...files, 'index.html': await h('home, defaced') });
	assert.equal(c.ok, false);
	assert.deepEqual(c.changed, ['index.html']);
});

test('a file slipped in, or one gone missing, is caught', async () => {
	const { files, receipt } = await site();
	assert.deepEqual((await checkSite(receipt, { ...files, 'x.js': await h('x') })).extra, ['x.js']);
	const { 'index.html': _gone, ...rest } = files;
	assert.deepEqual((await checkSite(receipt, rest, { all: true })).missing, ['index.html']);
	assert.equal((await checkSite(receipt, rest)).ok, true, 'a visitor checks only what they fetched');
});

test('the same build makes the same map, whatever order it was read in', async () => {
	const { files } = await site();
	const reversed = Object.fromEntries(Object.entries(files).reverse());
	assert.equal(await siteId(siteContent({ domain: 'darkolive.co.uk', files })), await siteId(siteContent({ domain: 'darkolive.co.uk', files: reversed })));
});

test('releases chain: each map names the one it replaces', async () => {
	const { content } = await site();
	const next = siteContent({ domain: 'darkolive.co.uk', files: content.files, previous: await siteId(content) });
	assert.equal(next.previous, await siteId(content));
});

test('malformed maps are refused', () => {
	const files = { 'index.html': 'a'.repeat(64) };
	assert.throws(() => siteContent({ domain: 'not a domain', files }));
	assert.throws(() => siteContent({ domain: 'x.org', files: { '/abs': 'a'.repeat(64) } }));
	assert.throws(() => siteContent({ domain: 'x.org', files: { '../up': 'a'.repeat(64) } }));
	assert.throws(() => siteContent({ domain: 'x.org', files: { 'a': 'nothex' } }));
	assert.throws(() => siteContent({ domain: 'x.org', files: {} }));
	assert.throws(() => siteContent({ domain: 'x.org', files, pages: { '/a': 'https://x' } }));
});
