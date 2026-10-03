/*
 * The sign-in set's one rule (ADR-Q-029): signing in leaves you where you
 * are. A link someone sent you (a shop, an offer, a card, a receipt) is still
 * there afterwards — before, signing in on one of those pages went to the
 * home page and the link was lost (3 October 2026). Only signing in from the
 * Keys page, which is itself only a sign-in when signed out, goes home.
 */
export function afterSignIn(path: string, stay: boolean): string | null {
	if (stay) return null;
	return path === '/keys' ? '/' : null;
}
