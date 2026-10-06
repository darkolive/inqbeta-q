/*
 * Joining, leaving and removal. ADR-Q-007 §4.
 *
 * Membership is belonging and nothing more. Three receipts:
 *
 *   federation.joined    the member signs, naming the rules as they stood and
 *                        the agreement they signed up to; the federation
 *                        countersigns. Neither alone makes a member.
 *   federation.left      the member alone. Leaving never needs permission.
 *   federation.removed   the federation, citing the clause. It ends belonging
 *                        only: every earlier receipt stays valid.
 *
 * HOW THE FEDERATION COUNTERSIGNS depends on its join policy:
 *
 *   open / invite   The caretaker makes an OFFER, signed by the federation key:
 *                   "whoever signs our agreement under this manifest before
 *                   this date is admitted". The offer travels in the
 *                   invitation, and a joining that carries a valid offer is
 *                   complete at once — no round trip.
 *   request         The invitation carries an offer that does NOT admit. The
 *                   joiner's signed request goes back to the caretaker, who
 *                   countersigns it with the federation key.
 *
 * THE CARRIER is a link, like calls (ADR-Q-004 §3): packed with deflate into
 * the #fragment, which browsers never send to a server. MQTT can carry the
 * same packets later; nothing here depends on how they travel.
 *
 * Pure: no storage, no window.
 */
import { canonical, b64url, unb64url, sha256 } from './canonical';
import { publicKeyFrom, toDid } from './did';
import { identityFromSeed, signerFor, type Identity } from './passkey';
import { openWith, sealTo, type Opener, type Signer, type SealedToPeople } from './seal';
import {
	FEDERATION_JOINED_SCHEMA,
	FEDERATION_KEY_SCHEMA,
	checkFederationFounding,
	consentHashes,
	hashAgreement,
	type KnownAs,
	type FederationFounding,
	type FederationManifest,
	type Joined,
	type JoinedStatement
} from './federations';
import { OFFICE_APPOINTED_SCHEMA, OFFICE_ENDED_SCHEMA, type Appointed, type Ended } from './offices';
import { EVIDENCE_REPORT_SCHEMA, EXTERNAL_VERIFICATION_SCHEMA, type EvidenceReportReceipt, type ExternalVerificationReceipt } from './attestation';

export const FEDERATION_OFFER_SCHEMA = 'inqbeta.federation-offer/1';
export const FEDERATION_INVITATION_SCHEMA = 'inqbeta.federation-invitation/1';
export const FEDERATION_LEFT_SCHEMA = 'inqbeta.federation-left/1';
export const FEDERATION_REMOVED_SCHEMA = 'inqbeta.federation-removed/1';
export const FEDERATION_SUSPENDED_SCHEMA = 'inqbeta.federation-suspended/1';
export const FEDERATION_LIFTED_SCHEMA = 'inqbeta.federation-suspension-lifted/1';

/** The longest a suspension may run in Q core. A federation may set shorter; anything indefinite is a removal. */
export const SUSPENSION_MOST_DAYS = 366;

type Signature = { by: string; did: string; signature: string };

export interface OfferStatement {
	schema: typeof FEDERATION_OFFER_SCHEMA;
	event: 'federation.offer';
	federation: string;
	name: string;
	/** The manifest a joiner signs up to, by hash. */
	manifest: string;
	/** true: a joining carrying this offer is complete. false: it is a request the caretaker answers. */
	admits: boolean;
	/** Who it is for, in words — a note, not a lock. */
	for?: string;
	nonce: string;
	/** Unix seconds. */
	exp: number;
	at: string;
}
export type Offer = OfferStatement & { signatures: Signature[] };

/** What an invitation link carries: enough to read, check and join, offline. */
export interface Invitation {
	schema: typeof FEDERATION_INVITATION_SCHEMA;
	founding: FederationFounding;
	manifest: FederationManifest;
	offer: Offer;
}

/**
 * A joining made from an offer carries the offer as its countersignature, and
 * the member's card (if they chose to be known) sealed to the federation.
 * Both sit beside the signed statement, which names the card by hash.
 */
export type Joining = Joined & { offer?: Offer; sealedCard?: SealedToPeople };

export const MEMBER_CARD_SCHEMA = 'inqbeta.member-card/1';

/** How a member is known to a federation — only what they chose, nothing more. */
export interface MemberCard {
	schema: typeof MEMBER_CARD_SCHEMA;
	name?: string;
	/** A small picture, as a data: URL (image/webp, jpeg or png). */
	picture?: string;
}

/** The largest picture a card may carry, as a data: URL. About 24 KB — a small, square profile picture. */
export const CARD_PICTURE_MOST = 32_000;

export async function hashCard(c: MemberCard): Promise<string> {
	return `card:sha256:${await sha256(canonical(c))}`;
}

/** What a card may hold for each choice. More than chosen is refused, never trimmed silently. */
export function cardFits(knownAs: KnownAs, card: MemberCard | null | undefined): { ok: true } | { ok: false; says: string } {
	if (knownAs === 'anonymous') return card ? { ok: false, says: 'An anonymous member sends no card.' } : { ok: true };
	if (!card?.name?.trim()) return { ok: false, says: 'To be known by name, give a name.' };
	if (card.name.trim().length > 80) return { ok: false, says: 'A name is at most 80 characters.' };
	if (knownAs === 'name' && card.picture) return { ok: false, says: 'You chose your name only, so no picture is sent.' };
	if (knownAs === 'name-and-picture') {
		if (!card.picture) return { ok: false, says: 'Choose a picture, or be known by your name only.' };
		if (!/^data:image\/(webp|jpeg|png);base64,/.test(card.picture)) return { ok: false, says: 'The picture must be a small image.' };
		if (card.picture.length > CARD_PICTURE_MOST) return { ok: false, says: 'The picture is too large — choose a smaller one.' };
	}
	const extra = Object.keys(card).filter((k) => !['schema', 'name', 'picture'].includes(k));
	if (extra.length) return { ok: false, says: `A card carries a name and a picture, nothing else (${extra.join(', ')}).` };
	return { ok: true };
}

export interface LeftStatement {
	schema: typeof FEDERATION_LEFT_SCHEMA;
	event: 'federation.left';
	federation: string;
	member: string;
	/** The joining this ends, by hash. */
	joined: string;
	at: string;
}
export type Left = LeftStatement & { signatures: Signature[] };

export interface RemovedStatement {
	schema: typeof FEDERATION_REMOVED_SCHEMA;
	event: 'federation.removed';
	federation: string;
	member: string;
	/** The clause of the agreement or constitution this relies on. */
	clause: string;
	/** Why, in plain words. */
	says: string;
	at: string;
}
export type Removed = RemovedStatement & { signatures: Signature[] };

/*
 * SUSPENSION: still a member, paused until a date, then back on its own.
 * It always has an end, cites a clause and says why. It never stops someone
 * leaving, and it never touches anything they did before.
 */
export interface SuspendedStatement {
	schema: typeof FEDERATION_SUSPENDED_SCHEMA;
	event: 'federation.suspended';
	federation: string;
	member: string;
	clause: string;
	says: string;
	/** When it starts (ISO) — never before it was signed. */
	from: string;
	/** When it ends (ISO). Required: nothing here is indefinite. */
	until: string;
	at: string;
}
export type Suspended = SuspendedStatement & { signatures: Signature[] };

export interface LiftedStatement {
	schema: typeof FEDERATION_LIFTED_SCHEMA;
	event: 'federation.suspension-lifted';
	federation: string;
	member: string;
	/** The suspension this ends early, by hash. */
	suspension: string;
	says: string;
	at: string;
}
export type Lifted = LiftedStatement & { signatures: Signature[] };

export type Check = { ok: true; says: string } | { ok: false; says: string };

function unsigned<T extends { signatures: Signature[] }>(x: T): Omit<T, 'signatures'> {
	const { signatures: _s, ...rest } = x;
	return rest;
}

async function verify(did: string, doc: unknown, signature: string): Promise<boolean> {
	try {
		const key = await crypto.subtle.importKey('raw', publicKeyFrom(did), { name: 'Ed25519' }, false, ['verify']);
		return await crypto.subtle.verify({ name: 'Ed25519' }, key, unb64url(signature), new TextEncoder().encode(canonical(doc)));
	} catch {
		return false;
	}
}

async function signedBy(x: { signatures: Signature[] }, by: string, did: string): Promise<boolean> {
	const s = x.signatures?.find((s) => s.by === by);
	return !!s && s.did === did && (await verify(did, unsigned(x as never), s.signature));
}

/** A receipt's identity: the hash of its canonical form. */
export async function hashReceipt(x: unknown): Promise<string> {
	return `receipt:sha256:${await sha256(canonical(x))}`;
}

const DAY = 24 * 60 * 60;

/** Open the federation key from the vault with the caretaker's passkey. */
export async function openFederationKey(sealed: SealedToPeople, owner: Opener | { did: string; opening: CryptoKey }): Promise<Identity> {
	const opened = 'open' in owner ? await owner.open(sealed) : await openWith(sealed, owner);
	if (!opened.ok) throw new Error(opened.says);
	const body = opened.body as { schema?: string; federation?: string; seed?: string };
	if (body?.schema !== FEDERATION_KEY_SCHEMA || !body.seed || !body.federation) throw new Error('That is not a federation key.');
	const key = await identityFromSeed(unb64url(body.seed));
	if (key.did !== body.federation) throw new Error('The key does not match the federation it says it is for.');
	return key;
}

/** An invitation, signed by the federation key. Admits at once unless the policy is "ask to join". */
export async function makeInvitation(
	federation: Signer,
	founding: FederationFounding,
	manifest: FederationManifest,
	o: { for?: string; days?: number; now?: Date } = {}
): Promise<Invitation> {
	if (toDid(federation.did) !== founding.federation) throw new Error('Only the federation’s own key can invite.');
	const now = o.now ?? new Date();
	const statement: OfferStatement = {
		schema: FEDERATION_OFFER_SCHEMA,
		event: 'federation.offer',
		federation: founding.federation,
		name: founding.name,
		manifest: founding.manifest,
		admits: manifest.constitution.joinPolicy !== 'request',
		...(o.for?.trim() ? { for: o.for.trim() } : {}),
		nonce: b64url(crypto.getRandomValues(new Uint8Array(12))),
		exp: Math.floor(now.getTime() / 1000) + Math.max(1, Math.min(90, o.days ?? 14)) * DAY,
		at: now.toISOString()
	};
	const offer: Offer = { ...statement, signatures: [{ by: 'federation', did: founding.federation, signature: await federation.signCanonical(statement) }] };
	return { schema: FEDERATION_INVITATION_SCHEMA, founding, manifest, offer };
}

/** Check an invitation, offline: a real founding, the manifest it names, an offer the federation signed. */
export async function checkInvitation(inv: unknown, now = new Date()): Promise<Check> {
	const x = inv as Invitation;
	if (!x || x.schema !== FEDERATION_INVITATION_SCHEMA || !x.offer || !x.founding || !x.manifest) return { ok: false, says: 'This is not an invitation.' };
	const f = await checkFederationFounding(x.founding, x.manifest);
	if (!f.ok) return f;
	if (x.offer.federation !== x.founding.federation || !(await signedBy(x.offer, 'federation', x.founding.federation)))
		return { ok: false, says: 'The federation did not sign this invitation.' };
	if (x.offer.manifest !== x.founding.manifest) return { ok: false, says: 'The invitation is for different rules from the ones it was founded under.' };
	if (x.offer.exp < now.getTime() / 1000) return { ok: false, says: `This invitation ran out on ${new Date(x.offer.exp * 1000).toISOString().slice(0, 10)}. Ask for a new one.` };
	return { ok: true, says: `An invitation to ${x.founding.name}, founded ${x.founding.at.slice(0, 10)}.` };
}

export interface JoinChoices {
	now?: Date;
	/** The consent steps agreed, by id. Every step must be agreed; default: all. */
	agreed?: string[];
	/** How to be known. Default: anonymous. */
	knownAs?: KnownAs;
	card?: { name?: string; picture?: string };
}

/**
 * Join from an invitation: the member agrees to every consent step and signs.
 * Complete at once when the offer admits; otherwise a request for the
 * caretaker to countersign. A card, if any, is sealed to the federation.
 */
export async function joinFrom(member: Signer, inv: Invitation, choices: JoinChoices | Date = {}): Promise<Joining> {
	const o: JoinChoices = choices instanceof Date ? { now: choices } : choices;
	const now = o.now ?? new Date();
	const c = await checkInvitation(inv, now);
	if (!c.ok) throw new Error(c.says);

	const steps = await consentHashes(inv.manifest);
	const agreed = new Set(o.agreed ?? steps.map((s) => s.id));
	const skipped = steps.filter((s) => !agreed.has(s.id));
	if (skipped.length) throw new Error(`Every part must be agreed to join. Not agreed: ${skipped.map((s) => s.id).join(', ')}.`);

	const knownAs = o.knownAs ?? 'anonymous';
	const card: MemberCard | null =
		knownAs === 'anonymous'
			? null
			: {
					schema: MEMBER_CARD_SCHEMA,
					name: o.card?.name?.trim(),
					...(knownAs === 'name-and-picture' && o.card?.picture ? { picture: o.card.picture } : {})
				};
	const fits = cardFits(knownAs, card);
	if (!fits.ok) throw new Error(fits.says);

	const statement: JoinedStatement = {
		schema: FEDERATION_JOINED_SCHEMA,
		event: 'federation.joined',
		federation: inv.founding.federation,
		member: toDid(member.did),
		manifest: inv.founding.manifest,
		agreement: await hashAgreement(inv.manifest.constitution.agreement),
		consented: steps,
		knownAs,
		...(card ? { card: await hashCard(card) } : {}),
		at: now.toISOString()
	};
	const joining: Joining = { ...statement, signatures: [{ by: 'member', did: statement.member, signature: await member.signCanonical(statement) }] };
	if (inv.offer.admits) joining.offer = inv.offer;
	if (card) joining.sealedCard = (await sealTo(card, [inv.founding.federation], `How a member is known in ${inv.founding.name}`)).sealed;
	return joining;
}

/** The caretaker opens a member's card with the federation key, and checks it is the one they signed. */
export async function openMemberCard(j: Joining, federation: { did: string; opening: CryptoKey }): Promise<MemberCard | null> {
	if (!j.sealedCard || !j.card) return null;
	const opened = await openWith(j.sealedCard, federation);
	if (!opened.ok) throw new Error(opened.says);
	const card = opened.body as MemberCard;
	if ((await hashCard(card)) !== j.card) throw new Error('The card is not the one they signed.');
	const fits = cardFits(j.knownAs ?? 'anonymous', card);
	if (!fits.ok) throw new Error(fits.says);
	return card;
}

/** The caretaker answers a request: countersign with the federation key. */
export async function acceptRequest(federation: Signer, request: Joining, manifestHash: string): Promise<Joining> {
	const st = unsigned(request) as JoinedStatement & { offer?: Offer; sealedCard?: SealedToPeople };
	const { offer: _o, sealedCard, ...statement } = st;
	if (toDid(federation.did) !== statement.federation) throw new Error('Only the federation’s own key can accept.');
	if (!(await signedBy({ ...statement, signatures: request.signatures }, 'member', statement.member))) throw new Error('The person asking did not sign this.');
	if (statement.manifest !== manifestHash) throw new Error('They signed up to different rules from the federation’s own.');
	return {
		...(statement as JoinedStatement),
		signatures: [
			...request.signatures.filter((s) => s.by === 'member'),
			{ by: 'federation', did: statement.federation, signature: await federation.signCanonical(statement) }
		],
		...(sealedCard ? { sealedCard } : {})
	};
}

/** Each part of a joining, checked on its own — the facts the rule engine is given. */
export async function joiningParts(j: Joining): Promise<{
	member: boolean;
	countersigned: boolean;
	offer: 'none' | 'admits' | 'request' | 'expired' | 'forged';
}> {
	const { offer, signatures, sealedCard: _c, ...statement } = j;
	const signedDoc = { ...statement, signatures };
	const member = await signedBy(signedDoc, 'member', statement.member);
	const countersigned = signatures.some((s) => s.by === 'federation') && (await signedBy(signedDoc, 'federation', statement.federation));
	let o: 'none' | 'admits' | 'request' | 'expired' | 'forged' = 'none';
	if (offer) {
		if (offer.federation !== statement.federation || offer.manifest !== statement.manifest || !(await signedBy(offer, 'federation', statement.federation))) o = 'forged';
		else if (Date.parse(statement.at) / 1000 > offer.exp) o = 'expired';
		else o = offer.admits ? 'admits' : 'request';
	}
	return { member, countersigned, offer: o };
}

export type MemberState = 'member' | 'waiting' | 'invalid';

/** Is this joining a member, a request still waiting, or neither? With the reason. */
export async function checkMembership(j: unknown): Promise<{ state: MemberState; says: string; how?: 'countersigned' | 'offer' }> {
	const x = j as Joining;
	if (!x || x.schema !== FEDERATION_JOINED_SCHEMA || !Array.isArray(x.signatures)) return { state: 'invalid', says: 'This is not a joining.' };
	const { offer, signatures, sealedCard: _c, ...statement } = x;
	const signedDoc = { ...statement, signatures };
	if (!(await signedBy(signedDoc, 'member', statement.member))) return { state: 'invalid', says: 'The member did not sign this, so nobody joined.' };
	if (signatures.some((s) => s.by === 'federation')) {
		return (await signedBy(signedDoc, 'federation', statement.federation))
			? { state: 'member', says: 'Joined, countersigned by the federation.', how: 'countersigned' }
			: { state: 'invalid', says: 'The federation’s countersignature does not check.' };
	}
	if (offer) {
		if (offer.federation !== statement.federation || !(await signedBy(offer, 'federation', statement.federation)))
			return { state: 'invalid', says: 'The offer it carries was not signed by the federation.' };
		if (offer.manifest !== statement.manifest) return { state: 'invalid', says: 'The offer was for different rules.' };
		if (Date.parse(statement.at) / 1000 > offer.exp) return { state: 'invalid', says: 'It was signed after the invitation ran out.' };
		if (!offer.admits) return { state: 'waiting', says: 'Waiting for the caretaker to accept.' };
		return { state: 'member', says: 'Joined on the federation’s standing offer.', how: 'offer' };
	}
	return { state: 'waiting', says: 'Waiting for the caretaker to accept.' };
}

/** Leave. The member alone signs; nobody else is asked. */
export async function leave(member: Signer, joining: Joining, now = new Date()): Promise<Left> {
	if (toDid(member.did) !== joining.member) throw new Error('Only the member can leave — nobody can leave for them.');
	const statement: LeftStatement = {
		schema: FEDERATION_LEFT_SCHEMA,
		event: 'federation.left',
		federation: joining.federation,
		member: joining.member,
		joined: await hashReceipt(joining),
		at: now.toISOString()
	};
	return { ...statement, signatures: [{ by: 'member', did: statement.member, signature: await member.signCanonical(statement) }] };
}

export async function checkLeft(x: unknown): Promise<Check> {
	const l = x as Left;
	if (!l || l.schema !== FEDERATION_LEFT_SCHEMA || !Array.isArray(l.signatures)) return { ok: false, says: 'This is not a leaving.' };
	if (!(await signedBy(l, 'member', l.member))) return { ok: false, says: 'The member did not sign this, so nobody left.' };
	return { ok: true, says: `Left on ${l.at.slice(0, 10)}.` };
}

/** Remove a member. The federation signs, citing the clause; belonging ends, nothing else. */
export async function remove(
	federation: Signer,
	o: { federation: string; member: string; clause: string; says: string },
	now = new Date()
): Promise<Removed> {
	if (toDid(federation.did) !== o.federation) throw new Error('Only the federation’s own key can remove someone.');
	if (!o.clause.trim()) throw new Error('A removal must cite the clause it relies on.');
	if (!o.says.trim()) throw new Error('Say why, in plain words.');
	const statement: RemovedStatement = {
		schema: FEDERATION_REMOVED_SCHEMA,
		event: 'federation.removed',
		federation: o.federation,
		member: toDid(o.member),
		clause: o.clause.trim(),
		says: o.says.trim(),
		at: now.toISOString()
	};
	return { ...statement, signatures: [{ by: 'federation', did: statement.federation, signature: await federation.signCanonical(statement) }] };
}

export async function checkRemoved(x: unknown): Promise<Check> {
	const r = x as Removed;
	if (!r || r.schema !== FEDERATION_REMOVED_SCHEMA || !Array.isArray(r.signatures)) return { ok: false, says: 'This is not a removal.' };
	if (!(await signedBy(r, 'federation', r.federation))) return { ok: false, says: 'The federation did not sign this removal.' };
	if (!r.clause?.trim()) return { ok: false, says: 'It cites no clause.' };
	return { ok: true, says: `Removed on ${r.at.slice(0, 10)}, under “${r.clause}”.` };
}

/** Suspend a member until a date. The federation signs, citing the clause. */
export async function suspend(
	federation: Signer,
	o: { federation: string; member: string; clause: string; says: string; until: Date; from?: Date },
	now = new Date()
): Promise<Suspended> {
	if (toDid(federation.did) !== o.federation) throw new Error('Only the federation’s own key can suspend someone.');
	if (!o.clause.trim()) throw new Error('A suspension must cite the clause it relies on.');
	if (!o.says.trim()) throw new Error('Say why, in plain words.');
	const from = o.from ?? now;
	if (from.getTime() < now.getTime() - 60_000) throw new Error('A suspension cannot start before it is signed.');
	if (!(o.until.getTime() > from.getTime())) throw new Error('A suspension must end after it starts.');
	const days = (o.until.getTime() - from.getTime()) / 86_400_000;
	if (days > SUSPENSION_MOST_DAYS) throw new Error('A suspension can last a year at most. Anything longer is a removal.');
	const statement: SuspendedStatement = {
		schema: FEDERATION_SUSPENDED_SCHEMA,
		event: 'federation.suspended',
		federation: o.federation,
		member: toDid(o.member),
		clause: o.clause.trim(),
		says: o.says.trim(),
		from: from.toISOString(),
		until: o.until.toISOString(),
		at: now.toISOString()
	};
	return { ...statement, signatures: [{ by: 'federation', did: statement.federation, signature: await federation.signCanonical(statement) }] };
}

export async function checkSuspended(x: unknown): Promise<Check> {
	const r = x as Suspended;
	if (!r || r.schema !== FEDERATION_SUSPENDED_SCHEMA || !Array.isArray(r.signatures)) return { ok: false, says: 'This is not a suspension.' };
	if (!(await signedBy(r, 'federation', r.federation))) return { ok: false, says: 'The federation did not sign this suspension.' };
	return { ok: true, says: `Suspended from ${r.from.slice(0, 10)} until ${r.until.slice(0, 10)}, under “${r.clause}”.` };
}

/** End a suspension early. */
export async function lift(federation: Signer, s: Suspended, says: string, now = new Date()): Promise<Lifted> {
	if (toDid(federation.did) !== s.federation) throw new Error('Only the federation’s own key can lift a suspension.');
	const statement: LiftedStatement = {
		schema: FEDERATION_LIFTED_SCHEMA,
		event: 'federation.suspension-lifted',
		federation: s.federation,
		member: s.member,
		suspension: await hashReceipt(s),
		says: says.trim() || 'Lifted early.',
		at: now.toISOString()
	};
	return { ...statement, signatures: [{ by: 'federation', did: statement.federation, signature: await federation.signCanonical(statement) }] };
}

export async function checkLifted(x: unknown, s?: Suspended): Promise<Check> {
	const l = x as Lifted;
	if (!l || l.schema !== FEDERATION_LIFTED_SCHEMA || !Array.isArray(l.signatures)) return { ok: false, says: 'This is not a lifting.' };
	if (!(await signedBy(l, 'federation', l.federation))) return { ok: false, says: 'The federation did not sign this.' };
	if (s && l.suspension !== (await hashReceipt(s))) return { ok: false, says: 'It lifts a different suspension.' };
	return { ok: true, says: `Lifted on ${l.at.slice(0, 10)}.` };
}

export type Standing =
	| { is: 'member' }
	| { is: 'suspended'; until: string; says: string; clause: string }
	| { is: 'removed'; at: string; says: string }
	| { is: 'left'; at: string };

/**
 * Where a member stands at a moment, from what has been recorded. Leaving and
 * removal end belonging; a suspension pauses it until its end, unless lifted.
 * Only already-checked receipts should be passed in.
 */
export function standingAt(
	o: { left?: Left | null; removed?: Removed | null; suspended?: Suspended | null; lifted?: Lifted | null },
	now = new Date()
): Standing {
	if (o.left) return { is: 'left', at: o.left.at };
	if (o.removed) return { is: 'removed', at: o.removed.at, says: o.removed.says };
	const s = o.suspended;
	if (s && !o.lifted && Date.parse(s.from) <= now.getTime() && now.getTime() < Date.parse(s.until))
		return { is: 'suspended', until: s.until, says: s.says, clause: s.clause };
	return { is: 'member' };
}

/* ---- The carrier: a link's #fragment, deflated. ---- */

async function deflate(text: string): Promise<Uint8Array> {
	const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('deflate-raw'));
	return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function inflate(bytes: Uint8Array): Promise<string> {
	const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
	return await new Response(stream).text();
}

/** What travels in a link: an invitation, a joining, or news of a decision about a member. */
export type Notice = Removed | Suspended | Lifted;
/* Offices (offices.ts) travel the same way: an appointment to its holder, an ending to whoever needs to know. */
export type Packet = Invitation | Joining | Notice | Appointed | Ended | EvidenceReportReceipt | ExternalVerificationReceipt;

const PACKET_SCHEMAS = [
	FEDERATION_INVITATION_SCHEMA,
	FEDERATION_JOINED_SCHEMA,
	FEDERATION_REMOVED_SCHEMA,
	FEDERATION_SUSPENDED_SCHEMA,
	FEDERATION_LIFTED_SCHEMA,
	OFFICE_APPOINTED_SCHEMA,
	OFFICE_ENDED_SCHEMA,
	EVIDENCE_REPORT_SCHEMA,
	EXTERNAL_VERIFICATION_SCHEMA
];

/** Pack an invitation or a joining for a link. */
export async function pack(p: Packet): Promise<string> {
	return b64url(await deflate(JSON.stringify(p)));
}

export async function unpack(text: string): Promise<Packet | null> {
	try {
		const p = JSON.parse(await inflate(unb64url(text.replace(/^#/, '')))) as Packet;
		/* Sealed receipts (reports, verifications) name their kind inside their content. */
		const kind = (p as { content?: { schema?: string } })?.content?.schema;
		return p && (PACKET_SCHEMAS.includes(p.schema) || (!!kind && PACKET_SCHEMAS.includes(kind))) ? p : null;
	} catch {
		return null;
	}
}

export function isInvitation(p: unknown): p is Invitation {
	return (p as Invitation)?.schema === FEDERATION_INVITATION_SCHEMA;
}
export function isJoining(p: unknown): p is Joining {
	return (p as Joining)?.schema === FEDERATION_JOINED_SCHEMA;
}
export function isEvidenceReport(p: unknown): p is EvidenceReportReceipt {
	return (p as EvidenceReportReceipt)?.content?.schema === EVIDENCE_REPORT_SCHEMA;
}
export function isExternalVerification(p: unknown): p is ExternalVerificationReceipt {
	return (p as ExternalVerificationReceipt)?.content?.schema === EXTERNAL_VERIFICATION_SCHEMA;
}
export function isAppointment(p: unknown): p is Appointed {
	return (p as Appointed)?.schema === OFFICE_APPOINTED_SCHEMA;
}
export function isOfficeEnded(p: unknown): p is Ended {
	return (p as Ended)?.schema === OFFICE_ENDED_SCHEMA;
}
export function isNotice(p: unknown): p is Notice {
	const s = (p as Notice)?.schema;
	return s === FEDERATION_REMOVED_SCHEMA || s === FEDERATION_SUSPENDED_SCHEMA || s === FEDERATION_LIFTED_SCHEMA;
}
