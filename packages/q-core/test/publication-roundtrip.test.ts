/*
 * Write's promise: an article opened as text and saved without a change is
 * the same page — the same address — for every page on the Dark Olive site.
 * If this fails, opening an article in Write would quietly change it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { publish, type Page } from '../src/pages';
import { canonicalIds, importArticle, pageToText } from '../src/publication';

const ROOT = new URL('../../../apps/darkolive/src/content/pages/', import.meta.url);

test('every Dark Olive page survives text → blocks unchanged', { skip: !existsSync(ROOT) }, async () => {
	const media = JSON.parse(readFileSync(new URL('media.json', ROOT), 'utf8')) as Record<string, string[]>;
	const byPath = new Map<string, string>();
	for (const [address, paths] of Object.entries(media)) for (const p of paths) byPath.set(p, address);
	let n = 0;
	for (const kind of ['projects', 'posts']) {
		const dir = new URL(`${kind}/`, ROOT);
		for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
			const page = JSON.parse(readFileSync(new URL(f, dir), 'utf8')) as Page;
			const slug = f.replace(/\.json$/, '');
			const pathOf = (a: string) => (media[a] ?? []).find((p) => p.includes(`/${slug}/`) || p.endsWith(`/${slug}.webp`)) ?? media[a]?.[0] ?? '';
			const text = pageToText(page, pathOf);
			const back = importArticle(text, (p) => {
				const a = byPath.get(p);
				if (!a) throw new Error(`${slug}: no picture at ${p}`);
				return a;
			});
			/* A page edited in the block editor may carry the names blocks had before
			 * they were moved; both views number them the importer's way. */
			const was = await publish(page.called, canonicalIds(page.blocks as never) as never, [], page.head ?? {});
			const now = await publish(back.called, back.blocks, [], back.head);
			assert.ok(was.ok && now.ok, slug);
			if (was.ok && now.ok) {
				if (was.address !== now.address) {
					assert.deepEqual(now.page, was.page, `${kind}/${slug} changed on the way through text`);
				}
			}
			n++;
		}
	}
	assert.equal(n, 18);
});

test('blocks the words cannot say travel whole through the text view', async () => {
	const { publish } = await import('../src/pages');
	const at = `content://sha256/${'a'.repeat(64)}`;
	const blocks = [
		{ kind: 'cover', id: 'cover-1', settings: { 'q:block/says': 'T' } },
		{ kind: 'text', id: 'text-2', settings: { 'q:block/says': 'Plain words', 'q:style/align': 'centre', 'q:style/frame': 'filled' } },
		{ kind: 'divider', id: 'divider-3', settings: {} },
		{ kind: 'button', id: 'button-4', settings: { 'q:block/says': 'See our work', 'q:block/to': '/our-work' } },
		{ kind: 'section', id: 'section-8', settings: { 'q:block/arrange': 'disclosure', 'q:block/says': 'More --> detail' }, children: [
			{ kind: 'text', id: 'text-5', settings: { 'q:block/says': 'Hidden until opened' } },
			{ kind: 'figure', id: 'figure-6', settings: { 'q:block/at': at, 'q:block/alt': 'A thing' } }
		] }
	];
	const was = await publish('T', canonicalIds(blocks as never) as never);
	assert.ok(was.ok, JSON.stringify(was));
	if (!was.ok) return;
	const text = pageToText(was.page, () => '/x.webp');
	assert.ok(!text.includes('More --> detail'), 'a comment cannot be closed early by the words inside it');
	const back = importArticle(text, () => at);
	const now = await publish(back.called, back.blocks, [], back.head);
	assert.ok(now.ok);
	if (now.ok) assert.equal(now.address, was.address);
});
