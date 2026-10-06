/*
 * Registering with Incubator (ADR-Q-021 addendum, 6 October 2026).
 *
 *   POST { card }     a federation's card, signed by its key and founder,
 *                     from any host's console. Checked against the live
 *                     site's own founding (its incubator.json), countersigned
 *                     by Incubator's registrar, filed on Incubator's node.
 *   GET               the public, running registrations, and the registrar's DID.
 *   GET ?federation=  one federation's whole history.
 *
 * Open to other origins: a new host's console registers from its own address.
 */
import { json, type RequestHandler } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { checkCard, register, type FederationCard } from '@inqbeta/q-core/registration';
import { checkFederationFounding } from '@inqbeta/q-core/federations';
import { isInvitation, unpack } from '@inqbeta/q-core/membership';
import { readHomeFile } from '$lib/server/host';
import { registrarIdentity } from '$lib/server/registrar';
import { checkCore, knownReleases } from '$lib/server/core';
import { coreInWords } from '@inqbeta/q-core/core-served';

export const prerender = false;
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type' };
const say = (says: string, status = 409) => json({ ok: false, says }, { status, headers: CORS });

function storage(): string | null {
	const s = readHomeFile()?.services?.storage;
	return typeof s === 'string' && s ? s.replace(/\/$/, '') : null;
}

export const OPTIONS: RequestHandler = async () => new Response(null, { status: 204, headers: CORS });

export const GET: RequestHandler = async ({ url }) => {
	const node = storage();
	let registrar: string | null = null;
	try {
		registrar = (await registrarIdentity()).did;
	} catch {
		registrar = null;
	}
	if (!node) return json({ ok: true, registrar, items: [] }, { headers: CORS });
	const fed = url.searchParams.get('federation');
	const r = await fetch(fed ? `${node}/registry/${fed}` : `${node}/registry`, { signal: AbortSignal.timeout(10_000) }).catch(() => null);
	const items = r?.ok ? (((await r.json().catch(() => null)) as { items?: unknown[] } | null)?.items ?? []) : [];
	return json({ ok: true, registrar, items }, { headers: { ...CORS, 'cache-control': 'public, max-age=60' } });
};

export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json().catch(() => null)) as { card?: FederationCard } | null;
	const card = body?.card;
	const first = await checkCard(card);
	if (!card || !first.ok) return say(first.ok ? 'Send a card.' : first.says, 400);
	/* A localhost site registers only with an Incubator on localhost too: testing on your own machine. */
	const testing = dev || new URL(request.url).hostname === 'localhost';
	if (card.site.startsWith('http://') && !testing) return say('Register your live site’s address (https), once it’s live.');

	/* The site itself must serve this federation's founding: nobody registers a site that isn't theirs. */
	const home = await fetch(`${card.site}/incubator.json`, { signal: AbortSignal.timeout(8_000), headers: { accept: 'application/json' } }).catch(() => null);
	const file = home?.ok ? ((await home.json().catch(() => null)) as { federation?: string; invitation?: string } | null) : null;
	if (!file?.invitation) return say(`Incubator couldn’t read ${card.site}/incubator.json. Is the site live?`);
	const inv = await unpack(file.invitation);
	if (!isInvitation(inv)) return say('The site’s invitation can’t be read.');
	const founded = await checkFederationFounding(inv.founding);
	if (!founded.ok) return say(`The site’s founding doesn’t hold: ${founded.says}`);
	const matches = await checkCard(card, inv.founding);
	if (!matches.ok) return say(matches.says);
	if (file.federation !== card.federation) return say('The site serves a different federation.');

	let registrar;
	try {
		registrar = await registrarIdentity();
	} catch (e) {
		return say(e instanceof Error ? e.message : String(e), 503);
	}
	const node = storage();
	if (!node) return say('Incubator has no storage node for its registry yet.', 503);

	/* Trust travels down (ADR-Q-019 addendum): the core the site serves is Q's as released, or a branch that says where its source is. */
	const releases = await knownReleases(node, registrar, new URL(request.url).origin);
	const core = await checkCore(card.site, releases, card.source);
	if (core.kind === 'changed' && !dev)
		return say(`${coreInWords(core)} To register a branch of Q, name its repository, branch and commit on the card, so anyone can follow what’s different.`);
	const registered = await register(
		registrar,
		card,
		['Signed by the federation’s key and its founder', `Its site, ${card.site}, serves its two-signature founding`, coreInWords(core)],
		new Date(),
		core
	);
	const kept = await fetch(`${node}/registry/${card.federation}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ card, registered }), signal: AbortSignal.timeout(10_000) }).catch(() => null);
	if (!kept?.ok) return say(`Incubator’s node didn’t keep it: ${kept ? ((await kept.json().catch(() => ({}))) as { says?: string }).says ?? kept.status : 'no answer'}.`, 502);
	return json({ ok: true, registered, page: `${new URL(request.url).origin}/registered/${encodeURIComponent(card.federation)}` }, { headers: CORS });
};
