/*
 * Sending keys to the live site (ADR-Q-018 §5). Development only, like the
 * rest of /api/host: the deployed Q answers 404, and the Origin is checked.
 *
 *   GET   what the Vercel project has: which of Q's settings, where they
 *         apply, and when they last changed. Never a value.
 *   POST  { record } — send one setting. `record` is signed by this host's
 *         founder in the last five minutes, naming the host, the setting, the
 *         project and the last four of the value in .env. The value itself is
 *         read here, from .env: it never passes through the page.
 *
 * Only Q's service settings can be sent. Vercel's own token, project and
 * team stay on this computer, and so does anything else in .env.
 */
import { error, json, type RequestHandler } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { checkReceipt } from '@inqbeta/q-core/seal';
import { HOST_SENT_SCHEMA, SENDABLE, endsOf, isSecret } from '$lib/host-services';
import { readEnvFile } from '$lib/server/env-file';
import { readMark } from '$lib/server/host';
import { sendToVercel, vercelSettings, type VercelPlace } from '$lib/server/vercel';

export const prerender = false;

function door(request: Request, url: URL) {
	if (!dev) error(404, 'Not found');
	const origin = request.headers.get('origin');
	if (origin && origin !== url.origin) error(403, 'Only Q itself may do this.');
}

function place(e: Record<string, string>): VercelPlace | null {
	return e.VERCEL_TOKEN && e.VERCEL_PROJECT ? { token: e.VERCEL_TOKEN, project: e.VERCEL_PROJECT, ...(e.VERCEL_TEAM ? { team: e.VERCEL_TEAM } : {}) } : null;
}

export const GET: RequestHandler = async ({ request, url }) => {
	door(request, url);
	const p = place(readEnvFile());
	if (!p) return json({ connected: false });
	try {
		const all = await vercelSettings(p);
		const mine = all.filter((e) => SENDABLE.has(e.key)).map((e) => ({ key: e.key, target: e.target, type: e.type, updatedAt: e.updatedAt }));
		return json({ connected: true, project: p.project, settings: mine, others: all.length - mine.length });
	} catch (e) {
		return json({ connected: false, project: p.project, says: e instanceof Error ? e.message : 'Vercel didn’t answer.' });
	}
};

export const POST: RequestHandler = async ({ request, url }) => {
	door(request, url);
	const mark = readMark();
	if (!mark) error(409, 'Set up this computer’s host first.');
	const env = readEnvFile();
	const p = place(env);
	if (!p) error(400, 'Connect Vercel first: its token and project.');
	const body = (await request.json().catch(() => null)) as { record?: { did?: string; content?: { schema?: string; host?: string; setting?: string; ends?: string; to?: string; project?: string; at?: string } } } | null;
	const c = body?.record?.content;
	if (!c || c.schema !== HOST_SENT_SCHEMA || c.to !== 'vercel' || !c.setting || !SENDABLE.has(c.setting)) error(400, 'That setting can’t be sent.');
	if (!(await checkReceipt(body!.record)).ok) error(400, 'The record doesn’t hold up.');
	if (body!.record!.did !== mark.founder) error(403, 'Only the host’s founder can send its keys.');
	if (c.host !== mark.federation || c.project !== p.project) error(400, 'That record is for a different host or project.');
	if (!c.at || Math.abs(Date.now() - Date.parse(c.at)) > 5 * 60_000) error(400, 'That record is too old. Try again.');
	const value = (env[c.setting] ?? '').trim();
	if (!value) error(400, `${c.setting} isn’t set on this computer.`);
	if (c.ends !== endsOf(value, isSecret(c.setting))) error(400, 'The key on this computer changed. Look again, then send.');
	try {
		const places = await sendToVercel(p, c.setting, value, isSecret(c.setting));
		return json({ ok: true, places });
	} catch (e) {
		error(502, e instanceof Error ? e.message : 'Vercel didn’t take it.');
	}
};
