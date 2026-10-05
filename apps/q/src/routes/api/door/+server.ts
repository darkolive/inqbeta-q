/*
 * May this person act here yet? (ADR-Q-034 step 5.) The page asks after
 * sign-in, so someone not let in sees "Opening soon" rather than a dashboard
 * whose every button would be refused. A courtesy only: the real lock is on
 * the servers (the gate and the mint ask the door themselves).
 *
 *   GET ?did=<did>   → { in: true } or { in: false, says }
 */
import { json, type RequestHandler } from '@sveltejs/kit';
import { hostOf, moneyOf } from '$lib/server/mint';
import { doorSays } from '$lib/server/door';
import { isDevelopmentSite } from '$lib/server/site';

export const prerender = false;

export const GET: RequestHandler = async ({ url }) => {
	const did = url.searchParams.get('did') ?? '';
	/* The development site has no door: everyone may try everything there. */
	if (isDevelopmentSite(url.origin)) return json({ in: true, site: 'development' });
	const host = await hostOf(url.origin).catch(() => null);
	if (!host) return json({ in: true });
	const mode = (await moneyOf(url.origin, host).catch(() => null))?.mode ?? 'test';
	const says = await doorSays(did, host, mode).catch(() => null);
	return json(says ? { in: false, says } : { in: true }, { headers: { 'cache-control': 'no-store' } });
};
