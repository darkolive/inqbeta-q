/*
 * How sure you have to be, declared by whoever is asking.
 *
 * Darren, 2026-09-20: "in all schema there should be a default signature
 * required field, maybe. If it needs it. And then that way it will collect
 * whatever information that comes with that."
 *
 * THE FIRST HALF IS RIGHT, and it is the pattern that has been working all
 * day. A question set is the right place to declare its own evidentiary bar:
 * a federation asking "do you confirm these accounts are accurate" needs a
 * different standard from Q asking what you call a folder. Declaring it IN THE
 * SET means the bar travels with the questions, so a federation raises it
 * without anybody writing code.
 *
 * And because a set is named by its own hash, the bar is part of the address.
 * An answering always cites the exact standard it was held to, and nobody can
 * later claim old answers met a bar that was added afterwards. That is free,
 * and it is the reason this belongs in the set rather than in a setting.
 *
 * THE SECOND HALF IS A TRAP, and it is today's rule for the fifth time. A
 * passkey assertion does come with extra material, and it is tempting to keep
 * all of it in case it is useful. What comes with it includes:
 *
 *   AAGUID           the make and model of the authenticator. A hardware
 *                    fingerprint, in the receipt, for ever.
 *   signature count  a monotonic counter that correlates uses of one key.
 *   client data      the origin, the challenge, the type.
 *
 * A receipt TRAVELS. "Collect whatever comes with it" means handing a hardware
 * fingerprint to everyone who ever sees that receipt — including relays,
 * federations and whoever they pass it to. So:
 *
 *   A SET DECLARES WHAT MUST BE TRUE, NOT WHAT TO COLLECT.
 *
 * What is kept is the CLAIM and what is needed to check it. Nothing else rides
 * along, and `checkAttested` refuses the rest by name so a future convenience
 * has to come and argue for itself.
 *
 * NO SILENT DOWNGRADE. If a set needs a fingerprint and the authenticator
 * cannot do one, the honest outcome is that this cannot be answered here — not
 * an answer quietly recorded at a lower bar. A ladder that bends under load is
 * decoration.
 *
 * Pure. No WebAuthn, no signing. This says what is required and what may be
 * kept.
 */

export type Assurance =
	/** Nothing. A note to yourself; true because you wrote it. */
	| 'none'
	/** The key signed it. Anyone can check it came from that DID. */
	| 'signed'
	/** Somebody touched the key at the time. User presence. */
	| 'present'
	/** A fingerprint, a face or a PIN. The person, not only the key. */
	| 'verified'
	/** Somebody else counter-signed it, so the time and the fact are not your word alone. */
	| 'witnessed';

/** Weakest first. The order is the whole meaning. */
export const ASSURANCE: Assurance[] = ['none', 'signed', 'present', 'verified', 'witnessed'];

export const ASSURANCE_MEANS: Record<Assurance, string> = {
	none: 'Written down. Nothing checks it.',
	signed: 'Signed by your key, so anyone can see it came from you.',
	present: 'You touched your key when you answered.',
	verified: 'Your fingerprint, face or PIN, so it was you and not only your device.',
	witnessed: 'Counter-signed by someone else, so the time is not your word alone.'
};

export function rung(a: Assurance): number {
	return ASSURANCE.indexOf(a);
}

/** Does what was achieved meet what was asked for? */
export function meets(held: Assurance, needed: Assurance): boolean {
	return rung(held) >= rung(needed);
}

/**
 * The bar for one question: the set's default, raised by the question's own.
 *
 * Raised only. A question that tried to ask for LESS than its set would be a
 * quiet hole in a standard somebody declared, and the set is the thing whose
 * address is cited.
 */
export function needsFor(setNeeds: Assurance | undefined, questionNeeds: Assurance | undefined): Assurance {
	const a = setNeeds ?? 'signed';
	const b = questionNeeds ?? 'none';
	return rung(b) > rung(a) ? b : a;
}

export interface Shortfall {
	ok: boolean;
	says: string;
	fix: string;
}

/**
 * Whether this can be answered here, said before anything is written.
 *
 * Named rather than returned as a boolean because what a person needs at this
 * moment is not "no" but "not on this device, and here is what would".
 */
export function canAnswer(held: Assurance, needed: Assurance): Shortfall {
	if (meets(held, needed)) return { ok: true, says: ASSURANCE_MEANS[needed], fix: '' };
	switch (needed) {
		case 'verified':
			return {
				ok: false,
				says: 'These questions need your fingerprint, face or PIN, and this device did not ask for one.',
				fix: 'Answer them on a device that can, or set one up here.'
			};
		case 'witnessed':
			return {
				ok: false,
				says: 'These questions need somebody else to counter-sign, and nobody has.',
				fix: 'Send it to whoever has to witness it.'
			};
		case 'present':
			return {
				ok: false,
				says: 'These questions need you to touch your key as you answer.',
				fix: 'Try again and touch it when asked.'
			};
		default:
			return {
				ok: false,
				says: 'These questions need to be signed, and there is no key to sign them with.',
				fix: 'Sign in with your passkey first.'
			};
	}
}

/**
 * What a signing may leave behind in a receipt.
 *
 * The whole of it. `held` is the claim; `sig` is what checks it; `witness` is
 * whoever counter-signed. A verifier needs these and nothing else.
 */
export interface Attested {
	held: Assurance;
	/** The signature over the canonical answering. */
	sig?: string;
	/** A counter-signer's DID, when `held` is 'witnessed'. */
	witness?: string;
}

/**
 * Everything a WebAuthn assertion offers that must not travel.
 *
 * Listed by name and tested one by one, because each of them will look useful
 * to somebody one day and the argument has to happen here rather than in a
 * pull request at half past five.
 */
const NOT_KEPT = [
	'aaguid',
	'authenticatordata',
	'authenticator',
	'signcount',
	'counter',
	'clientdata',
	'clientdatajson',
	'origin',
	'challenge',
	'transports',
	'attestationobject',
	'credentialid',
	'devicename',
	'useragent'
];

export interface AttestCheck {
	ok: boolean;
	says: string;
	refused: string[];
}

export function checkAttested(a: Record<string, unknown>): AttestCheck {
	const refused = Object.keys(a).filter((k) => NOT_KEPT.includes(k.toLowerCase()));
	if (refused.length) {
		return {
			ok: false,
			says: 'A receipt travels. What make of key you used, and how many times you have used it, is not part of what you said.',
			refused
		};
	}
	if (typeof a.held !== 'string' || !(ASSURANCE as string[]).includes(a.held)) {
		return { ok: false, says: 'An answering has to say how sure it is.', refused: [] };
	}
	if (a.held !== 'none' && typeof a.sig !== 'string') {
		return { ok: false, says: 'Anything above a note has to carry the signature that checks it.', refused: [] };
	}
	if (a.held === 'witnessed' && typeof a.witness !== 'string') {
		return { ok: false, says: 'Witnessed by whom?', refused: [] };
	}
	return { ok: true, says: 'This can be handed to anyone.', refused: [] };
}
