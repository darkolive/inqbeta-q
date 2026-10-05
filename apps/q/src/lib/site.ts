/*
 * Which site this copy is (ADR-Q-034 §5): inqbeta.com, or the development
 * site, inqbeta.dev, which is its own host with its own host files.
 *
 *   inqbeta.com           static/incubator.json, static/host/…
 *   development site      static/dev/incubator.json, static/dev/host/…
 *
 * Known from the address (inqbeta.dev), or PUBLIC_Q_SITE=development: set it
 * for the development copy on localhost (`pnpm dev --mode devsite`, which
 * reads .env.devsite.local) and on the development site's Vercel project.
 * Until the development host is founded, its site falls back to the shared
 * files, as before.
 */
import { env } from '$env/dynamic/public';

export function isDevelopmentHostname(h: string): boolean {
	return h === 'inqbeta.dev' || h.endsWith('.inqbeta.dev');
}

/** True on the development site, or a copy set up as it. */
export function onDevelopmentSite(hostname?: string): boolean {
	if (env.PUBLIC_Q_SITE?.trim() === 'development') return true;
	const h = hostname ?? (typeof location !== 'undefined' ? location.hostname : '');
	return isDevelopmentHostname(h);
}

/** Where a host file lives for this site: '/incubator.json' → '/dev/incubator.json' on the development site. */
export function hostFilePath(p: string, development: boolean): string {
	return development ? `/dev${p}` : p;
}
