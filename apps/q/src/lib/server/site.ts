/*
 * Which site this is (ADR-Q-034 §5). inqbeta.dev is the development site:
 * everything works, for testing only, and no real money ever moves there.
 * Known from the address the request came in on (our own server's), or
 * Q_DEVELOPMENT_SITE=1 for another copy run the same way.
 */
import { env } from '$env/dynamic/private';

export function isDevelopmentSite(origin: string): boolean {
	if (env.Q_DEVELOPMENT_SITE?.trim() === '1') return true;
	try {
		const h = new URL(origin).hostname;
		return h === 'inqbeta.dev' || h.endsWith('.inqbeta.dev');
	} catch {
		return false;
	}
}
