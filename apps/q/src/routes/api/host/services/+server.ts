/*
 * This copy's services (ADR-Q-018 §4). Development only, like the rest of
 * /api/host: the deployed Q answers 404, and the Origin is checked.
 *
 *   GET   which settings are set, read fresh from apps/q/.env — never a key:
 *         set or not, and the last four characters of a secret. Says which
 *         changes `pnpm dev` hasn't picked up yet.
 *   POST  { record, value } — set one. `record` is a service record signed by
 *         this host's founder in the last five minutes, naming this host, the
 *         setting and endsOf(value). Then the value goes into .env, and the
 *         record (no secret in it) into static/host/services.json — except for
 *         settings that stay on this computer, which aren't published at all.
 */
import { error, json, type RequestHandler } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { checkReceipt } from '@inqbeta/q-core/seal';
import { HOST_SERVICE_SCHEMA, HOST_SERVICES, SETTABLE, endsOf, isLocalOnly, isSecret, servicesFrom, type HostServiceRecord } from '$lib/host-services';
import { readEnvFile, setEnvValue } from '$lib/server/env-file';
import { keepServiceRecord, readMark, readServicesFile } from '$lib/server/host';

export const prerender = false;

function door(request: Request, url: URL) {
	if (!dev) error(404, 'Not found');
	const origin = request.headers.get('origin');
	if (origin && origin !== url.origin) error(403, 'Only Q itself may do this.');
}

function setAtNow(): Record<string, string> {
	const f = readServicesFile();
	return Object.fromEntries((f?.records ?? []).map((r) => [r.content.setting, r.content.at]));
}

export const GET: RequestHandler = ({ request, url }) => {
	door(request, url);
	const services = servicesFrom(readEnvFile(), { running: env, setAt: setAtNow() });
	return json({ services, restart: services.some((s) => s.settings.some((x) => x.restart)) });
};

export const POST: RequestHandler = async ({ request, url }) => {
	door(request, url);
	const mark = readMark();
	if (!mark) error(409, 'Set up this computer’s host first.');
	const body = (await request.json().catch(() => null)) as { record?: { did?: string; content?: HostServiceRecord }; value?: string } | null;
	const value = typeof body?.value === 'string' ? body.value.trim() : '';
	const c = body?.record?.content;
	if (!c || c.schema !== HOST_SERVICE_SCHEMA || !SETTABLE.has(c.setting)) error(400, 'That isn’t a setting Q looks after.');
	if (!value) error(400, 'Type the value first.');
	if (!(await checkReceipt(body!.record)).ok) error(400, 'The record doesn’t hold up.');
	if (body!.record!.did !== mark.founder) error(403, 'Only the host’s founder can set its services.');
	if (c.host !== mark.federation) error(400, 'That record is for a different host.');
	if (!c.at || Math.abs(Date.now() - Date.parse(c.at)) > 5 * 60_000) error(400, 'That record is too old. Try again.');
	if (c.ends !== endsOf(value, isSecret(c.setting))) error(400, 'The record doesn’t match what was typed.');
	if (!HOST_SERVICES.some((s) => s.id === c.service && s.settings.some((x) => x.name === c.setting))) error(400, 'That setting belongs to another service.');
	try {
		setEnvValue(c.setting, value);
	} catch (e) {
		error(400, e instanceof Error ? e.message : 'It couldn’t be saved.');
	}
	/* What stays on this computer (Vercel's token) isn't published, even as a record. */
	if (!isLocalOnly(c.setting)) keepServiceRecord(mark.federation, body!.record as never);
	return json({ ok: true, restart: true });
};
