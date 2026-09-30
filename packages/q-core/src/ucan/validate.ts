/*
 * Is this invocation allowed? The whole UCAN check, offline.
 *
 *   1. Every token is signed by its issuer (done when read).
 *   2. Every token is inside its time window at the moment asked about.
 *   3. The proofs form one line: the subject delegated first (a root
 *      delegation, never a powerline), each audience is the next issuer, and
 *      the last audience is the invoker.
 *   4. Each delegation's subject is the invocation's subject, or null
 *      (a powerline, which passes the subject through).
 *   5. Every delegation's command covers the one being run.
 *   6. The invocation's arguments satisfy every policy on the way.
 *   7. None of the delegations has been revoked by someone entitled to.
 *
 * "At the moment asked about" matters for evidence: a receipt signed last year
 * is checked against the permissions as they stood when it was signed, so an
 * expired grant does not un-sign history — but a revocation already known
 * does apply, forward from when it was made.
 */
import { CID } from './cid';
import { covers } from './command';
import { UcanError } from './errors';
import { matches } from './policy';
import type { Delegation, Invocation } from './token';
import { now } from './token';

/** A revocation as the store keeps it: who revoked which delegation, and when. */
export interface KnownRevocation {
	revoked: CID;
	by: string;
	at: number;
}

export interface CheckOptions {
	/** The delegations the invocation names; extra ones are ignored. */
	proofs: Iterable<Delegation>;
	/** Unix seconds. Defaults to now. */
	at?: number;
	revocations?: Iterable<KnownRevocation>;
}

export interface Allowed {
	invocation: Invocation;
	/** Root first. */
	chain: Delegation[];
	/** The subject's own DID — who, in the end, allowed it. */
	root: string;
}

function inWindow(t: { nbf?: number; exp: number | null }, at: number, what: string) {
	if (t.exp !== null && at > t.exp) throw new UcanError('Expired', `${what} expired at ${t.exp}.`);
	if (t.nbf !== undefined && at < t.nbf) throw new UcanError('TooEarly', `${what} is not valid until ${t.nbf}.`);
}

export function checkInvocation(inv: Invocation, o: CheckOptions): Allowed {
	const at = o.at ?? now();
	const p = inv.payload;
	inWindow(p, at, 'The invocation');

	const byCid = new Map<string, Delegation>();
	for (const d of o.proofs) byCid.set(d.cid.toString(), d);
	const chain = p.prf.map((c) => {
		const d = byCid.get(c.toString());
		if (!d) throw new UcanError('UnavailableProof', `Proof ${c} is not available.`);
		return d;
	});

	if (chain.length === 0) {
		if (p.iss !== p.sub) throw new UcanError('InvalidClaim', `${p.iss} has no proof that ${p.sub} allowed this.`);
		return { invocation: inv, chain, root: p.sub };
	}

	let expectedIssuer = p.sub;
	chain.forEach((d, i) => {
		const q = d.payload;
		const name = `Proof ${i + 1} (${d.cid})`;
		inWindow(q, at, name);
		if (i === 0 && q.sub === null) throw new UcanError('InvalidClaim', 'A powerline cannot be the first proof.');
		if (q.sub !== null && q.sub !== p.sub)
			throw new UcanError('InvalidSubject', `${name} is about ${q.sub}, not ${p.sub}.`);
		if (q.iss !== expectedIssuer)
			throw new UcanError(i === 0 ? 'InvalidClaim' : 'InvalidAudience', `${name} was issued by ${q.iss}; expected ${expectedIssuer}.`);
		// Every proof must cover the command actually run. Commands are paths, so
		// this is the same as each narrowing the last — and it lets a powerline
		// with "/" sit under a narrower grant, as the spec's own example does.
		if (!covers(q.cmd, p.cmd)) throw new UcanError('InvalidClaim', `${name} allows ${q.cmd}, not ${p.cmd}.`);
		expectedIssuer = q.aud;
	});
	if (expectedIssuer !== p.iss)
		throw new UcanError('InvalidAudience', `The last proof was issued to ${expectedIssuer}, not the invoker ${p.iss}.`);

	for (const d of chain) {
		const m = matches(d.payload.pol, p.args);
		if (!m.ok) throw new UcanError('MatchError', `The arguments fail ${JSON.stringify(m.statement)} in ${d.cid}.`);
	}

	if (o.revocations) {
		const list = [...o.revocations];
		chain.forEach((d, i) => {
			const entitled = new Set(chain.slice(0, i + 1).map((x) => x.payload.iss));
			const hit = list.find((r) => r.revoked.equals(d.cid) && entitled.has(r.by) && r.at <= at);
			if (hit) throw new UcanError('Revoked', `${d.cid} was revoked by ${hit.by}.`);
		});
	}

	return { invocation: inv, chain, root: p.sub };
}
