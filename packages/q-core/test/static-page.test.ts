/*
 * A static page carries its own receipt.
 *
 * Real crypto, real hashing: the claim is that one file can be checked with
 * nothing beside it, and that changing one character of it is caught.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { identityFromSeed } from '../src/passkey';
import { publish } from '../src/pages';
import { RECEIPT_MARK, checkStatic, describe, htmlDocument, runsSomething, sealStatic, staticCheck } from '../src/static-page';
import type { Block } from '../src/blocks';

const seed = new Uint8Array(32).map((_, i) => (i * 11 + 3) % 251);

async function built(blocks: Block[], called = 'Green Space, Dark Skies') {
	const out = await publish(called, blocks);
	assert.equal(out.ok, true, JSON.stringify(out));
	if (!out.ok) throw new Error();
	return out;
}

const words: Block[] = [
	{ kind: 'heading', id: 'h', says: 'Seeing the stars again' } as Block,
	{ kind: 'text', id: 't', says: 'A community project that turned the lights down so a village could see the Milky Way.   Twice.' } as Block
];

async function file(blocks = words) {
	const out = await built(blocks);
	const html = htmlDocument({ page: out.page, pageAddress: out.address, body: '<main><h1>Green Space, Dark Skies</h1><p>Words</p></main>', css: 'main{margin:auto}' });
	const me = await identityFromSeed(seed);
	return { out, html, me, ...(await sealStatic(me, html, { called: out.page.called, page: out.address, renderer: 'test/1' })) };
}

test('a page of words can go public; a page that reads your answers cannot', async () => {
	assert.deepEqual(staticCheck((await built(words)).page), { ok: true });
	const live = await built([...words, { kind: 'answers', id: 'a', shows: ['q:about/name'] } as Block]);
	const c = staticCheck(live.page);
	assert.equal(c.ok, false);
	if (!c.ok) assert.deepEqual(c.wrong.map((w) => w.kind), ['answers']);
});

test('a live block hidden inside a group is still found', async () => {
	const nested = await built([{ kind: 'section', id: 's', children: [{ kind: 'places', id: 'p' } as Block] } as Block]);
	const c = staticCheck(nested.page);
	assert.equal(c.ok, false);
});

test('a picture must be in the vault and must have words for a screen reader', async () => {
	const at = `content://sha256/${'a'.repeat(64)}`;
	const pic = await built([{ kind: 'image', id: 'i', at } as Block]);
	assert.equal(staticCheck(pic.page, []).ok, false, 'not in the vault');
	const c = staticCheck(pic.page, [at]);
	assert.equal(c.ok, false, 'no title, so no alt text');
	if (!c.ok) assert.match(c.wrong[0].says, /screen reader/);
});

test('title and description come from the page, clipped for search', async () => {
	const d = describe((await built(words)).page);
	assert.equal(d.title, 'Green Space, Dark Skies');
	assert.match(d.description, /^A community project/);
	assert.ok(!/\s{2}/.test(d.description), 'whitespace is squashed');
	const long = describe((await built([{ kind: 'text', id: 't', says: 'word '.repeat(80) } as Block])).page);
	assert.ok(long.description.length <= 160);
	assert.ok(long.description.endsWith('…'));
});

test('the head carries SEO and Open Graph, escaped', async () => {
	const out = await built(words, 'Fish & "Chips" <live>');
	const html = htmlDocument({ page: out.page, pageAddress: out.address, body: '', css: '', url: 'https://darkolive.co.uk/x' });
	assert.match(html, /<title>Fish &amp; &quot;Chips&quot; &lt;live&gt;<\/title>/);
	assert.match(html, /<meta property="og:title"/);
	assert.match(html, /<link rel="canonical" href="https:\/\/darkolive.co.uk\/x">/);
	assert.match(html, /<html lang="en-GB"/);
	assert.ok(html.includes(RECEIPT_MARK));
});

test('the same page compiles to the same bytes', async () => {
	const a = await built(words);
	const b = await built(words);
	const doc = (o: typeof a) => htmlDocument({ page: o.page, pageAddress: o.address, body: '<p>x</p>', css: '' });
	assert.equal(doc(a), doc(b));
});

test('the file checks itself, with nothing beside it', async () => {
	const { file: f, content } = await file();
	assert.ok(!f.includes(RECEIPT_MARK), 'the marker is replaced by the receipt');
	const c = await checkStatic(f);
	assert.equal(c.ok, true, c.says);
	assert.equal(c.htmlMatches, true);
	assert.equal((c.receipt!.content as { html: string }).html, content.html);
});

test('changing one character of the page is caught', async () => {
	const { file: f } = await file();
	const c = await checkStatic(f.replace('Words', 'Wordz'));
	assert.equal(c.ok, false);
	assert.equal(c.htmlMatches, false);
	assert.match(c.says, /changed since it was signed/);
});

test('a file with no receipt says so', async () => {
	const c = await checkStatic('<html><body>hi</body></html>');
	assert.equal(c.ok, false);
	assert.match(c.says, /no receipt/);
});

test('nothing that runs can be signed', async () => {
	assert.equal(runsSomething('<script type="application/json">{}</script><script type="application/ld+json">{}</script>'), null);
	assert.ok(runsSomething('<script>alert(1)</script>'));
	assert.ok(runsSomething('<img src=x onerror="alert(1)">'));
	assert.ok(runsSomething('<a href="javascript:alert(1)">'));
	const out = await built(words);
	const bad = htmlDocument({ page: out.page, pageAddress: out.address, body: '<script>alert(1)</script>', css: '' });
	await assert.rejects(sealStatic(await identityFromSeed(seed), bad, { called: 'x', page: out.address, renderer: 't' }), /runs/);
});

test('css cannot close its own style tag', async () => {
	const out = await built(words);
	const html = htmlDocument({ page: out.page, pageAddress: out.address, body: '', css: 'a{}</style><script>alert(1)</script>' });
	assert.equal((html.match(/<\/style>/g) ?? []).length, 1);
});
