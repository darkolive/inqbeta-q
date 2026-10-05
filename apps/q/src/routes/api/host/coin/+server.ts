/*
 * The coin's own picture (5 October 2026, ADR-Q-035): the bank's logo, say,
 * as its coin. Development only, like the rest of the host's console: the
 * founder signs what they're keeping (its SHA-256), and the picture is kept in
 * static/host/ beside the logo, going live with the next release.
 *
 *   POST { upload: signed { schema: inqbeta.coin-image/1, host, sha256, at }, image: data URL } → { path }
 */
import { error, json, type RequestHandler } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { createHash } from 'node:crypto';
import { checkReceipt } from '@inqbeta/q-core/seal';
import { readMark, writeCoinImage } from '$lib/server/host';

export const prerender = false;
const FRESH_MS = 5 * 60 * 1000;

export const POST: RequestHandler = async ({ request, url }) => {
	if (!dev) error(404, 'Not found');
	const origin = request.headers.get('origin');
	if (origin && origin !== url.origin) error(403, 'Only Q itself may do this.');
	const mark = readMark();
	if (!mark) error(409, 'Set up this computer’s host first.');
	const body = (await request.json().catch(() => null)) as { upload?: { did?: string; content?: { schema?: string; host?: string; sha256?: string; at?: string } }; image?: string } | null;
	const c = body?.upload?.content;
	if (!c || c.schema !== 'inqbeta.coin-image/1' || typeof body?.image !== 'string') error(400, 'Send the picture, signed.');
	if (!(await checkReceipt(body.upload)).ok) error(400, 'The signature doesn’t hold up.');
	if (body.upload!.did !== mark.founder) error(403, 'Only the host’s founder can choose its coin.');
	if (c.host !== mark.federation) error(400, 'That’s for a different host.');
	if (!c.at || Math.abs(Date.now() - Date.parse(c.at)) > FRESH_MS) error(400, 'That’s too old. Try again.');
	const b64 = /^data:[a-z+/]+;base64,([A-Za-z0-9+/=]+)$/.exec(body.image)?.[1] ?? '';
	if (createHash('sha256').update(Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0))).digest('hex') !== c.sha256) error(400, 'The picture isn’t the one signed.');
	try {
		return json({ ok: true, path: writeCoinImage(body.image) });
	} catch (e) {
		error(400, e instanceof Error ? e.message : 'The picture couldn’t be kept.');
	}
};
