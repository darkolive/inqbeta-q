/*
 * Permissions — CRUD + Grant, as UCAN.
 *
 * Decided 2026-09-16 (docs/identity/permissions.md, ucan-analysis.md):
 *   · permissions are standard UCAN delegations and invocations;
 *   · commands live under /inqbeta, beside the schema address;
 *   · passing a power on follows UCAN — anyone may pass on what they hold,
 *     only ever narrower, and every pass-on shows in the signed chain;
 *   · destroying a whole thing needs a second signature: a council approval,
 *     named in the destroy's arguments and checked here.
 *
 * A "thing" is anything with a create receipt. Its owner is the DID that
 * signed the create receipt, which is the UCAN subject; the thing itself is
 * pinned by policy (`.thing` must equal its id), so one grant never leaks to
 * the owner's other things.
 *
 * What needs no permission at all: CREATE (signing a create receipt makes you
 * the owner) and BRANCH (anyone who can read may disagree in their own branch).
 * READ is enforced by sealing (sealTo); a read grant records it.
 */
import type { Signer } from './seal';
import type { Ipld } from './ucan/cbor';
import { CID } from './ucan/cid';
import { UcanError } from './ucan/errors';
import type { Policy } from './ucan/policy';
import {
	canSignBytes,
	delegate,
	invoke,
	now,
	type Delegation,
	type Invocation,
	type Meta,
	type UcanSigner
} from './ucan/token';
import { checkInvocation, type Allowed, type KnownRevocation } from './ucan/validate';

export const COMMANDS = {
	/** Everything below — hand with care. */
	all: '/inqbeta',
	read: '/inqbeta/read',
	merge: '/inqbeta/merge',
	withdraw: '/inqbeta/withdraw',
	shred: '/inqbeta/shred',
	destroy: '/inqbeta/destroy',
	/** A system asking for a power. Never a power itself. */
	request: '/inqbeta/request',
	/** A second signer (the council) agreeing to a destroy. */
	approve: '/inqbeta/approve'
} as const;

export type Power = 'all' | 'read' | 'merge' | 'withdraw' | 'shred' | 'destroy';

/** How long a power handed to a system lasts unless said otherwise: seven days. */
export const SYSTEM_GRANT_SECONDS = 7 * 24 * 60 * 60;

export function ucanSigner(s: Signer): UcanSigner {
	if (!canSignBytes(s)) throw new Error('This key cannot sign permissions yet.');
	return s;
}

function thingPolicy(thing: string, branch?: string): Policy {
	const p: Policy = [['==', '.thing', thing]];
	if (branch) p.push(['like', '.branch', branch]);
	return p;
}

export interface GrantOptions {
	to: string;
	/** The id of the thing (the hash of its create receipt). */
	thing: string;
	can: Power;
	/**
	 * When passing on a power you were given, the delegation you hold. The new
	 * grant keeps its subject; UCAN makes sure it can only be narrower.
	 */
	from?: Delegation;
	/** Merge only: which branches, as a pattern ("review-*"). */
	branch?: string;
	/** Unix seconds, or null for no end. */
	exp?: number | null;
	meta?: Meta;
}

/** "`to` may `can` on `thing`." Signed by the owner, or by someone passing on what they hold. */
export async function grant(signer: Signer, o: GrantOptions): Promise<Delegation> {
	const s = ucanSigner(signer);
	if (o.from && o.from.payload.aud !== s.did) throw new UcanError('InvalidAudience', 'That delegation was not given to you.');
	const subject = o.from ? (o.from.payload.sub ?? undefined) : s.did;
	if (!subject) throw new UcanError('InvalidClaim', 'A power over a thing must name its owner.');
	return delegate(s, {
		to: o.to,
		subject,
		cmd: COMMANDS[o.can],
		pol: thingPolicy(o.thing, o.branch),
		exp: o.exp ?? null,
		meta: o.meta
	});
}

export interface ActOptions {
	owner: string;
	thing: string;
	can: Exclude<Power, 'all'>;
	args?: Record<string, Ipld>;
	/** Root first. Leave empty when acting on your own thing. */
	proofs?: Delegation[];
	/** Destroy only: the council's approval. */
	approval?: Invocation;
}

/** Use a power: "I, signer, `can` on `thing`." */
export async function act(signer: Signer, o: ActOptions): Promise<Invocation> {
	const args: Record<string, Ipld> = { ...(o.args ?? {}), thing: o.thing };
	if (o.can === 'destroy') {
		if (!o.approval) throw new UcanError('NeedsApproval', 'Destroying a whole thing needs a second signature.');
		args.approval = o.approval.cid;
	}
	return invoke(ucanSigner(signer), { subject: o.owner, cmd: COMMANDS[o.can], args, proofs: o.proofs ?? [] });
}

/** A council (or co-owner) agrees that `thing` may be destroyed. */
export async function approveDestroy(council: Signer, o: { owner: string; thing: string; reason?: string }): Promise<Invocation> {
	const s = ucanSigner(council);
	return invoke(s, {
		subject: s.did,
		audience: o.owner,
		cmd: COMMANDS.approve,
		args: { thing: o.thing, action: COMMANDS.destroy, owner: o.owner },
		exp: now() + SYSTEM_GRANT_SECONDS,
		meta: o.reason ? { reason: o.reason } : undefined
	});
}

/** A system asks the owner for a power. It is a message, not a power. */
export async function ask(system: Signer, o: { owner: string; thing: string; want: Power; reason: string }): Promise<Invocation> {
	const s = ucanSigner(system);
	return invoke(s, {
		subject: s.did,
		audience: o.owner,
		cmd: COMMANDS.request,
		args: { thing: o.thing, want: COMMANDS[o.want], reason: o.reason },
		exp: now() + SYSTEM_GRANT_SECONDS
	});
}

/**
 * A person answers a system's request. The grant is narrow (the thing, the
 * command asked for), short (seven days unless said), and names the person
 * who approved it and the request it answers.
 */
export async function answer(person: Signer, request: Invocation, o: { exp?: number; from?: Delegation } = {}): Promise<Delegation> {
	const p = request.payload;
	if (p.cmd !== COMMANDS.request) throw new UcanError('InvalidToken', 'That is not a request.');
	const want = Object.entries(COMMANDS).find(([, c]) => c === p.args.want)?.[0] as Power | undefined;
	if (!want || typeof p.args.thing !== 'string') throw new UcanError('InvalidToken', 'The request does not say what it wants.');
	if (want === 'destroy' || want === 'all') throw new UcanError('NeedsApproval', 'A system is never handed destroy or everything.');
	return grant(person, {
		to: p.iss,
		thing: p.args.thing,
		can: want,
		from: o.from,
		exp: o.exp ?? now() + SYSTEM_GRANT_SECONDS,
		meta: { 'inqbeta/request': request.cid, 'inqbeta/approved-by': person.did }
	});
}

export interface AllowedCheck {
	proofs: Iterable<Delegation>;
	revocations?: Iterable<KnownRevocation>;
	at?: number;
	/** Council approvals to hand, for destroy. */
	approvals?: Iterable<Invocation>;
	/** Who may give the second signature for destroy. */
	council?: string[];
}

export interface AllowedResult extends Allowed {
	thing: string;
	/** Destroy only: who gave the second signature. */
	approvedBy?: string;
}

/** The verifier's fifth question: were they allowed? Throws UcanError if not. */
export function isAllowed(inv: Invocation, o: AllowedCheck): AllowedResult {
	const p = inv.payload;
	if (!p.cmd.startsWith(COMMANDS.all + '/') || p.cmd === COMMANDS.request || p.cmd === COMMANDS.approve)
		throw new UcanError('InvalidClaim', `${p.cmd} is not a Q power.`);
	const thing = p.args.thing;
	if (typeof thing !== 'string') throw new UcanError('MatchError', 'A Q power names the thing it acts on (args.thing).');
	const allowed = checkInvocation(inv, o);
	if (p.cmd !== COMMANDS.destroy) return { ...allowed, thing };

	const at = o.at ?? now();
	const cid = p.args.approval;
	if (!(cid instanceof CID)) throw new UcanError('NeedsApproval', 'Destroying a whole thing needs a second signature.');
	const approval = [...(o.approvals ?? [])].find((a) => a.cid.equals(cid));
	if (!approval) throw new UcanError('UnavailableProof', 'The approval named is not to hand.');
	const a = approval.payload;
	const council = new Set(o.council ?? []);
	if (a.cmd !== COMMANDS.approve || a.args.thing !== thing || a.args.action !== COMMANDS.destroy || a.args.owner !== p.sub)
		throw new UcanError('NeedsApproval', 'The approval is for something else.');
	if (a.iss === p.sub || a.iss === p.iss) throw new UcanError('NeedsApproval', 'The second signature must be someone else’s.');
	if (!council.has(a.iss)) throw new UcanError('NeedsApproval', `${a.iss} is not a second signer for this thing.`);
	if (a.exp !== null && at > a.exp) throw new UcanError('Expired', 'The approval has expired.');
	return { ...allowed, thing, approvedBy: a.iss };
}
