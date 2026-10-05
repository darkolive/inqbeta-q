/*
 * Which site a request came in on (ADR-Q-034 §5). inqbeta.dev is the
 * development site: everything works, for testing only, and no real money
 * ever moves there. Known from the address the request came in on (our own
 * server's), or PUBLIC_Q_SITE=development (lib/site.ts), or the older
 * Q_DEVELOPMENT_SITE=1.
 */
import { env } from '$env/dynamic/private';
import { onDevelopmentSite } from '$lib/site';

export function isDevelopmentSite(origin: string): boolean {
	if (env.Q_DEVELOPMENT_SITE?.trim() === '1') return true;
	try {
		return onDevelopmentSite(new URL(origin).hostname);
	} catch {
		return onDevelopmentSite('');
	}
}
