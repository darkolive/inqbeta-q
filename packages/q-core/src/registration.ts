/*
 * Registering a federation with Incubator (ADR-Q-021 addendum, ADR-Q-019
 * §3b), 6 October 2026.
 *
 * Darren: "by that person registering on our site, they receipt their
 * federation, register it with Incubator, and it appears on our directory …
 * just like a minted coin does … it takes you to the receipt of the
 * federation, the receipt page. And you can click on go to site … that can
 * be updated any given time through the receipt … that's how we decentralise,
 * but we can always be found somewhere … they can still be invisible. But if
 * they want to be found, then they can."
 *
 *   federation card   signed by the federation's key AND its founder: name,
 *                     purpose, logo, the site's address, who may find it
 *                     (visibility), the Q it runs, and the card before it.
 *   registration      Incubator's countersignature (its registrar key),
 *                     having checked the card, and that the site itself
 *                     serves this federation's two-signature founding. Lasts
 *                     90 days; renewing is registering again.
 *
 * Registering is authentication; being listed is a choice, on the card.
 *
 * Pure: no storage, no window.
 */
import { canonical, unb64url, sha256 } from './canonical';
import { publicKeyFrom, toDid } from './did';
import { checkReceipt, sealWith, type Signer, type SealedReceipt } from './seal';
import type { Identity } from './passkey';
import type { FederationFounding } from './federations';
import { sourceProblem, type CoreFinding, type SourceOf } from './core-served';

export const FEDERATION_CARD_SCHEMA = 'inqbeta.federation-card/1';
export const REGISTERED_SCHEMA = 'inqbeta.federation-registered/1';
export const REGISTRATION_DAYS = 90;

export type Visibility = 'public' | 'members' | 'unlisted';
export const VISIBILITY: { id: Visibility; called: string; means: string }[] = [
	{ id: 'public', called: 'Public', means: 'Anyone can find it in Incubator’s directory.' },
	{ id: 'members', called: 'Only its people', means: 'Registered and checkable, but only members and partners are shown it.' },
	{ id: 'unlisted', called: 'Unlisted', means: 'Registered and checkable by anyone with its link, never listed.' }
];

type Signature = { by: string; did: string; signature: string };

export interface CardStatement {
	schema: typeof FEDERATION_CARD_SCHEMA;
	event: 'federation.card';
	federation: string;
	founder: string;
	name: string;
	purpose: string;
	/** Where its site is: https, or http://localhost while testing. */
	site: string;
	/** A path on the site, or nothing. */
	logo?: string;
	visibility: Visibility;
	/** The Q it runs. */
	runs: { q: string; commit?: string };
	/** A club on a host names its host's federation (ADR-Q-019 addendum: trust travels down). */
	host?: string;
	/** A branch of Q names where its source is (ADR-Q-019 addendum); a straight copy needn't. */
	source?: SourceOf;
	/** The card before this one, by hash; null for the first. */
	previous: string | null;
	at: string;
}
export type FederationCard = CardStatement & { signatures: Signature[] };

const siteOk = (s: string) => /^https:\/\/[a-z0-9.-]+(:\d+)?(\/[^\s]*)?$/i.test(s) || /^http:\/\/localhost(:\d+)?(\/[^\s]*)?$/.test(s);
const unsigned = (x: { signatures: Signature[] }) => {
	const { signatures: _s, ...rest } = x;
	return rest;
};
async function verify(did: string, doc: unknown, signature: string): Promise<boolean> {
	try {
		const key = await crypto.subtle.importKey('raw', publicKeyFrom(did), { name: 'Ed25519' }, false, ['verify']);
		return await crypto.subtle.verify({ name: 'Ed25519' }, key, unb64url(signature), new TextEncoder().encode(canonical(doc)));
	} catch {
		return false;
	}
}

export async function hashCard(c: FederationCard): Promise<string> {
	return `receipt:sha256:${await sha256(canonical(c))}`;
}

/** Make a federation's card: the federation's key and its founder both sign. */
export async function makeCard(federation: Signer, founder: Signer, o: Omit<CardStatement, 'schema' | 'event' | 'federation' | 'founder' | 'at'>, now = new Date()): Promise<FederationCard> {
	if (!o.name.trim()) throw new Error('Give it a name.');
	if (!siteOk(o.site.trim())) throw new Error('The site’s address should start https://');
	if (!VISIBILITY.some((v) => v.id === o.visibility)) throw new Error('Choose who may find it.');
	if (o.source && sourceProblem(o.source)) throw new Error(sourceProblem(o.source)!);
	const st: CardStatement = {
		schema: FEDERATION_CARD_SCHEMA,
		event: 'federation.card',
		federation: toDid(federation.did),
		founder: toDid(founder.did),
		name: o.name.trim(),
		purpose: o.purpose.trim(),
		site: o.site.trim().replace(/\/$/, ''),
		...(o.logo ? { logo: o.logo } : {}),
		visibility: o.visibility,
		runs: o.runs,
		...(o.host ? { host: o.host } : {}),
		...(o.source ? { source: { repo: o.source.repo.trim().replace(/\/$/, ''), branch: o.source.branch.trim(), commit: o.source.commit.trim() } } : {}),
		previous: o.previous,
		at: now.toISOString()
	};
	return {
		...st,
		signatures: [
			{ by: 'federation', did: st.federation, signature: await federation.signCanonical(st) },
			{ by: 'founder', did: st.founder, signature: await founder.signCanonical(st) }
		]
	};
}

type Check = { ok: true; says: string } | { ok: false; says: string };

/** Does a card hold: both signatures, a proper site, and, with a founding, that founding's federation and founder. */
export async function checkCard(x: unknown, founding?: FederationFounding): Promise<Check> {
	const c = x as FederationCard;
	if (c?.schema !== FEDERATION_CARD_SCHEMA || !Array.isArray(c.signatures)) return { ok: false, says: 'This isn’t a federation card.' };
	const sig = (by: string, did: string) => c.signatures.find((s) => s.by === by && s.did === did);
	const f = sig('federation', c.federation);
	const r = sig('founder', c.founder);
	if (!f || !(await verify(c.federation, unsigned(c), f.signature))) return { ok: false, says: 'The federation’s key didn’t sign this card.' };
	if (!r || !(await verify(c.founder, unsigned(c), r.signature))) return { ok: false, says: 'Its founder didn’t sign this card.' };
	if (!siteOk(c.site)) return { ok: false, says: 'Its site’s address isn’t one Q can check.' };
	if (!VISIBILITY.some((v) => v.id === c.visibility)) return { ok: false, says: 'It doesn’t say who may find it.' };
	if (c.host !== undefined && (!/^did:key:z[1-9A-HJ-NP-Za-km-z]+$/.test(c.host) || c.host === c.federation)) return { ok: false, says: 'Its host isn’t a federation.' };
	if (c.source && sourceProblem(c.source)) return { ok: false, says: `Its source: ${sourceProblem(c.source)}` };
	if (founding && (founding.federation !== c.federation || founding.root !== c.founder)) return { ok: false, says: 'The card isn’t from the federation, or the founder, that the site was founded by.' };
	return { ok: true, says: `${c.name}, signed by the federation and its founder.` };
}

export interface Registered {
	schema: typeof REGISTERED_SCHEMA;
	source: 'inqbeta:incubator/registry';
	federation: string;
	/** The card it registers, by hash. */
	card: string;
	visibility: Visibility;
	site: string;
	/** What Incubator checked, each in a line. */
	checked: string[];
	/** What Incubator found of the core the site serves (ADR-Q-019 addendum); for a club, its host's. */
	core?: CoreFinding;
	/** For a club: the host it was registered through. It holds only while its host does. */
	host?: string;
	until: string;
	at: string;
}
export type RegisteredReceipt = SealedReceipt & { content: Registered };

/** Incubator's countersignature, once it has checked. */
export async function register(registrar: Pick<Identity, 'did' | 'publicKey' | 'signing'>, card: FederationCard, checked: string[], now = new Date(), core?: CoreFinding, host?: string): Promise<RegisteredReceipt> {
	const content: Registered = {
		schema: REGISTERED_SCHEMA,
		source: 'inqbeta:incubator/registry',
		federation: card.federation,
		card: await hashCard(card),
		visibility: card.visibility,
		site: card.site,
		checked,
		...(core ? { core } : {}),
		...(host ? { host } : {}),
		until: new Date(now.getTime() + REGISTRATION_DAYS * 86_400_000).toISOString(),
		at: now.toISOString()
	};
	return (await sealWith(registrar, content)) as RegisteredReceipt;
}

/** Does a registration hold for this card, signed by Incubator's registrar, still running? */
export async function checkRegistration(x: unknown, card: FederationCard, registrar: string, now = new Date()): Promise<Check> {
	const r = x as RegisteredReceipt;
	if (r?.content?.schema !== REGISTERED_SCHEMA) return { ok: false, says: 'This isn’t a registration.' };
	if (r.did !== registrar || !(await checkReceipt(r)).ok) return { ok: false, says: 'Incubator didn’t sign this registration.' };
	if (r.content.card !== (await hashCard(card)) || r.content.federation !== card.federation) return { ok: false, says: 'It registers a different card.' };
	if (Date.parse(r.content.until) <= now.getTime()) return { ok: false, says: `Its registration ran out on ${r.content.until.slice(0, 10)}.` };
	return { ok: true, says: `Registered with Incubator until ${r.content.until.slice(0, 10)}.` };
}

/** The latest card in a federation's history: the newest that holds and names the one before it (or is the first). */
export async function latestCard(cards: unknown[]): Promise<FederationCard | null> {
	const ok: FederationCard[] = [];
	for (const c of cards) if ((await checkCard(c)).ok) ok.push(c as FederationCard);
	const hashes = new Set(await Promise.all(ok.map(hashCard)));
	const chained = ok.filter((c) => c.previous === null || hashes.has(c.previous));
	return chained.sort((a, b) => b.at.localeCompare(a.at))[0] ?? null;
}

/*
 * A host puts a club forward (ADR-Q-019 addendum, 6 October 2026). Trust
 * travels down: a club on a host is registered only through its host. The
 * host's federation key and its caretaker sign that the club lives on it;
 * Incubator countersigns once it has checked the host is registered; then the
 * club can register, and holds only while its host does.
 */
export const PUT_FORWARD_SCHEMA = 'inqbeta.put-forward/1';
export const CLUB_ON_HOST_SCHEMA = 'inqbeta.club-on-host/1';

export interface PutForwardStatement {
	schema: typeof PUT_FORWARD_SCHEMA;
	event: 'host.put-forward';
	host: string;
	caretaker: string;
	club: string;
	/** The club's name, as the host knows it. */
	name: string;
	at: string;
}
export type PutForward = PutForwardStatement & { signatures: Signature[] };

export async function putForward(host: Signer, caretaker: Signer, o: { club: string; name: string }, now = new Date()): Promise<PutForward> {
	if (!/^did:key:z[1-9A-HJ-NP-Za-km-z]+$/.test(o.club)) throw new Error('That isn’t a federation’s ID.');
	const st: PutForwardStatement = { schema: PUT_FORWARD_SCHEMA, event: 'host.put-forward', host: toDid(host.did), caretaker: toDid(caretaker.did), club: o.club, name: o.name.trim(), at: now.toISOString() };
	if (st.club === st.host) throw new Error('A host doesn’t put itself forward; it registers.');
	return {
		...st,
		signatures: [
			{ by: 'host', did: st.host, signature: await host.signCanonical(st) },
			{ by: 'caretaker', did: st.caretaker, signature: await caretaker.signCanonical(st) }
		]
	};
}

export async function checkPutForward(x: unknown, founding?: FederationFounding): Promise<Check> {
	const p = x as PutForward;
	if (p?.schema !== PUT_FORWARD_SCHEMA || !Array.isArray(p.signatures)) return { ok: false, says: 'This isn’t a host putting a club forward.' };
	const h = p.signatures.find((s) => s.by === 'host' && s.did === p.host);
	const c = p.signatures.find((s) => s.by === 'caretaker' && s.did === p.caretaker);
	if (!h || !(await verify(p.host, unsigned(p), h.signature))) return { ok: false, says: 'The host’s key didn’t sign this.' };
	if (!c || !(await verify(p.caretaker, unsigned(p), c.signature))) return { ok: false, says: 'Its caretaker didn’t sign this.' };
	if (founding && (founding.federation !== p.host || founding.root !== p.caretaker)) return { ok: false, says: 'It isn’t from the host’s own founder.' };
	return { ok: true, says: `${p.name}, put forward by its host.` };
}

export interface ClubOnHost {
	schema: typeof CLUB_ON_HOST_SCHEMA;
	source: 'inqbeta:incubator/registry';
	host: string;
	club: string;
	putForward: PutForward;
	at: string;
}
export type ClubOnHostReceipt = SealedReceipt & { content: ClubOnHost };

/** Incubator's countersignature on a host putting a club forward. */
export async function acceptPutForward(registrar: Pick<Identity, 'did' | 'publicKey' | 'signing'>, p: PutForward, now = new Date()): Promise<ClubOnHostReceipt> {
	const content: ClubOnHost = { schema: CLUB_ON_HOST_SCHEMA, source: 'inqbeta:incubator/registry', host: p.host, club: p.club, putForward: p, at: now.toISOString() };
	return (await sealWith(registrar, content)) as ClubOnHostReceipt;
}

/** Is this club put forward by this host, countersigned by Incubator's registrar? */
export async function clubOnHost(list: unknown[], host: string, club: string, registrar: string): Promise<ClubOnHostReceipt | null> {
	for (const x of [...list].reverse()) {
		const r = x as ClubOnHostReceipt;
		if (r?.content?.schema !== CLUB_ON_HOST_SCHEMA || r.did !== registrar || r.content.host !== host || r.content.club !== club) continue;
		if ((await checkReceipt(r)).ok && (await checkPutForward(r.content.putForward)).ok && r.content.putForward.host === host && r.content.putForward.club === club) return r;
	}
	return null;
}
