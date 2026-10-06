/*
 * Acting in role (ADR-Q-038): which hat you're wearing, held once so the
 * switch on a federation's page and the band across every page are always
 * the same switch.
 *
 * Power to change things for a federation comes from an office you hold and
 * have chosen to take up right now, never from being you. One role at a
 * time; out of role, a page offers you only what anyone may read.
 *
 * Step 1 built the switch with the caretaker; step 5 (6 October) the other
 * offices, given by appointment (q-core offices.ts); step 2 (6 October) makes
 * taking up and setting down receipts you sign, quietly, kept in your vault
 * (q-core inrole.ts). What you ask a server to do in role carries `acting`:
 * the office, its mandates and the take-up, which the server checks.
 *
 * Kept on this device too (q:acting) so the band survives a reload. Signing
 * out sets it down.
 */
import { officeKind } from '@inqbeta/q-core/offices';
import { takeUp as takeUpReceipt, setDown as setDownReceipt, type Acting as ActingProof, type Declaration, type InRoleReceipt, isInRole } from '@inqbeta/q-core/inrole';
import { watch, type Identity } from '@inqbeta/q-core/passkey';
import { saveLocked } from '@inqbeta/q-core/folder';

export interface Acting {
	/** The federation's DID. */
	federation: string;
	/** Its name, for the band. */
	name: string;
	/** The office, by id. */
	office: string;
	/** When it was taken up. */
	at: string;
	/** The office's mandates, as the page found them (UCAN bytes, base64url). */
	mandates: string[];
	/** The signed take-up, when there was an identity to sign it. */
	takenUp?: InRoleReceipt;
	/** The interest declared on taking it up, if any. */
	interest?: string;
}

/* The offices and their names come from q-core (ADR-Q-007 §5): caretaker, treasurer, secretary, chair, safeguarding lead, steward. */
export const officeName = (office: string) => officeKind(office)?.called ?? office.replace(/^./, (c) => c.toUpperCase());

function load(): Acting | null {
	try {
		const raw = localStorage.getItem('q:acting');
		const a = raw ? (JSON.parse(raw) as Acting) : null;
		return a && typeof a.federation === 'string' && typeof a.office === 'string' ? { ...a, mandates: Array.isArray(a.mandates) ? a.mandates : [] } : null;
	} catch {
		return null;
	}
}
function remember(a: Acting | null) {
	try {
		if (a) localStorage.setItem('q:acting', JSON.stringify(a));
		else localStorage.removeItem('q:acting');
	} catch {
		/* still acting for this visit */
	}
}
/* Each take-up and set-down kept in your vault: when you acted for the federation, and when you didn't. */
async function keep(r: { contentHash: string; content: { event: string; at: string } }) {
	const stamp = r.content.at.slice(0, 19).replace(/[:T]/g, '-');
	await saveLocked('roles', `${stamp}-${r.content.event}-${r.contentHash.slice(0, 8)}.json`, JSON.stringify(r, null, 2), 'application/json').catch(() => {
		/* the receipt still travels with what you ask in role */
	});
}

let acting = $state<Acting | null>(null);
let started = false;
let identity: Identity | null = null;
function start() {
	if (started || typeof window === 'undefined') return;
	started = true;
	acting = load();
	watch((id) => {
		if (identity && !id && acting) void role.setDown();
		identity = id;
		/* A role taken up by someone else on this device isn't yours. */
		if (id && acting?.takenUp && acting.takenUp.did !== id.did) {
			acting = null;
			remember(null);
		}
	});
}

export const role = {
	/** The role taken up, if any. */
	get acting(): Acting | null {
		start();
		return acting;
	},
	/** Acting as `office` (any office, when left out) for this federation, right now? */
	isActing(federation: string | null | undefined, office?: string): boolean {
		const a = this.acting;
		return !!a && !!federation && a.federation === federation && (!office || a.office === office);
	},
	/** Take up an office with your declaration, signing both. One at a time: any other is set down first. */
	async takeUp(federation: string, name: string, office: string, mandates: string[], declaration: Declaration) {
		start();
		if (!identity) throw new Error('Sign in first.');
		const takenUp = (await takeUpReceipt(identity, { federation, name, office, declaration })) as InRoleReceipt;
		if (acting) await this.setDown();
		acting = { federation, name, office, at: takenUp.content.at, mandates, takenUp, ...(declaration.kind === 'interest' ? { interest: declaration.says.trim() } : {}) };
		remember(acting);
		void keep(takenUp);
	},
	/** Set it down, signing that too: back to being you. */
	async setDown() {
		start();
		const was = acting;
		acting = null;
		remember(null);
		if (was?.takenUp && identity && isInRole(was.takenUp)) void keep((await setDownReceipt(identity, was.takenUp)) as InRoleReceipt);
	},
	/** What an ask made in role carries, for the server to check; null when not in role for this federation. */
	proof(federation: string): ActingProof | null {
		const a = this.acting;
		if (!a || a.federation !== federation || !a.takenUp) return null;
		return { federation: a.federation, office: a.office, mandates: a.mandates, takenUp: a.takenUp };
	}
};
