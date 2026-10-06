/*
 * Where a person should be, given what is held.
 *
 * A pure function because this has now gone wrong twice, and both times it was
 * invisible until somebody walked into it:
 *
 *   - the signed-out guard allowed `/files`, which is not a route (the files
 *     page is `/data`), so anyone reaching it was thrown to sign in;
 *   - a second guard pushed a signed-in person off `/keys` on the grounds that
 *     it is "just the sign-in page". It is where your keys are — and since the
 *     only sign-out button lived there, it left no way out of the app at all.
 *
 * Neither could be tested while it was an effect inside a layout. Here it is a
 * function with no browser in it, and `test/guard.test.ts` walks every route.
 *
 * The rules, in order:
 *   1. Before the passkey module has answered, do nothing. Never act on a guess.
 *   2. Keys in this tab: stay.
 *   3. A remembered DID: stay, and the header offers the touch. A remembered
 *      identity is not signed out, it is one press away.
 *   4. An open path: stay. These are the pages a stranger may legitimately see.
 *   5. Anything else: the home page, which is the sign-in. `/keys` included:
 *      signed out it only showed an older sign-in, and there should be one
 *      front door, not two (decided 29 September).
 */

/** Pages a person may be on with no keys held and nothing remembered. */
export const OPEN_PATHS = ['/', '/data', '/user', '/contact', '/legal', '/docs', '/link', '/setup'];

/** Pages anyone may read, shown with a plain header and the footer rather than the dashboard. */
/**
 * A receipt page (5 October 2026): a coin's check (/verify/) or a sealed
 * receipt's location (/c/). Shown on its own — no header, no search, no
 * footer — whoever opens it and whatever host it's on.
 */
export function isReceiptPage(path: string): boolean {
	return path.startsWith('/verify/') || path.startsWith('/c/');
}

export function isPublicPage(path: string): boolean {
	return path === '/setup' || path === '/contact' || path === '/docs' || path === '/legal' || path.startsWith('/legal/') || path === '/link' || path.startsWith('/card/') || path.startsWith('/verify/');
}

/**
 * A receipt location is sealed to one passkey and says so itself. It must be
 * reachable by someone who has not signed in — otherwise the link in an email
 * leads to a redirect instead of the receipt.
 */
export const OPEN_PREFIXES = ['/c/', '/card/', '/verify/', '/channels/', '/federations/join', '/attest', '/legal/', '/shop/', '/offer/', '/stories'];

/*
 * '/attest' — an evidence report or its verification (ADR-Q-038). Like a
 * federation link, its packet is in the #fragment; a verifier opening it
 * signed out would lose it on a redirect. The page asks for the passkey itself.
 */

/*
 * '/verify/' — where a coin's QR code leads (ADR-Q-035): anyone who scans a
 * coin, signed in or not, can check it was minted here and how the house stands.
 */

/*
 * '/stories' — the picture stories as short adverts (4 October 2026), shared
 * on social media to people who've never signed in.
 *
 * '/shop/' and '/offer/' — a shop or an offer someone sent (ADR-Q-026). Like a
 * card: the person opening it is often signed out, and sending them home
 * threw the link away. The page asks for the passkey itself, and stays.
 */

/*
 * '/link' and '/card/' — a card someone shared (ADR-Q-015). The person opening
 * it is often new and not signed in; sending them home threw the card away.
 * The page shows the card and asks for the passkey itself (2 October 2026).
 */

/*
 * '/federations/join' — an invitation link (ADR-Q-007 §4). Its packet is in the
 * #fragment; sending a newcomer to /keys would drop it, and the invitation
 * with it. The page reads the invitation first and asks for the passkey itself.
 */

/*
 * '/channels/' — coming back from a storage provider's sign-in (Google Drive).
 * The redirect reloads the page, so the keys are gone from the tab, and after
 * a sign-out nothing is remembered either. Sending that to /keys threw away
 * the one-time code Google had just handed back, and the page showed nothing.
 * The page exchanges the code first and asks for the passkey itself
 * (routes/channels/google). Found 25 September.
 */

/*
 * '/setup' — setting up a fresh copy's host (ADR-Q-018). Its first card makes
 * the passkey, so it has to be reachable before there is one. Only a
 * development copy does anything there.
 */

export function isOpenPath(path: string): boolean {
	return OPEN_PATHS.includes(path) || OPEN_PREFIXES.some((p) => path.startsWith(p));
}

export interface GuardState {
	/** The passkey module has said something. Until then, nothing is known. */
	answered: boolean;
	/** Keys held in this tab. */
	signedIn: boolean;
	/** A DID remembered from before — one touch away, not signed out. */
	remembered: boolean;
}

/** Where to send them, or null to leave them where they are. */
export function whereTo(path: string, state: GuardState): string | null {
	if (!state.answered) return null;
	if (state.signedIn) return null;
	if (state.remembered) return null;
	if (isOpenPath(path)) return null;
	return '/';
}
