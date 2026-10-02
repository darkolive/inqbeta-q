/*
 * Setting up this computer's host (ADR-Q-018 §1–2). Development only: the
 * deployed Q answers 404, and another site can't call it (the Origin is
 * checked, and JSON bodies need a preflight this never answers).
 *
 *   GET    what this copy has: the host file it came with (if any) and
 *          whether this computer has been set up (the mark).
 *   POST   { kind: 'found', file, logo? }
 *            A host founded in the set-up cards. The invitation in the file is
 *            checked here exactly as every Q checks it; then the logo, the
 *            host file and the mark are written. Refused once set up.
 *          { kind: 'claim', proof }
 *            "I'm this host's founder": a receipt signed by the founder's DID
 *            naming the host, made in the last five minutes. Then the mark is
 *            written. Refused once set up.
 *
 * Nothing secret passes through here. Service keys come in step 3, and stay
 * in .env on this computer.
 */
import { error, json, type RequestHandler } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { checkInvitation, isInvitation, unpack } from '@inqbeta/q-core/membership';
import { checkReceipt } from '@inqbeta/q-core/seal';
import { HOME_SCHEMA, type HomeFile } from '$lib/home';
import { readHomeFile, readMark, writeHomeFile, writeLogo, writeMark } from '$lib/server/host';

export const prerender = false;

const CLAIM_SCHEMA = 'inqbeta.host-claim/1';

function door(request: Request, url: URL) {
	if (!dev) error(404, 'Not found');
	const origin = request.headers.get('origin');
	if (origin && origin !== url.origin) error(403, 'Only Q itself may do this.');
}

/** The founder of a host file, read from its own signed invitation. */
async function founderOf(f: HomeFile): Promise<{ ok: true; founder: string; name: string } | { ok: false; says: string }> {
	const inv = await unpack(f.invitation);
	if (!isInvitation(inv)) return { ok: false, says: 'The host file’s invitation can’t be read.' };
	const check = await checkInvitation(inv);
	if (!check.ok) return { ok: false, says: check.says };
	if (inv.founding.federation !== f.federation) return { ok: false, says: 'The invitation is for a different federation.' };
	return { ok: true, founder: inv.founding.root, name: inv.founding.name };
}

export const GET: RequestHandler = async ({ request, url }) => {
	door(request, url);
	const file = readHomeFile();
	const who = file ? await founderOf(file) : null;
	return json({
		local: true,
		mark: readMark(),
		file: file ? { federation: file.federation, name: who?.ok ? who.name : file.name, founder: who?.ok ? who.founder : null, holds: !!who?.ok } : null
	});
};

export const POST: RequestHandler = async ({ request, url }) => {
	door(request, url);
	if (readMark()) error(409, 'This computer already has its host set up.');
	const body = (await request.json().catch(() => null)) as
		| { kind: 'found'; file: HomeFile; logo?: string }
		| { kind: 'claim'; proof: unknown }
		| null;

	if (body?.kind === 'found') {
		const f = body.file;
		if (f?.schema !== HOME_SCHEMA) error(400, 'That isn’t a host file.');
		const who = await founderOf(f);
		if (!who.ok) error(400, who.says);
		let logo: string | undefined;
		try {
			if (body.logo) logo = writeLogo(body.logo);
		} catch (e) {
			error(400, e instanceof Error ? e.message : 'The logo couldn’t be kept.');
		}
		const { logo: _ignored, ...rest } = f;
		writeHomeFile({ ...rest, ...(logo ? { logo } : {}) });
		const mark = writeMark({ federation: f.federation, founder: who.founder, how: 'founded' });
		return json({ ok: true, mark, logo });
	}

	if (body?.kind === 'claim') {
		const file = readHomeFile();
		if (!file) error(400, 'This copy has no host file to claim.');
		const who = await founderOf(file);
		if (!who.ok) error(400, who.says);
		const proof = body.proof as { did?: string; content?: { schema?: string; federation?: string; at?: string } };
		const check = await checkReceipt(proof);
		if (!check.ok) error(400, 'That proof doesn’t hold up.');
		const c = proof.content;
		const fresh = c?.at && Math.abs(Date.now() - Date.parse(c.at)) < 5 * 60_000;
		if (c?.schema !== CLAIM_SCHEMA || c.federation !== file.federation || !fresh) error(400, 'That proof isn’t for this host, or it’s too old.');
		if (proof.did !== who.founder) error(403, `Your passkey isn’t ${who.name}’s founder.`);
		const mark = writeMark({ federation: file.federation, founder: who.founder, how: 'claimed' });
		return json({ ok: true, mark });
	}

	error(400, 'Say what to do: found, or claim.');
};
