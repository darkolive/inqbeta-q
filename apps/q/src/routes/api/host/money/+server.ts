/*
 * Publishing money (ADR-Q-027 §7). Development only, like the rest of
 * /api/host: the founder does it on their own computer.
 *
 *   GET   the mint, its currency, whether the payout account is set (its last
 *         four only), and test or live
 *   POST  { publication } — signed by this host's founder in the last five
 *         minutes, naming this host, this mint, its currency, this account's last
 *         four, and the responsibility accepted. Kept once, in the host's
 *         public record; a second is refused. Then send that record to the
 *         live site with the rest (it's in static/host/services.json).
 *
 * Never on the development site (ADR-Q-034 §5): no real money moves there, so
 * its host can't be published. GET says so; POST refuses.
 */
import { error, json, type RequestHandler } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { checkReceipt } from '@inqbeta/q-core/seal';
import { MONEY_PUBLISHED_SCHEMA, problemsWithPublication, type MoneyPublicationReceipt } from '@inqbeta/q-core/money';
import { readEnvFile } from '$lib/server/env-file';
import { keepMoneyPublication, readMark } from '$lib/server/host';
import { isDevelopmentSite } from '$lib/server/site';
import { coinContactOf, coinDesignOf, coinNameOf, hostOf, mintIdentity, moneyOf, currencyOf, MintRefused } from '$lib/server/mint';

export const prerender = false;
const FRESH_MS = 5 * 60 * 1000;

function door(request: Request, url: URL) {
	if (!dev) error(404, 'Not found');
	const origin = request.headers.get('origin');
	if (origin && origin !== url.origin) error(403, 'Only Q itself may do this.');
}

const lastFour = () => (readEnvFile().Q_PAYOUT_ACCOUNT ?? '').replace(/\D/g, '').slice(-4);

export const GET: RequestHandler = async ({ request, url }) => {
	door(request, url);
	const host = await hostOf(url.origin);
	let mint: string | null = null;
	let says: string | undefined;
	try {
		mint = (await mintIdentity()).did;
	} catch (e) {
		says = e instanceof Error ? e.message : String(e);
	}
	const state = host ? await moneyOf(url.origin, host) : { mode: 'test' as const };
	const ends = lastFour();
	return json({ host: host?.federation ?? null, mint, says, currency: currencyOf(state), coinName: coinNameOf(), coinDesign: coinDesignOf(), coinContact: coinContactOf(), bank: { set: ends.length === 4, ends }, state, development: isDevelopmentSite(url.origin) });
};

export const POST: RequestHandler = async ({ request, url }) => {
	door(request, url);
	if (isDevelopmentSite(url.origin)) return json({ ok: false, says: 'This is the development site. No real money moves here, so it can’t be published.' }, { status: 403 });
	const mark = readMark();
	if (!mark) return json({ ok: false, says: 'This computer hasn’t set up a host.' }, { status: 409 });
	const { publication } = (await request.json().catch(() => ({}))) as { publication?: MoneyPublicationReceipt };
	if (!publication || !(await checkReceipt(publication)).ok || publication.content?.schema !== MONEY_PUBLISHED_SCHEMA) return json({ ok: false, says: 'The publication isn’t signed.' }, { status: 400 });
	const c = publication.content;
	const problems: string[] = [];
	if (publication.did !== mark.founder) problems.push('Only the host’s founder can publish.');
	if (c.host !== mark.federation) problems.push('It names a different host.');
	if (Math.abs(Date.now() - Date.parse(c.at)) > FRESH_MS) problems.push('It’s too old: sign it again.');
	try {
		if (c.mint !== (await mintIdentity()).did) problems.push('It names a different mint from this host’s.');
	} catch (e) {
		problems.push(e instanceof MintRefused ? e.message : 'The mint isn’t ready: restart Q after making its key.');
	}
	if (c.currency !== currencyOf()) problems.push('The currency isn’t the one set in Money (Q_CURRENCY).');
	if ((c.coinContact ?? 'treasurer') !== coinContactOf()) problems.push('The coin’s contact office isn’t the one set in Money (Q_COIN_CONTACT).');
	if ((c.coinName ?? '') !== coinNameOf()) problems.push('The coin’s name isn’t the one set in Money (Q_COIN_NAME).');
	if (c.coinDesign && JSON.stringify(c.coinDesign) !== JSON.stringify(coinDesignOf())) problems.push('The coin’s design isn’t the one set in Money (Q_COIN_DESIGN).');
	if (c.bank?.ends !== lastFour()) problems.push('The payout account isn’t the one set on this computer.');
	problems.push(...problemsWithPublication(c));
	if (problems.length) return json({ ok: false, says: problems.join(' ') }, { status: 409 });
	if (!keepMoneyPublication(mark.federation, publication)) return json({ ok: false, says: 'This host is already published. That can’t be changed.' }, { status: 409 });
	return json({ ok: true, publishedId: publication.contentHash });
};
