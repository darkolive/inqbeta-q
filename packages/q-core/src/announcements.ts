/*
 * Announcements (ADR-Q-016 §6): a federation telling its members something.
 *
 * Signed by the FEDERATION key, so only whoever holds it — the caretaker,
 * by their passkey — can announce. Each has a lifetime: it stays in members'
 * bells, read or not, until `until` passes, then it goes. Checked by every
 * reader against the federation's DID; an announcement that doesn't check out
 * is never shown, wherever it was served from.
 */
import { canonical, b64url, unb64url } from './canonical';
import { publicKeyFrom, toDid } from './did';
import type { Signer } from './seal';

export const ANNOUNCEMENT_SCHEMA = 'inqbeta.announcement/1';

export interface AnnouncementStatement {
	schema: typeof ANNOUNCEMENT_SCHEMA;
	event: 'federation.announced';
	federation: string;
	/** Random, so two announcements with the same words are still two. */
	id: string;
	title: string;
	says: string;
	/** An optional action: a link and what the button says ("Try it"). */
	action?: { href: string; label: string };
	at: string;
	/** ISO. After this it is no longer shown. */
	until: string;
}
export type Announcement = AnnouncementStatement & { signatures: { by: 'federation'; did: string; signature: string }[] };

const MOST_DAYS = 365;

/** Write and sign one. Only the federation's own key can. */
export async function makeAnnouncement(
	federation: Signer,
	o: { federationDid: string; title: string; says: string; action?: { href: string; label: string }; days: number; now?: Date }
): Promise<Announcement> {
	if (toDid(federation.did) !== o.federationDid) throw new Error('Only the federation’s own key can announce.');
	const title = o.title.trim(), says = o.says.trim();
	if (!title) throw new Error('An announcement needs a title.');
	if (!says) throw new Error('Say something in it.');
	const now = o.now ?? new Date();
	const days = Math.max(1, Math.min(MOST_DAYS, Math.round(o.days)));
	const statement: AnnouncementStatement = {
		schema: ANNOUNCEMENT_SCHEMA,
		event: 'federation.announced',
		federation: o.federationDid,
		id: b64url(crypto.getRandomValues(new Uint8Array(9))),
		title,
		says,
		...(o.action?.href.trim() && o.action.label.trim() ? { action: { href: o.action.href.trim(), label: o.action.label.trim() } } : {}),
		at: now.toISOString(),
		until: new Date(now.getTime() + days * 86_400_000).toISOString()
	};
	return { ...statement, signatures: [{ by: 'federation', did: o.federationDid, signature: await federation.signCanonical(statement) }] };
}

/** Does it hold: the right federation, its signature, still alive? Never throws. */
export async function checkAnnouncement(a: unknown, federationDid: string, now = new Date()): Promise<{ ok: true } | { ok: false; says: string }> {
	const x = a as Announcement;
	if (!x || x.schema !== ANNOUNCEMENT_SCHEMA || !Array.isArray(x.signatures)) return { ok: false, says: 'Not an announcement.' };
	if (x.federation !== federationDid) return { ok: false, says: 'From a different federation.' };
	const s = x.signatures.find((s) => s.by === 'federation');
	if (!s || s.did !== federationDid) return { ok: false, says: 'Not signed by the federation.' };
	try {
		const { signatures: _s, ...statement } = x;
		void _s;
		const key = await crypto.subtle.importKey('raw', publicKeyFrom(federationDid), { name: 'Ed25519' }, false, ['verify']);
		const good = await crypto.subtle.verify({ name: 'Ed25519' }, key, unb64url(s.signature), new TextEncoder().encode(canonical(statement)));
		if (!good) return { ok: false, says: 'Changed after it was signed.' };
	} catch {
		return { ok: false, says: 'The signature can’t be checked.' };
	}
	if (Date.parse(x.until) <= now.getTime()) return { ok: false, says: 'Its time is over.' };
	return { ok: true };
}

/*
 * A publication: the federation saying "these are my announcements now",
 * signed and timed, so a storage can refuse an older list (no rolling
 * back) or an old one sent again (no replay). node/gate checks it.
 */
export const PUBLICATION_SCHEMA = 'inqbeta.announcements-publication/1';
export interface PublicationStatement {
	schema: typeof PUBLICATION_SCHEMA;
	federation: string;
	/** The ids of every announcement in the list, sorted. */
	ids: string[];
	at: string;
}
export type Publication = PublicationStatement & { signatures: { by: 'federation'; did: string; signature: string }[] };

export async function makePublication(federation: Signer, federationDid: string, list: Announcement[], now = new Date()): Promise<Publication> {
	if (toDid(federation.did) !== federationDid) throw new Error('Only the federation’s own key can publish.');
	const statement: PublicationStatement = { schema: PUBLICATION_SCHEMA, federation: federationDid, ids: list.map((a) => a.id).sort(), at: now.toISOString() };
	return { ...statement, signatures: [{ by: 'federation', did: federationDid, signature: await federation.signCanonical(statement) }] };
}
