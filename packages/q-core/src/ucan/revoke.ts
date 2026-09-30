/*
 * Revocation — "that delegation no longer counts", as a signed, permanent,
 * forward-only statement.
 *
 * A revocation is an invocation of `/ucan/revoke` naming the delegation's CID.
 * Whoever issued that delegation, or any delegation above it on the same line,
 * may revoke it. It can never be taken back — to restore a power, grant it
 * again. What was signed under the delegation before the revocation keeps
 * holding up; only use after it stops.
 *
 * Revocations are meant to travel: they are kept in the folder and carried by
 * copy locations and nodes, and a check applies whichever ones have arrived.
 */
import { CID } from './cid';
import { UcanError } from './errors';
import { invoke, type Delegation, type Invocation, type UcanSigner } from './token';
import type { KnownRevocation } from './validate';

export const REVOKE_COMMAND = '/ucan/revoke';

/**
 * Revoke `target`. `line` is the chain from the root down to and including
 * `target` (just `[target]` when the signer issued it directly); the signer
 * must be the issuer of one of those delegations.
 */
export async function revoke(signer: UcanSigner, target: Delegation, line: Delegation[], reason?: string): Promise<Invocation> {
	const at = line.findIndex((d) => d.cid.equals(target.cid));
	if (at < 0) throw new UcanError('InvalidClaim', 'The line must include the delegation being revoked.');
	if (!line.slice(0, at + 1).some((d) => d.payload.iss === signer.did))
		throw new UcanError('InvalidClaim', 'Only an issuer on the line, at or above it, may revoke a delegation.');
	// A root delegation names its subject; a powerline (a device link) speaks for its own issuer.
	const subject = line[0].payload.sub ?? line[0].payload.iss;
	return invoke(signer, {
		subject,
		cmd: REVOKE_COMMAND,
		args: { revoke: target.cid, path: line.slice(0, at + 1).map((d) => d.cid) },
		nonce: null,
		exp: null,
		meta: reason ? { reason } : undefined
	});
}

/**
 * Reads a revocation for the store. When the delegations on its path are to
 * hand, it also checks that the revoker is on that path — so a stranger cannot
 * fill a store with revocations they had no right to make. (The check at use
 * time repeats this against the real chain, so a revocation is never trusted
 * on its own say-so.)
 */
export function asRevocation(inv: Invocation, path?: Delegation[]): KnownRevocation {
	const p = inv.payload;
	if (p.cmd !== REVOKE_COMMAND) throw new UcanError('InvalidToken', 'Not a revocation.');
	const target = p.args.revoke;
	if (!(target instanceof CID)) throw new UcanError('InvalidToken', 'A revocation names a delegation CID in args.revoke.');
	if (path) {
		const cids = p.args.path;
		if (!Array.isArray(cids) || cids.length !== path.length || !path.every((d, i) => d.cid.equals(cids[i] as CID)))
			throw new UcanError('InvalidClaim', 'The delegations given are not the path the revocation names.');
		if (!path[path.length - 1].cid.equals(target))
			throw new UcanError('InvalidClaim', 'The path must end at the revoked delegation.');
		for (let i = 1; i < path.length; i++)
			if (path[i].payload.iss !== path[i - 1].payload.aud)
				throw new UcanError('InvalidAudience', 'The path is not one line of delegations.');
		if (!path.some((d) => d.payload.iss === p.iss))
			throw new UcanError('InvalidClaim', `${p.iss} is not an issuer on that path.`);
	}
	return { revoked: target, by: p.iss, at: p.iat ?? 0 };
}
