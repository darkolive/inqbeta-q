/*
 * Acting in role, as receipts the servers check (ADR-Q-038 step 2; job C2),
 * 6 October 2026.
 *
 * Darren (5 October): create, update and delete power comes only from a role
 * you have declared you're acting in. Toggled off, you're back to being just
 * you.
 *
 *   role.taken-up / role.set-down   signed by the person, quietly (no passkey
 *                                   touch), kept in their vault: the record of
 *                                   when they acted for the federation.
 *   acting                          what an ask made in role carries: the
 *                                   office, its mandates (offices.ts), and the
 *                                   take-up receipt. A server checks it before
 *                                   doing anything for the federation.
 *
 * The check (`actingCovers`): the take-up is the asker's own, for this
 * federation and office, made before the ask; a mandate from the federation's
 * key to the asker covers the command and is still running. The caretaker may
 * also be proved by the federation's signed founding (the host file), for a
 * founder whose vault isn't on this device.
 *
 * THE DECLARATION (Darren, 6 October 2026): "if you flip that toggle to say
 * you are now looking at this page as an officer, that is a point where you
 * make your declaration: I am acting with no conflict of interest, or I may
 * have a conflict and declare it, then you sign it … a nice, clean, receipted
 * attestation each time, which enables the separation of the person from the
 * role." Every take-up carries one, under the seven principles of public life
 * (the Nolan principles, 1995). A take-up without one doesn't count. A
 * declared interest doesn't stop you; it travels with what you do in role.
 *
 * Not yet: a recalled office still passes until its term ends, unless the
 * server is told of the recall (`revoked`). Publishing endings to the host is
 * the next step.
 */
import { checkReceipt, sealWith, type SealedReceipt } from './seal';
import type { Identity } from './passkey';
import { readDelegation } from './ucan/token';
import { unb64url } from './canonical';
import { covers, officeKind } from './offices';

export const IN_ROLE_SCHEMA = 'inqbeta.in-role/1';
export const IN_ROLE_SOURCE = 'inqbeta:q/role';

/** The seven principles of public life (Committee on Standards in Public Life, 1995): what an office holder signs up to. */
export const NOLAN_PRINCIPLES = [
	{ id: 'selflessness', called: 'Selflessness', says: 'Act only in the interest of the people you serve.' },
	{ id: 'integrity', called: 'Integrity', says: 'Owe nothing to anyone that could sway you; declare any interest.' },
	{ id: 'objectivity', called: 'Objectivity', says: 'Decide fairly, on merit and evidence, without bias.' },
	{ id: 'accountability', called: 'Accountability', says: 'Answer for what you decide, and open it to scrutiny.' },
	{ id: 'openness', called: 'Openness', says: 'Act openly; keep back only what there’s a clear reason to.' },
	{ id: 'honesty', called: 'Honesty', says: 'Be truthful.' },
	{ id: 'leadership', called: 'Leadership', says: 'Show these in what you do, and challenge poor behaviour.' }
] as const;

/** What you say each time you take up an office. */
export type Declaration = { kind: 'none' } | { kind: 'interest'; says: string };
/** The words signed with it, so the receipt says what was declared, not just a flag. */
export const DECLARATION_WORDS = {
	none: 'I am acting for the federation, not for myself, under the seven principles of public life. I have no conflict of interest in what I do in this role.',
	interest: 'I am acting for the federation, not for myself, under the seven principles of public life. I may have a conflict of interest, and I declare it:'
} as const;
const declarationOk = (d: unknown): d is Declaration =>
	!!d && typeof d === 'object' && ((d as Declaration).kind === 'none' || ((d as Declaration).kind === 'interest' && !!(d as { says?: string }).says?.trim()));

export interface InRole {
	schema: typeof IN_ROLE_SCHEMA;
	source: typeof IN_ROLE_SOURCE;
	event: 'role.taken-up' | 'role.set-down';
	/** The federation's DID. */
	federation: string;
	/** Its name, for reading. */
	name: string;
	office: string;
	/** The take-up this sets down, by content hash (set-down only). */
	takenUp?: string;
	/** Take-up only: the declaration, and the words it was made in. */
	declaration?: Declaration;
	words?: string;
	at: string;
}
export type InRoleReceipt = SealedReceipt & { content: InRole };

export function isInRole(x: unknown): x is InRoleReceipt {
	const c = (x as InRoleReceipt | null)?.content;
	return c?.schema === IN_ROLE_SCHEMA && (c.event === 'role.taken-up' || c.event === 'role.set-down') && typeof c.federation === 'string' && typeof c.office === 'string';
}

type Signing = Pick<Identity, 'did' | 'publicKey' | 'signing'>;

/** Take up an office: "I'm here as the treasurer, for the federation, not for myself", with the declaration, signed. */
export async function takeUp(identity: Signing, o: { federation: string; name: string; office: string; declaration: Declaration }, now = new Date()): Promise<SealedReceipt> {
	if (!declarationOk(o.declaration)) throw new Error('Declare first: no conflict of interest, or the interest you may have.');
	const declaration: Declaration = o.declaration.kind === 'none' ? { kind: 'none' } : { kind: 'interest', says: o.declaration.says.trim() };
	const words = declaration.kind === 'none' ? DECLARATION_WORDS.none : `${DECLARATION_WORDS.interest} ${declaration.says}`;
	return sealWith(identity, { schema: IN_ROLE_SCHEMA, source: IN_ROLE_SOURCE, event: 'role.taken-up', federation: o.federation, name: o.name, office: o.office, declaration, words, at: now.toISOString() } satisfies InRole);
}

/** Set it down: back to being you. */
export function setDown(identity: Signing, taken: InRoleReceipt, now = new Date()): Promise<SealedReceipt> {
	const c = taken.content;
	return sealWith(identity, { schema: IN_ROLE_SCHEMA, source: IN_ROLE_SOURCE, event: 'role.set-down', federation: c.federation, name: c.name, office: c.office, takenUp: taken.contentHash, at: now.toISOString() } satisfies InRole);
}

/** What an ask made in role carries, inside its signed content. */
export interface Acting {
	federation: string;
	office: string;
	/** The office's mandates, UCAN bytes base64url (the caretaker's founding grant, or an appointment's tokens). May be empty for the caretaker proved by the founding. */
	mandates: string[];
	/** The signed take-up. */
	takenUp: InRoleReceipt;
}

export type ActingCheck = { ok: true; office: string; by: 'mandate' | 'founding'; interest: string | null } | { ok: false; says: string };

/**
 * May `asker`, acting as this, do `cmd` for `federation` at `now`? `founder`
 * is the federation's founder by its signed founding, where the server knows
 * it; `revoked` holds mandate CIDs the server has been told have ended.
 */
export async function actingCovers(
	asker: string,
	acting: unknown,
	o: { federation: string; cmd: string; founder?: string; now?: Date; revoked?: Set<string> }
): Promise<ActingCheck> {
	const now = o.now ?? new Date();
	const a = acting as Acting | null | undefined;
	const kind = officeKind(a?.office ?? '');
	const name = (cmd: string) => cmd.replace(/^\/fed\/?/, '').split('/')[0] || 'this';
	if (!a || !kind) return { ok: false, says: 'Take up your office first: this is done for the federation, not for yourself.' };
	if (a.federation !== o.federation) return { ok: false, says: 'That office is in a different federation.' };
	if (!kind.scope.some((g) => covers(g, o.cmd))) return { ok: false, says: `A ${kind.called.toLowerCase()} can’t do ${name(o.cmd)} work. Ask the office that can.` };

	/* The declaration: taken up by the asker, for this office, before now. */
	const t = a.takenUp;
	if (!isInRole(t) || t.content.event !== 'role.taken-up' || t.did !== asker || t.content.federation !== o.federation || t.content.office !== a.office)
		return { ok: false, says: 'There’s no signed record of you taking up this office.' };
	if (!(await checkReceipt(t)).ok) return { ok: false, says: 'The record of taking up the office isn’t signed.' };
	if (Date.parse(t.content.at) > now.getTime() + 60_000) return { ok: false, says: 'The office was taken up after the ask.' };
	if (!declarationOk(t.content.declaration)) return { ok: false, says: 'Taking up the office needs a declaration: no conflict of interest, or the one you may have.' };
	const interest = t.content.declaration.kind === 'interest' ? t.content.declaration.says : null;

	/* The power: a running mandate from the federation's key, to the asker, covering the command. */
	let ended = false;
	let missedStanding = '';
	for (const m of a.mandates ?? []) {
		try {
			const d = await readDelegation(unb64url(m));
			const p = d.payload;
			const s = now.getTime() / 1000;
			const office = p.meta?.['inqbeta/office'];
			if (p.iss !== o.federation || p.sub !== o.federation || p.aud !== asker) continue;
			if (office !== undefined && office !== a.office) continue;
			if (!covers(p.cmd, o.cmd) || (p.exp !== null && p.exp <= s) || (p.nbf !== undefined && p.nbf > s)) continue;
			/* A standing interest in the mandate must be in the declaration, every time. */
			const standing = p.meta?.['inqbeta/interest'];
			if (typeof standing === 'string' && standing && !(t.content.declaration?.kind === 'interest' && t.content.declaration.says.includes(standing))) {
				missedStanding = standing;
				continue;
			}
			if (o.revoked?.has(d.cid.toString())) {
				ended = true;
				continue;
			}
			return { ok: true, office: a.office, by: 'mandate', interest };
		} catch {
			/* not a mandate */
		}
	}
	if (missedStanding) return { ok: false, says: `This office comes with an interest you must declare each time you take it up: “${missedStanding}”.` };
	if (ended) return { ok: false, says: `Your office as ${kind.called.toLowerCase()} has been ended early: recalled, or stood down from.` };
	if (a.office === 'caretaker' && o.founder && asker === o.founder) return { ok: true, office: 'caretaker', by: 'founding', interest };
	return { ok: false, says: `Your mandate as ${kind.called.toLowerCase()} doesn’t cover this, or it has run out.` };
}
