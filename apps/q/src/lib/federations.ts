/*
 * Federations, in and out of the vault. The rules are q-core/federations.ts
 * (ADR-Q-007); the check is the federation.found action (q-actions, ADR-Q-009).
 *
 *   federations/drafts/<draft id>.json   a draft — working state, yours alone,
 *                                        saved as often as you like. Each save
 *                                        replaces the last copy.
 *   federations/<federation>.json        a founded federation: the two-signature
 *                                        founding, the manifest, your joining as
 *                                        member one, the caretaker grant, and
 *                                        the federation key sealed to you.
 *
 * A draft becomes a federation only through foundFromDraft, and only if the
 * rule engine says the founding keeps federation.found's rules. The draft is
 * then marked with what it became and stops being listed.
 */
import { seal } from '@inqbeta/q-core/seal';
import { signerFor, type Identity } from '@inqbeta/q-core/passkey';
import { deleteItem, readItem, saveLocked, type FolderItem } from '@inqbeta/q-core/folder';
import { folderStore } from '@inqbeta/q-core/ucan/index';
import { b64url } from '@inqbeta/q-core/canonical';
import type { SealedToPeople } from '@inqbeta/q-core/seal';
import {
	foundFederation,
	isFederationDraft,
	type FederationDraft,
	type FederationFounding,
	type FederationManifest,
	type Joined
} from '@inqbeta/q-core/federations';
import { foundingFacts } from '@inqbeta/q-actions/core/federation-found';
import { appointFacts, endFacts } from '@inqbeta/q-actions/core/federation-offices';
import { officePost } from '@inqbeta/q-core/offices';
import { myInbox } from '$lib/messages';
import { readHome } from '$lib/home';
import { appoint, recall, standDown, checkAppointment, checkEnded, hashAppointment, officesHeld, revocationNotice, type Appointed, type Ended, type OfficeHeld, type OfficeId } from '@inqbeta/q-core/offices';
import { actionHash, decide } from '$lib/actions/engine';
import {
	acceptRequest,
	checkMembership,
	joinFrom,
	leave as leaveReceipt,
	makeInvitation,
	openFederationKey,
	pack,
	remove as removeReceipt,
	suspend as suspendReceipt,
	lift as liftReceipt,
	checkRemoved,
	checkSuspended,
	checkLifted,
	openMemberCard,
	type JoinChoices,
	type MemberCard,
	type Invitation,
	type Joining,
	type Left,
	type Lifted,
	type Notice,
	type Removed,
	type Suspended
} from '@inqbeta/q-core/membership';
import { joinFacts, leaveFacts, removeFacts, suspendFacts } from '@inqbeta/q-actions/core/federation-membership';

export const FEDERATION_RECORD_SCHEMA = 'inqbeta.federation-record/1';

export interface FederationRecord {
	schema: typeof FEDERATION_RECORD_SCHEMA;
	source: 'inqbeta:q/federation';
	founding: FederationFounding;
	manifest: FederationManifest;
	/** The founder's joining — member one. */
	joined: Joined;
	/** The federation key's seed, sealed to the founder. */
	sealedKey: SealedToPeople;
	/** The caretaker grant, UCAN bytes, base64url. */
	grant: string;
	/** When the caretaker mandate ends, unix seconds. */
	caretakerUntil: number;
	/** What the rule engine said when it was founded. */
	checked: { action: string; rules: string[] };
}

export function isFederationRecord(x: unknown): x is FederationRecord {
	const r = x as FederationRecord;
	return !!r && r.schema === FEDERATION_RECORD_SCHEMA && !!r.founding && !!r.manifest && !!r.joined;
}

type Outcome<T> = ({ ok: true } & T) | { ok: false; says: string };

/** Save a draft. Replaces the copy it was opened from, if one is given. */
export async function saveDraft(draft: FederationDraft, previous?: FolderItem | null): Promise<Outcome<{ draft: FederationDraft }>> {
	try {
		const saved = { ...draft, updated: new Date().toISOString() };
		const signed = await seal(saved);
		await saveLocked('federations/drafts', `${saved.id}.json`, JSON.stringify(signed, null, 2), 'application/json');
		/* A draft is working state, not a receipt: the older copy goes. */
		if (previous) await deleteItem(previous).catch(() => {});
		return { ok: true, draft: saved };
	} catch (e) {
		return { ok: false, says: e instanceof Error ? e.message : String(e) };
	}
}

export async function draftFrom(item: FolderItem): Promise<FederationDraft | null> {
	try {
		const json = JSON.parse(new TextDecoder().decode((await readItem(item)).data)) as { content?: unknown };
		const content = json?.content ?? json;
		return isFederationDraft(content) ? content : null;
	} catch {
		return null;
	}
}

/**
 * Found a federation from a draft. Signs with the passkey held in this tab,
 * asks the rule engine, and keeps it only if the founding holds.
 */
export async function foundFromDraft(
	identity: Identity,
	draft: FederationDraft,
	draftItem?: FolderItem | null
): Promise<Outcome<{ record: FederationRecord }> | { ok: false; says: string; rules: string[] }> {
	try {
		const founded = await foundFederation(signerFor(identity), draft);
		const action = await actionHash('federation.found');
		const decision = await decide(action, {
			principal: { type: 'Person', id: identity.did },
			resource: { type: 'Federation', id: founded.founding.federation },
			facts: await foundingFacts(founded)
		});
		if (!decision.holds) return { ok: false, says: decision.because.join(' '), rules: decision.rules };

		const record: FederationRecord = {
			schema: FEDERATION_RECORD_SCHEMA,
			source: 'inqbeta:q/federation',
			founding: founded.founding,
			manifest: founded.manifest,
			joined: founded.joined,
			sealedKey: founded.sealedKey,
			grant: b64url(founded.grant.bytes),
			caretakerUntil: founded.caretakerUntil,
			checked: { action, rules: decision.rules }
		};
		const signed = await seal(record);
		await saveLocked('federations', `${founded.founding.federation.slice(-16)}.json`, JSON.stringify(signed, null, 2), 'application/json');
		await folderStore.put(founded.grant).catch(() => {
			/* The record carries the grant as well; the token store is a convenience. */
		});
		await saveDraft({ ...draft, foundedAs: founded.founding.federation }, draftItem);
		return { ok: true, record };
	} catch (e) {
		return { ok: false, says: e instanceof Error ? e.message : String(e) };
	}
}

/* ---- Membership (ADR-Q-007 §4): inviting, joining, leaving, removal. ---- */


/** Your own membership of someone's federation, kept in your vault. Each change is saved anew; the newest wins. */
export const MEMBERSHIP_RECORD_SCHEMA = 'inqbeta.membership-record/1';
export interface MembershipRecord {
	schema: typeof MEMBERSHIP_RECORD_SCHEMA;
	source: 'inqbeta:q/membership';
	founding: FederationFounding;
	manifest: FederationManifest;
	joining: Joining;
	/** Your own copy of the card you sent, if you chose to be known. */
	card?: MemberCard;
	left?: Left;
	/* Decisions the caretaker sent you, kept once you opened their link. */
	removed?: Removed;
	suspended?: Suspended;
	lifted?: Lifted;
	/** Offices you've been given here (ADR-Q-007 §5), kept once you opened their link. */
	offices?: Appointed[];
	/** Offices ended early: you stood down, or the federation recalled one. */
	officeEndings?: Ended[];
	at: string;
}
export function isMembershipRecord(x: unknown): x is MembershipRecord {
	const r = x as MembershipRecord;
	return !!r && r.schema === MEMBERSHIP_RECORD_SCHEMA && !!r.joining && !!r.founding;
}

/** A member of a federation you look after, kept in the caretaker's vault. */
export const MEMBER_RECORD_SCHEMA = 'inqbeta.member-record/1';
export interface MemberRecord {
	schema: typeof MEMBER_RECORD_SCHEMA;
	source: 'inqbeta:q/member';
	federation: string;
	/** Their name, if they chose to be known by it — from their card, or a note you added. */
	called?: string;
	/** Their picture, if they chose to share one. */
	picture?: string;
	joining: Joining;
	removed?: Removed;
	suspended?: Suspended;
	lifted?: Lifted;
	at: string;
}
export function isMemberRecord(x: unknown): x is MemberRecord {
	const r = x as MemberRecord;
	return !!r && r.schema === MEMBER_RECORD_SCHEMA && !!r.joining && typeof r.federation === 'string';
}

const short = (did: string) => did.slice(-16);

async function keep(path: string, name: string, body: object) {
	const signed = await seal(body);
	await saveLocked(path, name, JSON.stringify(signed, null, 2), 'application/json');
}

async function check(id: string, identity: Identity, federation: string, facts: Record<string, unknown>) {
	const decision = await decide(await actionHash(id), {
		principal: { type: 'Person', id: identity.did },
		resource: { type: 'Federation', id: federation },
		facts
	});
	return decision;
}

/** The link that carries a packet: /federations/join#… — the fragment never reaches a server. */
export function linkFor(packed: string): string {
	return `${location.origin}/federations/join#${packed}`;
}

/** Invite someone to a federation you look after. Opens the federation key with your passkey. */
export async function invite(
	identity: Identity,
	record: FederationRecord,
	o: { for?: string; days?: number } = {}
): Promise<Outcome<{ link: string; invitation: Invitation }>> {
	try {
		const key = await openFederationKey(record.sealedKey, identity);
		const invitation = await makeInvitation(signerFor(key), record.founding, record.manifest, o);
		return { ok: true, invitation, link: linkFor(await pack(invitation)) };
	} catch (e) {
		return { ok: false, says: e instanceof Error ? e.message : String(e) };
	}
}

/**
 * Join from an invitation: you sign the agreement. Returns whether you are a
 * member now or waiting, and the link to send the caretaker so they know.
 */
export async function joinFromInvitation(
	identity: Identity,
	invitation: Invitation,
	choices: Omit<JoinChoices, 'now'> = {}
): Promise<Outcome<{ state: 'member' | 'waiting'; link: string }> | { ok: false; says: string; rules: string[] }> {
	try {
		const joining = await joinFrom(signerFor(identity), invitation, choices);
		const knownAs = joining.knownAs ?? 'anonymous';
		const card: MemberCard | null =
			knownAs === 'anonymous'
				? null
				: { schema: 'inqbeta.member-card/1', name: choices.card?.name?.trim(), ...(knownAs === 'name-and-picture' && choices.card?.picture ? { picture: choices.card.picture } : {}) };
		const m = await checkMembership(joining);
		/* A request is checked by the caretaker when they accept it; a joining complete now is checked now. */
		const d = await check('federation.join', identity, joining.federation, await joinFacts(joining, invitation.founding, invitation.manifest, card));
		if (m.state === 'member' && !d.holds) return { ok: false, says: d.because.join(' '), rules: d.rules };
		if (m.state === 'waiting') {
			const notOffer = d.rules.filter((r) => r !== 'federation.join/may/join');
			if (notOffer.length) return { ok: false, says: d.because.filter((_, i) => d.rules[i] !== 'federation.join/may/join').join(' '), rules: notOffer };
		}
		const record: MembershipRecord = {
			schema: MEMBERSHIP_RECORD_SCHEMA,
			source: 'inqbeta:q/membership',
			founding: invitation.founding,
			manifest: invitation.manifest,
			joining,
			...(card ? { card } : {}),
			at: joining.at
		};
		await keep('federations/memberships', `${short(joining.federation)}.json`, record);
		return { ok: true, state: m.state === 'member' ? 'member' : 'waiting', link: linkFor(await pack(joining)) };
	} catch (e) {
		return { ok: false, says: e instanceof Error ? e.message : String(e) };
	}
}

/**
 * A joining arrives at the caretaker. A request is countersigned; one already
 * complete is simply recorded. Returns the link back to the member when there
 * is something for them to take home.
 */
export async function receiveJoining(
	identity: Identity,
	record: FederationRecord,
	joining: Joining,
	called?: string
): Promise<Outcome<{ link?: string; accepted: boolean }> | { ok: false; says: string; rules: string[] }> {
	try {
		if (joining.federation !== record.founding.federation) return { ok: false, says: 'This is for a different federation.' };
		let final = joining;
		let accepted = false;
		const key = await openFederationKey(record.sealedKey, identity);
		/* Their card, opened with the federation key and checked against what they signed. */
		const card = joining.knownAs && joining.knownAs !== 'anonymous' ? await openMemberCard(joining, key) : null;
		if ((await checkMembership(joining)).state === 'waiting') {
			final = await acceptRequest(signerFor(key), joining, record.founding.manifest);
			accepted = true;
		}
		const d = await check('federation.join', identity, record.founding.federation, await joinFacts(final, record.founding, record.manifest, joining.knownAs ? card : undefined));
		if (!d.holds) return { ok: false, says: d.because.join(' '), rules: d.rules };
		const name = card?.name ?? called?.trim();
		const member: MemberRecord = {
			schema: MEMBER_RECORD_SCHEMA,
			source: 'inqbeta:q/member',
			federation: record.founding.federation,
			...(name ? { called: name } : {}),
			...(card?.picture ? { picture: card.picture } : {}),
			joining: final,
			at: new Date().toISOString()
		};
		await keep('federations/members', `${short(final.federation)}-${short(final.member)}.json`, member);
		return { ok: true, accepted, ...(accepted ? { link: linkFor(await pack(final)) } : {}) };
	} catch (e) {
		return { ok: false, says: e instanceof Error ? e.message : String(e) };
	}
}

/** The caretaker's countersignature comes home to the member. */
export async function takeHome(mine: MembershipRecord, accepted: Joining): Promise<Outcome<{}>> {
	if (accepted.federation !== mine.joining.federation || accepted.member !== mine.joining.member)
		return { ok: false, says: 'This acceptance is for a different membership.' };
	const m = await checkMembership(accepted);
	if (m.state !== 'member') return { ok: false, says: m.says };
	await keep('federations/memberships', `${short(accepted.federation)}.json`, { ...mine, joining: accepted, at: new Date().toISOString() });
	return { ok: true };
}

/** Leave. Only you sign; nobody is asked. */
export async function leaveFederation(identity: Identity, mine: MembershipRecord): Promise<Outcome<{}> | { ok: false; says: string; rules: string[] }> {
	try {
		const left = await leaveReceipt(signerFor(identity), mine.joining);
		const d = await check('federation.leave', identity, mine.joining.federation, await leaveFacts(left, mine.joining));
		if (!d.holds) return { ok: false, says: d.because.join(' '), rules: d.rules };
		await keep('federations/memberships', `${short(mine.joining.federation)}.json`, { ...mine, left, at: left.at });
		return { ok: true };
	} catch (e) {
		return { ok: false, says: e instanceof Error ? e.message : String(e) };
	}
}

/** Remove a member of a federation you look after, citing the clause. */
export async function removeMember(
	identity: Identity,
	record: FederationRecord,
	member: MemberRecord,
	o: { clause: string; says: string }
): Promise<Outcome<{ link: string }> | { ok: false; says: string; rules: string[] }> {
	try {
		const key = await openFederationKey(record.sealedKey, identity);
		const removed = await removeReceipt(signerFor(key), { federation: record.founding.federation, member: member.joining.member, ...o });
		const d = await check('federation.remove', identity, record.founding.federation, await removeFacts(removed, member.joining));
		if (!d.holds) return { ok: false, says: d.because.join(' '), rules: d.rules };
		await keep('federations/members', `${short(member.federation)}-${short(member.joining.member)}.json`, { ...member, removed, at: removed.at });
		return { ok: true, link: linkFor(await pack(removed)) };
	} catch (e) {
		return { ok: false, says: e instanceof Error ? e.message : String(e) };
	}
}

/** Suspend a member until a date, citing the clause. Returns the link to send them. */
export async function suspendMember(
	identity: Identity,
	record: FederationRecord,
	member: MemberRecord,
	o: { clause: string; says: string; until: Date }
): Promise<Outcome<{ link: string }> | { ok: false; says: string; rules: string[] }> {
	try {
		const key = await openFederationKey(record.sealedKey, identity);
		const suspended = await suspendReceipt(signerFor(key), { federation: record.founding.federation, member: member.joining.member, ...o });
		const d = await check('federation.suspend', identity, record.founding.federation, await suspendFacts(suspended, member.joining));
		if (!d.holds) return { ok: false, says: d.because.join(' '), rules: d.rules };
		const { lifted: _l, ...rest } = member;
		await keep('federations/members', `${short(member.federation)}-${short(member.joining.member)}.json`, { ...rest, suspended, at: suspended.at });
		return { ok: true, link: linkFor(await pack(suspended)) };
	} catch (e) {
		return { ok: false, says: e instanceof Error ? e.message : String(e) };
	}
}

/** End a suspension early. Returns the link to send them. */
export async function liftSuspension(identity: Identity, record: FederationRecord, member: MemberRecord, says: string): Promise<Outcome<{ link: string }>> {
	try {
		if (!member.suspended) return { ok: false, says: 'They are not suspended.' };
		const key = await openFederationKey(record.sealedKey, identity);
		const lifted = await liftReceipt(signerFor(key), member.suspended, says);
		await keep('federations/members', `${short(member.federation)}-${short(member.joining.member)}.json`, { ...member, lifted, at: lifted.at });
		return { ok: true, link: linkFor(await pack(lifted)) };
	} catch (e) {
		return { ok: false, says: e instanceof Error ? e.message : String(e) };
	}
}

/** A decision about you arrives from the caretaker: check it, and keep it with your membership. */
export async function receiveNotice(mine: MembershipRecord, notice: Notice): Promise<Outcome<{}>> {
	if (notice.federation !== mine.joining.federation || notice.member !== mine.joining.member)
		return { ok: false, says: 'This is about a different membership.' };
	const c =
		notice.schema === 'inqbeta.federation-removed/1'
			? await checkRemoved(notice)
			: notice.schema === 'inqbeta.federation-suspended/1'
				? await checkSuspended(notice)
				: await checkLifted(notice, mine.suspended);
	if (!c.ok) return { ok: false, says: c.says };
	const field = notice.event === 'federation.removed' ? 'removed' : notice.event === 'federation.suspended' ? 'suspended' : 'lifted';
	const next: MembershipRecord = { ...mine, [field]: notice, at: new Date().toISOString() };
	if (field === 'suspended') delete next.lifted;
	await keep('federations/memberships', `${short(mine.joining.federation)}.json`, next);
	return { ok: true };
}

/** Read any of Q's federation records back out of a folder item. */
export async function recordFrom(item: FolderItem): Promise<unknown> {
	try {
		const json = JSON.parse(new TextDecoder().decode((await readItem(item)).data)) as { content?: unknown };
		return json?.content ?? json;
	} catch {
		return null;
	}
}

/* ---- Nodes (ADR-Q-010 §10, home-node.md): the machines a federation runs. ---- */

/**
 * A node the federation runs, as its caretaker wrote it down: where it sits on
 * the federation's own mesh, and which services members reach there.
 *
 * FIRST SLICE (1 October 2026, after the Hetzner test). Kept in the
 * caretaker's vault and signed by them, like a member record. Not yet:
 * signed by the federation key, sent to members, or checked by a
 * `node.listed` action — those wait on ADR-Q-006's open question (where a
 * federation's shared state lives). The health shown beside it is never
 * stored: it is what this device can reach, asked each time.
 */
export const NODE_RECORD_SCHEMA = 'inqbeta.federation-node/1';
export interface NodeRecord {
	schema: typeof NODE_RECORD_SCHEMA;
	source: 'inqbeta:q/federation-node';
	federation: string;
	/** What the caretaker calls it: "Hetzner, Helsinki". */
	called: string;
	/** Its address on the federation's Nebula mesh, e.g. 10.42.0.1. */
	mesh: string;
	/** Is it the mesh's lighthouse, and at which public address (host:port)? */
	lighthouse?: string;
	/*
	 * Named in Q's words since 1 October 2026: the BELLBOY (Mosquitto — "there's
	 * a call for you, sir, in reception": it tells you something is waiting and
	 * where, and carries nothing you could read) and the DIRECTORY (Dgraph —
	 * where things are found). The keys keep their first names so records already
	 * written still read. docs/q/node-sizes.md.
	 */
	services: {
		/** The bellboy: Mosquitto over WebSockets (ADR-Q-010 §4). */
		postOffice?: { port: number };
		/** The directory: Dgraph's HTTP port (home-node.md §5). */
		index?: { port: number };
		/** The storage: SeaweedFS's filer (ADR-Q-014), the holding bay. */
		storage?: { port: number };
		/**
		 * The switchboard (2 October 2026): coturn, a TURN relay. It connects a call
		 * when two devices can't reach each other, and can't listen in. Unlike the
		 * others it's on the node's PUBLIC address, not the mesh, because callers
		 * anywhere must reach it.
		 */
		relay?: { host: string; port: number };
	};
	at: string;
	withdrawn?: string;
}
export function isNodeRecord(x: unknown): x is NodeRecord {
	const r = x as NodeRecord;
	return !!r && r.schema === NODE_RECORD_SCHEMA && typeof r.federation === 'string' && typeof r.mesh === 'string';
}

const MESH_ADDRESS = /^(10|172|192)\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

/** Write down a node the federation runs. Only its caretaker can. */
export async function listNode(
	record: FederationRecord,
	o: { called: string; mesh: string; lighthouse?: string; postOffice?: number; index?: number; storage?: number; relay?: { host: string; port: number } }
): Promise<Outcome<{ node: NodeRecord }>> {
	try {
		const mesh = o.mesh.trim();
		if (!MESH_ADDRESS.test(mesh)) return { ok: false, says: 'The mesh address is a private address like 10.42.0.1 — the one in the node’s Nebula certificate.' };
		if (!o.called.trim()) return { ok: false, says: 'Give it a name you’ll recognise.' };
		if (o.relay && !/^[a-z0-9.-]+$/i.test(o.relay.host.trim())) return { ok: false, says: 'The switchboard’s address is the node’s public address, like 135.181.156.21.' };
		const node: NodeRecord = {
			schema: NODE_RECORD_SCHEMA,
			source: 'inqbeta:q/federation-node',
			federation: record.founding.federation,
			called: o.called.trim(),
			mesh,
			...(o.lighthouse?.trim() ? { lighthouse: o.lighthouse.trim() } : {}),
			services: {
				...(o.postOffice ? { postOffice: { port: o.postOffice } } : {}),
				...(o.index ? { index: { port: o.index } } : {}),
				...(o.storage ? { storage: { port: o.storage } } : {}),
				...(o.relay?.host.trim() ? { relay: { host: o.relay.host.trim(), port: o.relay.port } } : {})
			},
			at: new Date().toISOString()
		};
		await keep('federations/nodes', `${short(node.federation)}-${mesh.replaceAll('.', '-')}.json`, node);
		return { ok: true, node };
	} catch (e) {
		return { ok: false, says: e instanceof Error ? e.message : String(e) };
	}
}

/** Stop listing a node. The earlier record stays; this one says when it ended. */
export async function withdrawNode(node: NodeRecord): Promise<Outcome<{}>> {
	try {
		const at = new Date().toISOString();
		await keep('federations/nodes', `${short(node.federation)}-${node.mesh.replaceAll('.', '-')}.json`, { ...node, withdrawn: at, at });
		return { ok: true };
	} catch (e) {
		return { ok: false, says: e instanceof Error ? e.message : String(e) };
	}
}


/* ---- Offices (ADR-Q-007 §5, ADR-Q-038 step 5), 6 October 2026 ----
 *
 * The caretaker gives a member an office — treasurer, secretary, chair,
 * safeguarding lead, steward — for a term. The appointment is signed by the
 * federation key and the caretaker, carries the mandates, and travels to the
 * holder as a link, like any decision about a member. The caretaker keeps an
 * office record; the holder keeps the appointment with their membership.
 */
export const OFFICE_RECORD_SCHEMA = 'inqbeta.office-record/1';
export interface OfficeRecord {
	schema: typeof OFFICE_RECORD_SCHEMA;
	source: 'inqbeta:q/office';
	federation: string;
	/** The holder's name, as the caretaker knows them. */
	called?: string;
	appointment: Appointed;
	ended?: Ended;
	at: string;
}
export function isOfficeRecord(x: unknown): x is OfficeRecord {
	const r = x as OfficeRecord;
	return !!r && r.schema === OFFICE_RECORD_SCHEMA && typeof r.federation === 'string' && !!r.appointment;
}
const officeFile = (a: Appointed) => `${short(a.federation)}-${a.office}-${short(a.holder)}.json`;

/** Give a member an office. Returns the link to send them. */
export async function appointOffice(
	identity: Identity,
	record: FederationRecord,
	member: MemberRecord,
	o: { office: OfficeId; months: number; says: string; standingInterest?: string }
): Promise<Outcome<{ link: string }> | { ok: false; says: string; rules: string[] }> {
	try {
		const key = await openFederationKey(record.sealedKey, identity);
		const a = await appoint(signerFor(key), signerFor(identity), {
			federation: record.founding.federation,
			office: o.office,
			holder: member.joining.member,
			months: o.months,
			says: o.says,
			grant: record.grant,
			name: record.founding.name,
			standingInterest: o.standingInterest
		});
		const d = await check('office.appoint', identity, record.founding.federation, await appointFacts(a, member.joining));
		if (!d.holds) return { ok: false, says: d.because.join(' '), rules: d.rules };
		const kept: OfficeRecord = { schema: OFFICE_RECORD_SCHEMA, source: 'inqbeta:q/office', federation: a.federation, ...(member.called ? { called: member.called } : {}), appointment: a, at: a.at };
		await keep('federations/offices', officeFile(a), kept);
		return { ok: true, link: linkFor(await pack(a)) };
	} catch (e) {
		return { ok: false, says: e instanceof Error ? e.message : String(e) };
	}
}

/**
 * Tell the federation's storage node the office's mandates have ended, so
 * servers stop trusting them at once rather than at the end of the term.
 * Signed by the federation's key. False when there's no node to tell.
 */
async function publishEnding(key: Identity, a: Appointed, e: Ended, storage?: string | null): Promise<boolean> {
	if (!storage) return false;
	const notice = await revocationNotice(key, a, e);
	const r = await fetch(`${storage.replace(/\/$/, '')}/revoked/${a.federation}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(notice) }).catch(() => null);
	return !!r?.ok;
}

/** Recall an office early, saying why. Returns the link to send its holder, and whether the servers were told. */
export async function recallOffice(
	identity: Identity,
	record: FederationRecord,
	office: OfficeRecord,
	says: string,
	storage?: string | null
): Promise<Outcome<{ link: string; published: boolean }> | { ok: false; says: string; rules: string[] }> {
	try {
		const key = await openFederationKey(record.sealedKey, identity);
		const e = await recall(signerFor(key), office.appointment, says);
		const d = await check('office.end', identity, record.founding.federation, await endFacts(e, office.appointment));
		if (!d.holds) return { ok: false, says: d.because.join(' '), rules: d.rules };
		await keep('federations/offices', officeFile(office.appointment), { ...office, ended: e, at: e.at });
		return { ok: true, link: linkFor(await pack(e)), published: await publishEnding(key, office.appointment, e, storage) };
	} catch (e) {
		return { ok: false, says: e instanceof Error ? e.message : String(e) };
	}
}

/**
 * Tell the federation's storage node where post for your office goes (ADR-Q-038
 * §5): your inbox, with the appointment as proof. Only for the host's own
 * federation, whose node keeps the list. False when there's nowhere to tell.
 */
export async function publishOfficePost(identity: Identity, a: Appointed): Promise<boolean> {
	const home = await readHome().catch(() => null);
	const storage = home?.ok && home.federation === a.federation ? home.services.storage : undefined;
	const inbox = await myInbox(identity);
	if (!storage || !inbox) return false;
	const notice = await officePost(identity, a, inbox.id);
	const r = await fetch(`${storage.replace(/\/$/, '')}/offices/${a.federation}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(notice) }).catch(() => null);
	return !!r?.ok;
}

/** An appointment arrives for you: check it, and keep it with your membership; tell the node where its post goes. */
export async function receiveAppointment(mine: MembershipRecord, a: Appointed, identity?: Identity | null): Promise<Outcome<{ published?: boolean }>> {
	if (a.federation !== mine.joining.federation || a.holder !== mine.joining.member) return { ok: false, says: 'This office is for someone else.' };
	const c = await checkAppointment(a);
	if (!c.ok) return { ok: false, says: c.says };
	const h = await hashAppointment(a);
	const others: Appointed[] = [];
	for (const x of mine.offices ?? []) if ((await hashAppointment(x)) !== h) others.push(x);
	await keep('federations/memberships', `${short(mine.joining.federation)}.json`, { ...mine, offices: [...others, a], at: new Date().toISOString() });
	return { ok: true, published: identity ? await publishOfficePost(identity, a).catch(() => false) : false };
}

/** Stand down from an office early. Returns the link to send the caretaker. */
export async function standDownOffice(identity: Identity, mine: MembershipRecord, a: Appointed, says: string): Promise<Outcome<{ link: string }> | { ok: false; says: string; rules: string[] }> {
	try {
		const e = await standDown(signerFor(identity), a, says);
		const d = await check('office.end', identity, a.federation, await endFacts(e, a));
		if (!d.holds) return { ok: false, says: d.because.join(' '), rules: d.rules };
		await keep('federations/memberships', `${short(mine.joining.federation)}.json`, { ...mine, officeEndings: [...(mine.officeEndings ?? []), e], at: e.at });
		return { ok: true, link: linkFor(await pack(e)) };
	} catch (e) {
		return { ok: false, says: e instanceof Error ? e.message : String(e) };
	}
}

/** An office ended: as its holder (a recall), keep it with your membership. */
export async function receiveEndingAsHolder(mine: MembershipRecord, e: Ended): Promise<Outcome<{}>> {
	for (const a of mine.offices ?? []) {
		if ((await checkEnded(e, a)).ok) {
			await keep('federations/memberships', `${short(mine.joining.federation)}.json`, { ...mine, officeEndings: [...(mine.officeEndings ?? []), e], at: new Date().toISOString() });
			return { ok: true };
		}
	}
	return { ok: false, says: 'It doesn’t end any office you hold here.' };
}

/** An office ended: as caretaker (someone stood down), mark it on your record, and tell the servers. */
export async function receiveEndingAsCaretaker(identity: Identity, record: FederationRecord, offices: OfficeRecord[], e: Ended, storage?: string | null): Promise<Outcome<{ published: boolean }>> {
	for (const o of offices) {
		if ((await checkEnded(e, o.appointment)).ok) {
			await keep('federations/offices', officeFile(o.appointment), { ...o, ended: e, at: e.at });
			const key = await openFederationKey(record.sealedKey, identity);
			return { ok: true, published: await publishEnding(key, o.appointment, e, storage).catch(() => false) };
		}
	}
	return { ok: false, says: 'It doesn’t end any office you gave.' };
}

/** The offices you hold in a federation now: caretaker from your founding record, the rest from your membership. */
export async function myOffices(did: string, federation: string, o: { own?: FederationRecord | null; mine?: MembershipRecord | null }): Promise<OfficeHeld[]> {
	return officesHeld(did, federation, { grant: o.own?.grant ?? null, appointments: o.mine?.offices ?? [], endings: o.mine?.officeEndings ?? [] });
}

/** Which of the caretaker's office records are still running. */
export const runningOffice = (o: OfficeRecord, now = Date.now()) => !o.ended && o.appointment.until * 1000 > now;
