/*
 * The block editor's two promises: an article opened as a form and saved
 * unchanged is the same page, for every Dark Olive page; and a pasted film
 * link is read the way a person would expect.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { publish, type Page } from '../src/pages';
import { joinArticle, splitArticle } from '../src/article-form';
import { parseMediaLink } from '../src/embeds';
import { canonicalIds } from '../src/publication';

const ROOT = new URL('../../../apps/darkolive/src/content/pages/', import.meta.url);

test('every Dark Olive page survives form + body → blocks unchanged', { skip: !existsSync(ROOT) }, async () => {
	let n = 0;
	for (const kind of ['projects', 'posts']) {
		const dir = new URL(`${kind}/`, ROOT);
		for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
			const page = JSON.parse(readFileSync(new URL(f, dir), 'utf8')) as Page;
			const { form, body, ids } = splitArticle(page.blocks as never);
			const blocks = joinArticle(form, body, ids, page.head?.published);
			const was = await publish(page.called, canonicalIds(page.blocks as never) as never, [], page.head ?? {});
			const now = await publish(page.called, canonicalIds(blocks as never) as never, [], page.head ?? {});
			assert.ok(was.ok && now.ok);
			if (was.ok && now.ok && was.address !== now.address) assert.deepEqual(now.page.blocks, was.page.blocks, `${kind}/${f}`);
			n++;
		}
	}
	assert.equal(n, 18);
});

test('pasted film and recording links are understood', () => {
	const cases: [string, string, string][] = [
		['https://www.youtube.com/watch?v=pJWdgRogAcU&t=12s', 'youtube', 'pJWdgRogAcU'],
		['https://youtu.be/fcUyd9AM5JA?si=abc', 'youtube', 'fcUyd9AM5JA'],
		['youtube.com/shorts/abcDEF12345', 'youtube', 'abcDEF12345'],
		['https://vimeo.com/123456789', 'vimeo', '123456789'],
		['https://www.dailymotion.com/video/x8f2n8k', 'dailymotion', 'x8f2n8k'],
		['https://dai.ly/x8f2n8k', 'dailymotion', 'x8f2n8k'],
		['https://soundcloud.com/user-34976093/rossini-una-voce-poco-fa-from-barbiere-di-siviglia?utm_source=x', 'soundcloud', 'user-34976093/rossini-una-voce-poco-fa-from-barbiere-di-siviglia'],
		['dailymotion:x8f2n8k', 'dailymotion', 'x8f2n8k']
	];
	for (const [input, provider, media] of cases) assert.deepEqual(parseMediaLink(input), { provider, media }, input);
	for (const bad of ['https://evil.org/watch?v=x', 'javascript:alert(1)', 'not a link', 'https://youtube.com/channel/abc']) {
		assert.equal(parseMediaLink(bad), null, bad);
	}
});
