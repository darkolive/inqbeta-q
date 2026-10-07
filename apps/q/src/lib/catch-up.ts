/*
 * Catching up from the bank's ledger (7 October 2026).
 *
 * Darren tested a voucher sale between two people: the shop owner confirmed
 * the settlement and had the credits, but the buyer's wallet still showed
 * them as committed. The confirmation is sent to the buyer's inbox; if it
 * hasn't arrived (their card had no inbox yet, or it's still waiting), their
 * vault never hears the agreement was settled.
 *
 * But every step of an agreement in a bank's credits is also filed in that
 * bank's ledger (ADR-Q-027), which anyone can read. So: read it, and keep any
 * step of YOUR agreements that your vault hasn't got, signed by the other
 * side and checked here. Nothing is trusted that isn't signed.
 */
import { checkReceipt } from '@inqbeta/q-core/seal';
import { isAgreementStep, type AgreementReceipt } from '@inqbeta/q-core/agreements';
import { current } from '@inqbeta/q-core/passkey';
import { readHome } from '$lib/home';
import { agreementsFrom } from '$lib/agreements';
import { keepStep } from '$lib/messages';
import { readMint } from '$lib/money';
import { refreshLedger, type Ledger } from '$lib/ledger';

let running: Promise<number> | null = null;
let lastAt = 0;
const EVERY_MS = 60_000;

/** Keep the steps of your own agreements that the bank has and your vault hasn't. Returns how many. At most once a minute unless `now`. */
export function catchUpFromMint(ledger: Ledger | null, now = false): Promise<number> {
	if (!running && !now && Date.now() - lastAt < EVERY_MS) return Promise.resolve(0);
	running ??= (async () => {
		lastAt = Date.now();
		const me = current();
		if (!me || !ledger) return 0;
		const mine = agreementsFrom(ledger).filter((a) => !a.listing && a.standing.terms && (a.standing.terms.a === me.did || a.standing.terms.b === me.did) && a.standing.phase === 'agreed');
		if (!mine.length) return 0;
		const { view } = await readMint();
		const h = await readHome().catch(() => null);
		const storage = h?.ok && h.services.storage ? h.services.storage.replace(/\/$/, '') : null;
		if (!view || !storage) return 0;
		const r = await fetch(`${storage}/mint/${view.mint}/${view.mode}`, { signal: AbortSignal.timeout(15_000) }).catch(() => null);
		const book = r?.ok ? ((await r.json().catch(() => ({}))) as { receipts?: unknown[] }) : {};
		const ids = new Set(mine.map((a) => a.id));
		const have = new Set(mine.flatMap((a) => a.steps.map((s) => s.contentHash)));
		let kept = 0;
		for (const x of book.receipts ?? []) {
			if (!isAgreementStep(x) || !ids.has(x.content.agreement) || have.has(x.contentHash)) continue;
			if (!(await checkReceipt(x as AgreementReceipt)).ok) continue;
			await keepStep(x as AgreementReceipt);
			have.add(x.contentHash);
			kept++;
		}
		if (kept) await refreshLedger();
		return kept;
	})().finally(() => (running = null));
	return running;
}
