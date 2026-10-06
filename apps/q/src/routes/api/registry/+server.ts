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
import { acceptPutForward, checkCard, checkPutForward, checkRegistration, clubOnHost, latestCard, register, type FederationCard, type PutForward, type RegisteredReceipt } from '@inqbeta/q-core/registration';
import { checkFederationFounding } from '@inqbeta/q-core/federations';
import { isInvitation, unpack } from '@inqbeta/q-core/membership';
import { readHomeFile } from '$lib/server/host';
import { hostOf } from '$lib/server/mint';
import { registrarIdentity } from '$lib/server/registrar';
import { checkCore, knownReleases } from '$lib/server/core';
import { coreInWords } from '@inqbeta/q-core/core-served';

export const prerender = false;
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type' };
const say = (says: string, status = 409) => json({ ok: false, says }, { status, headers: CORS });

/*
 * Incubator's node, from its home file. On Vercel the static files aren't on
 * the server's disk, so it's read the way the mint reads it: from the site.
 */
async function storageAt(origin: string): Promise<string | null> {
	const s = readHomeFile()?.services?.storage;
	if (typeof s === 'string' && s) return s.replace(/\/$/, '');
	return (await hostOf(origin).catch(() => null))?.storage ?? null;
}

export const OPTIONS: RequestHandler = async () => new Response(null, { status: 204, headers: CORS });

export const GET: RequestHandler = async ({ url }) => {
	const node = await storageAt(url.origin);
	let registrar: string | null = null;
	try {
		registrar = (await registrarIdentity()).did;
	} catch {
		registrar = null;
	}
	if (!node) return json({ ok: true, registrar, items: [] }, { headers: CORS });
	const fed = url.searchParams.get('federation');
	const clubs = url.searchParams.get('clubs');
	const DID = /^did:key:z[1-9A-HJ-NP-Za-km-z]+$/;
	if ((fed && !DID.test(fed)) || (clubs && !DID.test(clubs))) return say('That isn’t a federation’s ID.', 400);
	const r = await fetch(clubs ? `${node}/registry/${clubs}/clubs` : fed ? `${node}/registry/${fed}` : `${node}/registry`, { signal: AbortSignal.timeout(10_000) }).catch(() => null);
	const items = r?.ok ? (((await r.json().catch(() => null)) as { items?: unknown[] } | null)?.items ?? []) : [];
	return json({ ok: true, registrar, items }, { headers: { ...CORS, 'cache-control': 'public, max-age=60' } });
};

type Registrar = Awaited<ReturnType<typeof registrarIdentity>>;
const origin = (u: string) => {
	try {
		return new URL(u).origin;
	} catch {
		return '';
	}
};
const nodeSays = async (r: Response | null) => (r ? (((await r.json().catch(() => ({}))) as { says?: string }).says ?? r.status) : 'no answer');

/** A federation's latest registration that holds now, read from Incubator's own node. */
async function holding(node: string, fed: string, registrar: string): Promise<{ card: FederationCard; registered: RegisteredReceipt } | null> {
	const r = await fetch(`${node}/registry/${fed}`, { signal: AbortSignal.timeout(10_000) }).catch(() => null);
	const items = r?.ok ? (((await r.json().catch(() => null)) as { items?: { card: FederationCard; registered: RegisteredReceipt }[] } | null)?.items ?? []) : [];
	const card = await latestCard(items.map((x) => x.card));
	if (!card) return null;
	for (const x of [...items].reverse()) if (x.card.at === card.at && (await checkRegistration(x.registered, card, registrar)).ok) return { card, registered: x.registered };
	return null;
}

async function registrarOr(): Promise<Registrar | Response> {
	try {
		return await registrarIdentity();
	} catch (e) {
		return say(e instanceof Error ? e.message : String(e), 503);
	}
}

/* A host's caretaker puts a club forward. */
async function putForwardClub(p: PutForward | undefined, node: string, registrar: Registrar) {
	const ok = await checkPutForward(p);
	if (!p || !ok.ok) return say(ok.says, 400);
	const host = await holding(node, p.host, registrar.did);
	if (!host) return say('Your host isn’t registered with Incubator. Register it first; then its clubs can be.');
	if (host.card.founder !== p.caretaker) return say('Only the host’s founder can put its clubs forward.');
	const accepted = await acceptPutForward(registrar, p);
	const kept = await fetch(`${node}/registry/${p.host}/clubs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(accepted), signal: AbortSignal.timeout(10_000) }).catch(() => null);
	if (!kept?.ok) return say(`Incubator’s node didn’t keep it: ${await nodeSays(kept)}.`, 502);
	return json({ ok: true, accepted }, { headers: CORS });
}

async function keep(node: string, card: FederationCard, registered: RegisteredReceipt, request: Request) {
	const kept = await fetch(`${node}/registry/${card.federation}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ card, registered }), signal: AbortSignal.timeout(10_000) }).catch(() => null);
	if (!kept?.ok) return say(`Incubator’s node didn’t keep it: ${await nodeSays(kept)}.`, 502);
	return json({ ok: true, registered, page: `${new URL(request.url).origin}/registered/${encodeURIComponent(card.federation)}` }, { headers: CORS });
}

export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json().catch(() => null)) as { card?: FederationCard; putForward?: PutForward } | null;
	const node = await storageAt(new URL(request.url).origin);
	if (!node) return say('Incubator has no storage node for its registry yet.', 503);
	const registrar = await registrarOr();
	if (registrar instanceof Response) return registrar;
	if (body?.putForward) return putForwardClub(body.putForward, node, registrar);

	const card = body?.card;
	const first = await checkCard(card);
	if (!card || !first.ok) return say(first.ok ? 'Send a card.' : first.says, 400);
	/* A localhost site registers only with an Incubator on localhost too: testing on your own machine. */
	const testing = dev || new URL(request.url).hostname === 'localhost';
	if (card.site.startsWith('http://') && !testing) return say('Register your live site’s address (https), once it’s live.');

	/* A club, through its host (ADR-Q-019 addendum: trust travels down). */
	if (card.host) {
		const host = await holding(node, card.host, registrar.did);
		if (!host) return say('Its host isn’t registered with Incubator, so its clubs can’t be either.');
		const hostCore = host.registered.content.core;
		if (!hostCore || (hostCore.kind === 'changed' && !dev)) return say('Its host’s core hasn’t been checked by Incubator, so its clubs can’t be registered yet.');
		if (origin(card.site) !== origin(host.card.site)) return say(`A club’s site is its host’s: ${host.card.site}.`);
		const list = await fetch(`${node}/registry/${card.host}/clubs`, { signal: AbortSignal.timeout(10_000) }).catch(() => null);
		const items = list?.ok ? (((await list.json().catch(() => null)) as { items?: unknown[] } | null)?.items ?? []) : [];
		const on = await clubOnHost(items, card.host, card.federation, registrar.did);
		if (!on) return say(`${host.card.name} hasn’t put this club forward yet. Ask its caretaker: they put it forward once, then you register.`);
		const registered = await register(
			registrar,
			card,
			['Signed by the club’s key and its founder', `Put forward by its host, ${host.card.name}, which is registered with Incubator`, `Through its host: ${coreInWords(hostCore)}`],
			new Date(),
			hostCore,
			card.host
		);
		return keep(node, card, registered, request);
	}

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
	if (file.federation !== card.federation) return say('The site serves a different federation. A club on a host registers through its host.');

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
	return keep(node, card, registered, request);
};
