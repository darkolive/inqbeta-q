/*
 * Acting in role (ADR-Q-038, step 1): which hat you're wearing, held once so
 * the switch on a federation's page and the band across every page are always
 * the same switch.
 *
 * Power to change things for a federation comes from an office you hold and
 * have chosen to take up right now, never from being you. One role at a
 * time; out of role, a page offers you only what anyone may read.
 *
 * Step 1: the only office is caretaker (the founder, ADR-Q-007). It's kept on
 * this device so it survives a reload; signing taking it up and setting it
 * down as receipts is step 2.
 */

export interface Acting {
	/** The federation's DID. */
	federation: string;
	/** Its name, for the band. */
	name: string;
	/** The office, by id. */
	office: string;
	/** When it was taken up. */
	at: string;
}

export const OFFICE_NAMES: Record<string, string> = { caretaker: 'Caretaker', treasurer: 'Treasurer', secretary: 'Secretary', chair: 'Chair' };
export const officeName = (office: string) => OFFICE_NAMES[office] ?? office.replace(/^./, (c) => c.toUpperCase());


function load(): Acting | null {
	try {
		const raw = localStorage.getItem('q:acting');
		const a = raw ? (JSON.parse(raw) as Acting) : null;
		return a && typeof a.federation === 'string' && typeof a.office === 'string' ? a : null;
	} catch {
		return null;
	}
}

let acting = $state<Acting | null>(null);
let started = false;

export const role = {
	/** The role taken up, if any. */
	get acting(): Acting | null {
		if (!started && typeof window !== 'undefined') {
			started = true;
			acting = load();
		}
		return acting;
	},
	/** Acting as `office` (any office, when left out) for this federation, right now? */
	isActing(federation: string | null | undefined, office?: string): boolean {
		const a = this.acting;
		return !!a && !!federation && a.federation === federation && (!office || a.office === office);
	},
	/** Take up an office. One at a time: any other is set down first. */
	takeUp(federation: string, name: string, office: string) {
		acting = { federation, name, office, at: new Date().toISOString() };
		try {
			localStorage.setItem('q:acting', JSON.stringify(acting));
		} catch {
			/* still acting for this visit */
		}
	},
	/** Set it down: back to being you. */
	setDown() {
		acting = null;
		try {
			localStorage.removeItem('q:acting');
		} catch {
			/* nothing kept */
		}
	}
};
