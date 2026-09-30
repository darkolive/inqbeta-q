/*
 * The one door between Q and a website's files — on your own computer only.
 *
 * Write edits a site by writing its pages into the site's own source folder
 * (named in local-sites.json). That is a file on your
 * disk, so this door exists ONLY while Q runs locally in development. The
 * deployed Q answers 404 here, always: a website's files are never reachable
 * from the internet through Q. (Darren, 2026-09-10: admin tooling stays local.)
 *
 * And even locally it only writes what it can check. A page is written only
 * as part of a signed article version (q-core/articles.ts) that:
 *   - holds up as a receipt, and names the page it carries;
 *   - is for a site founded as that domain (the founding is checked too);
 *   - was signed by someone the site allowed to edit it (UCAN /site/edit).
 * So the site's folder takes signed versions, not files.
 *
 * Cross-site requests: a JSON PUT from another origin needs a CORS preflight,
 * which this never answers — and the Origin is checked besides.
 */
import { json, error, type RequestHandler } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { checkVersion, isSlug, SECTIONS } from '@inqbeta/q-core/articles';
import type { Founding } from '@inqbeta/q-core/sites';
import { localSites } from '$lib/server/local-sites';

export const prerender = false;

/* The sites this computer can edit: local-sites.json (see $lib/server/local-sites). */

function siteFor(url: URL) {
	if (!dev) error(404, 'Not found');
	const domain = url.searchParams.get('domain') ?? '';
	const site = localSites()[domain];
	if (!site) error(404, `This computer has no source for ${domain || 'that site'}.`);
	if (!existsSync(site.dir)) error(404, `The source folder for ${domain} is not here: ${site.dir}`);
	return { domain, ...site };
}

export const GET: RequestHandler = async ({ url }) => {
	const site = siteFor(url);
	const articles: { section: string; slug: string; page: unknown }[] = [];
	for (const section of SECTIONS) {
		const dir = path.join(site.dir, section);
		if (!existsSync(dir)) continue;
		for (const f of readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
			articles.push({ section, slug: f.replace(/\.json$/, ''), page: JSON.parse(readFileSync(path.join(dir, f), 'utf8')) });
		}
	}
	const mediaFile = path.join(site.dir, 'media.json');
	const media = existsSync(mediaFile) ? JSON.parse(readFileSync(mediaFile, 'utf8')) : {};
	/* Every picture once, with a small version to show as a thumbnail — the
	 * smallest size the site made of it (image-manifest.json), or the file. */
	const manifest: Record<string, { widths: number[] }> = existsSync(site.manifest) ? JSON.parse(readFileSync(site.manifest, 'utf8')) : {};
	const pictures: { address: string; path: string; thumb: string; name: string }[] = [];
	for (const [address, paths] of Object.entries(media as Record<string, string[]>)) {
		for (const p of paths) {
			const key = p.replace(/\.[a-z0-9]+$/i, '');
			const set = manifest[key] ?? manifest[key.replace(/-m?\d{3,4}$/, '')];
			const file = set?.widths?.length ? `${key}-${Math.min(...set.widths)}.webp` : p;
			/* Served by Q itself (./picture), so thumbnails work without the site's server. */
			const thumb = `/api/local-site/picture?domain=${encodeURIComponent(site.domain)}&path=${encodeURIComponent(file)}`;
			pictures.push({ address, path: p, thumb, name: key.split('/').pop() ?? p });
		}
	}
	return json({ domain: site.domain, preview: site.preview, routes: site.routes, articles, media, pictures });
};

export const PUT: RequestHandler = async ({ url, request }) => {
	const site = siteFor(url);
	const origin = request.headers.get('origin');
	if (origin && origin !== url.origin) error(403, 'Only Q itself may write here.');

	let body: { version?: unknown; founding?: Founding };
	try {
		body = await request.json();
	} catch {
		error(400, 'That was not JSON.');
	}
	if (!body.founding || body.founding.domain !== site.domain) error(400, `A founding for ${site.domain} is needed.`);
	const checked = await checkVersion(body.version, { founding: body.founding });
	if (!checked.ok) return json({ ok: false, says: checked.says }, { status: 422 });

	const { section, slug, page } = checked.content;
	if (!(SECTIONS as readonly string[]).includes(section) || !isSlug(slug)) error(400, 'Not a place on the site.');
	const dir = path.join(site.dir, section);
	mkdirSync(dir, { recursive: true });
	const file = path.join(dir, `${slug}.json`);
	/* Same shape as scripts/blocks-check.mjs --write, so the two never argue. */
	writeFileSync(file, JSON.stringify(page, null, '\t') + '\n');
	return json({
		ok: true,
		says: `Published ${section}/${slug} into the site's source.`,
		wrote: path.relative(path.resolve(site.dir, '../../..'), file),
		view: site.preview + site.routes[section] + slug
	});
};
