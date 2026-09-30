/*
 * Drawing a published page into one static HTML file, in the browser.
 *
 * The rules — what may go public, what the head says, how the receipt sits
 * inside the file — are in q-core/static-page.ts, pure and tested. This is the
 * part that needs a renderer: it draws the page with the SAME components the
 * preview uses, into a hidden frame, and keeps only the CSS those elements
 * use.
 *
 * No server. The page never leaves the device to be compiled; the only thing
 * that leaves is the finished file, when the person saves or shares it.
 *
 * LIGHT AND DARK WITHOUT A SCRIPT. Q switches theme with a `.dark` class,
 * which needs JavaScript a static page must not carry. So the dark rules are
 * found by drawing the frame dark as well, and rewritten to follow the
 * device's own setting (prefers-color-scheme). A reader gets the theme their
 * device asks for, and the file still runs nothing.
 */
import { flushSync, mount, unmount } from 'svelte';
import { version } from '$app/environment';
import { canonical } from '@inqbeta/q-core/canonical';
import { contentAddress } from '@inqbeta/q-core/vault';
import { PAGE_SCHEMA, type Page } from '@inqbeta/q-core/pages';
import { checkStatic, htmlDocument, sealStatic, staticCheck, type StaticCheck, type StaticRefusal } from '@inqbeta/q-core/static-page';
import type { Identity } from '@inqbeta/q-core/passkey';
import type { Supply } from '@inqbeta/q-ui';
import StaticPage from './components/StaticPage.svelte';
import { keep, keepDark, matchesIn, sheets, stripComments } from './static-css';

export const RENDERER = `q@${version}`;

export interface Compiled {
	ok: true;
	/** The signed file: one HTML document with its receipt inside. */
	file: string;
	name: string;
	/** The design it came from, and the file's own address. */
	page: string;
	html: string;
	bytes: number;
	checked: StaticCheck;
}

/** The design itself, without whatever the receipt wrapped around it. */
function designOf(p: Page): Page {
	return { schema: PAGE_SCHEMA, called: p.called, blocks: p.blocks };
}

export const slug = (s: string) =>
	s
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '') || 'page';

export async function compileStatic(
	identity: Identity,
	published: Page,
	supply: Supply = {},
	opts: { url?: string } = {}
): Promise<Compiled | StaticRefusal> {
	const page = designOf(published);
	const allowed = staticCheck(page, Object.keys(supply.pictures ?? {}));
	if (!allowed.ok) return allowed;

	const pageAddress = await contentAddress(new TextEncoder().encode(canonical(page)));
	const { body, css } = await draw(page, supply);
	const html = htmlDocument({ page, pageAddress, body, css, url: opts.url });
	const { file, content } = await sealStatic(identity, html, { called: page.called, page: pageAddress, renderer: RENDERER });
	return {
		ok: true,
		file,
		name: `${slug(page.called)}.html`,
		page: pageAddress,
		html: content.html,
		bytes: content.bytes,
		checked: await checkStatic(file)
	};
}

/* ------------------------------------------------------------------ *
 * Drawing, in a frame nobody sees
 * ------------------------------------------------------------------ */

async function draw(page: Page, supply: Supply): Promise<{ body: string; css: string }> {
	const frame = document.createElement('iframe');
	frame.setAttribute('aria-hidden', 'true');
	frame.tabIndex = -1;
	frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:1280px;height:800px;border:0;visibility:hidden';
	document.body.appendChild(frame);
	const doc = frame.contentDocument!;
	doc.open();
	doc.write('<!doctype html><html lang="en-GB" data-theme="dark-olive"><head></head><body></body></html>');
	doc.close();

	const app = mount(StaticPage, { target: doc.body, props: { page, supply } });
	try {
		flushSync();
		stripComments(doc.body);
		const body = doc.body.innerHTML.trim();
		const light = keep(sheets(), (sel) => matchesIn(doc, sel));
		doc.documentElement.classList.add('dark');
		const dark = keepDark(sheets(), doc);
		doc.documentElement.classList.remove('dark');
		const css = await inlineUrls(light + (dark ? `@media (prefers-color-scheme: dark){${dark}}` : ''));
		return { body, css };
	} finally {
		unmount(app);
		frame.remove();
	}
}

/* ------------------------------------------------------------------ *
 * Fonts and pictures the CSS points at, put inside the file
 * ------------------------------------------------------------------ */

async function inlineUrls(css: string): Promise<string> {
	const found = [...css.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)];
	const cache = new Map<string, string>();
	for (const [, , raw] of found) {
		if (raw.startsWith('data:') || raw.startsWith('#') || cache.has(raw)) continue;
		try {
			const url = new URL(raw, location.href);
			if (url.origin !== location.origin) {
				cache.set(raw, '');
				continue;
			}
			const blob = await (await fetch(url)).blob();
			cache.set(raw, await asDataUrl(blob));
		} catch {
			cache.set(raw, '');
		}
	}
	return css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (whole, _q, raw: string) => {
		const inlined = cache.get(raw);
		/* Something outside the file would make it depend on somewhere else. */
		return inlined === undefined ? whole : inlined ? `url("${inlined}")` : 'none';
	});
}

function asDataUrl(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const r = new FileReader();
		r.onload = () => resolve(String(r.result));
		r.onerror = () => reject(r.error);
		r.readAsDataURL(blob);
	});
}
