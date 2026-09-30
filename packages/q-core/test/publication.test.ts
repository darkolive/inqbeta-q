/*
 * The publication blocks, and the words inside them.
 *
 * inline.ts is checked against marked on every paragraph of the Dark Olive
 * site elsewhere (apps/darkolive/scripts/blocks-check.mjs). What is checked
 * here is the part that must never change: nothing in a sentence can become
 * markup that runs, and nothing in an embed can become a URL.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inlineHtml, plainText } from '../src/inline';
import { checkBlock, factsOf } from '../src/blocks';
import { publish } from '../src/pages';

const at = `content://sha256/${'c'.repeat(64)}`;

test('bold, italic and links are the only marks', () => {
	assert.equal(inlineHtml('a **b** *c* [d](https://x.org)'), 'a <strong>b</strong> <em>c</em> <a href="https://x.org" target="_blank" rel="noopener noreferrer">d</a>');
	assert.equal(inlineHtml('[home](/our-work)'), '<a href="/our-work">home</a>');
	assert.equal(inlineHtml('***both***'), '<em><strong>both</strong></em>');
	assert.equal(inlineHtml('[Paine](https://en.wikipedia.org/wiki/James_Paine_(architect))'), '<a href="https://en.wikipedia.org/wiki/James_Paine_(architect)" target="_blank" rel="noopener noreferrer">Paine</a>');
});

test('markup typed into a sentence is shown, never run', () => {
	assert.equal(inlineHtml('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
	assert.equal(inlineHtml('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
	assert.ok(!inlineHtml('[x](javascript:alert(1))').includes('<a'), 'a javascript: link is words');
	assert.ok(!inlineHtml('[x](data:text/html,hi)').includes('<a'));
	assert.equal(inlineHtml('[x](https://a.org" onclick="y)'), '[x](https://a.org&quot; onclick=&quot;y)');
});

test('plain text drops the marks for descriptions and speech', () => {
	assert.equal(plainText('We **production managed** [three](https://x.org) sites'), 'We production managed three sites');
});

test('a figure must say what is in it', () => {
	assert.equal(checkBlock({ kind: 'figure', id: 'f', settings: { 'q:block/at': at } }).ok, false);
	assert.equal(checkBlock({ kind: 'figure', id: 'f', settings: { 'q:block/at': at, 'q:block/alt': 'A crowd at dusk' } }).ok, true);
	assert.equal(checkBlock({ kind: 'figure', id: 'f', settings: { 'q:block/at': 'https://x.org/a.jpg', 'q:block/alt': 'a' } }).ok, false);
});

test('an embed names a provider and an id — never a link', () => {
	const ok = { kind: 'embed', id: 'e', settings: { 'q:block/provider': 'soundcloud', 'q:block/media': 'user-34976093/rossini-una-voce' } };
	assert.equal(checkBlock(ok).ok, true);
	for (const media of ['https://evil.org/x', 'x?autoplay=1', '../../x', 'a b', '']) {
		assert.equal(checkBlock({ ...ok, settings: { ...ok.settings, 'q:block/media': media } }).ok, false, media);
	}
	assert.equal(checkBlock({ ...ok, settings: { ...ok.settings, 'q:block/provider': 'evil' } }).ok, false);
	assert.equal(checkBlock({ ...ok, src: 'https://x' }).ok, false, 'src is behaviour');
});

test('facts are read one per line, as a person writes them', () => {
	const b = { kind: 'facts', id: 'f', settings: { 'q:block/facts': 'Role: Production Management\nLocation: Craig y Nos: Wales\nnonsense' } };
	assert.deepEqual(factsOf(b), [
		{ label: 'Role', value: 'Production Management' },
		{ label: 'Location', value: 'Craig y Nos: Wales' }
	]);
	assert.equal(checkBlock({ kind: 'facts', id: 'f', settings: { 'q:block/facts': 'no colon' } }).ok, false);
});

test('a group lays out by grid, aside or profile, and nothing else', () => {
	assert.equal(checkBlock({ kind: 'section', id: 's', settings: { 'q:block/arrange': 'aside' } }).ok, true);
	assert.equal(checkBlock({ kind: 'section', id: 's', settings: { 'q:block/arrange': 'float-left' } }).ok, false);
});

test('a head is kept in a fixed order, and a page without one keeps its old address', async () => {
	const blocks = [{ kind: 'heading' as const, id: 'h', says: 'Hi' }];
	const bare = await publish('P', blocks);
	const empty = await publish('P', blocks, [], { description: '  ' });
	assert.ok(bare.ok && empty.ok);
	if (bare.ok && empty.ok) {
		assert.equal(bare.address, empty.address, 'an empty head is no head');
		assert.equal('head' in bare.page, false);
	}
	const a = await publish('P', blocks, [], { tags: '#x', description: 'd' });
	const b = await publish('P', blocks, [], { description: 'd', tags: '#x' });
	assert.ok(a.ok && b.ok && a.address === b.address);
	const bad = await publish('P', blocks, [], { image: 'https://x.org/og.jpg' });
	assert.equal(bad.ok, false);
});
