/*
 * Offices (ADR-Q-007 §5 "Offices", §6; ADR-Q-038 step 5), 6 October 2026.
 *
 * "Each office is a named slot with scope, term and a recall path; holding it
 * is a UCAN mandate from the federation key with exp. Cannot: be permanent;
 * renew silently; be held by an AI."
 *
 * Darren (5 October): buttons that speak for an organisation go to an office
 * — the treasurer elected this year — never a named person; power to change
 * things comes only from a role you hold and have taken up.
 *
 * Two receipts:
 *
 *   office.appointed   the federation key and the person appointing both
 *                      sign: who holds which office, for what, until when,
 *                      and why. It carries the mandates — one UCAN from the
 *                      federation key per command the office covers, each
 *                      ending when the term does — named in the signed part
 *                      by their CIDs.
 *   office.ended       early: the holder stands down (they sign), or the
 *                      office is recalled (the federation signs, citing why).
 *                      A term that simply runs out needs no receipt.
 *
 * The caretaker is the first office, and comes from the founding grant
 * (federations.ts), not from an appointment: only the members can renew it.
 * Until the Plans block (elections) is built, the caretaker appoints, and
 * every appointment is a receipt the members can see. Nobody can appoint
 * themselves: that is renewing silently by another name.
 *
 * Pure: no storage, no window.
 */
import { canonical, b64url, unb64url, sha256 } from './canonical';
import { publicKeyFrom, toDid } from './did';
import { checkReceipt, sealWith, type Signer, type SealedReceipt } from './seal';
import type { Identity } from './passkey';
import { delegate, readDelegation, type Delegation, type UcanSigner } from './ucan/token';
import { CARETAKER_MONTHS, FEDERATION_COMMANDS } from './federations';

export const OFFICE_APPOINTED_SCHEMA = 'inqbeta.office-appointed/1';
export const OFFICE_ENDED_SCHEMA = 'inqbeta.office-ended/1';

/** Commands an office may be given, beyond the federation's own (federations.ts). */
export const OFFICE_COMMANDS = {
	...FEDERATION_COMMANDS,
	/** The mint and the books: reconcile, the federation's cash-outs (two signatures to spend). */
	money: '/fed/money',
	/** News to members. */
	announce: '/fed/announce',
	/** Minutes and the record of meetings. */
	minutes: '/fed/minutes',
	/** Safeguarding: concerns, and who is told. */
	safeguard: '/fed/safeguard',
	/** The federation's nodes, storage and services. */
	services: '/fed/services',
	/** The federation's website. */
	site: '/fed/site',
	/** Checking evidence: that receipts hold, and saying so, signed. */
	verify: '/fed/verify',
	/** Reviewing work and decisions before they go out. */
	review: '/fed/review',
	/** That the federation keeps its own rules and the law. */
	compliance: '/fed/compliance'
} as const;

export type OfficeId = 'caretaker' | 'treasurer' | 'secretary' | 'chair' | 'safeguarding' | 'steward' | 'verifier' | 'reviewer' | 'compliance';

export interface OfficeKind {
	id: OfficeId;
	called: string;
	/** What it's for, in one plain sentence. */
	does: string;
	/** The commands its mandate covers. */
	scope: string[];
}

/** The offices, in the order they're shown. The caretaker covers everything, until the members choose otherwise. */
export const OFFICES: OfficeKind[] = [
	{ id: 'caretaker', called: 'Caretaker', does: 'Looks after the federation until the members choose who does what.', scope: [OFFICE_COMMANDS.all] },
	{ id: 'treasurer', called: 'Treasurer', does: 'Keeps the money: the mint’s books, reconciling, and the federation’s own payments, never alone.', scope: [OFFICE_COMMANDS.money] },
	{ id: 'secretary', called: 'Secretary', does: 'Looks after membership and the record: lets people in, sends news, keeps the minutes.', scope: [OFFICE_COMMANDS.admit, OFFICE_COMMANDS.announce, OFFICE_COMMANDS.minutes] },
	{ id: 'chair', called: 'Chair', does: 'Runs meetings and speaks for the federation on what it has decided.', scope: [OFFICE_COMMANDS.minutes, OFFICE_COMMANDS.announce] },
	{ id: 'safeguarding', called: 'Safeguarding lead', does: 'The named person for keeping children and vulnerable adults safe.', scope: [OFFICE_COMMANDS.safeguard] },
	{ id: 'steward', called: 'Steward', does: 'Looks after the federation’s nodes, storage, services and website.', scope: [OFFICE_COMMANDS.services, OFFICE_COMMANDS.site] },
	/* Offices of responsibility (Darren, 6 October): people who check, held in the headspace of no conflict of interest. */
	{ id: 'verifier', called: 'Verifier', does: 'Checks evidence: that receipts hold and say what they claim, and signs to say so.', scope: [OFFICE_COMMANDS.verify] },
	{ id: 'reviewer', called: 'Reviewer', does: 'Reviews work and decisions before they go out, and signs what they found.', scope: [OFFICE_COMMANDS.review] },
	{ id: 'compliance', called: 'Compliance officer', does: 'Checks the federation keeps its own rules and the law, and says plainly where it doesn’t.', scope: [OFFICE_COMMANDS.compliance] }
];

export const officeKind = (id: string): OfficeKind | undefined => OFFICES.find((o) => o.id === id);
/** Offices the caretaker can appoint: every one but the caretaker's own. */
export const APPOINTABLE: OfficeKind[] = OFFICES.filter((o) => o.id !== 'caretaker');

/** An office's term, in months: never permanent. The same bounds as the caretaker's. */
export const OFFICE_MONTHS = CARETAKER_MONTHS;
const MONTH_SECONDS = Math.round(30.4375 * 24 * 60 * 60);

/** Does a command fall within one the mandate gives? '/fed' covers '/fed/money'; '/fed/money' covers '/fed/money/pay'. */
export const covers = (given: string, wanted: string) => wanted === given || wanted.startsWith(given.endsWith('/') ? given : `${given}/`);
/** Does this office's scope cover the command? */
export const officeMay = (office: string, cmd: string) => (officeKind(office)?.scope ?? []).some((g) => covers(g, cmd));

type Signature = { by: string; did: string; signature: string };
type Signed<T> = T & { signatures: Signature[] };
type Check = { ok: true; says: string } | { ok: false; says: string };

export interface AppointedStatement {
	schema: typeof OFFICE_APPOINTED_SCHEMA;
	event: 'office.appointed';
	federation: string;
	office: OfficeId;
	/** Who holds it. */
	holder: string;
	/** What the mandates cover: the office's scope when appointed. */
	scope: string[];
	/** When the term ends, unix seconds. The mandates end then too. */
	until: number;
	/** Who appointed them, by their own office: the caretaker, until elections exist. */
	by: string;
	byOffice: 'caretaker';
	/** The appointer's own mandate (the caretaker grant), by CID: their authority, carried so anyone can check it. */
	authority: string;
	/** Why, in plain words: "Chosen at the meeting on 4 October." */
	says: string;
	/**
	 * An interest that comes with the office itself (Darren, 6 October): an
	 * internal compliance officer is "employed by the company", so won't
	 * jeopardise their own job. Written into every mandate, so every take-up
	 * must declare it. Doesn't stop them acting.
	 */
	standingInterest?: string;
	/** The mandates, by CID, in scope order. */
	mandates: string[];
	at: string;
}
export type Appointed = Signed<AppointedStatement> & {
	/** The mandates themselves: UCAN bytes, base64url, matching `mandates`. */
	tokens: string[];
	/** The appointer's caretaker grant: UCAN bytes, base64url, matching `authority`. */
	authorityToken: string;
};

export interface EndedStatement {
	schema: typeof OFFICE_ENDED_SCHEMA;
	event: 'office.ended';
	federation: string;
	office: OfficeId;
	holder: string;
	/** The appointment it ends, by hash. */
	appointment: string;
	how: 'stood-down' | 'recalled';
	says: string;
	at: string;
}
export type Ended = Signed<EndedStatement>;

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
	if (!s || s.did !== did) return false;
	const { tokens: _t, authorityToken: _a, ...rest } = x as { tokens?: unknown; authorityToken?: unknown; signatures: Signature[] };
	return verify(did, unsigned(rest as { signatures: Signature[] }), s.signature);
}

/** An appointment's identity: the hash of its signed part. */
export async function hashAppointment(a: Appointed): Promise<string> {
	const { tokens: _t, authorityToken: _a, ...rest } = a;
	return `receipt:sha256:${await sha256(canonical(rest))}`;
}

/**
 * Appoint someone to an office. `federation` is the federation key (opened
 * from the caretaker's vault); `by` is the caretaker's own signer (their
 * passkey); `grant` is their caretaker grant (the founding's, base64url).
 * Both sign. Throws, in plain words, on anything the rules forbid.
 */
export async function appoint(
	federation: UcanSigner,
	by: Signer,
	o: { federation: string; office: OfficeId; holder: string; months: number; says: string; grant: string; name?: string; standingInterest?: string },
	now = new Date()
): Promise<Appointed> {
	if (toDid(federation.did) !== o.federation) throw new Error('Only the federation’s own key can give a mandate.');
	const kind = officeKind(o.office);
	if (!kind) throw new Error('There is no such office.');
	if (kind.id === 'caretaker') throw new Error('The caretaker isn’t appointed: it comes from the founding, and only the members can renew it.');
	const holder = toDid(o.holder);
	const appointer = toDid(by.did);
	if (holder === appointer) throw new Error('Nobody can appoint themselves.');
	if (!Number.isInteger(o.months) || o.months < OFFICE_MONTHS.least || o.months > OFFICE_MONTHS.most)
		throw new Error(`A term is between ${OFFICE_MONTHS.least} and ${OFFICE_MONTHS.most} months.`);
	if (!o.says.trim()) throw new Error('Say why, in plain words: how they were chosen.');
	const authority = await readDelegation(unb64url(o.grant)).catch(() => null);
	const ap = authority?.payload;
	const nowS = now.getTime() / 1000;
	if (!ap || ap.iss !== o.federation || ap.sub !== o.federation || ap.aud !== appointer || ap.cmd !== FEDERATION_COMMANDS.all || (ap.exp !== null && ap.exp <= nowS))
		throw new Error('Only the federation’s caretaker can appoint, while their mandate runs.');
	const until = Math.floor(now.getTime() / 1000) + o.months * MONTH_SECONDS;
	const standing = o.standingInterest?.trim() || undefined;
	const meta = { 'inqbeta/office': kind.id, ...(o.name ? { 'inqbeta/federation': o.name } : {}), ...(standing ? { 'inqbeta/interest': standing } : {}) };
	const delegations: Delegation[] = [];
	for (const cmd of kind.scope) delegations.push(await delegate(federation, { to: holder, subject: o.federation, cmd, exp: until, meta }));
	const statement: AppointedStatement = {
		schema: OFFICE_APPOINTED_SCHEMA,
		event: 'office.appointed',
		federation: o.federation,
		office: kind.id,
		holder,
		scope: [...kind.scope],
		until,
		by: appointer,
		byOffice: 'caretaker',
		authority: authority!.cid.toString(),
		says: o.says.trim(),
		...(standing ? { standingInterest: standing } : {}),
		mandates: delegations.map((d) => d.cid.toString()),
		at: now.toISOString()
	};
	return {
		...statement,
		signatures: [
			{ by: 'federation', did: o.federation, signature: await federation.signCanonical(statement) },
			{ by: 'appointer', did: appointer, signature: await by.signCanonical(statement) }
		],
		tokens: delegations.map((d) => b64url(d.bytes)),
		authorityToken: o.grant
	};
}

/** The parts of an appointment, checked one by one, for the rules (q-actions) and for anyone reading it. */
export async function appointmentParts(x: unknown, now = new Date()) {
	const a = x as Appointed;
	const well = !!a && a.schema === OFFICE_APPOINTED_SCHEMA && a.event === 'office.appointed' && Array.isArray(a.signatures) && Array.isArray(a.tokens) && Array.isArray(a.mandates) && typeof a.authorityToken === 'string';
	if (!well) return null;
	const kind = officeKind(a.office);
	const at = Date.parse(a.at) / 1000;
	let mandatesMatch = a.tokens.length === a.mandates.length && a.tokens.length > 0;
	if (mandatesMatch) {
		for (let i = 0; i < a.tokens.length; i++) {
			try {
				const d = await readDelegation(unb64url(a.tokens[i]));
				const p = d.payload;
				if (d.cid.toString() !== a.mandates[i] || p.iss !== a.federation || p.sub !== a.federation || p.aud !== a.holder || p.cmd !== a.scope[i] || p.exp !== a.until || (p.meta?.['inqbeta/interest'] ?? undefined) !== (a.standingInterest ?? undefined)) mandatesMatch = false;
			} catch {
				mandatesMatch = false;
			}
		}
	}
	let appointerWasCaretaker = false;
	try {
		const g = await readDelegation(unb64url(a.authorityToken));
		appointerWasCaretaker = g.cid.toString() === a.authority && (await appointerHeldCaretaker(a, a.authorityToken));
	} catch {
		appointerWasCaretaker = false;
	}
	return {
		appointerWasCaretaker,
		signedByFederation: await signedBy(a, 'federation', a.federation),
		signedByAppointer: await signedBy(a, 'appointer', a.by),
		knownOffice: !!kind,
		isCaretaker: a.office === 'caretaker',
		scopeIsTheOffice: !!kind && kind.scope.length === a.scope.length && kind.scope.every((s, i) => a.scope[i] === s),
		mandatesMatch,
		selfAppointed: a.holder === a.by,
		hasTerm: Number.isFinite(a.until) && a.until > at,
		termWithinBounds: Number.isFinite(a.until) && a.until - at <= OFFICE_MONTHS.most * MONTH_SECONDS + 60,
		saysWhy: !!a.says?.trim(),
		running: Number.isFinite(a.until) && a.until > now.getTime() / 1000
	};
}

/** Is this a sound appointment? Signatures, the appointer's authority, the mandates and the term. */
export async function checkAppointment(x: unknown, now = new Date()): Promise<Check> {
	const p = await appointmentParts(x, now);
	if (!p) return { ok: false, says: 'This isn’t an appointment.' };
	if (!p.knownOffice) return { ok: false, says: 'It names an office Q doesn’t know.' };
	if (p.isCaretaker) return { ok: false, says: 'The caretaker isn’t appointed: it comes from the founding.' };
	if (!p.signedByFederation) return { ok: false, says: 'The federation didn’t sign this appointment.' };
	if (!p.signedByAppointer) return { ok: false, says: 'The person appointing didn’t sign it.' };
	if (!p.appointerWasCaretaker) return { ok: false, says: 'Whoever appointed them wasn’t the caretaker at the time.' };
	if (p.selfAppointed) return { ok: false, says: 'Nobody can appoint themselves.' };
	if (!p.scopeIsTheOffice) return { ok: false, says: 'Its powers aren’t the office’s.' };
	if (!p.mandatesMatch) return { ok: false, says: 'Its mandates don’t match it.' };
	if (!p.hasTerm || !p.termWithinBounds) return { ok: false, says: `A term is between ${OFFICE_MONTHS.least} and ${OFFICE_MONTHS.most} months.` };
	if (!p.saysWhy) return { ok: false, says: 'It doesn’t say why.' };
	const a = x as Appointed;
	return { ok: true, says: `${officeKind(a.office)!.called} until ${new Date(a.until * 1000).toISOString().slice(0, 10)}.` };
}

/**
 * Did the appointer hold the caretaker mandate when they appointed? `grant`
 * is a caretaker grant (federations.ts): from the federation key, to them,
 * for everything, not yet expired at the appointment.
 */
export async function appointerHeldCaretaker(a: Appointed, grant: Uint8Array | string): Promise<boolean> {
	try {
		const d = await readDelegation(typeof grant === 'string' ? unb64url(grant) : grant);
		const p = d.payload;
		const at = Date.parse(a.at) / 1000;
		return p.iss === a.federation && p.sub === a.federation && p.aud === a.by && p.cmd === FEDERATION_COMMANDS.all && (p.exp === null || p.exp > at) && (p.nbf === undefined || p.nbf <= at);
	} catch {
		return false;
	}
}

/** The holder stands down early. They alone sign. */
export async function standDown(holder: Signer, a: Appointed, says: string, now = new Date()): Promise<Ended> {
	if (toDid(holder.did) !== a.holder) throw new Error('Only the holder can stand down.');
	return end(holder, 'holder', a, 'stood-down', says.trim() || 'Stood down.', now);
}

/** The federation recalls an office early, saying why. */
export async function recall(federation: Signer, a: Appointed, says: string, now = new Date()): Promise<Ended> {
	if (toDid(federation.did) !== a.federation) throw new Error('Only the federation’s own key can recall an office.');
	if (!says.trim()) throw new Error('A recall must say why.');
	return end(federation, 'federation', a, 'recalled', says.trim(), now);
}

async function end(signer: Signer, by: string, a: Appointed, how: EndedStatement['how'], says: string, now: Date): Promise<Ended> {
	const statement: EndedStatement = {
		schema: OFFICE_ENDED_SCHEMA,
		event: 'office.ended',
		federation: a.federation,
		office: a.office,
		holder: a.holder,
		appointment: await hashAppointment(a),
		how,
		says,
		at: now.toISOString()
	};
	return { ...statement, signatures: [{ by, did: toDid(signer.did), signature: await signer.signCanonical(statement) }] };
}

/** Is this a sound ending of that appointment? */
export async function checkEnded(x: unknown, a: Appointed): Promise<Check> {
	const e = x as Ended;
	if (!e || e.schema !== OFFICE_ENDED_SCHEMA || !Array.isArray(e.signatures)) return { ok: false, says: 'This doesn’t end an office.' };
	if (e.appointment !== (await hashAppointment(a)) || e.holder !== a.holder || e.federation !== a.federation || e.office !== a.office) return { ok: false, says: 'It ends a different appointment.' };
	const ok = e.how === 'stood-down' ? await signedBy(e, 'holder', a.holder) : e.how === 'recalled' ? await signedBy(e, 'federation', a.federation) : false;
	if (!ok) return { ok: false, says: e.how === 'stood-down' ? 'The holder didn’t sign this.' : 'The federation didn’t sign this recall.' };
	return { ok: true, says: e.how === 'stood-down' ? `Stood down on ${e.at.slice(0, 10)}.` : `Recalled on ${e.at.slice(0, 10)}: ${e.says}` };
}

export interface OfficeHeld {
	office: OfficeId;
	called: string;
	does: string;
	scope: string[];
	/** When it ends, unix seconds. */
	until: number;
	/** The appointment, by hash; null for the caretaker (from the founding grant). */
	appointment: string | null;
}

/**
 * The offices `did` holds in a federation right now: the caretaker from the
 * founding grant (still running), and every sound appointment to them that
 * hasn't run out or been ended. An appointment carries its appointer's
 * caretaker grant, so one from anyone else doesn't count.
 */
export async function officesHeld(
	did: string,
	federation: string,
	o: { grant?: string | Uint8Array | null; appointments?: unknown[]; endings?: unknown[]; now?: Date }
): Promise<OfficeHeld[]> {
	const now = o.now ?? new Date();
	const out: OfficeHeld[] = [];
	const care = officeKind('caretaker')!;
	if (o.grant) {
		try {
			const g = await readDelegation(typeof o.grant === 'string' ? unb64url(o.grant) : o.grant);
			const p = g.payload;
			if (p.iss === federation && p.sub === federation && p.aud === did && p.cmd === FEDERATION_COMMANDS.all && (p.exp === null || p.exp > now.getTime() / 1000))
				out.push({ office: 'caretaker', called: care.called, does: care.does, scope: care.scope, until: p.exp ?? Infinity, appointment: null });
		} catch {
			/* not a grant */
		}
	}
	for (const x of o.appointments ?? []) {
		const a = x as Appointed;
		if (a?.holder !== did || a.federation !== federation) continue;
		if (!(await checkAppointment(a, now)).ok || a.until <= now.getTime() / 1000) continue;
		let ended = false;
		for (const e of o.endings ?? []) if ((await checkEnded(e, a)).ok) ended = true;
		if (ended) continue;
		const k = officeKind(a.office)!;
		out.push({ office: k.id, called: k.called, does: k.does, scope: a.scope, until: a.until, appointment: await hashAppointment(a) });
	}
	/* One of each office: the latest appointment wins. */
	const byOffice = new Map<string, OfficeHeld>();
	for (const h of out) if (!byOffice.has(h.office) || byOffice.get(h.office)!.until < h.until) byOffice.set(h.office, h);
	return OFFICES.map((k) => byOffice.get(k.id)).filter((h): h is OfficeHeld => !!h);
}

/* ---- Telling the servers (6 October 2026) ----
 *
 * A mandate carries its own end date, but a recall or a stand-down ends it
 * early, and a server can't know unless it's told. The federation's key signs
 * a notice naming the mandates that no longer count; its storage node keeps
 * the list (the gate's /revoked/<federation>), and servers check it before
 * trusting someone acting in role (inrole.ts `revoked`).
 */
export const MANDATES_REVOKED_SCHEMA = 'inqbeta.mandates-revoked/1';

export interface MandatesRevoked {
	schema: typeof MANDATES_REVOKED_SCHEMA;
	source: 'inqbeta:q/offices';
	federation: string;
	office: OfficeId;
	holder: string;
	/** The mandates that no longer count, by CID. */
	mandates: string[];
	/** The appointment they came from, and how it ended. */
	appointment: string;
	how: EndedStatement['how'];
	at: string;
}
export type MandatesRevokedReceipt = SealedReceipt & { content: MandatesRevoked };

/** The notice for an ending, signed by the federation's key (opened from the caretaker's vault). */
export async function revocationNotice(federationKey: Pick<Identity, 'did' | 'publicKey' | 'signing'>, a: Appointed, e: Ended, now = new Date()): Promise<MandatesRevokedReceipt> {
	if (toDid(federationKey.did) !== a.federation) throw new Error('Only the federation’s own key can say its mandates have ended.');
	const c = await checkEnded(e, a);
	if (!c.ok) throw new Error(c.says);
	const content: MandatesRevoked = {
		schema: MANDATES_REVOKED_SCHEMA,
		source: 'inqbeta:q/offices',
		federation: a.federation,
		office: a.office,
		holder: a.holder,
		mandates: [...a.mandates],
		appointment: await hashAppointment(a),
		how: e.how,
		at: now.toISOString()
	};
	return (await sealWith(federationKey, content)) as MandatesRevokedReceipt;
}

/** The mandates a federation has said have ended, from its list: only notices its own key signed. */
export async function revokedSet(items: unknown[], federation: string): Promise<Set<string>> {
	const out = new Set<string>();
	for (const x of items ?? []) {
		const r = x as MandatesRevokedReceipt;
		if (r?.content?.schema !== MANDATES_REVOKED_SCHEMA || r.did !== federation || r.content.federation !== federation || !Array.isArray(r.content.mandates)) continue;
		if (!(await checkReceipt(r)).ok) continue;
		for (const m of r.content.mandates) if (typeof m === 'string') out.add(m);
	}
	return out;
}

/* ---- The office's post (ADR-Q-038 §5, ADR-Q-037 §2–3; job C5), 6 October 2026 ----
 *
 * An office has no inbox of its own: post for it goes to whoever holds it now.
 * Only the holder can say where their inbox is (it comes from their vault
 * key), so on keeping an appointment they sign a notice: "post for this
 * office reaches me here", with the appointment as proof. The federation's
 * storage node keeps the notices (the gate's /offices/<federation>); a
 * sender's Q checks each one itself — the appointment, its term, the revoked
 * list — so a forged or ended one is simply passed over.
 */
export const OFFICE_POST_SCHEMA = 'inqbeta.office-post/1';

export interface OfficePost {
	schema: typeof OFFICE_POST_SCHEMA;
	source: 'inqbeta:q/offices';
	federation: string;
	office: OfficeId;
	/** The holder's inbox id, where post for the office is left. */
	inbox: string;
	/** The appointment that makes them the holder, whole, so anyone can check it. */
	appointment: Appointed;
	/** When post for the office rings for them; out of hours it waits, and the asker is told. Absent: any time. */
	hours?: OfficeHours;
	at: string;
}
export type OfficePostReceipt = SealedReceipt & { content: OfficePost };

/** The holder's notice: post for this office reaches my inbox. */
export async function officePost(holder: Pick<Identity, 'did' | 'publicKey' | 'signing'>, a: Appointed, inbox: string, now = new Date(), hours?: OfficeHours | null): Promise<OfficePostReceipt> {
	if (toDid(holder.did) !== a.holder) throw new Error('Only the office’s holder can say where its post goes.');
	if (!/^[A-Za-z0-9_-]{22}$/.test(inbox)) throw new Error('That isn’t an inbox.');
	return (await sealWith(holder, { schema: OFFICE_POST_SCHEMA, source: 'inqbeta:q/offices', federation: a.federation, office: a.office, inbox, appointment: a, ...(hours && hoursOk(hours) ? { hours } : {}), at: now.toISOString() } satisfies OfficePost)) as OfficePostReceipt;
}

export interface OfficeAddress {
	office: OfficeId;
	holder: string;
	inbox: string;
	until: number;
	hours?: OfficeHours;
}

/* ---- Office hours (Darren, 6 October: "between which hours … and if those hours are out of hours, then some kind of out-of-hours message") ---- */

/** Days (0 Sunday … 6 Saturday) and hours, in a time zone. `to` is exclusive: 9–17 is nine till five. */
export interface OfficeHours {
	days: number[];
	from: number;
	to: number;
	/** IANA time zone, e.g. Europe/London. */
	zone: string;
}
export const WEEKDAYS_9_TO_5 = (zone: string): OfficeHours => ({ days: [1, 2, 3, 4, 5], from: 9, to: 17, zone });

export function hoursOk(h: unknown): h is OfficeHours {
	const x = h as OfficeHours;
	if (!x || !Array.isArray(x.days) || !x.days.length || !x.days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) return false;
	if (!Number.isInteger(x.from) || !Number.isInteger(x.to) || x.from < 0 || x.to > 24 || x.from >= x.to) return false;
	try {
		new Intl.DateTimeFormat('en-GB', { timeZone: x.zone });
		return true;
	} catch {
		return false;
	}
}

/** Is it within these hours now, in their own time zone? No hours: always. */
export function inHours(h: OfficeHours | null | undefined, now = new Date()): boolean {
	if (!h || !hoursOk(h)) return true;
	const parts = new Intl.DateTimeFormat('en-GB', { timeZone: h.zone, weekday: 'short', hour: 'numeric', hourCycle: 'h23' }).formatToParts(now);
	const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.find((p) => p.type === 'weekday')?.value ?? '');
	const hour = Number(parts.find((p) => p.type === 'hour')?.value);
	return h.days.includes(day) && hour >= h.from && hour < h.to;
}

/** Hours in words: "Monday to Friday, 9 till 5 (UK time)". */
export function hoursInWords(h: OfficeHours): string {
	const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
	const d = [...h.days].sort((a, b) => a - b);
	const run = d.length > 2 && d.every((x, i) => i === 0 || x === d[i - 1] + 1);
	const days = d.length === 7 ? 'Every day' : run ? `${names[d[0]]} to ${names[d.at(-1)!]}` : d.map((x) => names[x]).join(', ');
	const clock = (n: number) => (n === 0 || n === 24 ? 'midnight' : n === 12 ? 'noon' : n < 12 ? `${n}am` : `${n - 12}pm`);
	return `${days}, ${clock(h.from)} till ${clock(h.to)} (${h.zone.replace(/_/g, ' ')} time)`;
}

/**
 * Who to write to for each office now, from a federation's notices: signed by
 * the holder, carrying a sound appointment to them, still running, not
 * revoked. The newest notice per holder and office wins.
 */
export async function officeAddresses(items: unknown[], federation: string, o: { revoked?: Set<string>; now?: Date } = {}): Promise<OfficeAddress[]> {
	const now = o.now ?? new Date();
	const best = new Map<string, { at: string; addr: OfficeAddress }>();
	for (const x of items ?? []) {
		const r = x as OfficePostReceipt;
		const c = r?.content;
		if (c?.schema !== OFFICE_POST_SCHEMA || c.federation !== federation || !c.appointment) continue;
		const a = c.appointment;
		if (r.did !== a.holder || a.federation !== federation || a.office !== c.office || !/^[A-Za-z0-9_-]{22}$/.test(c.inbox ?? '')) continue;
		if (!(await checkReceipt(r)).ok || !(await checkAppointment(a, now)).ok) continue;
		if (a.until * 1000 <= now.getTime() || a.mandates.some((m) => o.revoked?.has(m))) continue;
		const key = `${a.office}|${a.holder}`;
		if (!best.has(key) || best.get(key)!.at < c.at) best.set(key, { at: c.at, addr: { office: a.office, holder: a.holder, inbox: c.inbox, until: a.until, ...(c.hours && hoursOk(c.hours) ? { hours: c.hours } : {}) } });
	}
	return [...best.values()].map((b) => b.addr);
}
