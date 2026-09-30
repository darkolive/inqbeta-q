/*
 * Releasing a site from this computer: build it, then carry a signed release
 * to where it is served. ADR-Q-003 §5 and "the device signs, the cloud carries".
 *
 * Local only, like the rest of local-site: the deployed Q answers 404, and a
 * cross-origin page cannot call it (JSON bodies need a preflight this never
 * answers, and the Origin is checked).
 *
 *   POST  build the site and hash every file. Returns the map to sign, and
 *         what is live now (so the release can name it as `previous`).
 *   PUT   take a SIGNED release. It is carried only if
 *           - it holds up and was signed with the site's authority
 *             (/site/publish, a chain back to the site key), and
 *           - the build on disk is byte for byte the map it signs.
 *         Then the release goes to /.well-known/inqbeta-site.json, the build
 *         goes to the carrier, and the live copy is fetched back and checked.
 *
 * The carrier today is Vercel, through its own command-line tool: with the
 * token from your vault when you have kept one there, or else this
 * computer's `vercel login`.
 */
import { json, error, type RequestHandler } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { checkRelease, releaseId } from '@inqbeta/q-core/releases';
import { checkSite, type SiteContent } from '@inqbeta/q-core/site';
import type { Founding } from '@inqbeta/q-core/sites';

export const prerender = false;

const SITES: Record<string, { root: string; vercel: { checkAt: string } }> = {
	'darkolive.co.uk': {
		root: path.resolve(process.cwd(), '../darkolive'),
		/* Where Vercel serves production until the domain is switched over. */
		vercel: { checkAt: 'https://darkolive.vercel.app' }
	}
};
const WELL_KNOWN = '.well-known/inqbeta-site.json';

let busy = false;

function siteFor(url: URL, request: Request) {
	if (!dev) error(404, 'Not found');
	const origin = request.headers.get('origin');
	if (origin && origin !== url.origin) error(403, 'Only Q itself may do this.');
	const domain = url.searchParams.get('domain') ?? '';
	const site = SITES[domain];
	if (!site || !existsSync(site.root)) error(404, `This computer has no source for ${domain || 'that site'}.`);
	return { domain, ...site, out: path.join(site.root, '.vercel/output/static') };
}

/* Run a command in the site's folder. Resolves with its output; never throws. */
function run(cmd: string, args: string[], cwd: string, secret?: string): Promise<{ ok: boolean; out: string }> {
	return new Promise((resolve) => {
		let out = '';
		const child = spawn(cmd, args, { cwd, env: { ...process.env, FORCE_COLOR: '0', CI: '1' }, shell: false });
		const add = (d: Uint8Array) => (out += new TextDecoder().decode(d));
		child.stdout.on('data', add);
		child.stderr.on('data', add);
		child.on('error', (e: Error) => resolve({ ok: false, out: out + e.message }));
		child.on('close', (code: number | null) => resolve({ ok: code === 0, out: secret ? out.split(secret).join('••••') : out }));
	});
}

const tail = (s: string, n = 12) => s.trim().split('\n').slice(-n).join('\n');
const sha = (b: Uint8Array | string) => createHash('sha256').update(b).digest('hex');

function walk(dir: string, prefix = ''): string[] {
	const out: string[] = [];
	for (const name of readdirSync(dir).sort()) {
		const full = path.join(dir, name);
		const rel = prefix + name;
		if (statSync(full).isDirectory()) out.push(...walk(full, rel + '/'));
		else if (rel !== WELL_KNOWN) out.push(rel);
	}
	return out;
}
const filesOf = (dir: string) => Object.fromEntries(walk(dir).map((p) => [p, sha(readFileSync(path.join(dir, p)))]));

async function live(checkAt: string): Promise<unknown | null> {
	try {
		const r = await fetch(`${checkAt}/${WELL_KNOWN}`, { cache: 'no-store' });
		return r.ok ? await r.json() : null;
	} catch {
		return null;
	}
}

export const POST: RequestHandler = async ({ url, request }) => {
	const site = siteFor(url, request);
	if (busy) return json({ ok: false, says: 'A release is already under way.' }, { status: 409 });
	busy = true;
	try {
		const vite = path.join(site.root, 'node_modules/.bin/vite');
		const built = await run(vite, ['build'], site.root);
		if (!built.ok) return json({ ok: false, says: 'The site did not build.', log: tail(built.out) }, { status: 500 });
		const routes = await run('node', ['scripts/vercel-routes.mjs'], site.root);
		if (!routes.ok) return json({ ok: false, says: 'The routing step failed.', log: tail(routes.out) }, { status: 500 });
		const mapped = await run('node', ['scripts/site-map.mjs'], site.root);
		if (!mapped.ok) return json({ ok: false, says: 'The site could not be mapped.', log: tail(mapped.out) }, { status: 500 });
		const map = JSON.parse(readFileSync(path.join(site.root, 'site-map.json'), 'utf8')) as { domain: string; files: Record<string, string>; pages: Record<string, string> };
		/* What is live now, so the new release names it. */
		const now = (await live(site.vercel.checkAt)) as { content?: SiteContent } | null;
		const previous = now?.content?.schema ? await releaseId(now.content) : undefined;
		return json({ ok: true, map: { ...map, domain: site.domain, ...(previous ? { previous } : {}) }, says: `Built: ${Object.keys(map.files).length} files.` });
	} finally {
		busy = false;
	}
};

export const PUT: RequestHandler = async ({ url, request }) => {
	const site = siteFor(url, request);
	let body: { release?: unknown; founding?: Founding; token?: string };
	try {
		body = await request.json();
	} catch {
		error(400, 'That was not JSON.');
	}
	if (!body.founding || body.founding.domain !== site.domain) error(400, `A founding for ${site.domain} is needed.`);
	const checked = await checkRelease(body.release, { founding: body.founding });
	if (!checked.ok) return json({ ok: false, says: checked.says }, { status: 422 });
	const onDisk = await checkSite(body.release, filesOf(site.out), { all: true });
	if (!onDisk.ok) return json({ ok: false, says: `The build on this computer is not what was signed: ${onDisk.says}` }, { status: 409 });

	if (busy) return json({ ok: false, says: 'A release is already under way.' }, { status: 409 });
	busy = true;
	try {
		mkdirSync(path.join(site.out, '.well-known'), { recursive: true });
		writeFileSync(path.join(site.out, WELL_KNOWN), JSON.stringify(body.release, null, 2));

		const token = typeof body.token === 'string' && /^[A-Za-z0-9_-]{8,200}$/.test(body.token) ? body.token : undefined;
		const args = ['--yes', 'vercel', 'deploy', '--prebuilt', '--prod', ...(token ? ['--token', token] : [])];
		const carried = await run('npx', args, site.root, token);
		if (!carried.ok) {
			const signIn = /credentials|not authori[sz]ed|log ?in/i.test(carried.out);
			return json(
				{
					ok: false,
					says: signIn
						? 'Vercel would not take it: this computer is not signed in to Vercel. Keep a Vercel token for this site under Sites, or run `npx vercel login` once.'
						: 'Vercel would not take it.',
					log: tail(carried.out)
				},
				{ status: 502 }
			);
		}
		const deployment = carried.out.match(/https:\/\/[a-z0-9.-]+\.vercel\.app/gi)?.[0] ?? null;

		/* Fetch the live copy back and check it — the release, and the home page's bytes. */
		let proof = { release: false, home: false };
		for (let i = 0; i < 6 && !(proof.release && proof.home); i++) {
			if (i) await new Promise((r) => setTimeout(r, 2500));
			const served = (await live(site.vercel.checkAt)) as { signature?: string } | null;
			proof.release = served?.signature === (body.release as { signature?: string }).signature;
			try {
				const home = new Uint8Array(await (await fetch(`${site.vercel.checkAt}/`, { cache: 'no-store' })).arrayBuffer());
				proof.home = checked.content.files['index.html'] === sha(home);
			} catch {
				proof.home = false;
			}
		}
		return json({
			ok: true,
			id: checked.id,
			at: site.vercel.checkAt,
			deployment,
			proof,
			says:
				proof.release && proof.home
					? `Live at ${site.vercel.checkAt}, and checked: the served release is the one you signed, and the home page is byte for byte what it names.`
					: `Sent to Vercel${deployment ? ` (${deployment})` : ''}, but the live copy has not been checked yet — it may still be switching over.`
		});
	} finally {
		busy = false;
	}
};
