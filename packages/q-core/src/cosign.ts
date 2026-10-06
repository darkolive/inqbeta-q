/*
 * Two signatures (ADR-Q-007, the Money block; ADR-Q-038 §6 and §8), 6 October
 * 2026.
 *
 * Some things one office holder can't do alone:
 *   money      any spend or cash-out of the federation's money (the Money
 *              block: "two signatures on any spend"; "one person holding the
 *              purse alone" is a cannot);
 *   own        an action that touches the holder's own account: their own
 *              cash-out, membership, or a payment to them;
 *   interest   an action by a holder who declared an interest on taking up
 *              the office: the decision goes to another holder.
 *
 * The first holder, in role, signs the action and asks for a second. A second
 * holder, in role, in the same federation, with a mandate covering the same
 * command, reads it and signs the same words. They must be a different person,
 * not the one the action pays or touches, and not carrying an interest
 * themselves. Then it holds; until then it's only asked.
 *
 * Pure: no storage, no window.
 */
import { canonical, sha256, unb64url } from './canonical';
import { publicKeyFrom, toDid } from './did';
import { actingCovers, type Acting } from './inrole';
import type { Signer } from './seal';

export const COSIGN_SCHEMA = 'inqbeta.cosigned/1';
export type CosignWhy = 'money' | 'own' | 'interest';
export const COSIGN_WHY: Record<CosignWhy, string> = {
	money: 'It moves the federation’s money: two office holders sign every spend.',
	own: 'It touches the first holder’s own account: someone else must agree it.',
	interest: 'The first holder declared an interest: another holder decides.'
};

export interface CosignStatement {
	schema: typeof COSIGN_SCHEMA;
	federation: string;
	/** The federation command it is, e.g. /fed/money/cash-out. */
	cmd: string;
	/** What is being done, in full: the second holder signs exactly this. */
	action: Record<string, unknown>;
	/** What it is, in plain words, for the second holder to read. */
	says: string;
	why: CosignWhy[];
	/** Whose account it touches, if anyone's. */
	subject?: string;
	at: string;
}
interface CosignSignature {
	by: 'first' | 'second';
	did: string;
	office: string;
	signature: string;
	/** The signer's office proof, checked, not signed. */
	acting: Acting;
}
export type Cosigned = CosignStatement & { signatures: CosignSignature[] };

const unsigned = (c: Cosigned): CosignStatement => {
	const { signatures: _s, ...rest } = c;
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

/**
 * Does this action need a second holder? Money always does; so does anything
 * touching the holder's own account, or done by a holder who declared an
 * interest.
 */
export function needsSecond(o: { cmd: string; holder: string; subject?: string; acting?: Pick<Acting, 'takenUp'> | null }): CosignWhy[] {
	const why: CosignWhy[] = [];
	if (o.cmd === '/fed/money' || o.cmd.startsWith('/fed/money/')) why.push('money');
	if (o.subject && o.subject === o.holder) why.push('own');
	if (o.acting?.takenUp?.content?.declaration?.kind === 'interest') why.push('interest');
	return why;
}

/** The first holder signs, in role, and asks for a second. */
export async function askSecond(
	holder: Signer,
	acting: Acting,
	o: { cmd: string; action: Record<string, unknown>; says: string; subject?: string },
	now = new Date()
): Promise<Cosigned> {
	if (!o.says.trim()) throw new Error('Say what it is, for the second holder to read.');
	const why = needsSecond({ cmd: o.cmd, holder: toDid(holder.did), subject: o.subject, acting });
	const st: CosignStatement = {
		schema: COSIGN_SCHEMA,
		federation: acting.federation,
		cmd: o.cmd,
		action: o.action,
		says: o.says.trim(),
		why: why.length ? why : ['money'],
		...(o.subject ? { subject: o.subject } : {}),
		at: now.toISOString()
	};
	return { ...st, signatures: [{ by: 'first', did: toDid(holder.did), office: acting.office, acting, signature: await holder.signCanonical(st) }] };
}

/** A second holder, in role, signs the same words. */
export async function signSecond(c: Cosigned, holder: Signer, acting: Acting): Promise<Cosigned> {
	const first = c.signatures.find((s) => s.by === 'first');
	if (!first) throw new Error('There’s nothing asked to sign.');
	if (toDid(holder.did) === first.did) throw new Error('A second signature comes from someone else.');
	if (c.subject && toDid(holder.did) === c.subject) throw new Error('It touches your own account: another holder must sign.');
	if (acting.takenUp?.content?.declaration?.kind === 'interest') throw new Error('You declared an interest in this office: another holder must sign.');
	return { ...c, signatures: [first, { by: 'second', did: toDid(holder.did), office: acting.office, acting, signature: await holder.signCanonical(unsigned(c)) }] };
}

export const hashCosigned = async (c: Cosigned) => `cosigned:sha256:${await sha256(canonical(unsigned(c)))}`;

export type CosignCheck =
	| { ok: true; first: { did: string; office: string }; second: { did: string; office: string }; says: string }
	| { ok: false; waiting: boolean; says: string };

/** Does it hold: both signatures on the same words, each signer in role with a mandate covering the command, two different people, neither the subject nor (for the second) carrying an interest? */
export async function checkCosigned(x: unknown, o: { founder?: string; now?: Date; revoked?: Set<string> } = {}): Promise<CosignCheck> {
	const c = x as Cosigned;
	if (c?.schema !== COSIGN_SCHEMA || !Array.isArray(c.signatures)) return { ok: false, waiting: false, says: 'This isn’t something two holders sign.' };
	const st = unsigned(c);
	const first = c.signatures.find((s) => s.by === 'first');
	const second = c.signatures.find((s) => s.by === 'second');
	if (!first || !(await verify(first.did, st, first.signature))) return { ok: false, waiting: false, says: 'The first holder’s signature doesn’t hold.' };
	const cover = async (s: CosignSignature) => actingCovers(s.did, s.acting, { federation: c.federation, cmd: c.cmd, founder: o.founder, now: o.now, revoked: o.revoked });
	const f = await cover(first);
	if (!f.ok) return { ok: false, waiting: false, says: `The first holder: ${f.says}` };
	if (!second) return { ok: false, waiting: true, says: 'Waiting for a second office holder to sign.' };
	if (!(await verify(second.did, st, second.signature))) return { ok: false, waiting: false, says: 'The second signature isn’t on the same words.' };
	if (second.did === first.did) return { ok: false, waiting: false, says: 'Both signatures are the same person’s.' };
	if (c.subject && second.did === c.subject) return { ok: false, waiting: false, says: 'The second holder is the one it pays or touches.' };
	const s = await cover(second);
	if (!s.ok) return { ok: false, waiting: false, says: `The second holder: ${s.says}` };
	if (s.interest) return { ok: false, waiting: false, says: 'The second holder declared an interest, so can’t be the one who agrees.' };
	return { ok: true, first: { did: first.did, office: first.office }, second: { did: second.did, office: second.office }, says: `Signed by two office holders: ${first.office} and ${second.office}.` };
}

/** Facts for a rule that asks for two signatures (q-actions). */
export async function cosignFacts(x: unknown, o: { founder?: string; now?: Date; revoked?: Set<string> } = {}) {
	const c = await checkCosigned(x, o);
	return { twoHolders: c.ok, waitingForSecond: !c.ok && c.waiting };
}
